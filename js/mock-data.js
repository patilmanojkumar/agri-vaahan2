/* =====================================================================
   Mock Market Data Engine — Replicated KSAMB / e-Krishi Marukatte API
   Implements the exact JSON schemas reverse-engineered from:
   - GET /Market/GetSummary?apmcId={id}
   - GET /Market/GetCommodityPrices?apmcId={id}
   - GET /Market/GetPriceHistory?apmcId={id}&commodityId={cid}&periodDays={days}
   ===================================================================== */

(function (global) {
    'use strict';

    // Exact 171 Karnataka APMC Yards extracted from /Market/Index <select id="apmcSelect">
    const APMC_YARDS = [
        { id: 232, name: 'APMC ALMEL' },
        { id: 153, name: 'APMC BYADAGI' },
        { id: 31, name: 'APMC FF&V(SPECIAL) BENGALURU' },
        { id: 231, name: 'APMC KANAKAGIRI' },
        { id: 230, name: 'APMC MASKI' },
        { id: 188, name: 'APMC PADDY & RICE(SPECIAL) KARATAGI' },
        { id: 178, name: 'APMC, AFZALPURA' },
        { id: 177, name: 'APMC, ALAND' },
        { id: 143, name: 'APMC, ANNIGEREI' },
        { id: 93, name: 'APMC, ARAKALGUDU' },
        { id: 91, name: 'APMC, ARASIKERE' },
        { id: 127, name: 'APMC, ATHANI' },
        { id: 174, name: 'APMC, AURAD' },
        { id: 121, name: 'APMC, BADAMI' },
        { id: 122, name: 'APMC, BAGALKOT' },
        { id: 70, name: 'APMC, BAGEPALLI' },
        { id: 130, name: 'APMC, BAILAHONGAL' },
        { id: 168, name: 'APMC, BALLARI' },
        { id: 49, name: 'APMC, BANGARPET' },
        { id: 85, name: 'APMC, BANTWAL' },
        { id: 172, name: 'APMC, BASAVAKALYAN' },
        { id: 129, name: 'APMC, BELAGAVI' },
        { id: 86, name: 'APMC, BELTHANGDI' },
        { id: 90, name: 'APMC, BELUR' },
        { id: 58, name: 'APMC, BHADRAVATHI' },
        { id: 173, name: 'APMC, BHALKI' },
        { id: 175, name: 'APMC, BIDAR' },
        { id: 119, name: 'APMC, BILAGI' },
        { id: 36, name: 'APMC, CHALLAKERE' },
        { id: 76, name: 'APMC, CHAMARAJANAGAR' },
        { id: 45, name: 'APMC, CHANNAGIRI' },
        { id: 73, name: 'APMC, CHANNAPATNA' },
        { id: 95, name: 'APMC, CHANNARAYA PATNA' },
        { id: 69, name: 'APMC, CHIKKABALLAPUR' },
        { id: 82, name: 'APMC, CHIKKAMAGALORE' },
        { id: 180, name: 'APMC, CHINCHOLI' },
        { id: 71, name: 'APMC, CHINTAMANI' },
        { id: 37, name: 'APMC, CHITRADURGA' },
        { id: 182, name: 'APMC, CHITTAPUR' },
        { id: 43, name: 'APMC, DAVANAGERE' },
        { id: 189, name: 'APMC, DEVDURGA' },
        { id: 139, name: 'APMC, DHARWAD' },
        { id: 33, name: 'APMC, DODDABALLAPUR' },
        { id: 146, name: 'APMC, GADAG' },
        { id: 186, name: 'APMC, GANGAVATHI' },
        { id: 128, name: 'APMC, GOKAK' },
        { id: 96, name: 'APMC, GONIKOPPAL' },
        { id: 68, name: 'APMC, GOWRIBIDANUR' },
        { id: 64, name: 'APMC, GUBBI' },
        { id: 75, name: 'APMC, GUNDLUPET' },
        { id: 165, name: 'APMC, HADAGALI' },
        { id: 157, name: 'APMC, HALIYAL' },
        { id: 151, name: 'APMC, HANGAL' },
        { id: 78, name: 'APMC, HANUR' },
        { id: 169, name: 'APMC, HARAPANAHALLI' },
        { id: 41, name: 'APMC, HARIHAR' },
        { id: 92, name: 'APMC, HASSAN' },
        { id: 152, name: 'APMC, HAVERI' },
        { id: 154, name: 'APMC, HIREKERUR' },
        { id: 40, name: 'APMC, HIRIYUR' },
        { id: 38, name: 'APMC, HOLALKERE' },
        { id: 94, name: 'APMC, HOLENARASIPUR' },
        { id: 44, name: 'APMC, HONNALI' },
        { id: 163, name: 'APMC, HONNAVAR' },
        { id: 39, name: 'APMC, HOSADURGA' },
        { id: 34, name: 'APMC, HOSAKOTE' },
        { id: 55, name: 'APMC, HOSANAGAR' },
        { id: 166, name: 'APMC, HOSPET' },
        { id: 140, name: 'APMC, HUBLI' },
        { id: 59, name: 'APMC, HULIYAR' },
        { id: 176, name: 'APMC, HUMNABAD' },
        { id: 123, name: 'APMC, HUNAGUND' },
        { id: 108, name: 'APMC, HUNSUR' },
        { id: 136, name: 'APMC, INDI' },
        { id: 42, name: 'APMC, JAGALUR' },
        { id: 118, name: 'APMC, JAMAKHANDI' },
        { id: 183, name: 'APMC, JEWARGI' },
        { id: 51, name: 'APMC, K.G.F' },
        { id: 109, name: 'APMC, K.R.NAGAR' },
        { id: 99, name: 'APMC, K.R.PET' },
        { id: 81, name: 'APMC, KADUR' },
        { id: 179, name: 'APMC, KALABURGI' },
        { id: 141, name: 'APMC, KALAGHATAGI' },
        { id: 170, name: 'APMC, KAMPLI' },
        { id: 74, name: 'APMC, KANAKAPUR' },
        { id: 116, name: 'APMC, KARKAL' },
        { id: 156, name: 'APMC, KARWAR' },
        { id: 47, name: 'APMC, KOLAR' },
        { id: 77, name: 'APMC, KOLLEGAL' },
        { id: 79, name: 'APMC, KOPPA' },
        { id: 187, name: 'APMC, KOPPAL' },
        { id: 171, name: 'APMC, KOTTUR' },
        { id: 125, name: 'APMC, KUDACHI' },
        { id: 197, name: 'APMC, KUDLIGI' },
        { id: 161, name: 'APMC, KUMTA' },
        { id: 142, name: 'APMC, KUNDAGOL' },
        { id: 114, name: 'APMC, KUNDAPUR' },
        { id: 67, name: 'APMC, KUNIGAL' },
        { id: 98, name: 'APMC, KUSHALNAGAR' },
        { id: 185, name: 'APMC, KUSHTAGI' },
        { id: 148, name: 'APMC, LAKSHMESHWAR' },
        { id: 190, name: 'APMC, LINGASUGUR' },
        { id: 104, name: 'APMC, MADDUR' },
        { id: 62, name: 'APMC, MADHUGIRI' },
        { id: 97, name: 'APMC, MADIKERI' },
        { id: 117, name: 'APMC, MAHALINGAPUR' },
        { id: 48, name: 'APMC, MALUR' },
        { id: 105, name: 'APMC, MALVALLI' },
        { id: 103, name: 'APMC, MANDYA' },
        { id: 84, name: 'APMC, MANGALURU' },
        { id: 192, name: 'APMC, MANVI' },
        { id: 120, name: 'APMC, MUDHOLA' },
        { id: 83, name: 'APMC, MUDIGERE' },
        { id: 50, name: 'APMC, MULABAGILU' },
        { id: 159, name: 'APMC, MUNDAGOD' },
        { id: 147, name: 'APMC, MUNDARGI' },
        { id: 110, name: 'APMC, MYSURU' },
        { id: 100, name: 'APMC, NAGAMANGALA' },
        { id: 124, name: 'APMC, NANDAGAD' },
        { id: 112, name: 'APMC, NANJANAGUD' },
        { id: 144, name: 'APMC, NARAGUND' },
        { id: 133, name: 'APMC, NIPPANI' },
        { id: 101, name: 'APMC, PANDAVAPUR' },
        { id: 61, name: 'APMC, PAVAGAD' },
        { id: 107, name: 'APMC, PIRIYAPATNA' },
        { id: 87, name: 'APMC, PUTTUR' },
        { id: 191, name: 'APMC, RAICHUR' },
        { id: 132, name: 'APMC, RAMADURGA' },
        { id: 72, name: 'APMC, RAMANAGAR' },
        { id: 35, name: 'APMC, RAMPURA' },
        { id: 155, name: 'APMC, RANEBENNUR' },
        { id: 52, name: 'APMC, SAGAR' },
        { id: 89, name: 'APMC, SAKALESHAPUR' },
        { id: 126, name: 'APMC, SANKESHWAR' },
        { id: 106, name: 'APMC, SANTHESARAGUR' },
        { id: 131, name: 'APMC, SAUNDATTI,' },
        { id: 150, name: 'APMC, SAVANUR' },
        { id: 181, name: 'APMC, SEDAM' },
        { id: 195, name: 'APMC, SHAHAPUR' },
        { id: 149, name: 'APMC, SHIGGAON' },
        { id: 54, name: 'APMC, SHIKARIPUR' },
        { id: 57, name: 'APMC, SHIVAMOGGA' },
        { id: 162, name: 'APMC, SIDDAPUR' },
        { id: 137, name: 'APMC, SINDHAGI' },
        { id: 193, name: 'APMC, SINDHANUR' },
        { id: 60, name: 'APMC, SIRA' },
        { id: 160, name: 'APMC, SIRSI' },
        { id: 167, name: 'APMC, SIRUGUPPA' },
        { id: 53, name: 'APMC, SORABA' },
        { id: 46, name: 'APMC, SRINIVAASPUR' },
        { id: 102, name: 'APMC, SRIRANGAPATNA' },
        { id: 88, name: 'APMC, SULLIA' },
        { id: 194, name: 'APMC, SURPUR' },
        { id: 113, name: 'APMC, T.NARASIPUR' },
        { id: 138, name: 'APMC, TALIKOT' },
        { id: 80, name: 'APMC, TARIKERE' },
        { id: 56, name: 'APMC, THIRTHAHALLI' },
        { id: 65, name: 'APMC, TIPTUR' },
        { id: 63, name: 'APMC, TUMKUR' },
        { id: 66, name: 'APMC, TURUVEKERE' },
        { id: 115, name: 'APMC, UDUPI' },
        { id: 135, name: 'APMC, VIJAYAPUR' },
        { id: 196, name: 'APMC, YADGIR' },
        { id: 184, name: 'APMC, YALABURGA' },
        { id: 111, name: 'APMC, YARAHALLI' },
        { id: 134, name: 'APMC, YARGATTI' },
        { id: 158, name: 'APMC, YELLAPUR' },
        { id: 32, name: 'APMC, YESHWANTHPUR, BENGALURU' },
        { id: 164, name: 'APMC,HAGRIBOMMANHALLI' },
        { id: 145, name: 'RON (HOLEALUR)' },
        { id: 233, name: 'Sandur' }
    ];

    // Base master commodities matching the 7 UI categories & emoji helper
    const MASTER_COMMODITIES = [
        { id: 101, name: 'Onion', kannada: 'ಈರುಳ್ಳಿ', group: 'Vegetables', basePrice: 2850, baseVol: 4200 },
        { id: 102, name: 'Tomato', kannada: 'ಟೊಮೆಟೊ', group: 'Vegetables', basePrice: 1950, baseVol: 3600 },
        { id: 103, name: 'Potato', kannada: 'ಆಲೂಗಡ್ಡೆ', group: 'Vegetables', basePrice: 2350, baseVol: 2800 },
        { id: 104, name: 'Garlic', kannada: 'ಬೆಳ್ಳುಳ್ಳಿ', group: 'Vegetables', basePrice: 14800, baseVol: 620 },
        { id: 105, name: 'Ginger', kannada: 'ಶುಂಠಿ', group: 'Vegetables', basePrice: 6400, baseVol: 780 },
        { id: 106, name: 'Green Chilli', kannada: 'ಹಸಿ ಮೆಣಸಿನಕಾಯಿ', group: 'Vegetables', basePrice: 4100, baseVol: 950 },
        { id: 107, name: 'Carrot', kannada: 'ಕ್ಯಾರೆಟ್', group: 'Vegetables', basePrice: 3200, baseVol: 840 },
        { id: 108, name: 'Brinjal', kannada: 'ಬದನೆಕಾಯಿ', group: 'Vegetables', basePrice: 2150, baseVol: 590 },

        { id: 201, name: 'Banana (Elakki)', kannada: 'ಏಲಕ್ಕಿ ಬಾಳೆಹಣ್ಣು', group: 'Fruits', basePrice: 4600, baseVol: 1450 },
        { id: 202, name: 'Mango (Badami)', kannada: 'ಬಾದಾಮಿ ಮಾವು', group: 'Fruits', basePrice: 6800, baseVol: 1100 },
        { id: 203, name: 'Apple', kannada: 'ಸೇಬು', group: 'Fruits', basePrice: 11200, baseVol: 680 },
        { id: 204, name: 'Coconut', kannada: 'ತೆಂಗಿನಕಾಯಿ', group: 'Fruits', basePrice: 3450, baseVol: 2100 },

        { id: 301, name: 'Paddy (Sona Masoori)', kannada: 'ಸೋನಾ ಮಸೂರಿ ಭತ್ತ', group: 'Cereals', basePrice: 2740, baseVol: 5400 },
        { id: 302, name: 'Maize', kannada: 'ಮೆಕ್ಕೆಜೋಳ', group: 'Cereals', basePrice: 2290, baseVol: 6800 },
        { id: 303, name: 'Ragi (Finger Millet)', kannada: 'ರಾಗಿ', group: 'Cereals', basePrice: 3580, baseVol: 2950 },
        { id: 304, name: 'Jowar (Sorghum)', kannada: 'ಜೋಳ', group: 'Cereals', basePrice: 3420, baseVol: 1850 },
        { id: 305, name: 'Wheat', kannada: 'ಗೋಧಿ', group: 'Cereals', basePrice: 2980, baseVol: 1520 },

        { id: 401, name: 'Red Gram (Tur)', kannada: 'ತೊಗರಿ ಕಾಳು', group: 'Pulses', basePrice: 9650, baseVol: 3200 },
        { id: 402, name: 'Bengal Gram (Chana)', kannada: 'ಕಡಲೆ ಕಾಳು', group: 'Pulses', basePrice: 6250, baseVol: 2450 },
        { id: 403, name: 'Green Gram (Moong)', kannada: 'ಹೆಸರು ಕಾಳು', group: 'Pulses', basePrice: 8150, baseVol: 1320 },

        { id: 501, name: 'Groundnut', kannada: 'ಶೇಂಗಾ (ನೆಲಗಡಲೆ)', group: 'Oilseeds', basePrice: 6580, baseVol: 2650 },
        { id: 502, name: 'Sunflower', kannada: 'ಸೂರ್ಯಕಾಂತಿ', group: 'Oilseeds', basePrice: 5420, baseVol: 1740 },
        { id: 503, name: 'Soybean', kannada: 'ಸೋಯಾಬೀನ್', group: 'Oilseeds', basePrice: 4680, baseVol: 1920 },

        { id: 601, name: 'Byadagi Dry Chilli', kannada: 'ಬ್ಯಾಡಗಿ ಒಣ ಮೆಣಸಿನಕಾಯಿ', group: 'Spices', basePrice: 26400, baseVol: 3900 },
        { id: 602, name: 'Turmeric', kannada: 'ಅರಿಶಿನ', group: 'Spices', basePrice: 14200, baseVol: 1180 },
        { id: 603, name: 'Black Pepper', kannada: 'ಕಾಳು ಮೆಣಸು', group: 'Spices', basePrice: 61500, baseVol: 420 },

        { id: 701, name: 'Arecanut (Rashi)', kannada: 'ಅಡಿಕೆ (ರಾಶಿ)', group: 'Commercial', basePrice: 48200, baseVol: 2350 },
        { id: 702, name: 'Cotton', kannada: 'ಹತ್ತಿ', group: 'Commercial', basePrice: 7350, baseVol: 4100 },
        { id: 703, name: 'Copra', kannada: 'ಕೊಬ್ಬರಿ', group: 'Commercial', basePrice: 11800, baseVol: 1600 }
    ];

    // Yard-specific featured commodity mixes for major Karnataka hubs
    const YARD_PROFILES = {
        32:  [101, 102, 103, 104, 105, 106, 303, 302, 401, 402, 501, 204, 701, 602], // Yeshwanthpur Bengaluru
        31:  [102, 101, 103, 107, 108, 106, 201, 202, 203, 204, 105, 104],           // FF&V Special Bengaluru
        140: [101, 702, 302, 401, 402, 403, 305, 502, 501, 601, 304, 103],           // Hubli
        110: [301, 303, 201, 204, 602, 102, 101, 105, 403, 501, 703],                // Mysuru
        47:  [102, 103, 202, 107, 106, 101, 108, 303, 501, 201],                     // Kolar
        129: [103, 101, 302, 503, 501, 106, 102, 305, 402, 602],                     // Belagavi
        57:  [701, 301, 302, 603, 105, 204, 201, 102, 501],                          // Shivamogga
        168: [301, 702, 601, 302, 501, 502, 304, 401, 101],                          // Ballari
        179: [401, 402, 403, 304, 502, 503, 702, 305, 101],                          // Kalaburagi
        43:  [302, 301, 701, 702, 101, 204, 502, 501, 303],                          // Davanagere
        153: [601, 702, 302, 501, 101, 403, 304],                                    // Byadagi
        175: [503, 401, 403, 402, 304, 302, 502, 501, 301, 101],                     // Bidar (Soybean #1!)
        172: [503, 401, 403, 402, 304, 502, 301, 302, 101],                          // Basavakalyan
        173: [503, 401, 403, 402, 304, 502],                                         // Bhalki
        174: [503, 702, 304, 401, 403, 402, 502, 302],                               // Aurad
        176: [503, 501, 403, 401, 304, 402, 101, 105],                               // Humnabad
        191: [301, 702, 401, 501, 502, 304, 402, 403],                               // Raichur
        135: [401, 402, 302, 304, 502, 101, 702, 501],                               // Vijayapur
        146: [702, 101, 601, 402, 403, 302, 501, 502],                               // Gadag
        152: [302, 702, 601, 501, 503, 304, 403, 101],                               // Haveri
        122: [302, 402, 502, 501, 304, 702, 101, 602]                                // Bagalkot
    };

    // Seeded pseudo-random generator for reproducible yet distinct data per APMC
    function createRng(seed) {
        let s = seed % 2147483647;
        if (s <= 0) s += 2147483646;
        return function () {
            s = (s * 16807) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }

    // In-memory store per APMC so live ticks mutate smoothly during a session
    const yardCache = new Map();

    function buildYardState(apmcId) {
        const yard = APMC_YARDS.find(y => y.id === apmcId) || { id: apmcId, name: 'APMC YARD #' + apmcId };
        const rng = createRng(apmcId * 7919 + 104729);

        let selectedIds = YARD_PROFILES[apmcId];
        if (!selectedIds) {
            // Pick 8 to 13 commodities deterministically for any other Karnataka APMC
            const count = 8 + Math.floor(rng() * 6);
            const pool = MASTER_COMMODITIES.slice();
            selectedIds = [];
            while (selectedIds.length < count && pool.length > 0) {
                const idx = Math.floor(rng() * pool.length);
                selectedIds.push(pool.splice(idx, 1)[0].id);
            }
        }

        const today = new Date();
        const marketDate = today.toISOString().split('T')[0] + 'T00:00:00';
        const isMajorYard = Boolean(YARD_PROFILES[apmcId]);
        const volMultiplier = isMajorYard ? 1.0 : (0.28 + rng() * 0.45);

        const commodities = selectedIds.map((cid, index) => {
            const master = MASTER_COMMODITIES.find(m => m.id === cid);
            // Slight regional price variance (-8% to +8%)
            const regionalFactor = 0.92 + rng() * 0.16;
            const modalPrice = Math.round((master.basePrice * regionalFactor) / 10) * 10;

            // Change percent between -6.8% and +7.4%, ensuring a healthy mix of gainers, losers & flat
            let pct;
            if (index === 0) pct = +(1.8 + rng() * 4.5).toFixed(2);
            else if (index === 1) pct = -(1.4 + rng() * 4.2).toFixed(2);
            else if (index % 5 === 0) pct = +((rng() - 0.5) * 0.6).toFixed(2); // flat within ±0.4%
            else pct = +((rng() * 11.5) - 5.2).toFixed(2);

            const previousPrice = Math.round((modalPrice / (1 + pct / 100)) / 5) * 5;
            const changeValue = modalPrice - previousPrice;
            const actualPct = previousPrice > 0 ? +(((modalPrice - previousPrice) / previousPrice) * 100).toFixed(2) : pct;

            const spreadDown = 0.06 + rng() * 0.09;
            const spreadUp = 0.05 + rng() * 0.09;
            const minPrice = Math.round((modalPrice * (1 - spreadDown)) / 10) * 10;
            const maxPrice = Math.round((modalPrice * (1 + spreadUp)) / 10) * 10;
            const arrival = Math.max(25, Math.round(master.baseVol * volMultiplier * (0.65 + rng() * 0.75)));

            return {
                commodityId: master.id,
                commodityName: master.name,
                commodityKannada: master.kannada,
                groupName: master.group,
                currentPrice: modalPrice,
                previousPrice: previousPrice,
                minPrice: Math.min(minPrice, modalPrice),
                maxPrice: Math.max(maxPrice, modalPrice),
                changePercent: actualPct,
                changeValue: changeValue,
                arrival: arrival
            };
        });

        const totalArrivals = commodities.reduce((sum, c) => sum + c.arrival, 0);
        const arrivalsDelta = +((rng() * 24) - 8).toFixed(1);

        const summary = {
            apmcId: yard.id,
            apmcName: yard.name,
            marketDate: marketDate,
            totalArrivals: totalArrivals,
            arrivalsVsYesterday: arrivalsDelta,
            arrivalsRising: arrivalsDelta >= 0,
            commodityCount: commodities.length,
            activity: 'Active Auction',
            hasData: true
        };

        const state = { summary, commodities, historyCache: new Map() };
        yardCache.set(apmcId, state);
        return state;
    }

    function getOrCreateYard(apmcId) {
        if (!yardCache.has(apmcId)) {
            return buildYardState(apmcId);
        }
        return yardCache.get(apmcId);
    }

    function generateHistorySeries(apmcId, commodity, periodDays) {
        const requested = periodDays === 0 ? 730 : Math.max(5, periodDays || 30);
        const totalBars = requested + 65; // include warmup bars for SMA 50 / EMA 12 / RSI 14
        const rng = createRng(apmcId * 131 + commodity.commodityId * 997 + requested * 17);
        const daily = [];

        const endPrice = commodity.currentPrice;
        const startRatio = 0.86 + rng() * 0.24;
        let runningPrice = Math.round(endPrice * startRatio);

        for (let i = totalBars - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const isoDate = d.toISOString().split('T')[0];
            const dateLabel = d.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: requested > 120 ? '2-digit' : undefined
            });

            let modal;
            if (i === 0) {
                modal = commodity.currentPrice;
            } else if (i === 1) {
                modal = commodity.previousPrice;
            } else {
                const pull = (endPrice - runningPrice) * (0.14 + rng() * 0.12);
                const shock = runningPrice * ((rng() - 0.5) * 0.06);
                runningPrice = Math.max(300, Math.round((runningPrice + pull + shock) / 10) * 10);
                modal = runningPrice;
            }

            const prevClose = daily.length > 0 ? daily[daily.length - 1].close : modal;
            const rawLow = i === 0 ? commodity.minPrice : Math.round((modal * (0.91 + rng() * 0.05)) / 10) * 10;
            const rawHigh = i === 0 ? commodity.maxPrice : Math.round((modal * (1.04 + rng() * 0.06)) / 10) * 10;
            const low = Math.min(rawLow, prevClose, modal);
            const high = Math.max(rawHigh, prevClose, modal);
            const arrival = i === 0
                ? commodity.arrival
                : Math.max(15, Math.round(commodity.arrival * (0.6 + rng() * 0.85)));

            daily.push({
                date: isoDate,
                dateLabel: dateLabel,
                open: prevClose,
                high: high,
                low: low,
                close: modal,
                price: modal,
                minPrice: low,
                maxPrice: high,
                arrival: arrival
            });
        }
        return daily;
    }

    function aggregateMockBars(dailyBars, interval) {
        if (interval === 'daily') return dailyBars;
        const buckets = new Map();
        dailyBars.forEach(b => {
            const dt = new Date(b.date + 'T00:00:00');
            let key;
            let label;
            if (interval === 'monthly') {
                key = b.date.slice(0, 7) + '-01';
                label = dt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
            } else {
                // Weekly Monday bucket
                const day = dt.getDay();
                const diff = (day === 0 ? -6 : 1 - day);
                const monday = new Date(dt);
                monday.setDate(dt.getDate() + diff);
                key = monday.toISOString().split('T')[0];
                label = monday.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
            }
            if (!buckets.has(key)) {
                buckets.set(key, {
                    date: key,
                    dateLabel: label,
                    open: b.open,
                    high: b.high,
                    low: b.low,
                    close: b.close,
                    price: b.price,
                    minPrice: b.low,
                    maxPrice: b.high,
                    arrival: b.arrival
                });
            } else {
                const agg = buckets.get(key);
                agg.high = Math.max(agg.high, b.high);
                agg.low = Math.min(agg.low, b.low);
                agg.close = b.close;
                agg.price = b.price;
                agg.maxPrice = agg.high;
                agg.minPrice = agg.low;
                agg.arrival += b.arrival;
            }
        });
        return Array.from(buckets.values());
    }

    const MockMarketApi = {
        getApmcYards() {
            return APMC_YARDS.slice();
        },

        async getSummary(apmcId) {
            const state = getOrCreateYard(apmcId);
            return JSON.parse(JSON.stringify(state.summary));
        },

        async getCommodityPrices(apmcId) {
            const state = getOrCreateYard(apmcId);
            return JSON.parse(JSON.stringify(state.commodities));
        },

        async getOhlcHistory(apmcId, commodityId, periodDays, interval, warmup) {
            const state = getOrCreateYard(apmcId);
            const commodity = state.commodities.find(c => c.commodityId === commodityId);
            if (!commodity) return { series: [], warmupBars: [], varieties: [], anchorDate: null, interval: interval || 'daily' };

            const normInterval = (periodDays === 0 && (!interval || interval === 'daily')) ? 'monthly' : (interval || 'daily');
            const cacheKey = commodityId + '_' + periodDays;
            if (!state.historyCache.has(cacheKey)) {
                state.historyCache.set(cacheKey, generateHistorySeries(apmcId, commodity, periodDays));
            }
            const fullDaily = state.historyCache.get(cacheKey);
            if (fullDaily.length > 0) {
                const last = fullDaily[fullDaily.length - 1];
                last.close = commodity.currentPrice;
                last.price = commodity.currentPrice;
                last.minPrice = Math.min(commodity.minPrice, last.open, last.close);
                last.maxPrice = Math.max(commodity.maxPrice, last.open, last.close);
                last.low = last.minPrice;
                last.high = last.maxPrice;
                last.arrival = commodity.arrival;
            }

            const agg = aggregateMockBars(fullDaily, normInterval);
            const visCount = periodDays === 0
                ? agg.length
                : (normInterval === 'daily' ? Math.max(5, periodDays) : (normInterval === 'weekly' ? Math.max(6, Math.ceil(periodDays / 7)) : Math.max(4, Math.ceil(periodDays / 30))));
            const visIdx = Math.max(0, agg.length - visCount);
            const warmN = Math.max(0, Number(warmup || 0));
            const warmStart = Math.max(0, visIdx - warmN);

            return JSON.parse(JSON.stringify({
                series: agg.slice(visIdx),
                warmupBars: agg.slice(warmStart, visIdx),
                varieties: [],
                anchorDate: agg.length ? agg[agg.length - 1].date : null,
                interval: normInterval
            }));
        },

        async getPriceHistory(apmcId, commodityId, periodDays) {
            const res = await this.getOhlcHistory(apmcId, commodityId, periodDays, 'daily', 0);
            return res.series || [];
        },

        // Simulates a live auction price tick for realistic Sync / Auto-stream experience
        simulateLiveTick(apmcId) {
            const state = getOrCreateYard(apmcId);
            let totalArr = 0;
            state.commodities.forEach(c => {
                if (Math.random() < 0.65) {
                    const deltaPct = (Math.random() - 0.48) * 0.016; // -0.77% to +0.83%
                    const nextPrice = Math.max(200, Math.round((c.currentPrice * (1 + deltaPct)) / 5) * 5);
                    c.currentPrice = nextPrice;
                    c.minPrice = Math.min(c.minPrice, nextPrice);
                    c.maxPrice = Math.max(c.maxPrice, nextPrice);
                    c.changeValue = c.currentPrice - c.previousPrice;
                    c.changePercent = c.previousPrice > 0
                        ? +(((c.currentPrice - c.previousPrice) / c.previousPrice) * 100).toFixed(2)
                        : 0;
                    c.arrival = Math.max(10, c.arrival + Math.round((Math.random() - 0.3) * 25));
                }
                totalArr += c.arrival;
            });
            state.summary.totalArrivals = totalArr;
            return state;
        },

        // Cross-yard price comparison for the Trends & Analytics modals
        getCrossMandiComparison(commodityId) {
            const majorIds = [32, 31, 140, 110, 47, 129, 57, 168, 179, 43, 153];
            const results = [];
            majorIds.forEach(id => {
                const state = getOrCreateYard(id);
                const item = state.commodities.find(c => c.commodityId === commodityId);
                if (item) {
                    results.push({
                        apmcId: state.summary.apmcId,
                        apmcName: state.summary.apmcName,
                        currentPrice: item.currentPrice,
                        minPrice: item.minPrice,
                        maxPrice: item.maxPrice,
                        changePercent: item.changePercent,
                        arrival: item.arrival
                    });
                }
            });
            return results.sort((a, b) => b.currentPrice - a.currentPrice);
        },

        getStateWideMovers() {
            const majorIds = [32, 140, 110, 47, 129, 57, 168, 179, 43, 153];
            const rows = [];
            majorIds.forEach(id => {
                const state = getOrCreateYard(id);
                state.commodities.forEach(c => {
                    rows.push({
                        apmcId: state.summary.apmcId,
                        apmcName: state.summary.apmcName,
                        ...c
                    });
                });
            });
            const gainers = rows.slice().sort((a, b) => b.changePercent - a.changePercent).slice(0, 6);
            const losers = rows.slice().sort((a, b) => a.changePercent - b.changePercent).slice(0, 6);
            const volumeLeaders = rows.slice().sort((a, b) => b.arrival - a.arrival).slice(0, 6);
            return { gainers, losers, volumeLeaders };
        },

        // Phase 3 Offline Fallback: Multi-Year Matrix & Period Differential Engine
        _buildMockHistoricalStore(apmcId, commodityId) {
            const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const MONTH_KN = ['', 'ಜನವರಿ', 'ಫೆಬ್ರವರಿ', 'ಮಾರ್ಚ್', 'ಏಪ್ರಿಲ್', 'ಮೇ', 'ಜೂನ್', 'ಜುಲೈ', 'ಆಗಸ್ಟ್', 'ಸೆಪ್ಟೆಂಬರ್', 'ಅಕ್ಟೋಬರ್', 'ನವೆಂಬರ್', 'ಡಿಸೆಂಬರ್'];
            const isAll = String(apmcId).toUpperCase() === 'ALL';
            const yardObj = isAll ? null : getOrCreateYard(apmcId);
            const marketName = isAll ? 'All Karnataka APMCs (Statewide)' : yardObj.summary.apmcName;
            const marketNameKn = isAll ? 'ಎಲ್ಲಾ ಕರ್ನಾಟಕ ಎಪಿಎಂಸಿಗಳು (ರಾಜ್ಯವ್ಯಾಪಿ)' : yardObj.summary.apmcName;

            const comListSrc = isAll ? MASTER_COMMODITIES.map(m => ({
                id: m.id,
                name: m.name,
                nameKn: m.kannada,
                group: m.group,
                groupKn: m.group,
                basePrice: m.basePrice,
                baseVol: m.baseVol * 14
            })) : yardObj.commodities.map(c => ({
                id: c.commodityId,
                name: c.commodityName,
                nameKn: c.commodityKannada,
                group: c.groupName,
                groupKn: c.groupName,
                basePrice: c.currentPrice,
                baseVol: c.arrival
            }));

            let chosen = comListSrc.find(c => String(c.id) === String(commodityId)) || comListSrc[0];
            if (!chosen) {
                chosen = { id: 101, name: 'Onion', nameKn: 'ಈರುಳ್ಳಿ', group: 'Vegetables', groupKn: 'Vegetables', basePrice: 2850, baseVol: 4200 };
            }

            const numSeed = (isAll ? 999 : Number(yardObj.summary.apmcId || 32)) * 313 + Number(chosen.id || 101) * 37;
            const rng = createRng(numSeed);
            const monthlyBuckets = [];

            for (let yr = 2012; yr <= 2026; yr++) {
                const yrRatio = (yr - 2012) / 14;
                const secularInflation = 0.62 + yrRatio * 0.48;
                const cropShock = (rng() - 0.5) * 0.24;
                const maxMo = yr === 2026 ? 11 : 12;

                for (let mo = 1; mo <= maxMo; mo++) {
                    const seasonalPrice = 1 + Math.sin(((mo - 3) / 12) * Math.PI * 2) * 0.16 + (rng() - 0.5) * 0.1;
                    const seasonalArr = 1 - Math.sin(((mo - 3) / 12) * Math.PI * 2) * 0.22 + (rng() - 0.5) * 0.18;
                    const avgModal = Math.max(400, Math.round((chosen.basePrice * secularInflation * (1 + cropShock) * seasonalPrice) / 10) * 10);
                    const spreadRatio = 0.14 + rng() * 0.18;
                    const minPrice = Math.max(250, Math.round((avgModal * (1 - spreadRatio * 0.55)) / 10) * 10);
                    const maxPrice = Math.round((avgModal * (1 + spreadRatio * 0.65)) / 10) * 10;
                    const tdays = yr === 2026 && mo === 11 ? 9 : Math.round(18 + rng() * 7);
                    const dailyArr = Math.max(40, Math.round(chosen.baseVol * Math.max(0.45, seasonalArr) * (0.85 + yrRatio * 0.25)));
                    monthlyBuckets.push({
                        yr,
                        mo,
                        key: yr + '-' + String(mo).padStart(2, '0'),
                        label: MONTH_ABBR[mo] + ' ' + yr,
                        labelKn: MONTH_KN[mo] + ' ' + yr,
                        monthAbbr: MONTH_ABBR[mo],
                        monthKn: MONTH_KN[mo],
                        tradingDays: tdays,
                        marketsReporting: isAll ? Math.round(42 + rng() * 28) : 1,
                        totalArrivals: Math.round(dailyArr * tdays * 100) / 100,
                        avgDailyArrivals: Math.round(dailyArr * 100) / 100,
                        minPrice,
                        avgModalPrice: avgModal,
                        maxPrice
                    });
                }
            }

            return {
                MONTH_ABBR,
                MONTH_KN,
                market: isAll ? 'ALL' : yardObj.summary.apmcId,
                marketName,
                marketNameKn,
                commodity: chosen.id,
                commodityName: chosen.name,
                commodityNameKn: chosen.nameKn,
                commodities: comListSrc.map(c => ({
                    id: c.id,
                    name: c.name,
                    nameKn: c.nameKn,
                    group: c.group,
                    groupKn: c.groupKn
                })),
                monthlyBuckets
            };
        },

        _safePct(cur, prev) {
            if (cur == null || prev == null || prev <= 0) return null;
            return Math.round(((cur - prev) / prev) * 10000) / 100;
        },

        _classifyRegime(pricePct, arrivalsPct) {
            if (pricePct == null || arrivalsPct == null) return 'baseline';
            if (arrivalsPct > 8.0 && pricePct < -3.0) return 'supply_glut';
            if (arrivalsPct < -8.0 && pricePct > 3.0) return 'supply_shortage';
            if (arrivalsPct > 8.0 && pricePct > 3.0) return 'demand_rally';
            if (arrivalsPct < -8.0 && pricePct < -3.0) return 'demand_softening';
            return 'balanced';
        },

        async getMultiYearAnalysis(apmcId, commodityId, years, granularity, focusMonth) {
            const store = this._buildMockHistoricalStore(apmcId, commodityId);
            const normGran = (granularity || 'annual').toLowerCase() === 'monthly' ? 'monthly' : 'annual';
            const focusM = focusMonth && Number(focusMonth) >= 1 && Number(focusMonth) <= 12 ? Number(focusMonth) : null;
            const yrsInt = years != null ? Number(years) : 5;

            const filteredBuckets = focusM ? store.monthlyBuckets.filter(b => b.mo === focusM) : store.monthlyBuckets;
            const availYears = Array.from(new Set(store.monthlyBuckets.map(b => b.yr))).sort((a, b) => b - a);
            const availMonths = store.monthlyBuckets.map(b => b.key).slice().reverse();

            const peakByYear = new Map();
            store.monthlyBuckets.forEach(b => {
                const cur = peakByYear.get(b.yr);
                if (!cur || b.avgModalPrice > cur.avgModalPrice) {
                    peakByYear.set(b.yr, b);
                }
            });

            const rowsAsc = [];
            if (normGran === 'annual') {
                const byYear = new Map();
                filteredBuckets.forEach(b => {
                    if (!byYear.has(b.yr)) byYear.set(b.yr, []);
                    byYear.get(b.yr).push(b);
                });
                let prev = null;
                Array.from(byYear.keys()).sort((a, b) => a - b).forEach(yr => {
                    const list = byYear.get(yr);
                    const totArr = list.reduce((s, x) => s + x.totalArrivals, 0);
                    const tdays = list.reduce((s, x) => s + x.tradingDays, 0);
                    const avgModal = Math.round((list.reduce((s, x) => s + x.avgModalPrice * x.totalArrivals, 0) / Math.max(1, totArr)) * 100) / 100;
                    const minP = Math.min(...list.map(x => x.minPrice));
                    const maxP = Math.max(...list.map(x => x.maxPrice));
                    const volPct = avgModal > 0 ? Math.round(((maxP - minP) / avgModal) * 1000) / 10 : 0;
                    const pk = peakByYear.get(yr);
                    const dPrice = prev ? this._safePct(avgModal, prev.avgModalPrice) : null;
                    const dArr = prev ? this._safePct(totArr, prev.totalArrivals) : null;
                    const entry = {
                        periodKey: focusM ? (yr + '-' + String(focusM).padStart(2, '0')) : String(yr),
                        periodLabel: focusM ? (store.MONTH_ABBR[focusM] + ' ' + yr) : String(yr),
                        periodLabelKn: focusM ? (store.MONTH_KN[focusM] + ' ' + yr) : String(yr),
                        year: yr,
                        month: focusM,
                        tradingDays: tdays,
                        marketsReporting: Math.max(...list.map(x => x.marketsReporting)),
                        totalArrivals: Math.round(totArr * 100) / 100,
                        avgDailyArrivals: tdays > 0 ? Math.round((totArr / tdays) * 100) / 100 : 0,
                        minPrice: minP,
                        avgModalPrice: avgModal,
                        maxPrice: maxP,
                        volatilityPct: volPct,
                        peakMonth: pk ? pk.monthAbbr : (focusM ? store.MONTH_ABBR[focusM] : '--'),
                        peakMonthKn: pk ? pk.monthKn : (focusM ? store.MONTH_KN[focusM] : '--'),
                        peakMonthPrice: pk ? pk.avgModalPrice : avgModal,
                        deltaPricePct: dPrice,
                        deltaArrivalsPct: dArr,
                        prevPeriodKey: prev ? prev.periodKey : null,
                        regime: prev ? this._classifyRegime(dPrice, dArr) : 'baseline'
                    };
                    rowsAsc.push(entry);
                    prev = entry;
                });
            } else {
                let prev = null;
                filteredBuckets.forEach(b => {
                    const volPct = b.avgModalPrice > 0 ? Math.round(((b.maxPrice - b.minPrice) / b.avgModalPrice) * 1000) / 10 : 0;
                    const dPrice = prev ? this._safePct(b.avgModalPrice, prev.avgModalPrice) : null;
                    const dArr = prev ? this._safePct(b.totalArrivals, prev.totalArrivals) : null;
                    const entry = {
                        periodKey: b.key,
                        periodLabel: b.label,
                        periodLabelKn: b.labelKn,
                        year: b.yr,
                        month: b.mo,
                        tradingDays: b.tradingDays,
                        marketsReporting: b.marketsReporting,
                        totalArrivals: b.totalArrivals,
                        avgDailyArrivals: b.avgDailyArrivals,
                        minPrice: b.minPrice,
                        avgModalPrice: b.avgModalPrice,
                        maxPrice: b.maxPrice,
                        volatilityPct: volPct,
                        peakMonth: b.monthAbbr,
                        peakMonthKn: b.monthKn,
                        peakMonthPrice: b.maxPrice,
                        deltaPricePct: dPrice,
                        deltaArrivalsPct: dArr,
                        prevPeriodKey: prev ? prev.periodKey : null,
                        regime: prev ? this._classifyRegime(dPrice, dArr) : 'baseline'
                    };
                    rowsAsc.push(entry);
                    prev = entry;
                });
            }

            const maxYr = availYears[0];
            const minYr = yrsInt > 0 ? (maxYr - yrsInt + 1) : 0;
            const visibleAsc = yrsInt > 0 ? rowsAsc.filter(r => r.year >= minYr) : rowsAsc;
            const visibleDesc = visibleAsc.slice().reverse();

            let summary = null;
            if (visibleAsc.length) {
                const firstR = visibleAsc[0];
                const lastR = visibleAsc[visibleAsc.length - 1];
                const bestP = visibleAsc.reduce((a, b) => (b.avgModalPrice > a.avgModalPrice ? b : a), visibleAsc[0]);
                const lowP = visibleAsc.reduce((a, b) => (b.avgModalPrice < a.avgModalPrice ? b : a), visibleAsc[0]);
                const peakA = visibleAsc.reduce((a, b) => (b.totalArrivals > a.totalArrivals ? b : a), visibleAsc[0]);
                summary = {
                    periodsCount: visibleAsc.length,
                    firstPeriod: firstR.periodLabel,
                    lastPeriod: lastR.periodLabel,
                    spanPriceChangePct: this._safePct(lastR.avgModalPrice, firstR.avgModalPrice),
                    spanArrivalsChangePct: this._safePct(lastR.totalArrivals, firstR.totalArrivals),
                    avgModalAcrossWindow: Math.round((visibleAsc.reduce((s, x) => s + x.avgModalPrice, 0) / visibleAsc.length) * 100) / 100,
                    avgArrivalsPerPeriod: Math.round((visibleAsc.reduce((s, x) => s + x.totalArrivals, 0) / visibleAsc.length) * 100) / 100,
                    highestPricePeriod: bestP.periodLabel,
                    highestPriceValue: bestP.avgModalPrice,
                    lowestPricePeriod: lowP.periodLabel,
                    lowestPriceValue: lowP.avgModalPrice,
                    peakArrivalsPeriod: peakA.periodLabel,
                    peakArrivalsValue: peakA.totalArrivals
                };
            }

            return {
                market: store.market,
                marketName: store.marketName,
                marketNameKn: store.marketNameKn,
                commodity: store.commodity,
                commodityName: store.commodityName,
                commodityNameKn: store.commodityNameKn,
                years: yrsInt,
                granularity: normGran,
                focusMonth: focusM,
                deltaType: (normGran === 'monthly' && !focusM) ? 'mom' : 'yoy',
                rows: visibleDesc,
                summary,
                availableYears: availYears,
                availableMonths: availMonths,
                commodities: store.commodities,
                defaultCompareA: visibleDesc[1]?.periodKey || visibleDesc[0]?.periodKey || null,
                defaultCompareB: visibleDesc[0]?.periodKey || null
            };
        },

        async compareAnalysisPeriods(apmcId, commodityId, periodA, periodB) {
            const store = this._buildMockHistoricalStore(apmcId, commodityId);
            const parseTok = tok => {
                const s = String(tok || '').trim();
                const m = /^(\d{4})-(\d{2})$/.exec(s);
                if (m) {
                    const y = Number(m[1]), mo = Number(m[2]);
                    return { kind: 'month', key: s, year: y, month: mo, label: store.MONTH_ABBR[mo] + ' ' + y, labelKn: store.MONTH_KN[mo] + ' ' + y };
                }
                const yMatch = /^(\d{4})$/.exec(s);
                if (yMatch) {
                    const y = Number(yMatch[1]);
                    return { kind: 'year', key: s, year: y, month: null, label: s, labelKn: s };
                }
                return { kind: 'year', key: '2026', year: 2026, month: null, label: '2026', labelKn: '2026' };
            };
            const summarize = parsed => {
                const list = store.monthlyBuckets.filter(b => b.yr === parsed.year && (parsed.month == null || b.mo === parsed.month));
                if (!list.length) {
                    return { hasData: false, key: parsed.key, label: parsed.label, labelKn: parsed.labelKn, kind: parsed.kind, tradingDays: 0, marketsReporting: 0, totalArrivals: 0, avgDailyArrivals: 0, minPrice: null, avgModalPrice: null, maxPrice: null, volatilityPct: null, firstDate: null, lastDate: null };
                }
                const totArr = Math.round(list.reduce((s, x) => s + x.totalArrivals, 0) * 100) / 100;
                const tdays = list.reduce((s, x) => s + x.tradingDays, 0);
                const avgM = Math.round((list.reduce((s, x) => s + x.avgModalPrice * x.totalArrivals, 0) / Math.max(1, totArr)) * 100) / 100;
                const minP = Math.min(...list.map(x => x.minPrice));
                const maxP = Math.max(...list.map(x => x.maxPrice));
                return {
                    hasData: true,
                    key: parsed.key,
                    label: parsed.label,
                    labelKn: parsed.labelKn,
                    kind: parsed.kind,
                    tradingDays: tdays,
                    marketsReporting: Math.max(...list.map(x => x.marketsReporting)),
                    totalArrivals: totArr,
                    avgDailyArrivals: tdays > 0 ? Math.round((totArr / tdays) * 100) / 100 : 0,
                    minPrice: minP,
                    avgModalPrice: avgM,
                    maxPrice: maxP,
                    volatilityPct: avgM > 0 ? Math.round(((maxP - minP) / avgM) * 1000) / 10 : 0,
                    firstDate: list[0].key + '-02',
                    lastDate: list[list.length - 1].key + '-25'
                };
            };

            const pA = parseTok(periodA);
            const pB = parseTok(periodB);
            const sA = summarize(pA);
            const sB = summarize(pB);
            const modalPct = this._safePct(sB.avgModalPrice, sA.avgModalPrice);
            const arrPct = this._safePct(sB.totalArrivals, sA.totalArrivals);

            const breakdown = [];
            let breakdownMode = 'summary';
            if (pA.kind === 'year' && pB.kind === 'year') {
                breakdownMode = 'monthly';
                for (let m = 1; m <= 12; m++) {
                    const va = store.monthlyBuckets.find(b => b.yr === pA.year && b.mo === m);
                    const vb = store.monthlyBuckets.find(b => b.yr === pB.year && b.mo === m);
                    breakdown.push({
                        bucket: m,
                        label: store.MONTH_ABBR[m],
                        labelKn: store.MONTH_KN[m],
                        aModal: va ? va.avgModalPrice : null,
                        bModal: vb ? vb.avgModalPrice : null,
                        aArrivals: va ? va.totalArrivals : 0,
                        bArrivals: vb ? vb.totalArrivals : 0,
                        modalPct: this._safePct(vb ? vb.avgModalPrice : null, va ? va.avgModalPrice : null)
                    });
                }
            } else if (pA.kind === 'month' && pB.kind === 'month') {
                breakdownMode = 'daily';
                const va = store.monthlyBuckets.find(b => b.yr === pA.year && b.mo === pA.month);
                const vb = store.monthlyBuckets.find(b => b.yr === pB.year && b.mo === pB.month);
                for (let d = 2; d <= 26; d += 3) {
                    const waveA = 1 + Math.sin(d * 0.4) * 0.06;
                    const waveB = 1 + Math.cos(d * 0.35) * 0.06;
                    const aM = va ? Math.round(va.avgModalPrice * waveA) : null;
                    const bM = vb ? Math.round(vb.avgModalPrice * waveB) : null;
                    breakdown.push({
                        bucket: d,
                        label: 'D' + String(d).padStart(2, '0'),
                        labelKn: 'ದಿನ ' + d,
                        aModal: aM,
                        bModal: bM,
                        aArrivals: va ? Math.round(va.avgDailyArrivals * waveA) : 0,
                        bArrivals: vb ? Math.round(vb.avgDailyArrivals * waveB) : 0,
                        modalPct: this._safePct(bM, aM)
                    });
                }
            }

            return {
                market: store.market,
                marketName: store.marketName,
                marketNameKn: store.marketNameKn,
                commodity: store.commodity,
                commodityName: store.commodityName,
                commodityNameKn: store.commodityNameKn,
                periodA: sA,
                periodB: sB,
                diff: {
                    modalPriceAbs: sA.hasData && sB.hasData ? Math.round((sB.avgModalPrice - sA.avgModalPrice) * 100) / 100 : null,
                    modalPricePct: modalPct,
                    arrivalsAbs: sA.hasData && sB.hasData ? Math.round((sB.totalArrivals - sA.totalArrivals) * 100) / 100 : null,
                    arrivalsPct: arrPct,
                    avgDailyArrivalsAbs: sA.hasData && sB.hasData ? Math.round((sB.avgDailyArrivals - sA.avgDailyArrivals) * 100) / 100 : null,
                    avgDailyArrivalsPct: this._safePct(sB.avgDailyArrivals, sA.avgDailyArrivals),
                    minPriceAbs: sA.hasData && sB.hasData ? Math.round((sB.minPrice - sA.minPrice) * 100) / 100 : null,
                    minPricePct: this._safePct(sB.minPrice, sA.minPrice),
                    maxPriceAbs: sA.hasData && sB.hasData ? Math.round((sB.maxPrice - sA.maxPrice) * 100) / 100 : null,
                    maxPricePct: this._safePct(sB.maxPrice, sA.maxPrice),
                    volatilityPts: sA.hasData && sB.hasData ? Math.round((sB.volatilityPct - sA.volatilityPct) * 10) / 10 : null,
                    tradingDaysAbs: sA.hasData && sB.hasData ? (sB.tradingDays - sA.tradingDays) : null,
                    tradingDaysPct: this._safePct(sB.tradingDays, sA.tradingDays)
                },
                regime: this._classifyRegime(modalPct, arrPct),
                breakdownMode,
                breakdown
            };
        },

        async listAnalysisReports() {
            return [{
                id: 'tr1_soyabean_2026',
                number: 1,
                title: 'Technical Report 1: Price Analysis, Prediction, and Recommendations for Soyabean Crop',
                titleKn: 'ತಾಂತ್ರಿಕ ವರದಿ 1: ಸೋಯಾಬೀನ್ ಬೆಳೆಯ ಬೆಲೆ ವಿಶ್ಲೇಷಣೆ, AI ಮುನ್ಸೂಚನೆ ಮತ್ತು ಶಿಫಾರಸುಗಳು',
                shortTitle: 'TR-1: Soyabean Crop (Nov 2026)',
                shortTitleKn: 'ವರದಿ 1: ಸೋಯಾಬೀನ್ (ನವೆಂ 2026)',
                author: 'Prof. Y. Narahari',
                authorKn: 'ಪ್ರೊ. ವೈ. ನರಹರಿ',
                institution: 'Department of Computer Science and Automation (CSA), IISc Bengaluru',
                institutionKn: 'ಕಂಪ್ಯೂಟರ್ ವಿಜ್ಞಾನ ವಿಭಾಗ (CSA), IISc ಬೆಂಗಳೂರು',
                reportDate: '2026-11-10',
                commodity: 'SOYABEEN',
                commodityName: 'Soybean',
                commodityNameKn: 'ಸೋಯಾಬೀನ್',
                msp: 5708.0,
                mspSeason: '2026-27',
                focusMarkets: ['BIDAR', 'BAILHONGAL', 'HUBBALLI', 'KALABURAGI'],
                forecastCutoff: '2026-10-14',
                forecastEnd: '2026-12-31'
            }];
        },

        async getAnalysisReport(reportId, market) {
            const reqMkt = ['BIDAR', 'BAILHONGAL', 'HUBBALLI', 'KALABURAGI', 'ALL'].includes(String(market || '').toUpperCase())
                ? String(market).toUpperCase()
                : 'BIDAR';
            const outMkt = reqMkt === 'ALL' ? 'BIDAR' : reqMkt;
            const table1 = [
                { market: 'BIDAR', marketName: 'Bidar', marketNameKn: 'ಬೀದರ್', isStatewide: false, role: 'inflow_hub', roleLabel: 'Inflow & Border Hub', roleLabelKn: 'ಒಳಹರಿವು / ಗಡಿ ಮಂಡಿ', octPrevPrice: 3858.8, octCurrPrice: 6770.5, priceChangePct: 75.5, octPrevArrivals: 166921, octCurrArrivals: 239542, arrivalsChangePct: 43.5, peak2026Price: 7235.0, peak2026Date: '2026-10-15', latestPrice: 7139.0, latestDate: '2026-11-10', note: 'Arrivals surged +43.5% yet modal jumped +75.5% due to cross-border MH/TS inflows and early mill demand.', noteKn: 'ಆವಕ +43.5% ಹೆಚ್ಚಾದರೂ ಗಡಿ ಒಳಹರಿವು ಮತ್ತು ಗಿರಣಿ ಬೇಡಿಕೆಯಿಂದ ದರ +75.5% ಏರಿಕೆಯಾಗಿದೆ.' },
                { market: 'BAILHONGAL', marketName: 'Bailhongal', marketNameKn: 'ಬೈಲಹೊಂಗಲ', isStatewide: false, role: 'deficit_hub', roleLabel: 'Deficit / Early Harvest', roleLabelKn: 'ಕೊರತೆ / ಮುಂಗಡ ಕೊಯ್ಲು', octPrevPrice: 3904.4, octCurrPrice: 6131.5, priceChangePct: 57.0, octPrevArrivals: 216526, octCurrArrivals: 101384, arrivalsChangePct: -53.2, peak2026Price: 7002.0, peak2026Date: '2026-11-04', latestPrice: 6680.0, latestDate: '2026-11-09', note: 'Largest arrival drop (-53.2%) from Belagavi yield loss and Sep 20 early harvest concentration.', noteKn: 'ಬೆಳಗಾವಿ ಬೆಳೆ ನಷ್ಟ ಮತ್ತು ಸೆಪ್ಟೆಂಬರ್ ಮುಂಗಡ ಕೊಯ್ಲಿನಿಂದ ಆವಕ -53.2% ಕುಸಿದಿದೆ.' },
                { market: 'HUBBALLI', marketName: 'Hubballi', marketNameKn: 'ಹುಬ್ಬಳ್ಳಿ', isStatewide: false, role: 'deficit_hub', roleLabel: 'Deficit / Mill Competition', roleLabelKn: 'ಕೊರತೆ / ಗಿರಣಿ ಬೇಡಿಕೆ', octPrevPrice: 3866.2, octCurrPrice: 6665.0, priceChangePct: 72.4, octPrevArrivals: 23099, octCurrArrivals: 16637, arrivalsChangePct: -28.0, peak2026Price: 7245.0, peak2026Date: '2026-10-16', latestPrice: 6490.0, latestDate: '2026-11-06', note: 'Solvent extraction plants & feed units competed sharply for scarce arrivals (+72.4% YoY modal).', noteKn: 'ಎಣ್ಣೆ ಗಿರಣಿ ಮತ್ತು ಪಶು ಆಹಾರ ಘಟಕಗಳ ಪೈಪೋಟಿಯಿಂದ ದರ +72.4% ಏರಿದೆ.' },
                { market: 'KALABURAGI', marketName: 'Kalaburagi', marketNameKn: 'ಕಲಬುರಗಿ', isStatewide: false, role: 'deficit_hub', roleLabel: 'Severe Dry-Spell Deficit', roleLabelKn: 'ತೀವ್ರ ಬರ ಕೊರತೆ ಪ್ರಾಂಗಣ', octPrevPrice: 3740.3, octCurrPrice: 6263.5, priceChangePct: 67.5, octPrevArrivals: 11838, octCurrArrivals: 1092, arrivalsChangePct: -90.8, peak2026Price: 9450.0, peak2026Date: '2026-09-16', latestPrice: 6410.0, latestDate: '2026-11-10', note: 'Arrivals collapsed -90.8% with an isolated ₹9,450/q mid-Sep outlier spike from thin liquidity.', noteKn: 'ಆವಕ -90.8% ಕುಸಿದು ಸೆಪ್ಟೆಂಬರ್ ಮಧ್ಯದಲ್ಲಿ ₹9,450/ಕ್ವಿಂ ಗರಿಷ್ಠ ದರ ದಾಖಲಾಗಿದೆ.' },
                { market: 'ALL', marketName: 'Karnataka (Statewide)', marketNameKn: 'ಕರ್ನಾಟಕ (ರಾಜ್ಯವ್ಯಾಪಿ)', isStatewide: true, role: 'statewide', roleLabel: '34 Markets Weighted', roleLabelKn: '34 ಮಂಡಿಗಳ ತೂಕದ ಸರಾಸರಿ', octPrevPrice: 3932.2, octCurrPrice: 6442.0, priceChangePct: 63.8, octPrevArrivals: 593846, octCurrArrivals: 515821, arrivalsChangePct: -13.1, peak2026Price: 9450.0, peak2026Date: '2026-09-16', peak2026Market: 'KALABURAGI', latestPrice: 6510.0, latestDate: '2026-11-10', note: 'Across 34 active APMCs, KA production fell -44% while weighted modal rose +63.8%.', noteKn: '34 ಸಕ್ರಿಯ ಎಪಿಎಂಸಿಗಳಲ್ಲಿ ತೂಕದ ಸರಾಸರಿ ದರ +63.8% ಏರಿಕೆಯಾಗಿದೆ.' }
            ];

            // Build synthetic Sep-Dec labels & seasonal waves reflecting Table 1
            const MO = ['Sep', 'Oct', 'Nov', 'Dec'];
            const DAYS = [30, 31, 30, 31];
            const labels = [];
            for (let m = 0; m < 4; m++) {
                for (let d = 1; d <= DAYS[m]; d++) labels.push(MO[m] + ' ' + d);
            }
            const baseRow = table1.find(r => r.market === reqMkt) || table1[0];
            const seriesByYear = {};
            [2022, 2023, 2024, 2025, 2026].forEach((yr, yi) => {
                const prices = [];
                const arrivals = [];
                const yrBase = yr === 2026 ? (baseRow.octCurrPrice || 6400) : ((baseRow.octPrevPrice || 3900) + (3 - yi) * 320);
                const arrBase = yr === 2026 ? (baseRow.octCurrArrivals || 100000) / 30 : (baseRow.octPrevArrivals || 120000) / 30;
                for (let i = 0; i < labels.length; i++) {
                    if (yr === 2026 && i > 70) { prices.push(null); arrivals.push(null); continue; }
                    if (i % 7 === 6) { prices.push(null); arrivals.push(null); continue; }
                    prices.push(Math.round(yrBase * (0.94 + Math.sin(i * 0.14 + yi) * 0.06)));
                    const rush = Math.exp(-Math.pow((i - 38) / 22, 2));
                    arrivals.push(Math.round(arrBase * (0.35 + 1.2 * rush * (0.7 + 0.3 * Math.cos(i * 0.3)))));
                }
                seriesByYear[String(yr)] = { prices, arrivals };
            });

            // Forecast Jun 1 -> Dec 31 daily points
            const fcSpecs = {
                BIDAR: { sectionRef: '3.2 (Figure 5)', cutoff: 7112, medStart: 7140, medEnd: 7350, q10End: 5600, q90End: 9900, zsEnd: 7430, medianRange: '₹7,150 – ₹7,350 / q', bandLateDec: '₹5,600 – ₹9,900 / q', mspRisk: 'marginal', mspRiskLabel: 'Lower q10 dips slightly below MSP ₹5,708/q by late Dec', mspRiskLabelKn: 'ಡಿಸೆಂಬರ್ ಅಂತ್ಯಕ್ಕೆ ಕನಿಷ್ಠ q10 MSP ಗಿಂತ ಸ್ವಲ್ಪ ಕೆಳಗಿಳಿಯಬಹುದು' },
                BAILHONGAL: { sectionRef: '3.3 (Figure 6)', cutoff: 6139, medStart: 6135, medEnd: 6350, q10End: 5050, q90End: 8000, zsEnd: 6325, medianRange: '₹6,100 – ₹6,350 / q', bandLateDec: '₹5,050 – ₹8,000 / q', mspRisk: 'elevated', mspRiskLabel: 'Lower q10 falls well below MSP ₹5,708/q — supports storage', mspRiskLabelKn: 'ಕನಿಷ್ಠ q10 MSP ಗಿಂತ ಕೆಳಗಿಳಿಯುವುದರಿಂದ ಸಂಗ್ರಹಣೆ ಸೂಕ್ತ' },
                HUBBALLI: { sectionRef: '3.4 (Figure 7)', cutoff: 6882, medStart: 6855, medEnd: 7000, q10End: 5300, q90End: 9050, zsEnd: 7195, medianRange: '₹6,800 – ₹7,000 / q', bandLateDec: '₹5,300 – ₹9,050 / q', mspRisk: 'elevated', mspRiskLabel: 'Lower q10 falls below MSP ₹5,708/q late season', mspRiskLabelKn: 'ಡಿಸೆಂಬರ್ ಅಂತ್ಯಕ್ಕೆ q10 MSP ಗಿಂತ ಕೆಳಗಿಳಿಯುವ ಅಪಾಯ' },
                KALABURAGI: { sectionRef: '3.5 (Figure 8)', cutoff: 6850, medStart: 6710, medEnd: 6350, q10End: 4750, q90End: 9300, zsEnd: 6255, medianRange: '₹6,700 → ₹6,350 / q', bandLateDec: '₹4,750 – ₹9,300 / q', mspRisk: 'high', mspRiskLabel: 'Widest downside tail: q10 drops to ₹4,750/q', mspRiskLabelKn: 'ಅತಿ ದೊಡ್ಡ ಕೆಳಮುಖ ವ್ಯಾಪ್ತಿ: q10 ₹4,750 ವರೆಗೆ ಇಳಿಯಬಹುದು' }
            }[outMkt];

            const dates = [];
            const fcLabels = [];
            const actual = [];
            const median = [];
            const q10 = [];
            const q90 = [];
            const zeroShot = [];
            const mspLine = [];
            const M_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const startDt = new Date(2026, 5, 1);
            const cutoffDt = new Date(2026, 9, 14);
            const simMaxDt = new Date(2026, 10, 10);
            const endDt = new Date(2026, 11, 31);
            let idx = 0;
            let cutoffIdx = 0;
            for (let d = new Date(startDt); d <= endDt; d.setDate(d.getDate() + 1)) {
                const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                dates.push(ds);
                fcLabels.push(M_NAMES[d.getMonth() + 1] + ' ' + String(d.getDate()).padStart(2, '0'));
                if (d.getTime() === cutoffDt.getTime()) cutoffIdx = idx;
                mspLine.push(5708);
                if (d <= simMaxDt && d.getDay() !== 0) {
                    const trend = d < cutoffDt ? (fcSpecs.cutoff - 350 * Math.sin(idx * 0.05)) : (fcSpecs.medStart + Math.sin(idx * 0.25) * 140);
                    actual.push(Math.round(trend));
                } else {
                    actual.push(null);
                }
                if (d >= cutoffDt) {
                    const frac = (d - cutoffDt) / (endDt - cutoffDt);
                    const spread = Math.sqrt(Math.max(0, frac));
                    median.push(Math.round(fcSpecs.medStart + (fcSpecs.medEnd - fcSpecs.medStart) * frac));
                    zeroShot.push(Math.round(fcSpecs.medStart + (fcSpecs.zsEnd - fcSpecs.medStart) * frac));
                    q10.push(Math.round(fcSpecs.medStart + (fcSpecs.q10End - fcSpecs.medStart) * spread));
                    q90.push(Math.round(fcSpecs.medStart + (fcSpecs.q90End - fcSpecs.medStart) * spread));
                } else {
                    median.push(null); zeroShot.push(null); q10.push(null); q90.push(null);
                }
                idx++;
            }

            return {
                report: {
                    id: 'tr1_soyabean_2026',
                    number: 1,
                    title: 'Technical Report 1: Price Analysis, Prediction, and Recommendations for Soyabean Crop',
                    titleKn: 'ತಾಂತ್ರಿಕ ವರದಿ 1: ಸೋಯಾಬೀನ್ ಬೆಳೆಯ ಬೆಲೆ ವಿಶ್ಲೇಷಣೆ, AI ಮುನ್ಸೂಚನೆ ಮತ್ತು ಶಿಫಾರಸುಗಳು',
                    shortTitle: 'TR-1: Soyabean Crop (Nov 2026)',
                    shortTitleKn: 'ವರದಿ 1: ಸೋಯಾಬೀನ್ (ನವೆಂ 2026)',
                    author: 'Prof. Y. Narahari',
                    authorKn: 'ಪ್ರೊ. ವೈ. ನರಹರಿ',
                    institution: 'Department of Computer Science and Automation (CSA), Indian Institute of Science, Bengaluru',
                    institutionKn: 'ಕಂಪ್ಯೂಟರ್ ವಿಜ್ಞಾನ ಮತ್ತು ಸ್ವಯಂಚಾಲನೆ ವಿಭಾಗ (CSA), IISc ಬೆಂಗಳೂರು',
                    reportDate: '2026-11-10',
                    commodity: 'SOYABEEN',
                    commodityName: 'Soybean',
                    commodityNameKn: 'ಸೋಯಾಬೀನ್',
                    msp: 5708.0,
                    mspSeason: '2026-27',
                    focusMarkets: ['BIDAR', 'BAILHONGAL', 'HUBBALLI', 'KALABURAGI'],
                    dbLatestDate: '2026-11-10 (Offline Preview)'
                },
                selectedMarket: reqMkt,
                productionContext: {
                    kharifAreaLHa: 1086.31,
                    kharifAsOn: '2026-09-04',
                    soyabeanAreaLHa: 121.82,
                    soyabeanPrevAreaLHa: 122.98,
                    soyabeanAreaYoYPct: -0.94,
                    sopaOutputLmt: 107.93,
                    sopaDeltaLmt: -2.33,
                    sopaDeltaPct: -2.1,
                    karnatakaOutputShockPct: -44,
                    headline: 'Why Karnataka Surged Despite Flat National Supply (-2.1% YoY)',
                    headlineKn: 'ರಾಷ್ಟ್ರೀಯ ಪೂರೈಕೆ (-2.1%) ಸ್ಥಿರವಾಗಿದ್ದರೂ ಕರ್ನಾಟಕದ ದರ ಏಕೆ ಭಾರಿ ಏರಿಕೆ ಕಂಡಿತು?',
                    priceExpectationNote: 'Gains in MP (+32%) and Rajasthan (+48%) nearly offset Karnataka (-44%), Maharashtra (-33%) & Telangana (-46%) nationally, yet localized dry spells pushed Karnataka weighted modal up +63.8%.',
                    priceExpectationNoteKn: 'ಮಧ್ಯಪ್ರದೇಶ (+32%) ಮತ್ತು ರಾಜಸ್ಥಾನ (+48%) ಹೆಚ್ಚಳವು ರಾಷ್ಟ್ರೀಯ ಮಟ್ಟದಲ್ಲಿ ಕೊರತೆಯನ್ನು ಸರಿದೂಗಿಸಿದರೂ, ಕರ್ನಾಟಕದ ಬರಗಾಲವು ಮಾದರಿ ದರವನ್ನು +63.8% ಏರಿಸಿತು.',
                    stateShifts: [
                        { name: 'Telangana', nameKn: 'ತೆಲಂಗಾಣ', pct: -46, driver: 'Dry spells & low soil moisture', driverKn: 'ಮಳೆ ಕೊರತೆ' },
                        { name: 'Karnataka', nameKn: 'ಕರ್ನಾಟಕ', pct: -44, driver: 'Regional dry spells', driverKn: 'ಪ್ರಾದೇಶಿಕ ಬರ' },
                        { name: 'Maharashtra', nameKn: 'ಮಹಾರಾಷ್ಟ್ರ', pct: -33, driver: 'Moisture deficit', driverKn: 'ತೇವಾಂಶ ಕೊರತೆ' },
                        { name: 'All-India (SOPA)', nameKn: 'ಅಖಿಲ ಭಾರತ (SOPA)', pct: -2.1, driver: '107.93 LMT', driverKn: '107.93 LMT' },
                        { name: 'Madhya Pradesh', nameKn: 'ಮಧ್ಯಪ್ರದೇಶ', pct: 32, driver: 'Top producer rebound', driverKn: 'ಅಗ್ರ ಉತ್ಪಾದಕ' },
                        { name: 'Rajasthan', nameKn: 'ರಾಜಸ್ಥಾನ', pct: 48, driver: 'Strong Kharif yield', driverKn: 'ಉತ್ತಮ ಇಳುವರಿ' }
                    ]
                },
                table1,
                seasonalDynamics: {
                    market: reqMkt,
                    marketName: baseRow.marketName,
                    marketNameKn: baseRow.marketNameKn,
                    years: [2022, 2023, 2024, 2025, 2026],
                    labels,
                    seriesByYear,
                    latestCurrYearDate: '2026-11-10'
                },
                modelSpec: {
                    name: 'Fine-Tuned Timestral 123M',
                    nameKn: 'ಫೈನ್-ಟ್ಯೂನ್ಡ್ ಟೈಮ್‌ಸ್ಟ್ರಲ್ 123M',
                    loss: 'Tilde-q (q̃) Loss',
                    lookbackDays: 512,
                    horizonDays: 78,
                    features: 'Log-Transformed Daily Modal Price + Arrivals Volume',
                    featuresKn: 'ಲಾಗ್-ರೂಪಾಂತರಿಸಿದ ದೈನಂದಿನ ಮಾದರಿ ದರ + ಆವಕ ಪ್ರಮಾಣ'
                },
                priceOutlook: {
                    market: outMkt,
                    marketName: table1.find(r => r.market === outMkt)?.marketName || outMkt,
                    marketNameKn: table1.find(r => r.market === outMkt)?.marketNameKn || outMkt,
                    isFallbackFromStatewide: reqMkt !== outMkt,
                    sectionRef: fcSpecs.sectionRef,
                    cutoffDate: '2026-10-14',
                    endDate: '2026-12-31',
                    cutoffIdx,
                    cutoffApproxPrice: fcSpecs.cutoff,
                    medianRange: fcSpecs.medianRange,
                    bandLateDec: fcSpecs.bandLateDec,
                    mspRisk: fcSpecs.mspRisk,
                    mspRiskLabel: fcSpecs.mspRiskLabel,
                    mspRiskLabelKn: fcSpecs.mspRiskLabelKn,
                    narrative: 'Offline preview displaying Technical Report 1 Timestral 123M quantile envelope against synthetic post-cutoff points. Connect FastAPI + DuckDB for exact Krishi Marata Vahini daily overlays.',
                    narrativeKn: 'ಆಫ್‌ಲೈನ್ ಪೂರ್ವವೀಕ್ಷಣೆ: ನಿಖರ ದೈನಂದಿನ ದತ್ತಾಂಶಕ್ಕಾಗಿ FastAPI + DuckDB ಸರ್ವರ್ ಸಂಪರ್ಕಿಸಿ.',
                    mspValue: 5708.0,
                    dates,
                    labels: fcLabels,
                    actual,
                    median,
                    q10,
                    q90,
                    zeroShot,
                    mspLine,
                    evaluation: {
                        realizedDays: 24,
                        latestActualDate: '2026-11-10',
                        latestActualPrice: table1.find(r => r.market === outMkt)?.latestPrice || fcSpecs.cutoff,
                        insideBandPct: 100.0,
                        meanAbsError: 145.0,
                        meanAbsPctError: 2.1,
                        premiumOverMspPct: Math.round((((table1.find(r => r.market === outMkt)?.latestPrice || 6500) - 5708) / 5708) * 1000) / 10
                    }
                },
                extremeEvents: [
                    { market: 'KALABURAGI', tag: 'Supply Contraction (-90.8%)', tagKn: 'ಪೂರೈಕೆ ಕುಸಿತ (-90.8%)', title: 'Kalaburagi Thin-Market Volatility & ₹9,450/q Spike', titleKn: 'ಕಲಬುರಗಿ ಕಡಿಮೆ ಆವಕದ ಏರಿಳಿತ ಮತ್ತು ₹9,450/ಕ್ವಿಂ ಜಿಗಿತ', body: 'Moisture stress cut Oct arrivals by 90.8% (<150 q/day), causing isolated thin-market spikes.', bodyKn: 'ತೇವಾಂಶ ಕೊರತೆಯಿಂದ ಅಕ್ಟೋಬರ್ ಆವಕ 90.8% ಕುಸಿದು ದೈನಂದಿನ ದರದಲ್ಲಿ ತೀವ್ರ ಏರಿಳಿತ ಕಂಡುಬಂತು.' },
                    { market: 'BIDAR', tag: 'Inflow Surge (+43.5%) • Price +75.5%', tagKn: 'ಒಳಹರಿವು ಹೆಚ್ಚಳ (+43.5%)', title: 'Bidar Cross-Border Inflow Magnet (4 Hypotheses)', titleKn: 'ಬೀದರ್ ಗಡಿ ಮಂಡಿಯಲ್ಲಿ ಆವಕ ಮತ್ತು ದರ ಏರಿಕೆಗೆ 4 ಕಾರಣಗಳು', body: 'Carryover liquidation, favorable local pocket, front-loaded trader buying, and Latur/Nanded & Telangana inflows.', bodyKn: 'ಹಳೆಯ ದಾಸ್ತಾನು, ಗಡಿ ಭಾಗದ ಉತ್ತಮ ಇಳುವರಿ, ವ್ಯಾಪಾರಿಗಳ ಮುಂಗಡ ಖರೀದಿ ಮತ್ತು ನೆರೆ ರಾಜ್ಯಗಳ ಒಳಹರಿವು.' },
                    { market: 'BAILHONGAL', tag: 'Early Concentration (Sep 20)', tagKn: 'ಮುಂಗಡ ಕೊಯ್ಲು ಕೇಂದ್ರೀಕರಣ', title: 'Bailhongal & Hubballi Sep Front-Loading -> Oct Rally', titleKn: 'ಬೈಲಹೊಂಗಲ ಮತ್ತು ಹುಬ್ಬಳ್ಳಿ ಸೆಪ್ಟೆಂಬರ್ ಮುಂಗಡ ಆವಕ', body: 'Sep arrival peaks (~17,000 q/d Bailhongal, ~2,400 q/d Hubballi) left October tight, lifting modal rates past ₹7,000/q.', bodyKn: 'ಸೆಪ್ಟೆಂಬರ್‌ನಲ್ಲೇ ಹೆಚ್ಚಿನ ಆವಕ ಬಂದಿದ್ದರಿಂದ ಅಕ್ಟೋಬರ್‌ನಲ್ಲಿ ದರ ₹7,000/ಕ್ವಿಂ ದಾಟಿತು.' }
                ],
                modelResilienceNote: 'Log transformation stabilizes variance against outliers like ₹9,450/q; adding policy, tariff & weather covariates can sharpen future tail bounds.',
                modelResilienceNoteKn: 'ಲಾಗ್ ರೂಪಾಂತರವು ಅಸಹಜ ಏರಿಳಿತಗಳಿಂದ ಮಾದರಿಯನ್ನು ರಕ್ಷಿಸುತ್ತದೆ; ಮುಂದೆ ನೀತಿ ಮತ್ತು ಹವಾಮಾನ ಮಾಹಿತಿ ಸೇರಿಸಬಹುದು.',
                actionPoints: [
                    { id: 'grading', title: 'Fair Electronic Grading at the Mandi', titleKn: 'ಮಂಡಿಯಲ್ಲಿ ಪಾರದರ್ಶಕ ಎಲೆಕ್ಟ್ರಾನಿಕ್ ಗ್ರೇಡಿಂಗ್', badge: 'Anti-Deduction', badgeKn: 'ಕಡಿತ ನಿಯಂತ್ರಣ', body: 'Enforce electronic moisture grading & transparent e-auctions.', bodyKn: 'ಎಲೆಕ್ಟ್ರಾನಿಕ್ ತೇವಾಂಶ ಪರೀಕ್ಷೆ ಮತ್ತು ಪಾರದರ್ಶಕ ಇ-ಹರಾಜು ಕಡ್ಡಾಯಗೊಳಿಸಿ.' },
                    { id: 'decongestion', title: 'Decongesting Border Mandis (Bidar +43.5%)', titleKn: 'ಬೀದರ್ ಗಡಿ ಮಂಡಿ ದಟ್ಟಣೆ ನಿವಾರಣೆ', badge: 'Bidar Priority', badgeKn: 'ಬೀದರ್ ಆದ್ಯತೆ', body: 'Upgrade gate entry, weighing & timely e-NAM settlements.', bodyKn: 'ಗೇಟ್ ಪ್ರವೇಶ, ತೂಕ ಮತ್ತು ತ್ವರಿತ e-NAM ಪಾವತಿ ಬಲಪಡಿಸಿ.' },
                    { id: 'industry', title: 'Supply Continuity for Hubballi–Dharwad Mills', titleKn: 'ಸ್ಥಳೀಯ ಗಿರಣಿಗಳಿಗೆ ಪೂರೈಕೆ ಸಮತೋಲನ', badge: 'Crush Margin', badgeKn: 'ಉದ್ಯಮ ಸಮತೋಲನ', body: 'Streamline interstate e-NAM sourcing from surplus MP/RJ.', bodyKn: 'ಹೆಚ್ಚುವರಿ ರಾಜ್ಯಗಳಿಂದ ಅಂತರ-ರಾಜ್ಯ e-NAM ಪರವಾನಗಿ ಸುಗಮಗೊಳಿಸಿ.' },
                    { id: 'swings', title: 'Phased Post-Harvest Advisories (+7% to +19% MSP)', titleKn: 'ಕೊಯ್ಲು ನಂತರದ ಮಾರಾಟ ಸಲಹೆಗಳು', badge: 'Above MSP ₹5,708', badgeKn: 'MSP ಗಿಂತ ಹೆಚ್ಚು', body: 'Prices stand above ₹5,708/q MSP; weekly advisories stabilize sales.', bodyKn: 'ದರ MSP ಗಿಂತ ಮೇಲಿರುವುದರಿಂದ ಹಂತಹಂತದ ಮಾರಾಟಕ್ಕೆ ವಾರದ ಸಲಹೆ ನೀಡಿ.' }
                ],
                interventions: [
                    { step: 1, yardTag: 'BIDAR', title: 'Yard & Weighing Management during Peak Inflows', titleKn: 'ಪ್ರಾಂಗಣ ಮತ್ತು ತೂಕ ನಿರ್ವಹಣೆ', body: 'Deploy weighbridges and staggered gate tokens for Bidar surge.', bodyKn: 'ಬೀದರ್ ಆವಕ ದಟ್ಟಣೆಗೆ ತೂಕ ಯಂತ್ರ ಮತ್ತು ಟೋಕನ್ ವ್ಯವಸ್ಥೆ.' },
                    { step: 2, yardTag: 'KALABURAGI', title: 'Transparent Quality & Deduction Guidelines', titleKn: 'ಗುಣಮಟ್ಟ ಮತ್ತು ತೇವಾಂಶ ಕಡಿತ ನಿಯಮಾವಳಿ', body: 'Notify clear moisture deduction slabs in Kalaburagi.', bodyKn: 'ಕಲಬುರಗಿಯಲ್ಲಿ ಏಕರೂಪದ ತೇವಾಂಶ ಕಡಿತ ಮಾರ್ಗಸೂಚಿ ಪ್ರಕಟಣೆ.' },
                    { step: 3, yardTag: 'BAILHONGAL', title: 'Storage Advisories & Staggered Marketing', titleKn: 'ಗೋದಾಮು ಸಂಗ್ರಹಣೆ ಮತ್ತು ಹಂತಹಂತದ ಮಾರಾಟ', body: 'Encourage FPOs/growers in Bailhongal to use APMC godowns.', bodyKn: 'ಬೈಲಹೊಂಗಲ ರೈತರಿಗೆ APMC ಗೋದಾಮು ಬಳಕೆ ಪ್ರೋತ್ಸಾಹ.' },
                    { step: 4, yardTag: 'HUBBALLI • MP/RJ', title: 'Surplus-State Inter-Market Price Intelligence', titleKn: 'ಹೆಚ್ಚುವರಿ ರಾಜ್ಯಗಳ ದರ ಮಾಹಿತಿ ಪ್ರಕಟಣೆ', body: 'Publish MP (+32%) & Rajasthan (+48%) arrivals for crushers.', bodyKn: 'ಮಧ್ಯಪ್ರದೇಶ ಮತ್ತು ರಾಜಸ್ಥಾನ ದರ ಪ್ರವೃತ್ತಿ ಪ್ರಕಟಣೆ.' }
                ],
                riskFramework: {
                    analyticalScope: 'Treat 10th–90th percentile intervals as indicative risk boundaries paired with external monitoring.',
                    analyticalScopeKn: '10–90ನೇ ಶೇಕಡಾವಾರು ವ್ಯಾಪ್ತಿಯನ್ನು ಬಾಹ್ಯ ಅಪಾಯದ ಗಡಿಯಾಗಿ ಪರಿಗಣಿಸಿ.',
                    externalities: [
                        'Trade & Tariff Policy (duty cuts, stock limits)',
                        'Interstate Market Flows (MH, TS, MP spreads)',
                        'Substitute Crops & Poultry/Dairy Feed Demand',
                        'Late-Season Nov–Dec Rainfall & Grain Moisture'
                    ],
                    externalitiesKn: [
                        'ವ್ಯಾಪಾರ ಮತ್ತು ಸುಂಕ ನೀತಿ',
                        'ಅಂತರ-ರಾಜ್ಯ ಮಾರುಕಟ್ಟೆ ಹರಿವು',
                        'ಪರ್ಯಾಯ ಎಣ್ಣೆಕಾಳು ಮತ್ತು ಪಶು ಆಹಾರ ಬೇಡಿಕೆ',
                        'ನವೆಂ-ಡಿಸೆಂ ಅಕಾಲಿಕ ಮಳೆ ಮತ್ತು ತೇವಾಂಶ'
                    ],
                    scenarios: [
                        { severity: 'downside', scenario: 'Policy or tariff easing', scenarioKn: 'ನೀತಿ ಅಥವಾ ಸುಂಕ ಸಡಿಲಿಕೆ', impact: 'Pulls prices toward q10 band or MSP ₹5,708/q.', impactKn: 'ದರ ಕನಿಷ್ಠ ವ್ಯಾಪ್ತಿ ಅಥವಾ MSP ಹತ್ತಿರ ಬರುವ ಸಾಧ್ಯತೆ.', response: 'Advisories to lock favorable rates + MSP standby.', responseKn: 'ಉತ್ತಮ ದರ ಖಚಿತಪಡಿಸಲು ಸಲಹೆ + MSP ಸಿದ್ಧತೆ.' },
                        { severity: 'congestion', scenario: 'Cross-border arrival surge', scenarioKn: 'ನೆರೆ ರಾಜ್ಯಗಳಿಂದ ಹೆಚ್ಚುವರಿ ಒಳಹರಿವು', impact: 'Temporary border yard congestion & softening.', impactKn: 'ಗಡಿ ಮಂಡಿ ದಟ್ಟಣೆ ಮತ್ತು ತಾತ್ಕಾಲಿಕ ದರ ಒತ್ತಡ.', response: 'Extend gates, e-weighing, stagger auction slots.', responseKn: 'ಗೇಟ್ ಅವಧಿ ವಿಸ್ತರಣೆ ಮತ್ತು ಹರಾಜು ವೇಳಾಪಟ್ಟಿ.' },
                        { severity: 'upside', scenario: 'Tight supply / rising feed demand', scenarioKn: 'ಕೊರತೆ ಅಥವಾ ಪಶು ಆಹಾರ ಬೇಡಿಕೆ ಹೆಚ್ಚಳ', impact: 'Prices rally toward q90, squeezing mill margins.', impactKn: 'ದರ ಮೇಲ್ಮುಖ ವ್ಯಾಪ್ತಿಗೆ ಜಿಗಿದು ಗಿರಣಿಗಳ ಮೇಲೆ ಒತ್ತಡ.', response: 'Share interstate intel & enable surplus-hub e-NAM permits.', responseKn: 'ಅಂತರ-ರಾಜ್ಯ ಮಾಹಿತಿ ಮತ್ತು e-NAM ಪರವಾನಗಿ.' },
                        { severity: 'quality', scenario: 'Unseasonal Nov–Dec rain & moisture', scenarioKn: 'ಅಕಾಲಿಕ ಮಳೆ ಮತ್ತು ಹೆಚ್ಚಿದ ತೇವಾಂಶ', impact: 'Wider quality deductions lower farmgate realization.', impactKn: 'ಗುಣಮಟ್ಟ ಕಡಿತದಿಂದ ರೈತರ ಆದಾಯ ಇಳಿಕೆ.', response: 'Gate electronic moisture grading & covered storage.', responseKn: 'ಪ್ರವೇಶ ದ್ವಾರದಲ್ಲೇ ಎಲೆಕ್ಟ್ರಾನಿಕ್ ಪರೀಕ್ಷೆ ಮತ್ತು ಗೋದಾಮು.' }
                    ]
                },
                references: [
                    { num: 1, citation: 'PIB — All India Kharif Area 1,086.31 L Ha (PRID=2307791)', url: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2307791' },
                    { num: 2, citation: 'SOPA / PTI — Kharif 2026 Soybean Output 107.93 LMT (-2.1%)', url: 'https://www.dtnext.in/news/business/soybean-output-may-dip-just-2-pc-mp-rajasthan-gains-to-cushion-maharashtra-losses-farmers-body' },
                    { num: 3, citation: 'CCEA — Kharif 2026–27 MSP Soyabean ₹5,708/q (13 May 2026)', url: 'https://www.narendramodi.in/cabinet-approves-minimum-support-prices-msp-for-kharif-crops-for-marketing-season-2026-27' },
                    { num: 4, citation: 'Petralia et al., Mistral AI — Timestral (arXiv:2610.37585)', url: 'https://arxiv.org/abs/2610.37585' },
                    { num: 5, citation: 'Dept of Agricultural Marketing — Krishi Marata Vahini (2022–2026)', url: 'https://krishimaratavahini.karnataka.gov.in' }
                ]
            };
        }
    };

    global.MockMarketApi = MockMarketApi;
})(window);

