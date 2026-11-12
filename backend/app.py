"""
FastAPI Backend for Karnataka APMC Live Commodity Terminal.

Serves:
  - /api/health
  - /api/markets
  - /api/market/summary?market=...
  - /api/market/prices?market=...
  - /api/market/history?market=...&commodity=...&days=7|15|30|90|365|0
  - /api/market/compare?commodity=...
  - /api/trends
  - /api/analysis/multi-year
  - /api/analysis/compare-periods
  - /api/sync/plan (GET)
  - /api/sync/status (GET)
  - /api/sync/kmvahini (POST)
  - /api/ingest (POST)
  - Static frontend (index.html, css/, js/)
"""

from __future__ import annotations

import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Annotated, Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .analysis import compare_periods, get_multi_year_matrix
from .bilingual import get_commodity_meta, get_market_meta
from .ingest import DB_PATH, db_connection, ingest_csv_directory
from .kmvahini_sync import compute_sync_plan, ingest_api_records, sync_from_kmvahini
from .reports import get_report_payload, list_reports

ROOT_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(
    title="Agri Vaahan • Karnataka APMC Commodity & Intervention API",
    version="1.2.0",
    description="DuckDB-backed Krishi Marata Vahini API powering Agri Vaahan with compulsory current-month + gap-aware kmvahini 1.2.0 sync & bilingual EN/KN metadata",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def prevent_stale_frontend_cache(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path == "/" or path.startswith("/css/") or path.startswith("/js/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
    return response


_SYNC_LOCK = threading.Lock()
_SYNC_JOB: Dict[str, Any] = {
    "state": "idle",
    "job_id": None,
    "started_at": None,
    "finished_at": None,
    "progress_pct": 0,
    "completed_batches": 0,
    "total_batches": 0,
    "inserted_so_far": 0,
    "deleted_so_far": 0,
    "max_date": None,
    "range": None,
    "message": "Idle",
    "plan": None,
    "result": None,
    "error": None,
}
_SYNC_THREAD: Optional[threading.Thread] = None


def _sync_status_snapshot(include_plan: bool = False) -> Dict[str, Any]:
    with _SYNC_LOCK:
        snap = dict(_SYNC_JOB)
    if include_plan and DB_PATH.exists():
        try:
            snap["latestPlan"] = compute_sync_plan(auto_gap=True)
        except Exception:
            snap["latestPlan"] = None
    return snap


class KmvahiniSyncRequest(BaseModel):
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    start_month: Optional[int] = None
    end_month: Optional[int] = None
    commodities: Optional[List[str]] = None
    markets: Optional[List[str]] = None
    use_cloud_cache: bool = True
    lookback_months: Optional[int] = None
    auto_gap: bool = True
    force_refresh: bool = True
    force_same_day: bool = False
    workers: int = 4
    background: bool = False


class ApiIngestRequest(BaseModel):
    records: List[Dict[str, Any]]


@contextmanager
def _require_db():
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail="marukatte.duckdb not initialized yet. Run: .venv\\Scripts\\python.exe -m backend.ingest",
        )
    with db_connection(read_only=True) as con:
        yield con


@app.get("/api/health")
def health() -> Dict[str, Any]:
    if not DB_PATH.exists():
        return {"status": "db_missing", "dbPath": str(DB_PATH)}
    with db_connection(read_only=True) as con:
        row = con.execute("""
            SELECT
                (SELECT COUNT(*) FROM raw_trades),
                (SELECT COUNT(*) FROM daily_market_commodity),
                (SELECT COUNT(*) FROM markets_meta),
                (SELECT CAST(MIN(trade_date) AS VARCHAR) FROM daily_market_commodity),
                (SELECT CAST(MAX(trade_date) AS VARCHAR) FROM daily_market_commodity)
        """).fetchone()

    plan = compute_sync_plan(auto_gap=True)
    sync_snap = _sync_status_snapshot(include_plan=False)
    return {
        "status": "ok",
        "engine": "duckdb",
        "rawRows": row[0],
        "dailyRows": row[1],
        "marketCount": row[2],
        "minDate": row[3],
        "maxDate": row[4],
        "expectedAvailableDate": plan["expectedAvailableDate"],
        "lastScrapedAt": plan["lastScrapedAt"],
        "lastScrapedDate": plan["lastScrapedDate"],
        "alreadyScrapedToday": plan["alreadyScrapedToday"],
        "needsCatchup": plan["needsCatchup"],
        "staleDays": plan["staleDays"],
        "syncPlan": plan,
        "syncJobState": sync_snap["state"],
    }


@app.get("/api/markets")
def list_markets() -> List[Dict[str, Any]]:
    with _require_db() as con:
        rows = con.execute("""
            SELECT
                market,
                COALESCE(district, '') AS district,
                CAST(latest_date AS VARCHAR) AS latest_date,
                commodity_count,
                total_latest_arrivals
            FROM markets_meta
            ORDER BY market
        """).fetchall()
        result = []
        for market, district, latest_date, com_count, arrivals in rows:
            meta = get_market_meta(market, district)
            result.append({
                "id": market,
                "name": meta["en"],
                "nameKn": meta["kn"],
                "shortName": market,
                "shortNameKn": meta["short_kn"],
                "district": meta["district_en"],
                "districtKn": meta["district_kn"],
                "latestDate": latest_date,
                "commodityCount": com_count,
                "totalArrivals": arrivals,
            })
        return result


@app.get("/api/market/summary")
def market_summary(market: str = Query(..., description="Market code e.g. BENGALURU")) -> Dict[str, Any]:
    mkt_code = market.strip().upper()
    with _require_db() as con:
        meta_row = con.execute(
            "SELECT market, COALESCE(district, ''), CAST(latest_date AS VARCHAR), commodity_count FROM markets_meta WHERE market = ?",
            [mkt_code],
        ).fetchone()
        if not meta_row:
            meta = get_market_meta(mkt_code, "")
            return {
                "apmcId": mkt_code,
                "apmcName": meta["en"],
                "apmcNameKn": meta["kn"],
                "district": "",
                "districtKn": "",
                "marketDate": None,
                "totalArrivals": 0,
                "arrivalsVsYesterday": None,
                "arrivalsRising": False,
                "commodityCount": 0,
                "hasData": False,
            }

        _, district, latest_date, com_count = meta_row
        agg = con.execute("""
            SELECT
                ROUND(SUM(arrivals), 2) AS cur_arr,
                ROUND(SUM(COALESCE(prev_arrivals, arrivals)), 2) AS prev_arr
            FROM market_commodity_latest
            WHERE market = ?
        """, [mkt_code]).fetchone()

        cur_arr = float(agg[0] or 0)
        prev_arr = float(agg[1] or 0)
        delta_pct = round(((cur_arr - prev_arr) / prev_arr) * 100.0, 1) if prev_arr > 0 else None
        meta = get_market_meta(mkt_code, district)

        return {
            "apmcId": mkt_code,
            "apmcName": meta["en"],
            "apmcNameKn": meta["kn"],
            "district": meta["district_en"],
            "districtKn": meta["district_kn"],
            "marketDate": latest_date,
            "totalArrivals": cur_arr,
            "arrivalsVsYesterday": delta_pct,
            "arrivalsRising": (delta_pct >= 0) if delta_pct is not None else True,
            "commodityCount": com_count,
            "activity": "Latest Recorded Sessions",
            "hasData": True,
        }


@app.get("/api/market/prices")
def market_prices(market: str = Query(..., description="Market code e.g. BENGALURU")) -> List[Dict[str, Any]]:
    mkt_code = market.strip().upper()
    with _require_db() as con:
        rows = con.execute("""
            SELECT
                commodity,
                CAST(latest_date AS VARCHAR),
                CAST(prev_date AS VARCHAR),
                arrivals,
                min_price,
                max_price,
                current_price,
                previous_price,
                change_value,
                change_percent,
                variety_count
            FROM market_commodity_latest
            WHERE market = ?
            ORDER BY latest_date DESC, arrivals DESC
        """, [mkt_code]).fetchall()

        items = []
        for (
            commodity, latest_dt, prev_dt, arrivals, min_p, max_p,
            cur_p, prev_p, chg_val, chg_pct, var_cnt
        ) in rows:
            cmeta = get_commodity_meta(commodity)
            items.append({
                "commodityId": commodity,
                "commodityName": cmeta["en"],
                "commodityKannada": cmeta["kn"],
                "searchAliases": cmeta.get("aliases", ""),
                "groupName": cmeta["group"],
                "groupNameKn": cmeta["group_kn"],
                "currentPrice": cur_p,
                "previousPrice": prev_p,
                "minPrice": min_p,
                "maxPrice": max_p,
                "changeValue": chg_val,
                "changePercent": chg_pct,
                "arrival": arrivals,
                "lastTradedDate": latest_dt,
                "prevTradedDate": prev_dt,
                "varietyCount": var_cnt,
            })
        return items


@app.get("/api/market/history")
def market_history(
    market: str = Query(...),
    commodity: str = Query(...),
    days: Annotated[int, Query(description="Lookback window in days relative to latest date (0 = All-Time)")] = 30,
    interval: Annotated[str, Query(description="Bar interval: daily | weekly | monthly")] = "daily",
    warmup: Annotated[int, Query(ge=0, le=120, description="Optional prior warmup bars returned in warmupBars for SMA/EMA")] = 0,
) -> Dict[str, Any]:
    mkt_code = market.strip().upper()
    com_code = commodity.strip().upper()
    norm_interval = (interval or "daily").strip().lower()
    if norm_interval not in ("daily", "weekly", "monthly"):
        norm_interval = "daily"
    effective_interval = "monthly" if (days == 0 and norm_interval == "daily") else norm_interval

    with _require_db() as con:
        max_row = con.execute(
            "SELECT MAX(trade_date) FROM daily_market_commodity WHERE market = ? AND commodity = ?",
            [mkt_code, com_code],
        ).fetchone()
        if not max_row or not max_row[0]:
            return {"series": [], "warmupBars": [], "varieties": [], "interval": effective_interval}

        anchor_date = max_row[0]

        if effective_interval == "monthly":
            bar_rows = con.execute("""
                SELECT
                    CAST(CAST(DATE_TRUNC('month', trade_date) AS DATE) AS VARCHAR) AS dt,
                    STRFTIME(DATE_TRUNC('month', trade_date), '%b %Y') AS lbl,
                    ROUND(ARG_MIN(modal_price, trade_date), 2) AS open_p,
                    ROUND(ARG_MAX(modal_price, trade_date), 2) AS close_p,
                    ROUND(MIN(CASE WHEN min_price > 0 THEN min_price ELSE modal_price END), 2) AS min_p,
                    ROUND(MAX(max_price), 2) AS max_p,
                    ROUND(SUM(arrivals), 2) AS arr
                FROM daily_market_commodity
                WHERE market = ? AND commodity = ?
                GROUP BY DATE_TRUNC('month', trade_date)
                ORDER BY DATE_TRUNC('month', trade_date) ASC
            """, [mkt_code, com_code]).fetchall()
        elif effective_interval == "weekly":
            bar_rows = con.execute("""
                SELECT
                    CAST(CAST(DATE_TRUNC('week', trade_date) AS DATE) AS VARCHAR) AS dt,
                    STRFTIME(DATE_TRUNC('week', trade_date), '%d %b %y') AS lbl,
                    ROUND(ARG_MIN(modal_price, trade_date), 2) AS open_p,
                    ROUND(ARG_MAX(modal_price, trade_date), 2) AS close_p,
                    ROUND(MIN(CASE WHEN min_price > 0 THEN min_price ELSE modal_price END), 2) AS min_p,
                    ROUND(MAX(max_price), 2) AS max_p,
                    ROUND(SUM(arrivals), 2) AS arr
                FROM daily_market_commodity
                WHERE market = ? AND commodity = ?
                GROUP BY DATE_TRUNC('week', trade_date)
                ORDER BY DATE_TRUNC('week', trade_date) ASC
            """, [mkt_code, com_code]).fetchall()
        else:
            date_fmt = "%d %b %y" if (days == 0 or days > 120) else "%d %b"
            bar_rows = con.execute("""
                SELECT
                    CAST(trade_date AS VARCHAR) AS dt,
                    STRFTIME(trade_date, ?) AS lbl,
                    ROUND(COALESCE(LAG(modal_price) OVER (ORDER BY trade_date ASC), modal_price), 2) AS open_p,
                    ROUND(modal_price, 2) AS close_p,
                    ROUND(CASE WHEN min_price > 0 THEN min_price ELSE modal_price END, 2) AS min_p,
                    ROUND(max_price, 2) AS max_p,
                    ROUND(arrivals, 2) AS arr
                FROM daily_market_commodity
                WHERE market = ? AND commodity = ?
                ORDER BY trade_date ASC
            """, [date_fmt, mkt_code, com_code]).fetchall()

        all_bars: List[Dict[str, Any]] = []
        for dt_s, lbl, raw_open, raw_close, raw_min, raw_max, arr in bar_rows:
            c_p = round(float(raw_close or 0.0), 2)
            o_p = round(float(raw_open if raw_open is not None else c_p), 2)
            low_base = float(raw_min) if (raw_min is not None and raw_min > 0) else min(o_p, c_p)
            high_base = float(raw_max) if (raw_max is not None and raw_max > 0) else max(o_p, c_p)
            l_p = round(min(low_base, o_p, c_p), 2)
            h_p = round(max(high_base, o_p, c_p), 2)
            all_bars.append({
                "date": dt_s,
                "dateLabel": lbl,
                "open": o_p,
                "high": h_p,
                "low": l_p,
                "close": c_p,
                "price": c_p,
                "minPrice": l_p,
                "maxPrice": h_p,
                "arrival": round(float(arr or 0.0), 2),
            })

        if days <= 0 or not all_bars:
            vis_idx = 0
        else:
            cutoff = anchor_date - timedelta(days=days)
            if effective_interval == "monthly":
                cutoff = cutoff.replace(day=1)
            cutoff_str = cutoff.isoformat()
            vis_idx = next((i for i, b in enumerate(all_bars) if b["date"] >= cutoff_str), len(all_bars))
            if len(all_bars) - vis_idx < 5:
                min_bars = max(7, min(days, 30)) if effective_interval == "daily" else min(len(all_bars), 8)
                vis_idx = max(0, len(all_bars) - min_bars)

        warm_start = max(0, vis_idx - warmup) if warmup > 0 else vis_idx
        warmup_bars = all_bars[warm_start:vis_idx]
        series = all_bars[vis_idx:]

        # Latest trading day variety breakdown
        var_rows = con.execute("""
            SELECT
                variety,
                grade,
                ROUND(SUM(arrivals), 2) AS arr,
                ROUND(MIN(min_price), 2) AS min_p,
                ROUND(MAX(max_price), 2) AS max_p,
                ROUND(
                    SUM(modal_price * CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END)
                    / SUM(CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END),
                    2
                ) AS modal_p
            FROM raw_trades
            WHERE market = ? AND commodity = ? AND trade_date = ?
            GROUP BY variety, grade
            ORDER BY arr DESC, modal_p DESC
        """, [mkt_code, com_code, anchor_date]).fetchall()

        varieties = [
            {
                "variety": v[0],
                "grade": v[1],
                "arrival": v[2],
                "minPrice": v[3],
                "maxPrice": v[4],
                "modalPrice": v[5],
            }
            for v in var_rows
        ]
        return {
            "series": series,
            "warmupBars": warmup_bars,
            "varieties": varieties,
            "anchorDate": str(anchor_date),
            "interval": effective_interval,
        }


@app.get("/api/market/compare")
def compare_commodity(commodity: str = Query(...)) -> List[Dict[str, Any]]:
    com_code = commodity.strip().upper()
    with _require_db() as con:
        rows = con.execute("""
            SELECT
                market,
                COALESCE(district, ''),
                CAST(latest_date AS VARCHAR),
                current_price,
                min_price,
                max_price,
                change_percent,
                arrivals
            FROM market_commodity_latest
            WHERE commodity = ?
            ORDER BY latest_date DESC, arrivals DESC
            LIMIT 25
        """, [com_code]).fetchall()
        out = []
        for mkt, dist, dt, cur_p, min_p, max_p, pct, arr in rows:
            meta = get_market_meta(mkt, dist)
            out.append({
                "apmcId": mkt,
                "apmcName": meta["en"],
                "apmcNameKn": meta["kn"],
                "lastTradedDate": dt,
                "currentPrice": cur_p,
                "minPrice": min_p,
                "maxPrice": max_p,
                "changePercent": pct,
                "arrival": arr,
            })
        return out


@app.get("/api/trends")
def statewide_trends() -> Dict[str, Any]:
    with _require_db() as con:
        # Consider active commodities within 45 days of the database's latest date
        query_base = """
            WITH horizon AS (
                SELECT MAX(latest_date) - INTERVAL '45 days' AS cutoff FROM market_commodity_latest
            )
            SELECT
                l.market,
                COALESCE(l.district, ''),
                l.commodity,
                CAST(l.latest_date AS VARCHAR),
                l.current_price,
                l.change_percent,
                l.arrivals
            FROM market_commodity_latest l, horizon h
            WHERE l.latest_date >= h.cutoff
              AND l.prev_date IS NOT NULL
              AND l.prev_date >= l.latest_date - INTERVAL '14 days'
              AND l.arrivals >= 10
              AND COALESCE(l.prev_arrivals, 0) >= 10
        """
        gainers = con.execute(query_base + " ORDER BY l.change_percent DESC LIMIT 8").fetchall()
        losers = con.execute(query_base + " ORDER BY l.change_percent ASC LIMIT 8").fetchall()

        def format_rows(rows):
            res = []
            for mkt, dist, com, dt, price, pct, arr in rows:
                m_meta = get_market_meta(mkt, dist)
                c_meta = get_commodity_meta(com)
                res.append({
                    "apmcId": mkt,
                    "apmcName": m_meta["en"],
                    "apmcNameKn": m_meta["kn"],
                    "commodityId": com,
                    "commodityName": c_meta["en"],
                    "commodityKannada": c_meta["kn"],
                    "lastTradedDate": dt,
                    "currentPrice": price,
                    "changePercent": pct,
                    "arrival": arr,
                })
            return res

        return {"gainers": format_rows(gainers), "losers": format_rows(losers)}


@app.get("/api/sync/plan")
def api_sync_plan(
    lookback_months: Annotated[Optional[int], Query(description="Minimum months including current month")] = None,
    auto_gap: Annotated[bool, Query(description="Expand back automatically based on last scrape date and DB max date")] = True,
) -> Dict[str, Any]:
    return compute_sync_plan(lookback_months=lookback_months, auto_gap=auto_gap)


@app.get("/api/sync/status")
def api_sync_status() -> Dict[str, Any]:
    return _sync_status_snapshot(include_plan=True)


def _run_background_sync_job(job_id: str, payload: KmvahiniSyncRequest, plan: Dict[str, Any]) -> None:
    def _on_progress(prog: Dict[str, Any]) -> None:
        with _SYNC_LOCK:
            if _SYNC_JOB.get("job_id") != job_id:
                return
            _SYNC_JOB["progress_pct"] = prog.get("progress_pct", _SYNC_JOB["progress_pct"])
            _SYNC_JOB["completed_batches"] = prog.get("completed_batches", _SYNC_JOB["completed_batches"])
            _SYNC_JOB["total_batches"] = prog.get("total_batches", _SYNC_JOB["total_batches"])
            if "inserted_so_far" in prog:
                _SYNC_JOB["inserted_so_far"] = prog["inserted_so_far"]
            if "deleted_so_far" in prog:
                _SYNC_JOB["deleted_so_far"] = prog["deleted_so_far"]
            if prog.get("max_date"):
                _SYNC_JOB["max_date"] = prog["max_date"]
            if prog.get("message"):
                _SYNC_JOB["message"] = prog["message"]

    try:
        res = sync_from_kmvahini(
            start_year=payload.start_year,
            end_year=payload.end_year,
            start_month=payload.start_month,
            end_month=payload.end_month,
            commodities=payload.commodities,
            markets=payload.markets,
            use_cloud_cache=payload.use_cloud_cache,
            lookback_months=payload.lookback_months,
            auto_gap=payload.auto_gap,
            force_refresh=payload.force_refresh,
            force_same_day=payload.force_same_day,
            workers=payload.workers,
            progress_cb=_on_progress,
        )
        with _SYNC_LOCK:
            if _SYNC_JOB.get("job_id") == job_id:
                _SYNC_JOB["state"] = "error" if res.get("status") == "error" else "completed"
                _SYNC_JOB["finished_at"] = datetime.now().isoformat(timespec="seconds")
                _SYNC_JOB["progress_pct"] = 100
                _SYNC_JOB["result"] = res
                _SYNC_JOB["max_date"] = res.get("max_date") or _SYNC_JOB.get("max_date")
                _SYNC_JOB["inserted_so_far"] = res.get("inserted", _SYNC_JOB.get("inserted_so_far", 0))
                _SYNC_JOB["deleted_so_far"] = res.get("deleted_rows", _SYNC_JOB.get("deleted_so_far", 0))
                if res.get("status") == "ok":
                    _SYNC_JOB["message"] = (
                        f"Live Scrape Complete (kmvahini {res.get('kmvahini_version', '1.2.0')}) • "
                        f"Window {res.get('range', plan['range'])} • "
                        f"Replaced {res.get('deleted_rows', 0):,} rows with {res.get('inserted', 0):,} fresh rows "
                        f"(DB max: {res.get('max_date') or '--'})"
                    )
                elif res.get("status") == "error":
                    errs = res.get("errors") or []
                    _SYNC_JOB["error"] = "; ".join(errs) if errs else "Unknown scrape error"
                    _SYNC_JOB["message"] = f"Live Scrape Failed: {_SYNC_JOB['error']}"
                else:
                    _SYNC_JOB["message"] = (
                        f"Live Scrape ({res.get('range', plan['range'])}) returned 0 new rows; existing DuckDB data preserved."
                    )
    except Exception as exc:
        with _SYNC_LOCK:
            if _SYNC_JOB.get("job_id") == job_id:
                _SYNC_JOB["state"] = "error"
                _SYNC_JOB["finished_at"] = datetime.now().isoformat(timespec="seconds")
                _SYNC_JOB["error"] = str(exc)
                _SYNC_JOB["message"] = f"Live Scrape Failed: {exc}"


@app.post("/api/sync/kmvahini")
def api_sync_kmvahini(payload: KmvahiniSyncRequest) -> Dict[str, Any]:
    global _SYNC_THREAD
    plan = compute_sync_plan(
        lookback_months=payload.lookback_months,
        auto_gap=payload.auto_gap,
    )

    is_explicit_slice = any(
        v is not None
        for v in (
            payload.start_year,
            payload.end_year,
            payload.start_month,
            payload.end_month,
            payload.commodities,
            payload.markets,
        )
    )
    if plan["alreadyScrapedToday"] and not payload.force_same_day and not is_explicit_slice:
        return {
            "status": "already_scraped_today",
            "state": "completed",
            "skipped": True,
            "inserted": 0,
            "deleted_rows": 0,
            "plan": plan,
            "range": plan["range"],
            "months": plan["months"],
            "last_scraped_date": plan["lastScrapedDate"],
            "last_scraped_at": plan["lastScrapedAt"],
            "max_date": plan["dbMaxDate"],
            "message": plan["notice"],
            "kmvahini_version": "1.2.0",
        }

    if payload.background:
        with _SYNC_LOCK:
            if _SYNC_JOB.get("state") == "running":
                snap = dict(_SYNC_JOB)
                snap["status"] = "already_running"
                return snap

            job_id = uuid.uuid4().hex[:10]
            _SYNC_JOB.update({
                "state": "running",
                "job_id": job_id,
                "started_at": datetime.now().isoformat(timespec="seconds"),
                "finished_at": None,
                "progress_pct": 0,
                "completed_batches": 0,
                "total_batches": 0,
                "inserted_so_far": 0,
                "deleted_so_far": 0,
                "max_date": plan.get("dbMaxDate"),
                "range": plan.get("range"),
                "message": (
                    f"Starting parallel kmvahini 1.2.0 scrape for {plan['range']} "
                    f"(expected through {plan['expectedAvailableDate']})..."
                ),
                "plan": plan,
                "result": None,
                "error": None,
            })

        t = threading.Thread(
            target=_run_background_sync_job,
            args=(job_id, payload, plan),
            daemon=True,
            name=f"kmvahini-sync-{job_id}",
        )
        _SYNC_THREAD = t
        t.start()
        snap = _sync_status_snapshot(include_plan=False)
        snap["status"] = "started"
        return snap

    try:
        return sync_from_kmvahini(
            start_year=payload.start_year,
            end_year=payload.end_year,
            start_month=payload.start_month,
            end_month=payload.end_month,
            commodities=payload.commodities,
            markets=payload.markets,
            use_cloud_cache=payload.use_cloud_cache,
            lookback_months=payload.lookback_months,
            auto_gap=payload.auto_gap,
            force_refresh=payload.force_refresh,
            force_same_day=payload.force_same_day,
            workers=payload.workers,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"kmvahini sync failed: {exc}") from exc


@app.post("/api/ingest")
def api_ingest(payload: ApiIngestRequest) -> Dict[str, Any]:
    try:
        return ingest_api_records(payload.records)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Ingest error: {exc}") from exc


@app.post("/api/rebuild-from-csv")
def api_rebuild_csv() -> Dict[str, Any]:
    return ingest_csv_directory()


@app.get("/api/analysis/multi-year")
def analysis_multi_year(
    market: str = Query("BENGALURU", description="Market code e.g. BENGALURU or ALL"),
    commodity: str = Query("ONION", description="Commodity code e.g. ONION"),
    years: Annotated[int, Query(ge=0, le=30, description="Lookback window in years (0 = all available years)")] = 5,
    granularity: Annotated[str, Query(description="Matrix granularity: annual | monthly")] = "annual",
    focus_month: Annotated[Optional[int], Query(ge=1, le=12, description="Optional calendar month (1..12) across years")] = None,
) -> Dict[str, Any]:
    with _require_db() as con:
        return get_multi_year_matrix(
            con,
            market=market,
            commodity=commodity,
            years=years,
            granularity=granularity,
            focus_month=focus_month,
        )


@app.get("/api/analysis/compare-periods")
def analysis_compare_periods(
    market: str = Query("BENGALURU", description="Market code e.g. BENGALURU or ALL"),
    commodity: str = Query("ONION", description="Commodity code e.g. ONION"),
    period_a: str = Query("2025", description="Baseline period: YYYY or YYYY-MM"),
    period_b: str = Query("2026", description="Target period: YYYY or YYYY-MM"),
) -> Dict[str, Any]:
    with _require_db() as con:
        try:
            return compare_periods(
                con,
                market=market,
                commodity=commodity,
                period_a=period_a,
                period_b=period_b,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/analysis/reports")
def analysis_list_reports() -> List[Dict[str, Any]]:
    return list_reports()


@app.get("/api/analysis/report/{report_id}")
def analysis_get_report(
    report_id: str,
    market: str = Query("BIDAR", description="Focus APMC market e.g. BIDAR, BAILHONGAL, HUBBALLI, KALABURAGI, or ALL"),
) -> Dict[str, Any]:
    with _require_db() as con:
        try:
            return get_report_payload(con, report_id=report_id, market=market)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


# Static frontend mounts
app.mount("/css", StaticFiles(directory=str(ROOT_DIR / "css")), name="css")
app.mount("/js", StaticFiles(directory=str(ROOT_DIR / "js")), name="js")


@app.get("/")
def serve_index():
    return FileResponse(str(ROOT_DIR / "index.html"))


@app.get("/REPLICATION_LOG.md")
def serve_log():
    return FileResponse(str(ROOT_DIR / "REPLICATION_LOG.md"))
