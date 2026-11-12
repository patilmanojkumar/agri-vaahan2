# Reverse Engineering & Replication Log: e-Krishi Marukatte Commodity Terminal

- **Target URL:** `https://ekrishimarukatte.karnataka.gov.in/Market/Index`
- **Organization:** Department of Agricultural Marketing / Karnataka State Agricultural Marketing Board (KSAMB)
- **Workspace:** `m:\KSAMB\e-marukatte`
- **Date:** 2026-11-11

---

## Objective

Reverse-engineer the layout, UI components, styling system, and data contracts of the **Karnataka APMC Live Commodity Terminal** (`/Market/Index`), diagnose why the live government portal appears broken or unresponsive, and build a self-contained, interactive front-end mockup that faithfully replicates the dashboard experience.

---

## Step 1: HTTP Inspection & Technology Stack Extraction

We fetched the live HTML document directly using `curl.exe -i -L --max-time 15 https://ekrishimarukatte.karnataka.gov.in/Market/Index`.

### Key Findings from Headers & HTML
- **Server & Framework:** ASP.NET Core MVC (evidenced by `.AspNetCore.Antiforgery` cookie, `__RequestVerificationToken`, and Razor-style layout wrappers).
- **HTTP Status:** `200 OK` (`145,588` bytes HTML document).
- **Security Headers:** Strict `Content-Security-Policy` with per-request `nonce`, `Strict-Transport-Security`, `X-Frame-Options: SAMEORIGIN`.
- **Front-End Vendor Stack:**
  - **Bootstrap 5.3.3** (`bootstrap.min.css`, `bootstrap.bundle.min.js`)
  - **Chart.js 4.4.7** (`chart.umd.min.js`) for the interactive dual-axis price/volume chart
  - **jQuery 3.7.1 + Select2** for the searchable APMC yard dropdown
  - **Font Awesome 6.5.1** for terminal/market icons
  - **Google Fonts:** `Plus Jakarta Sans` (headings), `Inter` (UI text), `JetBrains Mono` (prices, deltas, tabular figures), `Noto Sans Kannada` (Kannada commodity names)
  - **Bhashini Translation Plugin** (`translation-plugin.bhashini.co.in`) + custom **Ask KSAMD** inline chatbot widget

---

## Step 2: Root-Cause Diagnosis — Why the Live Portal Appears "Not Working"

Probing the page markup, stylesheets, and backend API endpoints revealed **five concrete issues** explaining why the dashboard looks broken or stuck in a browser:

1. **Severe API Latency & `302` Query-Encryption Redirects (`?enc=...`)**
   - `GET /Market/GetSummary?apmcId=32` responded after **~41 seconds** with `302 Found -> /Market/GetSummary?enc=...`, followed by another **~52 seconds** on the encrypted redirect.
   - `GET /Market/GetCommodityPrices?apmcId=32` took **~118 seconds** on the first hop and **~54 seconds** on the redirected `?enc=...` hop.
   - In a normal browser session, users perceive the page as frozen/stuck on `"Connecting to Karnataka APMC Market Stream..."`, `--`, and `₹--`.

2. **Empty Backend Payloads (`hasData: false` / `[]`)**
   - The eventual `200 OK` JSON responses for tested yard `32` (`APMC, YESHWANTHPUR, BENGALURU`) returned:
     ```json
     {
       "apmcId": 32,
       "apmcName": "APMC, YESHWANTHPUR, BENGALURU",
       "marketDate": null,
       "totalArrivals": null,
       "arrivalsVsYesterday": null,
       "arrivalsRising": false,
       "commodityCount": 0,
       "activity": null,
       "hasData": false
     }
     ```
     and `[]` for `GetCommodityPrices`, leaving every KPI and card empty (`No Data Available`).

3. **Broken "Major Yards" Quick-Pick Chips (Spelling Mismatch)**
   - In the live JS function `quickSelectApmc(keyword)`, 7 out of 9 buttons search `<select id="apmcSelect">` `<option>` labels for legacy spellings (`'bangalore'`, `'hubballi'`, `'mysore'`, `'belgaum'`, `'shimoga'`, `'bellary'`, `'gulbarga'`).
   - However, the `<option>` text uses official/mixed spellings (`BENGALURU`, `HUBLI`, `MYSURU`, `BELAGAVI`, `SHIVAMOGGA`, `BALLARI`, `KALABURGI`). Only `kolar` and `davangere` match; clicking the other 7 chips does nothing.

4. **Nested `<!DOCTYPE html>` & Layout CSS Specificity Collision**
   - The server embeds a full second `<!DOCTYPE html><html><head><body>` inside `<div class="container-fluid p-0 content-wrapper">` from `_Layout.cshtml`.
   - `_Layout.cshtml` loads `/css/app-font.css` **after** the terminal's dark-mode `<style>` block. `app-font.css` uses ID-level specificity (`:root:not(#_f):not(#_g)`) with `!important` light-theme text colors (`#1d2b24` and `#4b5a53`), overwriting Select2 selected text and `.text-muted` / `.text-secondary` labels to dark text on dark `#0b1120` cards.

5. **Unselected Default Yard (`232` vs Major Market)**
   - The `<select id="apmcSelect">` has no default `selected` option, so it always boots on the first alphabetical entry (`232` — `APMC ALMEL`) instead of a primary hub.

---

## Step 3: Reverse-Engineering the UI Architecture & Design System

The dashboard uses a **TradingView / Institutional Financial Terminal** aesthetic split into **6 primary layout bands** plus an assistant widget:

### Color & Typography Tokens
| Token | Value | Role |
|---|---|---|
| Body Background | `#060913` | Deep space canvas |
| `--terminal-bg` | `#0b1120` | Input wells, toolbar, price boxes |
| `--terminal-card` | `#0f172a` | KPI cards, control strip, commodity cards |
| `--terminal-card-hover` | `#1e293b` | Hover surface & subtle borders |
| `--bullish-green` | `#10b981` | Positive delta, active selections, Area Glow |
| `--bearish-red` | `#f43f5e` | Negative delta, Day Low indicators |
| `--gold-accent` | `#f59e0b` | Volume KPI accent, volatility spread |
| `--blue-accent` | `#38bdf8` | Market breadth accent, modal rate highlights |
| `--mono-font` | `'JetBrains Mono'` | Prices, deltas, percentages, volumes |
| `--sans-font` | `Inter`, `Plus Jakarta Sans`, `Noto Sans Kannada` | Labels, headings, bilingual crop names |

### 6-Band Structural Breakdown
1. **Top Continuous Ticker Tape (`.ticker-tape-wrap`)** — Sticky `38px` bar with `LIVE TICKER` emerald badge and infinite CSS marquee (`@keyframes ticker-slide`). Hover pauses scrolling; clicking any item jumps to that commodity in the Hero Terminal.
2. **Government & Terminal Header (`.portal-header`)** — Brand badge, pulsing `MARKET ACTIVE` status beacon, live IST clock (`#headerClock`), and action buttons (`Sync`, `Trends`, etc.).
3. **Mandi Control Strip (`.mandi-control-strip`)** — 3-column filter row:
   - Searchable APMC Yard selector (`171` Karnataka APMCs)
   - Live commodity search (`English` / `Kannada` / `Category`)
   - Sort ranking (`Top Gainers`, `Top Price Drops`, `Highest Volume`, `Highest/Lowest Modal Price`, `A–Z`)
   - Row of **Major Yards** quick-pick pill buttons
4. **Institutional KPI Ribbon (`.market-kpi-grid`)** — 4 top-bordered cards:
   - **Market Breadth** (Up / Flat / Down segmented bar; threshold `> +0.4%` bullish, `< -0.4%` bearish)
   - **Top Gainer Today**
   - **Top Price Drop Today**
   - **Mandi Turnover Volume** (Total Arrivals in Quintals + `% vs yesterday`)
5. **Hero Stock Market Terminal (`#terminalHeroSection`)** —
   - Selected asset title, Kannada name, category pill, APMC yard name
   - Mega modal price (`₹/Quintal`), `₹/kg` equivalent (`price / 100`), delta pill (`▲ +₹X (+Y%) Today`)
   - 6-metric **Day Range Panel** (`Session Low`, `Session Modal`, `Session High`, `Day Spread / Volatility`, `Previous Day Close`, `Total Volume Traded`)
   - **Chart Toolbar**: Timeframe selector (`7D`, `15D`, `30D`, `90D`), chart mode toggle (`Area Glow` vs `High-Low Corridor`), `Full Analytics` action
   - **Chart.js Dual-Axis Canvas**: Left Y-axis for `₹` Modal/High/Low curves; Right Y-axis for `Qtl` Arrivals volume bars; center watermark text
6. **Watchlist & Asset Screener (`.watchlist-section`)** —
   - Screener tabs (`All Commodities`, `Gainers ▲`, `Price Drops ▼`, `High Volume`) with dynamic counts
   - View switcher (`Cards` grid vs `Depth Table`)
   - Category pills (`Vegetables`, `Fruits`, `Cereals`, `Pulses`, `Oilseeds`, `Spices`, `Commercial`)
   - Commodity cards with horizontal red-to-green Low–High range track & current-price pin indicator

---

## Step 4: Reverse-Engineered API & JSON Contracts

Inspecting the live JavaScript (`loadSummary`, `loadCommodities`, `loadChartForCommodity`) and the captured live `GetSummary` response established the exact 3-endpoint contract:

### 1. `GET /Market/GetSummary?apmcId={id}`
```json
{
  "apmcId": 32,
  "apmcName": "APMC, YESHWANTHPUR, BENGALURU",
  "marketDate": "2026-11-11T00:00:00",
  "totalArrivals": 29890,
  "arrivalsVsYesterday": 6.4,
  "arrivalsRising": true,
  "commodityCount": 14,
  "activity": "Active Auction",
  "hasData": true
}
```

### 2. `GET /Market/GetCommodityPrices?apmcId={id}`
```json
[
  {
    "commodityId": 101,
    "commodityName": "Onion",
    "commodityKannada": "ಈರುಳ್ಳಿ",
    "groupName": "Vegetables",
    "currentPrice": 2850,
    "previousPrice": 2720,
    "minPrice": 2580,
    "maxPrice": 3090,
    "changePercent": 4.78,
    "changeValue": 130,
    "arrival": 4200
  }
]
```

### 3. `GET /Market/GetPriceHistory?apmcId={id}&commodityId={cid}&periodDays={7|15|30|90}`
```json
[
  {
    "date": "2026-11-05",
    "dateLabel": "05 Nov",
    "price": 2710,
    "minPrice": 2520,
    "maxPrice": 2890,
    "arrival": 3840
  }
]
```

> **Note:** On the live site, when `GetPriceHistory` returns `<= 1` point, the client synthesizes a 5-point intraday fallback curve (`Prev Close → Day Open → Session Low → Modal (Avg) → Session High`).

---

## Step 5: Replicating & Enhancing the Dashboard Mockup

We created a clean, modular static web app inside `m:\KSAMB\e-marukatte` that preserves 100% of the visual design while resolving all 5 live-site defects:

### Created Files
- [`index.html`](index.html) — Clean single-document HTML5 terminal layout with all 6 dashboard bands, modals, and the Ask KSAMD assistant.
- [`css/terminal.css`](css/terminal.css) — Replicated dark financial CSS design system with fixed contrast tokens for `.text-muted`/`.text-secondary` and a custom dark searchable APMC combobox.
- [`js/mock-data.js`](js/mock-data.js) — Contains all **171 exact Karnataka APMC market yards**, bilingual Kannada/English commodity catalog, major-hub regional profiles (Yeshwanthpur Bengaluru, Byadagi Chilli, Kolar Tomato, Shivamogga Arecanut, Kalaburagi Tur, Hubballi, Mysuru, Belagavi, Ballari, Davanagere), deterministic seeded generator for every yard, and 90-day OHLC-like price + arrivals history.
- [`js/app.js`](js/app.js) — Controller orchestrating:
  - Searchable 171-yard combobox + fixed `apmcId` Major Yards chips
  - Sync & optional **Auto-Tick (4s)** simulated live auction price stream
  - Dual-axis **Chart.js** rendering (`7D` / `15D` / `30D` / `90D`, `Area Glow` & `High-Low Corridor`) with canvas fallback
  - Card Grid & Market Depth Table with Screener, Category, Search (EN/KN), and Sort controls
  - In-page **Full Analytics Modal** (30D stats + Cross-Mandi Price Comparison with one-click yard switching)
  - In-page **Trends Modal** (Statewide top gainers & drops)
  - In-page **JSON Schema Inspector Modal** showing live mock API payloads
  - Local **Ask KSAMD** chatbot that answers queries against the active yard's commodities

---

## Step 6: Verification & Next Steps

### Local Verification Checklist
1. Open `m:\KSAMB\e-marukatte\index.html` directly in any modern browser (or serve locally via `npx serve m:\KSAMB\e-marukatte`).
2. Confirm the **Live Ticker** scrolls continuously, pauses on hover, and selects commodities on click.
3. Test all **Major Yards** chips (`Bengaluru`, `Hubballi`, `Mysuru`, `Kolar`, `Belagavi`, `Shivamogga`, `Ballari`, `Kalaburagi`, `Davanagere`, `Byadagi`) and search inside the 171-yard dropdown.
4. Toggle `7D` / `15D` / `30D` / `90D` and `Area Glow` vs `High-Low Corridor` on the Hero Chart.
5. Toggle `Cards` vs `Depth Table`, test Screener pills (`Gainers`, `Price Drops`, `High Volume`), Category tags, and Search (including Kannada text like `ಈರುಳ್ಳಿ`).
6. Click `Full Analytics`, `Trends`, `JSON Schema`, `Sync`, `Auto-Tick`, and `Ask KSAMD` to verify all interactive flows work with zero backend errors.

### Connecting to a Real Backend Later
To swap out `MockMarketApi` for live data in the future:
1. Replace `MockMarketApi.getSummary`, `getCommodityPrices`, and `getPriceHistory` in `js/mock-data.js` with `fetch()` calls to your new REST API (avoiding `302` query encryption redirects and keeping response times `< 300ms`).
2. Keep the exact JSON field names documented in Step 4 so `js/app.js` requires zero structural changes.

---

## Step 7: Phase 1 — DuckDB Analytical Warehouse & Raw CSV Ingestion (`./data/*.csv`)

With raw Krishi Marata Vahini datasets stored across `17` CSV files (`~151 MB`, `1,510,937` raw rows spanning `2002-02-07` to `2026-10-15`) in `m:\KSAMB\e-marukatte\data`, we built a local Python 3.13 + DuckDB 2.0 analytical pipeline (`pyproject.toml`, `backend/ingest.py`).

### Data Profiling Quirks Solved During ETL
1. **Header Order Alignment (`MANGO.csv`)** — `MANGO.csv` places unnamed numeric columns (`0..10`) before `Commodity,Market,...`, whereas the other 16 CSVs place `Date,Market,...` first. [`ingest_csv_directory`](backend/ingest.py) uses DuckDB `read_csv(..., union_by_name = true, all_varchar = true, header = true, ignore_errors = true)` so every file aligns cleanly by header name.
2. **Outlier & Anomaly Sanitization** — Raw CSVs contained `21,123` rows with `Modal = 0`, `311` rows with `0 < Modal < 50` (data-entry typos), and `11,320` rows where `Min > Max` or `Modal` lay outside `[Min, Max]`. The ingestion pipeline filters out invalid `Modal < 50` rows and clamps `[min_price, max_price]` cleanly around `modal_price`.
3. **District String Normalization & Multi-Variety Aggregation** — Trailing `•` characters in district names (e.g. `Bengaluru Urban•`) are stripped, and multiple varieties/grades per `(trade_date, market, commodity)` are preserved in `raw_trades` while rolling up arrival-weighted modal prices in `daily_market_commodity`.
4. **DuckDB Warehouse Statistics (`marukatte.duckdb`):**
   - `raw_trades`: **`1,489,503`** cleaned transaction rows
   - `daily_market_commodity`: **`1,344,204`** `(trade_date, market, commodity)` daily records
   - `markets_meta` & `market_commodity_latest`: **`171`** Karnataka APMCs, **`17`** commodities, **`31`** districts

---

## Step 8: Phase 2 — FastAPI Backend, `kmvahini 1.2.0` Sync & External API Contract

Implemented in [`backend/app.py`](backend/app.py) and [`backend/kmvahini_sync.py`](backend/kmvahini_sync.py):

### Exposed REST Endpoints
| Method & Path | Purpose |
|---|---|
| `GET /api/health` | Returns DuckDB status, row counts, market count, and date span |
| `GET /api/markets` | Returns all `171` markets with EN/KN names, districts, and latest dates |
| `GET /api/market/summary?market={CODE}` | Latest session arrivals, delta vs prior session, and metadata |
| `GET /api/market/prices?market={CODE}` | Commodity depth rows with `lastTradedDate`, EN/KN labels, and deltas |
| `GET /api/market/history?market={CODE}&commodity={CODE}&days={7\|15\|30\|90\|365\|0}` | Anchor-date history (`days=0` returns full 2002–2026 monthly series) + latest variety/grade breakdown |
| `GET /api/market/compare?commodity={CODE}` | Cross-mandi price comparison across active Karnataka yards |
| `GET /api/trends` | Statewide top gainers & price drops within the latest 45-day horizon (requiring prior trading sessions within 14 days and volume `>= 10` Qtl) |
| `POST /api/sync/kmvahini` | Lazily invokes `kmvahini.get_data(..., update_only=True, workers=1)` (`kmvahini==1.2.0`), auto-inferring the start month from `MAX(trade_date)` in DuckDB and active commodities if omitted |
| `POST /api/ingest` | Accepts `{ "records": [...] }` in Krishi Marata Vahini schema (`Date`, `Market`, `Commodity`, `Modal`, etc.) and upserts idempotently via [`upsert_dataframe`](backend/ingest.py) |
| `POST /api/rebuild-from-csv` | Rebuilds `marukatte.duckdb` cleanly from `data/*.csv` |

---

## Step 9: Phase 3 — Seamless Bilingual (`EN | ಕನ್ನಡ`) Terminal & Historical UI

1. **Zero-Latency Bilingual Layer (`backend/bilingual.py` + `js/i18n.js`):**
   - Full `English <-> Kannada` mappings covering all **171 APMCs**, **17 CSV commodities (+ 13 `kmvahini` commodities)**, **32 districts**, **7 categories**, and **98 UI `data-i18n` hooks** persisted in `localStorage` (`ksamb_lang`).
   - Clicking `EN` or `ಕನ್ನಡ` in the header instantly translates static DOM labels (`data-i18n`), Major Yard quick-pick chips, search placeholders, Chart.js datasets/tooltips, KPI cards, watchlists, modals (including variety breakdown & cross-mandi comparison columns), and Ask KSAMD assistant header/topics.
   - Search inputs match both English and Kannada strings regardless of the active display language.
2. **24-Year Historical & Variety Drilldown (`index.html` + `js/app.js`):**
   - Added `1Y` (`365D`) and `ALL` (`2002–2026` monthly aggregation) chart periods.
   - Added `Last Traded` session date badges (`date-badge-mini`) on commodity cards and Market Depth table rows so staggered auction dates remain transparent.
   - Extended **Full Analytics** modal with a **Latest Session Variety & Grade Breakdown** table alongside the 30D summary and cross-mandi comparison.
   - Upgraded **Data & API Inspector** modal with live DuckDB pipeline health metrics and an interactive **`kmvahini 1.2.0` Sync** trigger.
   - Preserved automatic fallback to `MockMarketApi` whenever `index.html` is opened directly via `file://`.

---

## Step 10: Phase 4 — End-to-End Verification Suite, Benchmarks & Future API Ingestion Spec

Created a repeatable automated verification suite in [`tests/verify_terminal.py`](tests/verify_terminal.py) verifying every layer across DuckDB, FastAPI, `kmvahini 1.2.0` sync bounds, bilingual coverage, DOM hooks, and live HTTP endpoints (`http://127.0.0.1:8000`).

### Verified Checks & Live HTTP Benchmarks (`http://127.0.0.1:8000`)
- **Bilingual Coverage:** `171 / 171` markets, `17 / 17` CSV commodities, and `31 / 31` districts (`0` untranslated entries).
- **DOM & `i18n` Integrity:** `92` unique HTML element IDs, `87` JS `getElementById` hooks (`0` missing), `98` `data-i18n` keys (`0` missing).
- **Upsert & Anomaly Cleaning (`upsert_dataframe`):** Verified in an isolated temporary DuckDB instance covering `DatetimeIndex`, `NaN` districts, `Min=0` sanitization, and primary-key deduplicating replacement (`(trade_date, market, commodity, variety, grade)`).
- **Measured Live HTTP Latencies (`200 OK` across all 15 routes vs original site's `41,000–118,000 ms`):**

| Route | Response Size | Measured Latency |
|---|---|---|
| `GET /` (`index.html`) | `34,948 B` | `13.71 ms` |
| `GET /api/health` | `135 B` | `99.59 ms` |
| `GET /api/markets` | `50,041 B` | `89.44 ms` |
| `GET /api/market/summary?market=BENGALURU` | `366 B` | `86.41 ms` |
| `GET /api/market/prices?market=BENGALURU` | `5,001 B` | `97.05 ms` |
| `GET /api/market/history?...&days=30` | `3,212 B` | `124.67 ms` |
| `GET /api/market/history?...&days=0` (297 monthly pts, 2002–2026) | `34,465 B` | `135.06 ms` |
| `GET /api/market/compare?commodity=ONION` | `6,008 B` | `170.47 ms` |
| `GET /api/trends` | `4,712 B` | `240.17 ms` |

### External API Ingestion Contract (`POST /api/ingest`)
Any external JSON scraper/feed conforming to Krishi Marata Vahini columns can push updates directly into `marukatte.duckdb` without restarts:
```json
{
  "records": [
    {
      "Date": "2026-11-11",
      "Market": "BENGALURU",
      "District": "Bengaluru Urban",
      "Commodity": "ONION",
      "Variety": "PUNA",
      "Grade": "FAQ",
      "Arrivals": 320.0,
      "Unit": "Quintal",
      "Min": 2400,
      "Max": 3300,
      "Modal": 2950
    }
  ]
}
```

---

## Step 11: Running & Re-Verifying Locally

From `m:\KSAMB\e-marukatte`:

```powershell
# 1. Launch the FastAPI server + static UI
.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000

# 2. Run the full verification suite (offline + live HTTP routes)
.venv\Scripts\python.exe tests/verify_terminal.py --url http://127.0.0.1:8000
```

Open **`http://127.0.0.1:8000`** in your browser (`DUCKDB • 1.49M ROWS` will illuminate in blue in the header; interactive FastAPI docs are available at `http://127.0.0.1:8000/docs`). To re-ingest CSVs cleanly at any time, run `.venv\Scripts\python.exe -m backend.ingest`.

---

## Step 12: Bugfix — Offline Mockup Fallback Confusion, `Bidar` `SOYABEEN` Visibility & `Sync` Behavior

After Phase 4 verification, testing uncovered why opening the UI outside `http://127.0.0.1:8000` (e.g., via `file://` or IDE live preview) or switching yards could hide market commodities like `Bidar -> Soyabean` and make `Sync` appear to invent values:

1. **Cross-Origin Backend Auto-Discovery (`js/app.js`):** [`DataAdapter.detectBackend`](js/app.js) previously returned `false` immediately on `file://` and only checked relative `/api/health`. It now automatically probes same-origin, `http://127.0.0.1:8000`, and `http://localhost:8000` (backed by FastAPI CORS) so the `1.49M`-row DuckDB database (`BIDAR` with `SOYABEEN` at `#1` / `11,450 Qtl`) connects seamlessly even from IDE previews or `file://`.
2. **Removed Simulated Tick Mutation from Header `Sync` (`js/app.js`):** Header `#btnSync` previously passed `!isLiveBackend` to `loadMarket()`, invoking `MockMarketApi.simulateLiveTick()` in fallback mode (which drifted prices and added random quintals every click). Replaced with [`handleManualSync`](js/app.js), which re-probes the FastAPI backend, reloads real DuckDB records cleanly, and displays an explicit `#syncStatusToast` message.
3. **Explicit Offline Fallback Banner (`index.html`, `js/i18n.js`, `css/terminal.css`):** Added bilingual `#mockFallbackBanner` (visible only when FastAPI on port `8000` is unreachable) with a one-click `Connect DuckDB` retry button, and added Bidar district yard profiles (`BIDAR`, `BASAVAKALYAN`, `BHALKI`, `AURAD`, `HUMNABAD`) including `Soybean` in `js/mock-data.js` for offline previews.
4. **Filter Reset on Market Switch & `Soyabean` Search Aliases (`js/app.js`, `backend/bilingual.py`, `backend/app.py`):** Switching yards via [`selectApmcById`](js/app.js) clears stale category/screener filters so sticky filters from a previous yard cannot hide crops in the newly chosen market, and `SOYABEEN` / `SOYABEAN` / `SOYBEAN` plus common crop aliases (`toor`, `chana`, `urad`, `moong`, `shenga`, etc.) are indexed in both backend metadata and client search.

---

## Step 13: Trailing 2-Month Complete Re-Scrape Button & Linked Query Bar Controls

1. **Separated Local Refresh vs Dedicated Live Scrape (`index.html`, `js/i18n.js`, `js/app.js`):**
   - Renamed header `#btnSync` to **`Refresh`** (`ರಿಫ್ರೆಶ್`) so its local DuckDB reload semantics are unmistakable.
   - Added a dedicated **`#btnScrapeLatest` (`Scrape Latest (2M)` / `ಲೈವ್ ಸ್ಕ್ರೇಪ್ (2M)`)** button in the header plus window selector (`1M` / `2M` / `3M`) and cache-bypass toggle (`#chkForceKmvahiniScrape`) inside the **Data & API** modal.
2. **Safe Atomic Month Re-Scrape & `kmvahini 1.2.0` Cache Fix (`backend/ingest.py`, `backend/kmvahini_sync.py`, `backend/app.py`):**
   - Extended [`_default_sync_bounds_and_commodities`](backend/kmvahini_sync.py) with rolling trailing `lookback_months=2` arithmetic (`_shift_year_month`) so late-reporting markets from the prior 1–2 months are re-fetched cleanly.
   - Forced `use_cloud_cache=False` whenever `force_refresh=True` inside [`sync_from_kmvahini`](backend/kmvahini_sync.py) so `kmvahini 1.2.0` scrapes fresh source data rather than re-pulling potentially incomplete cloud parquet snapshots.
   - Added `replace_mode="month_commodity"` inside [`upsert_dataframe`](backend/ingest.py): **only after** `kmvahini.get_data()` returns non-empty valid rows (`Modal >= 50`), atomically deletes and replaces `(year, month, commodity)` slices present in the scraped payload within a single DuckDB transaction—eliminating duplicate/stale grade rows while preserving untouched commodities/months and guarding against failed scrapes.
3. **End-to-End Linked Query Bar (`index.html`, `css/terminal.css`, `js/app.js`):**
   - Added **`#queryMatchBar`** inside `.mandi-control-strip` showing live match counts, active sort summary, top-6 clickable match chips (`#queryMatchChips`), and one-click `#btnClearQueryFilters`.
   - Linked `#txtSearch` and `#sortSelect` directly to **Hero Terminal & Chart** (`syncHero: true`, `preferTopRanked: true`) and **Live Ticker** (`populateTickerTape`) with monotonic `heroChartRequestSeq` stale-response protection.
   - Preserved active `#txtSearch` and `#sortSelect` when switching yards if matches exist in the destination market, auto-clearing search with a clear toast notice only when the destination market lacks the searched commodity.

---

## Step 14: Compulsory Current-Month + Dynamic Gap Backfill, Concurrency Locking & November 2026 Population

Previously, scraping `17` commodities sequentially took ~9 minutes (tripping browser `300s` fetch timeouts), lacked `sync_metadata` tracking, and risked DuckDB read/write connection-config collisions under concurrent UI polling.

1. **Dynamic Date, Closed-Month Skip & Same-Day Guard ([`compute_sync_plan`](backend/kmvahini_sync.py)):**
   - Derives `today` and `expectedAvailableDate = today - 1 day` (`T-1` published auction cutoff).
   - **Compulsorily** targets the current calendar month (`today.year, today.month`) as the end bound, and computes `previousMonthsCount` dynamically from `min(sync_metadata.last_scraped_date, MAX(trade_date))`. Once a closed past month has already been scraped after that month ended (`ref_ym == current_ym`), subsequent runs automatically target **only the current calendar month** (e.g. `2026-11` only, not re-scraping settled `2026-10`).
   - Sets `alreadyScrapedToday=True` whenever `last_scraped_date >= today`: both the header button (`Synced Today`) and `POST /api/sync/kmvahini` short-circuit cleanly with `"Last scrape was done today; DB is current through ... Try again tomorrow"` unless `#chkForceSameDayScrape` / `force_same_day=True` is explicitly checked.
   - Persists scrape telemetry in DuckDB's **`sync_metadata`** table ([`get_sync_metadata`](backend/ingest.py), [`record_sync_metadata`](backend/ingest.py)).
2. **Thread-Safe DuckDB Locking & Non-Blocking Parallel Engine ([`backend/ingest.py`](backend/ingest.py), [`backend/kmvahini_sync.py`](backend/kmvahini_sync.py), [`backend/app.py`](backend/app.py)):**
   - Added `DB_LOCK` (`threading.RLock`) + [`db_connection`](backend/ingest.py) context manager across all FastAPI endpoints and writers so read-only queries and background `kmvahini` writes never conflict inside the same process.
   - Upgraded [`sync_from_kmvahini`](backend/kmvahini_sync.py) to prioritize the **current month first**, split commodities into balanced batches across `4` parallel Chrome worker threads (`kmvahini.scraper.scrape_month`), and commit each completed batch immediately via `replace_mode="month_commodity"`.
   - Added `GET /api/sync/plan`, `GET /api/sync/status`, background execution support on `POST /api/sync/kmvahini`, and catch-up telemetry (`needsCatchup`, `expectedAvailableDate`, `lastScrapedAt`, `syncPlan`) on `GET /api/health`.
3. **Live UI Catch-Up Awareness & Polling (`index.html`, `js/i18n.js`, `css/terminal.css`, `js/app.js`):**
   - Header button dynamically displays the planned window (e.g., `Scrape (Oct–Nov)`) and highlights catch-up status (`needs-catchup`) until DB data reaches `T-1`.
   - Starting a scrape runs non-blockingly, polls `/api/sync/status` every `2.5s`, resumes seamlessly across reloads, and refreshes charts/cards incrementally as batches merge.
4. **Live November 2026 Database Backfill (`marukatte.duckdb`):**
   - Executed live `kmvahini 1.2.0` scrape across `2026-10 -> 2026-11`: replaced `3,223` partial/earlier rows with **`9,155` fresh rows** (`0` errors), expanding `marukatte.duckdb` to **`1,495,435` raw rows** (`1,349,788` daily series, `171` markets) spanning **`2002-02-07` through `2026-11-11`** (including `BIDAR -> SOYABEEN` on `2026-11-11` and `BENGALURU -> ONION` on `2026-11-09`).


