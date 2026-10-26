// ============================================================
// CSP-JELENTÉSEK GYŰJTŐJE (Content-Security-Policy-Report-Only)
// ============================================================
// Miért kell ez?
// A vercel.json minden válaszra Content-Security-Policy-Report-Only fejlécet
// tesz. Ez a böngészőben SEMMIT nem tilt le, csak szól, ha az oldal olyasmit
// tölt be vagy futtat, amit a policy nem enged. A szólás a látogató konzoljába
// megy (azt senki nem látja), és – a policy "report-uri" része miatt – ide,
// egy POST kéréssel. Ez a függvény jelentésenként egyetlen tömör sort ír a
// Vercel naplóba (Vercel > Logs, szűrés: /api/csp-report). Adatbázisba nem ír,
// e-mailt nem küld.
//
// Mire jó? Ha a napló hetekig üres (a böngészőbővítmények zaját leszámítva),
// a policy később élesíthető (Content-Security-Policy fejléc, ami már tilt is).
// Ha nem üres, a sorokból látszik, melyik oldal, melyik irányelv, és mi sértette.
//
// Útvonal: /api/csp-report – a Vercel az api/ mappa fájljait automatikusan
// végponttá alakítja, ehhez NEM kell bejegyzés a vercel.json "routes"
// tömbjébe (a policy "report-uri /api/csp-report" része hivatkozik rá).
//
// KÉT FORMÁTUMOT FOGAD:
//   - report-uri (minden mai böngésző): Content-Type: application/csp-report,
//     törzs: {"csp-report": {"document-uri": …, "blocked-uri": …, …}}
//   - Reporting API (report-to, csak Chromium): application/reports+json,
//     törzs: [{"type": "csp-violation", "body": {"documentURL": …, …}}, …]
// A policy ma csak report-uri-t használ; a második azért van itt, hogy egy
// későbbi átállás csak a fejléc cseréje legyen.
//
// A VÉGPONT NYILVÁNOS – bárki küldhet ide bármit, ezért:
//   - csak POST; a törzs legfeljebb 16 KB, kérésenként legfeljebb 20 jelentés;
//   - ütemkorlát: IP-nként percenként 30, példányonként percenként 300 jelentés.
//     Ugyanaz a puha korlát, mint a kapcsolat űrlapé: csak a meleg
//     függvénypéldány memóriájában él (hidegindításkor nullázódik, a párhuzamos
//     példányok külön számolnak) – a naplót védi az elárasztástól, a függvény
//     meghívását nem akadályozza meg;
//   - a naplóba csak kiválasztott, rövidített mezők kerülnek, a címekből a
//     query string és a fragment NÉLKÜL (pl. a karbantartás-előnézet értéke
//     soha ne kerüljön a naplóba), egy sorban, JSON-ként (sortöréssel nem
//     lehet hamis naplósort csempészni);
//   - a böngészőbővítményekből jövő jelentéseket eldobja (chrome-extension:
//     stb.) – azok nem a mi oldalunkról szólnak;
//   - IP-címet és User-Agentet NEM naplóz;
//   - a válasz mindig üres törzsű (204 / 400 / 405 / 413 / 429).
// ============================================================

// ============================================================
// BEÁLLÍTÁSOK
// ============================================================

// Egy jelentés ~1 KB; a Reporting API több jelentést is egybecsomagolhat.
const MAX_BODY_BYTES = 16 * 1024;
const MAX_REPORTS_PER_REQUEST = 20;

// A naplóba kerülő mezők maximális hossza (karakter).
const MAX_FIELD_LENGTH = 200;
const MAX_SAMPLE_LENGTH = 80;

// Ütemkorlát (lásd a fejkommentet: puha, példányonkénti).
const RATE_WINDOW_MS = 60 * 1000;
const MAX_REPORTS_PER_IP = 30;
const MAX_REPORTS_PER_INSTANCE = 300;
const reportsByIp = new Map(); // IP -> időbélyegek tömbje
let instanceWindow = { start: 0, count: 0, warned: false };

// Ezekből a sémákból jövő jelentés egy böngészőbővítményé, nem az oldalé.
const EXTENSION_SCHEMES = ['chrome-extension:', 'moz-extension:', 'safari-extension:',
    'safari-web-extension:', 'ms-browser-extension:'];

// ============================================================
// SEGÉDFÜGGVÉNYEK
// ============================================================

// Üres törzsű válasz. A jelentést küldő böngésző a választ nem olvassa.
function send(res, status, extraHeaders) {
    res.statusCode = status;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    if (extraHeaders) {
        for (const name of Object.keys(extraHeaders)) {
            res.setHeader(name, extraHeaders[name]);
        }
    }
    res.end();
}

// A beküldő IP-je – a Vercel az x-forwarded-for fejlécbe teszi. CSAK az
// ütemkorláthoz kell, a naplóba nem kerül.
function clientIp(req) {
    const raw = req.headers['x-forwarded-for'] || '';
    return String(raw).split(',')[0].trim() || 'ismeretlen';
}

// A nyers törzs beolvasása legfeljebb MAX_BODY_BYTES méretig (null, ha
// nagyobb). FONTOS: a 'data' / 'end' eseményekre iratkozunk fel, nem
// for await-re. A Vercel Node-futtatókörnyezete (@vercel/node 7.0.0
// addHelpers) a függvény előtt már beolvassa a törzset, és csak a
// req.on('data' / 'end') + req.read() hívásokat irányítja át egy
// visszajátszott másolatra – a for await az eredeti, már kiürült streamet
// olvasná.
function readStream(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let done = false;
        req.on('data', (chunk) => {
            if (done) return;
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                done = true;
                resolve(null);
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (done) return;
            done = true;
            resolve(Buffer.concat(chunks));
        });
        req.on('error', (err) => {
            if (done) return;
            done = true;
            reject(err);
        });
    });
}

// A törzs JSON-ként. Visszatérés: { data } vagy { status } (413 / 400).
// A Vercel az application/json törzset maga feldolgozza (req.body objektum),
// a böngészők application/csp-report / application/reports+json típusát
// viszont nem – akkor a req.body undefined, és a streamből olvasunk.
async function readPayload(req) {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { status: 413 };

    let parsed;
    try {
        parsed = req.body; // a Vercel érvénytelen JSON-nál itt dob
    } catch (err) {
        return { status: 400 };
    }

    let raw;
    if (parsed && typeof parsed === 'object' && !Buffer.isBuffer(parsed)) {
        if (Buffer.byteLength(JSON.stringify(parsed)) > MAX_BODY_BYTES) return { status: 413 };
        return { data: parsed };
    } else if (typeof parsed === 'string' || Buffer.isBuffer(parsed)) {
        raw = Buffer.from(parsed);
    } else {
        raw = await readStream(req);
    }

    if (raw === null || raw.length > MAX_BODY_BYTES) return { status: 413 };
    try {
        return { data: JSON.parse(raw.toString('utf8')) };
    } catch (err) {
        return { status: 400 };
    }
}

// Egy jelentés egységes alakra hozva (a két formátum más kulcsneveket használ).
function fromReportUri(r) {
    return {
        directive: r['effective-directive'] || r['violated-directive'],
        blocked: r['blocked-uri'],
        page: r['document-uri'],
        source: r['source-file'],
        line: r['line-number'],
        column: r['column-number'],
        sample: r['script-sample'],
        disposition: r.disposition,
    };
}

function fromReportingApi(item) {
    const b = item.body;
    return {
        directive: b.effectiveDirective,
        blocked: b.blockedURL,
        page: b.documentURL || item.url,
        source: b.sourceFile,
        line: b.lineNumber,
        column: b.columnNumber,
        sample: b.sample,
        disposition: b.disposition,
    };
}

function extractReports(data) {
    if (data && typeof data === 'object' && !Array.isArray(data)
        && data['csp-report'] && typeof data['csp-report'] === 'object') {
        return [fromReportUri(data['csp-report'])];
    }
    if (Array.isArray(data)) {
        return data
            .filter(item => item && item.type === 'csp-violation' && item.body && typeof item.body === 'object')
            .slice(0, MAX_REPORTS_PER_REQUEST)
            .map(fromReportingApi);
    }
    return [];
}

// Egy cím a naplóhoz: http(s)-nél origin + útvonal (query és fragment
// nélkül), más sémánál csak a séma (data:, blob:, chrome-extension:), a CSP
// kulcsszavainál (inline, eval…) maga a szó.
function cleanUrl(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return '';
    if (/^[a-z][a-z-]{0,30}$/i.test(text)) return text;
    try {
        const url = new URL(text);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            return (url.origin + url.pathname).slice(0, MAX_FIELD_LENGTH);
        }
        return url.protocol;
    } catch (err) {
        return text.split(/[?#]/)[0].slice(0, MAX_FIELD_LENGTH);
    }
}

function cleanText(value, max) {
    return typeof value === 'string' ? value.slice(0, max) : '';
}

function cleanNumber(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : 0;
}

function isFromExtension(report) {
    return [report.blocked, report.source, report.page].some(value =>
        typeof value === 'string' && EXTENSION_SCHEMES.some(scheme => value.trim().toLowerCase().startsWith(scheme)));
}

// A naplóba kerülő sor – csak a nem üres mezők.
function logLine(report) {
    const source = cleanUrl(report.source);
    const line = cleanNumber(report.line);
    const entry = {
        directive: cleanText(report.directive, 40).replace(/[^a-z-]/gi, ''),
        blocked: cleanUrl(report.blocked),
        page: cleanUrl(report.page),
        source: source && line ? `${source}:${line}:${cleanNumber(report.column)}` : source,
        sample: cleanText(report.sample, MAX_SAMPLE_LENGTH),
        disposition: cleanText(report.disposition, 10).replace(/[^a-z]/gi, ''),
    };
    for (const key of Object.keys(entry)) {
        if (!entry[key]) delete entry[key];
    }
    return 'csp-report: ' + JSON.stringify(entry);
}

// Hány jelentés fér még bele az ütemkorlátba ebből a kérésből.
function takeQuota(ip, wanted, now) {
    if (now - instanceWindow.start >= RATE_WINDOW_MS) {
        instanceWindow = { start: now, count: 0, warned: false };
    }

    // Takarítás: a Map ne nőjön a végtelenségig egy hosszan élő példányon.
    if (reportsByIp.size > 1000) reportsByIp.clear();

    const recent = (reportsByIp.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
    const allowed = Math.max(0, Math.min(
        wanted,
        MAX_REPORTS_PER_IP - recent.length,
        MAX_REPORTS_PER_INSTANCE - instanceWindow.count,
    ));
    for (let i = 0; i < allowed; i++) recent.push(now);
    reportsByIp.set(ip, recent);
    instanceWindow.count += allowed;

    if (allowed < wanted && !instanceWindow.warned) {
        // Ablakonként egyszer – az eldobott jelentések ne töltsék tele a naplót.
        instanceWindow.warned = true;
        console.warn('csp-report: ütemkorlát – ebben a percben a további jelentések egy része eldobva');
    }
    return allowed;
}

// ============================================================
// A KÉRÉS KISZOLGÁLÁSA
// ============================================================

module.exports = async function handler(req, res) {
    // --- 1. Csak POST (a böngészők így küldik a jelentést) ---
    if (req.method !== 'POST') {
        send(res, 405, { 'Allow': 'POST' });
        return;
    }

    // --- 2. A törzs beolvasása, méretkorláttal ---
    let payload;
    try {
        payload = await readPayload(req);
    } catch (err) {
        payload = { status: 400 };
    }
    if (payload.status) {
        send(res, payload.status);
        return;
    }

    // --- 3. A jelentések kiolvasása (bővítmények zaja nélkül) ---
    const reports = extractReports(payload.data);
    if (!reports.length) {
        send(res, 400);
        return;
    }
    const relevant = reports.filter(report => !isFromExtension(report));
    if (!relevant.length) {
        send(res, 204);
        return;
    }

    // --- 4. Ütemkorlát ---
    const allowed = takeQuota(clientIp(req), relevant.length, Date.now());
    if (!allowed) {
        send(res, 429, { 'Retry-After': '60' });
        return;
    }

    // --- 5. Naplózás – jelentésenként egy sor ---
    for (const report of relevant.slice(0, allowed)) {
        console.warn(logLine(report));
    }
    send(res, 204);
};
