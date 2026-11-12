"""
Multi-Year Historical Matrix & Period Differential Analytics Engine (Phase 3).

Powers:
  - GET /api/analysis/multi-year: Last-N-Years annual & month-wise matrix across
    any Karnataka APMC yard (or statewide ALL yards) with YoY/MoM % deltas and
    supply-demand regime classification.
  - GET /api/analysis/compare-periods: Exact absolute & % delta comparison between
    any two years (e.g. 2024 vs 2026) or any two months (e.g. 2025-10 vs 2026-10),
    plus synchronized seasonal/daily comparison points for charting.
"""

from __future__ import annotations

import calendar
import re
from typing import Any, Dict, List, Optional, Tuple

import duckdb

from .bilingual import get_commodity_meta, get_market_meta

MONTH_ABBR = [
    "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]
MONTH_KN = [
    "", "ಜನವರಿ", "ಫೆಬ್ರವರಿ", "ಮಾರ್ಚ್", "ಏಪ್ರಿಲ್", "ಮೇ", "ಜೂನ್",
    "ಜುಲೈ", "ಆಗಸ್ಟ್", "ಸೆಪ್ಟೆಂಬರ್", "ಅಕ್ಟೋಬರ್", "ನವೆಂಬರ್", "ಡಿಸೆಂಬರ್",
]

YEAR_RE = re.compile(r"^(\d{4})$")
MONTH_RE = re.compile(r"^(\d{4})-(\d{2})$")


def _safe_pct(cur: Optional[float], prev: Optional[float]) -> Optional[float]:
    if cur is None or prev is None or prev <= 0:
        return None
    return round(((cur - prev) / prev) * 100.0, 2)


def _safe_abs(cur: Optional[float], prev: Optional[float]) -> Optional[float]:
    if cur is None or prev is None:
        return None
    return round(cur - prev, 2)


def classify_regime(price_pct: Optional[float], arrivals_pct: Optional[float]) -> str:
    """Classifies agricultural market regime from simultaneous price & arrival % shifts."""
    if price_pct is None or arrivals_pct is None:
        return "baseline"
    if arrivals_pct > 8.0 and price_pct < -3.0:
        return "supply_glut"
    if arrivals_pct < -8.0 and price_pct > 3.0:
        return "supply_shortage"
    if arrivals_pct > 8.0 and price_pct > 3.0:
        return "demand_rally"
    if arrivals_pct < -8.0 and price_pct < -3.0:
        return "demand_softening"
    return "balanced"


def _resolve_market_scope(
    con: duckdb.DuckDBPyConnection,
    market: str,
    commodity: str,
) -> Tuple[str, str, Dict[str, str], str, List[Any]]:
    mkt_code = (market or "ALL").strip().upper()
    com_code = (commodity or "ONION").strip().upper()

    if mkt_code in ("ALL", "STATEWIDE", "*"):
        mkt_meta = {
            "code": "ALL",
            "en": "All Karnataka APMCs (Statewide)",
            "kn": "ಎಲ್ಲಾ ಕರ್ನಾಟಕ ಎಪಿಎಂಸಿಗಳು (ರಾಜ್ಯವ್ಯಾಪಿ)",
            "short_kn": "ರಾಜ್ಯವ್ಯಾಪಿ",
            "district_en": "Karnataka State",
            "district_kn": "ಕರ್ನಾಟಕ ರಾಜ್ಯ",
        }
        return "ALL", com_code, mkt_meta, "commodity = ?", [com_code]

    row = con.execute(
        "SELECT COALESCE(district, '') FROM markets_meta WHERE market = ?",
        [mkt_code],
    ).fetchone()
    district = row[0] if row else ""
    mkt_meta = get_market_meta(mkt_code, district)
    return mkt_code, com_code, mkt_meta, "market = ? AND commodity = ?", [mkt_code, com_code]


def get_available_commodities(
    con: duckdb.DuckDBPyConnection,
    market: str = "ALL",
) -> List[Dict[str, str]]:
    mkt_code = (market or "ALL").strip().upper()
    if mkt_code in ("ALL", "STATEWIDE", "*"):
        rows = con.execute(
            "SELECT DISTINCT commodity FROM daily_market_commodity ORDER BY commodity"
        ).fetchall()
    else:
        rows = con.execute(
            "SELECT DISTINCT commodity FROM daily_market_commodity WHERE market = ? ORDER BY commodity",
            [mkt_code],
        ).fetchall()

    items: List[Dict[str, str]] = []
    for (com,) in rows:
        meta = get_commodity_meta(com)
        items.append({
            "id": com,
            "name": meta["en"],
            "nameKn": meta["kn"],
            "group": meta["group"],
            "groupKn": meta["group_kn"],
        })
    items.sort(key=lambda x: x["name"].lower())
    return items


def parse_period_token(token: str) -> Dict[str, Any]:
    raw = (token or "").strip()
    ym = MONTH_RE.match(raw)
    if ym:
        yr = int(ym.group(1))
        mo = int(ym.group(2))
        if not (1 <= mo <= 12):
            raise ValueError(f"Invalid month in period '{token}'")
        return {
            "kind": "month",
            "key": f"{yr}-{mo:02d}",
            "year": yr,
            "month": mo,
            "label": f"{MONTH_ABBR[mo]} {yr}",
            "labelKn": f"{MONTH_KN[mo]} {yr}",
        }
    yy = YEAR_RE.match(raw)
    if yy:
        yr = int(yy.group(1))
        return {
            "kind": "year",
            "key": str(yr),
            "year": yr,
            "month": None,
            "label": str(yr),
            "labelKn": str(yr),
        }
    raise ValueError(f"Period '{token}' must be YYYY or YYYY-MM")


def get_multi_year_matrix(
    con: duckdb.DuckDBPyConnection,
    market: str = "BENGALURU",
    commodity: str = "ONION",
    years: int = 5,
    granularity: str = "annual",
    focus_month: Optional[int] = None,
) -> Dict[str, Any]:
    mkt_code, com_code, mkt_meta, where_sql, base_params = _resolve_market_scope(
        con, market, commodity
    )
    com_meta = get_commodity_meta(com_code)
    commodities = get_available_commodities(con, mkt_code)

    norm_gran = (granularity or "annual").strip().lower()
    if norm_gran not in ("annual", "monthly"):
        norm_gran = "annual"

    focus_m = int(focus_month) if focus_month and 1 <= int(focus_month) <= 12 else None

    avail_years = [
        int(r[0])
        for r in con.execute(
            f"""
            SELECT DISTINCT CAST(EXTRACT(YEAR FROM trade_date) AS INTEGER) AS yr
            FROM daily_market_commodity
            WHERE {where_sql}
            ORDER BY yr DESC
            """,
            base_params,
        ).fetchall()
    ]
    avail_months = [
        str(r[0])
        for r in con.execute(
            f"""
            SELECT DISTINCT STRFTIME(DATE_TRUNC('month', trade_date), '%Y-%m') AS ym
            FROM daily_market_commodity
            WHERE {where_sql}
            ORDER BY ym DESC
            """,
            base_params,
        ).fetchall()
    ]

    if not avail_years:
        return {
            "market": mkt_code,
            "marketName": mkt_meta["en"],
            "marketNameKn": mkt_meta["kn"],
            "commodity": com_code,
            "commodityName": com_meta["en"],
            "commodityNameKn": com_meta["kn"],
            "years": years,
            "granularity": norm_gran,
            "focusMonth": focus_m,
            "rows": [],
            "summary": None,
            "availableYears": [],
            "availableMonths": [],
            "commodities": commodities,
            "defaultCompareA": None,
            "defaultCompareB": None,
        }

    month_filter_sql = " AND EXTRACT(MONTH FROM trade_date) = ?" if focus_m is not None else ""
    query_params = list(base_params) + ([focus_m] if focus_m is not None else [])

    # Pre-compute peak month per year when in full-year annual view
    peak_by_year: Dict[int, Dict[str, Any]] = {}
    if norm_gran == "annual" and focus_m is None:
        ym_rows = con.execute(
            f"""
            SELECT
                CAST(EXTRACT(YEAR FROM trade_date) AS INTEGER) AS yr,
                CAST(EXTRACT(MONTH FROM trade_date) AS INTEGER) AS mo,
                ROUND(
                    SUM(modal_price * CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END)
                    / SUM(CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END),
                    2
                ) AS mo_modal,
                ROUND(SUM(arrivals), 2) AS mo_arr
            FROM daily_market_commodity
            WHERE {where_sql}
            GROUP BY yr, mo
            ORDER BY yr ASC, mo ASC
            """,
            base_params,
        ).fetchall()
        for yr, mo, mo_modal, mo_arr in ym_rows:
            cur_peak = peak_by_year.get(int(yr))
            if cur_peak is None or float(mo_modal or 0) > cur_peak["price"]:
                peak_by_year[int(yr)] = {
                    "month": int(mo),
                    "label": MONTH_ABBR[int(mo)],
                    "labelKn": MONTH_KN[int(mo)],
                    "price": float(mo_modal or 0),
                    "arrivals": float(mo_arr or 0),
                }

    rows_asc: List[Dict[str, Any]] = []
    if norm_gran == "annual":
        raw_rows = con.execute(
            f"""
            SELECT
                CAST(EXTRACT(YEAR FROM trade_date) AS INTEGER) AS yr,
                CAST(COUNT(DISTINCT trade_date) AS INTEGER) AS trading_days,
                CAST(COUNT(DISTINCT market) AS INTEGER) AS mkt_cnt,
                ROUND(SUM(arrivals), 2) AS total_arr,
                ROUND(MIN(CASE WHEN min_price > 0 THEN min_price ELSE modal_price END), 2) AS min_p,
                ROUND(MAX(max_price), 2) AS max_p,
                ROUND(
                    SUM(modal_price * CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END)
                    / SUM(CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END),
                    2
                ) AS avg_modal
            FROM daily_market_commodity
            WHERE {where_sql}{month_filter_sql}
            GROUP BY yr
            ORDER BY yr ASC
            """,
            query_params,
        ).fetchall()

        prev_row: Optional[Dict[str, Any]] = None
        for yr, tdays, mcnt, tot_arr, min_p, max_p, avg_m in raw_rows:
            yr_i = int(yr)
            avg_f = float(avg_m or 0.0)
            min_f = float(min_p or avg_f)
            max_f = float(max_p or avg_f)
            arr_f = float(tot_arr or 0.0)
            tdays_i = int(tdays or 0)
            vol_pct = round(((max_f - min_f) / avg_f) * 100.0, 1) if avg_f > 0 else 0.0
            avg_daily_arr = round(arr_f / tdays_i, 2) if tdays_i > 0 else 0.0

            yoy_price = _safe_pct(avg_f, prev_row["avgModalPrice"]) if prev_row else None
            yoy_arr = _safe_pct(arr_f, prev_row["totalArrivals"]) if prev_row else None
            regime = classify_regime(yoy_price, yoy_arr) if prev_row else "baseline"

            pk = peak_by_year.get(yr_i)
            key = f"{yr_i}-{focus_m:02d}" if focus_m is not None else str(yr_i)
            lbl = f"{MONTH_ABBR[focus_m]} {yr_i}" if focus_m is not None else str(yr_i)
            lbl_kn = f"{MONTH_KN[focus_m]} {yr_i}" if focus_m is not None else str(yr_i)

            entry = {
                "periodKey": key,
                "periodLabel": lbl,
                "periodLabelKn": lbl_kn,
                "year": yr_i,
                "month": focus_m,
                "tradingDays": tdays_i,
                "marketsReporting": int(mcnt or 0),
                "totalArrivals": arr_f,
                "avgDailyArrivals": avg_daily_arr,
                "minPrice": min_f,
                "avgModalPrice": avg_f,
                "maxPrice": max_f,
                "volatilityPct": vol_pct,
                "peakMonth": pk["label"] if pk else (MONTH_ABBR[focus_m] if focus_m else "--"),
                "peakMonthKn": pk["labelKn"] if pk else (MONTH_KN[focus_m] if focus_m else "--"),
                "peakMonthPrice": pk["price"] if pk else avg_f,
                "deltaPricePct": yoy_price,
                "deltaArrivalsPct": yoy_arr,
                "prevPeriodKey": prev_row["periodKey"] if prev_row else None,
                "regime": regime,
            }
            rows_asc.append(entry)
            prev_row = entry
    else:
        raw_rows = con.execute(
            f"""
            SELECT
                CAST(EXTRACT(YEAR FROM trade_date) AS INTEGER) AS yr,
                CAST(EXTRACT(MONTH FROM trade_date) AS INTEGER) AS mo,
                CAST(COUNT(DISTINCT trade_date) AS INTEGER) AS trading_days,
                CAST(COUNT(DISTINCT market) AS INTEGER) AS mkt_cnt,
                ROUND(SUM(arrivals), 2) AS total_arr,
                ROUND(MIN(CASE WHEN min_price > 0 THEN min_price ELSE modal_price END), 2) AS min_p,
                ROUND(MAX(max_price), 2) AS max_p,
                ROUND(
                    SUM(modal_price * CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END)
                    / SUM(CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END),
                    2
                ) AS avg_modal
            FROM daily_market_commodity
            WHERE {where_sql}{month_filter_sql}
            GROUP BY yr, mo
            ORDER BY yr ASC, mo ASC
            """,
            query_params,
        ).fetchall()

        prev_row = None
        for yr, mo, tdays, mcnt, tot_arr, min_p, max_p, avg_m in raw_rows:
            yr_i, mo_i = int(yr), int(mo)
            avg_f = float(avg_m or 0.0)
            min_f = float(min_p or avg_f)
            max_f = float(max_p or avg_f)
            arr_f = float(tot_arr or 0.0)
            tdays_i = int(tdays or 0)
            vol_pct = round(((max_f - min_f) / avg_f) * 100.0, 1) if avg_f > 0 else 0.0
            avg_daily_arr = round(arr_f / tdays_i, 2) if tdays_i > 0 else 0.0

            d_price = _safe_pct(avg_f, prev_row["avgModalPrice"]) if prev_row else None
            d_arr = _safe_pct(arr_f, prev_row["totalArrivals"]) if prev_row else None
            regime = classify_regime(d_price, d_arr) if prev_row else "baseline"

            key = f"{yr_i}-{mo_i:02d}"
            entry = {
                "periodKey": key,
                "periodLabel": f"{MONTH_ABBR[mo_i]} {yr_i}",
                "periodLabelKn": f"{MONTH_KN[mo_i]} {yr_i}",
                "year": yr_i,
                "month": mo_i,
                "tradingDays": tdays_i,
                "marketsReporting": int(mcnt or 0),
                "totalArrivals": arr_f,
                "avgDailyArrivals": avg_daily_arr,
                "minPrice": min_f,
                "avgModalPrice": avg_f,
                "maxPrice": max_f,
                "volatilityPct": vol_pct,
                "peakMonth": MONTH_ABBR[mo_i],
                "peakMonthKn": MONTH_KN[mo_i],
                "peakMonthPrice": max_f,
                "deltaPricePct": d_price,
                "deltaArrivalsPct": d_arr,
                "prevPeriodKey": prev_row["periodKey"] if prev_row else None,
                "regime": regime,
            }
            rows_asc.append(entry)
            prev_row = entry

    # Apply Last-N-Years window AFTER computing accurate YoY/MoM deltas against prior history
    max_yr = avail_years[0]
    if years and years > 0:
        min_yr = max_yr - years + 1
        visible_asc = [r for r in rows_asc if r["year"] >= min_yr]
    else:
        visible_asc = rows_asc

    visible_desc = list(reversed(visible_asc))

    summary = None
    if visible_asc:
        first_r = visible_asc[0]
        last_r = visible_asc[-1]
        span_price_pct = _safe_pct(last_r["avgModalPrice"], first_r["avgModalPrice"])
        span_arr_pct = _safe_pct(last_r["totalArrivals"], first_r["totalArrivals"])
        best_price = max(visible_asc, key=lambda r: r["avgModalPrice"])
        lowest_price = min(visible_asc, key=lambda r: r["avgModalPrice"])
        peak_arr = max(visible_asc, key=lambda r: r["totalArrivals"])
        avg_arr_period = round(
            sum(r["totalArrivals"] for r in visible_asc) / len(visible_asc), 2
        )
        avg_modal_period = round(
            sum(r["avgModalPrice"] for r in visible_asc) / len(visible_asc), 2
        )
        summary = {
            "periodsCount": len(visible_asc),
            "firstPeriod": first_r["periodLabel"],
            "lastPeriod": last_r["periodLabel"],
            "spanPriceChangePct": span_price_pct,
            "spanArrivalsChangePct": span_arr_pct,
            "avgModalAcrossWindow": avg_modal_period,
            "avgArrivalsPerPeriod": avg_arr_period,
            "highestPricePeriod": best_price["periodLabel"],
            "highestPriceValue": best_price["avgModalPrice"],
            "lowestPricePeriod": lowest_price["periodLabel"],
            "lowestPriceValue": lowest_price["avgModalPrice"],
            "peakArrivalsPeriod": peak_arr["periodLabel"],
            "peakArrivalsValue": peak_arr["totalArrivals"],
        }

    default_b = visible_desc[0]["periodKey"] if visible_desc else None
    default_a = visible_desc[1]["periodKey"] if len(visible_desc) > 1 else default_b

    return {
        "market": mkt_code,
        "marketName": mkt_meta["en"],
        "marketNameKn": mkt_meta["kn"],
        "commodity": com_code,
        "commodityName": com_meta["en"],
        "commodityNameKn": com_meta["kn"],
        "years": years,
        "granularity": norm_gran,
        "focusMonth": focus_m,
        "deltaType": "mom" if (norm_gran == "monthly" and focus_m is None) else "yoy",
        "rows": visible_desc,
        "summary": summary,
        "availableYears": avail_years,
        "availableMonths": avail_months,
        "commodities": commodities,
        "defaultCompareA": default_a,
        "defaultCompareB": default_b,
    }


def _fetch_period_stats(
    con: duckdb.DuckDBPyConnection,
    where_sql: str,
    base_params: List[Any],
    parsed: Dict[str, Any],
) -> Dict[str, Any]:
    if parsed["kind"] == "month":
        cond = f"{where_sql} AND EXTRACT(YEAR FROM trade_date) = ? AND EXTRACT(MONTH FROM trade_date) = ?"
        params = list(base_params) + [parsed["year"], parsed["month"]]
    else:
        cond = f"{where_sql} AND EXTRACT(YEAR FROM trade_date) = ?"
        params = list(base_params) + [parsed["year"]]

    row = con.execute(
        f"""
        SELECT
            CAST(COUNT(DISTINCT trade_date) AS INTEGER) AS trading_days,
            CAST(COUNT(DISTINCT market) AS INTEGER) AS mkt_cnt,
            ROUND(COALESCE(SUM(arrivals), 0), 2) AS total_arr,
            ROUND(MIN(CASE WHEN min_price > 0 THEN min_price ELSE modal_price END), 2) AS min_p,
            ROUND(MAX(max_price), 2) AS max_p,
            ROUND(
                SUM(modal_price * CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END)
                / NULLIF(SUM(CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END), 0),
                2
            ) AS avg_modal,
            CAST(MIN(trade_date) AS VARCHAR) AS first_dt,
            CAST(MAX(trade_date) AS VARCHAR) AS last_dt
        FROM daily_market_commodity
        WHERE {cond}
        """,
        params,
    ).fetchone()

    tdays = int(row[0] or 0)
    if tdays == 0 or row[5] is None:
        return {
            "hasData": False,
            "key": parsed["key"],
            "label": parsed["label"],
            "labelKn": parsed["labelKn"],
            "kind": parsed["kind"],
            "tradingDays": 0,
            "marketsReporting": 0,
            "totalArrivals": 0.0,
            "avgDailyArrivals": 0.0,
            "minPrice": None,
            "avgModalPrice": None,
            "maxPrice": None,
            "volatilityPct": None,
            "firstDate": None,
            "lastDate": None,
        }

    tot_arr = float(row[2] or 0.0)
    avg_m = float(row[5])
    min_p = float(row[3] if row[3] is not None else avg_m)
    max_p = float(row[4] if row[4] is not None else avg_m)
    vol_pct = round(((max_p - min_p) / avg_m) * 100.0, 1) if avg_m > 0 else 0.0

    return {
        "hasData": True,
        "key": parsed["key"],
        "label": parsed["label"],
        "labelKn": parsed["labelKn"],
        "kind": parsed["kind"],
        "tradingDays": tdays,
        "marketsReporting": int(row[1] or 0),
        "totalArrivals": tot_arr,
        "avgDailyArrivals": round(tot_arr / tdays, 2),
        "minPrice": min_p,
        "avgModalPrice": avg_m,
        "maxPrice": max_p,
        "volatilityPct": vol_pct,
        "firstDate": row[6],
        "lastDate": row[7],
    }


def _fetch_sub_buckets(
    con: duckdb.DuckDBPyConnection,
    where_sql: str,
    base_params: List[Any],
    parsed: Dict[str, Any],
    by_day: bool,
) -> Dict[int, Dict[str, float]]:
    if parsed["kind"] == "month":
        cond = f"{where_sql} AND EXTRACT(YEAR FROM trade_date) = ? AND EXTRACT(MONTH FROM trade_date) = ?"
        params = list(base_params) + [parsed["year"], parsed["month"]]
    else:
        cond = f"{where_sql} AND EXTRACT(YEAR FROM trade_date) = ?"
        params = list(base_params) + [parsed["year"]]

    extract_fn = "DAY" if by_day else "MONTH"
    rows = con.execute(
        f"""
        SELECT
            CAST(EXTRACT({extract_fn} FROM trade_date) AS INTEGER) AS bucket,
            ROUND(
                SUM(modal_price * CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END)
                / NULLIF(SUM(CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END), 0),
                2
            ) AS modal_p,
            ROUND(SUM(arrivals), 2) AS arr
        FROM daily_market_commodity
        WHERE {cond}
        GROUP BY bucket
        ORDER BY bucket ASC
        """,
        params,
    ).fetchall()

    return {
        int(b): {
            "modal": float(mp) if mp is not None else 0.0,
            "arrivals": float(arr or 0.0),
        }
        for b, mp, arr in rows
    }


def compare_periods(
    con: duckdb.DuckDBPyConnection,
    market: str = "BENGALURU",
    commodity: str = "ONION",
    period_a: str = "2025",
    period_b: str = "2026",
) -> Dict[str, Any]:
    mkt_code, com_code, mkt_meta, where_sql, base_params = _resolve_market_scope(
        con, market, commodity
    )
    com_meta = get_commodity_meta(com_code)

    parsed_a = parse_period_token(period_a)
    parsed_b = parse_period_token(period_b)

    stats_a = _fetch_period_stats(con, where_sql, base_params, parsed_a)
    stats_b = _fetch_period_stats(con, where_sql, base_params, parsed_b)

    modal_pct = _safe_pct(stats_b["avgModalPrice"], stats_a["avgModalPrice"])
    arrivals_pct = _safe_pct(stats_b["totalArrivals"], stats_a["totalArrivals"])
    avg_daily_pct = _safe_pct(stats_b["avgDailyArrivals"], stats_a["avgDailyArrivals"])
    min_pct = _safe_pct(stats_b["minPrice"], stats_a["minPrice"])
    max_pct = _safe_pct(stats_b["maxPrice"], stats_a["maxPrice"])
    tdays_pct = _safe_pct(
        float(stats_b["tradingDays"]) if stats_b["hasData"] else None,
        float(stats_a["tradingDays"]) if stats_a["hasData"] else None,
    )
    vol_diff = _safe_abs(stats_b["volatilityPct"], stats_a["volatilityPct"])

    diff = {
        "modalPriceAbs": _safe_abs(stats_b["avgModalPrice"], stats_a["avgModalPrice"]),
        "modalPricePct": modal_pct,
        "arrivalsAbs": _safe_abs(stats_b["totalArrivals"], stats_a["totalArrivals"]),
        "arrivalsPct": arrivals_pct,
        "avgDailyArrivalsAbs": _safe_abs(stats_b["avgDailyArrivals"], stats_a["avgDailyArrivals"]),
        "avgDailyArrivalsPct": avg_daily_pct,
        "minPriceAbs": _safe_abs(stats_b["minPrice"], stats_a["minPrice"]),
        "minPricePct": min_pct,
        "maxPriceAbs": _safe_abs(stats_b["maxPrice"], stats_a["maxPrice"]),
        "maxPricePct": max_pct,
        "volatilityPts": vol_diff,
        "tradingDaysAbs": (
            stats_b["tradingDays"] - stats_a["tradingDays"]
            if stats_a["hasData"] and stats_b["hasData"]
            else None
        ),
        "tradingDaysPct": tdays_pct,
    }

    regime = classify_regime(modal_pct, arrivals_pct)

    # Breakdown chart points: Jan-Dec for Year-vs-Year, or Day 1..N when comparing months
    breakdown: List[Dict[str, Any]] = []
    if parsed_a["kind"] == "year" and parsed_b["kind"] == "year":
        breakdown_mode = "monthly"
        map_a = _fetch_sub_buckets(con, where_sql, base_params, parsed_a, by_day=False)
        map_b = _fetch_sub_buckets(con, where_sql, base_params, parsed_b, by_day=False)
        for m in range(1, 13):
            va = map_a.get(m)
            vb = map_b.get(m)
            breakdown.append({
                "bucket": m,
                "label": MONTH_ABBR[m],
                "labelKn": MONTH_KN[m],
                "aModal": va["modal"] if va else None,
                "bModal": vb["modal"] if vb else None,
                "aArrivals": va["arrivals"] if va else 0.0,
                "bArrivals": vb["arrivals"] if vb else 0.0,
                "modalPct": _safe_pct(vb["modal"] if vb else None, va["modal"] if va else None),
            })
    elif parsed_a["kind"] == "month" and parsed_b["kind"] == "month":
        breakdown_mode = "daily"
        map_a = _fetch_sub_buckets(con, where_sql, base_params, parsed_a, by_day=True)
        map_b = _fetch_sub_buckets(con, where_sql, base_params, parsed_b, by_day=True)
        days_a = calendar.monthrange(parsed_a["year"], parsed_a["month"])[1]
        days_b = calendar.monthrange(parsed_b["year"], parsed_b["month"])[1]
        max_days = max(days_a, days_b)
        for d in range(1, max_days + 1):
            va = map_a.get(d)
            vb = map_b.get(d)
            if va is None and vb is None:
                continue
            breakdown.append({
                "bucket": d,
                "label": f"D{d:02d}",
                "labelKn": f"ದಿನ {d}",
                "aModal": va["modal"] if va else None,
                "bModal": vb["modal"] if vb else None,
                "aArrivals": va["arrivals"] if va else 0.0,
                "bArrivals": vb["arrivals"] if vb else 0.0,
                "modalPct": _safe_pct(vb["modal"] if vb else None, va["modal"] if va else None),
            })
    else:
        breakdown_mode = "summary"

    return {
        "market": mkt_code,
        "marketName": mkt_meta["en"],
        "marketNameKn": mkt_meta["kn"],
        "commodity": com_code,
        "commodityName": com_meta["en"],
        "commodityNameKn": com_meta["kn"],
        "periodA": stats_a,
        "periodB": stats_b,
        "diff": diff,
        "regime": regime,
        "breakdownMode": breakdown_mode,
        "breakdown": breakdown,
    }

