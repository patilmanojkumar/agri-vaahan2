"""
DuckDB ETL & Incremental Upsert Engine for Krishi Marata Vahini Data.

Ingests:
  1. Bulk raw CSVs from ./data/*.csv (handles header order differences like MANGO.csv)
  2. Incremental Pandas DataFrames from kmvahini 1.2.0 or external JSON API payloads
"""

from __future__ import annotations

import json
import os
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, Any, Optional

import duckdb
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
DB_PATH = ROOT_DIR / "marukatte.duckdb"
DB_LOCK = threading.RLock()


def get_connection(read_only: bool = False) -> duckdb.DuckDBPyConnection:
    return duckdb.connect(str(DB_PATH), read_only=read_only)


@contextmanager
def db_connection(read_only: bool = False):
    """
    Serializes read-only and read-write DuckDB connections within the same Python
    process so DuckDB never raises different-configuration connection conflicts.
    """
    with DB_LOCK:
        con = get_connection(read_only=read_only)
        try:
            yield con
        finally:
            con.close()


def _init_schema(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
        CREATE TABLE IF NOT EXISTS raw_trades (
            trade_date DATE NOT NULL,
            market VARCHAR NOT NULL,
            district VARCHAR,
            commodity VARCHAR NOT NULL,
            variety VARCHAR NOT NULL,
            grade VARCHAR NOT NULL,
            arrivals DOUBLE NOT NULL,
            unit VARCHAR NOT NULL,
            min_price DOUBLE NOT NULL,
            max_price DOUBLE NOT NULL,
            modal_price DOUBLE NOT NULL,
            source VARCHAR NOT NULL
        );
    """)
    con.execute("""
        CREATE TABLE IF NOT EXISTS sync_metadata (
            key VARCHAR PRIMARY KEY,
            value VARCHAR NOT NULL,
            updated_at TIMESTAMP NOT NULL
        );
    """)


def get_sync_metadata(con: Optional[duckdb.DuckDBPyConnection] = None) -> Dict[str, Any]:
    """Reads persisted kmvahini sync metadata (if present) without failing on older DBs."""
    if not DB_PATH.exists():
        return {}

    def _read(conn: duckdb.DuckDBPyConnection) -> Dict[str, Any]:
        exists = conn.execute(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'sync_metadata'"
        ).fetchone()[0]
        if not exists:
            return {}
        row = conn.execute(
            "SELECT value, CAST(updated_at AS VARCHAR) FROM sync_metadata WHERE key = 'kmvahini_last_scrape'"
        ).fetchone()
        if not row:
            return {}
        try:
            data = json.loads(row[0])
            if isinstance(data, dict):
                data.setdefault("updated_at", row[1])
                return data
        except Exception:
            pass
        return {}

    if con is not None:
        return _read(con)

    with db_connection(read_only=True) as conn:
        return _read(conn)


def record_sync_metadata(metadata: Dict[str, Any]) -> None:
    """Persists latest scrape telemetry in DuckDB sync_metadata."""
    payload = json.dumps(metadata, ensure_ascii=False)
    with db_connection(read_only=False) as con:
        _init_schema(con)
        con.execute("DELETE FROM sync_metadata WHERE key = 'kmvahini_last_scrape';")
        con.execute(
            "INSERT INTO sync_metadata (key, value, updated_at) VALUES ('kmvahini_last_scrape', ?, CURRENT_TIMESTAMP);",
            [payload],
        )


def rebuild_materialized_tables(con: duckdb.DuckDBPyConnection) -> Dict[str, Any]:
    """Rebuilds fast analytical summary tables after ingestion or incremental sync."""
    con.execute("""
        CREATE OR REPLACE TABLE daily_market_commodity AS
        SELECT
            trade_date,
            market,
            MAX(NULLIF(district, '')) AS district,
            commodity,
            ROUND(SUM(arrivals), 2) AS arrivals,
            ROUND(MIN(min_price), 2) AS min_price,
            ROUND(MAX(max_price), 2) AS max_price,
            ROUND(
                SUM(modal_price * CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END)
                / SUM(CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END),
                2
            ) AS modal_price,
            CAST(COUNT(DISTINCT variety) AS INTEGER) AS variety_count
        FROM raw_trades
        GROUP BY trade_date, market, commodity
        ORDER BY market, commodity, trade_date;
    """)

    con.execute("""
        CREATE OR REPLACE TABLE market_commodity_latest AS
        WITH ranked AS (
            SELECT
                *,
                ROW_NUMBER() OVER (PARTITION BY market, commodity ORDER BY trade_date DESC) AS rn
            FROM daily_market_commodity
        ),
        latest AS (SELECT * FROM ranked WHERE rn = 1),
        prev AS (SELECT * FROM ranked WHERE rn = 2)
        SELECT
            l.market,
            l.district,
            l.commodity,
            l.trade_date AS latest_date,
            p.trade_date AS prev_date,
            l.arrivals,
            p.arrivals AS prev_arrivals,
            l.min_price,
            l.max_price,
            l.modal_price AS current_price,
            COALESCE(p.modal_price, l.modal_price) AS previous_price,
            ROUND(l.modal_price - COALESCE(p.modal_price, l.modal_price), 2) AS change_value,
            CASE
                WHEN p.modal_price IS NOT NULL AND p.modal_price > 0
                THEN ROUND(((l.modal_price - p.modal_price) / p.modal_price) * 100.0, 2)
                ELSE 0.0
            END AS change_percent,
            l.variety_count
        FROM latest l
        LEFT JOIN prev p
            ON l.market = p.market AND l.commodity = p.commodity;
    """)

    con.execute("""
        CREATE OR REPLACE TABLE markets_meta AS
        SELECT
            market,
            MAX(NULLIF(district, '')) AS district,
            MAX(latest_date) AS latest_date,
            CAST(COUNT(*) AS INTEGER) AS commodity_count,
            ROUND(SUM(arrivals), 2) AS total_latest_arrivals
        FROM market_commodity_latest
        GROUP BY market
        ORDER BY market;
    """)

    stats = con.execute("""
        SELECT
            (SELECT COUNT(*) FROM raw_trades) AS raw_rows,
            (SELECT COUNT(*) FROM daily_market_commodity) AS daily_rows,
            (SELECT COUNT(*) FROM markets_meta) AS market_count,
            (SELECT CAST(MIN(trade_date) AS VARCHAR) FROM daily_market_commodity) AS min_date,
            (SELECT CAST(MAX(trade_date) AS VARCHAR) FROM daily_market_commodity) AS max_date
    """).fetchone()

    return {
        "raw_rows": stats[0],
        "daily_rows": stats[1],
        "market_count": stats[2],
        "min_date": stats[3],
        "max_date": stats[4],
    }


def ingest_csv_directory(data_dir: Path = DATA_DIR) -> Dict[str, Any]:
    """
    Full rebuild from ./data/*.csv into marukatte.duckdb.
    Uses union_by_name=true so shifted column orders (e.g. MANGO.csv) align safely.
    """
    csv_glob = str(data_dir / "*.csv").replace("\\", "/")
    with db_connection(read_only=False) as con:
        con.execute("DROP TABLE IF EXISTS raw_trades;")
        _init_schema(con)

        # Clean, normalize, and sanitize prices during bulk load
        con.execute(f"""
            INSERT INTO raw_trades
            WITH raw_csv AS (
                SELECT
                    TRY_CAST(TRIM(CAST("Date" AS VARCHAR)) AS DATE) AS trade_date,
                    UPPER(TRIM(CAST("Market" AS VARCHAR))) AS market,
                    TRIM(REPLACE(COALESCE(CAST("District" AS VARCHAR), ''), '•', '')) AS district,
                    UPPER(TRIM(CAST("Commodity" AS VARCHAR))) AS commodity,
                    COALESCE(NULLIF(UPPER(TRIM(CAST("Variety" AS VARCHAR))), ''), 'OTHER') AS variety,
                    COALESCE(NULLIF(UPPER(TRIM(CAST("Grade" AS VARCHAR))), ''), 'FAQ') AS grade,
                    GREATEST(0.0, COALESCE(TRY_CAST("Arrivals" AS DOUBLE), 0.0)) AS arrivals,
                    COALESCE(NULLIF(TRIM(CAST("Unit" AS VARCHAR)), ''), 'Quintal') AS unit,
                    TRY_CAST("Min" AS DOUBLE) AS raw_min,
                    TRY_CAST("Max" AS DOUBLE) AS raw_max,
                    TRY_CAST("Modal" AS DOUBLE) AS raw_modal
                FROM read_csv(
                    '{csv_glob}',
                    union_by_name = true,
                    all_varchar = true,
                    header = true,
                    ignore_errors = true
                )
            ),
            valid AS (
                SELECT
                    trade_date,
                    market,
                    district,
                    commodity,
                    variety,
                    grade,
                    arrivals,
                    unit,
                    raw_modal AS modal_price,
                    CASE
                        WHEN raw_min IS NOT NULL AND raw_min >= 50 AND raw_max IS NOT NULL AND raw_max >= 50
                        THEN LEAST(raw_min, raw_max, raw_modal)
                        WHEN raw_min IS NOT NULL AND raw_min >= 50
                        THEN LEAST(raw_min, raw_modal)
                        ELSE raw_modal
                    END AS min_price,
                    CASE
                        WHEN raw_min IS NOT NULL AND raw_min >= 50 AND raw_max IS NOT NULL AND raw_max >= 50
                        THEN GREATEST(raw_min, raw_max, raw_modal)
                        WHEN raw_max IS NOT NULL AND raw_max >= 50
                        THEN GREATEST(raw_max, raw_modal)
                        ELSE raw_modal
                    END AS max_price
                FROM raw_csv
                WHERE trade_date IS NOT NULL
                  AND market IS NOT NULL AND market <> ''
                  AND commodity IS NOT NULL AND commodity <> ''
                  AND raw_modal IS NOT NULL AND raw_modal >= 50
            )
            SELECT
                trade_date,
                market,
                district,
                commodity,
                variety,
                grade,
                arrivals,
                unit,
                min_price,
                max_price,
                modal_price,
                'csv_seed' AS source
            FROM valid;
        """)

        summary = rebuild_materialized_tables(con)
        return summary


def upsert_dataframe(
    df: pd.DataFrame,
    source: str = "kmvahini",
    replace_mode: str = "key",
) -> Dict[str, Any]:
    """
    Incremental upsert from a Pandas DataFrame (from kmvahini.get_data() or JSON API).

    replace_mode:
      - "key": replaces matching (trade_date, market, commodity, variety, grade) keys.
      - "month_commodity": ONLY after df is validated non-empty, atomically deletes and
        replaces entire (year, month, commodity) slices present in clean_df so late-reported
        dates or revised grades across the scraped month(s) stay complete without duplicates.
    """
    if df is None or df.empty:
        return {"inserted": 0, "deleted_rows": 0, "replace_mode": replace_mode, "status": "empty_dataframe"}

    work = df.copy()
    if "Date" not in work.columns and work.index.name == "Date":
        work = work.reset_index()
    elif "Date" not in work.columns and isinstance(work.index, pd.DatetimeIndex):
        work = work.reset_index().rename(columns={"index": "Date"})

    required = ["Date", "Market", "Commodity", "Modal"]
    for col in required:
        if col not in work.columns:
            raise ValueError(f"Missing required column '{col}' in incoming DataFrame")

    norm = pd.DataFrame({
        "trade_date": pd.to_datetime(work["Date"], errors="coerce").dt.date,
        "market": work["Market"].astype(str).str.strip().str.upper(),
        "district": (
            work["District"].fillna("").astype(str).str.replace("•", "", regex=False).str.strip()
            if "District" in work.columns else ""
        ),
        "commodity": work["Commodity"].astype(str).str.strip().str.upper(),
        "variety": (
            work["Variety"].fillna("OTHER").astype(str).str.strip().str.upper()
            if "Variety" in work.columns else "OTHER"
        ),
        "grade": (
            work["Grade"].fillna("FAQ").astype(str).str.strip().str.upper()
            if "Grade" in work.columns else "FAQ"
        ),
        "arrivals": pd.to_numeric(work["Arrivals"] if "Arrivals" in work.columns else 0, errors="coerce").fillna(0.0).clip(lower=0.0),
        "unit": (
            work["Unit"].fillna("Quintal").astype(str).str.strip()
            if "Unit" in work.columns else "Quintal"
        ),
        "raw_min": pd.to_numeric(work["Min"] if "Min" in work.columns else work["Modal"], errors="coerce"),
        "raw_max": pd.to_numeric(work["Max"] if "Max" in work.columns else work["Modal"], errors="coerce"),
        "modal_price": pd.to_numeric(work["Modal"], errors="coerce"),
    })

    norm = norm.dropna(subset=["trade_date", "modal_price"])
    norm = norm[(norm["market"] != "") & (norm["commodity"] != "") & (norm["modal_price"] >= 50)]
    if norm.empty:
        return {"inserted": 0, "deleted_rows": 0, "replace_mode": replace_mode, "status": "no_valid_rows"}

    norm["min_price"] = norm[["raw_min", "raw_max", "modal_price"]].where(lambda s: s >= 50).min(axis=1).fillna(norm["modal_price"])
    norm["max_price"] = norm[["raw_min", "raw_max", "modal_price"]].where(lambda s: s >= 50).max(axis=1).fillna(norm["modal_price"])
    norm["source"] = source

    clean_df = norm[[
        "trade_date", "market", "district", "commodity", "variety", "grade",
        "arrivals", "unit", "min_price", "max_price", "modal_price", "source"
    ]].drop_duplicates(subset=["trade_date", "market", "commodity", "variety", "grade"], keep="last")

    replaced_months = sorted({f"{d.year}-{d.month:02d}" for d in clean_df["trade_date"]})

    with db_connection(read_only=False) as con:
        _init_schema(con)
        con.begin()
        try:
            con.register("incoming_df", clean_df)
            if replace_mode == "month_commodity":
                con.execute("""
                    CREATE OR REPLACE TEMP TABLE incoming_slices AS
                    SELECT DISTINCT
                        CAST(EXTRACT(YEAR FROM trade_date) AS INTEGER) AS yr,
                        CAST(EXTRACT(MONTH FROM trade_date) AS INTEGER) AS mo,
                        commodity
                    FROM incoming_df;
                """)
                deleted_rows = con.execute("""
                    SELECT COUNT(*)
                    FROM raw_trades
                    JOIN incoming_slices s
                      ON CAST(EXTRACT(YEAR FROM raw_trades.trade_date) AS INTEGER) = s.yr
                     AND CAST(EXTRACT(MONTH FROM raw_trades.trade_date) AS INTEGER) = s.mo
                     AND raw_trades.commodity = s.commodity;
                """).fetchone()[0]
                con.execute("""
                    DELETE FROM raw_trades
                    USING incoming_slices s
                    WHERE CAST(EXTRACT(YEAR FROM raw_trades.trade_date) AS INTEGER) = s.yr
                      AND CAST(EXTRACT(MONTH FROM raw_trades.trade_date) AS INTEGER) = s.mo
                      AND raw_trades.commodity = s.commodity;
                """)
            else:
                deleted_rows = con.execute("""
                    SELECT COUNT(*)
                    FROM raw_trades
                    JOIN incoming_df
                      ON raw_trades.trade_date = incoming_df.trade_date
                     AND raw_trades.market = incoming_df.market
                     AND raw_trades.commodity = incoming_df.commodity
                     AND raw_trades.variety = incoming_df.variety
                     AND raw_trades.grade = incoming_df.grade;
                """).fetchone()[0]
                con.execute("""
                    DELETE FROM raw_trades
                    USING incoming_df
                    WHERE raw_trades.trade_date = incoming_df.trade_date
                      AND raw_trades.market = incoming_df.market
                      AND raw_trades.commodity = incoming_df.commodity
                      AND raw_trades.variety = incoming_df.variety
                      AND raw_trades.grade = incoming_df.grade;
                """)

            con.execute("INSERT INTO raw_trades SELECT * FROM incoming_df;")
            con.unregister("incoming_df")
            stats = rebuild_materialized_tables(con)
            con.commit()
        except Exception:
            con.rollback()
            raise

        return {
            "inserted": len(clean_df),
            "deleted_rows": int(deleted_rows),
            "replace_mode": replace_mode,
            "replaced_months": replaced_months,
            "status": "ok",
            **stats,
        }


if __name__ == "__main__":
    print(f"Ingesting CSVs from {DATA_DIR} into {DB_PATH}...")
    result = ingest_csv_directory()
    print("Ingestion complete:", result)
