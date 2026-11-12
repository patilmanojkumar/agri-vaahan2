"""
Adapter for kmvahini==1.2.0 smart gap-aware scraping and external JSON feed ingestion.
"""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Any, Callable, Tuple

import pandas as pd

from .ingest import (
    DB_PATH,
    db_connection,
    get_sync_metadata,
    record_sync_metadata,
    upsert_dataframe,
)

_CACHE_WRITE_LOCK = threading.Lock()


def _shift_year_month(year: int, month: int, delta_months: int) -> Tuple[int, int]:
    idx = (year * 12 + (month - 1)) + delta_months
    return idx // 12, (idx % 12) + 1


def _months_between(start_ym: Tuple[int, int], end_ym: Tuple[int, int]) -> List[Tuple[int, int]]:
    months: List[Tuple[int, int]] = []
    y, m = start_ym
    while (y, m) <= end_ym:
        months.append((y, m))
        y, m = _shift_year_month(y, m, 1)
    return months


def _chunk_list(items: List[str], chunk_size: int) -> List[List[str]]:
    if not items:
        return []
    size = max(1, int(chunk_size))
    return [items[i : i + size] for i in range(0, len(items), size)]


def compute_sync_plan(
    lookback_months: Optional[int] = None,
    auto_gap: bool = True,
    max_backfill_months: int = 12,
    reference_today: Optional[date] = None,
) -> Dict[str, Any]:
    """
    Computes the compulsory current-month + dynamic previous-N-months scrape window
    from current date, persisted `last_scraped_at`, and DuckDB `MAX(trade_date)`.

    Rules:
      1. Current calendar month (`today.year, today.month`) is ALWAYS compulsory end bound.
      2. `expected_available_date = today - 1 day` (published auction cut-off).
      3. Computes `gap_months` from `reference_last_date = min(last_scraped_date, db_max_date)`.
      4. If `reference_last_date` was in days 1..10 of its month (before late markets settled),
         adds +1 previous month; if `gap_months == 0` and we haven't scraped past the 15th
         (or `today.day <= 15`), ensures at least 1 previous month for delayed reporting.
      5. Honors minimum `lookback_months - 1` when explicitly specified and expands back
         automatically if `gap_months` is larger (capped at `max_backfill_months`).
    """
    today = reference_today or date.today()
    expected_available_date = today - timedelta(days=1)
    current_ym = (today.year, today.month)

    db_max_date: Optional[date] = None
    last_scraped_date: Optional[date] = None
    last_scraped_at: Optional[str] = None
    commodities: Optional[List[str]] = None

    if DB_PATH.exists():
        with db_connection(read_only=True) as con:
            row = con.execute("SELECT MAX(trade_date) FROM daily_market_commodity").fetchone()
            if row and row[0]:
                db_max_date = row[0] if isinstance(row[0], date) else pd.to_datetime(row[0]).date()

            com_rows = con.execute("SELECT DISTINCT commodity FROM daily_market_commodity ORDER BY commodity").fetchall()
            if com_rows:
                commodities = [r[0] for r in com_rows]

            sync_meta = get_sync_metadata(con)
            if sync_meta:
                last_scraped_at = sync_meta.get("last_scraped_at")
                raw_dt = sync_meta.get("last_scraped_date")
                if raw_dt:
                    try:
                        last_scraped_date = date.fromisoformat(str(raw_dt)[:10])
                    except ValueError:
                        last_scraped_date = None

    candidates = [d for d in (last_scraped_date, db_max_date) if d is not None]
    reference_last_date = min(candidates) if candidates else None

    explicit_prev = max(0, int(lookback_months) - 1) if lookback_months is not None else 0
    gap_months = 0

    if reference_last_date is not None:
        ref_ym = (reference_last_date.year, reference_last_date.month)
        gap_months = max(0, (today.year - ref_ym[0]) * 12 + (today.month - ref_ym[1]))
        # Only pull an extra safety month on an unscraped CSV seed whose dates stopped in the first 5 days
        if last_scraped_date is None and gap_months > 0 and reference_last_date.day <= 5:
            gap_months += 1
    else:
        gap_months = 1

    if lookback_months is None:
        prev_months_n = gap_months if auto_gap else 0
    elif auto_gap:
        prev_months_n = max(explicit_prev, gap_months)
    else:
        prev_months_n = explicit_prev

    prev_months_n = max(0, min(int(prev_months_n), max_backfill_months))
    start_ym = _shift_year_month(today.year, today.month, -prev_months_n)
    end_ym = current_ym
    months_tuples = _months_between(start_ym, end_ym)

    needs_catchup = db_max_date is None or db_max_date < expected_available_date
    stale_days = (expected_available_date - db_max_date).days if db_max_date is not None else None
    already_scraped_today = bool(last_scraped_date is not None and last_scraped_date >= today)
    if already_scraped_today:
        notice = (
            f"Last scrape was done today ({last_scraped_at or today.isoformat()}); "
            f"DB is current through {db_max_date.isoformat() if db_max_date else today.isoformat()}. "
            f"Try again tomorrow."
        )
    else:
        notice = (
            f"Ready to scrape {start_ym[0]}-{start_ym[1]:02d} -> {end_ym[0]}-{end_ym[1]:02d} "
            f"({len(months_tuples)} month(s))"
        )

    return {
        "today": today.isoformat(),
        "expectedAvailableDate": expected_available_date.isoformat(),
        "dbMaxDate": db_max_date.isoformat() if db_max_date else None,
        "lastScrapedAt": last_scraped_at,
        "lastScrapedDate": last_scraped_date.isoformat() if last_scraped_date else None,
        "referenceLastDate": reference_last_date.isoformat() if reference_last_date else None,
        "alreadyScrapedToday": already_scraped_today,
        "canScrapeNow": not already_scraped_today,
        "notice": notice,
        "startYear": start_ym[0],
        "startMonth": start_ym[1],
        "endYear": end_ym[0],
        "endMonth": end_ym[1],
        "previousMonthsCount": prev_months_n,
        "totalMonthsCount": len(months_tuples),
        "months": [f"{y}-{m:02d}" for (y, m) in months_tuples],
        "range": f"{start_ym[0]}-{start_ym[1]:02d} -> {end_ym[0]}-{end_ym[1]:02d}",
        "needsCatchup": needs_catchup,
        "staleDays": stale_days,
        "commoditiesCount": len(commodities or []),
        "commodities": commodities,
    }


def _default_sync_bounds_and_commodities(
    lookback_months: Optional[int] = None,
    auto_gap: bool = True,
) -> Tuple[int, int, Optional[List[str]]]:
    """
    Backward-compatible helper returning `(start_year, start_month, commodities)`
    derived from `compute_sync_plan()`.
    """
    plan = compute_sync_plan(lookback_months=lookback_months, auto_gap=auto_gap)
    return plan["startYear"], plan["startMonth"], plan["commodities"]


def sync_from_kmvahini(
    start_year: Optional[int] = None,
    end_year: Optional[int] = None,
    start_month: Optional[int] = None,
    end_month: Optional[int] = None,
    commodities: Optional[List[str]] = None,
    markets: Optional[List[str]] = None,
    use_cloud_cache: bool = True,
    lookback_months: Optional[int] = None,
    auto_gap: bool = True,
    force_refresh: bool = True,
    force_same_day: bool = False,
    workers: int = 4,
    progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    """
    Compulsorily scrapes the current calendar month plus dynamic previous N months
    (based on last scrape date & DuckDB MAX(trade_date)) via kmvahini 1.2.0.
    Uses concurrent Chrome worker threads across (month, commodity_chunk) batches
    when the full scraper module is loaded and atomically replaces only returned
    (year, month, commodity) slices in marukatte.duckdb.
    Respects a same-day guard unless `force_same_day=True` is explicitly requested.
    """
    today = date.today()
    plan = compute_sync_plan(
        lookback_months=lookback_months,
        auto_gap=auto_gap,
        reference_today=today,
    )

    is_explicit_slice = any(v is not None for v in (start_year, end_year, start_month, end_month, commodities, markets))
    if plan["alreadyScrapedToday"] and not force_same_day and not is_explicit_slice:
        return {
            "status": "already_scraped_today",
            "skipped": True,
            "inserted": 0,
            "deleted_rows": 0,
            "range": plan["range"],
            "months": plan["months"],
            "last_scraped_date": plan["lastScrapedDate"],
            "last_scraped_at": plan["lastScrapedAt"],
            "max_date": plan["dbMaxDate"],
            "message": plan["notice"],
            "kmvahini_version": "1.2.0",
        }

    import kmvahini  # Imported lazily so server startup stays fast

    s_year = int(start_year or plan["startYear"])
    e_year = int(end_year or plan["endYear"])
    s_month = int(start_month or plan["startMonth"])
    e_month = int(end_month or plan["endMonth"])
    # Cap future end_month safely while keeping current month compulsory
    if (e_year, e_month) > (today.year, today.month):
        e_year, e_month = today.year, today.month

    target_commodities = commodities if commodities is not None else plan["commodities"]
    effective_cloud_cache = False if force_refresh else use_cloud_cache
    version = getattr(kmvahini, "__version__", "1.2.0")
    range_str = f"{s_year}-{s_month:02d} -> {e_year}-{e_month:02d}"

    can_parallel_scrape = (
        markets is None
        and target_commodities
        and int(workers or 1) > 1
        and hasattr(kmvahini, "scraper")
        and hasattr(kmvahini.scraper, "scrape_month")
        and hasattr(kmvahini, "cache")
    )

    if not can_parallel_scrape:
        # Mock/unit-test path or single-worker market-filtered fallback
        df = kmvahini.get_data(
            start_year=s_year,
            end_year=e_year,
            start_month=s_month,
            end_month=e_month,
            commodities=target_commodities,
            markets=markets,
            force_refresh=force_refresh,
            update_only=True,
            use_cloud_cache=effective_cloud_cache,
            workers=1,
        )
        if df is None or df.empty:
            return {
                "status": "no_new_data",
                "inserted": 0,
                "deleted_rows": 0,
                "range": range_str,
                "months": plan["months"],
                "force_refresh": force_refresh,
                "auto_gap": auto_gap,
                "lookback_months": lookback_months,
                "cloud_cache_used": effective_cloud_cache,
                "kmvahini_version": version,
            }

        replace_mode = "month_commodity" if markets is None else "key"
        result = upsert_dataframe(df, source="kmvahini_1.2.0", replace_mode=replace_mode)
        if result.get("status") == "ok":
            record_sync_metadata({
                "last_scraped_date": today.isoformat(),
                "last_scraped_at": datetime.now().isoformat(timespec="seconds"),
                "range": range_str,
                "months": result.get("replaced_months", []),
                "inserted": result.get("inserted", 0),
                "deleted_rows": result.get("deleted_rows", 0),
                "max_date": result.get("max_date"),
                "kmvahini_version": version,
            })
        result.update({
            "range": range_str,
            "months": result.get("replaced_months", plan["months"]),
            "force_refresh": force_refresh,
            "auto_gap": auto_gap,
            "lookback_months": lookback_months,
            "cloud_cache_used": effective_cloud_cache,
            "kmvahini_version": version,
        })
        return result

    # Parallel batch execution: prioritize compulsory CURRENT MONTH first, then prior months
    months_ordered = list(reversed(_months_between((s_year, s_month), (e_year, e_month))))
    if force_refresh and hasattr(kmvahini.cache, "delete_month"):
        for (yr, mo) in months_ordered:
            try:
                kmvahini.cache.delete_month(yr, mo)
            except Exception:
                pass

    total_inserted = 0
    total_deleted = 0
    replaced_months_set = set()
    latest_stats: Dict[str, Any] = {}
    errors: List[str] = []

    scrape_months: List[Tuple[int, int]] = []
    for (yr, mo) in months_ordered:
        # When force_refresh=False, reuse existing local cache for settled prior months only;
        # the current calendar month is always scraped compulsorily.
        if (
            not force_refresh
            and (yr, mo) != (today.year, today.month)
            and hasattr(kmvahini.cache, "load_month")
        ):
            try:
                cached_df = kmvahini.cache.load_month(yr, mo)
                if cached_df is not None and not cached_df.empty:
                    if target_commodities and "Commodity" in cached_df.columns:
                        cached_df = cached_df[cached_df["Commodity"].isin(target_commodities)]
                    if not cached_df.empty:
                        up_res = upsert_dataframe(
                            cached_df,
                            source="kmvahini_1.2.0_cache",
                            replace_mode="month_commodity",
                        )
                        if up_res.get("status") == "ok":
                            total_inserted += int(up_res.get("inserted", 0))
                            total_deleted += int(up_res.get("deleted_rows", 0))
                            for rm in up_res.get("replaced_months", []):
                                replaced_months_set.add(rm)
                            latest_stats = {
                                "raw_rows": up_res.get("raw_rows"),
                                "daily_rows": up_res.get("daily_rows"),
                                "market_count": up_res.get("market_count"),
                                "min_date": up_res.get("min_date"),
                                "max_date": up_res.get("max_date"),
                            }
                        continue
            except Exception:
                pass
        scrape_months.append((yr, mo))

    # Split commodities into balanced batches so Chrome instances stay busy concurrently
    chunks = _chunk_list(list(target_commodities), 5)
    tasks: List[Tuple[int, int, List[str]]] = [
        (yr, mo, chunk)
        for (yr, mo) in scrape_months
        for chunk in chunks
    ]
    total_batches = len(tasks)
    max_workers = max(1, min(int(workers or 4), total_batches)) if total_batches else 1
    completed = 0

    if progress_cb:
        progress_cb({
            "phase": "scraping",
            "completed_batches": 0,
            "total_batches": total_batches,
            "progress_pct": 0,
            "range": range_str,
            "message": f"Starting parallel kmvahini 1.2.0 scrape for {range_str} ({len(months_ordered)} month(s), {len(target_commodities)} commodities)...",
        })

    def _run_batch(yr: int, mo: int, com_chunk: List[str]) -> Tuple[int, int, List[str], pd.DataFrame]:
        batch_df = kmvahini.scraper.scrape_month(yr, mo, com_chunk, ["AllMarkets"])
        return yr, mo, com_chunk, batch_df

    if total_batches > 0:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(_run_batch, yr, mo, chunk): (yr, mo, chunk)
                for (yr, mo, chunk) in tasks
            }
            for future in as_completed(futures):
                yr, mo, chunk = futures[future]
                completed += 1
                try:
                    _, _, _, batch_df = future.result()
                    if batch_df is not None and not batch_df.empty:
                        # Atomically replace only returned (month, commodity) slices in DuckDB first
                        up_res = upsert_dataframe(
                            batch_df,
                            source="kmvahini_1.2.0",
                            replace_mode="month_commodity",
                        )
                        if up_res.get("status") == "ok":
                            total_inserted += int(up_res.get("inserted", 0))
                            total_deleted += int(up_res.get("deleted_rows", 0))
                            for rm in up_res.get("replaced_months", []):
                                replaced_months_set.add(rm)
                            latest_stats = {
                                "raw_rows": up_res.get("raw_rows"),
                                "daily_rows": up_res.get("daily_rows"),
                                "market_count": up_res.get("market_count"),
                                "min_date": up_res.get("min_date"),
                                "max_date": up_res.get("max_date"),
                            }

                        # Update kmvahini local parquet cache safely (non-fatal if optional deps unavailable)
                        if hasattr(kmvahini, "data") and hasattr(kmvahini.data, "_merge_and_save"):
                            try:
                                with _CACHE_WRITE_LOCK:
                                    kmvahini.data._merge_and_save(yr, mo, batch_df)
                            except Exception:
                                pass
                except Exception as exc:
                    errors.append(f"{yr}-{mo:02d} {chunk}: {exc}")

                if progress_cb:
                    pct = int(round((completed / max(1, total_batches)) * 100))
                    progress_cb({
                        "phase": "scraping",
                        "completed_batches": completed,
                        "total_batches": total_batches,
                        "progress_pct": pct,
                        "range": range_str,
                        "inserted_so_far": total_inserted,
                        "deleted_so_far": total_deleted,
                        "max_date": latest_stats.get("max_date"),
                        "message": (
                            f"Scraped batch {completed}/{total_batches} ({yr}-{mo:02d}: {', '.join(chunk[:2])}{'...' if len(chunk) > 2 else ''}) "
                            f"• {total_inserted:,} rows merged (latest DB: {latest_stats.get('max_date') or plan['dbMaxDate']})"
                        ),
                    })

    if total_inserted > 0:
        # Update kmvahini metadata.json as well if present
        if hasattr(kmvahini, "cache") and hasattr(kmvahini.cache, "save_metadata"):
            try:
                with _CACHE_WRITE_LOCK:
                    kmvahini.cache.save_metadata({
                        "latest_year": e_year,
                        "latest_month": e_month,
                        "last_updated": today.isoformat(),
                    })
            except Exception:
                pass

        record_sync_metadata({
            "last_scraped_date": today.isoformat(),
            "last_scraped_at": datetime.now().isoformat(timespec="seconds"),
            "range": range_str,
            "months": sorted(replaced_months_set),
            "inserted": total_inserted,
            "deleted_rows": total_deleted,
            "max_date": latest_stats.get("max_date"),
            "kmvahini_version": version,
        })

        return {
            "status": "ok",
            "inserted": total_inserted,
            "deleted_rows": total_deleted,
            "replace_mode": "month_commodity",
            "replaced_months": sorted(replaced_months_set),
            "range": range_str,
            "months": [f"{y}-{m:02d}" for (y, m) in _months_between((s_year, s_month), (e_year, e_month))],
            "force_refresh": force_refresh,
            "auto_gap": auto_gap,
            "lookback_months": lookback_months,
            "cloud_cache_used": effective_cloud_cache,
            "kmvahini_version": version,
            "partial_errors": errors[:5],
            **latest_stats,
        }

    return {
        "status": "no_new_data" if not errors else "error",
        "inserted": 0,
        "deleted_rows": 0,
        "range": range_str,
        "months": [f"{y}-{m:02d}" for (y, m) in _months_between((s_year, s_month), (e_year, e_month))],
        "force_refresh": force_refresh,
        "auto_gap": auto_gap,
        "lookback_months": lookback_months,
        "cloud_cache_used": effective_cloud_cache,
        "kmvahini_version": version,
        "errors": errors[:5],
    }


def ingest_api_records(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Accepts external API JSON records in Krishi Marata Vahini format
    and merges them into DuckDB.
    """
    if not records:
        return {"status": "empty_payload", "inserted": 0}
    df = pd.DataFrame(records)
    return upsert_dataframe(df, source="external_api")
