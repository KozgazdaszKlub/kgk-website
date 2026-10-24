// ============================================================
// ÁLLAPOTJELZŐ VÉGPONT (health check) A MONITOROZÁSHOZ
// ============================================================
// Miért kell ez?
// Egy külső figyelő szolgáltatás (pl. UptimeRobot) percenként-óránként
// lekéri ezt a címet, és e-mailt küld, ha nem 200-at kap. A főoldal maga
// nem alkalmas erre: az statikus HTML, akkor is 200-at ad, ha a Supabase
// áll – a tartalom helyén ilyenkor csak a böngészőben jelenik meg a
// „Nem sikerült betölteni" doboz.
//
// Útvonal: /api/health – a Vercel az api/ mappa fájljait automatikusan
// végponttá alakítja, ehhez NEM kell bejegyzés a vercel.json-be. A biztonsági
// fejléceket (X-Frame-Options stb.) a vercel.json "/(.*)" szabálya erre is
// ráteszi. A sitemapban nincs benne (az api/sitemap.js STATIC_PAGES listája
// csak oldalakat sorol fel), és a robots.txt-hez sem kell nyúlni: a válasz
// X-Robots-Tag: noindex fejlécet kap, egy Disallow sor ezt elrejtené a
// kereső elől (ugyanaz az ok, mint az admin.html-nél).
//
// KÉT MÓD:
//
//   /api/health              – csak a Supabase: egy olcsó, olvasó REST kérés
//                              (ugyanaz, mint a keep-alive-é). Nyilvános,
//                              bárki hívhatja, 5 percenként is.
//
//   /api/health?deep=1       – a Supabase MELLETT a Gmail SMTP bejelentkezést
//                              is kipróbálja (transporter.verify()). CSAK
//                              érvényes tokennel (HEALTH_CHECK_TOKEN), és egy
//                              példány legfeljebb 10 percenként jelentkezik be
//                              ténylegesen (SMTP_CHECK_MIN_INTERVAL_MS).
//
// Miért nem fut az SMTP-ellenőrzés minden kérésre?
// Minden verify() egy valódi Gmail-bejelentkezés az alkalmazásjelszóval.
// 5 percenként ez napi 288 bejelentkezés változó Vercel IP-címekről – a
// Google ezt gyanús tevékenységnek veheti, és ideiglenesen letilthatja a
// fiókot. Akkor éppen a kapcsolat űrlap állna le, amit figyelni akartunk. Ha
// pedig nyilvános lenne, bárki tetszőleges számú bejelentkezést indíthatna a
// nevünkben (sikertelen bejelentkezésekkel a fiók zárolását is). Ezért:
//   - token nélkül egyáltalán nem fut (401);
//   - tokennel is legfeljebb 10 percenként példányonként (a többi kérés az
//     utolsó eredményt kapja) – ez egy kiszivárgott tokent vagy egy elállított
//     figyelőt is megfog, ha nem is teljesen (lásd lent);
//   - a figyelőben ritkán, óránként vagy még ritkábban kell beállítani.
//
// A token a fejlécben (Authorization: Bearer <token>) VAGY az URL-ben
// (?token=<token>) érkezhet. A fejléc a jobb, mert az URL bekerül a Vercel
// naplóba és a figyelő beállításaiba – de az UptimeRobot ingyenes csomagja
// nem tud egyedi fejlécet küldeni, ezért kell az URL-es út is. A token csak
// arra jó, hogy egy (korlátozott gyakoriságú) SMTP-ellenőrzést indítson:
// adatot nem olvas, és semmit nem ír.
//
// A VÁLASZBAN SEMMI BELSŐ RÉSZLET: se hibaüzenet, se stack trace, se kulcs,
// se e-mail cím. Csak az, hogy melyik összetevő hibás ("database" /
// "email"). A részletek a Vercel naplóba mennek (Vercel > Logs, szűrés:
// /api/health), ott is csak a hiba jellege (HTTP kód, hibakód).
//
// A karbantartás módot SZÁNDÉKOSAN nem ismeri: az egy megjelenítési
// kapcsoló, nem hiba. Bekapcsolt karbantartás mellett is 200 jár.
//
// ------------------------------------------------------------
// KÖRNYEZETI VÁLTOZÓK (Vercel > Settings > Environment Variables)
// ------------------------------------------------------------
//   HEALTH_CHECK_TOKEN – véletlen, legalább 32 karakteres szöveg; csak a
//                        ?deep=1 módhoz kell. Ha nincs beállítva (vagy túl
//                        rövid), a ?deep=1 mód mindig 401-et ad.
//   SMTP_USER, SMTP_APP_PASSWORD, CONTACT_EMAIL_TO – ugyanazok, mint az
//                        api/kapcsolat-submit.js-ben. Ha bármelyik hiányzik,
//                        a ?deep=1 mód "email" hibát jelez (a kapcsolat
//                        űrlap ilyenkor amúgy sem tudna küldeni).
//
// Valós értéket SOHA ne írj ebbe a fájlba – csak process.env-ből olvasunk.
// ============================================================

const crypto = require('crypto');
const nodemailer = require('nodemailer');

// ============================================================
// BEÁLLÍTÁSOK
// ============================================================

// Supabase – ugyanaz a publikus (anon) kulcs, mint a script.js-ben, az
// admin.html-ben, a maintenance.js-ben, az api/og-hir.js-ben és az
// api/sitemap.js-ben. Kulcscserénél MIND A HAT helyen frissíteni kell
// (OPERATIONS.md). Ha itt marad a régi kulcs, a health 503-at ad – a figyelő
// tehát szól. A service_role kulcs ide SOHA nem kerülhet.
const SUPABASE_URL = 'https://agdstsliixwysbjedppu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LXqTP-dPmfwWvd0IZTzrMw_tjYERBe9';

// Ha a Supabase ennyi alatt nem válaszol, hibának számít. Rövid, mert egy
// figyelőnek gyors válasz kell, és a Vercel függvény alapból 10 mp után leáll.
const SUPABASE_TIMEOUT_MS = 3000;

// Az SMTP-ellenőrzés teljes felső határa. A nodemailer saját időkorlátjai
// lépésenként számolnak (kapcsolódás, köszönés, tétlen kapcsolat), ezek
// összeadódhatnak – ez a teljes verify()-ra vonatkozik. A Supabase-kérés
// közben párhuzamosan fut, tehát a válasz legkésőbb ~6 mp múlva megy ki.
const SMTP_TIMEOUT_MS = 6000;
const SMTP_TIMEOUTS = {
    connectionTimeout: 4000,
    greetingTimeout:   4000,
    socketTimeout:     5000,
};

// Egy függvénypéldány ennél gyakrabban NEM jelentkezik be a Gmailbe: a
// közben érkező ?deep=1 kérések az utolsó eredményt kapják. A sikertelen
// eredményt is megőrizzük – a sorozatos SIKERTELEN bejelentkezés a
// legveszélyesebb, az zárolhatja a fiókot. FONTOS: ez csak a meleg
// függvénypéldány memóriájában él (hidegindításkor nullázódik, és több
// párhuzamos példány külön számol), tehát puha korlát, nem valódi védelem.
const SMTP_CHECK_MIN_INTERVAL_MS = 10 * 60 * 1000;

// A token minimális hossza. Egy rövid, kitalálható token nem véd semmit –
// ilyenkor úgy viselkedünk, mintha nem lenne beállítva.
const MIN_TOKEN_LENGTH = 32;

// ============================================================
// SEGÉDFÜGGVÉNYEK
// ============================================================

// A válasz kiírása. Minden válasz – a hibák is – ugyanazokat a fejléceket
// kapja: a health állapota pillanatnyi, egy gyorsítótárazott „ok" pont azt
// takarná el, amit figyelünk.
function send(res, status, body, extraHeaders) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    if (extraHeaders) {
        for (const name of Object.keys(extraHeaders)) {
            res.setHeader(name, extraHeaders[name]);
        }
    }
    // HEAD kérésnél a Node maga hagyja el a törzset.
    res.end(JSON.stringify(body));
}

// A query paraméterek a nyers URL-ből. Ismételt paraméternél (?deep=1&deep=0)
// az ELSŐ számít.
function getParams(req) {
    try {
        return new URL(req.url || '/', 'http://localhost').searchParams;
    } catch (err) {
        return new URLSearchParams();
    }
}

// A kérésben kapott token: előbb a fejléc, utána az URL.
function getRequestToken(req, params) {
    const auth = req.headers && req.headers.authorization;
    if (typeof auth === 'string') {
        const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
        if (match) return match[1].trim();
    }
    const fromQuery = params.get('token');
    return fromQuery ? fromQuery.trim() : '';
}

// Konstans idejű összehasonlítás: a válaszidőből ne lehessen karakterenként
// kitalálni a tokent. A két hash mindig 32 bájt, így a hossz sem szivárog.
function tokensMatch(given, expected) {
    const a = crypto.createHash('sha256').update(String(given)).digest();
    const b = crypto.createHash('sha256').update(String(expected)).digest();
    return crypto.timingSafeEqual(a, b);
}

// ============================================================
// SUPABASE ELLENŐRZÉS
// ============================================================

// Visszatérés: true, ha a Supabase rendben válaszolt (2xx + JSON tömb). Az
// üres tömb is rendben van – ma pont ez a helyzet, nincs publikált hír.
// Hibát nem dob.
async function checkDatabase() {
    const url = SUPABASE_URL + '/rest/v1/news?select=id&limit=1';

    try {
        const res = await fetch(url, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            },
            cache: 'no-store',
            signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
        });

        if (!res.ok) {
            console.error('health: Supabase hiba (HTTP ' + res.status + ')');
            return false;
        }

        const rows = await res.json();
        if (!Array.isArray(rows)) {
            console.error('health: váratlan válasz a Supabase-től (nem tömb)');
            return false;
        }
        return true;
    } catch (err) {
        // Időtúllépés, hálózati hiba vagy értelmezhetetlen JSON. Csak a hiba
        // nevét naplózzuk (pl. TimeoutError, TypeError, SyntaxError).
        console.error('health: a Supabase nem érhető el (' + (err && err.name ? err.name : 'ismeretlen hiba') + ')');
        return false;
    }
}

// ============================================================
// SMTP ELLENŐRZÉS
// ============================================================

let smtpLastResult = null;  // { at: időbélyeg, ok: boolean }
let smtpInFlight = null;    // a folyamatban lévő ellenőrzés ígérete

// A kapcsolat űrlaphoz szükséges változók közül a hiányzók NEVE.
function missingSmtpEnv() {
    return ['SMTP_USER', 'SMTP_APP_PASSWORD', 'CONTACT_EMAIL_TO']
        .filter(name => !process.env[name]);
}

// Egy valódi bejelentkezés a Gmail SMTP-be. Ugyanaz a host / port / titkosítás,
// mint az api/kapcsolat-submit.js-ben – ha ott változik, itt is kell.
async function verifySmtp() {
    let transporter = null;
    let timer = null;
    try {
        transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false, // 587-en STARTTLS-sel titkosítunk, nem induláskor
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_APP_PASSWORD,
            },
            ...SMTP_TIMEOUTS,
        });

        await Promise.race([
            transporter.verify(),
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    const err = new Error('SMTP időtúllépés');
                    err.code = 'HEALTH_TIMEOUT';
                    reject(err);
                }, SMTP_TIMEOUT_MS);
            }),
        ]);
        return true;
    } catch (err) {
        // A nyers hibaüzenetet SZÁNDÉKOSAN nem naplózzuk: az SMTP-szerver
        // szövege fiókadatokat tartalmazhat. A hibakód elég a diagnózishoz
        // (pl. EAUTH + 535 = rossz alkalmazásjelszó, ETIMEDOUT = nem érhető el).
        const parts = [
            err && err.code ? 'kód: ' + err.code : null,
            err && err.responseCode ? 'SMTP: ' + err.responseCode : null,
            err && err.command ? 'parancs: ' + err.command : null,
        ].filter(Boolean);
        console.error('health: SMTP-ellenőrzés sikertelen (' + (parts.join(', ') || 'ismeretlen hiba') + ')');
        return false;
    } finally {
        clearTimeout(timer);
        try { if (transporter) transporter.close(); } catch (err) { /* nincs teendő */ }
    }
}

// Visszatérés: true, ha az SMTP rendben van. Példányonként legfeljebb
// SMTP_CHECK_MIN_INTERVAL_MS-onként egy valódi bejelentkezés; az egyszerre
// érkező kérések ugyanarra az ellenőrzésre várnak.
async function checkEmail() {
    const missing = missingSmtpEnv();
    if (missing.length) {
        console.error('health: hiányzó környezeti változó(k): ' + missing.join(', '));
        return false;
    }

    if (smtpInFlight) return smtpInFlight;
    if (smtpLastResult && Date.now() - smtpLastResult.at < SMTP_CHECK_MIN_INTERVAL_MS) {
        return smtpLastResult.ok;
    }

    smtpInFlight = verifySmtp()
        .then(ok => {
            smtpLastResult = { at: Date.now(), ok };
            return ok;
        })
        .finally(() => {
            smtpInFlight = null;
        });
    return smtpInFlight;
}

// ============================================================
// A KÉRÉS KISZOLGÁLÁSA
// ============================================================

module.exports = async function handler(req, res) {
    // --- 1. Csak GET és HEAD (a figyelők egy része HEAD-del kérdez) ---
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        send(res, 405, { status: 'method_not_allowed' }, { 'Allow': 'GET, HEAD' });
        return;
    }

    const params = getParams(req);
    const deep = params.get('deep') === '1';

    // --- 2. A ?deep=1 mód csak érvényes tokennel ---
    // Token nélkül, rossz tokennel és be nem állított HEALTH_CHECK_TOKEN
    // mellett is ugyanaz a 401 megy ki – kívülről ne látsszon, melyik eset
    // áll fenn. Ilyenkor semmilyen ellenőrzés nem indul.
    if (deep) {
        const expected = process.env.HEALTH_CHECK_TOKEN || '';
        const given = getRequestToken(req, params);

        if (expected.length < MIN_TOKEN_LENGTH) {
            console.error('health: a HEALTH_CHECK_TOKEN nincs beállítva vagy rövidebb '
                + MIN_TOKEN_LENGTH + ' karakternél – a ?deep=1 mód ki van kapcsolva');
            send(res, 401, { status: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
            return;
        }
        if (!given || !tokensMatch(given, expected)) {
            console.warn('health: ?deep=1 kérés hiányzó vagy hibás tokennel');
            send(res, 401, { status: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
            return;
        }
    }

    // --- 3. Ellenőrzések (párhuzamosan) ---
    const [databaseOk, emailOk] = await Promise.all([
        checkDatabase(),
        deep ? checkEmail() : Promise.resolve(true),
    ]);

    const failed = [];
    if (!databaseOk) failed.push('database');
    if (!emailOk) failed.push('email');

    // --- 4. Válasz ---
    if (failed.length) {
        send(res, 503, { status: 'error', failed });
        return;
    }
    send(res, 200, { status: 'ok' });
};
