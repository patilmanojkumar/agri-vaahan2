"""
End-to-End Verification Suite for Karnataka APMC Live Commodity Terminal (Phase 4).

Validates:
  1. 100% bilingual (EN <-> KN) coverage across all 171 markets, 17 commodities, 31 districts & UI keys
  2. HTML/JS DOM ID consistency & zero duplicate IDs
  3. Direct DuckDB + FastAPI query correctness and response latency benchmarks
  4. kmvahini 1.2.0 incremental sync defaults & isolated DataFrame/API upsert integrity
  5. Optional live HTTP route verification when given --url http://127.0.0.1:8000
"""

from __future__ import annotations

import argparse
import re
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi import HTTPException
from backend import app as api_app
from backend import analysis, bilingual, ingest, kmvahini_sync


def check_bilingual_coverage() -> None:
    con = ingest.get_connection(read_only=True)
    try:
        markets = [r[0] for r in con.execute("SELECT DISTINCT market FROM markets_meta ORDER BY market").fetchall()]
        commodities = [r[0] for r in con.execute("SELECT DISTINCT commodity FROM daily_market_commodity ORDER BY commodity").fetchall()]
        districts = [
            r[0]
            for r in con.execute(
                "SELECT DISTINCT district FROM markets_meta WHERE district IS NOT NULL AND district <> '' ORDER BY district"
            ).fetchall()
        ]
    finally:
        con.close()

    missing_mkts = [m for m in markets if m not in bilingual.MARKETS_KN]
    missing_coms = [c for c in commodities if c not in bilingual.COMMODITIES]
    missing_dists = [d for d in districts if d.replace("•", "").strip().title() not in bilingual.DISTRICTS_KN]

    assert not missing_mkts, f"Untranslated markets: {missing_mkts}"
    assert not missing_coms, f"Untranslated commodities: {missing_coms}"
    assert not missing_dists, f"Untranslated districts: {missing_dists}"
    print(f"[PASS] Bilingual coverage: {len(markets)} markets, {len(commodities)} commodities, {len(districts)} districts")


def check_html_js_dom_integrity() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "css" / "terminal.css").read_text(encoding="utf-8")
    js_app = (ROOT / "js" / "app.js").read_text(encoding="utf-8")
    js_i18n = (ROOT / "js" / "i18n.js").read_text(encoding="utf-8")
    js_ta = (ROOT / "js" / "ta-engine.js").read_text(encoding="utf-8")
    js_mock = (ROOT / "js" / "mock-data.js").read_text(encoding="utf-8")

    ids = re.findall(r'id="([^"]+)"', html)
    dup_ids = sorted({i for i in ids if ids.count(i) > 1})
    assert not dup_ids, f"Duplicate HTML IDs: {dup_ids}"

    html_id_set = set(ids)
    js_ids = sorted(set(re.findall(r"getElementById\('([^']+)'\)", js_app)))
    missing_ids = [i for i in js_ids if i not in html_id_set]
    assert not missing_ids, f"Missing DOM IDs referenced by js/app.js: {missing_ids}"

    i18n_keys = set(re.findall(r'data-i18n(?:-placeholder)?="([^"]+)"', html))
    en_block = js_i18n.split("kn: {")[0] if "kn: {" in js_i18n else js_i18n
    kn_block = js_i18n.split("kn: {")[1] if "kn: {" in js_i18n else ""
    missing_en = [k for k in sorted(i18n_keys) if f"{k}:" not in en_block]
    missing_kn = [k for k in sorted(i18n_keys) if f"{k}:" not in kn_block]
    assert not missing_en, f"Missing EN i18n keys: {missing_en}"
    assert not missing_kn, f"Missing KN i18n keys: {missing_kn}"

    # Agri Vaahan Phase 1 + Phase 2 checks: rebrand, distinct layout, homepage Live Prices ticker, IISc <> KSAMB footer, A-Z default sort, Candlestick + TA
    assert "Agri Vaahan" in html and "chatbot-widget" not in html, "Expected Agri Vaahan rebrand & removal of Ask KSAMD widget"
    for hook in (
        "btnThemeToggle",
        "workbenchGrid",
        "filterSidebar",
        "livePricesTicker",
        "tickerYardBadge",
        "navTabTerminal",
        "navTabMovers",
        "navTabAdvisory",
        "navTabAnalysis",
        "viewPanelTerminal",
        "viewPanelMovers",
        "viewPanelAdvisory",
        "viewPanelAnalysis",
        "btnStyleCandle",
        "btnStyleGlow",
        "btnStyleBand",
        "taToolbarStrip",
        "taSignalsStrip",
        "rsiPaneWrap",
        "marketRsiChart",
        "analysisMarketSelect",
        "analysisCommoditySelect",
        "analysisYearsSelect",
        "analysisGranularitySelect",
        "analysisFocusMonthSelect",
        "comparePeriodASelect",
        "comparePeriodBSelect",
        "btnSwapComparePeriods",
        "btnRunPeriodCompare",
        "btnExportAnalysisCsv",
        "analysisCompareChart",
        "analysisMatrixBody",
        "btnAnalysisSubReport",
        "btnAnalysisSubMatrix",
        "analysisReportSubView",
        "analysisMatrixSubView",
        "analysisReportSelect",
        "repMarketPills",
        "repTable1Body",
        "reportSeasonalPriceChart",
        "reportSeasonalArrivalsChart",
        "reportForecastChart",
        "repRiskMatrixBody",
    ):
        assert hook in html_id_set, f"Missing Agri Vaahan layout/Phase2 ID: {hook}"
    assert 'id="viewPanelTerminal"' in html and html.index('id="livePricesTicker"') < html.index('id="viewPanelMovers"'), (
        "Live Prices ticker must sit inside homepage Chart Desk panel"
    )
    assert html.index('id="livePricesTicker"') < html.index('id="workbenchGrid"'), (
        "Live Prices ticker should sit at the top of Chart Desk above #workbenchGrid"
    )
    assert "getMultiYearAnalysis" in js_mock and "compareAnalysisPeriods" in js_mock, (
        "Missing Phase 3 Multi-Year / Period Compare fallback in js/mock-data.js"
    )
    assert "listAnalysisReports" in js_mock and "getAnalysisReport" in js_mock, (
        "Missing Technical Report offline fallback in js/mock-data.js"
    )
    for rkey in (
        "regime_supply_glut:",
        "regime_supply_shortage:",
        "regime_demand_rally:",
        "regime_demand_softening:",
        "regime_balanced:",
        "regime_baseline:",
    ):
        assert rkey in en_block and rkey in kn_block, f"Missing EN/KN translation for {rkey}"
    assert "Live Prices" in html and "Yard Tape" not in html, "Ticker label should be 'Live Prices', not 'Yard Tape'"
    assert "IISc" in html and "KSAMB" in html and "footerCollab" in html, "Missing IISc <-> KSAMB collaboration line in footer"
    assert '<option value="name" selected' in html, "Default #sortSelect ranking should be Alphabetical (A - Z)"
    assert 'id="trendsModal"' not in html and "trendsModal" not in js_app and "btnTrends" not in js_app, (
        "Movers should live in #viewPanelMovers tab, not #trendsModal"
    )
    assert "AgriTAEngine" in js_ta and "candlestickPlugin" in js_ta and "AgriTAEngine" in js_app, (
        "Missing js/ta-engine.js candlestick & TA wiring"
    )
    assert "getOhlcHistory" in js_mock, "Missing getOhlcHistory in js/mock-data.js"
    assert "text-white" not in html and "text-white" not in js_app, "Avoid hardcoded text-white which breaks Daylight mode"
    for tv_hex in ("#f0f3fa", "#2962ff", "#089981", "#f23645"):
        assert tv_hex in css.lower(), f"Missing TradingView palette color {tv_hex} in css/terminal.css"

    # Regression check: header Sync/Scrape separation & linked Query Bar
    assert "loadMarket(!isLiveBackend)" not in js_app, "Regression: Sync still calls loadMarket(!isLiveBackend)"
    assert "resetCommodityFilters();" in js_app, "Regression: filter reset helper should exist"
    assert "127.0.0.1:8000" in js_app, "Regression: DataAdapter should auto-discover FastAPI on 127.0.0.1:8000"
    assert "btnScrapeLatest" in html and "handleKmvahiniSyncClick" in js_app, "Missing dedicated Scrape Latest button wiring"
    assert "queryMatchBar" in html and "syncHero: true" in js_app and "preferTopRanked: true" in js_app, "Query Bar controls must link to Hero/Ticker"

    # Regression check: Bidar SOYABEEN / SOYABEAN / SOYBEAN bilingual & search alias support
    for variant in ("SOYABEEN", "SOYABEAN", "SOYBEAN"):
        meta = bilingual.get_commodity_meta(variant)
        assert meta["en"] == "Soybean" and "soyabean" in meta["aliases"], f"Alias check failed for {variant}: {meta}"

    print(
        f"[PASS] DOM & i18n integrity: {len(html_id_set)} unique IDs, "
        f"{len(js_ids)} JS hooks (0 missing), {len(i18n_keys)} data-i18n keys (0 missing)"
    )


def check_endpoints_and_latency() -> None:
    timings = {}

    def timed(name: str, fn):
        t0 = time.perf_counter()
        res = fn()
        timings[name] = round((time.perf_counter() - t0) * 1000.0, 2)
        return res

    h = timed("GET /api/health", api_app.health)
    assert h["status"] == "ok" and h["marketCount"] >= 171 and h["rawRows"] > 1_400_000
    assert h.get("expectedAvailableDate") and h.get("syncPlan") and "syncJobState" in h

    mkts = timed("GET /api/markets", api_app.list_markets)
    assert len(mkts) >= 171

    s_plan = timed("GET /api/sync/plan", api_app.api_sync_plan)
    assert s_plan["endYear"] and s_plan["endMonth"] and len(s_plan["months"]) >= 1

    s_stat = timed("GET /api/sync/status", api_app.api_sync_status)
    assert s_stat["state"] in ("idle", "running", "completed", "error")

    s_blr = timed("GET /api/market/summary?market=BENGALURU", lambda: api_app.market_summary("BENGALURU"))
    assert s_blr["hasData"] is True and s_blr["totalArrivals"] > 0

    p_blr = timed("GET /api/market/prices?market=BENGALURU", lambda: api_app.market_prices("BENGALURU"))
    assert len(p_blr) > 0

    p_bdr = timed("GET /api/market/prices?market=BIDAR", lambda: api_app.market_prices("BIDAR"))
    bdr_soy = next((x for x in p_bdr if x["commodityId"] == "SOYABEEN"), None)
    assert bdr_soy is not None and "soyabean" in bdr_soy.get("searchAliases", ""), "BIDAR missing SOYABEEN or searchAliases"

    for days in (7, 15, 30, 90, 365, 0):
        hist = timed(
            f"GET /api/market/history?market=BENGALURU&commodity=ONION&days={days}",
            lambda d=days: api_app.market_history("BENGALURU", "ONION", days=d),
        )
        assert len(hist["series"]) > 0, f"Empty series for days={days}"
        if days == 0:
            assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", hist["series"][0]["date"])
            assert len(hist["varieties"]) >= 1

    # OHLC interval + warmup bar invariants (Phase 2 backend foundation)
    for ivl, d_arg, w_arg in (("daily", 30, 50), ("weekly", 90, 20), ("monthly", 0, 0)):
        ohlc_res = timed(
            f"GET /api/market/history?interval={ivl}&days={d_arg}&warmup={w_arg}",
            lambda i=ivl, da=d_arg, wa=w_arg: api_app.market_history("BENGALURU", "ONION", days=da, interval=i, warmup=wa),
        )
        assert ohlc_res["series"], f"Empty OHLC series for interval={ivl}"
        if w_arg > 0:
            assert len(ohlc_res["warmupBars"]) > 0, f"Expected warmup bars for {ivl}"
        for bar in ohlc_res["series"]:
            assert bar["low"] <= min(bar["open"], bar["close"]) <= max(bar["open"], bar["close"]) <= bar["high"], (
                f"Invalid OHLC bounds in {ivl}: {bar}"
            )

    cmp_onion = timed("GET /api/market/compare?commodity=ONION", lambda: api_app.compare_commodity("ONION"))
    assert len(cmp_onion) >= 5

    trends = timed("GET /api/trends", api_app.statewide_trends)
    assert len(trends["gainers"]) > 0 and len(trends["losers"]) > 0

    # Phase 3: Multi-Year Matrix & Any-2 Years / Months Differential Lab
    m5 = timed(
        "GET /api/analysis/multi-year?market=BENGALURU&commodity=ONION&years=5",
        lambda: api_app.analysis_multi_year("BENGALURU", "ONION", years=5, granularity="annual"),
    )
    assert m5["market"] == "BENGALURU" and m5["commodity"] == "ONION" and 1 <= len(m5["rows"]) <= 6
    assert m5["summary"] and m5["defaultCompareB"], f"Unexpected multi-year summary: {m5}"

    m_oct = timed(
        "GET /api/analysis/multi-year?market=ALL&commodity=ONION&years=10&focus_month=10",
        lambda: api_app.analysis_multi_year("ALL", "ONION", years=10, granularity="annual", focus_month=10),
    )
    assert m_oct["market"] == "ALL" and len(m_oct["rows"]) >= 5
    assert all(r["month"] == 10 for r in m_oct["rows"]), "focus_month=10 should filter strictly to October"

    m_bdr = timed(
        "GET /api/analysis/multi-year?market=BIDAR&commodity=SOYABEEN&years=0&granularity=monthly",
        lambda: api_app.analysis_multi_year("BIDAR", "SOYABEEN", years=0, granularity="monthly"),
    )
    assert m_bdr["deltaType"] == "mom" and len(m_bdr["rows"]) > 12

    cmp_yr = timed(
        "GET /api/analysis/compare-periods?market=BENGALURU&commodity=ONION&period_a=2024&period_b=2025",
        lambda: api_app.analysis_compare_periods("BENGALURU", "ONION", period_a="2024", period_b="2025"),
    )
    assert cmp_yr["breakdownMode"] == "monthly" and len(cmp_yr["breakdown"]) == 12
    assert cmp_yr["diff"]["modalPricePct"] is not None

    cmp_mo = timed(
        "GET /api/analysis/compare-periods?market=BENGALURU&commodity=ONION&period_a=2025-10&period_b=2026-10",
        lambda: api_app.analysis_compare_periods("BENGALURU", "ONION", period_a="2025-10", period_b="2026-10"),
    )
    assert cmp_mo["breakdownMode"] == "daily" and len(cmp_mo["breakdown"]) >= 10

    try:
        api_app.analysis_compare_periods("BENGALURU", "ONION", period_a="bad", period_b="2025")
        raise AssertionError("Expected HTTPException(400) for malformed period token")
    except HTTPException as exc:
        assert exc.status_code == 400

    assert analysis.classify_regime(-12.0, 25.0) == "supply_glut"
    assert analysis.classify_regime(15.0, -20.0) == "supply_shortage"

    # Technical Report 1 (Soyabean IISc CSA Nov 2026) grounded against live marukatte.duckdb
    rep_list = timed("GET /api/analysis/reports", api_app.analysis_list_reports)
    assert len(rep_list) >= 1 and rep_list[0]["id"] == "tr1_soyabean_2026"

    tr1_bidar = timed(
        "GET /api/analysis/report/tr1_soyabean_2026?market=BIDAR",
        lambda: api_app.analysis_get_report("tr1_soyabean_2026", market="BIDAR"),
    )
    t1_by_mkt = {r["market"]: r for r in tr1_bidar["table1"]}
    assert abs(t1_by_mkt["BIDAR"]["priceChangePct"] - 75.5) < 0.2
    assert abs(t1_by_mkt["BIDAR"]["arrivalsChangePct"] - 43.5) < 0.2
    assert abs(t1_by_mkt["BAILHONGAL"]["priceChangePct"] - 57.0) < 0.2
    assert abs(t1_by_mkt["BAILHONGAL"]["arrivalsChangePct"] - (-53.2)) < 0.2
    assert abs(t1_by_mkt["HUBBALLI"]["priceChangePct"] - 72.4) < 0.2
    assert abs(t1_by_mkt["KALABURAGI"]["arrivalsChangePct"] - (-90.8)) < 0.2
    assert abs(t1_by_mkt["ALL"]["priceChangePct"] - 63.8) < 0.2

    sd_bdr = tr1_bidar["seasonalDynamics"]
    assert len(sd_bdr["labels"]) == 122 and "2026" in sd_bdr["seriesByYear"]

    po = tr1_bidar["priceOutlook"]
    assert po["cutoffDate"] == "2026-10-14" and po["evaluation"]["realizedDays"] > 0
    for q10_v, med_v, q90_v in zip(po["q10"], po["median"], po["q90"]):
        if q10_v is not None and med_v is not None and q90_v is not None:
            assert q10_v <= med_v <= q90_v, f"Quantile ordering violated: {q10_v}, {med_v}, {q90_v}"

    try:
        api_app.analysis_get_report("does_not_exist", market="BIDAR")
        raise AssertionError("Expected HTTPException(404) for unknown report id")
    except HTTPException as exc:
        assert exc.status_code == 404

    print("[PASS] Direct DuckDB/FastAPI queries & latencies:")
    for ep, ms in timings.items():
        print(f"       {ep:62s} -> {ms:6.2f} ms")


def check_kmvahini_sync_and_upsert() -> None:
    # 1) Verify rolling lookback bounds & year-month rollover arithmetic
    assert kmvahini_sync._shift_year_month(2026, 1, -1) == (2025, 12)
    assert kmvahini_sync._shift_year_month(2026, 11, -1) == (2026, 10)
    req_defaults = api_app.KmvahiniSyncRequest()
    assert (
        req_defaults.lookback_months is None
        and req_defaults.auto_gap is True
        and req_defaults.force_refresh is True
        and req_defaults.workers == 4
    )

    s_year, s_month, coms = kmvahini_sync._default_sync_bounds_and_commodities(lookback_months=2)
    from datetime import date as _date
    today = _date.today()
    exp_year, exp_month = kmvahini_sync._shift_year_month(today.year, today.month, -1)
    assert (s_year, s_month) <= (exp_year, exp_month), f"Expected <= {exp_year}-{exp_month:02d}, got {s_year}-{s_month:02d}"
    assert coms and "ONION" in coms and len(coms) >= 17
    live_auto = kmvahini_sync.compute_sync_plan(auto_gap=True)
    assert live_auto["months"] == [f"{today.year}-{today.month:02d}"], f"After post-month scrape, Auto should only target current month: {live_auto}"
    # Guard logic should evaluate True on the day scraped, and False on subsequent days
    expected_already_scraped = bool(live_auto["lastScrapedDate"] and live_auto["lastScrapedDate"] >= today.isoformat())
    assert live_auto["alreadyScrapedToday"] == expected_already_scraped
    if live_auto["lastScrapedDate"]:
        scraped_day_plan = kmvahini_sync.compute_sync_plan(
            auto_gap=True, reference_today=_date.fromisoformat(live_auto["lastScrapedDate"])
        )
        assert scraped_day_plan["alreadyScrapedToday"] is True
    print(f"[PASS] kmvahini 1.2.0 default sync bounds (live auto={live_auto['range']}, guarded today), commodities={len(coms)}")

    # 2) Verify incremental DataFrame, month_commodity full-month replacement, compute_sync_plan(), and parallel batch sync in isolated temp DB
    orig_db_path = ingest.DB_PATH
    with tempfile.TemporaryDirectory() as tmpdir:
        temp_db = Path(tmpdir) / "verify_upsert.duckdb"
        ingest.DB_PATH = temp_db
        kmvahini_sync.DB_PATH = temp_db
        try:
            # Verify compulsory current month + dynamic gap scenarios on isolated DB
            seed_oct15 = pd.DataFrame(
                {
                    "Market": ["BENGALURU"],
                    "Commodity": ["ONION"],
                    "Variety": ["PUNA"],
                    "Grade": ["FAQ"],
                    "Arrivals": [100.0],
                    "Unit": ["Quintal"],
                    "Min": [2000],
                    "Max": [2600],
                    "Modal": [2300],
                    "District": ["Bengaluru Urban"],
                },
                index=pd.DatetimeIndex(["2026-10-15"], name="Date"),
            )
            ingest.upsert_dataframe(seed_oct15, source="csv_seed")

            p1 = kmvahini_sync.compute_sync_plan(reference_today=_date(2026, 11, 11))
            assert p1["expectedAvailableDate"] == "2026-11-10"
            assert p1["months"] == ["2026-10", "2026-11"], f"Scenario 1 failed: {p1}"
            assert p1["needsCatchup"] is True and p1["staleDays"] == 26 and p1["alreadyScrapedToday"] is False

            ingest.record_sync_metadata({"last_scraped_date": "2026-08-20"})
            p2 = kmvahini_sync.compute_sync_plan(reference_today=_date(2026, 11, 11))
            assert p2["months"] == ["2026-08", "2026-09", "2026-10", "2026-11"], f"Scenario 2 failed: {p2}"

            # October was already scraped yesterday (2026-11-10, after October ended) -> Nov only!
            ingest.upsert_dataframe(seed_oct15.set_axis(pd.DatetimeIndex(["2026-11-10"], name="Date")), source="kmvahini_test")
            ingest.record_sync_metadata({"last_scraped_date": "2026-11-10"})
            p3 = kmvahini_sync.compute_sync_plan(reference_today=_date(2026, 11, 11))
            assert p3["months"] == ["2026-11"] and p3["alreadyScrapedToday"] is False, f"Scenario 3 failed: {p3}"

            # Already scraped today (2026-11-11) -> same-day guard active + Nov only!
            ingest.upsert_dataframe(seed_oct15.set_axis(pd.DatetimeIndex(["2026-11-11"], name="Date")), source="kmvahini_test")
            ingest.record_sync_metadata({"last_scraped_date": "2026-11-11"})
            p4 = kmvahini_sync.compute_sync_plan(reference_today=_date(2026, 11, 11))
            assert p4["months"] == ["2026-11"] and p4["alreadyScrapedToday"] is True and p4["canScrapeNow"] is False, f"Scenario 4 failed: {p4}"

            # Tomorrow (2026-11-12) -> ready again, Nov only!
            p5 = kmvahini_sync.compute_sync_plan(reference_today=_date(2026, 11, 12))
            assert p5["months"] == ["2026-11"] and p5["alreadyScrapedToday"] is False and p5["canScrapeNow"] is True, f"Scenario 5 failed: {p5}"

            # Reset temp_db cleanly for upsert & sync tests
            temp_db.unlink()

            df = pd.DataFrame(
                {
                    "Market": ["BENGALURU", "HUBBALLI"],
                    "Commodity": ["ONION", "TUR"],
                    "Variety": ["PUNA", None],
                    "Grade": ["FAQ", None],
                    "Arrivals": [150.5, 25.0],
                    "Unit": ["Quintal", "Quintal"],
                    "Min": [2200, 7200],
                    "Max": [3100, 8100],
                    "Modal": [2750, 7700],
                    "District": ["Bengaluru Urban•", float("nan")],
                },
                index=pd.DatetimeIndex(["2026-11-10", "2026-11-10"], name="Date"),
            )
            res1 = ingest.upsert_dataframe(df, source="kmvahini_test")
            assert res1["inserted"] == 2 and res1["raw_rows"] == 2

            res2 = kmvahini_sync.ingest_api_records([
                {
                    "Date": "2026-11-10",
                    "Market": "BENGALURU",
                    "District": "Bengaluru Urban",
                    "Commodity": "ONION",
                    "Variety": "PUNA",
                    "Grade": "FAQ",
                    "Arrivals": 200.0,
                    "Unit": "Quintal",
                    "Min": 0,
                    "Max": 3200,
                    "Modal": 2800,
                },
                {
                    "Date": "2026-11-11",
                    "Market": "BENGALURU",
                    "District": "Bengaluru Urban",
                    "Commodity": "ONION",
                    "Variety": "PUNA",
                    "Grade": "FAQ",
                    "Arrivals": 300.0,
                    "Unit": "Quintal",
                    "Min": 2400,
                    "Max": 3300,
                    "Modal": 2940,
                },
            ])
            assert res2["raw_rows"] == 3, f"Expected deduplicated replace to yield 3 rows, got {res2['raw_rows']}"

            # Seed an older 2026-10 ONION row with Grade='OLD' plus a 2026-10 TUR row that won't be scraped
            seed_oct = pd.DataFrame(
                {
                    "Market": ["BENGALURU", "BENGALURU"],
                    "Commodity": ["ONION", "TUR"],
                    "Variety": ["PUNA", "OTHER"],
                    "Grade": ["OLD", "FAQ"],
                    "Arrivals": [90.0, 40.0],
                    "Unit": ["Quintal", "Quintal"],
                    "Min": [2000, 7000],
                    "Max": [2400, 7600],
                    "Modal": [2200, 7300],
                    "District": ["Bengaluru Urban", "Bengaluru Urban"],
                },
                index=pd.DatetimeIndex(["2026-10-05", "2026-10-05"], name="Date"),
            )
            res_seed = ingest.upsert_dataframe(seed_oct, source="csv_seed")
            assert res_seed["raw_rows"] == 5

            # Safety guard: empty scrape must NEVER delete prior month data
            res_empty = ingest.upsert_dataframe(pd.DataFrame(), source="kmvahini_1.2.0", replace_mode="month_commodity")
            assert res_empty["status"] == "empty_dataframe" and res_empty["deleted_rows"] == 0

            # Replace 2026-10 ONION atomically while preserving 2026-10 TUR and 2026-11 ONION/TUR
            res_month = ingest.upsert_dataframe(
                pd.DataFrame(
                    {
                        "Market": ["BENGALURU", "BENGALURU"],
                        "Commodity": ["ONION", "ONION"],
                        "Variety": ["PUNA", "LOCAL"],
                        "Grade": ["FAQ", "FAQ"],
                        "Arrivals": [110.0, 50.0],
                        "Unit": ["Quintal", "Quintal"],
                        "Min": [2100, 1800],
                        "Max": [2600, 2200],
                        "Modal": [2350, 2000],
                        "District": ["Bengaluru Urban", "Bengaluru Urban"],
                    },
                    index=pd.DatetimeIndex(["2026-10-05", "2026-10-08"], name="Date"),
                ),
                source="kmvahini_1.2.0",
                replace_mode="month_commodity",
            )
            assert res_month["replace_mode"] == "month_commodity"
            assert res_month["deleted_rows"] == 1
            assert res_month["inserted"] == 2
            assert res_month["replaced_months"] == ["2026-10"]

            con = ingest.get_connection(read_only=True)
            row = con.execute("""
                SELECT current_price, previous_price, change_percent
                FROM market_commodity_latest
                WHERE market = 'BENGALURU' AND commodity = 'ONION'
            """).fetchone()
            hub_dist = con.execute("SELECT district FROM raw_trades WHERE market = 'HUBBALLI'").fetchone()[0]
            stale_old = con.execute("""
                SELECT COUNT(*) FROM raw_trades
                WHERE commodity = 'ONION' AND grade = 'OLD' AND EXTRACT(MONTH FROM trade_date) = 10
            """).fetchone()[0]
            oct_tur = con.execute("""
                SELECT COUNT(*) FROM raw_trades
                WHERE commodity = 'TUR' AND EXTRACT(MONTH FROM trade_date) = 10
            """).fetchone()[0]
            con.close()
            assert row == (2940.0, 2800.0, 5.0), f"Unexpected delta calc: {row}"
            assert hub_dist == "", f"NaN District leaked as {hub_dist!r}"
            assert stale_old == 0, "month_commodity replace failed to remove stale grade rows"
            assert oct_tur == 1, "month_commodity replace touched an unscraped commodity!"

            # Verify sync_from_kmvahini bypasses cloud cache & persists sync_metadata in fallback path
            import types
            captured_kwargs = {}
            fake_mod = types.ModuleType("kmvahini")
            fake_mod.__version__ = "1.2.0"

            def fake_get_data(**kwargs):
                captured_kwargs.update(kwargs)
                return pd.DataFrame(
                    {
                        "Market": ["BENGALURU"],
                        "Commodity": ["ONION"],
                        "Variety": ["PUNA"],
                        "Grade": ["FAQ"],
                        "Arrivals": [325.0],
                        "Unit": ["Quintal"],
                        "Min": [2500],
                        "Max": [3400],
                        "Modal": [3000],
                        "District": ["Bengaluru Urban"],
                    },
                    index=pd.DatetimeIndex(["2026-11-11"], name="Date"),
                )

            fake_mod.get_data = fake_get_data
            prev_mod = sys.modules.get("kmvahini")
            sys.modules["kmvahini"] = fake_mod
            try:
                sync_res = kmvahini_sync.sync_from_kmvahini(lookback_months=2, force_refresh=True, use_cloud_cache=True)
            finally:
                if prev_mod is not None:
                    sys.modules["kmvahini"] = prev_mod
                else:
                    sys.modules.pop("kmvahini", None)

            assert captured_kwargs.get("force_refresh") is True
            assert captured_kwargs.get("use_cloud_cache") is False, "force_refresh=True must disable cloud cache!"
            assert (captured_kwargs.get("start_year"), captured_kwargs.get("start_month")) <= (exp_year, exp_month)
            assert sync_res["status"] == "ok" and sync_res["deleted_rows"] == 2 and sync_res["inserted"] == 1, f"Unexpected sync_res: {sync_res}"
            meta_after = ingest.get_sync_metadata()
            assert meta_after.get("last_scraped_date") == today.isoformat()

            # Verify same-day guard skips re-scrape immediately when last_scraped_date == today
            guard_res = kmvahini_sync.sync_from_kmvahini(auto_gap=True)
            assert guard_res["status"] == "already_scraped_today" and guard_res["skipped"] is True, f"Same-day guard failed: {guard_res}"

            # Verify parallel scrape_month batch path + progress_cb cleanly
            fake_parallel = types.ModuleType("kmvahini")
            fake_parallel.__version__ = "1.2.0"
            fake_parallel.scraper = types.SimpleNamespace(
                scrape_month=lambda yr, mo, coms_arg, mkts_arg: pd.DataFrame(
                    {
                        "Market": ["BENGALURU"],
                        "Commodity": [coms_arg[0]],
                        "Variety": ["PUNA"],
                        "Grade": ["FAQ"],
                        "Arrivals": [350.0],
                        "Unit": ["Quintal"],
                        "Min": [2600],
                        "Max": [3500],
                        "Modal": [3100],
                        "District": ["Bengaluru Urban"],
                    },
                    index=pd.DatetimeIndex([f"{yr}-{mo:02d}-10"], name="Date"),
                )
            )
            deleted_calls = []
            saved_meta = []
            fake_parallel.cache = types.SimpleNamespace(
                delete_month=lambda yr, mo: deleted_calls.append((yr, mo)),
                save_metadata=lambda m: saved_meta.append(m),
            )
            fake_parallel.data = types.SimpleNamespace(_merge_and_save=lambda yr, mo, bdf: None)
            progress_events = []

            prev_mod = sys.modules.get("kmvahini")
            sys.modules["kmvahini"] = fake_parallel
            try:
                par_res = kmvahini_sync.sync_from_kmvahini(
                    start_year=2026,
                    start_month=10,
                    end_year=2026,
                    end_month=11,
                    commodities=["ONION"],
                    force_refresh=True,
                    workers=2,
                    progress_cb=progress_events.append,
                )
            finally:
                if prev_mod is not None:
                    sys.modules["kmvahini"] = prev_mod
                else:
                    sys.modules.pop("kmvahini", None)

            assert par_res["status"] == "ok" and par_res["inserted"] == 2
            assert deleted_calls == [(2026, 11), (2026, 10)], f"Current month should be prioritized first, got {deleted_calls}"
            assert len(progress_events) >= 2 and progress_events[-1]["progress_pct"] == 100
            assert len(saved_meta) == 1

            con = ingest.get_connection(read_only=True)
            nov_tur = con.execute("SELECT COUNT(*) FROM raw_trades WHERE commodity = 'TUR' AND EXTRACT(MONTH FROM trade_date) = 11").fetchone()[0]
            con.close()
            assert nov_tur == 1, "Unreturned 2026-11 TUR row should stay intact!"
            print("[PASS] Isolated compute_sync_plan(), month_commodity replace, & parallel kmvahini sync verified")
        finally:
            ingest.DB_PATH = orig_db_path
            kmvahini_sync.DB_PATH = orig_db_path


def check_live_http(base_url: str) -> None:
    base = base_url.rstrip("/")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    routes = [
        "/",
        "/REPLICATION_LOG.md",
        "/css/terminal.css",
        "/js/i18n.js",
        "/js/ta-engine.js",
        "/js/mock-data.js",
        "/js/app.js",
        "/docs",
        "/api/health",
        "/api/markets",
        "/api/market/summary?market=BENGALURU",
        "/api/market/prices?market=BENGALURU",
        "/api/market/history?market=BENGALURU&commodity=ONION&days=30",
        "/api/market/history?market=BENGALURU&commodity=ONION&days=0",
        "/api/market/compare?commodity=ONION",
        "/api/trends",
        "/api/analysis/multi-year?market=BENGALURU&commodity=ONION&years=5",
        "/api/analysis/compare-periods?market=BENGALURU&commodity=ONION&period_a=2024&period_b=2025",
        "/api/analysis/reports",
        "/api/analysis/report/tr1_soyabean_2026?market=BIDAR",
        "/api/sync/plan",
        "/api/sync/status",
    ]
    print(f"[HTTP] Probing {len(routes)} live routes at {base} ...")
    for path in routes:
        t0 = time.perf_counter()
        with opener.open(f"{base}{path}", timeout=5) as resp:
            body = resp.read()
            ms = (time.perf_counter() - t0) * 1000.0
            assert resp.status == 200 and len(body) > 0, f"{path} failed with status {resp.status}"
            print(f"       {resp.status} OK ({ms:6.2f} ms, {len(body):7d} bytes) -> {path}")
    print(f"[PASS] All {len(routes)} live HTTP routes responded 200 OK!")


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify e-Marukatte Terminal Phase 1-4.")
    parser.add_argument("--url", help="Live base URL (e.g. http://127.0.0.1:8000) to probe over HTTP")
    args = parser.parse_args()

    check_bilingual_coverage()
    check_html_js_dom_integrity()
    check_endpoints_and_latency()
    check_kmvahini_sync_and_upsert()
    if args.url:
        check_live_http(args.url)
    print("\nALL PHASE 4 VERIFICATION CHECKS PASSED!")


if __name__ == "__main__":
    main()

