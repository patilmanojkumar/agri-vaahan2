/* =====================================================================
   Agri Vaahan (ಅಗ್ರಿ ವಾಹನ) — Client Application Controller
   Connects seamlessly to FastAPI + DuckDB (/api/*) with automatic fallback
   to window.MockMarketApi when opened offline via file://.
   Supports TradingView Daylight & Dark themes + EN <-> ಕನ್ನಡ.
   ===================================================================== */

(function () {
    'use strict';

    const MAJOR_YARD_CODES = [
        'BENGALURU',
        'BINNY MILL (F&V)',
        'HUBBALLI',
        'MYSURU',
        'KOLAR',
        'BELAGAVI',
        'SHIVAMOGGA',
        'BALLARI',
        'KALABURAGI',
        'DAVANAGERE',
        'BYADGI'
    ];

    const MOCK_ID_BY_CODE = {
        BENGALURU: 32,
        'BINNY MILL (F&V)': 31,
        HUBBALLI: 140,
        MYSURU: 110,
        KOLAR: 47,
        BELAGAVI: 129,
        SHIVAMOGGA: 57,
        BALLARI: 168,
        KALABURAGI: 179,
        DAVANAGERE: 43,
        BYADGI: 153
    };

    const COMMODITY_SEARCH_ALIASES = {
        SOYABEEN: 'soyabean soybean soyabeen soya',
        SOYABEAN: 'soyabean soybean soyabeen soya',
        SOYBEAN: 'soyabean soybean soyabeen soya',
        TUR: 'tur toor arhar red gram togari',
        BENGALGRAM: 'bengalgram bengal gram chana kadale',
        BLACKGRAM: 'blackgram black gram urad uddu',
        GREENGRAM: 'greengram green gram moong hesaru',
        GROUNDNUT: 'groundnut peanut shenga nelagadale',
        PADDY: 'paddy rice bhatta dhan',
        JOWAR: 'jowar sorghum jola',
        MAIZE: 'maize corn mekke jola',
    };

    // Runtime state
    let isLiveBackend = false;
    let apiBase = '';
    let healthInfo = null;
    let yardsList = [];
    let currentApmc = 'BENGALURU';
    let selectedCommodityId = '';
    let currentPeriodDays = 30;
    let currentInterval = 'daily'; // 'daily' | 'weekly' | 'monthly'
    let currentChartStyle = (function () {
        try {
            const saved = localStorage.getItem('agrivaahan_chart_style');
            return (saved === 'glow' || saved === 'band' || saved === 'candlestick') ? saved : 'candlestick';
        } catch (_) {
            return 'candlestick';
        }
    })();
    const activeIndicators = {
        sma7: false,
        sma20: true,
        sma50: false,
        ema12: false,
        rsi14: false
    };
    let currentViewMode = 'table';  // 'table' | 'cards'
    let activeWorkspaceTab = 'terminal'; // 'terminal' | 'movers' | 'advisory' | 'analysis'
    let sidebarCollapsed = (function () {
        try {
            return localStorage.getItem('agrivaahan_sidebar_collapsed') === 'true';
        } catch (_) {
            return false;
        }
    })();
    let activeTheme = (function () {
        try {
            return localStorage.getItem('agrivaahan_theme') === 'dark' ? 'dark' : 'light';
        } catch (_) {
            return 'light';
        }
    })();
    let allCommodities = [];
    let currentSummary = null;
    let currentHistory = [];
    let currentWarmupBars = [];
    let currentVarieties = [];
    let activeCategory = 'all';
    let activeScreener = 'all';
    let trendChart = null;
    let rsiChart = null;
    let lastChartRenderPayload = null;
    let syncToastTimer = null;
    let heroChartRequestSeq = 0;
    let searchHeroDebounceTimer = null;
    let pendingYardSwitchSearchCheck = false;
    let isKmvahiniScraping = false;
    let syncPollTimer = null;
    let lastObservedBatches = 0;

    // Phase 3 Multi-Year Matrix & Period Differential state
    const analysisState = {
        initialized: false,
        market: 'BENGALURU',
        commodity: 'ONION',
        years: 5,
        granularity: 'annual',
        focusMonth: '',
        periodA: '2025',
        periodB: '2026',
        chartMode: 'period', // 'period' | 'matrix'
        matrixData: null,
        compareData: null,
        requestSeq: 0,
        compareSeq: 0
    };
    let analysisChart = null;

    // Technical Report Archive state (starts with TR-1 Soyabean)
    const reportState = {
        subView: 'report', // 'report' | 'matrix'
        initialized: false,
        reportId: 'tr1_soyabean_2026',
        market: 'BIDAR',
        reportsList: [],
        data: null,
        seq: 0
    };
    let reportSeasonalPriceChart = null;
    let reportSeasonalArrChart = null;
    let reportForecastChart = null;

    // ---------------------------------------------------------
    // Theme & Workspace Tabs
    // ---------------------------------------------------------
    function getChartThemeColors() {
        const isDark = activeTheme === 'dark';
        return {
            isDark,
            bullLine: isDark ? '#22ab94' : '#089981',
            bullGlow: isDark ? 'rgba(8, 153, 129, 0.18)' : 'rgba(8, 153, 129, 0.14)',
            bullVol: isDark ? 'rgba(8, 153, 129, 0.34)' : 'rgba(8, 153, 129, 0.25)',
            bearLine: isDark ? '#f7525f' : '#f23645',
            bearGlow: isDark ? 'rgba(242, 54, 69, 0.18)' : 'rgba(242, 54, 69, 0.13)',
            bearVol: isDark ? 'rgba(242, 54, 69, 0.34)' : 'rgba(242, 54, 69, 0.24)',
            highBand: isDark ? 'rgba(34, 171, 148, 0.55)' : 'rgba(8, 153, 129, 0.48)',
            lowBand: isDark ? 'rgba(247, 82, 95, 0.55)' : 'rgba(242, 54, 69, 0.48)',
            sma7Line: '#f57c00',
            sma20Line: isDark ? '#5b9cf6' : '#2962ff',
            sma50Line: '#ab47bc',
            ema12Line: isDark ? '#26a69a' : '#00897b',
            rsiLine: isDark ? '#5b9cf6' : '#2962ff',
            rsiBandBg: isDark ? 'rgba(91, 156, 246, 0.08)' : 'rgba(41, 98, 255, 0.06)',
            pointFill: isDark ? '#1e222d' : '#ffffff',
            legendText: isDark ? '#d1d4dc' : '#434651',
            tickText: isDark ? '#868993' : '#787b86',
            yTickText: isDark ? '#f0f3fa' : '#131722',
            gridLine: isDark ? 'rgba(209, 212, 220, 0.06)' : 'rgba(19, 23, 34, 0.06)',
            tooltipBg: isDark ? '#1e222d' : '#ffffff',
            tooltipBorder: isDark ? '#434651' : '#d1d4dc',
            tooltipTitle: isDark ? '#f0f3fa' : '#131722',
            tooltipBody: isDark ? '#d1d4dc' : '#434651'
        };
    }

    function syncChartToolbarUI() {
        document.querySelectorAll('.period-btn').forEach(btn => {
            const days = parseInt(btn.getAttribute('data-days'), 10);
            btn.classList.toggle('active', days === currentPeriodDays);
        });
        document.querySelectorAll('.interval-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-interval') === currentInterval);
        });
        document.getElementById('btnStyleCandle')?.classList.toggle('active', currentChartStyle === 'candlestick');
        document.getElementById('btnStyleGlow')?.classList.toggle('active', currentChartStyle === 'glow');
        document.getElementById('btnStyleBand')?.classList.toggle('active', currentChartStyle === 'band');
        document.querySelectorAll('[data-ind]').forEach(btn => {
            const ind = btn.getAttribute('data-ind');
            btn.classList.toggle('active', Boolean(ind && activeIndicators[ind]));
        });
    }

    function applyTheme(theme) {
        activeTheme = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', activeTheme);
        try {
            localStorage.setItem('agrivaahan_theme', activeTheme);
        } catch (_) {
            // Ignore storage errors
        }

        const iconEl = document.getElementById('btnThemeIcon');
        const labelEl = document.getElementById('btnThemeLabel');
        if (iconEl) {
            iconEl.className = activeTheme === 'dark'
                ? 'fa-solid fa-sun av-accent-warm'
                : 'fa-solid fa-moon av-accent-primary';
        }
        if (labelEl) {
            const key = activeTheme === 'dark' ? 'themeLightLabel' : 'themeDarkLabel';
            labelEl.setAttribute('data-i18n', key);
            labelEl.textContent = t(key);
        }

        if (lastChartRenderPayload) {
            const p = lastChartRenderPayload;
            renderStockMarketChart(p.seriesBars, p.warmupBars, p.commodity);
        }
        if (analysisChart && (analysisState.compareData || analysisState.matrixData)) {
            renderAnalysisChart();
        }
        if (reportState.data && (reportSeasonalPriceChart || reportSeasonalArrChart || reportForecastChart)) {
            renderReportCharts(reportState.data);
        }
    }

    function updateWorkspaceContextPills() {
        const yardName = currentSummary ? getSummaryApmcName(currentSummary) : (currentApmc || 'BENGALURU');
        const found = allCommodities.find(c => String(c.commodityId) === String(selectedCommodityId)) || allCommodities[0];
        const comName = found ? getCommodityPrimaryName(found) : (selectedCommodityId || '--');
        const ctxText = yardName + ' • ' + comName;
        const aEl = document.getElementById('analysisContextPill');
        const iEl = document.getElementById('advisoryContextPill');
        if (aEl) {
            if (analysisState.initialized && analysisState.matrixData) {
                const m = analysisState.matrixData;
                const amName = (lang() === 'kn' && m.marketNameKn) ? m.marketNameKn : (m.marketName || yardName);
                const acName = (lang() === 'kn' && m.commodityNameKn) ? m.commodityNameKn : (m.commodityName || comName);
                aEl.textContent = amName + ' • ' + acName;
            } else {
                aEl.textContent = ctxText;
            }
        }
        if (iEl) iEl.textContent = ctxText;
    }

    function setSidebarCollapsed(collapsed) {
        sidebarCollapsed = Boolean(collapsed);
        try {
            localStorage.setItem('agrivaahan_sidebar_collapsed', sidebarCollapsed ? 'true' : 'false');
        } catch (_) {
            // Ignore storage errors
        }
        document.getElementById('workbenchGrid')?.classList.toggle('is-sidebar-collapsed', sidebarCollapsed);
        document.getElementById('btnShowSidebar')?.classList.toggle('d-none', !sidebarCollapsed);
        document.getElementById('btnToggleSidebar')?.setAttribute('aria-expanded', sidebarCollapsed ? 'false' : 'true');
        if (trendChart && typeof trendChart.resize === 'function') {
            setTimeout(() => {
                trendChart?.resize();
                rsiChart?.resize();
            }, 60);
        }
    }

    function switchWorkspaceTab(tabName) {
        activeWorkspaceTab = (tabName === 'movers' || tabName === 'advisory' || tabName === 'analysis')
            ? tabName
            : 'terminal';
        const tabs = [
            { key: 'terminal', btn: 'navTabTerminal', panel: 'viewPanelTerminal' },
            { key: 'movers', btn: 'navTabMovers', panel: 'viewPanelMovers' },
            { key: 'advisory', btn: 'navTabAdvisory', panel: 'viewPanelAdvisory' },
            { key: 'analysis', btn: 'navTabAnalysis', panel: 'viewPanelAnalysis' }
        ];
        tabs.forEach(item => {
            const isActive = item.key === activeWorkspaceTab;
            document.getElementById(item.btn)?.classList.toggle('active', isActive);
            document.getElementById(item.panel)?.classList.toggle('d-none', !isActive);
        });
        updateWorkspaceContextPills();

        if (activeWorkspaceTab === 'movers') {
            loadStatewideMoversPanel();
        } else if (activeWorkspaceTab === 'analysis') {
            if (reportState.subView === 'report') {
                if (!reportState.initialized) {
                    initAnalysisReportTab();
                } else {
                    setTimeout(() => {
                        reportSeasonalPriceChart?.resize();
                        reportSeasonalArrChart?.resize();
                        reportForecastChart?.resize();
                    }, 50);
                }
            } else {
                if (!analysisState.initialized) {
                    initAnalysisTab(true);
                } else if (analysisChart && typeof analysisChart.resize === 'function') {
                    setTimeout(() => analysisChart?.resize(), 50);
                }
            }
        } else if (activeWorkspaceTab === 'terminal' && trendChart && typeof trendChart.resize === 'function') {
            setTimeout(() => {
                trendChart?.resize();
                rsiChart?.resize();
            }, 50);
        }
    }

    // ---------------------------------------------------------
    // Utilities & Language Helpers
    // ---------------------------------------------------------
    function t(key) {
        return window.I18N ? window.I18N.t(key) : key;
    }

    function lang() {
        return window.I18N ? window.I18N.getLang() : 'en';
    }

    function fmt(n, decimals) {
        if (n == null || isNaN(n)) return '-';
        const num = Number(n);
        if (decimals != null) {
            return num.toLocaleString('en-IN', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            });
        }
        return num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    }

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getCommodityPrimaryName(c) {
        if (!c) return '';
        if (lang() === 'kn' && c.commodityKannada) return c.commodityKannada;
        return c.commodityName || c.commodityId || '';
    }

    function getCommoditySecondaryName(c) {
        if (!c) return '';
        if (lang() === 'kn') return c.commodityName || '';
        return c.commodityKannada || '';
    }

    function getCommodityGroupLabel(c) {
        if (!c) return '';
        if (lang() === 'kn' && c.groupNameKn) return c.groupNameKn;
        return c.groupName || '';
    }

    function getYardPrimaryName(y) {
        if (!y) return '';
        if (lang() === 'kn' && y.nameKn) return y.nameKn;
        return y.name || String(y.id);
    }

    function getYardDistrictLabel(y) {
        if (!y) return '';
        if (lang() === 'kn' && y.districtKn) return y.districtKn;
        return y.district || '';
    }

    function getSummaryApmcName(s) {
        if (!s) return 'APMC Yard';
        if (lang() === 'kn' && s.apmcNameKn) return s.apmcNameKn;
        return s.apmcName || s.apmcId || 'APMC Yard';
    }

    function getCommodityEmoji(name) {
        const n = (name || '').toLowerCase();
        if (/tomato/.test(n)) return '🍅';
        if (/onion/.test(n)) return '🧅';
        if (/potato/.test(n)) return '🥔';
        if (/paddy|rice|bhat/.test(n)) return '🌾';
        if (/wheat|godhi/.test(n)) return '🌾';
        if (/maize|corn|musukina/.test(n)) return '🌽';
        if (/banana|bale/.test(n)) return '🍌';
        if (/mango|mavu/.test(n)) return '🥭';
        if (/apple|sebu/.test(n)) return '🍎';
        if (/brinjal|badane/.test(n)) return '🍆';
        if (/chilli|chili|menasina/.test(n)) return '🌶️';
        if (/groundnut|kadale/.test(n)) return '🥜';
        if (/safflower|kusube/.test(n)) return '🌼';
        if (/coconut|tengu|copra/.test(n)) return '🥥';
        if (/cotton|hatti/.test(n)) return '☁️';
        if (/turmeric|arashina/.test(n)) return '🟡';
        if (/ginger|shunti/.test(n)) return '🫚';
        if (/garlic|bellulli/.test(n)) return '🧄';
        if (/carrot|gajjari/.test(n)) return '🥕';
        if (/ragi|finger millet/.test(n)) return '🌾';
        if (/jowar|sorghum|jola/.test(n)) return '🌾';
        if (/gram|tur|moong|chana|urad|blackgram|bengalgram|greengram/.test(n)) return '🫘';
        if (/arecanut|adike/.test(n)) return '🌰';
        if (/sunflower/.test(n)) return '🌻';
        if (/soybean|soyabeen/.test(n)) return '🫛';
        if (/pepper/.test(n)) return '⚫';
        return '🌿';
    }

    // ---------------------------------------------------------
    // Dual Data Adapter (FastAPI + DuckDB  <->  MockMarketApi)
    // ---------------------------------------------------------
    async function fetchJson(url, options) {
        const controller = !options?.signal ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), options?.timeoutMs || 8000) : null;
        try {
            const fetchOpts = options ? { ...options } : {};
            delete fetchOpts.timeoutMs;
            if (controller) fetchOpts.signal = controller.signal;
            const res = await fetch(url, fetchOpts);
            if (!res.ok) {
                let msg = 'HTTP ' + res.status;
                try {
                    const body = await res.json();
                    if (body && body.detail) msg = body.detail;
                } catch (_) {
                    // Ignore parse error on non-JSON error page
                }
                throw new Error(msg);
            }
            return res.json();
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    const DataAdapter = {
        async detectBackend() {
            const candidates = [];
            if (window.location.protocol !== 'file:') {
                candidates.push('');
            }
            if (window.location.origin !== 'http://127.0.0.1:8000') {
                candidates.push('http://127.0.0.1:8000');
            }
            if (window.location.origin !== 'http://localhost:8000') {
                candidates.push('http://localhost:8000');
            }

            for (const base of candidates) {
                try {
                    const h = await fetchJson(base + '/api/health', { timeoutMs: 1800 });
                    if (h && h.status === 'ok') {
                        isLiveBackend = true;
                        apiBase = base;
                        healthInfo = h;
                        return true;
                    }
                } catch (_) {
                    // Probe next candidate
                }
            }
            isLiveBackend = false;
            apiBase = '';
            healthInfo = null;
            return false;
        },

        async getMarkets() {
            if (isLiveBackend) {
                return fetchJson(apiBase + '/api/markets');
            }
            return window.MockMarketApi.getApmcYards();
        },

        async getSummary(marketId) {
            if (isLiveBackend) {
                return fetchJson(apiBase + '/api/market/summary?market=' + encodeURIComponent(marketId));
            }
            return window.MockMarketApi.getSummary(marketId);
        },

        async getCommodityPrices(marketId) {
            if (isLiveBackend) {
                return fetchJson(apiBase + '/api/market/prices?market=' + encodeURIComponent(marketId));
            }
            return window.MockMarketApi.getCommodityPrices(marketId);
        },

        async getPriceHistory(marketId, commodityId, days, interval, warmup) {
            const ivl = interval || 'daily';
            const w = warmup != null ? Number(warmup) : 0;
            if (isLiveBackend) {
                return fetchJson(
                    apiBase + '/api/market/history?market=' + encodeURIComponent(marketId) +
                    '&commodity=' + encodeURIComponent(commodityId) +
                    '&days=' + encodeURIComponent(days) +
                    '&interval=' + encodeURIComponent(ivl) +
                    '&warmup=' + encodeURIComponent(w)
                );
            }
            if (window.MockMarketApi && typeof window.MockMarketApi.getOhlcHistory === 'function') {
                return window.MockMarketApi.getOhlcHistory(marketId, commodityId, days, ivl, w);
            }
            const series = await window.MockMarketApi.getPriceHistory(marketId, commodityId, days);
            return {
                series: series || [],
                warmupBars: [],
                varieties: [],
                anchorDate: series && series.length ? series[series.length - 1].date : null,
                interval: ivl
            };
        },

        async getComparison(commodityId) {
            if (isLiveBackend) {
                return fetchJson(apiBase + '/api/market/compare?commodity=' + encodeURIComponent(commodityId));
            }
            return window.MockMarketApi.getCrossMandiComparison(commodityId);
        },

        async getTrends() {
            if (isLiveBackend) {
                return fetchJson(apiBase + '/api/trends');
            }
            return window.MockMarketApi.getStateWideMovers();
        },

        async getMultiYearAnalysis(marketId, commodityId, years, granularity, focusMonth) {
            if (isLiveBackend) {
                const qs = new URLSearchParams({
                    market: String(marketId || 'ALL'),
                    commodity: String(commodityId || 'ONION'),
                    years: String(years != null ? years : 5),
                    granularity: String(granularity || 'annual')
                });
                if (focusMonth !== '' && focusMonth != null) {
                    qs.set('focus_month', String(focusMonth));
                }
                return fetchJson(apiBase + '/api/analysis/multi-year?' + qs.toString(), { timeoutMs: 12000 });
            }
            return window.MockMarketApi.getMultiYearAnalysis(marketId, commodityId, years, granularity, focusMonth);
        },

        async compareAnalysisPeriods(marketId, commodityId, periodA, periodB) {
            if (isLiveBackend) {
                const qs = new URLSearchParams({
                    market: String(marketId || 'ALL'),
                    commodity: String(commodityId || 'ONION'),
                    period_a: String(periodA),
                    period_b: String(periodB)
                });
                return fetchJson(apiBase + '/api/analysis/compare-periods?' + qs.toString(), { timeoutMs: 12000 });
            }
            return window.MockMarketApi.compareAnalysisPeriods(marketId, commodityId, periodA, periodB);
        },

        async listAnalysisReports() {
            if (isLiveBackend) {
                return fetchJson(apiBase + '/api/analysis/reports', { timeoutMs: 8000 });
            }
            return window.MockMarketApi.listAnalysisReports();
        },

        async getAnalysisReport(reportId, market) {
            if (isLiveBackend) {
                const qs = new URLSearchParams({ market: String(market || 'BIDAR') });
                return fetchJson(
                    apiBase + '/api/analysis/report/' + encodeURIComponent(reportId || 'tr1_soyabean_2026') + '?' + qs.toString(),
                    { timeoutMs: 12000 }
                );
            }
            return window.MockMarketApi.getAnalysisReport(reportId || 'tr1_soyabean_2026', market || 'BIDAR');
        },

        async getSyncPlan(lookbackMonths, autoGap) {
            if (!isLiveBackend) return null;
            const qs = new URLSearchParams();
            if (lookbackMonths != null && lookbackMonths !== 'auto') {
                qs.set('lookback_months', String(lookbackMonths));
            }
            if (autoGap !== undefined) {
                qs.set('auto_gap', autoGap ? 'true' : 'false');
            }
            return fetchJson(apiBase + '/api/sync/plan' + (qs.toString() ? '?' + qs.toString() : ''));
        },

        async getSyncStatus() {
            if (!isLiveBackend) return null;
            return fetchJson(apiBase + '/api/sync/status');
        },

        async runKmvahiniSync(options) {
            if (!isLiveBackend) {
                throw new Error('kmvahini 1.2.0 live scrape requires the FastAPI backend server.');
            }
            const opts = options || {};
            const rawLookback = opts.lookbackMonths;
            const lookbackMonths = (rawLookback != null && rawLookback !== 'auto')
                ? Math.max(1, Math.min(Number(rawLookback), 12))
                : null;
            const autoGap = opts.autoGap !== undefined ? Boolean(opts.autoGap) : true;
            const forceRefresh = opts.forceRefresh !== undefined ? Boolean(opts.forceRefresh) : true;
            const forceSameDay = opts.forceSameDay !== undefined ? Boolean(opts.forceSameDay) : false;
            const background = opts.background !== undefined ? Boolean(opts.background) : true;
            return fetchJson(apiBase + '/api/sync/kmvahini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lookback_months: lookbackMonths,
                    auto_gap: autoGap,
                    force_refresh: forceRefresh,
                    force_same_day: forceSameDay,
                    use_cloud_cache: !forceRefresh,
                    workers: 4,
                    background: background
                }),
                timeoutMs: background ? 12000 : 300000
            });
        }
    };

    // ---------------------------------------------------------
    // Header Badge, Subtitle & Clock
    // ---------------------------------------------------------
    function formatMonthShort(yearMonth) {
        if (!yearMonth) return '--';
        const parts = String(yearMonth).split('-');
        if (parts.length < 2) return yearMonth;
        const mNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const mIdx = parseInt(parts[1], 10) - 1;
        return mNames[mIdx] || yearMonth;
    }

    function updateScrapePlanUI() {
        const headerBtn = document.getElementById('btnScrapeLatest');
        const headerIcon = document.getElementById('btnScrapeIcon');
        const headerLabel = document.getElementById('btnScrapeLabel');
        const planMeta = document.getElementById('pipelineSyncPlanMeta');
        const plan = healthInfo && healthInfo.syncPlan;

        if (!isLiveBackend || !healthInfo || !plan) {
            headerBtn?.classList.remove('needs-catchup', 'is-current-today');
            if (headerIcon && !isKmvahiniScraping) {
                headerIcon.className = 'fa-solid fa-cloud-arrow-down av-accent-teal';
            }
            if (headerLabel && !isKmvahiniScraping) {
                headerLabel.textContent = t('btnScrapeLatest');
            }
            if (planMeta) planMeta.textContent = '--';
            return;
        }

        const scrapedToday = Boolean(plan.alreadyScrapedToday);
        headerBtn?.classList.toggle('needs-catchup', Boolean(plan.needsCatchup) && !scrapedToday);
        headerBtn?.classList.toggle('is-current-today', scrapedToday);

        const months = Array.isArray(plan.months) ? plan.months : [];
        const shortWindow = months.length > 1
            ? formatMonthShort(months[0]) + '–' + formatMonthShort(months[months.length - 1])
            : formatMonthShort(months[0] || (plan.endYear + '-' + String(plan.endMonth).padStart(2, '0')));

        if (headerIcon && !isKmvahiniScraping) {
            headerIcon.className = scrapedToday
                ? 'fa-solid fa-circle-check av-bull-text'
                : 'fa-solid fa-cloud-arrow-down av-accent-teal';
        }

        if (headerLabel && !isKmvahiniScraping) {
            if (scrapedToday) {
                headerLabel.textContent = t('btnSyncedToday');
            } else if (lang() === 'kn') {
                headerLabel.textContent = 'ಲೈವ್ ಸ್ಕ್ರೇಪ್ (' + shortWindow + ')';
            } else {
                headerLabel.textContent = 'Scrape (' + shortWindow + ')';
            }
        }

        if (headerBtn) {
            const lastScrapedText = plan.lastScrapedAt || plan.lastScrapedDate || 'Never (CSV seed)';
            const statusText = scrapedToday
                ? 'Last scrape was done today — try again tomorrow!'
                : (plan.needsCatchup
                    ? 'Behind expected T-1 cutoff (' + plan.expectedAvailableDate + ')'
                    : 'Ready for next scrape through ' + plan.expectedAvailableDate);
            headerBtn.setAttribute(
                'title',
                'DB Latest: ' + (plan.dbMaxDate || '--') + ' | ' + statusText +
                ' | Last Scraped: ' + lastScrapedText +
                ' | Next Auto Window: ' + plan.range + ' (' + plan.totalMonthsCount + 'M)'
            );
        }

        if (planMeta) {
            const todayBadge = scrapedToday ? 'Already Scraped Today (Try Tomorrow) • ' : '';
            planMeta.textContent =
                todayBadge +
                'Expected Cutoff (T-1): ' + (plan.expectedAvailableDate || '--') +
                ' | Last Scraped: ' + (plan.lastScrapedAt || 'Never') +
                ' | Auto Window: ' + (plan.range || '--') +
                ' (' + (plan.totalMonthsCount || 0) + 'M: 1 curr + ' + (plan.previousMonthsCount || 0) + ' prev)';
        }
    }

    function updateDataModeBadge() {
        const badge = document.getElementById('dataModeBadge');
        const subtitle = document.getElementById('portalSubtitle');
        const offlineBanner = document.getElementById('mockFallbackBanner');

        if (offlineBanner) {
            offlineBanner.classList.toggle('d-none', isLiveBackend);
        }

        if (badge) {
            if (isLiveBackend && healthInfo) {
                badge.classList.add('live-db');
                const rawRows = Number(healthInfo.rawRows || 0);
                const maxDateTag = healthInfo.maxDate ? (' • ' + String(healthInfo.maxDate)) : '';
                if (lang() === 'kn') {
                    const lakhs = (rawRows / 100000).toFixed(1);
                    badge.textContent = (rawRows >= 100000
                        ? 'ಡಕ್‌ಡಿಬಿ • ' + lakhs + ' ಲಕ್ಷ'
                        : 'ಡಕ್‌ಡಿಬಿ • ' + fmt(rawRows)) + maxDateTag;
                } else {
                    const millions = (rawRows / 1000000).toFixed(2);
                    badge.textContent = (rawRows >= 1000000
                        ? 'DUCKDB • ' + millions + 'M'
                        : 'DUCKDB • ' + fmt(rawRows)) + maxDateTag;
                }
            } else {
                badge.classList.remove('live-db');
                badge.textContent = t('modeMock');
            }
        }

        if (subtitle) {
            subtitle.setAttribute('data-i18n', isLiveBackend ? 'subtitleLive' : 'subtitleMock');
            subtitle.textContent = isLiveBackend ? t('subtitleLive') : t('subtitleMock');
        }

        updateScrapePlanUI();
    }

    function updateHeaderClock() {
        const clockEl = document.getElementById('headerClock');
        if (!clockEl) return;
        const d = new Date();
        clockEl.textContent =
            d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
            ' • ' +
            d.toLocaleTimeString('en-IN', { hour12: false });
    }

    // ---------------------------------------------------------
    // Searchable APMC Combobox & Major Yard Chips
    // ---------------------------------------------------------
    function renderApmcOptions(filterText) {
        const optionsList = document.getElementById('apmcOptionsList');
        if (!optionsList) return;

        const q = (filterText || '').trim().toLowerCase();
        const matches = q
            ? yardsList.filter(y =>
                (y.name && y.name.toLowerCase().includes(q)) ||
                (y.nameKn && y.nameKn.toLowerCase().includes(q)) ||
                (y.shortName && y.shortName.toLowerCase().includes(q)) ||
                (y.shortNameKn && y.shortNameKn.toLowerCase().includes(q)) ||
                (y.district && y.district.toLowerCase().includes(q)) ||
                (y.districtKn && y.districtKn.toLowerCase().includes(q)) ||
                String(y.id).toLowerCase().includes(q)
            )
            : yardsList;

        optionsList.innerHTML = '';
        if (matches.length === 0) {
            const li = document.createElement('li');
            li.className = 'apmc-option-item text-muted';
            li.textContent = t('noYardFound');
            optionsList.appendChild(li);
            return;
        }

        matches.forEach(y => {
            const li = document.createElement('li');
            const isSelected = String(y.id) === String(currentApmc);
            li.className = 'apmc-option-item' + (isSelected ? ' selected' : '');
            li.setAttribute('role', 'option');
            li.setAttribute('data-id', String(y.id));

            const distLabel = getYardDistrictLabel(y);
            const rightBadge = distLabel ? distLabel : ('#' + y.id);

            li.innerHTML =
                '<span>' + esc(getYardPrimaryName(y)) + '</span>' +
                '<span class="apmc-option-id">' + esc(rightBadge) + '</span>';

            li.addEventListener('click', function () {
                selectApmcById(y.id);
                const container = document.getElementById('apmcCombobox');
                const trigger = document.getElementById('apmcTrigger');
                container?.classList.remove('open');
                trigger?.setAttribute('aria-expanded', 'false');
            });
            optionsList.appendChild(li);
        });
    }

    function initApmcCombobox() {
        const container = document.getElementById('apmcCombobox');
        const trigger = document.getElementById('apmcTrigger');
        const triggerText = document.getElementById('apmcTriggerText');
        const searchInput = document.getElementById('apmcSearchInput');
        const optionsList = document.getElementById('apmcOptionsList');

        if (!container || !trigger || !optionsList) return;

        function openDropdown() {
            container.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
            renderApmcOptions(searchInput?.value || '');
            setTimeout(() => {
                searchInput?.focus();
                searchInput?.select();
            }, 20);
        }

        function closeDropdown() {
            container.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
        }

        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            if (container.classList.contains('open')) closeDropdown();
            else openDropdown();
        });

        searchInput?.addEventListener('input', function () {
            renderApmcOptions(searchInput.value);
        });

        searchInput?.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeDropdown();
                trigger.focus();
            } else if (e.key === 'Enter') {
                const first = optionsList.querySelector('.apmc-option-item[data-id]');
                if (first) {
                    const rawId = first.getAttribute('data-id');
                    const matched = yardsList.find(y => String(y.id) === String(rawId));
                    selectApmcById(matched ? matched.id : rawId);
                    closeDropdown();
                }
            }
        });

        document.addEventListener('click', function (e) {
            if (!container.contains(e.target)) {
                closeDropdown();
            }
        });

        // Pick default yard cleanly across Live & Mock modes
        const preferred = yardsList.find(y => String(y.id) === String(currentApmc))
            || yardsList.find(y => y.id === 'BENGALURU' || y.id === 32)
            || yardsList[0];

        if (preferred) {
            currentApmc = preferred.id;
            if (triggerText) triggerText.textContent = getYardPrimaryName(preferred);
        }
        renderApmcOptions('');
    }

    function renderQuickMandiChips() {
        const bar = document.getElementById('quickMandiBar');
        if (!bar) return;

        // Remove previous chips while preserving #quickMandiTitle
        bar.querySelectorAll('.mandi-chip').forEach(ch => ch.remove());

        MAJOR_YARD_CODES.forEach(code => {
            const targetId = isLiveBackend ? code : (MOCK_ID_BY_CODE[code] || code);
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'mandi-chip' + (String(targetId) === String(currentApmc) ? ' active' : '');
            chip.setAttribute('data-apmc-id', String(targetId));
            chip.setAttribute('data-code', code);
            chip.textContent = window.I18N ? window.I18N.majorYardLabel(code) : code;
            chip.addEventListener('click', function () {
                selectApmcById(targetId);
            });
            bar.appendChild(chip);
        });
    }

    function syncApmcSelectionUI(apmcId) {
        const yard = yardsList.find(y => String(y.id) === String(apmcId));
        const triggerText = document.getElementById('apmcTriggerText');
        if (triggerText && yard) {
            triggerText.textContent = getYardPrimaryName(yard);
        }
        const tickerYard = document.getElementById('tickerYardBadge');
        if (tickerYard && yard) {
            tickerYard.textContent = getYardPrimaryName(yard);
        }

        document.querySelectorAll('.mandi-chip').forEach(chip => {
            const chipId = chip.getAttribute('data-apmc-id');
            chip.classList.toggle('active', String(chipId) === String(apmcId));
        });

        renderApmcOptions(document.getElementById('apmcSearchInput')?.value || '');
    }

    function resetCommodityFilters(options) {
        const opts = options || {};
        const clearSearch = opts.clearSearch !== undefined ? Boolean(opts.clearSearch) : true;
        activeCategory = 'all';
        activeScreener = 'all';
        const txtSearch = document.getElementById('txtSearch');
        if (clearSearch && txtSearch) txtSearch.value = '';

        document.querySelectorAll('#categoryBar .cat-tag').forEach(el => {
            el.classList.toggle('active', el.getAttribute('data-group') === 'all');
        });
        document.querySelectorAll('.screener-pill').forEach(el => {
            el.classList.toggle('active', el.getAttribute('data-screener') === 'all');
        });
    }

    function clearAllQueryFilters() {
        resetCommodityFilters();
        filterCommodities({ syncHero: true, preferTopRanked: true, immediateChart: true });
    }

    function showSyncToast(msg, isOffline, persist) {
        const toast = document.getElementById('syncStatusToast');
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.remove('d-none', 'is-offline');
        if (isOffline) toast.classList.add('is-offline');
        if (syncToastTimer) clearTimeout(syncToastTimer);
        if (!persist) {
            syncToastTimer = setTimeout(() => {
                toast.classList.add('d-none');
            }, 6500);
        }
    }

    function selectApmcById(apmcId, preferredCommodityId) {
        if (apmcId == null || apmcId === '') return;
        const matched = yardsList.find(y => String(y.id) === String(apmcId));
        currentApmc = matched ? matched.id : apmcId;
        selectedCommodityId = preferredCommodityId || '';
        const existingSearch = (document.getElementById('txtSearch')?.value || '').trim();
        pendingYardSwitchSearchCheck = !preferredCommodityId && existingSearch.length > 0;
        resetCommodityFilters({ clearSearch: Boolean(preferredCommodityId) });
        syncApmcSelectionUI(currentApmc);
        loadMarket(false);
    }

    async function handleManualSync() {
        const wasLive = isLiveBackend;
        const prevYard = yardsList.find(y => String(y.id) === String(currentApmc));
        const refreshIcon = document.getElementById('btnRefreshIcon');
        if (refreshIcon) refreshIcon.classList.add('fa-spin');

        try {
            await DataAdapter.detectBackend();
            updateDataModeBadge();

            if (!wasLive && isLiveBackend) {
                yardsList = await DataAdapter.getMarkets();
                const yardHint = prevYard ? String(prevYard.name || '').replace(/^APMC,?\s*/i, '').trim().toUpperCase() : '';
                const matchedLive = (yardHint && yardsList.find(y => String(y.id).toUpperCase() === yardHint || String(y.name || '').toUpperCase().includes(yardHint)))
                    || yardsList.find(y => y.id === 'BENGALURU')
                    || yardsList[0];
                if (matchedLive) currentApmc = matchedLive.id;
                renderQuickMandiChips();
                syncApmcSelectionUI(currentApmc);
                analysisState.initialized = false;
                reportState.initialized = false;
                if (activeWorkspaceTab === 'analysis') {
                    if (reportState.subView === 'report') initAnalysisReportTab();
                    else initAnalysisTab(true);
                }
            }

            await loadMarket(false);

            if (isLiveBackend) {
                const yardLabel = getSummaryApmcName(currentSummary);
                const latestDt = currentSummary && currentSummary.marketDate ? String(currentSummary.marketDate).split('T')[0] : '--';
                const expDt = healthInfo && healthInfo.expectedAvailableDate ? healthInfo.expectedAvailableDate : 'latest';
                const scrapeHint = (healthInfo && healthInfo.syncPlan && healthInfo.syncPlan.alreadyScrapedToday)
                    ? ' — already scraped today (try tomorrow)'
                    : ((healthInfo && healthInfo.needsCatchup)
                        ? ' — click Scrape to fetch through ' + expDt + ' via kmvahini'
                        : ' — DB current through ' + (healthInfo?.maxDate || latestDt));
                showSyncToast(
                    'DuckDB Refreshed • ' + yardLabel + ': ' + allCommodities.length +
                    ' commodities loaded (yard latest ' + latestDt + scrapeHint + ')',
                    false
                );
            } else {
                showSyncToast(
                    'Offline Mockup Mode • Backend at http://127.0.0.1:8000 not reachable (preview values unchanged; start uvicorn to view all real market commodities)',
                    true
                );
            }
        } finally {
            setTimeout(() => {
                if (refreshIcon) refreshIcon.classList.remove('fa-spin');
            }, 260);
        }
    }

    // ---------------------------------------------------------
    // Market Data Orchestrator
    // ---------------------------------------------------------
    async function loadMarket(simulateTick) {
        if (!currentApmc) return;

        const refreshIcon = document.getElementById('btnRefreshIcon');
        if (refreshIcon) refreshIcon.classList.add('fa-spin');

        try {
            if (!isLiveBackend && simulateTick && window.MockMarketApi) {
                window.MockMarketApi.simulateLiveTick(currentApmc);
            }

            const [summary, commodities] = await Promise.all([
                DataAdapter.getSummary(currentApmc),
                DataAdapter.getCommodityPrices(currentApmc)
            ]);

            renderSummary(summary);
            await renderCommoditiesPayload(commodities);
        } catch (err) {
            console.error('loadMarket failed:', err);
        } finally {
            setTimeout(() => {
                if (refreshIcon) refreshIcon.classList.remove('fa-spin');
            }, 260);
        }
    }

    function renderSummary(s) {
        currentSummary = s;
        const arrivalsEl = document.getElementById('kpiArrivals');
        const deltaEl = document.getElementById('kpiArrivalsDelta');
        const sessionDateEl = document.getElementById('kpiSessionDate');
        const heroApmcEl = document.getElementById('heroApmcName');
        const tickerYardEl = document.getElementById('tickerYardBadge');

        if (!s || !s.hasData) {
            if (arrivalsEl) arrivalsEl.textContent = '0';
            if (deltaEl) {
                deltaEl.className = 'av-text-muted fw-bold';
                deltaEl.textContent = t('noArrivalsRecorded');
            }
            if (sessionDateEl) sessionDateEl.textContent = t('sessionPrefix') + ' --';
            if (heroApmcEl) heroApmcEl.textContent = getSummaryApmcName(s);
            if (tickerYardEl) tickerYardEl.textContent = getSummaryApmcName(s);
            updateWorkspaceContextPills();
            return;
        }

        if (arrivalsEl) arrivalsEl.textContent = fmt(s.totalArrivals);
        if (heroApmcEl) heroApmcEl.textContent = getSummaryApmcName(s);
        if (tickerYardEl) tickerYardEl.textContent = getSummaryApmcName(s);

        const marketDateStr = s.marketDate ? String(s.marketDate).split('T')[0] : '--';
        if (sessionDateEl) sessionDateEl.textContent = t('sessionPrefix') + ' ' + marketDateStr;

        if (deltaEl) {
            if (s.arrivalsVsYesterday != null) {
                const isUp = Boolean(s.arrivalsRising);
                deltaEl.className = isUp ? 'av-bull-text fw-bold' : 'av-bear-text fw-bold';
                deltaEl.textContent = (isUp ? '▲ +' : '▼ -') + Math.abs(s.arrivalsVsYesterday).toFixed(1) + '% ' + t('vsPriorSession');
            } else {
                deltaEl.className = 'av-bull-text fw-bold';
                deltaEl.textContent = t('activeMandiSession');
            }
        }
        updateWorkspaceContextPills();
    }

    async function renderCommoditiesPayload(list) {
        allCommodities = list || [];

        updateMarketMetrics(allCommodities);
        let filtered = filterCommodities({ syncHero: false });

        const rawSearch = (document.getElementById('txtSearch')?.value || '').trim();
        if (pendingYardSwitchSearchCheck) {
            pendingYardSwitchSearchCheck = false;
            if (rawSearch && allCommodities.length > 0 && filtered.length === 0) {
                const yardLabel = getSummaryApmcName(currentSummary);
                resetCommodityFilters();
                filtered = filterCommodities({ syncHero: false });
                showSyncToast(
                    '"' + rawSearch + '" not traded in ' + yardLabel +
                    ' — cleared search to show all ' + allCommodities.length + ' commodities.',
                    false
                );
            }
        }

        if (filtered.length > 0) {
            const found = filtered.find(c => String(c.commodityId) === String(selectedCommodityId));
            await selectCommodityForChart(found || filtered[0]);
        } else {
            clearHeroTerminal();
        }
    }

    // ---------------------------------------------------------
    // Market Breadth, Top Gainer & Top Loser
    // ---------------------------------------------------------
    function updateMarketMetrics(items) {
        let upCount = 0;
        let downCount = 0;
        let flatCount = 0;
        let topGainer = null;
        let topLoser = null;

        items.forEach(c => {
            const pct = c.changePercent;
            if (pct != null && pct > 0.4) {
                upCount++;
                if (!topGainer || pct > (topGainer.changePercent || 0)) topGainer = c;
            } else if (pct != null && pct < -0.4) {
                downCount++;
                if (!topLoser || pct < (topLoser.changePercent || 0)) topLoser = c;
            } else {
                flatCount++;
            }
        });

        const total = items.length || 1;
        const upPct = Math.round((upCount / total) * 100);
        const downPct = Math.round((downCount / total) * 100);
        const flatPct = Math.max(0, 100 - upPct - downPct);

        const bSummary = document.getElementById('breadthSummary');
        if (bSummary) bSummary.textContent = upCount + ' ' + t('up') + ' / ' + downCount + ' ' + t('down');

        const upBar = document.getElementById('breadthUpBar');
        const downBar = document.getElementById('breadthDownBar');
        const neutralBar = document.getElementById('breadthNeutralBar');
        if (upBar) upBar.style.width = upPct + '%';
        if (downBar) downBar.style.width = downPct + '%';
        if (neutralBar) neutralBar.style.width = flatPct + '%';

        const countUpEl = document.getElementById('countUp');
        const countDownEl = document.getElementById('countDown');
        const countNeutralEl = document.getElementById('countNeutral');
        if (countUpEl) countUpEl.textContent = '▲ ' + upCount + ' ' + t('up');
        if (countDownEl) countDownEl.textContent = '▼ ' + downCount + ' ' + t('down');
        if (countNeutralEl) countNeutralEl.textContent = '● ' + flatCount + ' ' + t('flat');

        const tgName = document.getElementById('kpiTopGainerName');
        const tgDelta = document.getElementById('kpiTopGainerDelta');
        if (tgName && tgDelta) {
            if (topGainer) {
                tgName.textContent = getCommodityPrimaryName(topGainer);
                tgDelta.textContent = '+' + (topGainer.changePercent || 0).toFixed(1) + '% (₹' + fmt(topGainer.currentPrice) + ')';
            } else {
                tgName.textContent = '--';
                tgDelta.textContent = t('noGainersYet');
            }
        }

        const tlName = document.getElementById('kpiTopLoserName');
        const tlDelta = document.getElementById('kpiTopLoserDelta');
        if (tlName && tlDelta) {
            if (topLoser) {
                tlName.textContent = getCommodityPrimaryName(topLoser);
                tlDelta.textContent = (topLoser.changePercent || 0).toFixed(1) + '% (₹' + fmt(topLoser.currentPrice) + ')';
            } else {
                tlName.textContent = '--';
                tlDelta.textContent = t('noPriceDrops');
            }
        }

        const allCntEl = document.getElementById('screenerAllCount');
        const gainCntEl = document.getElementById('screenerGainerCount');
        const loseCntEl = document.getElementById('screenerLoserCount');
        if (allCntEl) allCntEl.textContent = String(items.length);
        if (gainCntEl) gainCntEl.textContent = String(upCount);
        if (loseCntEl) loseCntEl.textContent = String(downCount);
    }

    // ---------------------------------------------------------
    // Live Streaming Ticker Tape
    // ---------------------------------------------------------
    function populateTickerTape(items) {
        const track = document.getElementById('tickerTrack');
        if (!track) return;

        if (!items || !items.length) {
            track.innerHTML = '<span class="small fst-italic av-ticker-placeholder">' + esc(t('noRecordsSession')) + '</span>';
            return;
        }

        // Duplicate items for seamless infinite CSS scroll
        const displayList = items.concat(items);
        let html = '';

        displayList.forEach(c => {
            const pct = c.changePercent;
            const pillCls = pct != null && pct > 0.4 ? 'ticker-pill-up' : (pct != null && pct < -0.4 ? 'ticker-pill-down' : 'ticker-pill-stable');
            const arrow = pct != null && pct > 0.4 ? '▲ +' : (pct != null && pct < -0.4 ? '▼ ' : '● ');
            const deltaText = pct != null ? arrow + pct.toFixed(1) + '%' : '● ' + t('stable');

            html +=
                '<div class="ticker-item" data-cid="' + esc(String(c.commodityId)) + '">' +
                    '<span>' + getCommodityEmoji(c.commodityName || c.commodityId) + '</span>' +
                    '<span class="ticker-name">' + esc(getCommodityPrimaryName(c)) + '</span>' +
                    '<span class="ticker-price">₹' + fmt(c.currentPrice) + '</span>' +
                    '<span class="' + pillCls + '">' + esc(deltaText) + '</span>' +
                '</div>';
        });

        track.innerHTML = html;
        track.querySelectorAll('.ticker-item').forEach(el => {
            el.addEventListener('click', function () {
                onTickerClick(el.getAttribute('data-cid'));
            });
        });
    }

    function onTickerClick(commodityId) {
        const found = allCommodities.find(c => String(c.commodityId) === String(commodityId));
        if (found) {
            if (activeWorkspaceTab !== 'terminal') switchWorkspaceTab('terminal');
            selectCommodityForChart(found);
            document.getElementById('terminalHeroSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // ---------------------------------------------------------
    // Watchlist Filtering, Sorting, Cards & Depth Table
    // ---------------------------------------------------------
    function renderQueryMatchBar(filtered, rawSearchTxt) {
        const summaryEl = document.getElementById('queryFilterSummary');
        const chipsWrap = document.getElementById('queryMatchChips');
        const clearBtn = document.getElementById('btnClearQueryFilters');
        const sortSelect = document.getElementById('sortSelect');

        const isFiltered = Boolean(rawSearchTxt || activeCategory !== 'all' || activeScreener !== 'all');
        if (clearBtn) {
            clearBtn.classList.toggle('d-none', !isFiltered);
        }

        if (summaryEl) {
            const total = allCommodities.length;
            const sortOpt = sortSelect && sortSelect.selectedIndex >= 0
                ? sortSelect.options[sortSelect.selectedIndex].textContent.trim()
                : '';
            const countText = isFiltered
                ? t('showingLabel') + ' ' + filtered.length + ' ' + t('ofLabel') + ' ' + total
                : t('showingLabel') + ' ' + filtered.length + ' ' + t('commoditiesWord');
            const parts = [countText];
            if (rawSearchTxt) parts.push('"' + rawSearchTxt + '"');
            if (sortOpt) parts.push(sortOpt);
            summaryEl.textContent = parts.join(' • ');
        }

        if (!chipsWrap) return;
        chipsWrap.innerHTML = '';

        if (!filtered.length) {
            if (allCommodities.length > 0) {
                const emptyNote = document.createElement('span');
                emptyNote.className = 'av-accent-warm small fst-italic fw-semibold';
                emptyNote.textContent = t('noMatchesChip');
                chipsWrap.appendChild(emptyNote);
            }
            return;
        }

        filtered.slice(0, 12).forEach(c => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'query-match-chip' + (String(c.commodityId) === String(selectedCommodityId) ? ' active' : '');
            chip.setAttribute('data-cid', String(c.commodityId));
            chip.innerHTML =
                '<span class="av-match-name-wrap">' +
                    '<span>' + getCommodityEmoji(c.commodityName || c.commodityId) + '</span>' +
                    '<span class="text-truncate">' + esc(getCommodityPrimaryName(c)) + '</span>' +
                '</span>' +
                '<span class="query-match-chip-price">₹' + fmt(c.currentPrice) + '</span>';
            chip.addEventListener('click', () => {
                selectCommodityForChart(c);
                document.getElementById('terminalHeroSection')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
            chipsWrap.appendChild(chip);
        });
    }

    function filterCommodities(options) {
        const opts = options || {};
        const syncHero = Boolean(opts.syncHero);
        const preferTopRanked = Boolean(opts.preferTopRanked);
        const immediateChart = opts.immediateChart !== undefined ? Boolean(opts.immediateChart) : true;

        const rawSearchTxt = (document.getElementById('txtSearch')?.value || '').trim();
        const searchTxt = rawSearchTxt.toLowerCase();
        const sortVal = document.getElementById('sortSelect')?.value || 'name';

        const filtered = allCommodities.filter(c => {
            const matchesCat =
                activeCategory === 'all' ||
                (c.groupName && c.groupName.toLowerCase().includes(activeCategory.toLowerCase()));

            let matchesScreener = true;
            if (activeScreener === 'gainers') matchesScreener = c.changePercent != null && c.changePercent > 0.4;
            else if (activeScreener === 'losers') matchesScreener = c.changePercent != null && c.changePercent < -0.4;
            else if (activeScreener === 'volume') matchesScreener = c.arrival != null && c.arrival > 0;

            const aliasStr = [
                c.searchAliases || '',
                COMMODITY_SEARCH_ALIASES[String(c.commodityId || '').toUpperCase()] || '',
                /soy/i.test(c.commodityName || '') ? 'soyabean soyabeen soybean' : ''
            ].join(' ').toLowerCase();

            const matchesSearch =
                !searchTxt ||
                (c.commodityName && c.commodityName.toLowerCase().includes(searchTxt)) ||
                (c.commodityKannada && c.commodityKannada.toLowerCase().includes(searchTxt)) ||
                (c.commodityId && String(c.commodityId).toLowerCase().includes(searchTxt)) ||
                (c.groupName && c.groupName.toLowerCase().includes(searchTxt)) ||
                (c.groupNameKn && c.groupNameKn.toLowerCase().includes(searchTxt)) ||
                aliasStr.includes(searchTxt);

            return matchesCat && matchesScreener && matchesSearch;
        });

        filtered.sort((a, b) => {
            if (sortVal === 'gainer') return (b.changePercent ?? -9999) - (a.changePercent ?? -9999);
            if (sortVal === 'loser') return (a.changePercent ?? 9999) - (b.changePercent ?? 9999);
            if (sortVal === 'arrival_desc') return (b.arrival || 0) - (a.arrival || 0);
            if (sortVal === 'price_desc') return (b.currentPrice || 0) - (a.currentPrice || 0);
            if (sortVal === 'price_asc') return (a.currentPrice || 0) - (b.currentPrice || 0);
            if (sortVal === 'name') {
                return getCommodityPrimaryName(a).localeCompare(getCommodityPrimaryName(b));
            }
            return 0;
        });

        let targetHero = null;
        if (filtered.length > 0) {
            if (preferTopRanked) {
                targetHero = filtered[0];
            } else {
                targetHero = filtered.find(c => String(c.commodityId) === String(selectedCommodityId)) || filtered[0];
            }
        }

        if (syncHero) {
            if (targetHero) {
                selectedCommodityId = targetHero.commodityId;
            } else {
                selectedCommodityId = '';
            }
        }

        renderGrid(filtered);
        renderTable(filtered);
        populateTickerTape(filtered);
        renderQueryMatchBar(filtered, rawSearchTxt);

        const emptyBox = document.getElementById('emptyStateBox');
        const gridBox = document.getElementById('comGrid');
        const tableWrap = document.getElementById('comTableWrap');

        if (!filtered.length) {
            emptyBox?.classList.remove('d-none');
            gridBox?.classList.add('d-none');
            tableWrap?.classList.add('d-none');
        } else {
            emptyBox?.classList.add('d-none');
            if (currentViewMode === 'cards') {
                gridBox?.classList.remove('d-none');
                tableWrap?.classList.add('d-none');
            } else {
                gridBox?.classList.add('d-none');
                tableWrap?.classList.remove('d-none');
            }
        }

        if (syncHero) {
            if (targetHero) {
                if (immediateChart) {
                    selectCommodityForChart(targetHero);
                } else {
                    renderHeroCommodityDetails(targetHero);
                    if (searchHeroDebounceTimer) clearTimeout(searchHeroDebounceTimer);
                    searchHeroDebounceTimer = setTimeout(() => {
                        loadChartForCommodity(targetHero);
                    }, 90);
                }
            } else {
                clearHeroTerminal();
            }
        }

        return filtered;
    }

    function renderGrid(items) {
        const g = document.getElementById('comGrid');
        if (!g) return;
        g.innerHTML = '';

        const fallbackDate = currentSummary && currentSummary.marketDate
            ? String(currentSummary.marketDate).split('T')[0]
            : '';

        items.forEach(c => {
            const card = document.createElement('div');
            card.className = 'stock-item-card' + (String(c.commodityId) === String(selectedCommodityId) ? ' active-asset' : '');
            card.setAttribute('data-id', String(c.commodityId));
            card.addEventListener('click', () => {
                selectCommodityForChart(c);
                document.getElementById('terminalHeroSection')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });

            const pct = c.changePercent;
            const deltaCls = pct != null && pct > 0.4 ? 'up' : (pct != null && pct < -0.4 ? 'down' : 'stable');
            const arrow = pct != null && pct > 0.4 ? '▲ +' : (pct != null && pct < -0.4 ? '▼ ' : '● ');
            const deltaText = pct != null ? arrow + pct.toFixed(1) + '%' : '● ' + t('stable');

            const minP = c.minPrice || c.currentPrice || 0;
            const maxP = c.maxPrice || c.currentPrice || 0;
            const curP = c.currentPrice || minP;
            const rangeSpan = maxP - minP;
            const pinPos = rangeSpan > 0 ? Math.min(Math.max(((curP - minP) / rangeSpan) * 100, 5), 95) : 50;

            const primaryName = getCommodityPrimaryName(c);
            const secondaryName = getCommoditySecondaryName(c);
            const grpLabel = getCommodityGroupLabel(c) || 'Crop';
            const tradedDate = c.lastTradedDate || fallbackDate;

            card.innerHTML =
                '<div class="item-hdr">' +
                    '<div class="d-flex align-items-center" style="min-width:0; flex:1;">' +
                        '<div class="item-icon-box">' + getCommodityEmoji(c.commodityName || c.commodityId) + '</div>' +
                        '<div class="item-title-box">' +
                            '<div class="item-name">' + esc(primaryName) + '</div>' +
                            '<div class="item-group">' + esc(grpLabel) + (secondaryName ? ' • ' + esc(secondaryName) : '') + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<span class="mini-delta-pill ' + deltaCls + '">' + esc(deltaText) + '</span>' +
                '</div>' +
                '<div class="item-price-box">' +
                    '<div class="d-flex align-items-center justify-content-between gap-2 mb-1">' +
                        '<div class="item-price-label mb-0">' + esc(t('modalRateLabel')) + '</div>' +
                        (tradedDate ? '<span class="date-badge-mini">' + esc(tradedDate) + '</span>' : '') +
                    '</div>' +
                    '<div class="item-price-val">₹' + fmt(c.currentPrice) + '<small> / ' + esc(t('qtlShort')) + '</small></div>' +
                '</div>' +
                '<div class="item-range-bar-wrap">' +
                    '<div class="item-range-text">' +
                        '<span>' + esc(t('lowPrefix')) + ' ₹' + fmt(minP) + '</span>' +
                        '<span>' + esc(t('highPrefix')) + ' ₹' + fmt(maxP) + '</span>' +
                    '</div>' +
                    '<div class="item-range-track">' +
                        '<div class="item-range-fill" style="width:100%;"></div>' +
                        '<div class="item-range-pin" style="left:' + pinPos + '%;"></div>' +
                    '</div>' +
                '</div>' +
                '<div class="item-footer">' +
                    '<span><i class="fa-solid fa-boxes-stacked me-1"></i>' + esc(t('volPrefix')) + ' <strong>' + fmt(c.arrival) + ' ' + esc(t('qtlShort')) + '</strong></span>' +
                    '<span class="av-accent-primary fw-bold">' + esc(t('liveChartArrow')) + '</span>' +
                '</div>';

            g.appendChild(card);
        });
    }

    function renderTable(items) {
        const tbody = document.getElementById('comTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const fallbackDate = currentSummary && currentSummary.marketDate
            ? String(currentSummary.marketDate).split('T')[0]
            : '--';

        items.forEach(c => {
            const tr = document.createElement('tr');
            tr.className = String(c.commodityId) === String(selectedCommodityId) ? 'active-asset-row' : '';
            tr.setAttribute('data-id', String(c.commodityId));
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', () => {
                selectCommodityForChart(c);
                document.getElementById('terminalHeroSection')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });

            const pct = c.changePercent;
            const deltaCls = pct != null && pct > 0.4 ? 'up' : (pct != null && pct < -0.4 ? 'down' : 'stable');
            const arrow = pct != null && pct > 0.4 ? '▲ +' : (pct != null && pct < -0.4 ? '▼ ' : '● ');
            const deltaText = pct != null ? arrow + pct.toFixed(1) + '%' : '● ' + t('stable');

            const primaryName = getCommodityPrimaryName(c);
            const secondaryName = getCommoditySecondaryName(c);
            const grpLabel = getCommodityGroupLabel(c) || '-';
            const tradedDate = c.lastTradedDate || fallbackDate;

            tr.innerHTML =
                '<td>' +
                    '<div class="d-flex align-items-center gap-2">' +
                        '<span class="fs-5">' + getCommodityEmoji(c.commodityName || c.commodityId) + '</span>' +
                        '<div>' +
                            '<div class="fw-bold av-text-strong">' + esc(primaryName) + '</div>' +
                            (secondaryName ? '<div class="av-text-muted small">' + esc(secondaryName) + '</div>' : '') +
                        '</div>' +
                    '</div>' +
                '</td>' +
                '<td><span class="badge av-surface-badge">' + esc(grpLabel) + '</span></td>' +
                '<td><span class="mini-delta-pill ' + deltaCls + '">' + esc(deltaText) + '</span></td>' +
                '<td><span class="fs-6 fw-bold av-text-strong font-monospace">₹' + fmt(c.currentPrice) + '</span></td>' +
                '<td><span class="av-bear-text font-monospace fw-semibold">₹' + fmt(c.minPrice) + '</span></td>' +
                '<td><span class="av-bull-text font-monospace fw-semibold">₹' + fmt(c.maxPrice) + '</span></td>' +
                '<td><strong class="av-text-strong font-monospace">' + fmt(c.arrival) + '</strong> <small class="av-text-muted">' + esc(t('qtlShort')) + '</small></td>' +
                '<td><span class="date-badge-mini">' + esc(tradedDate) + '</span></td>' +
                '<td class="text-end">' +
                    '<button type="button" class="btn btn-sm av-btn-outline-primary py-1 px-2 btn-analyze-row">' + esc(t('analyzeArrow')) + '</button>' +
                '</td>';

            tr.querySelector('.btn-analyze-row').addEventListener('click', function (e) {
                e.stopPropagation();
                openCommodityAnalyticsModal(c);
            });

            tbody.appendChild(tr);
        });
    }

    // ---------------------------------------------------------
    // Hero Terminal & Chart.js Financial Graph
    // ---------------------------------------------------------
    function renderHeroCommodityDetails(commodity) {
        if (!commodity) return;
        selectedCommodityId = commodity.commodityId;

        document.querySelectorAll('.stock-item-card').forEach(c => {
            const id = c.getAttribute('data-id');
            c.classList.toggle('active-asset', String(id) === String(commodity.commodityId));
        });
        document.querySelectorAll('#comTableBody tr[data-id]').forEach(tr => {
            const id = tr.getAttribute('data-id');
            tr.classList.toggle('active-asset-row', String(id) === String(commodity.commodityId));
        });
        document.querySelectorAll('.query-match-chip').forEach(chip => {
            const id = chip.getAttribute('data-cid');
            chip.classList.toggle('active', String(id) === String(commodity.commodityId));
        });

        const primaryName = getCommodityPrimaryName(commodity);
        const secondaryName = getCommoditySecondaryName(commodity);
        const grpLabel = getCommodityGroupLabel(commodity) || 'Commodity';

        document.getElementById('heroAssetIcon').textContent = getCommodityEmoji(commodity.commodityName || commodity.commodityId);
        document.getElementById('heroAssetName').textContent = primaryName;
        document.getElementById('heroAssetKannada').textContent = secondaryName ? '(' + secondaryName + ')' : '';
        document.getElementById('heroAssetGroup').textContent = lang() === 'kn' ? grpLabel : grpLabel.toUpperCase();
        document.getElementById('heroApmcName').textContent = getSummaryApmcName(currentSummary);
        document.getElementById('chartWatermark').textContent = (commodity.commodityName || String(commodity.commodityId)).toUpperCase();

        const sessionMetaEl = document.getElementById('heroSessionMeta');
        if (sessionMetaEl) {
            const parts = [];
            const dt = commodity.lastTradedDate || (currentSummary && currentSummary.marketDate ? String(currentSummary.marketDate).split('T')[0] : null);
            if (dt) parts.push(dt);
            if (commodity.varietyCount && commodity.varietyCount > 1) {
                parts.push(commodity.varietyCount + (lang() === 'kn' ? ' ತಳಿಗಳು' : ' varieties'));
            }
            sessionMetaEl.textContent = parts.length ? parts.join(' • ') : t('activeMandiSession');
        }

        const price = commodity.currentPrice || 0;
        document.getElementById('heroPrice').textContent = '₹' + fmt(price);
        document.getElementById('heroKgPrice').textContent =
            t('equivPrefix') + ' ₹' + (price > 0 ? (price / 100).toFixed(2) : '--') + ' ' + t('perKg');

        const pct = commodity.changePercent;
        const pill = document.getElementById('heroDeltaPill');
        if (pill) {
            const deltaCls = pct != null && pct > 0.4 ? 'up' : (pct != null && pct < -0.4 ? 'down' : 'stable');
            const arrow = pct != null && pct > 0.4 ? '▲ +' : (pct != null && pct < -0.4 ? '▼ ' : '● ');
            const chgVal = commodity.changeValue
                ? (commodity.changeValue > 0 ? '+₹' + fmt(commodity.changeValue) : '-₹' + fmt(Math.abs(commodity.changeValue)))
                : '';
            const deltaText = pct != null
                ? arrow + (chgVal ? chgVal + ' (' + pct.toFixed(2) + '%)' : pct.toFixed(2) + '%') + ' ' + t('todaySuffix')
                : '● ' + t('sessionStable');
            pill.className = 'delta-pill ' + deltaCls;
            pill.textContent = deltaText;
        }

        const minP = commodity.minPrice != null ? commodity.minPrice : price;
        const maxP = commodity.maxPrice != null ? commodity.maxPrice : price;
        const spread = maxP - minP;

        document.getElementById('heroDayLow').textContent = '₹' + fmt(minP);
        document.getElementById('heroDayModal').textContent = '₹' + fmt(price);
        document.getElementById('heroDayHigh').textContent = '₹' + fmt(maxP);
        document.getElementById('heroDaySpread').textContent = '₹' + fmt(spread) + (price > 0 ? ' (' + ((spread / price) * 100).toFixed(1) + '%)' : '');
        document.getElementById('heroPrevPrice').textContent = commodity.previousPrice ? '₹' + fmt(commodity.previousPrice) : '₹' + fmt(price);
        document.getElementById('heroVolume').textContent = fmt(commodity.arrival) + ' ' + t('qtlShort');
        updateWorkspaceContextPills();
    }

    async function selectCommodityForChart(commodity) {
        if (!commodity) return;
        renderHeroCommodityDetails(commodity);
        await loadChartForCommodity(commodity);
    }

    function renderTASignalsStrip(signals, barCount) {
        const strip = document.getElementById('taSignalsStrip');
        if (!strip) return;
        strip.innerHTML = '';

        const badges = [];
        const sig = signals || {};
        const isKn = lang() === 'kn';

        if (sig.trendVsSma20Pct != null) {
            const p = Number(sig.trendVsSma20Pct);
            badges.push({
                cls: p >= 0 ? 'bull' : 'bear',
                text: (isKn ? 'SMA20 ಕ್ಕಿಂತ ' : 'vs SMA20: ') + (p >= 0 ? '+' : '') + p.toFixed(1) + '%'
            });
        }
        if (sig.crossState === 'golden') {
            badges.push({
                cls: 'bull',
                text: isKn ? 'ಗೋಲ್ಡನ್ ಕ್ರಾಸ್ (20>50)' : 'Golden Cross (20>50)'
            });
        } else if (sig.crossState === 'death') {
            badges.push({
                cls: 'bear',
                text: isKn ? 'ಡೆತ್ ಕ್ರಾಸ್ (20<50)' : 'Death Cross (20<50)'
            });
        }
        if (sig.latestRsi != null) {
            const r = Number(sig.latestRsi);
            const zone = sig.rsiZone === 'overbought'
                ? (isKn ? ' ಅಧಿಕ ಖರೀದಿ' : ' Overbought')
                : (sig.rsiZone === 'oversold' ? (isKn ? ' ಅಧಿಕ ಮಾರಾಟ' : ' Oversold') : '');
            badges.push({
                cls: sig.rsiZone === 'overbought' ? 'bear' : (sig.rsiZone === 'oversold' ? 'bull' : ''),
                text: 'RSI(14): ' + r.toFixed(1) + zone
            });
        }
        if (sig.volSurgePct != null) {
            const v = Number(sig.volSurgePct);
            badges.push({
                cls: v >= 20 ? 'bull' : (v <= -20 ? 'bear' : ''),
                text: (isKn ? 'ಆವಕ: ' : 'Vol: ') + (v >= 0 ? '+' : '') + v.toFixed(0) + (isKn ? '% (20Avg)' : '% vs 20Avg')
            });
        }
        if (!badges.length && barCount > 0) {
            badges.push({
                cls: '',
                text: (isKn ? 'ದಾಖಲೆಗಳು: ' : 'Bars: ') + barCount
            });
        }

        badges.forEach(b => {
            const span = document.createElement('span');
            span.className = 'ta-sig-badge' + (b.cls ? ' ' + b.cls : '');
            span.textContent = b.text;
            strip.appendChild(span);
        });
    }

    function renderRsiSubChart(labels, rsiValues, tc) {
        const wrap = document.getElementById('rsiPaneWrap');
        const canvas = document.getElementById('marketRsiChart');
        if (!wrap || !canvas) return;

        if (!activeIndicators.rsi14 || !labels.length || typeof window.Chart === 'undefined') {
            wrap.classList.add('d-none');
            if (rsiChart) {
                rsiChart.destroy();
                rsiChart = null;
            }
            return;
        }

        wrap.classList.remove('d-none');
        if (rsiChart) {
            rsiChart.destroy();
            rsiChart = null;
        }

        const line70 = labels.map(() => 70);
        const line30 = labels.map(() => 30);

        rsiChart = new window.Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: t('chartRsiLabel'),
                        data: rsiValues,
                        borderColor: tc.rsiLine,
                        backgroundColor: tc.rsiBandBg,
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        fill: false,
                        spanGaps: true,
                        tension: 0.2
                    },
                    {
                        label: 'OB 70',
                        data: line70,
                        borderColor: tc.bearLine,
                        borderWidth: 1,
                        borderDash: [4, 4],
                        pointRadius: 0,
                        fill: false
                    },
                    {
                        label: 'OS 30',
                        data: line30,
                        borderColor: tc.bullLine,
                        borderWidth: 1,
                        borderDash: [4, 4],
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: tc.tooltipBg,
                        borderColor: tc.tooltipBorder,
                        borderWidth: 1,
                        titleColor: tc.tooltipTitle,
                        bodyColor: tc.tooltipBody,
                        titleFont: { size: 11, weight: 700 },
                        bodyFont: { size: 11, family: 'JetBrains Mono' },
                        padding: 8,
                        filter: item => item.datasetIndex === 0 && item.raw != null,
                        callbacks: {
                            label: ctx => ' ' + t('chartRsiLabel') + ': ' + Number(ctx.raw).toFixed(1)
                        }
                    }
                },
                scales: {
                    x: {
                        display: false,
                        offset: true
                    },
                    y: {
                        min: 0,
                        max: 100,
                        grid: { color: tc.gridLine },
                        ticks: {
                            color: tc.tickText,
                            stepSize: 35,
                            font: { weight: 600, size: 10, family: 'JetBrains Mono' }
                        }
                    }
                }
            }
        });
    }

    async function loadChartForCommodity(commodity) {
        if (!commodity) return;
        const reqSeq = ++heroChartRequestSeq;
        const res = await DataAdapter.getPriceHistory(
            currentApmc,
            commodity.commodityId,
            currentPeriodDays,
            currentInterval,
            65
        );
        if (reqSeq !== heroChartRequestSeq) return;

        if (!Array.isArray(res) && res && res.interval && res.interval !== currentInterval) {
            currentInterval = res.interval;
            syncChartToolbarUI();
        }

        const series = Array.isArray(res) ? res : (res && res.series ? res.series : []);
        const warmupBars = (!Array.isArray(res) && res && Array.isArray(res.warmupBars)) ? res.warmupBars : [];
        currentHistory = series;
        currentWarmupBars = warmupBars;
        currentVarieties = (!Array.isArray(res) && res && res.varieties) ? res.varieties : [];

        renderStockMarketChart(series, warmupBars, commodity);
    }

    function renderStockMarketChart(seriesBars, warmupBars, commodity) {
        const canvas = document.getElementById('marketTrendChart');
        if (!canvas) return;

        const rawSeries = Array.isArray(seriesBars) ? seriesBars : [];
        const rawWarmup = Array.isArray(warmupBars) ? warmupBars : [];
        lastChartRenderPayload = { seriesBars: rawSeries, warmupBars: rawWarmup, commodity };

        const normBars = rawSeries.map(h => {
            const close = Number(h.close != null ? h.close : (h.price || 0));
            const open = Number(h.open != null ? h.open : close);
            const rawMin = h.low != null ? Number(h.low) : (h.minPrice != null ? Number(h.minPrice) : Math.min(open, close));
            const rawMax = h.high != null ? Number(h.high) : (h.maxPrice != null ? Number(h.maxPrice) : Math.max(open, close));
            const low = Math.min(rawMin > 0 ? rawMin : Math.min(open, close), open, close);
            const high = Math.max(rawMax > 0 ? rawMax : Math.max(open, close), open, close);
            return {
                date: h.date,
                dateLabel: h.dateLabel || h.date,
                open,
                high,
                low,
                close,
                price: close,
                minPrice: low,
                maxPrice: high,
                arrival: Number(h.arrival || 0)
            };
        });

        const labels = normBars.map(b => b.dateLabel);
        const modalPrices = normBars.map(b => b.close);
        const lowPrices = normBars.map(b => b.low);
        const highPrices = normBars.map(b => b.high);
        const arrivals = normBars.map(b => b.arrival);

        if (typeof window.Chart === 'undefined') {
            renderTASignalsStrip(null, normBars.length);
            renderRsiSubChart([], [], getChartThemeColors());
            drawFallbackChart(canvas, labels, modalPrices);
            return;
        }

        if (trendChart) {
            trendChart.destroy();
            trendChart = null;
        }

        let isBullish = true;
        if (modalPrices.length >= 2) {
            isBullish = modalPrices[modalPrices.length - 1] >= modalPrices[0];
        } else if (commodity && commodity.changePercent != null) {
            isBullish = commodity.changePercent >= 0;
        }

        const tc = getChartThemeColors();
        const primaryColor = isBullish ? tc.bullLine : tc.bearLine;
        const glowBg = isBullish ? tc.bullGlow : tc.bearGlow;
        const volumeColor = isBullish ? tc.bullVol : tc.bearVol;
        const dense = currentPeriodDays === 0 || currentPeriodDays > 30 || modalPrices.length > 45;

        const taPack = (window.AgriTAEngine && typeof window.AgriTAEngine.computeTechnicalPack === 'function')
            ? window.AgriTAEngine.computeTechnicalPack(rawWarmup, normBars)
            : { sma7: [], sma20: [], sma50: [], ema12: [], rsi14: [], signals: {} };

        renderTASignalsStrip(taPack.signals, normBars.length);

        const datasets = [];

        if (currentChartStyle === 'candlestick') {
            datasets.push({
                label: t('chartCandleLabel'),
                data: normBars.map(b => [b.low, b.high]),
                type: 'bar',
                grouped: false,
                backgroundColor: 'rgba(0,0,0,0)',
                borderColor: 'rgba(0,0,0,0)',
                hoverBackgroundColor: 'rgba(0,0,0,0)',
                hoverBorderColor: 'rgba(0,0,0,0)',
                borderWidth: 0,
                isCandlestick: true,
                ohlcBars: normBars,
                candleColors: {
                    bullFill: tc.bullLine,
                    bearFill: tc.bearLine,
                    wickBull: tc.bullLine,
                    wickBear: tc.bearLine
                },
                order: 3,
                yAxisID: 'y'
            });
        } else if (currentChartStyle === 'band') {
            datasets.push({
                label: t('chartHighLabel'),
                data: highPrices,
                borderColor: tc.highBand,
                borderWidth: 1.5,
                borderDash: [4, 4],
                pointRadius: 0,
                fill: false,
                tension: 0.25,
                order: 3,
                yAxisID: 'y'
            });
            datasets.push({
                label: t('chartModalLabel'),
                data: modalPrices,
                borderColor: primaryColor,
                backgroundColor: glowBg,
                borderWidth: 2.6,
                pointRadius: dense ? 1 : 3.5,
                pointHoverRadius: 6,
                pointBackgroundColor: primaryColor,
                fill: '-1',
                tension: 0.25,
                order: 2,
                yAxisID: 'y'
            });
            datasets.push({
                label: t('chartLowLabel'),
                data: lowPrices,
                borderColor: tc.lowBand,
                borderWidth: 1.5,
                borderDash: [4, 4],
                pointRadius: 0,
                fill: false,
                tension: 0.25,
                order: 3,
                yAxisID: 'y'
            });
        } else {
            datasets.push({
                label: t('chartModalLabel'),
                data: modalPrices,
                borderColor: primaryColor,
                backgroundColor: glowBg,
                borderWidth: 2.8,
                pointRadius: dense ? 1 : 4,
                pointHoverRadius: 6,
                pointBackgroundColor: tc.pointFill,
                pointBorderColor: primaryColor,
                pointBorderWidth: 2,
                fill: true,
                tension: 0.28,
                order: 2,
                yAxisID: 'y'
            });
        }

        // Technical Indicator Overlays (SMA 7, SMA 20, SMA 50, EMA 12)
        if (activeIndicators.sma7 && taPack.sma7.length) {
            datasets.push({
                label: t('taIndSma7'),
                data: taPack.sma7,
                type: 'line',
                borderColor: tc.sma7Line,
                backgroundColor: tc.sma7Line,
                borderWidth: 1.7,
                pointRadius: 0,
                pointHoverRadius: 4,
                spanGaps: true,
                fill: false,
                tension: 0.2,
                order: 1,
                yAxisID: 'y'
            });
        }
        if (activeIndicators.sma20 && taPack.sma20.length) {
            datasets.push({
                label: t('taIndSma20'),
                data: taPack.sma20,
                type: 'line',
                borderColor: tc.sma20Line,
                backgroundColor: tc.sma20Line,
                borderWidth: 1.9,
                pointRadius: 0,
                pointHoverRadius: 4,
                spanGaps: true,
                fill: false,
                tension: 0.2,
                order: 1,
                yAxisID: 'y'
            });
        }
        if (activeIndicators.sma50 && taPack.sma50.length) {
            datasets.push({
                label: t('taIndSma50'),
                data: taPack.sma50,
                type: 'line',
                borderColor: tc.sma50Line,
                backgroundColor: tc.sma50Line,
                borderWidth: 1.8,
                pointRadius: 0,
                pointHoverRadius: 4,
                spanGaps: true,
                fill: false,
                tension: 0.2,
                order: 1,
                yAxisID: 'y'
            });
        }
        if (activeIndicators.ema12 && taPack.ema12.length) {
            datasets.push({
                label: t('taIndEma12'),
                data: taPack.ema12,
                type: 'line',
                borderColor: tc.ema12Line,
                backgroundColor: tc.ema12Line,
                borderWidth: 1.75,
                borderDash: [4, 2],
                pointRadius: 0,
                pointHoverRadius: 4,
                spanGaps: true,
                fill: false,
                tension: 0.2,
                order: 1,
                yAxisID: 'y'
            });
        }

        // Arrivals Volume Histogram anchored cleanly to bottom ~28% of plot
        const maxArrival = arrivals.length ? Math.max(...arrivals) : 0;
        datasets.push({
            label: t('chartVolLabel'),
            data: arrivals,
            type: 'bar',
            grouped: false,
            backgroundColor: volumeColor,
            borderColor: primaryColor,
            borderWidth: 1,
            borderRadius: 3,
            yAxisID: 'y1',
            barPercentage: 0.48,
            order: 4
        });

        const chartPlugins = (window.AgriTAEngine && window.AgriTAEngine.candlestickPlugin)
            ? [window.AgriTAEngine.candlestickPlugin]
            : [];

        trendChart = new window.Chart(canvas, {
            type: 'line',
            data: { labels, datasets },
            plugins: chartPlugins,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: tc.legendText,
                            font: { weight: 600, size: 11, family: 'Plus Jakarta Sans' },
                            boxWidth: 14,
                            usePointStyle: true,
                            generateLabels: function (chart) {
                                const items = window.Chart.defaults.plugins.legend.labels.generateLabels(chart);
                                items.forEach(item => {
                                    const ds = chart.data.datasets[item.datasetIndex];
                                    if (ds && ds.isCandlestick) {
                                        item.fillStyle = primaryColor;
                                        item.strokeStyle = primaryColor;
                                        item.lineWidth = 1.5;
                                    }
                                });
                                return items;
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: tc.tooltipBg,
                        borderColor: tc.tooltipBorder,
                        borderWidth: 1.5,
                        titleColor: tc.tooltipTitle,
                        bodyColor: tc.tooltipBody,
                        titleFont: { size: 12, weight: 700 },
                        bodyFont: { size: 12, family: 'JetBrains Mono' },
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            label: function (context) {
                                if (context.dataset.isCandlestick && Array.isArray(context.dataset.ohlcBars)) {
                                    const b = context.dataset.ohlcBars[context.dataIndex];
                                    if (!b) return null;
                                    return ' ' + t('chartOpenLabel') + ': ₹' + fmt(b.open) +
                                        ' | ' + t('highPrefix') + ' ₹' + fmt(b.high) +
                                        ' | ' + t('lowPrefix') + ' ₹' + fmt(b.low) +
                                        ' | ' + t('chartCloseLabel') + ': ₹' + fmt(b.close);
                                }
                                if (context.raw == null) return null;
                                if (context.dataset.yAxisID === 'y1') {
                                    return ' ' + t('volPrefix') + ' ' + Number(context.raw).toLocaleString('en-IN') + ' ' + t('quintals');
                                }
                                return ' ' + context.dataset.label + ': ₹' + Number(context.raw).toLocaleString('en-IN') + ' /' + t('qtlShort');
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        offset: true,
                        grid: { color: tc.gridLine },
                        ticks: {
                            color: tc.tickText,
                            maxTicksLimit: 12,
                            font: { weight: 600, size: 11, family: 'JetBrains Mono' }
                        }
                    },
                    y: {
                        type: 'linear',
                        beginAtZero: false,
                        grace: '8%',
                        display: true,
                        position: 'left',
                        grid: { color: tc.gridLine },
                        ticks: {
                            color: tc.yTickText,
                            font: { weight: 700, size: 11, family: 'JetBrains Mono' },
                            callback: function (v) { return '₹' + Number(v).toLocaleString('en-IN'); }
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        suggestedMax: maxArrival > 0 ? Math.ceil(maxArrival * 3.5) : undefined,
                        grid: { drawOnChartArea: false },
                        ticks: {
                            color: tc.tickText,
                            font: { weight: 600, size: 10, family: 'JetBrains Mono' },
                            callback: function (v) { return fmt(v) + ' ' + t('qtlShort'); }
                        }
                    }
                }
            }
        });

        renderRsiSubChart(labels, taPack.rsi14, tc);
    }

    function drawFallbackChart(canvas, labels, prices) {
        const ctx = canvas.getContext('2d');
        if (!ctx || !prices.length) return;
        const w = canvas.width = canvas.parentElement.clientWidth - 40;
        const h = canvas.height = 340;
        ctx.clearRect(0, 0, w, h);
        const min = Math.min(...prices) * 0.96;
        const max = Math.max(...prices) * 1.04;
        ctx.strokeStyle = getChartThemeColors().bullLine;
        ctx.lineWidth = 3;
        ctx.beginPath();
        prices.forEach((p, idx) => {
            const x = (idx / Math.max(1, prices.length - 1)) * (w - 40) + 20;
            const y = h - 30 - ((p - min) / Math.max(1, max - min)) * (h - 60);
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    function clearHeroTerminal() {
        heroChartRequestSeq++;
        lastChartRenderPayload = null;
        if (trendChart) {
            trendChart.destroy();
            trendChart = null;
        }
        if (rsiChart) {
            rsiChart.destroy();
            rsiChart = null;
        }
        document.getElementById('rsiPaneWrap')?.classList.add('d-none');
        const sigStrip = document.getElementById('taSignalsStrip');
        if (sigStrip) sigStrip.innerHTML = '';
        currentHistory = [];
        currentWarmupBars = [];
        currentVarieties = [];
        document.getElementById('heroAssetIcon').textContent = '🌿';
        document.getElementById('heroAssetGroup').textContent = '--';
        document.getElementById('heroAssetName').textContent = t('emptyTitle');
        document.getElementById('heroAssetKannada').textContent = '';
        document.getElementById('heroPrice').textContent = '₹--';
        document.getElementById('heroKgPrice').textContent = t('equivPrefix') + ' ₹-- ' + t('perKg');
        const pill = document.getElementById('heroDeltaPill');
        if (pill) {
            pill.className = 'delta-pill stable';
            pill.textContent = '● --';
        }
        document.getElementById('heroDayLow').textContent = '₹--';
        document.getElementById('heroDayHigh').textContent = '₹--';
        document.getElementById('heroDayModal').textContent = '₹--';
        document.getElementById('heroDaySpread').textContent = '₹--';
        document.getElementById('heroPrevPrice').textContent = '₹--';
        document.getElementById('heroVolume').textContent = '0 ' + t('qtlShort');
        document.getElementById('chartWatermark').textContent = 'AGRI VAAHAN';
        updateWorkspaceContextPills();
    }

    // ---------------------------------------------------------
    // Modals: Deep Analytics, Trends, and Pipeline Inspector
    // ---------------------------------------------------------
    function showModalById(id) {
        const el = document.getElementById(id);
        if (!el) return;
        if (window.bootstrap && window.bootstrap.Modal) {
            window.bootstrap.Modal.getOrCreateInstance(el).show();
        } else {
            el.classList.add('show');
            el.style.display = 'block';
        }
    }

    async function openCommodityAnalyticsModal(commodity) {
        const target = commodity || allCommodities.find(c => String(c.commodityId) === String(selectedCommodityId)) || allCommodities[0];
        if (!target) return;

        const primaryName = getCommodityPrimaryName(target);
        const secondaryName = getCommoditySecondaryName(target);

        document.getElementById('analyticsModalTitle').textContent =
            getCommodityEmoji(target.commodityName || target.commodityId) + ' ' + primaryName +
            (secondaryName ? ' (' + secondaryName + ')' : '') + ' — ' + t('fullAnalytics');

        showModalById('analyticsModal');

        try {
            const [histRes, cross] = await Promise.all([
                DataAdapter.getPriceHistory(currentApmc, target.commodityId, 30),
                DataAdapter.getComparison(target.commodityId)
            ]);

            const series = Array.isArray(histRes) ? histRes : (histRes && histRes.series ? histRes.series : []);
            const varieties = (!Array.isArray(histRes) && histRes && histRes.varieties) ? histRes.varieties : [];

            const prices = series.map(s => Number(s.price || 0)).filter(v => v > 0);
            const mins = series.map(s => Number(s.minPrice || s.price || 0)).filter(v => v > 0);
            const maxs = series.map(s => Number(s.maxPrice || s.price || 0)).filter(v => v > 0);

            const avg30 = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : target.currentPrice;
            const min30 = mins.length ? Math.min(...mins) : target.minPrice;
            const max30 = maxs.length ? Math.max(...maxs) : target.maxPrice;
            const totalVol30 = series.reduce((a, b) => a + Number(b.arrival || 0), 0);

            const statsRow = document.getElementById('analyticsStatsRow');
            if (statsRow) {
                statsRow.innerHTML =
                    '<div class="col-6 col-md-3"><div class="modal-stat-tile"><div class="range-stat-label">30D Avg Modal</div><div class="range-stat-val av-accent-teal">₹' + fmt(avg30) + '</div></div></div>' +
                    '<div class="col-6 col-md-3"><div class="modal-stat-tile"><div class="range-stat-label">30D Floor (Min)</div><div class="range-stat-val low-val">₹' + fmt(min30) + '</div></div></div>' +
                    '<div class="col-6 col-md-3"><div class="modal-stat-tile"><div class="range-stat-label">30D Peak (Max)</div><div class="range-stat-val high-val">₹' + fmt(max30) + '</div></div></div>' +
                    '<div class="col-6 col-md-3"><div class="modal-stat-tile"><div class="range-stat-label">30D Arrivals</div><div class="range-stat-val">' + fmt(totalVol30) + ' ' + esc(t('qtlShort')) + '</div></div></div>';
            }

            // Variety & Grade breakdown (DuckDB live data)
            const varWrap = document.getElementById('analyticsVarietiesWrap');
            const varBody = document.getElementById('analyticsVarietiesBody');
            if (varWrap && varBody) {
                if (varieties && varieties.length > 0) {
                    varWrap.classList.remove('d-none');
                    varBody.innerHTML = varieties.map(v =>
                        '<tr>' +
                            '<td class="fw-bold av-text-strong">' + esc(v.variety || 'OTHER') + '</td>' +
                            '<td class="av-text-muted">' + esc(v.grade || 'FAQ') + '</td>' +
                            '<td class="font-monospace fw-bold av-text-strong">₹' + fmt(v.modalPrice) + '</td>' +
                            '<td class="font-monospace av-bear-text">₹' + fmt(v.minPrice) + '</td>' +
                            '<td class="font-monospace av-bull-text">₹' + fmt(v.maxPrice) + '</td>' +
                            '<td class="font-monospace">' + fmt(v.arrival) + ' ' + esc(t('qtlShort')) + '</td>' +
                        '</tr>'
                    ).join('');
                } else {
                    varWrap.classList.add('d-none');
                    varBody.innerHTML = '';
                }
            }

            // Cross-Mandi Comparison (8 columns matching index.html)
            const tbody = document.getElementById('analyticsCrossMandiBody');
            if (tbody) {
                tbody.innerHTML = '';
                (cross || []).forEach(row => {
                    const pct = row.changePercent;
                    const pctCls = pct != null && pct > 0.4 ? 'av-bull-text' : (pct != null && pct < -0.4 ? 'av-bear-text' : 'av-text-muted');
                    const pctText = pct != null ? ((pct > 0 ? '+' : '') + pct.toFixed(2) + '%') : '--';
                    const yardLabel = (lang() === 'kn' && row.apmcNameKn) ? row.apmcNameKn : row.apmcName;
                    const dtLabel = row.lastTradedDate || (currentSummary && currentSummary.marketDate ? String(currentSummary.marketDate).split('T')[0] : '--');

                    const tr = document.createElement('tr');
                    tr.innerHTML =
                        '<td class="fw-bold av-text-strong">' + esc(yardLabel) + '</td>' +
                        '<td><span class="date-badge-mini">' + esc(dtLabel) + '</span></td>' +
                        '<td class="font-monospace fw-bold av-text-strong">₹' + fmt(row.currentPrice) + '</td>' +
                        '<td class="font-monospace av-bear-text">₹' + fmt(row.minPrice) + '</td>' +
                        '<td class="font-monospace av-bull-text">₹' + fmt(row.maxPrice) + '</td>' +
                        '<td class="font-monospace fw-semibold ' + pctCls + '">' + esc(pctText) + '</td>' +
                        '<td class="font-monospace">' + fmt(row.arrival) + ' ' + esc(t('qtlShort')) + '</td>' +
                        '<td class="text-end"><button type="button" class="btn btn-sm av-btn-outline-primary py-0 px-2">' + esc(t('switchYard')) + '</button></td>';

                    tr.querySelector('button').addEventListener('click', () => {
                        selectApmcById(row.apmcId, target.commodityId);
                        if (window.bootstrap && window.bootstrap.Modal) {
                            window.bootstrap.Modal.getInstance(document.getElementById('analyticsModal'))?.hide();
                        }
                    });
                    tbody.appendChild(tr);
                });
            }
        } catch (err) {
            console.error('openCommodityAnalyticsModal error:', err);
        }
    }

    async function loadStatewideMoversPanel() {
        const gEl = document.getElementById('trendsGainersList');
        const lEl = document.getElementById('trendsLosersList');
        const refreshMoversBtn = document.getElementById('btnRefreshMovers');
        const refreshMoversIcon = refreshMoversBtn?.querySelector('i');
        if (refreshMoversIcon) refreshMoversIcon.classList.add('fa-spin');
        if (gEl) gEl.innerHTML = '<div class="av-text-muted small">Loading...</div>';
        if (lEl) lEl.innerHTML = '<div class="av-text-muted small">Loading...</div>';

        try {
            const movers = await DataAdapter.getTrends();

            function buildList(targetId, list, isGainer) {
                const el = document.getElementById(targetId);
                if (!el) return;
                el.innerHTML = '';

                if (!list || !list.length) {
                    el.innerHTML = '<div class="av-text-muted small py-2">' + esc(isGainer ? t('noGainersYet') : t('noPriceDrops')) + '</div>';
                    return;
                }

                list.forEach(item => {
                    const rowDiv = document.createElement('div');
                    rowDiv.className = 'd-flex justify-content-between align-items-center py-2 px-2 rounded-2 av-trend-row';
                    rowDiv.style.cursor = 'pointer';

                    const comName = (lang() === 'kn' && item.commodityKannada) ? item.commodityKannada : item.commodityName;
                    const apmcName = (lang() === 'kn' && item.apmcNameKn) ? item.apmcNameKn : item.apmcName;
                    const dtBadge = item.lastTradedDate ? ' <span class="date-badge-mini ms-1">' + esc(item.lastTradedDate) + '</span>' : '';
                    const pct = Number(item.changePercent || 0);

                    rowDiv.innerHTML =
                        '<div>' +
                            '<div class="fw-bold av-text-strong">' + getCommodityEmoji(item.commodityName || item.commodityId) + ' ' + esc(comName) + '</div>' +
                            '<div class="small av-text-muted">' + esc(apmcName) + dtBadge + '</div>' +
                        '</div>' +
                        '<div class="text-end font-monospace">' +
                            '<div class="fw-bold av-text-strong">₹' + fmt(item.currentPrice) + '</div>' +
                            '<div class="small fw-semibold ' + (isGainer ? 'av-bull-text' : 'av-bear-text') + '">' +
                                (pct > 0 ? '▲ +' : '▼ ') + pct.toFixed(2) + '%' +
                            '</div>' +
                        '</div>';

                    rowDiv.addEventListener('click', () => {
                        resetCommodityFilters();
                        selectedCommodityId = item.commodityId;
                        currentApmc = item.apmcId;
                        syncApmcSelectionUI(item.apmcId);
                        switchWorkspaceTab('terminal');
                        loadMarket(false);
                        document.getElementById('terminalHeroSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                    el.appendChild(rowDiv);
                });
            }

            buildList('trendsGainersList', movers.gainers, true);
            buildList('trendsLosersList', movers.losers, false);
        } catch (err) {
            console.error('loadStatewideMoversPanel failed:', err);
        } finally {
            setTimeout(() => {
                if (refreshMoversIcon) refreshMoversIcon.classList.remove('fa-spin');
            }, 260);
        }
    }

    function openApiInspectorModal() {
        const selected = allCommodities.find(c => String(c.commodityId) === String(selectedCommodityId)) || allCommodities[0];
        const statusTitle = document.getElementById('pipelineStatusTitle');
        const statusMeta = document.getElementById('pipelineStatusMeta');
        const syncBtn = document.getElementById('btnRunKmvahiniSync');
        const controlsGroup = document.getElementById('kmvahiniControlsGroup');
        const syncOut = document.getElementById('kmvahiniSyncOutput');

        if (isLiveBackend && healthInfo) {
            if (statusTitle) statusTitle.textContent = 'DuckDB Analytical Warehouse (Connected)';
            if (statusMeta) {
                statusMeta.textContent =
                    'Raw Trades: ' + fmt(healthInfo.rawRows) +
                    ' | Daily Series: ' + fmt(healthInfo.dailyRows) +
                    ' | Yards: ' + healthInfo.marketCount +
                    ' | Range: ' + healthInfo.minDate + ' -> ' + healthInfo.maxDate;
            }
            controlsGroup?.classList.remove('d-none');
            syncBtn?.classList.remove('d-none');
        } else {
            if (statusTitle) statusTitle.textContent = 'Offline Mockup Fallback Mode';
            if (statusMeta) statusMeta.textContent = 'Start FastAPI backend: .venv\\Scripts\\python.exe -m uvicorn backend.app:app --port 8000';
            controlsGroup?.classList.add('d-none');
            syncBtn?.classList.add('d-none');
        }

        updateScrapePlanUI();
        if (syncOut && !isKmvahiniScraping) syncOut.classList.add('d-none');

        document.getElementById('inspectSummaryJson').textContent = JSON.stringify(currentSummary, null, 2);
        document.getElementById('inspectCommoditiesJson').textContent =
            JSON.stringify(allCommodities.slice(0, 3), null, 2) +
            (allCommodities.length > 3 ? '\n// ... +' + (allCommodities.length - 3) + ' more commodities' : '');

        document.getElementById('inspectHistoryUrl').textContent = isLiveBackend
            ? '/api/market/history?market=' + encodeURIComponent(currentApmc) + '&commodity=' + encodeURIComponent(selected ? selected.commodityId : '') + '&days=' + currentPeriodDays + '&interval=' + encodeURIComponent(currentInterval) + '&warmup=65'
            : '/Market/GetPriceHistory?apmcId=' + currentApmc + '&commodityId=' + (selected ? selected.commodityId : 0) + '&periodDays=' + currentPeriodDays + '&interval=' + currentInterval;

        document.getElementById('inspectHistoryJson').textContent = JSON.stringify({
            interval: currentInterval,
            warmupBarsCount: currentWarmupBars.length,
            seriesSample: currentHistory.slice(-4),
            varieties: currentVarieties
        }, null, 2);

        showModalById('apiInspectorModal');
    }

    function applyRunningScrapeState(job) {
        const headerBtn = document.getElementById('btnScrapeLatest');
        const headerIcon = document.getElementById('btnScrapeIcon');
        const headerLabel = document.getElementById('btnScrapeLabel');
        const modalBtn = document.getElementById('btnRunKmvahiniSync');
        const out = document.getElementById('kmvahiniSyncOutput');

        isKmvahiniScraping = true;
        if (headerBtn) headerBtn.disabled = true;
        if (headerIcon) {
            headerIcon.classList.remove('fa-cloud-arrow-down');
            headerIcon.classList.add('fa-spinner', 'fa-spin');
        }

        const pct = Number(job?.progress_pct || 0);
        const comp = Number(job?.completed_batches || 0);
        const tot = Number(job?.total_batches || 0);
        const progTag = tot > 0 ? (pct + '% (' + comp + '/' + tot + ')') : 'Starting...';

        if (headerLabel) headerLabel.textContent = 'Scraping ' + progTag;
        if (modalBtn) {
            modalBtn.disabled = true;
            modalBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Scraping ' + progTag;
        }

        const msg = job?.message || 'Live Scrape in Progress via kmvahini 1.2.0...';
        showSyncToast(msg, false, true);
        if (out) {
            out.classList.remove('d-none');
            out.className = 'small font-monospace av-accent-teal mb-3';
            out.textContent = msg;
        }
    }

    function clearScrapeBusyUI() {
        const headerBtn = document.getElementById('btnScrapeLatest');
        const headerIcon = document.getElementById('btnScrapeIcon');
        const modalBtn = document.getElementById('btnRunKmvahiniSync');

        isKmvahiniScraping = false;
        if (headerBtn) headerBtn.disabled = false;
        if (headerIcon) {
            headerIcon.classList.remove('fa-spinner', 'fa-spin');
            headerIcon.classList.add('fa-cloud-arrow-down');
        }
        if (modalBtn) {
            modalBtn.disabled = false;
            modalBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down me-1"></i> ' + esc(t('kmvahiniSyncBtn'));
        }
        updateScrapePlanUI();
    }

    function stopSyncPolling() {
        if (syncPollTimer) {
            clearInterval(syncPollTimer);
            syncPollTimer = null;
        }
    }

    async function refreshTerminalAfterSync(reloadMarketsList) {
        await DataAdapter.detectBackend();
        updateDataModeBadge();
        if (reloadMarketsList) {
            yardsList = await DataAdapter.getMarkets();
            renderQuickMandiChips();
            syncApmcSelectionUI(currentApmc);
        }
        await loadMarket(false);

        const statusMeta = document.getElementById('pipelineStatusMeta');
        if (statusMeta && isLiveBackend && healthInfo) {
            statusMeta.textContent =
                'Raw Trades: ' + fmt(healthInfo.rawRows) +
                ' | Daily Series: ' + fmt(healthInfo.dailyRows) +
                ' | Yards: ' + healthInfo.marketCount +
                ' | Range: ' + healthInfo.minDate + ' -> ' + healthInfo.maxDate;
        }
        reportState.initialized = false;
        if (activeWorkspaceTab === 'analysis' && reportState.subView === 'report') {
            loadAnalysisReport(reportState.reportId, reportState.market);
        }
    }

    async function pollSyncStatusOnce() {
        try {
            const job = await DataAdapter.getSyncStatus();
            if (!job) return;

            if (job.state === 'running') {
                applyRunningScrapeState(job);
                const comp = Number(job.completed_batches || 0);
                if (comp > lastObservedBatches) {
                    lastObservedBatches = comp;
                    await refreshTerminalAfterSync(false);
                }
                return;
            }

            stopSyncPolling();
            clearScrapeBusyUI();
            lastObservedBatches = 0;
            await refreshTerminalAfterSync(true);

            const out = document.getElementById('kmvahiniSyncOutput');
            if (job.state === 'completed') {
                const res = job.result || {};
                const version = res.kmvahini_version || '1.2.0';
                const range = res.range || job.range || '--';
                const summaryLine = res.status === 'ok'
                    ? 'Live Scrape Complete (kmvahini ' + version + ') • Window ' + range +
                      ' • Replaced ' + fmt(res.deleted_rows || 0) + ' existing rows with ' +
                      fmt(res.inserted || 0) + ' fresh rows (DB max: ' + (healthInfo?.maxDate || res.max_date || '--') + ')'
                    : 'Live Scrape (kmvahini ' + version + ') • Window ' + range +
                      ' returned 0 new rows (' + (res.status || 'no_new_data') + '); existing DuckDB data preserved.';

                showSyncToast(summaryLine, false);
                if (out) {
                    out.classList.remove('d-none');
                    out.className = 'small font-monospace av-bull-text mb-3';
                    out.textContent = summaryLine + '\n' + JSON.stringify(res, null, 2);
                }
            } else if (job.state === 'error') {
                const errMsg = job.message || ('Live Scrape Failed: ' + (job.error || 'Unknown error'));
                showSyncToast(errMsg, true);
                if (out) {
                    out.classList.remove('d-none');
                    out.className = 'small font-monospace av-bear-text mb-3';
                    out.textContent = errMsg;
                }
            }
        } catch (err) {
            console.error('pollSyncStatusOnce failed:', err);
        }
    }

    function startSyncPolling() {
        stopSyncPolling();
        syncPollTimer = setInterval(pollSyncStatusOnce, 2500);
    }

    async function handleKmvahiniSyncClick(triggerSource) {
        if (isKmvahiniScraping) return;

        const out = document.getElementById('kmvahiniSyncOutput');
        const monthsSelect = document.getElementById('selectKmvahiniMonths');
        const forceCheckbox = document.getElementById('chkForceKmvahiniScrape');
        const forceSameDayCheckbox = document.getElementById('chkForceSameDayScrape');

        if (!isLiveBackend) {
            await DataAdapter.detectBackend();
            updateDataModeBadge();
        }
        if (!isLiveBackend) {
            const offlineMsg = 'Offline Mockup Mode • Start FastAPI on port 8000 (uvicorn backend.app:app --port 8000) to run live kmvahini 1.2.0 scraping.';
            showSyncToast(offlineMsg, true);
            if (out) {
                out.classList.remove('d-none');
                out.className = 'small font-monospace av-accent-warm mb-3';
                out.textContent = offlineMsg;
            }
            return;
        }

        const rawWindowVal = triggerSource === 'modal' ? (monthsSelect?.value || 'auto') : 'auto';
        const lookbackMonths = rawWindowVal === 'auto' ? null : (parseInt(rawWindowVal, 10) || 2);
        const autoGap = rawWindowVal !== '1';
        const forceRefresh = forceCheckbox ? Boolean(forceCheckbox.checked) : true;
        const forceSameDay = triggerSource === 'modal' && Boolean(forceSameDayCheckbox?.checked);

        if (healthInfo?.syncPlan?.alreadyScrapedToday && !forceSameDay) {
            const sameDayMsg = (healthInfo.syncPlan.notice ||
                ('Last scrape was done today (' + (healthInfo.lastScrapedAt || 'today') +
                 '); DB is current through ' + (healthInfo.maxDate || '--') + '. Try again tomorrow.')) +
                (triggerSource === 'header'
                    ? ' (Open Data & API and tick Override if you need an intraday re-scrape.)'
                    : ' (Tick "Override same-day lock" if you want to re-scrape anyway.)');
            showSyncToast(sameDayMsg, false);
            if (out) {
                out.classList.remove('d-none');
                out.className = 'small font-monospace av-accent-warm mb-3';
                out.textContent = sameDayMsg;
            }
            return;
        }

        lastObservedBatches = 0;
        applyRunningScrapeState({
            progress_pct: 0,
            completed_batches: 0,
            total_batches: 0,
            message: 'Computing compulsory current-month + gap window & starting parallel kmvahini 1.2.0 scrape...'
        });

        try {
            const res = await DataAdapter.runKmvahiniSync({
                lookbackMonths,
                autoGap,
                forceRefresh,
                forceSameDay,
                background: true
            });

            if (res && res.status === 'already_scraped_today') {
                clearScrapeBusyUI();
                const noticeMsg = res.message || 'Last scrape was done today — try again tomorrow.';
                showSyncToast(noticeMsg, false);
                if (out) {
                    out.classList.remove('d-none');
                    out.className = 'small font-monospace av-accent-warm mb-3';
                    out.textContent = noticeMsg;
                }
                return;
            }

            if (res && (res.status === 'started' || res.status === 'already_running' || res.state === 'running')) {
                applyRunningScrapeState(res);
                startSyncPolling();
            } else {
                // Synchronous fallback if ever triggered
                clearScrapeBusyUI();
                await refreshTerminalAfterSync(true);
            }
        } catch (err) {
            stopSyncPolling();
            clearScrapeBusyUI();
            const errMsg = 'Live Scrape Failed: ' + err.message;
            showSyncToast(errMsg, true);
            if (out) {
                out.classList.remove('d-none');
                out.className = 'small font-monospace av-bear-text mb-3';
                out.textContent = errMsg;
            }
        }
    }

    // ---------------------------------------------------------
    // Phase 3: Multi-Year Matrix & Any-2 Period Differential Lab
    // ---------------------------------------------------------
    function formatSignedPct(val) {
        if (val == null || isNaN(val)) return '--';
        const num = Number(val);
        return (num > 0 ? '+' : '') + num.toFixed(2) + '%';
    }

    function pctColorClass(val) {
        if (val == null || isNaN(val)) return 'av-text-muted';
        const num = Number(val);
        if (num > 0.25) return 'av-bull-text';
        if (num < -0.25) return 'av-bear-text';
        return 'av-text-muted';
    }

    function regimeText(regimeKey) {
        const key = 'regime_' + (regimeKey || 'baseline');
        return t(key);
    }

    function populateAnalysisMarketSelect() {
        const sel = document.getElementById('analysisMarketSelect');
        if (!sel) return;
        const targetVal = analysisState.market || 'ALL';
        sel.innerHTML = '';

        const allOpt = document.createElement('option');
        allOpt.value = 'ALL';
        allOpt.textContent = t('analysisAllYards');
        sel.appendChild(allOpt);

        yardsList.forEach(y => {
            const opt = document.createElement('option');
            opt.value = String(y.id);
            opt.textContent = getYardPrimaryName(y);
            sel.appendChild(opt);
        });

        const exists = Array.from(sel.options).some(o => String(o.value) === String(targetVal));
        sel.value = exists ? String(targetVal) : 'ALL';
        analysisState.market = sel.value;
    }

    function populateAnalysisPeriodSelects(matrixRes) {
        const selA = document.getElementById('comparePeriodASelect');
        const selB = document.getElementById('comparePeriodBSelect');
        if (!selA || !selB || !matrixRes) return;

        const years = Array.isArray(matrixRes.availableYears) ? matrixRes.availableYears : [];
        const months = Array.isArray(matrixRes.availableMonths) ? matrixRes.availableMonths : [];
        const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const MONTH_KN = ['', 'ಜನ', 'ಫೆಬ್ರ', 'ಮಾರ್ಚ್', 'ಏಪ್ರಿ', 'ಮೇ', 'ಜೂನ್', 'ಜುಲೈ', 'ಆಗ', 'ಸೆಪ್ಟೆಂ', 'ಅಕ್ಟೋ', 'ನವೆಂ', 'ಡಿಸೆಂ'];

        function fillSelect(sel, selectedVal) {
            sel.innerHTML = '';
            if (years.length) {
                const grpY = document.createElement('optgroup');
                grpY.label = lang() === 'kn' ? 'ಕ್ಯಾಲೆಂಡರ್ ವರ್ಷಗಳು (YYYY)' : 'Calendar Years (YYYY)';
                years.forEach(yr => {
                    const o = document.createElement('option');
                    o.value = String(yr);
                    o.textContent = String(yr);
                    grpY.appendChild(o);
                });
                sel.appendChild(grpY);
            }
            if (months.length) {
                const grpM = document.createElement('optgroup');
                grpM.label = lang() === 'kn' ? 'ತಿಂಗಳುಗಳು (YYYY-MM)' : 'Specific Months (YYYY-MM)';
                months.forEach(ym => {
                    const parts = String(ym).split('-');
                    const yr = parts[0] || '';
                    const moIdx = parseInt(parts[1], 10);
                    const moLabel = lang() === 'kn'
                        ? ((MONTH_KN[moIdx] || parts[1]) + ' ' + yr + ' (' + ym + ')')
                        : ((MONTH_ABBR[moIdx] || parts[1]) + ' ' + yr + ' (' + ym + ')');
                    const o = document.createElement('option');
                    o.value = ym;
                    o.textContent = moLabel;
                    grpM.appendChild(o);
                });
                sel.appendChild(grpM);
            }
            if (selectedVal && Array.from(sel.options).some(o => o.value === selectedVal)) {
                sel.value = selectedVal;
            } else if (sel.options.length > 0) {
                sel.selectedIndex = 0;
            }
        }

        const fallbackB = matrixRes.defaultCompareB || (years[0] ? String(years[0]) : '');
        const fallbackA = matrixRes.defaultCompareA || (years[1] ? String(years[1]) : fallbackB);

        const allValid = new Set(years.map(String).concat(months.map(String)));
        if (!analysisState.periodB || !allValid.has(String(analysisState.periodB))) {
            analysisState.periodB = fallbackB;
        }
        if (!analysisState.periodA || !allValid.has(String(analysisState.periodA))) {
            analysisState.periodA = fallbackA;
        }

        fillSelect(selA, String(analysisState.periodA));
        fillSelect(selB, String(analysisState.periodB));
        analysisState.periodA = selA.value;
        analysisState.periodB = selB.value;
    }

    function syncAnalysisSelectsFromState(matrixRes) {
        const comSel = document.getElementById('analysisCommoditySelect');
        if (comSel && matrixRes && Array.isArray(matrixRes.commodities)) {
            comSel.innerHTML = '';
            matrixRes.commodities.forEach(c => {
                const opt = document.createElement('option');
                opt.value = String(c.id);
                opt.textContent = lang() === 'kn' && c.nameKn ? c.nameKn : c.name;
                comSel.appendChild(opt);
            });
            if (Array.from(comSel.options).some(o => String(o.value) === String(matrixRes.commodity))) {
                comSel.value = String(matrixRes.commodity);
                analysisState.commodity = comSel.value;
            }
        }

        const yrSel = document.getElementById('analysisYearsSelect');
        if (yrSel) yrSel.value = String(analysisState.years);

        const grSel = document.getElementById('analysisGranularitySelect');
        if (grSel) grSel.value = String(analysisState.granularity);

        const moSel = document.getElementById('analysisFocusMonthSelect');
        if (moSel) moSel.value = analysisState.focusMonth ? String(analysisState.focusMonth) : '';

        populateAnalysisPeriodSelects(matrixRes);
    }

    function renderAnalysisSummary(matrixRes) {
        const spanPriceEl = document.getElementById('analysisSpanPricePct');
        const spanPeriodTag = document.getElementById('analysisSpanPeriodTag');
        const spanArrEl = document.getElementById('analysisSpanArrPct');
        const spanArrSub = document.getElementById('analysisSpanArrSub');
        const peakPriceVal = document.getElementById('analysisPeakPriceVal');
        const peakPricePeriod = document.getElementById('analysisPeakPricePeriod');
        const peakArrVal = document.getElementById('analysisPeakArrVal');
        const peakArrPeriod = document.getElementById('analysisPeakArrPeriod');
        const s = matrixRes && matrixRes.summary;

        if (!s) {
            if (spanPriceEl) { spanPriceEl.className = 'av-analysis-kpi-val av-text-muted'; spanPriceEl.textContent = '--'; }
            if (spanPeriodTag) spanPeriodTag.textContent = '--';
            if (spanArrEl) { spanArrEl.className = 'av-analysis-kpi-val av-text-muted'; spanArrEl.textContent = '--'; }
            if (spanArrSub) spanArrSub.textContent = '--';
            if (peakPriceVal) peakPriceVal.textContent = '₹--';
            if (peakPricePeriod) peakPricePeriod.textContent = '--';
            if (peakArrVal) peakArrVal.textContent = '-- ' + t('qtlShort');
            if (peakArrPeriod) peakArrPeriod.textContent = '--';
            return;
        }

        if (spanPriceEl) {
            spanPriceEl.className = 'av-analysis-kpi-val ' + pctColorClass(s.spanPriceChangePct);
            spanPriceEl.textContent = formatSignedPct(s.spanPriceChangePct);
        }
        if (spanPeriodTag) {
            spanPeriodTag.textContent = (s.firstPeriod || '--') + ' → ' + (s.lastPeriod || '--');
        }
        if (spanArrEl) {
            spanArrEl.className = 'av-analysis-kpi-val ' + pctColorClass(s.spanArrivalsChangePct);
            spanArrEl.textContent = formatSignedPct(s.spanArrivalsChangePct);
        }
        if (spanArrSub) {
            spanArrSub.textContent = (s.periodsCount || 0) + ' ' + (lang() === 'kn' ? 'ಅವಧಿಗಳು' : 'periods') +
                ' • Avg ₹' + fmt(s.avgModalAcrossWindow);
        }
        if (peakPriceVal) peakPriceVal.textContent = '₹' + fmt(s.highestPriceValue);
        if (peakPricePeriod) {
            peakPricePeriod.textContent = (s.highestPricePeriod || '--') + ' (Low ₹' + fmt(s.lowestPriceValue) + ')';
        }
        if (peakArrVal) peakArrVal.textContent = fmt(s.peakArrivalsValue) + ' ' + t('qtlShort');
        if (peakArrPeriod) {
            peakArrPeriod.textContent = (s.peakArrivalsPeriod || '--') + ' • Avg ' + fmt(s.avgArrivalsPerPeriod) + ' ' + t('qtlShort');
        }
    }

    function renderPeriodComparison(cmpRes) {
        const badgeEl = document.getElementById('compareRegimeBadge');
        const noteEl = document.getElementById('compareMetaNote');
        if (!cmpRes) {
            if (badgeEl) { badgeEl.className = 'av-regime-pill'; badgeEl.textContent = '--'; }
            if (noteEl) noteEl.textContent = '--';
            return;
        }

        const pA = cmpRes.periodA || {};
        const pB = cmpRes.periodB || {};
        const d = cmpRes.diff || {};
        const labelA = (lang() === 'kn' && pA.labelKn) ? pA.labelKn : (pA.label || analysisState.periodA);
        const labelB = (lang() === 'kn' && pB.labelKn) ? pB.labelKn : (pB.label || analysisState.periodB);

        if (badgeEl) {
            badgeEl.className = 'av-regime-pill regime-' + (cmpRes.regime || 'baseline');
            badgeEl.textContent = regimeText(cmpRes.regime);
        }
        if (noteEl) {
            noteEl.textContent =
                labelA + ' (' + (pA.tradingDays || 0) + 'd' + (pA.firstDate ? ': ' + pA.firstDate + '..' + pA.lastDate : '') + ')' +
                '  vs  ' +
                labelB + ' (' + (pB.tradingDays || 0) + 'd' + (pB.firstDate ? ': ' + pB.firstDate + '..' + pB.lastDate : '') + ')';
        }

        function setTile(pctId, valId, pctVal, valStr, suffix) {
            const pEl = document.getElementById(pctId);
            const vEl = document.getElementById(valId);
            if (pEl) {
                pEl.className = 'av-diff-pct ' + pctColorClass(pctVal);
                pEl.textContent = suffix ? (pctVal != null ? ((pctVal > 0 ? '+' : '') + pctVal.toFixed(1) + suffix) : '--') : formatSignedPct(pctVal);
            }
            if (vEl) vEl.textContent = valStr;
        }

        const qShort = t('qtlShort');
        setTile(
            'cmpModalPct', 'cmpModalVal', d.modalPricePct,
            (pA.avgModalPrice != null ? '₹' + fmt(pA.avgModalPrice) : '--') + ' → ' + (pB.avgModalPrice != null ? '₹' + fmt(pB.avgModalPrice) : '--')
        );
        setTile(
            'cmpArrPct', 'cmpArrVal', d.arrivalsPct,
            fmt(pA.totalArrivals) + ' → ' + fmt(pB.totalArrivals) + ' ' + qShort
        );
        setTile(
            'cmpDailyArrPct', 'cmpDailyArrVal', d.avgDailyArrivalsPct,
            fmt(pA.avgDailyArrivals) + ' → ' + fmt(pB.avgDailyArrivals) + ' ' + qShort + '/d'
        );
        setTile(
            'cmpMinPct', 'cmpMinVal', d.minPricePct,
            (pA.minPrice != null ? '₹' + fmt(pA.minPrice) : '--') + ' → ' + (pB.minPrice != null ? '₹' + fmt(pB.minPrice) : '--')
        );
        setTile(
            'cmpMaxPct', 'cmpMaxVal', d.maxPricePct,
            (pA.maxPrice != null ? '₹' + fmt(pA.maxPrice) : '--') + ' → ' + (pB.maxPrice != null ? '₹' + fmt(pB.maxPrice) : '--')
        );
        setTile(
            'cmpVolPts', 'cmpVolVal', d.volatilityPts,
            (pA.volatilityPct != null ? pA.volatilityPct.toFixed(1) + '%' : '--') + ' → ' + (pB.volatilityPct != null ? pB.volatilityPct.toFixed(1) + '%' : '--'),
            ' pts'
        );
    }

    function renderAnalysisMatrixTable(matrixRes) {
        const tbody = document.getElementById('analysisMatrixBody');
        const cntBadge = document.getElementById('analysisMatrixCountBadge');
        if (!tbody) return;

        const rows = (matrixRes && Array.isArray(matrixRes.rows)) ? matrixRes.rows : [];
        if (cntBadge) {
            cntBadge.textContent = rows.length + ' ' + (lang() === 'kn' ? 'ಅವಧಿಗಳು' : 'periods');
        }

        if (!rows.length) {
            tbody.innerHTML =
                '<tr><td colspan="14" class="text-center av-text-muted py-4">' +
                esc(t('analysisNoData')) +
                '</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        const qShort = t('qtlShort');
        const keyA = String(analysisState.periodA || '');
        const keyB = String(analysisState.periodB || '');

        rows.forEach(r => {
            const pKey = String(r.periodKey);
            const isA = pKey === keyA;
            const isB = pKey === keyB;
            const tr = document.createElement('tr');
            if (isB) tr.className = 'av-matrix-row-b';
            else if (isA) tr.className = 'av-matrix-row-a';

            const pLabel = (lang() === 'kn' && r.periodLabelKn) ? r.periodLabelKn : r.periodLabel;
            const pkMonth = (lang() === 'kn' && r.peakMonthKn) ? r.peakMonthKn : r.peakMonth;
            const arrCls = pctColorClass(r.deltaArrivalsPct);
            const prcCls = pctColorClass(r.deltaPricePct);
            const regKey = r.regime || 'baseline';

            tr.innerHTML =
                '<td class="fw-bold av-text-strong font-monospace">' + esc(pLabel) + '</td>' +
                '<td class="font-monospace">' + fmt(r.tradingDays, 0) + '</td>' +
                '<td class="font-monospace">' + fmt(r.marketsReporting, 0) + '</td>' +
                '<td class="font-monospace fw-bold av-text-strong">' + fmt(r.totalArrivals) + ' <small class="av-text-muted">' + esc(qShort) + '</small></td>' +
                '<td class="font-monospace av-text-muted">' + fmt(r.avgDailyArrivals) + '</td>' +
                '<td class="font-monospace av-bear-text">₹' + fmt(r.minPrice) + '</td>' +
                '<td class="font-monospace fw-bold av-text-strong">₹' + fmt(r.avgModalPrice) + '</td>' +
                '<td class="font-monospace av-bull-text">₹' + fmt(r.maxPrice) + '</td>' +
                '<td class="font-monospace av-accent-warm">' + Number(r.volatilityPct || 0).toFixed(1) + '%</td>' +
                '<td class="font-monospace">' + esc(pkMonth || '--') + '</td>' +
                '<td class="font-monospace fw-bold ' + arrCls + '">' + esc(formatSignedPct(r.deltaArrivalsPct)) + '</td>' +
                '<td class="font-monospace fw-bold ' + prcCls + '">' + esc(formatSignedPct(r.deltaPricePct)) + '</td>' +
                '<td><span class="av-regime-pill regime-' + esc(regKey) + '">' + esc(regimeText(regKey)) + '</span></td>' +
                '<td class="text-end">' +
                    '<div class="d-inline-flex align-items-center gap-1">' +
                        '<button type="button" class="av-btn-ab btn-set-a' + (isA ? ' is-active-a' : '') + '">' + esc(t('btnSetA')) + '</button>' +
                        '<button type="button" class="av-btn-ab btn-set-b' + (isB ? ' is-active-b' : '') + '">' + esc(t('btnSetB')) + '</button>' +
                    '</div>' +
                '</td>';

            tr.querySelector('.btn-set-a')?.addEventListener('click', () => {
                analysisState.periodA = pKey;
                const sA = document.getElementById('comparePeriodASelect');
                if (sA && Array.from(sA.options).some(o => o.value === pKey)) sA.value = pKey;
                renderAnalysisMatrixTable(analysisState.matrixData);
                loadPeriodComparison();
            });
            tr.querySelector('.btn-set-b')?.addEventListener('click', () => {
                analysisState.periodB = pKey;
                const sB = document.getElementById('comparePeriodBSelect');
                if (sB && Array.from(sB.options).some(o => o.value === pKey)) sB.value = pKey;
                renderAnalysisMatrixTable(analysisState.matrixData);
                loadPeriodComparison();
            });

            tbody.appendChild(tr);
        });
    }

    function syncAnalysisChartModeUI() {
        document.getElementById('btnAnalysisChartPeriod')?.classList.toggle('active', analysisState.chartMode === 'period');
        document.getElementById('btnAnalysisChartMatrix')?.classList.toggle('active', analysisState.chartMode === 'matrix');
    }

    function renderAnalysisChart() {
        const canvas = document.getElementById('analysisCompareChart');
        if (!canvas || typeof window.Chart === 'undefined') return;

        if (analysisChart) {
            analysisChart.destroy();
            analysisChart = null;
        }

        const tc = getChartThemeColors();
        const isMatrixMode = analysisState.chartMode === 'matrix';

        if (!isMatrixMode && analysisState.compareData) {
            const cmp = analysisState.compareData;
            const pA = cmp.periodA || {};
            const pB = cmp.periodB || {};
            const labelA = (lang() === 'kn' && pA.labelKn) ? pA.labelKn : (pA.label || 'A');
            const labelB = (lang() === 'kn' && pB.labelKn) ? pB.labelKn : (pB.label || 'B');
            const br = Array.isArray(cmp.breakdown) ? cmp.breakdown : [];

            if (br.length > 0) {
                const labels = br.map(x => (lang() === 'kn' && x.labelKn) ? x.labelKn : x.label);
                const maxArr = Math.max(0, ...br.map(x => Math.max(Number(x.aArrivals || 0), Number(x.bArrivals || 0))));

                analysisChart = new window.Chart(canvas, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [
                            {
                                label: labelA + ' (₹)',
                                data: br.map(x => x.aModal),
                                borderColor: tc.sma20Line,
                                backgroundColor: tc.sma20Line,
                                borderWidth: 2,
                                borderDash: [5, 4],
                                pointRadius: 2.5,
                                spanGaps: true,
                                tension: 0.25,
                                yAxisID: 'y',
                                order: 1
                            },
                            {
                                label: labelB + ' (₹)',
                                data: br.map(x => x.bModal),
                                borderColor: tc.bullLine,
                                backgroundColor: tc.bullLine,
                                borderWidth: 2.6,
                                pointRadius: 3.5,
                                spanGaps: true,
                                tension: 0.25,
                                yAxisID: 'y',
                                order: 1
                            },
                            {
                                label: t('chartSeriesArrA'),
                                data: br.map(x => x.aArrivals || 0),
                                type: 'bar',
                                backgroundColor: tc.isDark ? 'rgba(91, 156, 246, 0.26)' : 'rgba(41, 98, 255, 0.18)',
                                yAxisID: 'y1',
                                order: 3
                            },
                            {
                                label: t('chartSeriesArrB'),
                                data: br.map(x => x.bArrivals || 0),
                                type: 'bar',
                                backgroundColor: tc.bullVol,
                                yAxisID: 'y1',
                                order: 3
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                            legend: {
                                display: true,
                                labels: { color: tc.legendText, font: { size: 11, weight: 600 }, usePointStyle: true }
                            },
                            tooltip: {
                                backgroundColor: tc.tooltipBg,
                                borderColor: tc.tooltipBorder,
                                borderWidth: 1,
                                titleColor: tc.tooltipTitle,
                                bodyColor: tc.tooltipBody
                            }
                        },
                        scales: {
                            x: {
                                grid: { color: tc.gridLine },
                                ticks: { color: tc.tickText, font: { size: 10, family: 'JetBrains Mono' } }
                            },
                            y: {
                                position: 'left',
                                beginAtZero: false,
                                grace: '8%',
                                grid: { color: tc.gridLine },
                                ticks: {
                                    color: tc.yTickText,
                                    font: { size: 10, weight: 700, family: 'JetBrains Mono' },
                                    callback: v => '₹' + fmt(v, 0)
                                }
                            },
                            y1: {
                                position: 'right',
                                beginAtZero: true,
                                suggestedMax: maxArr > 0 ? Math.ceil(maxArr * 3.2) : undefined,
                                grid: { drawOnChartArea: false },
                                ticks: {
                                    color: tc.tickText,
                                    font: { size: 10, family: 'JetBrains Mono' },
                                    callback: v => fmt(v, 0) + ' ' + t('qtlShort')
                                }
                            }
                        }
                    }
                });
                return;
            }

            // Summary fallback when comparing mixed Year vs Month
            analysisChart = new window.Chart(canvas, {
                type: 'bar',
                data: {
                    labels: [t('dayLow'), t('dayModal'), t('dayHigh')],
                    datasets: [
                        {
                            label: labelA,
                            data: [pA.minPrice || 0, pA.avgModalPrice || 0, pA.maxPrice || 0],
                            backgroundColor: tc.sma20Line
                        },
                        {
                            label: labelB,
                            data: [pB.minPrice || 0, pB.avgModalPrice || 0, pB.maxPrice || 0],
                            backgroundColor: tc.bullLine
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: tc.legendText } } },
                    scales: {
                        x: { grid: { color: tc.gridLine }, ticks: { color: tc.tickText } },
                        y: {
                            grid: { color: tc.gridLine },
                            ticks: { color: tc.yTickText, callback: v => '₹' + fmt(v, 0) }
                        }
                    }
                }
            });
            return;
        }

        // Matrix Trend Mode (chronological Last-N-Years Arrivals + Modal Price)
        const rows = (analysisState.matrixData && Array.isArray(analysisState.matrixData.rows))
            ? analysisState.matrixData.rows.slice().reverse()
            : [];
        if (!rows.length) return;

        const labels = rows.map(r => (lang() === 'kn' && r.periodLabelKn) ? r.periodLabelKn : r.periodLabel);
        const modals = rows.map(r => r.avgModalPrice);
        const arrivals = rows.map(r => r.totalArrivals);
        const maxArr = Math.max(0, ...arrivals);

        analysisChart = new window.Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: t('chartSeriesPriceAvg'),
                        data: modals,
                        borderColor: tc.bullLine,
                        backgroundColor: tc.bullLine,
                        borderWidth: 2.6,
                        pointRadius: 4,
                        tension: 0.25,
                        yAxisID: 'y',
                        order: 1
                    },
                    {
                        label: t('chartSeriesTotalArr'),
                        data: arrivals,
                        type: 'bar',
                        backgroundColor: tc.isDark ? 'rgba(91, 156, 246, 0.34)' : 'rgba(41, 98, 255, 0.22)',
                        borderColor: tc.sma20Line,
                        borderWidth: 1,
                        yAxisID: 'y1',
                        order: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: tc.legendText, font: { size: 11, weight: 600 }, usePointStyle: true } },
                    tooltip: {
                        backgroundColor: tc.tooltipBg,
                        borderColor: tc.tooltipBorder,
                        borderWidth: 1,
                        titleColor: tc.tooltipTitle,
                        bodyColor: tc.tooltipBody
                    }
                },
                scales: {
                    x: {
                        grid: { color: tc.gridLine },
                        ticks: { color: tc.tickText, font: { size: 10, family: 'JetBrains Mono' } }
                    },
                    y: {
                        position: 'left',
                        beginAtZero: false,
                        grace: '8%',
                        grid: { color: tc.gridLine },
                        ticks: { color: tc.yTickText, font: { size: 10, weight: 700, family: 'JetBrains Mono' }, callback: v => '₹' + fmt(v, 0) }
                    },
                    y1: {
                        position: 'right',
                        beginAtZero: true,
                        suggestedMax: maxArr > 0 ? Math.ceil(maxArr * 2.5) : undefined,
                        grid: { drawOnChartArea: false },
                        ticks: { color: tc.tickText, font: { size: 10, family: 'JetBrains Mono' }, callback: v => fmt(v, 0) + ' ' + t('qtlShort') }
                    }
                }
            }
        });
    }

    async function loadPeriodComparison() {
        const pA = String(analysisState.periodA || '');
        const pB = String(analysisState.periodB || '');
        if (!pA || !pB) return;

        const seq = ++analysisState.compareSeq;
        try {
            const cmpRes = await DataAdapter.compareAnalysisPeriods(
                analysisState.market,
                analysisState.commodity,
                pA,
                pB
            );
            if (seq !== analysisState.compareSeq) return;
            analysisState.compareData = cmpRes;
            renderPeriodComparison(cmpRes);
            renderAnalysisChart();
        } catch (err) {
            console.error('compareAnalysisPeriods failed:', err);
        }
    }

    async function loadMultiYearAnalysis(autoSelectCompare, allowCommodityFallback) {
        const seq = ++analysisState.requestSeq;
        const tbody = document.getElementById('analysisMatrixBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="14" class="text-center av-text-muted py-4">Loading historical matrix...</td></tr>';
        }

        try {
            const focusArg = analysisState.focusMonth ? parseInt(analysisState.focusMonth, 10) : null;
            const res = await DataAdapter.getMultiYearAnalysis(
                analysisState.market,
                analysisState.commodity,
                analysisState.years,
                analysisState.granularity,
                focusArg
            );
            if (seq !== analysisState.requestSeq) return;

            if (allowCommodityFallback !== false &&
                (!res.rows || !res.rows.length) &&
                res.commodities && res.commodities.length > 0 &&
                !res.commodities.some(c => String(c.id) === String(analysisState.commodity))) {
                analysisState.commodity = String(res.commodities[0].id);
                await loadMultiYearAnalysis(true, false);
                return;
            }

            analysisState.matrixData = res;
            if (autoSelectCompare) {
                analysisState.periodA = res.defaultCompareA || '';
                analysisState.periodB = res.defaultCompareB || '';
            }

            syncAnalysisSelectsFromState(res);
            renderAnalysisSummary(res);
            renderAnalysisMatrixTable(res);
            updateWorkspaceContextPills();

            await loadPeriodComparison();
        } catch (err) {
            console.error('loadMultiYearAnalysis failed:', err);
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="14" class="text-center av-bear-text py-4">Error loading multi-year matrix: ' + esc(err.message) + '</td></tr>';
            }
        }
    }

    function initAnalysisTab(syncFromTerminal) {
        analysisState.initialized = true;
        if (syncFromTerminal) {
            analysisState.market = currentApmc || (isLiveBackend ? 'BENGALURU' : 32);
            analysisState.commodity = selectedCommodityId || (isLiveBackend ? 'ONION' : 101);
        }
        populateAnalysisMarketSelect();
        syncAnalysisChartModeUI();
        loadMultiYearAnalysis(true, true);
    }

    function exportAnalysisMatrixCsv() {
        const res = analysisState.matrixData;
        if (!res || !res.rows || !res.rows.length) return;
        const header = [
            'Market', 'Commodity', 'Period', 'PeriodKey', 'ActiveDays', 'MarketsReporting',
            'TotalArrivals_Qtl', 'AvgDailyArrivals_Qtl', 'MinPrice_INR', 'AvgModalPrice_INR',
            'MaxPrice_INR', 'VolatilitySpread_Pct', 'PeakMonth', 'DeltaArrivals_Pct',
            'DeltaModalPrice_Pct', 'MarketRegime'
        ];
        const escCsv = val => '"' + String(val == null ? '' : val).replace(/"/g, '""') + '"';
        const lines = [header.join(',')];
        res.rows.forEach(r => {
            lines.push([
                escCsv(res.marketName),
                escCsv(res.commodityName),
                escCsv(r.periodLabel),
                escCsv(r.periodKey),
                r.tradingDays,
                r.marketsReporting,
                r.totalArrivals,
                r.avgDailyArrivals,
                r.minPrice,
                r.avgModalPrice,
                r.maxPrice,
                r.volatilityPct,
                escCsv(r.peakMonth),
                r.deltaArrivalsPct != null ? r.deltaArrivalsPct : '',
                r.deltaPricePct != null ? r.deltaPricePct : '',
                escCsv(r.regime)
            ].join(','));
        });
        const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'agrivaahan_matrix_' + String(res.market || 'ALL') + '_' + String(res.commodity || 'CROP') + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ---------------------------------------------------------
    // Technical Reports Engine (TR-1 Soyabean AI Outlook)
    // ---------------------------------------------------------
    function switchAnalysisSubView(subView) {
        reportState.subView = subView === 'matrix' ? 'matrix' : 'report';
        const isRep = reportState.subView === 'report';
        document.getElementById('btnAnalysisSubReport')?.classList.toggle('active', isRep);
        document.getElementById('btnAnalysisSubMatrix')?.classList.toggle('active', !isRep);
        document.getElementById('analysisReportSubView')?.classList.toggle('d-none', !isRep);
        document.getElementById('analysisMatrixSubView')?.classList.toggle('d-none', isRep);

        if (isRep) {
            if (!reportState.initialized) {
                initAnalysisReportTab();
            } else {
                setTimeout(() => {
                    reportSeasonalPriceChart?.resize();
                    reportSeasonalArrChart?.resize();
                    reportForecastChart?.resize();
                }, 50);
            }
        } else {
            if (!analysisState.initialized) {
                initAnalysisTab(true);
            } else if (analysisChart && typeof analysisChart.resize === 'function') {
                setTimeout(() => analysisChart?.resize(), 50);
            }
        }
    }

    function openOctComparisonInMatrix(marketCode, commodityCode) {
        const mkt = String(marketCode || 'BIDAR').toUpperCase();
        const com = String(commodityCode || 'SOYABEEN').toUpperCase();
        switchAnalysisSubView('matrix');

        analysisState.initialized = true;
        analysisState.market = isLiveBackend ? mkt : (mkt === 'ALL' ? 'ALL' : (MOCK_ID_BY_CODE[mkt] || 179));
        analysisState.commodity = com;
        analysisState.granularity = 'monthly';
        analysisState.years = 5;
        analysisState.focusMonth = '';
        analysisState.periodA = '2025-10';
        analysisState.periodB = '2026-10';
        analysisState.chartMode = 'period';

        populateAnalysisMarketSelect();
        syncAnalysisChartModeUI();
        loadMultiYearAnalysis(false, true);
    }

    function loadReportCommodityInChartDesk() {
        const rep = reportState.data?.report || {};
        const comId = rep.commodity || 'SOYABEEN';
        const chosenMkt = reportState.market && reportState.market !== 'ALL' ? reportState.market : 'BIDAR';
        const targetYard = isLiveBackend ? chosenMkt : (MOCK_ID_BY_CODE[chosenMkt] || 140);

        switchWorkspaceTab('terminal');
        selectApmcById(targetYard, comId);
        document.getElementById('terminalHeroSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function populateReportSelectDropdown() {
        const sel = document.getElementById('analysisReportSelect');
        if (!sel) return;
        const isKn = lang() === 'kn';
        sel.innerHTML = '';
        (reportState.reportsList || []).forEach(r => {
            const opt = document.createElement('option');
            opt.value = String(r.id);
            opt.textContent = isKn && r.shortTitleKn ? r.shortTitleKn : (r.shortTitle || r.title);
            sel.appendChild(opt);
        });
        if (Array.from(sel.options).some(o => o.value === reportState.reportId)) {
            sel.value = reportState.reportId;
        }
    }

    function renderReportCharts(payload) {
        if (!payload || typeof window.Chart === 'undefined') return;
        const tc = getChartThemeColors();
        const isKn = lang() === 'kn';

        // 1 & 2. Figures 1-4 Side-by-Side Sep-Dec 2022..2026 Seasonal Price & Arrivals
        const sd = payload.seasonalDynamics || {};
        const sLabels = Array.isArray(sd.labels) ? sd.labels : [];
        const years = Array.isArray(sd.years) ? sd.years : [];
        const yearPalette = {
            '2022': { color: tc.isDark ? '#5b9cf6' : '#2962ff', dash: [], width: 1.6, order: 4 },
            '2023': { color: '#f57c00', dash: [6, 3], width: 1.6, order: 3 },
            '2024': { color: tc.bullLine, dash: [2, 3], width: 1.7, order: 2 },
            '2025': { color: '#ab47bc', dash: [7, 3, 2, 3], width: 1.7, order: 1 },
            '2026': { color: tc.yTickText, dash: [], width: 2.6, order: 0 }
        };
        const axisMilestones = new Set(['Sep 1', 'Sep 15', 'Oct 1', 'Oct 15', 'Nov 1', 'Nov 15', 'Dec 1', 'Dec 15', 'Dec 31']);

        function buildSeasonalDatasets(metricKey) {
            return years.map(yr => {
                const yKey = String(yr);
                const sty = yearPalette[yKey] || { color: tc.tickText, dash: [], width: 1.5, order: 5 };
                const liveTag = yKey === '2026' ? (isKn ? ' (ಲೈವ್)' : ' (Live)') : '';
                const vals = (sd.seriesByYear && sd.seriesByYear[yKey] && sd.seriesByYear[yKey][metricKey]) || [];
                return {
                    label: yKey + liveTag,
                    data: vals,
                    borderColor: sty.color,
                    backgroundColor: sty.color,
                    borderWidth: sty.width,
                    borderDash: sty.dash,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    spanGaps: true,
                    tension: 0.18,
                    order: sty.order
                };
            });
        }

        function buildSeasonalOptions(yTickFmt) {
            return {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: tc.legendText, font: { size: 11, weight: 600 }, usePointStyle: true, boxWidth: 10 }
                    },
                    tooltip: {
                        backgroundColor: tc.tooltipBg,
                        borderColor: tc.tooltipBorder,
                        borderWidth: 1,
                        titleColor: tc.tooltipTitle,
                        bodyColor: tc.tooltipBody
                    }
                },
                scales: {
                    x: {
                        grid: { color: tc.gridLine },
                        ticks: {
                            color: tc.tickText,
                            autoSkip: false,
                            maxRotation: 0,
                            font: { size: 10, family: 'JetBrains Mono' },
                            callback: function (value, index) {
                                const lbl = sLabels[index] || '';
                                return axisMilestones.has(lbl) ? lbl : null;
                            }
                        }
                    },
                    y: {
                        beginAtZero: false,
                        grace: '6%',
                        grid: { color: tc.gridLine },
                        ticks: {
                            color: tc.yTickText,
                            font: { size: 10, weight: 700, family: 'JetBrains Mono' },
                            callback: yTickFmt
                        }
                    }
                }
            };
        }

        const cPrice = document.getElementById('reportSeasonalPriceChart');
        if (cPrice) {
            if (reportSeasonalPriceChart) { reportSeasonalPriceChart.destroy(); reportSeasonalPriceChart = null; }
            reportSeasonalPriceChart = new window.Chart(cPrice, {
                type: 'line',
                data: { labels: sLabels, datasets: buildSeasonalDatasets('prices') },
                options: buildSeasonalOptions(v => '₹' + fmt(v, 0))
            });
        }

        const cArr = document.getElementById('reportSeasonalArrivalsChart');
        if (cArr) {
            if (reportSeasonalArrChart) { reportSeasonalArrChart.destroy(); reportSeasonalArrChart = null; }
            const arrOpts = buildSeasonalOptions(v => fmt(v, 0));
            arrOpts.scales.y.beginAtZero = true;
            reportSeasonalArrChart = new window.Chart(cArr, {
                type: 'line',
                data: { labels: sLabels, datasets: buildSeasonalDatasets('arrivals') },
                options: arrOpts
            });
        }

        // 3. Figures 5-8 Timestral 123M Fan Chart + Live DuckDB Actuals + MSP
        const fc = payload.priceOutlook || {};
        const fcCanvas = document.getElementById('reportForecastChart');
        if (fcCanvas) {
            if (reportForecastChart) { reportForecastChart.destroy(); reportForecastChart = null; }
            const fcLabels = Array.isArray(fc.labels) ? fc.labels : [];
            const cutoffIdx = Number(fc.cutoffIdx || 0);
            const bandColor = tc.isDark ? 'rgba(255, 152, 0, 0.22)' : 'rgba(255, 152, 0, 0.21)';
            const bandEdge = tc.isDark ? 'rgba(255, 167, 38, 0.38)' : 'rgba(245, 124, 0, 0.36)';

            const cutoffMarkerPlugin = {
                id: 'avForecastCutoffMarker',
                afterDraw(chart) {
                    const meta = chart.getDatasetMeta(5);
                    if (!meta || !meta.data || !meta.data[cutoffIdx]) return;
                    const x = meta.data[cutoffIdx].x;
                    const { top, bottom } = chart.chartArea;
                    const ctx = chart.ctx;
                    ctx.save();
                    ctx.beginPath();
                    ctx.setLineDash([5, 4]);
                    ctx.strokeStyle = tc.tickText;
                    ctx.lineWidth = 1.4;
                    ctx.moveTo(x, top);
                    ctx.lineTo(x, bottom);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.fillStyle = tc.tickText;
                    ctx.font = '600 10px "JetBrains Mono", monospace';
                    ctx.fillText(isKn ? 'ಕಟ್-ಆಫ್ (ಅಕ್ಟೋ 14)' : 'Cutoff (Oct 14)', Math.min(x + 6, chart.chartArea.right - 115), top + 14);
                    ctx.restore();
                }
            };

            reportForecastChart = new window.Chart(fcCanvas, {
                type: 'line',
                plugins: [cutoffMarkerPlugin],
                data: {
                    labels: fcLabels,
                    datasets: [
                        {
                            label: t('repChartQ90'),
                            data: fc.q90 || [],
                            borderColor: bandEdge,
                            borderWidth: 1,
                            pointRadius: 0,
                            fill: false,
                            spanGaps: true,
                            tension: 0.25,
                            order: 4
                        },
                        {
                            label: t('repChartQ10'),
                            data: fc.q10 || [],
                            borderColor: bandEdge,
                            backgroundColor: bandColor,
                            borderWidth: 1,
                            pointRadius: 0,
                            fill: 0,
                            spanGaps: true,
                            tension: 0.25,
                            order: 3
                        },
                        {
                            label: t('repChartMsp'),
                            data: fc.mspLine || [],
                            borderColor: tc.bearLine,
                            backgroundColor: tc.bearLine,
                            borderWidth: 1.6,
                            borderDash: [6, 4],
                            pointRadius: 0,
                            tension: 0,
                            order: 2
                        },
                        {
                            label: t('repChartZeroShot'),
                            data: fc.zeroShot || [],
                            borderColor: tc.tickText,
                            backgroundColor: tc.tickText,
                            borderWidth: 1.6,
                            borderDash: [4, 4],
                            pointRadius: 0,
                            spanGaps: true,
                            tension: 0.22,
                            order: 2
                        },
                        {
                            label: t('repChartMedian'),
                            data: fc.median || [],
                            borderColor: '#f57c00',
                            backgroundColor: '#f57c00',
                            borderWidth: 2.5,
                            pointRadius: 0,
                            spanGaps: true,
                            tension: 0.22,
                            order: 1
                        },
                        {
                            label: t('repChartActual'),
                            data: fc.actual || [],
                            borderColor: tc.sma20Line,
                            backgroundColor: tc.sma20Line,
                            borderWidth: 2.4,
                            pointRadius: 1.5,
                            pointHoverRadius: 4.5,
                            spanGaps: true,
                            tension: 0.16,
                            order: 0
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            display: true,
                            labels: {
                                color: tc.legendText,
                                font: { size: 11, weight: 600 },
                                usePointStyle: true,
                                filter: item => item.datasetIndex !== 0
                            }
                        },
                        tooltip: {
                            backgroundColor: tc.tooltipBg,
                            borderColor: tc.tooltipBorder,
                            borderWidth: 1,
                            titleColor: tc.tooltipTitle,
                            bodyColor: tc.tooltipBody,
                            callbacks: {
                                label: ctx => ctx.parsed.y != null ? (ctx.dataset.label + ': ₹' + fmt(ctx.parsed.y, 1) + '/q') : null
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: tc.gridLine },
                            ticks: {
                                color: tc.tickText,
                                maxTicksLimit: 10,
                                maxRotation: 0,
                                font: { size: 10, family: 'JetBrains Mono' }
                            }
                        },
                        y: {
                            beginAtZero: false,
                            grace: '6%',
                            grid: { color: tc.gridLine },
                            ticks: {
                                color: tc.yTickText,
                                font: { size: 10, weight: 700, family: 'JetBrains Mono' },
                                callback: v => '₹' + fmt(v, 0)
                            }
                        }
                    }
                }
            });
        }
    }

    function renderReportPayload(payload) {
        if (!payload) return;
        const isKn = lang() === 'kn';
        const rep = payload.report || {};
        const reqMkt = payload.selectedMarket || reportState.market || 'BIDAR';

        // Header
        const maxDtEl = document.getElementById('reportLiveMaxDateBadge');
        if (maxDtEl) maxDtEl.textContent = (isKn ? 'ಲೈವ್ ಡಕ್‌ಡಿಬಿ • ' : 'LIVE DB • ') + (rep.dbLatestDate || '--');
        const mspEl = document.getElementById('reportMspBadge');
        if (mspEl) mspEl.textContent = (rep.mspSeason || '2026–27') + ' MSP: ₹' + fmt(rep.msp || 5708, 0) + ' / q';
        const titleEl = document.getElementById('reportMainTitle');
        if (titleEl) titleEl.textContent = isKn && rep.titleKn ? rep.titleKn : (rep.title || '--');
        const authEl = document.getElementById('reportAuthorMeta');
        if (authEl) {
            const authName = isKn && rep.authorKn ? rep.authorKn : (rep.author || '');
            const instName = isKn && rep.institutionKn ? rep.institutionKn : (rep.institution || '');
            authEl.textContent = authName + ' • ' + instName + ' • ' + (rep.reportDate || '');
        }

        // Market filter pills
        const pillsWrap = document.getElementById('repMarketPills');
        if (pillsWrap) {
            pillsWrap.innerHTML = '';
            (payload.table1 || []).forEach(row => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'av-rep-mkt-pill' + (row.market === reqMkt ? ' active' : '');
                btn.dataset.market = row.market;
                btn.textContent = isKn && row.marketNameKn ? row.marketNameKn : row.marketName;
                btn.addEventListener('click', () => {
                    if (reportState.market !== row.market) {
                        reportState.market = row.market;
                        loadAnalysisReport(reportState.reportId, row.market);
                    }
                });
                pillsWrap.appendChild(btn);
            });
        }

        // Section 1: Production Context — all values come from API payload; show '--' if missing
        const pc = payload.productionContext || {};
        const asOnEl = document.getElementById('repProdAsOnTag');
        if (asOnEl) asOnEl.textContent = (isKn ? 'ದಿನಾಂಕ ' : 'As on ') + (pc.kharifAsOn || '--');
        const khHa = document.getElementById('repKpiKharifHa');
        if (khHa) khHa.textContent = pc.kharifAreaLHa != null ? fmt(pc.kharifAreaLHa) + ' L ha' : '--';
        const sArea = document.getElementById('repKpiSoyaArea');
        if (sArea) sArea.textContent = pc.soyabeanAreaLHa != null ? fmt(pc.soyabeanAreaLHa) + ' L ha' : '--';
        const sAreaSub = document.getElementById('repKpiSoyaAreaSub');
        if (sAreaSub) {
            if (pc.soyabeanPrevAreaLHa != null) {
                sAreaSub.textContent = 'vs ' + fmt(pc.soyabeanPrevAreaLHa) + ' L ha (' + formatSignedPct(pc.soyabeanAreaYoYPct) + ')';
            } else {
                sAreaSub.textContent = '--';
            }
        }
        const sOut = document.getElementById('repKpiSopaOut');
        if (sOut) sOut.textContent = pc.sopaOutputLmt != null ? fmt(pc.sopaOutputLmt) + ' LMT' : '--';
        const sSub = document.getElementById('repKpiSopaSub');
        if (sSub) {
            if (pc.sopaDeltaLmt != null) {
                sSub.textContent = fmt(pc.sopaDeltaLmt) + ' LMT (' + formatSignedPct(pc.sopaDeltaPct) + ') [2]';
            } else {
                sSub.textContent = '--';
            }
        }

        const stateRow = (payload.table1 || []).find(r => r.isStatewide);
        const kaShock = document.getElementById('repKpiKaShock');
        if (kaShock) {
            const shockPct = pc.karnatakaOutputShockPct;
            if (shockPct != null) {
                kaShock.textContent = (isKn ? shockPct + '% ಉತ್ಪಾದನೆ' : shockPct + '% Output');
            } else {
                kaShock.textContent = '--';
            }
        }
        const kaJump = document.getElementById('repKpiKaPriceJump');
        if (kaJump && stateRow) {
            kaJump.textContent = formatSignedPct(stateRow.priceChangePct) + (isKn ? ' ಅಕ್ಟೋ ದರ ಏರಿಕೆ' : ' Oct Weighted Modal');
        }
        const phEl = document.getElementById('repProdHeadline');
        if (phEl) phEl.textContent = isKn && pc.headlineKn ? pc.headlineKn : (pc.headline || '');
        const pnEl = document.getElementById('repProdExpectationNote');
        if (pnEl) pnEl.textContent = isKn && pc.priceExpectationNoteKn ? pc.priceExpectationNoteKn : (pc.priceExpectationNote || '');

        const shiftsWrap = document.getElementById('repStateShiftsList');
        if (shiftsWrap) {
            shiftsWrap.innerHTML = '';
            const maxAbs = Math.max(50, ...(pc.stateShifts || []).map(x => Math.abs(Number(x.pct || 0))));
            (pc.stateShifts || []).forEach(st => {
                const v = Number(st.pct || 0);
                const wPct = Math.max(4, Math.min(100, Math.round((Math.abs(v) / maxAbs) * 100)));
                const rowDiv = document.createElement('div');
                rowDiv.className = 'av-shift-row';
                rowDiv.title = isKn && st.driverKn ? st.driverKn : (st.driver || '');
                rowDiv.innerHTML =
                    '<span class="av-shift-label">' + esc(isKn && st.nameKn ? st.nameKn : st.name) + '</span>' +
                    '<div class="av-shift-bar-track"><div class="av-shift-bar-fill ' + (v >= 0 ? 'is-pos' : 'is-neg') + '" style="width:' + wPct + '%"></div></div>' +
                    '<span class="av-shift-val ' + (v >= 0 ? 'av-bull-text' : 'av-bear-text') + '">' + (v > 0 ? '+' : '') + v + '%</span>';
                shiftsWrap.appendChild(rowDiv);
            });
        }

        // Section 2: Live DuckDB Table 1
        const tb1 = document.getElementById('repTable1Body');
        const rows = payload.table1 || [];
        if (tb1) {
            tb1.innerHTML = '';
            rows.forEach(r => {
                const tr = document.createElement('tr');
                tr.className = 'av-rep-row' +
                    (r.market === reqMkt ? ' av-rep-row-active' : '') +
                    (r.isStatewide ? ' av-rep-row-statewide fw-semibold' : '');
                const mName = isKn && r.marketNameKn ? r.marketNameKn : r.marketName;
                const rLbl = isKn && r.roleLabelKn ? r.roleLabelKn : r.roleLabel;
                const rolePillCls = r.role === 'inflow_hub' ? 'regime-demand_rally' : (r.role === 'statewide' ? '' : 'regime-supply_shortage');
                const peakSub = r.isStatewide && r.peakAllYardsPrice && r.peakAllYardsPrice > (r.peak2026Price || 0)
                    ? ('<div class="small av-text-muted" style="font-size:0.68rem;">All 34: ₹' + fmt(r.peakAllYardsPrice, 0) + ' (' + esc(r.peakAllYardsMarket) + ')</div>')
                    : '';

                tr.innerHTML =
                    '<td class="fw-bold av-text-strong">' + esc(mName) + '</td>' +
                    '<td><span class="av-regime-pill ' + rolePillCls + '">' + esc(rLbl) + '</span></td>' +
                    '<td class="font-monospace">₹' + fmt(r.octPrevPrice, 1) + '</td>' +
                    '<td class="font-monospace fw-bold av-text-strong">₹' + fmt(r.octCurrPrice, 1) + '</td>' +
                    '<td class="font-monospace fw-bold ' + pctColorClass(r.priceChangePct) + '">' + esc(formatSignedPct(r.priceChangePct)) + '</td>' +
                    '<td class="font-monospace av-text-muted">' + fmt(r.octPrevArrivals, 0) + '</td>' +
                    '<td class="font-monospace av-text-strong">' + fmt(r.octCurrArrivals, 0) + '</td>' +
                    '<td class="font-monospace fw-bold ' + pctColorClass(r.arrivalsChangePct) + '">' + esc(formatSignedPct(r.arrivalsChangePct)) + '</td>' +
                    '<td class="font-monospace av-accent-warm fw-bold">₹' + fmt(r.peak2026Price, 1) + peakSub + '</td>' +
                    '<td class="text-end">' +
                        '<div class="d-inline-flex gap-1">' +
                            '<button type="button" class="av-btn-ab btn-rep-inspect">' + esc(t('repInspectBtn')) + '</button>' +
                            '<button type="button" class="av-btn-ab btn-rep-matrix" title="Compare Oct 2025 vs Oct 2026 in % Δ Matrix">% Δ</button>' +
                        '</div>' +
                    '</td>';

                tr.addEventListener('click', e => {
                    if (e.target.closest('.btn-rep-matrix')) return;
                    if (reportState.market !== r.market) {
                        reportState.market = r.market;
                        loadAnalysisReport(reportState.reportId, r.market);
                    }
                });
                tr.querySelector('.btn-rep-matrix')?.addEventListener('click', e => {
                    e.stopPropagation();
                    openOctComparisonInMatrix(r.market, rep.commodity);
                });
                tb1.appendChild(tr);
            });
        }

        const activeRow = rows.find(r => r.market === reqMkt) || rows[0];
        const obsEl = document.getElementById('repMarketObsNote');
        if (obsEl && activeRow) {
            const mTitle = isKn && activeRow.marketNameKn ? activeRow.marketNameKn : activeRow.marketName;
            const noteTxt = isKn && activeRow.noteKn ? activeRow.noteKn : activeRow.note;
            obsEl.innerHTML = '<strong>' + esc(mTitle) + ':</strong> ' + esc(noteTxt);
        }

        const sdObj = payload.seasonalDynamics || {};
        const tagMkt = document.getElementById('repSeasonalActiveMarketTag');
        if (tagMkt) tagMkt.textContent = (isKn && sdObj.marketNameKn ? sdObj.marketNameKn : (sdObj.marketName || reqMkt)).toUpperCase();
        const tagLat = document.getElementById('repSeasonalLatestTag');
        if (tagLat) tagLat.textContent = (isKn ? '2026 ಲೈವ್: ' : '2026 live through ') + (sdObj.latestCurrYearDate || '--');

        // Section 3: AI Price Outlook
        const fc = payload.priceOutlook || {};
        const ms = payload.modelSpec || {};
        // Dynamically update the section heading with actual cutoff/end dates from the payload
        const outlookHead = document.getElementById('repOutlookHeading');
        if (outlookHead) {
            const modelName = isKn && ms.nameKn ? ms.nameKn : (ms.name || 'Fine-Tuned Timestral 123M');
            const cOff = fc.cutoffDate || rep.forecastCutoff || '--';
            const eDate = fc.endDate || rep.forecastEnd || '--';
            outlookHead.textContent = isKn
                ? modelName + ' AI ಮುನ್ಸೂಚನೆ (' + cOff + ' – ' + eDate + ')'
                : 'AI Price Outlook: ' + modelName + ' (' + cOff + ' – ' + eDate + ')';
        }
        const secBadge = document.getElementById('repOutlookSectionBadge');
        if (secBadge) secBadge.textContent = 'Sec ' + (fc.sectionRef || '3.2') + ' • ' + (fc.marketName || fc.market);
        const fbBanner = document.getElementById('repForecastFallbackBanner');
        if (fbBanner) fbBanner.classList.toggle('d-none', !fc.isFallbackFromStatewide);

        const specsRow = document.getElementById('repModelSpecsRow');
        if (specsRow) {
            const chips = [
                ['fa-brain av-accent-primary', (isKn && ms.nameKn ? ms.nameKn : ms.name)],
                ['fa-bullseye av-accent-warm', ms.loss || 'Tilde-q Loss'],
                ['fa-clock-rotate-left av-accent-teal', (ms.lookbackDays || 512) + 'd Lookback → ' + (ms.horizonDays || 78) + 'd Horizon'],
                ['fa-wave-square av-bull-text', isKn && ms.featuresKn ? ms.featuresKn : (ms.features || '')]
            ];
            specsRow.innerHTML = chips.map(([ico, txt]) =>
                '<span class="av-spec-chip"><i class="fa-solid ' + ico + '"></i><span>' + esc(txt) + '</span></span>'
            ).join('');
        }

        const alertEl = document.getElementById('repFcMspAlert');
        if (alertEl) {
            const riskCls = fc.mspRisk === 'high' ? 'regime-supply_glut' : (fc.mspRisk === 'elevated' ? 'regime-demand_softening' : 'regime-demand_rally');
            alertEl.className = 'av-regime-pill ' + riskCls;
            alertEl.textContent = isKn && fc.mspRiskLabelKn ? fc.mspRiskLabelKn : (fc.mspRiskLabel || '--');
        }

        const cOffEl = document.getElementById('repFcCutoffPrice');
        if (cOffEl) cOffEl.textContent = '₹' + fmt(fc.cutoffApproxPrice, 0) + '/q';
        const medEl = document.getElementById('repFcMedianRange');
        if (medEl) medEl.textContent = fc.medianRange || '--';
        const bandEl = document.getElementById('repFcBandLateDec');
        if (bandEl) bandEl.textContent = fc.bandLateDec || '--';
        const mspDistEl = document.getElementById('repFcMspDistance');
        const ev = fc.evaluation || {};
        if (mspDistEl) {
            mspDistEl.textContent = (ev.premiumOverMspPct != null ? formatSignedPct(ev.premiumOverMspPct) + ' vs ' : 'vs ') +
                'MSP ₹' + fmt(fc.mspValue || 5708, 0) + '/q';
        }
        const liveEvalEl = document.getElementById('repFcLiveEval');
        const liveEvalSubEl = document.getElementById('repFcLiveEvalSub');
        if (liveEvalEl) {
            liveEvalEl.textContent = ev.realizedDays
                ? (fmt(ev.insideBandPct, 1) + '% In-Band • MAE ₹' + fmt(ev.meanAbsError, 0))
                : 'No post-cutoff sessions';
        }
        if (liveEvalSubEl) {
            liveEvalSubEl.textContent = ev.realizedDays
                ? (ev.realizedDays + (isKn ? ' ದಿನ (ಕೊನೆಯ: ₹' : ' days • Latest ₹') + fmt(ev.latestActualPrice, 0) + ' on ' + ev.latestActualDate + (isKn ? ')' : ''))
                : '--';
        }
        const fcNarrEl = document.getElementById('repFcMarketNarrative');
        if (fcNarrEl) fcNarrEl.textContent = isKn && fc.narrativeKn ? fc.narrativeKn : (fc.narrative || '');

        // Section 4: Extreme Events & Model Resilience
        const exGrid = document.getElementById('repExtremeEventsGrid');
        if (exGrid) {
            exGrid.innerHTML = '';
            (payload.extremeEvents || []).forEach(evItem => {
                const col = document.createElement('div');
                col.className = 'col-lg-4';
                const tagTxt = isKn && evItem.tagKn ? evItem.tagKn : evItem.tag;
                const ttlTxt = isKn && evItem.titleKn ? evItem.titleKn : evItem.title;
                const bodyTxt = isKn && evItem.bodyKn ? evItem.bodyKn : evItem.body;
                col.innerHTML =
                    '<div class="av-subpanel h-100">' +
                        '<div class="d-flex align-items-center justify-content-between gap-2 mb-2">' +
                            '<span class="badge av-surface-badge font-monospace">' + esc(evItem.market) + '</span>' +
                            '<span class="small fw-bold av-accent-warm">' + esc(tagTxt) + '</span>' +
                        '</div>' +
                        '<h4 class="fs-6 fw-bold av-text-strong mb-2">' + esc(ttlTxt) + '</h4>' +
                        '<p class="small av-text-body mb-0">' + esc(bodyTxt) + '</p>' +
                    '</div>';
                exGrid.appendChild(col);
            });
        }
        const resEl = document.getElementById('repResilienceNote');
        if (resEl) {
            resEl.textContent = isKn && payload.modelResilienceNoteKn ? payload.modelResilienceNoteKn : (payload.modelResilienceNote || '');
        }

        // Section 5: KSAMB Action Points
        const actList = document.getElementById('repActionPointsList');
        if (actList) {
            actList.innerHTML = '';
            (payload.actionPoints || []).forEach(ap => {
                const item = document.createElement('div');
                item.className = 'av-stack-item';
                item.innerHTML =
                    '<div class="d-flex align-items-center justify-content-between gap-2 mb-1">' +
                        '<div class="fw-bold small av-text-strong">' + esc(isKn && ap.titleKn ? ap.titleKn : ap.title) + '</div>' +
                        '<span class="av-regime-pill regime-demand_rally">' + esc(isKn && ap.badgeKn ? ap.badgeKn : ap.badge) + '</span>' +
                    '</div>' +
                    '<div class="small av-text-body">' + esc(isKn && ap.bodyKn ? ap.bodyKn : ap.body) + '</div>';
                actList.appendChild(item);
            });
        }

        // Section 6: Proposed 2026-27 Interventions
        const intList = document.getElementById('repInterventionsList');
        if (intList) {
            intList.innerHTML = '';
            (payload.interventions || []).forEach(iv => {
                const item = document.createElement('div');
                item.className = 'av-stack-item';
                item.innerHTML =
                    '<div class="d-flex align-items-center justify-content-between gap-2 mb-1">' +
                        '<div class="d-flex align-items-center gap-2">' +
                            '<span class="av-step-badge">' + esc(String(iv.step)) + '</span>' +
                            '<span class="fw-bold small av-text-strong">' + esc(isKn && iv.titleKn ? iv.titleKn : iv.title) + '</span>' +
                        '</div>' +
                        '<span class="badge av-surface-badge font-monospace">' + esc(iv.yardTag) + '</span>' +
                    '</div>' +
                    '<div class="small av-text-body">' + esc(isKn && iv.bodyKn ? iv.bodyKn : iv.body) + '</div>';
                intList.appendChild(item);
            });
        }

        // Section 7: Risk Scenario Response Framework (Table 2) & References
        const rf = payload.riskFramework || {};
        const scopeEl = document.getElementById('repRiskScopeNote');
        if (scopeEl) scopeEl.textContent = isKn && rf.analyticalScopeKn ? rf.analyticalScopeKn : (rf.analyticalScope || '');

        const extList = document.getElementById('repExternalitiesList');
        if (extList) {
            const arr = isKn && Array.isArray(rf.externalitiesKn) ? rf.externalitiesKn : (rf.externalities || []);
            extList.innerHTML = arr.map(txt =>
                '<span class="av-ext-chip"><i class="fa-solid fa-bolt av-accent-warm"></i><span>' + esc(txt) + '</span></span>'
            ).join('');
        }

        const rBody = document.getElementById('repRiskMatrixBody');
        if (rBody) {
            rBody.innerHTML = '';
            (rf.scenarios || []).forEach(sc => {
                const tr = document.createElement('tr');
                const sevCls = sc.severity === 'upside' ? 'regime-demand_rally' : (sc.severity === 'downside' ? 'regime-supply_glut' : 'regime-demand_softening');
                tr.innerHTML =
                    '<td class="fw-bold av-text-strong"><span class="av-regime-pill ' + sevCls + ' mb-1">' + esc(sc.severity.toUpperCase()) + '</span><div>' + esc(isKn && sc.scenarioKn ? sc.scenarioKn : sc.scenario) + '</div></td>' +
                    '<td class="av-text-body">' + esc(isKn && sc.impactKn ? sc.impactKn : sc.impact) + '</td>' +
                    '<td class="av-bull-text fw-semibold">' + esc(isKn && sc.responseKn ? sc.responseKn : sc.response) + '</td>';
                rBody.appendChild(tr);
            });
        }

        const refsList = document.getElementById('repReferencesList');
        if (refsList) {
            refsList.innerHTML = (payload.references || []).map(r =>
                '<li>' + esc(r.citation) + (r.url ? (' — <a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">' + esc(r.url) + '</a>') : '') + '</li>'
            ).join('');
        }

        renderReportCharts(payload);
    }

    async function loadAnalysisReport(reportId, market) {
        const seq = ++reportState.seq;
        const targetId = reportId || reportState.reportId || 'tr1_soyabean_2026';
        const targetMkt = market || reportState.market || 'BIDAR';
        try {
            const payload = await DataAdapter.getAnalysisReport(targetId, targetMkt);
            if (seq !== reportState.seq) return;
            reportState.reportId = targetId;
            reportState.market = payload.selectedMarket || targetMkt;
            reportState.data = payload;
            renderReportPayload(payload);
        } catch (err) {
            console.error('loadAnalysisReport failed:', err);
        }
    }

    async function initAnalysisReportTab() {
        reportState.initialized = true;
        try {
            const list = await DataAdapter.listAnalysisReports();
            reportState.reportsList = Array.isArray(list) ? list : [];
            if (reportState.reportsList.length && !reportState.reportsList.some(r => r.id === reportState.reportId)) {
                reportState.reportId = reportState.reportsList[0].id;
            }
            populateReportSelectDropdown();
        } catch (err) {
            console.error('listAnalysisReports failed:', err);
        }
        await loadAnalysisReport(reportState.reportId, reportState.market);
    }

    // ---------------------------------------------------------
    // Seamless English <-> Kannada UI Application
    // ---------------------------------------------------------
    function applyLanguage(newLang) {
        if (!window.I18N) return;
        window.I18N.setLang(newLang);
        window.I18N.applyStaticTranslations();

        document.getElementById('btnLangEn')?.classList.toggle('active', newLang === 'en');
        document.getElementById('btnLangKn')?.classList.toggle('active', newLang === 'kn');

        applyTheme(activeTheme);
        syncChartToolbarUI();
        updateDataModeBadge();
        syncApmcSelectionUI(currentApmc);
        renderQuickMandiChips();

        if (currentSummary) renderSummary(currentSummary);
        if (allCommodities.length) {
            updateMarketMetrics(allCommodities);
            const filtered = filterCommodities({ syncHero: false });
            const found = filtered.find(c => String(c.commodityId) === String(selectedCommodityId)) || filtered[0];
            if (found) renderHeroCommodityDetails(found);
            else clearHeroTerminal();
            if (found) loadChartForCommodity(found);
        } else {
            filterCommodities({ syncHero: false });
            clearHeroTerminal();
        }
        if (activeWorkspaceTab === 'movers') {
            loadStatewideMoversPanel();
        }
        if (analysisState.initialized) {
            populateAnalysisMarketSelect();
            if (analysisState.matrixData) {
                syncAnalysisSelectsFromState(analysisState.matrixData);
                renderAnalysisSummary(analysisState.matrixData);
                renderAnalysisMatrixTable(analysisState.matrixData);
            }
            if (analysisState.compareData) {
                renderPeriodComparison(analysisState.compareData);
            }
            renderAnalysisChart();
        }
        if (reportState.initialized) {
            populateReportSelectDropdown();
            if (reportState.data) {
                renderReportPayload(reportState.data);
            }
        }
        updateWorkspaceContextPills();
    }

    // ---------------------------------------------------------
    // Wire All Terminal Event Listeners
    // ---------------------------------------------------------
    function wireControls() {
        document.getElementById('btnLangEn')?.addEventListener('click', () => applyLanguage('en'));
        document.getElementById('btnLangKn')?.addEventListener('click', () => applyLanguage('kn'));
        document.getElementById('btnThemeToggle')?.addEventListener('click', () => {
            applyTheme(activeTheme === 'dark' ? 'light' : 'dark');
        });

        document.getElementById('btnToggleSidebar')?.addEventListener('click', () => setSidebarCollapsed(true));
        document.getElementById('btnShowSidebar')?.addEventListener('click', () => setSidebarCollapsed(false));

        document.getElementById('navTabTerminal')?.addEventListener('click', () => switchWorkspaceTab('terminal'));
        document.getElementById('navTabMovers')?.addEventListener('click', () => switchWorkspaceTab('movers'));
        document.getElementById('navTabAdvisory')?.addEventListener('click', () => switchWorkspaceTab('advisory'));
        document.getElementById('navTabAnalysis')?.addEventListener('click', () => switchWorkspaceTab('analysis'));
        document.getElementById('btnMoversBackToTerminal')?.addEventListener('click', () => switchWorkspaceTab('terminal'));
        document.getElementById('btnAdvisoryBackToTerminal')?.addEventListener('click', () => switchWorkspaceTab('terminal'));
        document.getElementById('btnAnalysisBackToTerminal')?.addEventListener('click', () => switchWorkspaceTab('terminal'));
        document.getElementById('btnReportBackToTerminal')?.addEventListener('click', () => switchWorkspaceTab('terminal'));
        document.getElementById('btnRefreshMovers')?.addEventListener('click', loadStatewideMoversPanel);

        // Analysis Sub-View & Technical Report controls
        document.getElementById('btnAnalysisSubReport')?.addEventListener('click', () => switchAnalysisSubView('report'));
        document.getElementById('btnAnalysisSubMatrix')?.addEventListener('click', () => switchAnalysisSubView('matrix'));
        document.getElementById('analysisReportSelect')?.addEventListener('change', function () {
            reportState.reportId = this.value || 'tr1_soyabean_2026';
            loadAnalysisReport(reportState.reportId, reportState.market);
        });
        document.getElementById('btnReportLoadTerminal')?.addEventListener('click', loadReportCommodityInChartDesk);
        document.getElementById('btnReportJumpMatrix')?.addEventListener('click', () => {
            const com = reportState.data?.report?.commodity || 'SOYABEEN';
            openOctComparisonInMatrix(reportState.market || 'BIDAR', com);
        });

        // Phase 3 Multi-Year Matrix & Period Differential controls
        document.getElementById('btnSyncTerminalToAnalysis')?.addEventListener('click', () => initAnalysisTab(true));
        document.getElementById('btnExportAnalysisCsv')?.addEventListener('click', exportAnalysisMatrixCsv);
        document.getElementById('analysisMarketSelect')?.addEventListener('change', function () {
            analysisState.market = this.value;
            loadMultiYearAnalysis(true, true);
        });
        document.getElementById('analysisCommoditySelect')?.addEventListener('change', function () {
            analysisState.commodity = this.value;
            loadMultiYearAnalysis(true, false);
        });
        document.getElementById('analysisYearsSelect')?.addEventListener('change', function () {
            const yrs = parseInt(this.value, 10);
            analysisState.years = isNaN(yrs) ? 5 : yrs;
            loadMultiYearAnalysis(false, false);
        });
        document.getElementById('analysisGranularitySelect')?.addEventListener('change', function () {
            analysisState.granularity = this.value === 'monthly' ? 'monthly' : 'annual';
            loadMultiYearAnalysis(true, false);
        });
        document.getElementById('analysisFocusMonthSelect')?.addEventListener('change', function () {
            analysisState.focusMonth = this.value || '';
            loadMultiYearAnalysis(true, false);
        });
        document.getElementById('comparePeriodASelect')?.addEventListener('change', function () {
            analysisState.periodA = this.value;
            renderAnalysisMatrixTable(analysisState.matrixData);
            loadPeriodComparison();
        });
        document.getElementById('comparePeriodBSelect')?.addEventListener('change', function () {
            analysisState.periodB = this.value;
            renderAnalysisMatrixTable(analysisState.matrixData);
            loadPeriodComparison();
        });
        document.getElementById('btnSwapComparePeriods')?.addEventListener('click', () => {
            const tmp = analysisState.periodA;
            analysisState.periodA = analysisState.periodB;
            analysisState.periodB = tmp;
            const sA = document.getElementById('comparePeriodASelect');
            const sB = document.getElementById('comparePeriodBSelect');
            if (sA) sA.value = analysisState.periodA;
            if (sB) sB.value = analysisState.periodB;
            renderAnalysisMatrixTable(analysisState.matrixData);
            loadPeriodComparison();
        });
        document.getElementById('btnRunPeriodCompare')?.addEventListener('click', loadPeriodComparison);
        document.getElementById('btnAnalysisChartPeriod')?.addEventListener('click', () => {
            analysisState.chartMode = 'period';
            syncAnalysisChartModeUI();
            renderAnalysisChart();
        });
        document.getElementById('btnAnalysisChartMatrix')?.addEventListener('click', () => {
            analysisState.chartMode = 'matrix';
            syncAnalysisChartModeUI();
            renderAnalysisChart();
        });

        document.getElementById('btnSync')?.addEventListener('click', handleManualSync);
        document.getElementById('btnScrapeLatest')?.addEventListener('click', () => handleKmvahiniSyncClick('header'));
        document.getElementById('btnRetryBackend')?.addEventListener('click', handleManualSync);
        document.getElementById('btnInspectApi')?.addEventListener('click', openApiInspectorModal);
        document.getElementById('btnRunKmvahiniSync')?.addEventListener('click', () => handleKmvahiniSyncClick('modal'));
        document.getElementById('btnClearQueryFilters')?.addEventListener('click', clearAllQueryFilters);
        document.getElementById('btnEmptyResetFilters')?.addEventListener('click', clearAllQueryFilters);

        document.getElementById('btnDeepAnalytics')?.addEventListener('click', e => {
            e.preventDefault();
            openCommodityAnalyticsModal(null);
        });

        document.getElementById('txtSearch')?.addEventListener('input', () => {
            filterCommodities({ syncHero: true, preferTopRanked: true, immediateChart: false });
        });
        document.getElementById('sortSelect')?.addEventListener('change', () => {
            filterCommodities({ syncHero: true, preferTopRanked: true, immediateChart: true });
        });

        // Timeframe buttons (7D, 15D, 30D, 90D, 1Y, ALL)
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const days = parseInt(btn.getAttribute('data-days'), 10);
                currentPeriodDays = isNaN(days) ? 30 : days;
                if (currentPeriodDays === 0 && currentInterval === 'daily') {
                    currentInterval = 'monthly';
                } else if (currentPeriodDays > 0 && currentPeriodDays <= 15 && currentInterval === 'monthly') {
                    currentInterval = 'daily';
                }
                syncChartToolbarUI();
                const found = allCommodities.find(c => String(c.commodityId) === String(selectedCommodityId));
                if (found) loadChartForCommodity(found);
            });
        });

        // Candle interval toggle (1D | 1W | 1M)
        document.querySelectorAll('.interval-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const ivl = btn.getAttribute('data-interval') || 'daily';
                currentInterval = (ivl === 'weekly' || ivl === 'monthly') ? ivl : 'daily';
                if (currentInterval === 'daily' && currentPeriodDays === 0) {
                    currentPeriodDays = 365;
                }
                syncChartToolbarUI();
                const found = allCommodities.find(c => String(c.commodityId) === String(selectedCommodityId));
                if (found) loadChartForCommodity(found);
            });
        });

        // Chart style toggle (Candlestick <-> Line Chart <-> High-Low Band)
        function setChartStyle(style) {
            currentChartStyle = (style === 'glow' || style === 'band') ? style : 'candlestick';
            try {
                localStorage.setItem('agrivaahan_chart_style', currentChartStyle);
            } catch (_) {
                // Ignore storage errors
            }
            syncChartToolbarUI();
            if (lastChartRenderPayload && String(lastChartRenderPayload.commodity?.commodityId) === String(selectedCommodityId)) {
                const p = lastChartRenderPayload;
                renderStockMarketChart(p.seriesBars, p.warmupBars, p.commodity);
            } else {
                const found = allCommodities.find(c => String(c.commodityId) === String(selectedCommodityId));
                if (found) loadChartForCommodity(found);
            }
        }

        document.getElementById('btnStyleCandle')?.addEventListener('click', () => setChartStyle('candlestick'));
        document.getElementById('btnStyleGlow')?.addEventListener('click', () => setChartStyle('glow'));
        document.getElementById('btnStyleBand')?.addEventListener('click', () => setChartStyle('band'));

        // Technical Indicator overlay toggles (SMA 7/20/50, EMA 12, RSI 14)
        document.querySelectorAll('[data-ind]').forEach(btn => {
            btn.addEventListener('click', function () {
                const ind = btn.getAttribute('data-ind');
                if (!ind || !Object.prototype.hasOwnProperty.call(activeIndicators, ind)) return;
                activeIndicators[ind] = !activeIndicators[ind];
                syncChartToolbarUI();
                if (lastChartRenderPayload) {
                    const p = lastChartRenderPayload;
                    renderStockMarketChart(p.seriesBars, p.warmupBars, p.commodity);
                }
            });
        });

        // Screener pills
        document.querySelectorAll('.screener-pill').forEach(btn => {
            btn.addEventListener('click', function () {
                activeScreener = btn.getAttribute('data-screener');
                document.querySelectorAll('.screener-pill').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                filterCommodities({ syncHero: true, preferTopRanked: false, immediateChart: true });
            });
        });

        // View mode toggle
        document.getElementById('btnViewCards')?.addEventListener('click', function () {
            currentViewMode = 'cards';
            this.classList.add('active');
            document.getElementById('btnViewTable')?.classList.remove('active');
            filterCommodities({ syncHero: false });
        });

        document.getElementById('btnViewTable')?.addEventListener('click', function () {
            currentViewMode = 'table';
            this.classList.add('active');
            document.getElementById('btnViewCards')?.classList.remove('active');
            filterCommodities({ syncHero: false });
        });

        // Category tags
        document.querySelectorAll('#categoryBar .cat-tag').forEach(tag => {
            tag.addEventListener('click', function () {
                activeCategory = tag.getAttribute('data-group');
                document.querySelectorAll('#categoryBar .cat-tag').forEach(tEl => tEl.classList.remove('active'));
                tag.classList.add('active');
                filterCommodities({ syncHero: true, preferTopRanked: false, immediateChart: true });
            });
        });
    }

    // ---------------------------------------------------------
    // Boot Sequence
    // ---------------------------------------------------------
    document.addEventListener('DOMContentLoaded', async function () {
        updateHeaderClock();
        setInterval(updateHeaderClock, 1000);

        await DataAdapter.detectBackend();
        yardsList = await DataAdapter.getMarkets();

        if (!isLiveBackend) {
            currentApmc = 32; // APMC, YESHWANTHPUR, BENGALURU in MockMarketApi
        } else {
            currentApmc = yardsList.some(y => y.id === 'BENGALURU') ? 'BENGALURU' : (yardsList[0]?.id || 'BENGALURU');
        }

        // Apply initial persisted language before rendering dynamic chrome
        const initialLang = lang();
        if (window.I18N) {
            window.I18N.setLang(initialLang);
            window.I18N.applyStaticTranslations();
        }
        document.getElementById('btnLangEn')?.classList.toggle('active', initialLang === 'en');
        document.getElementById('btnLangKn')?.classList.toggle('active', initialLang === 'kn');

        applyTheme(activeTheme);
        syncChartToolbarUI();
        setSidebarCollapsed(sidebarCollapsed);
        updateDataModeBadge();
        initApmcCombobox();
        renderQuickMandiChips();
        wireControls();
        switchWorkspaceTab('terminal');

        await loadMarket(false);

        if (isLiveBackend) {
            try {
                const syncJob = await DataAdapter.getSyncStatus();
                if (syncJob && syncJob.state === 'running') {
                    lastObservedBatches = Number(syncJob.completed_batches || 0);
                    applyRunningScrapeState(syncJob);
                    startSyncPolling();
                }
            } catch (_) {
                // Ignore initial status probe errors
            }
        }
    });
})();
