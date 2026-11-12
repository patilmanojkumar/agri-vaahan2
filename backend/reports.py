"""
Technical Reports & AI Price Outlook Engine (Analysis Tab Archive).

Starts with Technical Report 1 (Soyabean Crop — IISc CSA, Prof. Y. Narahari, Nov 10 2026)
and is designed as an extensible registry so future crop technical reports (e.g., Onion,
Tur, Cotton) can be registered seamlessly alongside live marukatte.duckdb queries.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

import duckdb

from .bilingual import get_commodity_meta, get_market_meta

MONTH_ABBR = [
    "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


def _safe_pct(cur: Optional[float], prev: Optional[float]) -> Optional[float]:
    if cur is None or prev is None or prev <= 0:
        return None
    return round(((cur - prev) / prev) * 100.0, 1)


def _interpolate_daily_anchors(
    start_dt: date,
    end_dt: date,
    anchors: List[Tuple[str, float, float, float, float]],
) -> Dict[str, Dict[str, float]]:
    """Interpolates (q10, q50_median, q90, zero_shot) smoothly onto every calendar date."""
    parsed: List[Tuple[int, float, float, float, float]] = []
    for ds, q10, q50, q90, zs in anchors:
        d = date.fromisoformat(ds)
        parsed.append(((d - start_dt).days, float(q10), float(q50), float(q90), float(zs)))
    parsed.sort(key=lambda x: x[0])

    total_days = (end_dt - start_dt).days
    out: Dict[str, Dict[str, float]] = {}
    for offset in range(total_days + 1):
        cur_dt = start_dt + timedelta(days=offset)
        ds = cur_dt.isoformat()
        if offset <= parsed[0][0]:
            _, q10, q50, q90, zs = parsed[0]
        elif offset >= parsed[-1][0]:
            _, q10, q50, q90, zs = parsed[-1]
        else:
            lo = parsed[0]
            hi = parsed[-1]
            for i in range(len(parsed) - 1):
                if parsed[i][0] <= offset <= parsed[i + 1][0]:
                    lo = parsed[i]
                    hi = parsed[i + 1]
                    break
            span = max(1, hi[0] - lo[0])
            w = (offset - lo[0]) / span
            q10 = lo[1] + (hi[1] - lo[1]) * w
            q50 = lo[2] + (hi[2] - lo[2]) * w
            q90 = lo[3] + (hi[3] - lo[3]) * w
            zs = lo[4] + (hi[4] - lo[4]) * w
        out[ds] = {
            "q10": round(q10, 1),
            "median": round(q50, 1),
            "q90": round(q90, 1),
            "zeroShot": round(zs, 1),
        }
    return out


# =====================================================================
# Extensible Technical Report Registry
# =====================================================================
TR1_SOYABEAN: Dict[str, Any] = {
    "id": "tr1_soyabean_2026",
    "number": 1,
    "programTitle": (
        "Price Prediction for Agricultural Crops using State-of-the-Art Techniques in "
        "Artificial Intelligence towards Innovative Recommendations for Policy and Interventions "
        "for Maximizing Farmer Welfare"
    ),
    "programTitleKn": (
        "ರೈತರ ಕಲ್ಯಾಣ ಹೆಚ್ಚಿಸಲು ನೀತಿ ಮತ್ತು ಮಾರುಕಟ್ಟೆ ಮಧ್ಯಸ್ಥಿಕೆಗಾಗಿ ಅತ್ಯಾಧುನಿಕ ಕೃತಕ ಬುದ್ಧಿಮತ್ತೆ "
        "(AI) ತಂತ್ರಜ್ಞಾನದಿಂದ ಕೃಷಿ ಬೆಳೆಗಳ ಬೆಲೆ ಮುನ್ಸೂಚನೆ ಮತ್ತು ವಿಶ್ಲೇಷಣೆ"
    ),
    "title": "Technical Report 1: Price Analysis, Prediction, and Recommendations for Soyabean Crop",
    "titleKn": "ತಾಂತ್ರಿಕ ವರದಿ 1: ಸೋಯಾಬೀನ್ ಬೆಳೆಯ ಬೆಲೆ ವಿಶ್ಲೇಷಣೆ, AI ಮುನ್ಸೂಚನೆ ಮತ್ತು ಶಿಫಾರಸುಗಳು",
    "shortTitle": "TR-1: Soyabean Crop (Nov 2026)",
    "shortTitleKn": "ವರದಿ 1: ಸೋಯಾಬೀನ್ (ನವೆಂ 2026)",
    "author": "Prof. Y. Narahari",
    "authorKn": "ಪ್ರೊ. ವೈ. ನರಹರಿ",
    "institution": "Department of Computer Science and Automation (CSA), Indian Institute of Science, Bengaluru",
    "institutionKn": "ಕಂಪ್ಯೂಟರ್ ವಿಜ್ಞಾನ ಮತ್ತು ಸ್ವಯಂಚಾಲನೆ ವಿಭಾಗ (CSA), ಭಾರತೀಯ ವಿಜ್ಞಾನ ಸಂಸ್ಥೆ (IISc), ಬೆಂಗಳೂರು",
    "reportDate": "2026-11-10",
    "commodity": "SOYABEEN",
    "msp": 5708.0,
    "mspSeason": "2026-27",
    "mspSourceRef": "[3] CCEA Approval (13 May 2026)",
    "mspSourceRefKn": "[3] CCEA ಅನುಮೋದನೆ (13 ಮೇ 2026)",
    "comparisonBaseYear": 2025,
    "comparisonCurrYear": 2026,
    "comparisonMonth": 10,
    "peakWindowStart": None,  # derived dynamically from comparisonCurrYear
    "seasonalYears": [2022, 2023, 2024, 2025, 2026],
    "seasonalStart": "09-01",
    "seasonalEnd": "12-31",
    "forecastHistoryStart": "2026-06-01",
    "forecastCutoff": "2026-10-14",
    "forecastEnd": "2026-12-31",
    "focusMarkets": ["BIDAR", "BAILHONGAL", "HUBBALLI", "KALABURAGI"],
    "marketRoles": {
        "BIDAR": {
            "role": "inflow_hub",
            "roleLabel": "Inflow & Border Hub",
            "roleLabelKn": "ಒಳಹರಿವು / ಗಡಿ ಮಂಡಿ",
            "note": (
                "Arrivals surged +43.5% yet modal price jumped +75.5% to ₹6,770.5/q (peaking ₹7,235/q). "
                "Unexpected co-rise driven by carryover stock clearance, Maharashtra (Latur/Nanded) & Telangana "
                "cross-border inflows seeking Karnataka's price premium, and early mill buying."
            ),
            "noteKn": (
                "ಆವಕ +43.5% ಹೆಚ್ಚಾದರೂ ಮಾದರಿ ದರ +75.5% ಏರಿ ₹6,770.5/ಕ್ವಿಂ ತಲುಪಿದೆ (ಗರಿಷ್ಠ ₹7,235/ಕ್ವಿಂ). "
                "ಮಹಾರಾಷ್ಟ್ರ (ಲಾತೂರ್/ನಾಂದೇಡ್) ಮತ್ತು ತೆಲಂಗಾಣದಿಂದ ಒಳಹರಿವು ಹಾಗೂ ಗಿರಣಿಗಳ ಮುಂಗಡ ಖರೀದಿ ಕಾರಣವಾಗಿದೆ."
            ),
        },
        "BAILHONGAL": {
            "role": "deficit_hub",
            "roleLabel": "Deficit / Early Harvest",
            "roleLabelKn": "ಕೊರತೆ / ಮುಂಗಡ ಕೊಯ್ಲು",
            "note": (
                "Oct arrivals fell -53.2% (largest absolute drop among the four markets) while modal price rose "
                "+57.0% to ₹6,131.5/q. Part of the drop reflects earlier harvest arrival concentration around Sep 20 (~17,000 q/d)."
            ),
            "noteKn": (
                "ಅಕ್ಟೋಬರ್ ಆವಕ -53.2% ಕುಸಿದು ಮಾದರಿ ದರ +57.0% ಏರಿ ₹6,131.5/ಕ್ವಿಂ ಆಗಿದೆ. "
                "ಬೆಳಗಾವಿ ಭಾಗದ ಇಳುವರಿ ಕುಸಿತ ಮತ್ತು ಸೆಪ್ಟೆಂಬರ್ 20ರ ಸುಮಾರಿಗೆ (~17,000 ಕ್ವಿಂ/ದಿನ) ಮುಂಗಡ ಆವಕ ಇದಕ್ಕೆ ಕಾರಣ."
            ),
        },
        "HUBBALLI": {
            "role": "deficit_hub",
            "roleLabel": "Deficit / Mill Competition",
            "roleLabelKn": "ಕೊರತೆ / ಗಿರಣಿ ಬೇಡಿಕೆ",
            "note": (
                "Arrivals fell -28.0% (23,099 → 16,637 q) while modal price surged +72.4% to ₹6,665.0/q. "
                "Regional solvent extraction plants and feed manufacturers competed sharply for scarce lots."
            ),
            "noteKn": (
                "ಆವಕ -28.0% ಇಳಿಕೆಯಾದರೂ ಮಾದರಿ ದರ +72.4% ಏರಿ ₹6,665.0/ಕ್ವಿಂ ತಲುಪಿದೆ. "
                "ಹುಬ್ಬಳ್ಳಿ-ಧಾರವಾಡದ ಎಣ್ಣೆ ಗಿರಣಿಗಳು ಮತ್ತು ಪಶು ಆಹಾರ ಘಟಕಗಳ ತೀವ್ರ ಪೈಪೋಟಿ ದರ ಏರಿಸಿದೆ."
            ),
        },
        "KALABURAGI": {
            "role": "deficit_hub",
            "roleLabel": "Severe Dry-Spell Deficit",
            "roleLabelKn": "ತೀವ್ರ ಬರ ಕೊರತೆ ಪ್ರಾಂಗಣ",
            "note": (
                "Arrivals collapsed -90.8% (11,838 → 1,092 q) alongside an isolated mid-September spike of ₹9,450/q "
                "and +67.5% Oct modal rise (to ₹6,263.5/q), reflecting flowering/pod-stage moisture stress."
            ),
            "noteKn": (
                "ಹೂ ಬಿಡುವ ಮತ್ತು ಕಾಯಿ ಕಟ್ಟುವ ಹಂತದಲ್ಲಿನ ತೇವಾಂಶ ಕೊರತೆಯಿಂದ ಆವಕ -90.8% ಕುಸಿದು (1,092 ಕ್ವಿಂ) "
                "ಸೆಪ್ಟೆಂಬರ್ ಮಧ್ಯದಲ್ಲಿ ₹9,450/ಕ್ವಿಂ ಗರಿಷ್ಠ ಹಾಗೂ ಅಕ್ಟೋಬರ್ ದರ +67.5% ಏರಿಕೆಯಾಗಿದೆ."
            ),
        },
        "ALL": {
            "role": "statewide",
            "roleLabel": "Statewide Weighted Benchmark",
            "roleLabelKn": "ರಾಜ್ಯವ್ಯಾಪಿ ತೂಕದ ಸರಾಸರಿ",
            "note": (
                "Across 34 active Soyabean APMCs, statewide production dropped -44% YoY. Arrivals fell -13.1% "
                "(5.94 → 5.16 L q) while arrival-weighted modal price jumped +63.8% (₹3,932.2 → ₹6,442.0/q)."
            ),
            "noteKn": (
                "ರಾಜ್ಯದ 34 ಸಕ್ರಿಯ ಎಪಿಎಂಸಿಗಳಲ್ಲಿ ಒಟ್ಟು ಉತ್ಪಾದನೆ -44% ಕುಸಿದಿದ್ದು, ಆವಕ -13.1% ಕಡಿಮೆಯಾಗಿ "
                "ತೂಕದ ಸರಾಸರಿ ಮಾದರಿ ದರ +63.8% ಏರಿಕೆಯಾಗಿದೆ (₹3,932.2 → ₹6,442.0/ಕ್ವಿಂ)."
            ),
        },
    },
    "productionContext": {
        "kharifAreaLHa": 1086.31,
        "kharifAsOn": "2026-09-04",
        "soyabeanAreaLHa": 121.82,
        "soyabeanPrevAreaLHa": 122.98,
        "soyabeanAreaYoYPct": -0.94,
        "sopaOutputLmt": 107.93,
        "sopaDeltaLmt": -2.33,
        "sopaDeltaPct": -2.1,
        "karnatakaOutputShockPct": -44,
        "headline": "Why Karnataka Surged Despite Flat National Supply (-2.1% YoY)",
        "headlineKn": "ರಾಷ್ಟ್ರೀಯ ಪೂರೈಕೆ (-2.1%) ಸ್ಥಿರವಾಗಿದ್ದರೂ ಕರ್ನಾಟಕದ ದರ ಏಕೆ ಭಾರಿ ಏರಿಕೆ ಕಂಡಿತು?",
        "priceExpectationNote": (
            "Gains in Madhya Pradesh (+32%) and Rajasthan (+48%) nearly offset heavy losses in Maharashtra (-33%), "
            "Karnataka (-44%), and Telangana (-46%), keeping national SOPA output within -2.1% of 2025. Yet "
            "Karnataka decoupled sharply: regional dry spells cut state supply by 44%, driving +63.8% modal price inflation."
        ),
        "priceExpectationNoteKn": (
            "ಮಧ್ಯಪ್ರದೇಶ (+32%) ಮತ್ತು ರಾಜಸ್ಥಾನದ (+48%) ಹೆಚ್ಚುವರಿ ಇಳುವರಿಯು ಕರ್ನಾಟಕ (-44%), ಮಹಾರಾಷ್ಟ್ರ (-33%) "
            "ಮತ್ತು ತೆಲಂಗಾಣದ (-46%) ಕುಸಿತವನ್ನು ರಾಷ್ಟ್ರೀಯ ಮಟ್ಟದಲ್ಲಿ ಸರಿದೂಗಿಸಿತು (-2.1% ಮಾತ್ರ). ಆದರೆ ಕರ್ನಾಟಕದ "
            "ಪ್ರಾದೇಶಿಕ ತೇವಾಂಶ ಕೊರತೆಯಿಂದ ರಾಜ್ಯದ ಮಾದರಿ ದರ +63.8% ಜಿಗಿದಿದೆ."
        ),
        "stateShifts": [
            {"name": "Telangana", "nameKn": "ತೆಲಂಗಾಣ", "pct": -46, "driver": "Dry spells & low soil moisture", "driverKn": "ಮಳೆ ಕೊರತೆ ಮತ್ತು ಕಡಿಮೆ ತೇವಾಂಶ"},
            {"name": "Karnataka", "nameKn": "ಕರ್ನಾಟಕ", "pct": -44, "driver": "Regional dry spells; localized stress", "driverKn": "ಪ್ರಾದೇಶಿಕ ಬರ; ಬೆಳೆ ಹಾನಿ"},
            {"name": "Maharashtra", "nameKn": "ಮಹಾರಾಷ್ಟ್ರ", "pct": -33, "driver": "Moisture deficit in Marathwada/Vidarbha", "driverKn": "ಮರಾಠವಾಡ/ವಿದರ್ಭದಲ್ಲಿ ತೇವಾಂಶ ಕೊರತೆ"},
            {"name": "All-India (SOPA)", "nameKn": "ಅಖಿಲ ಭಾರತ (SOPA)", "pct": -2.1, "driver": "107.93 LMT (-2.33 LMT vs 2025)", "driverKn": "107.93 LMT (2025 ಕ್ಕೆ -2.33 LMT)"},
            {"name": "Madhya Pradesh", "nameKn": "ಮಧ್ಯಪ್ರದೇಶ", "pct": 32, "driver": "Top national producer rebound", "driverKn": "ದೇಶದ ಅಗ್ರ ಉತ್ಪಾದಕ ರಾಜ್ಯ ಚೇತರಿಕೆ"},
            {"name": "Rajasthan", "nameKn": "ರಾಜಸ್ಥಾನ", "pct": 48, "driver": "Strong Kharif acreage & yield", "driverKn": "ಉತ್ತಮ ಖಾರಿಫ್ ಬಿತ್ತನೆ ಮತ್ತು ಇಳುವರಿ"},
        ],
    },
    "modelSpec": {
        "name": "Fine-Tuned Timestral 123M",
        "nameKn": "ಫೈನ್-ಟ್ಯೂನ್ಡ್ ಟೈಮ್‌ಸ್ಟ್ರಲ್ 123M",
        "loss": "Tilde-q (q̃) Loss",
        "lookbackDays": 512,
        "horizonDays": 78,
        "features": "Log-Transformed Daily Modal Price + Arrivals Volume",
        "featuresKn": "ಲಾಗ್-ರೂಪಾಂತರಿಸಿದ ದೈನಂದಿನ ಮಾದರಿ ದರ + ಆವಕ ಪ್ರಮಾಣ",
        "quantiles": "10th – 90th Percentile Band (q10 – q90)",
        "futureExtensions": "Weather shocks, substitute oilseeds, state stock limits & edible oil tariff shifts",
        "futureExtensionsKn": "ಹವಾಮಾನ ಆಘಾತ, ಪರ್ಯಾಯ ಎಣ್ಣೆಕಾಳು, ದಾಸ್ತಾನು ಮಿತಿ ಮತ್ತು ಆಮದು ಸುಂಕ ಬದಲಾವಣೆಗಳು",
    },
    "outlookByMarket": {
        "BIDAR": {
            "sectionRef": "3.2 (Figure 5)",
            "cutoffApproxPrice": 7100,
            "medianRange": "₹7,150 – ₹7,350 / q",
            "bandLateDec": "₹5,600 – ₹9,900 / q",
            "mspRisk": "marginal",
            "mspRiskLabel": "Lower q10 dips slightly below MSP ₹5,708/q by late Dec",
            "mspRiskLabelKn": "ಡಿಸೆಂಬರ್ ಅಂತ್ಯಕ್ಕೆ ಕನಿಷ್ಠ q10 ಪಟ್ಟಿ MSP (₹5,708) ಗಿಂತ ಸ್ವಲ್ಪ ಕೆಳಗಿಳಿಯುವ ಸಾಧ್ಯತೆ",
            "narrative": (
                "Median holds steady between ₹7,150/q and ₹7,350/q through Dec 31 (near cutoff ~₹7,100/q). "
                "Observed Oct 14–early Nov prices tracked tightly between ₹6,900–₹7,250/q. Late-Dec q10–q90 widens to ₹5,600–₹9,900/q."
            ),
            "narrativeKn": (
                "ಡಿಸೆಂಬರ್ 31 ರವರೆಗೆ ಮಧ್ಯಮ ಮುನ್ಸೂಚನೆ ₹7,150–₹7,350/ಕ್ವಿಂ ನಲ್ಲಿ ಸ್ಥಿರವಾಗಿದೆ. ಅಕ್ಟೋಬರ್ 14–ನವೆಂಬರ್ ಆರಂಭದ "
                "ವಾಸ್ತವ ದರಗಳು ₹6,900–₹7,250/ಕ್ವಿಂ ನಡುವೆ ಇದ್ದವು. ಡಿಸೆಂಬರ್ ಅಂತ್ಯಕ್ಕೆ q10–q90 ವ್ಯಾಪ್ತಿ ₹5,600–₹9,900/ಕ್ವಿಂ ಆಗಿದೆ."
            ),
            "anchors": [
                ("2026-10-14", 7112, 7140, 7160, 7115),
                ("2026-10-20", 6620, 7200, 7820, 7180),
                ("2026-10-28", 6360, 7250, 8250, 7240),
                ("2026-11-05", 6220, 7230, 8620, 7260),
                ("2026-11-15", 6080, 7220, 8950, 7290),
                ("2026-11-28", 5900, 7260, 9320, 7350),
                ("2026-12-12", 5740, 7310, 9650, 7380),
                ("2026-12-24", 5640, 7340, 9820, 7410),
                ("2026-12-31", 5600, 7350, 9900, 7430),
            ],
        },
        "BAILHONGAL": {
            "sectionRef": "3.3 (Figure 6)",
            "cutoffApproxPrice": 6100,
            "medianRange": "₹6,100 – ₹6,350 / q",
            "bandLateDec": "₹5,050 – ₹8,000 / q",
            "mspRisk": "elevated",
            "mspRiskLabel": "Lower q10 falls well below MSP ₹5,708/q — supports storage & phased sale",
            "mspRiskLabelKn": "ಕನಿಷ್ಠ q10 ಪಟ್ಟಿ MSP (₹5,708) ಗಿಂತ ಸಾಕಷ್ಟು ಕೆಳಗಿಳಿಯುವುದರಿಂದ ಗೋದಾಮು ಸಂಗ್ರಹಣೆ ಸೂಕ್ತ",
            "narrative": (
                "Median projects ₹6,100/q → ₹6,350/q through Dec 31. Realized prices climbed faster in late Oct (~₹7,000/q peak) "
                "before settling around ₹6,500–₹6,750/q. Late-Dec q10–q90 stretches ₹5,050–₹8,000/q, underscoring phased-marketing support."
            ),
            "narrativeKn": (
                "ಮಧ್ಯಮ ಮುನ್ಸೂಚನೆ ₹6,100–₹6,350/ಕ್ವಿಂ ತೋರಿಸಿದೆ. ಅಕ್ಟೋಬರ್ ಅಂತ್ಯದಲ್ಲಿ ವಾಸ್ತವ ದರ ವೇಗವಾಗಿ ₹7,000/ಕ್ವಿಂ ಮುಟ್ಟಿ "
                "₹6,500–₹6,750/ಕ್ವಿಂ ಆಸುಪಾಸು ನೆಲೆಸಿದೆ. ಡಿಸೆಂಬರ್ ಅಂತ್ಯದ q10 ₹5,050 MSP ಗಿಂತ ಕೆಳಗಿರುವುದರಿಂದ ಹಂತಹಂತದ ಮಾರಾಟ ಸೂಕ್ತ."
            ),
            "anchors": [
                ("2026-10-14", 6110, 6135, 6165, 6115),
                ("2026-10-20", 5820, 6180, 6580, 6140),
                ("2026-10-28", 5580, 6220, 6940, 6190),
                ("2026-11-05", 5460, 6240, 7180, 6220),
                ("2026-11-15", 5340, 6260, 7420, 6250),
                ("2026-11-28", 5220, 6275, 7660, 6280),
                ("2026-12-12", 5140, 6310, 7840, 6300),
                ("2026-12-24", 5080, 6335, 7950, 6315),
                ("2026-12-31", 5050, 6350, 8000, 6325),
            ],
        },
        "HUBBALLI": {
            "sectionRef": "3.4 (Figure 7)",
            "cutoffApproxPrice": 6850,
            "medianRange": "₹6,800 – ₹7,000 / q",
            "bandLateDec": "₹5,300 – ₹9,050 / q",
            "mspRisk": "elevated",
            "mspRiskLabel": "Lower q10 falls below MSP ₹5,708/q late season — phased sale advised",
            "mspRiskLabelKn": "ಡಿಸೆಂಬರ್ ಅಂತ್ಯದಲ್ಲಿ ಕನಿಷ್ಠ q10 MSP (₹5,708) ಗಿಂತ ಕೆಳಗಿದ್ದು ಹಂತಹಂತದ ಮಾರಾಟ ಅಗತ್ಯ",
            "narrative": (
                "Median remains anchored at ₹6,800–₹7,000/q from cutoff ~₹6,850/q. Realized prices briefly spiked near ₹7,250/q "
                "in mid-October before easing cleanly into ₹6,400–₹6,900/q right along the forecast median."
            ),
            "narrativeKn": (
                "ಮಧ್ಯಮ ಮುನ್ಸೂಚನೆ ₹6,800–₹7,000/ಕ್ವಿಂ ನಲ್ಲಿದೆ. ಅಕ್ಟೋಬರ್ ಮಧ್ಯದಲ್ಲಿ ₹7,250/ಕ್ವಿಂ ಗರಿಷ್ಠ ತಲುಪಿದ ನಂತರ "
                "ದರಗಳು ₹6,400–₹6,900/ಕ್ವಿಂ ರಷ್ಟು ತಗ್ಗಿ ಮುನ್ಸೂಚನಾ ರೇಖೆಗೆ ಹತ್ತಿರವಾಗಿವೆ."
            ),
            "anchors": [
                ("2026-10-14", 6820, 6855, 6890, 6820),
                ("2026-10-20", 6320, 6865, 7420, 6910),
                ("2026-10-28", 5960, 6835, 7810, 6980),
                ("2026-11-05", 5810, 6850, 8090, 7040),
                ("2026-11-15", 5680, 6875, 8350, 7090),
                ("2026-11-28", 5520, 6915, 8640, 7130),
                ("2026-12-12", 5410, 6955, 8860, 7160),
                ("2026-12-24", 5330, 6985, 8990, 7180),
                ("2026-12-31", 5300, 7000, 9050, 7195),
            ],
        },
        "KALABURAGI": {
            "sectionRef": "3.5 (Figure 8)",
            "cutoffApproxPrice": 6800,
            "medianRange": "₹6,700 → ₹6,350 / q",
            "bandLateDec": "₹4,750 – ₹9,300 / q",
            "mspRisk": "high",
            "mspRiskLabel": "Widest downside tail: q10 drops to ₹4,750/q (well below MSP ₹5,708/q)",
            "mspRiskLabelKn": "ಅತಿ ದೊಡ್ಡ ಕೆಳಮುಖ ಅಪಾಯ: ಕನಿಷ್ಠ q10 ₹4,750/ಕ್ವಿಂ ವರೆಗೆ ಕುಸಿಯುವ ಸಾಧ್ಯತೆ",
            "narrative": (
                "Thin arrivals drive the widest quantile spread: median drifts gently down from ₹6,700/q to ₹6,350/q while "
                "realized Oct 14–early Nov trades tracked ₹6,150–₹6,900/q. Late-Dec q10 reaches ₹4,750/q, underscoring severe tail risk."
            ),
            "narrativeKn": (
                "ಕಡಿಮೆ ಆವಕದಿಂದ ಅತಿ ಹೆಚ್ಚು ಏರಿಳಿತ ವ್ಯಾಪ್ತಿ ಇದೆ: ಮಧ್ಯಮ ದರ ₹6,700 → ₹6,350/ಕ್ವಿಂ ಕಡೆಗೆ ಇಳಿಯುತ್ತದೆ. "
                "ಡಿಸೆಂಬರ್ ಅಂತ್ಯಕ್ಕೆ ಕನಿಷ್ಠ q10 ₹4,750/ಕ್ವಿಂ ವರೆಗೆ ಇಳಿಯುವುದರಿಂದ ಗರಿಷ್ಠ ಎಚ್ಚರಿಕೆ ಅಗತ್ಯ."
            ),
            "anchors": [
                ("2026-10-14", 6720, 6710, 6780, 6680),
                ("2026-10-20", 5980, 6620, 7520, 6510),
                ("2026-10-28", 5580, 6530, 8020, 6390),
                ("2026-11-05", 5360, 6480, 8340, 6340),
                ("2026-11-15", 5180, 6435, 8620, 6310),
                ("2026-11-28", 4990, 6390, 8920, 6285),
                ("2026-12-12", 4860, 6365, 9140, 6270),
                ("2026-12-24", 4780, 6355, 9260, 6260),
                ("2026-12-31", 4750, 6350, 9300, 6255),
            ],
        },
    },
    "extremeEvents": [
        {
            "market": "KALABURAGI",
            "tag": "Supply Contraction (-90.8%)",
            "tagKn": "ತೀವ್ರ ಪೂರೈಕೆ ಕುಸಿತ (-90.8%)",
            "title": "Kalaburagi Thin-Market Volatility & ₹9,450/q Outlier Spike",
            "titleKn": "ಕಲಬುರಗಿ ಕಡಿಮೆ ಆವಕದ ಏರಿಳಿತ ಮತ್ತು ₹9,450/ಕ್ವಿಂ ಏಕದಿನ ಜಿಗಿತ",
            "body": (
                "October arrivals collapsed by 90.8% (staying under 150 q/day vs 400–1,500 q/day in prior seasons), "
                "paired with an isolated ₹9,450/q single-day modal spike in mid-September. Moisture stress during "
                "flowering and pod-filling thinned market liquidity so severely that just a few lots swung daily prices."
            ),
            "bodyKn": (
                "ಅಕ್ಟೋಬರ್ ಆವಕ 90.8% ಕುಸಿದು (ಹಿಂದಿನ 400–1,500 ಕ್ವಿಂ/ದಿನಕ್ಕೆ ಬದಲಾಗಿ <150 ಕ್ವಿಂ/ದಿನ) ಸೆಪ್ಟೆಂಬರ್ ಮಧ್ಯದಲ್ಲಿ "
                "ಒಂದು ದಿನ ದರ ₹9,450/ಕ್ವಿಂ ಮುಟ್ಟಿತು. ಕಡಿಮೆ ಲಭ್ಯತೆಯಿಂದ ಕೆಲವೇ ಲಾಟ್‌ಗಳು ದೈನಂದಿನ ದರವನ್ನು ತೀವ್ರವಾಗಿ ಏರಿಸಿದವು."
            ),
        },
        {
            "market": "BIDAR",
            "tag": "Inflow Surge (+43.5%) • Price +75.5%",
            "tagKn": "ಒಳಹರಿವು ಹೆಚ್ಚಳ (+43.5%) • ದರ +75.5%",
            "title": "Bidar Border Magnet & Four Hypotheses for Simultaneous Co-Rise",
            "titleKn": "ಬೀದರ್ ಗಡಿ ಮಂಡಿಯಲ್ಲಿ ಆವಕ ಮತ್ತು ದರ ಎರಡೂ ಏರಿಕೆಗೆ 4 ಪ್ರಮುಖ ಕಾರಣಗಳು",
            "body": (
                "(i) Liquidation of stored carryover stocks into a high-price market; (ii) relatively favorable localized "
                "harvest outcomes in Bidar pocket; (iii) front-loaded procurement by traders/mills fearing deeper deficits; "
                "and (iv) cross-border produce arriving from Latur, Nanded (Maharashtra) & Telangana seeking Karnataka premiums."
            ),
            "bodyKn": (
                "(i) ಹೆಚ್ಚಿನ ದರದ ಲಾಭ ಪಡೆಯಲು ಹಳೆಯ ದಾಸ್ತಾನು ಮಾರಾಟ; (ii) ಬೀದರ್ ಭಾಗದಲ್ಲಿ ತುಲನಾತ್ಮಕವಾಗಿ ಉತ್ತಮ ಸ್ಥಳೀಯ ಕೊಯ್ಲು; "
                "(iii) ಮುಂದಿನ ಕೊರತೆಯ ಭೀತಿಯಿಂದ ವ್ಯಾಪಾರಿಗಳ ಮುಂಗಡ ಖರೀದಿ; (iv) ಮಹಾರಾಷ್ಟ್ರ (ಲಾತೂರ್, ನಾಂದೇಡ್) ಮತ್ತು ತೆಲಂಗಾಣದಿಂದ ಒಳಹರಿವು."
            ),
        },
        {
            "market": "BAILHONGAL",
            "tag": "Early Front-Loading (Sep 20 Peak)",
            "tagKn": "ಮುಂಗಡ ಕೊಯ್ಲು ಕೇಂದ್ರೀಕರಣ",
            "title": "Bailhongal & Hubballi September Concentration Followed by Oct Rallies",
            "titleKn": "ಬೈಲಹೊಂಗಲ ಮತ್ತು ಹುಬ್ಬಳ್ಳಿಯಲ್ಲಿ ಸೆಪ್ಟೆಂಬರ್ ಮುಂಗಡ ಆವಕ ಹಾಗೂ ಅಕ್ಟೋಬರ್ ದರ ಏರಿಕೆ",
            "body": (
                "Bailhongal peaked early around Sep 20 (~17,000 q/day vs 2025's 26,000 q/day October peak), while Hubballi "
                "peaked in late Sep (~2,400 q/day) before tapering below 1,000 q/day. Farmers locked early gains while mills "
                "sustained October rallies upward past ₹7,000/q."
            ),
            "bodyKn": (
                "ಬೈಲಹೊಂಗಲ ಸೆಪ್ಟೆಂಬರ್ 20ರಲ್ಲೇ (~17,000 ಕ್ವಿಂ/ದಿನ) ಮತ್ತು ಹುಬ್ಬಳ್ಳಿ ಸೆಪ್ಟೆಂಬರ್ ಅಂತ್ಯದಲ್ಲಿ (~2,400 ಕ್ವಿಂ/ದಿನ) "
                "ಗರಿಷ್ಠ ಆವಕ ಕಂಡು, ಅಕ್ಟೋಬರ್‌ನಲ್ಲಿ ಪೂರೈಕೆ ಕಡಿಮೆಯಾದಾಗ ಗಿರಣಿಗಳ ಬೇಡಿಕೆಯಿಂದ ದರ ₹7,000/ಕ್ವಿಂ ದಾಟಿತು."
            ),
        },
    ],
    "modelResilienceNote": (
        "Logarithmic transformation stabilizes feature variance and stops Timestral 123M from overfitting "
        "one-day anomalies such as Kalaburagi's ₹9,450/q outlier. Integrating external covariates—state stock limits, "
        "edible oil tariff shifts, and trader inventory releases—offers the clearest next step to sharpen tail-risk bounds."
    ),
    "modelResilienceNoteKn": (
        "ಲಾಗರಿಥಮಿಕ್ ರೂಪಾಂತರವು ದರಗಳ ಏರಿಳಿತವನ್ನು ಸ್ಥಿರಗೊಳಿಸಿ, ಕಲಬುರಗಿಯ ₹9,450/ಕ್ವಿಂ ನಂತಹ ಏಕದಿನ ಅಸಹಜತೆಗೆ ಮಾದರಿ "
        "ಅತಿ-ಹೊಂದಾಣಿಕೆ (overfitting) ಆಗದಂತೆ ತಡೆಯುತ್ತದೆ. ಮುಂದಿನ ಹಂತದಲ್ಲಿ ದಾಸ್ತಾನು ಮಿತಿ, ಸುಂಕ ನೀತಿ ಮತ್ತು ಹವಾಮಾನ ಅಂಶಗಳನ್ನು ಸೇರಿಸಬಹುದು."
    ),
    "actionPoints": [
        {
            "id": "grading",
            "title": "Fair Electronic Grading at the Mandi",
            "titleKn": "ಮಂಡಿಯಲ್ಲಿ ಪಾರದರ್ಶಕ ಎಲೆಕ್ಟ್ರಾನಿಕ್ ಗುಣಮಟ್ಟ ಪರೀಕ್ಷೆ",
            "badge": "Anti-Deduction",
            "badgeKn": "ಕಡಿತ ನಿಯಂತ್ರಣ",
            "body": (
                "Subjective discounts for moisture and shrivelled grains cut farmer realizations below modal rates. "
                "Enforcing calibrated electronic moisture meters and transparent e-auctions protects farmgate payouts."
            ),
            "bodyKn": (
                "ತೇವಾಂಶ ಮತ್ತು ಸುಕ್ಕುಗಟ್ಟಿದ ಕಾಳಿನ ಹೆಸರಿನಲ್ಲಿ ವ್ಯಾಪಾರಿಗಳು ಮಾಡುವ ಅನಿಯಂತ್ರಿತ ಕಡಿತವನ್ನು ತಪ್ಪಿಸಲು ಪ್ರವೇಶ ದ್ವಾರದಲ್ಲೇ "
                "ಪ್ರಮಾಣೀಕೃತ ಎಲೆಕ್ಟ್ರಾನಿಕ್ ಗ್ರೇಡಿಂಗ್ ಮತ್ತು ಪಾರದರ್ಶಕ ಇ-ಹರಾಜು ಕಡ್ಡಾಯಗೊಳಿಸಬೇಕು."
            ),
        },
        {
            "id": "decongestion",
            "title": "Decongesting Border Mandis (Bidar +43.5%)",
            "titleKn": "ಗಡಿ ಮಂಡಿಗಳ ದಟ್ಟಣೆ ನಿವಾರಣೆ (ಬೀದರ್ +43.5%)",
            "badge": "Bidar Priority",
            "badgeKn": "ಬೀದರ್ ಆದ್ಯತೆ",
            "body": (
                "Heavy cross-border traffic risks yard bottlenecks and distress sales. Upgrading gate-entry scheduling, "
                "electronic weighbridges, and rapid e-NAM settlements keeps auctions flowing smoothly."
            ),
            "bodyKn": (
                "ಭಾರಿ ಆವಕದಿಂದ ಪ್ರಾಂಗಣ ದಟ್ಟಣೆ ಮತ್ತು ತುರ್ತು ಮಾರಾಟ ತಪ್ಪಿಸಲು ಗೇಟ್ ಪ್ರವೇಶ ವೇಳಾಪಟ್ಟಿ, ಎಲೆಕ್ಟ್ರಾನಿಕ್ ತೂಕ ಮತ್ತು "
                "ತ್ವರಿತ e-NAM ಹಣ ಪಾವತಿಯನ್ನು ಬಲಪಡಿಸಬೇಕು."
            ),
        },
        {
            "id": "industry",
            "title": "Supply Continuity for Local Industry (Hubballi–Dharwad)",
            "titleKn": "ಸ್ಥಳೀಯ ಎಣ್ಣೆ ಗಿರಣಿ ಮತ್ತು ಆಹಾರ ಘಟಕಗಳಿಗೆ ಪೂರೈಕೆ",
            "badge": "Crush Margin",
            "badgeKn": "ಉದ್ಯಮ ಸಮತೋಲನ",
            "body": (
                "Steep premiums squeeze regional solvent extraction & DOC poultry/cattle feed mills. KSAMB can share "
                "surplus-state prices and streamline interstate e-NAM permits without undercutting Karnataka farmers."
            ),
            "bodyKn": (
                "ಹುಬ್ಬಳ್ಳಿ-ಧಾರವಾಡದ ಗಿರಣಿಗಳಿಗೆ ಕಚ್ಚಾ ವಸ್ತು ಕೊರತೆ ತಪ್ಪಿಸಲು ರಾಜ್ಯದ ರೈತರ ದರಕ್ಕೆ ಧಕ್ಕೆಯಾಗದಂತೆ ಇತರೆ ರಾಜ್ಯಗಳಿಂದ "
                "ಅಂತರ-ರಾಜ್ಯ e-NAM ಪರವಾನಗಿ ಮತ್ತು ದರ ಮಾಹಿತಿ ಒದಗಿಸಬೇಕು."
            ),
        },
        {
            "id": "swings",
            "title": "Managing Post-Harvest Swings & MSP Context (+7% to +19%)",
            "titleKn": "ಕೊಯ್ಲು ನಂತರದ ಏರಿಳಿತ ನಿಯಂತ್ರಣ (MSP +7% ರಿಂದ +19%)",
            "badge": "Above MSP ₹5,708",
            "badgeKn": "MSP ಗಿಂತ ಹೆಚ್ಚು",
            "body": (
                "Prices sit 7% (Bailhongal) to 19% (Bidar) above the 2026–27 MSP of ₹5,708/q, so direct MSP procurement "
                "is unnecessary right now. Weekly advisories prevent both panic early sales and speculative hoarding."
            ),
            "bodyKn": (
                "ದರಗಳು MSP (₹5,708/ಕ್ವಿಂ) ಗಿಂತ 7% ರಿಂದ 19% ಮೇಲಿರುವುದರಿಂದ ತಕ್ಷಣದ MSP ಖರೀದಿ ಅನಗತ್ಯ. ವಾರದ ಮಾರುಕಟ್ಟೆ ಸಲಹೆಗಳು "
                "ಭೀತಿಯ ಮಾರಾಟ ಮತ್ತು ಅನಗತ್ಯ ದಾಸ್ತಾನು ತಡೆಗಟ್ಟುತ್ತವೆ."
            ),
        },
    ],
    "interventions": [
        {
            "step": 1,
            "yardTag": "BIDAR",
            "title": "Yard & Weighing Management during Peak Inflows",
            "titleKn": "ಗರಿಷ್ಠ ಆವಕದ ವೇಳೆ ಪ್ರಾಂಗಣ ಮತ್ತು ತೂಕ ನಿರ್ವಹಣೆ",
            "body": (
                "Deploy adequate electronic weighbridges, digital gate tokens, and staggered vehicle movement in surge yards "
                "like Bidar to prevent waiting lines and distress liquidation."
            ),
            "bodyKn": (
                "ಬೀದರ್‌ನಂತಹ ಹೆಚ್ಚು ಒಳಹರಿವು ಇರುವ ಮಂಡಿಗಳಲ್ಲಿ ವಾಹನ ದಟ್ಟಣೆ ಮತ್ತು ಕಾಯುವಿಕೆ ತಪ್ಪಿಸಲು ಹೆಚ್ಚುವರಿ ತೂಕ ಯಂತ್ರ ಮತ್ತು "
                "ಸುಗಮ ಪ್ರಾಂಗಣ ಸಂಚಾರ ವ್ಯವಸ್ಥೆ ಕಲ್ಪಿಸುವುದು."
            ),
        },
        {
            "step": 2,
            "yardTag": "KALABURAGI",
            "title": "Transparent Quality & Moisture Deduction Guidelines",
            "titleKn": "ಪಾರದರ್ಶಕ ಗುಣಮಟ್ಟ ಮತ್ತು ತೇವಾಂಶ ಕಡಿತ ನಿಯಮಾವಳಿ",
            "body": (
                "Notify clear, uniform moisture/shrinkage deduction slabs across drought-hit belts (Kalaburagi) so small "
                "growers are shielded from arbitrary auction discounts."
            ),
            "bodyKn": (
                "ಕಲಬುರಗಿಯಂತಹ ಬರಪೀಡಿತ ಪ್ರದೇಶಗಳಲ್ಲಿ ಮುಕ್ತ ಹರಾಜಿನ ವೇಳೆ ರೈತರಿಗೆ ಅನಿಯಂತ್ರಿತ ದರ ಕಡಿತವಾಗದಂತೆ ಏಕರೂಪದ ತೇವಾಂಶ "
                "ಮತ್ತು ಗುಣಮಟ್ಟ ಮಾರ್ಗಸೂಚಿ ಪ್ರಕಟಿಸುವುದು."
            ),
        },
        {
            "step": 3,
            "yardTag": "BAILHONGAL",
            "title": "Storage Advisories & Staggered Godown Marketing",
            "titleKn": "ಗೋದಾಮು ಸಂಗ್ರಹಣೆ ಮತ್ತು ಹಂತಹಂತದ ಮಾರಾಟ ಸಲಹೆ",
            "body": (
                "Encourage farmers and FPOs in producing belts (Bailhongal) to use APMC godowns and warehouse receipts to "
                "stagger sales cleanly while capturing firm off-peak realizations."
            ),
            "bodyKn": (
                "ಬೈಲಹೊಂಗಲದಂತಹ ಬೆಳೆ ಪ್ರದೇಶಗಳಲ್ಲಿ ರೈತರು ಮತ್ತು FPO ಗಳು APMC ಗೋದಾಮುಗಳನ್ನು ಬಳಸಿ ಒಮ್ಮೆಗೇ ಮಾರಾಟ ಮಾಡದೆ "
                "ಹಂತಹಂತವಾಗಿ ಮಾರಾಟ ಮಾಡಿ ಉತ್ತಮ ದರ ಪಡೆಯಲು ಪ್ರೋತ್ಸಾಹಿಸುವುದು."
            ),
        },
        {
            "step": 4,
            "yardTag": "HUBBALLI • MP/RJ",
            "title": "Inter-Market Price Intelligence from Surplus States",
            "titleKn": "ಹೆಚ್ಚುವರಿ ಉತ್ಪಾದಕ ರಾಜ್ಯಗಳ ಅಂತರ-ಮಾರುಕಟ್ಟೆ ದರ ಮಾಹಿತಿ",
            "body": (
                "Publish regular modal & arrival bulletins from surplus hubs in Madhya Pradesh (+32%) and Rajasthan (+48%) "
                "so local crushers and feed mills can plan smooth raw material procurement."
            ),
            "bodyKn": (
                "ಮಧ್ಯಪ್ರದೇಶ (+32%) ಮತ್ತು ರಾಜಸ್ಥಾನದ (+48%) ದರ ಹಾಗೂ ಆವಕ ಪ್ರವೃತ್ತಿಯನ್ನು ನಿಯಮಿತವಾಗಿ ಪ್ರಕಟಿಸುವುದರಿಂದ ಸ್ಥಳೀಯ "
                "ಗಿರಣಿಗಳಿಗೆ ಕಚ್ಚಾ ವಸ್ತು ಪೂರೈಕೆ ಯೋಜನೆ ಸುಲಭವಾಗುತ್ತದೆ."
            ),
        },
    ],
    "riskFramework": {
        "analyticalScope": (
            "Forecasts use historical daily APMC modal prices and arrivals under normal market regimes. Treat 10th–90th "
            "percentile intervals as indicative risk boundaries paired with continuous external monitoring."
        ),
        "analyticalScopeKn": (
            "ಈ AI ಮುನ್ಸೂಚನೆಯು ಐತಿಹಾಸಿಕ APMC ದೈನಂದಿನ ದರ ಮತ್ತು ಆವಕವನ್ನು ಆಧರಿಸಿದೆ. 10–90ನೇ ಶೇಕಡಾವಾರು ವ್ಯಾಪ್ತಿಯನ್ನು ಬಾಹ್ಯ "
            "ಮಾರುಕಟ್ಟೆ ಬದಲಾವಣೆಗಳೊಂದಿಗೆ ಗಮನಿಸಬೇಕಾದ ಅಪಾಯದ ಗಡಿಯಾಗಿ ಬಳಸಬೇಕು."
        ),
        "externalities": [
            "Trade & Tariff Policy (edible oil import duties, export norms, domestic stock limits)",
            "Interstate Market Flows (price spreads pulling supply from/to MH, TS, MP)",
            "Substitute Crops & Feed Demand (competing oilseeds, poultry/dairy crush margins)",
            "Late-Season Weather (Nov–Dec unseasonal rainfall raising grain moisture & discounts)",
        ],
        "externalitiesKn": [
            "ವ್ಯಾಪಾರ ಮತ್ತು ಸುಂಕ ನೀತಿ (ಖಾದ್ಯ ತೈಲ ಆಮದು ಸುಂಕ, ರಫ್ತು ನಿಯಮ, ದಾಸ್ತಾನು ಮಿತಿ)",
            "ಅಂತರ-ರಾಜ್ಯ ಮಾರುಕಟ್ಟೆ ಹರಿವು (ಮಹಾರಾಷ್ಟ್ರ, ತೆಲಂಗಾಣ, ಮಧ್ಯಪ್ರದೇಶ ದರ ವ್ಯತ್ಯಾಸ)",
            "ಪರ್ಯಾಯ ಬೆಳೆಗಳು ಮತ್ತು ಪಶು ಆಹಾರ ಬೇಡಿಕೆ (ಎಣ್ಣೆಕಾಳು ಮತ್ತು ಗಿರಣಿ ಲಾಭದ ಒತ್ತಡ)",
            "ಕೊನೆಯ ಹಂತದ ಹವಾಮಾನ (ನವೆಂ-ಡಿಸೆಂ ಅಕಾಲಿಕ ಮಳೆ ಮತ್ತು ಕಾಳಿನ ತೇವಾಂಶ ಹೆಚ್ಚಳ)",
        ],
        "scenarios": [
            {
                "severity": "downside",
                "scenario": "Policy or tariff easing (duty cuts, stock limits)",
                "scenarioKn": "ನೀತಿ ಅಥವಾ ಸುಂಕ ಸಡಿಲಿಕೆ (ಆಮದು ಸುಂಕ ಕಡಿತ, ದಾಸ್ತಾನು ಮಿತಿ)",
                "impact": "Softer processor demand or rapid inventory release pulls prices toward lower band or near MSP (₹5,708/q).",
                "impactKn": "ಗಿರಣಿ ಬೇಡಿಕೆ ಇಳಿದು ಅಥವಾ ದಾಸ್ತಾನು ಬಿಡುಗಡೆಯಾಗಿ ದರ ಕನಿಷ್ಠ ವ್ಯಾಪ್ತಿ ಅಥವಾ MSP (₹5,708/ಕ್ವಿಂ) ಹತ್ತಿರ ಬರುವ ಸಾಧ್ಯತೆ.",
                "response": "Issue advisories helping farmers lock favorable rates early, while keeping state MSP procurement ready.",
                "responseKn": "ರೈತರು ಮುಂಚಿತವಾಗಿ ಉತ್ತಮ ದರ ಖಚಿತಪಡಿಸಿಕೊಳ್ಳಲು ಸಲಹೆ ನೀಡುವುದು ಹಾಗೂ MSP ಖರೀದಿ ಸಿದ್ಧತೆ ಕಾಯ್ದುಕೊಳ್ಳುವುದು.",
            },
            {
                "severity": "congestion",
                "scenario": "Cross-border arrival surge from neighboring states",
                "scenarioKn": "ನೆರೆ ರಾಜ್ಯಗಳಿಂದ ಗಡಿ ಮಂಡಿಗಳಿಗೆ ಹೆಚ್ಚುವರಿ ಆವಕ ಒಳಹರಿವು",
                "impact": "Short-term yard congestion at border mandis (Bidar) and temporary downward pressure on local modal prices.",
                "impactKn": "ಬೀದರ್ ಗಡಿ ಮಂಡಿಯಲ್ಲಿ ಪ್ರಾಂಗಣ ದಟ್ಟಣೆ ಹಾಗೂ ಸ್ಥಳೀಯ ದರಗಳ ಮೇಲೆ ತಾತ್ಕಾಲಿಕ ಇಳಿಕೆಯ ಒತ್ತಡ.",
                "response": "Extend gate-entry hours, streamline electronic weighing and e-NAM payouts, and stagger auction slots.",
                "responseKn": "ಗೇಟ್ ಪ್ರವೇಶ ಅವಧಿ ವಿಸ್ತರಣೆ, ಎಲೆಕ್ಟ್ರಾನಿಕ್ ತೂಕ, ತ್ವರಿತ e-NAM ಪಾವತಿ ಮತ್ತು ಹಂತ-ಹಂತದ ಹರಾಜು ವ್ಯವಸ್ಥೆ.",
            },
            {
                "severity": "upside",
                "scenario": "Tight regional supply or rising feed/oil demand",
                "scenarioKn": "ಪ್ರಾದೇಶಿಕ ಪೂರೈಕೆ ಕೊರತೆ ಅಥವಾ ಪಶು ಆಹಾರ/ಎಣ್ಣೆ ಬೇಡಿಕೆ ಹೆಚ್ಚಳ",
                "impact": "Prices rally toward the upper percentile band (₹8,000–9,900/q), squeezing local crushing & feed margins.",
                "impactKn": "ದರಗಳು ಮೇಲ್ಮುಖ ವ್ಯಾಪ್ತಿಗೆ (₹8,000–9,900/ಕ್ವಿಂ) ಜಿಗಿದು ಸ್ಥಳೀಯ ಗಿರಣಿಗಳ ಲಾಭಾಂಶಕ್ಕೆ ತೀವ್ರ ಒತ್ತಡ.",
                "response": "Share interstate price intelligence and facilitate e-NAM permits for processors to source from surplus hubs.",
                "responseKn": "ಅಂತರ-ರಾಜ್ಯ ದರ ಮಾಹಿತಿ ಹಂಚಿಕೆ ಮತ್ತು ಹೆಚ್ಚುವರಿ ರಾಜ್ಯಗಳಿಂದ ಖರೀದಿಸಲು ಗಿರಣಿಗಳಿಗೆ e-NAM ಪರವಾನಗಿ ಸುಗಮಗೊಳಿಸುವಿಕೆ.",
            },
            {
                "severity": "quality",
                "scenario": "Unseasonal Nov–Dec rain & elevated grain moisture",
                "scenarioKn": "ನವೆಂಬರ್-ಡಿಸೆಂಬರ್ ಅಕಾಲಿಕ ಮಳೆ ಮತ್ತು ಕಾಳಿನಲ್ಲಿ ಹೆಚ್ಚಿದ ತೇವಾಂಶ",
                "impact": "Wider subjective quality deductions cut farmer realization even when headline modal rates stay firm.",
                "impactKn": "ಮಾದರಿ ದರ ಸ್ಥಿರವಾಗಿದ್ದರೂ ಗುಣಮಟ್ಟ ಕಡಿತ ಹೆಚ್ಚಳದಿಂದ ರೈತರ ನಿವ್ವಳ ಆದಾಯ ಇಳಿಕೆಯಾಗುತ್ತದೆ.",
                "response": "Enforce standardized electronic moisture grading at entry gates and promote covered warehouse-receipt storage.",
                "responseKn": "ಪ್ರವೇಶ ದ್ವಾರದಲ್ಲೇ ಪ್ರಮಾಣೀಕೃತ ಎಲೆಕ್ಟ್ರಾನಿಕ್ ತೇವಾಂಶ ಪರೀಕ್ಷೆ ಮತ್ತು ಗೋದಾಮು ರಸೀದಿ ಆಧಾರಿತ ಸುರಕ್ಷಿತ ಸಂಗ್ರಹಣೆ ಉತ್ತೇಜನ.",
            },
        ],
    },
    "references": [
        {
            "num": 1,
            "citation": "PIB, Ministry of Agriculture & Farmers Welfare — All India Kharif Area Coverage Stands at 1,086.31 Lakh Hectares as on 4 Sep 2026 (PRID=2307791).",
            "url": "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2307791",
        },
        {
            "num": 2,
            "citation": "Soybean Processors Association of India (SOPA) via PTI — Kharif 2026 Soybean Output 107.93 LMT (-2.1%); MP (+32%) & Rajasthan (+48%) offset Maharashtra (-33%).",
            "url": "https://www.dtnext.in/news/business/soybean-output-may-dip-just-2-pc-mp-rajasthan-gains-to-cushion-maharashtra-losses-farmers-body",
        },
        {
            "num": 3,
            "citation": "Cabinet Committee on Economic Affairs (CCEA) — Cabinet approves MSP for Kharif Crops 2026–27 (Soyabean ₹5,708/q, 13 May 2026).",
            "url": "https://www.narendramodi.in/cabinet-approves-minimum-support-prices-msp-for-kharif-crops-for-marketing-season-2026-27",
        },
        {
            "num": 4,
            "citation": "Adrien Petralia et al., Mistral AI — Timestral: Time-Series Foundation Model (arXiv:2610.37585, Oct 2026).",
            "url": "https://arxiv.org/abs/2610.37585",
        },
        {
            "num": 5,
            "citation": "Department of Agricultural Marketing, Govt. of Karnataka — Krishi Marata Vahini daily APMC price & arrival dataset (2022–2026, live in marukatte.duckdb).",
            "url": "https://krishimaratavahini.karnataka.gov.in",
        },
    ],
}

REPORTS_REGISTRY: Dict[str, Dict[str, Any]] = {
    TR1_SOYABEAN["id"]: TR1_SOYABEAN,
}


def list_reports() -> List[Dict[str, Any]]:
    """Returns metadata summary for all registered Technical Reports."""
    out: List[Dict[str, Any]] = []
    for rep in REPORTS_REGISTRY.values():
        cmeta = get_commodity_meta(rep["commodity"])
        out.append({
            "id": rep["id"],
            "number": rep["number"],
            "title": rep["title"],
            "titleKn": rep["titleKn"],
            "shortTitle": rep["shortTitle"],
            "shortTitleKn": rep["shortTitleKn"],
            "author": rep["author"],
            "authorKn": rep["authorKn"],
            "institution": rep["institution"],
            "institutionKn": rep["institutionKn"],
            "reportDate": rep["reportDate"],
            "commodity": rep["commodity"],
            "commodityName": cmeta["en"],
            "commodityNameKn": cmeta["kn"],
            "msp": rep["msp"],
            "mspSeason": rep["mspSeason"],
            "focusMarkets": list(rep["focusMarkets"]),
            "forecastCutoff": rep["forecastCutoff"],
            "forecastEnd": rep["forecastEnd"],
        })
    return out


def _build_table1_live(con: duckdb.DuckDBPyConnection, rep: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Computes live DuckDB Oct-vs-Oct and Sep+ peak figures matching Report Table 1."""
    com = rep["commodity"]
    yr_a = int(rep["comparisonBaseYear"])
    yr_b = int(rep["comparisonCurrYear"])
    mo = int(rep["comparisonMonth"])
    # Derive peak window start dynamically from the comparison year (always Sep 1 of that year)
    peak_start = rep["peakWindowStart"] or f"{yr_b}-09-01"
    focus_mkts = list(rep["focusMarkets"])
    roles = rep["marketRoles"]

    a_start = f"{yr_a}-{mo:02d}-01"
    a_end = f"{yr_a}-{mo:02d}-31"
    b_start = f"{yr_b}-{mo:02d}-01"
    b_end = f"{yr_b}-{mo:02d}-31"

    rows_out: List[Dict[str, Any]] = []
    for mkt in focus_mkts:
        mmeta = get_market_meta(mkt, "")
        oct_a = con.execute(
            """
            SELECT
                COUNT(*),
                ROUND(AVG(modal_price), 1),
                ROUND(SUM(arrivals), 0)
            FROM daily_market_commodity
            WHERE commodity = ? AND market = ? AND trade_date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
            """,
            [com, mkt, a_start, a_end],
        ).fetchone()
        oct_b = con.execute(
            """
            SELECT
                COUNT(*),
                ROUND(AVG(modal_price), 1),
                ROUND(SUM(arrivals), 0)
            FROM daily_market_commodity
            WHERE commodity = ? AND market = ? AND trade_date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
            """,
            [com, mkt, b_start, b_end],
        ).fetchone()
        pk_row = con.execute(
            """
            SELECT
                ROUND(MAX(modal_price), 1),
                CAST(ARG_MAX(trade_date, modal_price) AS VARCHAR)
            FROM daily_market_commodity
            WHERE commodity = ? AND market = ? AND trade_date >= CAST(? AS DATE)
            """,
            [com, mkt, peak_start],
        ).fetchone()
        lat_row = con.execute(
            """
            SELECT
                ROUND(modal_price, 1),
                CAST(trade_date AS VARCHAR)
            FROM daily_market_commodity
            WHERE commodity = ? AND market = ?
            ORDER BY trade_date DESC
            LIMIT 1
            """,
            [com, mkt],
        ).fetchone()

        p_a = float(oct_a[1]) if oct_a and oct_a[1] is not None else None
        a_a = float(oct_a[2]) if oct_a and oct_a[2] is not None else 0.0
        p_b = float(oct_b[1]) if oct_b and oct_b[1] is not None else None
        a_b = float(oct_b[2]) if oct_b and oct_b[2] is not None else 0.0
        pk_p = float(pk_row[0]) if pk_row and pk_row[0] is not None else None
        pk_dt = str(pk_row[1]) if pk_row and pk_row[1] is not None else None
        lat_p = float(lat_row[0]) if lat_row and lat_row[0] is not None else None
        lat_dt = str(lat_row[1]) if lat_row and lat_row[1] is not None else None

        role_info = roles.get(mkt, {})
        rows_out.append({
            "market": mkt,
            "marketName": mmeta["en"].replace("APMC, ", ""),
            "marketNameKn": mmeta["short_kn"],
            "isStatewide": False,
            "role": role_info.get("role", "focus"),
            "roleLabel": role_info.get("roleLabel", "Focus APMC"),
            "roleLabelKn": role_info.get("roleLabelKn", "ಪ್ರಮುಖ ಪ್ರಾಂಗಣ"),
            "note": role_info.get("note", ""),
            "noteKn": role_info.get("noteKn", ""),
            "octPrevDays": int(oct_a[0] or 0) if oct_a else 0,
            "octCurrDays": int(oct_b[0] or 0) if oct_b else 0,
            "octPrevPrice": p_a,
            "octCurrPrice": p_b,
            "priceChangePct": _safe_pct(p_b, p_a),
            "octPrevArrivals": a_a,
            "octCurrArrivals": a_b,
            "arrivalsChangePct": _safe_pct(a_b, a_a),
            "peak2026Price": pk_p,
            "peak2026Date": pk_dt,
            "latestPrice": lat_p,
            "latestDate": lat_dt,
        })

    # Statewide row (arrival-weighted modal price across all soyabean-reporting APMCs)
    st_a = con.execute(
        """
        SELECT
            CAST(COUNT(DISTINCT market) AS INTEGER),
            ROUND(
                SUM(modal_price * CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END)
                / NULLIF(SUM(CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END), 0),
                1
            ),
            ROUND(SUM(arrivals), 0)
        FROM daily_market_commodity
        WHERE commodity = ? AND trade_date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
        """,
        [com, a_start, a_end],
    ).fetchone()
    st_b = con.execute(
        """
        SELECT
            CAST(COUNT(DISTINCT market) AS INTEGER),
            ROUND(
                SUM(modal_price * CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END)
                / NULLIF(SUM(CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END), 0),
                1
            ),
            ROUND(SUM(arrivals), 0)
        FROM daily_market_commodity
        WHERE commodity = ? AND trade_date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
        """,
        [com, b_start, b_end],
    ).fetchone()
    st_pk = con.execute(
        """
        SELECT
            ROUND(MAX(modal_price), 1),
            CAST(ARG_MAX(trade_date, modal_price) AS VARCHAR),
            ARG_MAX(market, modal_price)
        FROM daily_market_commodity
        WHERE commodity = ? AND trade_date >= CAST(? AS DATE)
        """,
        [com, peak_start],
    ).fetchone()
    focus_peaks = [r["peak2026Price"] for r in rows_out if r.get("peak2026Price") is not None]
    focus_peak_max = max(focus_peaks) if focus_peaks else None
    focus_peak_row = max(
        (r for r in rows_out if r.get("peak2026Price") is not None),
        key=lambda r: r["peak2026Price"],
        default=None,
    )
    st_lat = con.execute(
        """
        SELECT
            ROUND(
                SUM(modal_price * CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END)
                / NULLIF(SUM(CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END), 0),
                1
            ),
            CAST(MAX(trade_date) AS VARCHAR)
        FROM daily_market_commodity
        WHERE commodity = ?
          AND trade_date = (SELECT MAX(trade_date) FROM daily_market_commodity WHERE commodity = ?)
        """,
        [com, com],
    ).fetchone()

    sp_a = float(st_a[1]) if st_a and st_a[1] is not None else None
    sa_a = float(st_a[2]) if st_a and st_a[2] is not None else 0.0
    sp_b = float(st_b[1]) if st_b and st_b[1] is not None else None
    sa_b = float(st_b[2]) if st_b and st_b[2] is not None else 0.0
    st_role = roles.get("ALL", {})
    rows_out.append({
        "market": "ALL",
        "marketName": "Karnataka (Statewide)",
        "marketNameKn": "ಕರ್ನಾಟಕ (ರಾಜ್ಯವ್ಯಾಪಿ)",
        "isStatewide": True,
        "role": st_role.get("role", "statewide"),
        "roleLabel": f"{int(st_b[0] or 34)} Markets Weighted",
        "roleLabelKn": f"{int(st_b[0] or 34)} ಮಂಡಿಗಳ ತೂಕದ ಸರಾಸರಿ",
        "note": st_role.get("note", ""),
        "noteKn": st_role.get("noteKn", ""),
        "octPrevMarkets": int(st_a[0] or 0) if st_a else 0,
        "octCurrMarkets": int(st_b[0] or 0) if st_b else 0,
        "octPrevPrice": sp_a,
        "octCurrPrice": sp_b,
        "priceChangePct": _safe_pct(sp_b, sp_a),
        "octPrevArrivals": sa_a,
        "octCurrArrivals": sa_b,
        "arrivalsChangePct": _safe_pct(sa_b, sa_a),
        "peak2026Price": focus_peak_max if focus_peak_max is not None else (float(st_pk[0]) if st_pk and st_pk[0] is not None else None),
        "peak2026Date": focus_peak_row["peak2026Date"] if focus_peak_row else (str(st_pk[1]) if st_pk and st_pk[1] is not None else None),
        "peak2026Market": focus_peak_row["market"] if focus_peak_row else (str(st_pk[2]) if st_pk and st_pk[2] is not None else None),
        "peakAllYardsPrice": float(st_pk[0]) if st_pk and st_pk[0] is not None else None,
        "peakAllYardsDate": str(st_pk[1]) if st_pk and st_pk[1] is not None else None,
        "peakAllYardsMarket": str(st_pk[2]) if st_pk and st_pk[2] is not None else None,
        "latestPrice": float(st_lat[0]) if st_lat and st_lat[0] is not None else None,
        "latestDate": str(st_lat[1]) if st_lat and st_lat[1] is not None else None,
    })

    return rows_out


def _build_seasonal_dynamics(
    con: duckdb.DuckDBPyConnection,
    rep: Dict[str, Any],
    market: str,
) -> Dict[str, Any]:
    """Queries Sep 1 - Dec 31 daily modal & arrivals curves across 2022..2026 from DuckDB."""
    com = rep["commodity"]
    years: List[int] = [int(y) for y in rep["seasonalYears"]]

    # Canonical Sep 1 -> Dec 31 calendar grid (122 days)
    axis_dates: List[Tuple[str, str]] = []
    cur = date(2025, 9, 1)
    end = date(2025, 12, 31)
    while cur <= end:
        mmdd = f"{cur.month:02d}-{cur.day:02d}"
        lbl = f"{MONTH_ABBR[cur.month]} {cur.day}"
        axis_dates.append((mmdd, lbl))
        cur += timedelta(days=1)

    is_statewide = market == "ALL"
    year_list_sql = ",".join(str(y) for y in years)
    if is_statewide:
        raw_rows = con.execute(
            f"""
            SELECT
                CAST(EXTRACT(YEAR FROM trade_date) AS INTEGER) AS yr,
                STRFTIME(trade_date, '%m-%d') AS mmdd,
                ROUND(
                    SUM(modal_price * CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END)
                    / NULLIF(SUM(CASE WHEN arrivals > 0 THEN arrivals ELSE 1.0 END), 0),
                    1
                ) AS modal_p,
                ROUND(SUM(arrivals), 1) AS arr,
                CAST(trade_date AS VARCHAR) AS full_dt
            FROM daily_market_commodity
            WHERE commodity = ?
              AND EXTRACT(YEAR FROM trade_date) IN ({year_list_sql})
              AND EXTRACT(MONTH FROM trade_date) BETWEEN 9 AND 12
            GROUP BY yr, mmdd, full_dt
            ORDER BY yr ASC, mmdd ASC
            """,
            [com],
        ).fetchall()
    else:
        raw_rows = con.execute(
            f"""
            SELECT
                CAST(EXTRACT(YEAR FROM trade_date) AS INTEGER) AS yr,
                STRFTIME(trade_date, '%m-%d') AS mmdd,
                ROUND(modal_price, 1) AS modal_p,
                ROUND(arrivals, 1) AS arr,
                CAST(trade_date AS VARCHAR) AS full_dt
            FROM daily_market_commodity
            WHERE commodity = ?
              AND market = ?
              AND EXTRACT(YEAR FROM trade_date) IN ({year_list_sql})
              AND EXTRACT(MONTH FROM trade_date) BETWEEN 9 AND 12
            ORDER BY yr ASC, mmdd ASC
            """,
            [com, market],
        ).fetchall()

    lookup: Dict[int, Dict[str, Tuple[Optional[float], Optional[float]]]] = {y: {} for y in years}
    latest_curr_dt: Optional[str] = None
    curr_yr = int(rep["comparisonCurrYear"])
    for yr, mmdd, modal_p, arr, full_dt in raw_rows:
        y_int = int(yr)
        lookup[y_int][str(mmdd)] = (
            float(modal_p) if modal_p is not None else None,
            float(arr) if arr is not None else None,
        )
        if y_int == curr_yr:
            s_dt = str(full_dt)
            if latest_curr_dt is None or s_dt > latest_curr_dt:
                latest_curr_dt = s_dt

    series_by_year: Dict[str, Dict[str, List[Optional[float]]]] = {}
    for y in years:
        y_map = lookup.get(y, {})
        prices: List[Optional[float]] = []
        arrivals: List[Optional[float]] = []
        for mmdd, _ in axis_dates:
            pair = y_map.get(mmdd)
            prices.append(pair[0] if pair else None)
            arrivals.append(pair[1] if pair else None)
        series_by_year[str(y)] = {"prices": prices, "arrivals": arrivals}

    mmeta = get_market_meta(market, "") if not is_statewide else {"en": "Karnataka Statewide", "short_kn": "ಕರ್ನಾಟಕ ರಾಜ್ಯವ್ಯಾಪಿ"}
    return {
        "market": market,
        "marketName": mmeta["en"].replace("APMC, ", ""),
        "marketNameKn": mmeta["short_kn"],
        "years": years,
        "labels": [lbl for _, lbl in axis_dates],
        "mmddKeys": [mmdd for mmdd, _ in axis_dates],
        "seriesByYear": series_by_year,
        "latestCurrYearDate": latest_curr_dt,
    }


def _build_price_outlook(
    con: duckdb.DuckDBPyConnection,
    rep: Dict[str, Any],
    requested_market: str,
) -> Dict[str, Any]:
    """Combines published Timestral 123M 78-day quantile trajectories with live DuckDB actuals."""
    com = rep["commodity"]
    outlook_map = rep["outlookByMarket"]
    outlook_market = requested_market if requested_market in outlook_map else rep["focusMarkets"][0]
    spec = outlook_map[outlook_market]
    mmeta = get_market_meta(outlook_market, "")

    hist_start = date.fromisoformat(rep["forecastHistoryStart"])
    cutoff_dt = date.fromisoformat(rep["forecastCutoff"])
    end_dt = date.fromisoformat(rep["forecastEnd"])

    # Fetch live DuckDB daily actual modal prices from hist_start onward
    actual_rows = con.execute(
        """
        SELECT CAST(trade_date AS VARCHAR), ROUND(modal_price, 1)
        FROM daily_market_commodity
        WHERE commodity = ?
          AND market = ?
          AND trade_date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
        ORDER BY trade_date ASC
        """,
        [com, outlook_market, hist_start.isoformat(), end_dt.isoformat()],
    ).fetchall()
    actual_by_date: Dict[str, float] = {str(r[0]): float(r[1]) for r in actual_rows if r[1] is not None}

    fc_map = _interpolate_daily_anchors(cutoff_dt, end_dt, spec["anchors"])

    dates: List[str] = []
    labels: List[str] = []
    actual_series: List[Optional[float]] = []
    median_series: List[Optional[float]] = []
    q10_series: List[Optional[float]] = []
    q90_series: List[Optional[float]] = []
    zero_shot_series: List[Optional[float]] = []
    msp_series: List[float] = []

    cutoff_idx = 0
    latest_actual_dt: Optional[str] = None
    latest_actual_price: Optional[float] = None
    post_cutoff_errors: List[float] = []
    post_cutoff_pct_errors: List[float] = []
    post_cutoff_vals: List[float] = []
    in_band_count = 0

    cur = hist_start
    idx = 0
    while cur <= end_dt:
        ds = cur.isoformat()
        dates.append(ds)
        labels.append(f"{MONTH_ABBR[cur.month]} {cur.day:02d}")
        if cur == cutoff_dt:
            cutoff_idx = idx

        act_v = actual_by_date.get(ds)
        actual_series.append(act_v)
        if act_v is not None:
            latest_actual_dt = ds
            latest_actual_price = act_v

        fc = fc_map.get(ds)
        if fc:
            median_series.append(fc["median"])
            q10_series.append(fc["q10"])
            q90_series.append(fc["q90"])
            zero_shot_series.append(fc["zeroShot"])
            if act_v is not None:
                post_cutoff_vals.append(act_v)
                err = abs(act_v - fc["median"])
                post_cutoff_errors.append(err)
                if act_v > 0:
                    post_cutoff_pct_errors.append((err / act_v) * 100.0)
                if fc["q10"] <= act_v <= fc["q90"]:
                    in_band_count += 1
        else:
            median_series.append(None)
            q10_series.append(None)
            q90_series.append(None)
            zero_shot_series.append(None)

        msp_series.append(float(rep["msp"]))
        cur += timedelta(days=1)
        idx += 1

    realized_cnt = len(post_cutoff_vals)
    msp_val = float(rep["msp"])
    premium_vs_msp = _safe_pct(latest_actual_price, msp_val) if latest_actual_price is not None else None

    return {
        "market": outlook_market,
        "marketName": mmeta["en"].replace("APMC, ", ""),
        "marketNameKn": mmeta["short_kn"],
        "isFallbackFromStatewide": requested_market != outlook_market,
        "sectionRef": spec["sectionRef"],
        "cutoffDate": rep["forecastCutoff"],
        "endDate": rep["forecastEnd"],
        "cutoffIdx": cutoff_idx,
        "cutoffApproxPrice": spec["cutoffApproxPrice"],
        "medianRange": spec["medianRange"],
        "bandLateDec": spec["bandLateDec"],
        "mspRisk": spec["mspRisk"],
        "mspRiskLabel": spec["mspRiskLabel"],
        "mspRiskLabelKn": spec["mspRiskLabelKn"],
        "narrative": spec["narrative"],
        "narrativeKn": spec["narrativeKn"],
        "mspValue": msp_val,
        "dates": dates,
        "labels": labels,
        "actual": actual_series,
        "median": median_series,
        "q10": q10_series,
        "q90": q90_series,
        "zeroShot": zero_shot_series,
        "mspLine": msp_series,
        "evaluation": {
            "realizedDays": realized_cnt,
            "latestActualDate": latest_actual_dt,
            "latestActualPrice": latest_actual_price,
            "realizedMin": round(min(post_cutoff_vals), 1) if post_cutoff_vals else None,
            "realizedMax": round(max(post_cutoff_vals), 1) if post_cutoff_vals else None,
            "realizedMean": round(sum(post_cutoff_vals) / realized_cnt, 1) if realized_cnt else None,
            "insideBandCount": in_band_count,
            "insideBandPct": round((in_band_count / realized_cnt) * 100.0, 1) if realized_cnt else None,
            "meanAbsError": round(sum(post_cutoff_errors) / realized_cnt, 1) if realized_cnt else None,
            "meanAbsPctError": round(sum(post_cutoff_pct_errors) / realized_cnt, 1) if realized_cnt else None,
            "premiumOverMspPct": premium_vs_msp,
        },
    }


def get_report_payload(
    con: duckdb.DuckDBPyConnection,
    report_id: str = "tr1_soyabean_2026",
    market: Optional[str] = None,
) -> Dict[str, Any]:
    """Builds complete live DuckDB + Technical Report payload for the Analysis tab."""
    if report_id not in REPORTS_REGISTRY:
        raise KeyError(f"Unknown technical report '{report_id}'")

    rep = REPORTS_REGISTRY[report_id]
    cmeta = get_commodity_meta(rep["commodity"])
    valid_markets = set(rep["focusMarkets"]) | {"ALL"}
    req_mkt = (market or rep["focusMarkets"][0]).strip().upper()
    if req_mkt not in valid_markets:
        req_mkt = rep["focusMarkets"][0]

    db_max_row = con.execute(
        "SELECT CAST(MAX(trade_date) AS VARCHAR) FROM daily_market_commodity WHERE commodity = ?",
        [rep["commodity"]],
    ).fetchone()
    db_com_max_date = str(db_max_row[0]) if db_max_row and db_max_row[0] else None

    table1 = _build_table1_live(con, rep)
    seasonal = _build_seasonal_dynamics(con, rep, req_mkt)
    outlook = _build_price_outlook(con, rep, req_mkt)

    return {
        "report": {
            "id": rep["id"],
            "number": rep["number"],
            "programTitle": rep["programTitle"],
            "programTitleKn": rep["programTitleKn"],
            "title": rep["title"],
            "titleKn": rep["titleKn"],
            "shortTitle": rep["shortTitle"],
            "shortTitleKn": rep["shortTitleKn"],
            "author": rep["author"],
            "authorKn": rep["authorKn"],
            "institution": rep["institution"],
            "institutionKn": rep["institutionKn"],
            "reportDate": rep["reportDate"],
            "commodity": rep["commodity"],
            "commodityName": cmeta["en"],
            "commodityNameKn": cmeta["kn"],
            "msp": rep["msp"],
            "mspSeason": rep["mspSeason"],
            "mspSourceRef": rep["mspSourceRef"],
            "mspSourceRefKn": rep["mspSourceRefKn"],
            "comparisonBaseYear": rep["comparisonBaseYear"],
            "comparisonCurrYear": rep["comparisonCurrYear"],
            "comparisonMonth": rep["comparisonMonth"],
            "focusMarkets": list(rep["focusMarkets"]),
            "forecastCutoff": rep["forecastCutoff"],
            "forecastEnd": rep["forecastEnd"],
            "dbLatestDate": db_com_max_date,
        },
        "selectedMarket": req_mkt,
        "productionContext": rep["productionContext"],
        "table1": table1,
        "seasonalDynamics": seasonal,
        "modelSpec": rep["modelSpec"],
        "priceOutlook": outlook,
        "extremeEvents": rep["extremeEvents"],
        "modelResilienceNote": rep["modelResilienceNote"],
        "modelResilienceNoteKn": rep["modelResilienceNoteKn"],
        "actionPoints": rep["actionPoints"],
        "interventions": rep["interventions"],
        "riskFramework": rep["riskFramework"],
        "references": rep["references"],
    }
