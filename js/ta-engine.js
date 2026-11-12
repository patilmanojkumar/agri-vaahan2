/* =====================================================================
   Agri Vaahan (ಅಗ್ರಿ ವಾಹನ) — Technical Analysis & OHLC Candlestick Engine
   Provides:
     - Moving averages (SMA 7/20/50, EMA 12) & Wilder RSI(14) with warmup support
     - Automated trend, golden/death cross, momentum & volume surge signal summary
     - Custom Chart.js 4.x OHLC Candlestick plugin (zero CDN plugin dependency)
   ===================================================================== */

(function (global) {
    'use strict';

    function computeSMA(values, period) {
        const n = values.length;
        const out = new Array(n).fill(null);
        if (!n || period <= 0) return out;
        let sum = 0;
        let validCount = 0;
        for (let i = 0; i < n; i++) {
            const v = Number(values[i]);
            if (Number.isFinite(v) && v > 0) {
                sum += v;
                validCount++;
            }
            if (i >= period) {
                const old = Number(values[i - period]);
                if (Number.isFinite(old) && old > 0) {
                    sum -= old;
                    validCount--;
                }
            }
            if (i >= period - 1 && validCount === period) {
                out[i] = Math.round((sum / period) * 100) / 100;
            }
        }
        return out;
    }

    function computeEMA(values, period) {
        const n = values.length;
        const out = new Array(n).fill(null);
        if (n < period || period <= 0) return out;

        const clean = values.map(v => {
            const num = Number(v);
            return Number.isFinite(num) && num > 0 ? num : null;
        });

        // Seed first EMA point using SMA of first `period` valid entries
        let seedSum = 0;
        for (let i = 0; i < period; i++) {
            if (clean[i] == null) return out;
            seedSum += clean[i];
        }
        let ema = seedSum / period;
        out[period - 1] = Math.round(ema * 100) / 100;
        const k = 2 / (period + 1);

        for (let i = period; i < n; i++) {
            const val = clean[i] != null ? clean[i] : ema;
            ema = val * k + ema * (1 - k);
            out[i] = Math.round(ema * 100) / 100;
        }
        return out;
    }

    function computeRSI(values, period) {
        const p = period || 14;
        const n = values.length;
        const out = new Array(n).fill(null);
        if (n <= p) return out;

        let gainSum = 0;
        let lossSum = 0;
        for (let i = 1; i <= p; i++) {
            const cur = Number(values[i] || 0);
            const prev = Number(values[i - 1] || 0);
            const diff = cur - prev;
            if (diff >= 0) gainSum += diff;
            else lossSum += Math.abs(diff);
        }

        let avgGain = gainSum / p;
        let avgLoss = lossSum / p;
        out[p] = avgLoss === 0 ? 100 : Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 100) / 100;

        for (let i = p + 1; i < n; i++) {
            const cur = Number(values[i] || 0);
            const prev = Number(values[i - 1] || 0);
            const diff = cur - prev;
            const gain = diff > 0 ? diff : 0;
            const loss = diff < 0 ? Math.abs(diff) : 0;

            avgGain = ((avgGain * (p - 1)) + gain) / p;
            avgLoss = ((avgLoss * (p - 1)) + loss) / p;
            if (avgLoss === 0 && avgGain === 0) {
                out[i] = 50;
            } else if (avgLoss === 0) {
                out[i] = 100;
            } else {
                const rs = avgGain / avgLoss;
                out[i] = Math.round((100 - 100 / (1 + rs)) * 100) / 100;
            }
        }
        return out;
    }

    function computeTechnicalPack(warmupBars, seriesBars) {
        const warm = Array.isArray(warmupBars) ? warmupBars : [];
        const visible = Array.isArray(seriesBars) ? seriesBars : [];
        const combined = warm.concat(visible);
        const offset = warm.length;

        const closes = combined.map(b => Number(b.close != null ? b.close : (b.price || 0)));
        const vols = combined.map(b => Number(b.arrival || 0));

        const fullSma7 = computeSMA(closes, 7);
        const fullSma20 = computeSMA(closes, 20);
        const fullSma50 = computeSMA(closes, 50);
        const fullEma12 = computeEMA(closes, 12);
        const fullRsi14 = computeRSI(closes, 14);
        const fullVolSma20 = computeSMA(vols, 20);

        const sma7 = fullSma7.slice(offset);
        const sma20 = fullSma20.slice(offset);
        const sma50 = fullSma50.slice(offset);
        const ema12 = fullEma12.slice(offset);
        const rsi14 = fullRsi14.slice(offset);

        const lastIdx = visible.length - 1;
        const latestClose = lastIdx >= 0 ? Number(visible[lastIdx].close != null ? visible[lastIdx].close : (visible[lastIdx].price || 0)) : null;
        const latestSma7 = lastIdx >= 0 ? sma7[lastIdx] : null;
        const latestSma20 = lastIdx >= 0 ? sma20[lastIdx] : null;
        const latestSma50 = lastIdx >= 0 ? sma50[lastIdx] : null;
        const latestEma12 = lastIdx >= 0 ? ema12[lastIdx] : null;
        const latestRsi = lastIdx >= 0 ? rsi14[lastIdx] : null;
        const latestVol = lastIdx >= 0 ? Number(visible[lastIdx].arrival || 0) : null;
        const avgVol20 = fullVolSma20.length ? fullVolSma20[fullVolSma20.length - 1] : null;

        let trendVsSma20Pct = null;
        if (latestClose != null && latestSma20 != null && latestSma20 > 0) {
            trendVsSma20Pct = Math.round(((latestClose - latestSma20) / latestSma20) * 1000) / 10;
        }

        let crossState = 'neutral';
        if (latestSma20 != null && latestSma50 != null) {
            if (latestSma20 > latestSma50 * 1.001) crossState = 'golden';
            else if (latestSma20 < latestSma50 * 0.999) crossState = 'death';
        }

        let rsiZone = 'neutral';
        if (latestRsi != null) {
            if (latestRsi >= 70) rsiZone = 'overbought';
            else if (latestRsi <= 30) rsiZone = 'oversold';
        }

        let volSurgePct = null;
        if (latestVol != null && avgVol20 != null && avgVol20 > 0) {
            volSurgePct = Math.round(((latestVol - avgVol20) / avgVol20) * 1000) / 10;
        }

        return {
            sma7,
            sma20,
            sma50,
            ema12,
            rsi14,
            signals: {
                latestClose,
                latestSma7,
                latestSma20,
                latestSma50,
                latestEma12,
                latestRsi,
                rsiZone,
                trendVsSma20Pct,
                crossState,
                volSurgePct
            }
        };
    }

    // Custom Chart.js 4.x Plugin drawing TradingView-crisp OHLC wicks & bodies
    const candlestickPlugin = {
        id: 'agriVaahanCandlestick',
        afterDatasetDraw(chart, args) {
            const dsIndex = args?.index;
            if (dsIndex == null) return;
            const ds = chart.data.datasets[dsIndex];
            if (!ds || !ds.isCandlestick) return;

            const meta = chart.getDatasetMeta(dsIndex);
            if (!meta || meta.hidden || !Array.isArray(ds.ohlcBars) || !meta.data) return;

            const yScale = chart.scales[ds.yAxisID || 'y'];
            const area = chart.chartArea;
            if (!yScale || !area) return;

            const ctx = chart.ctx;
            const colors = ds.candleColors || {
                bullFill: '#089981',
                bearFill: '#f23645',
                wickBull: '#089981',
                wickBear: '#f23645'
            };

            ctx.save();
            ctx.beginPath();
            ctx.rect(area.left - 4, area.top - 4, area.right - area.left + 8, area.bottom - area.top + 8);
            ctx.clip();

            const count = ds.ohlcBars.length;
            const firstElemWidth = meta.data[0]?.width || 20;
            const approxSlot = count > 1
                ? Math.abs((meta.data[1]?.x || 0) - (meta.data[0]?.x || 0))
                : firstElemWidth;
            const bodyWidth = Math.max(4, Math.min(20, approxSlot * 0.62));

            for (let i = 0; i < count; i++) {
                const elem = meta.data[i];
                const bar = ds.ohlcBars[i];
                if (!elem || !bar || !Number.isFinite(elem.x)) continue;

                const o = Number(bar.open != null ? bar.open : bar.price);
                const c = Number(bar.close != null ? bar.close : bar.price);
                const h = Number(bar.high != null ? bar.high : Math.max(o, c));
                const l = Number(bar.low != null ? bar.low : Math.min(o, c));

                const x = elem.x;
                const yOpen = yScale.getPixelForValue(o);
                const yClose = yScale.getPixelForValue(c);
                const yHigh = yScale.getPixelForValue(h);
                const yLow = yScale.getPixelForValue(l);

                const isUp = c >= o;
                const fillColor = isUp ? colors.bullFill : colors.bearFill;
                const wickColor = isUp ? colors.wickBull : colors.wickBear;

                // 1) High-Low shadow wick
                ctx.strokeStyle = wickColor;
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(x, yHigh);
                ctx.lineTo(x, yLow);
                ctx.stroke();

                // 2) Open-Close candle body (minimum 2px visible height for doji sessions)
                const rawHeight = Math.abs(yClose - yOpen);
                const bodyTop = rawHeight < 2 ? Math.min(yOpen, yClose) - 1 : Math.min(yOpen, yClose);
                const bodyHeight = Math.max(2, rawHeight);

                ctx.fillStyle = fillColor;
                ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
            }

            ctx.restore();
        }
    };

    global.AgriTAEngine = {
        computeSMA,
        computeEMA,
        computeRSI,
        computeTechnicalPack,
        candlestickPlugin
    };
})(window);
