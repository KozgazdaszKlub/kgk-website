// ============================================================
// DINAMIKUS SITEMAP
// ============================================================
// Miért kell ez?
// A sitemap.xml eddig kézzel karbantartott statikus fájl volt, benne a négy
// állandó oldallal. A hírek (hir.html?slug=...) NEM voltak benne, mert minden
// új hír után kézzel kellett volna bővíteni – ami a gyakorlatban elmarad.
//
// Ez a függvény a négy állandó oldal mellé a Supabase-ből olvassa ki a hírek
// slugjait, és futásidőben állítja össze a sitemapot. Így egy új hír magától
// megjelenik benne, adminisztráció nélkül.
//
// A /sitemap.xml -> /api/sitemap átirányítást a vercel.json "routes" része
// végzi, ugyanúgy, mint a /hir.html -> /api/og-hir esetében. A robots.txt
// változatlanul a https://kozgazdaszklub.com/sitemap.xml címre mutat.
//
// PISZKOZATOK: itt SZÁNDÉKOSAN nincs is_published szűrő. A szűrést az RLS
// végzi: a news táblán a `read_news` policy (TO public) csak az
// `is_published = true` sorokat engedi át, és ez a függvény – akárcsak az
// api/og-hir.js – a publikus (anon) kulccsal kérdez. Egy itteni kliensoldali
// szűrő nem adna hozzá semmit a biztonsághoz, viszont elhasalna (HTTP 400),
// ha az oszlop valamiért hiányozna – és akkor MINDEN hír kimaradna a
// sitemapból. Lásd migrations/news_publish_state.sql.
//
// KARBANTARTÁS MÓD: ez a függvény szándékosan NEM tud róla. A maintenance_mode
// egy kliensoldali, megjelenítési kapcsoló – nem vonja vissza a hírek
// publikálását. Ha karbantartás alatt kiürítenénk a sitemapot, a kereső úgy
// látná, hogy az oldalak megszűntek, és kieshetnének az indexből egy átmeneti
// függöny miatt. A sitemap gépi dokumentum: azt sorolja fel, mi létezik.
// ============================================================

// ============================================================
// BEÁLLÍTÁSOK
// ============================================================

// Supabase – ugyanaz a publikus (anon) kulcs, mint a script.js-ben, az
// admin.html-ben és az api/og-hir.js-ben. Kulcscserénél MIND A NÉGY helyen
// frissíteni kell. A service_role kulcs ide SOHA nem kerülhet.
const SUPABASE_URL = 'https://agdstsliixwysbjedppu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LXqTP-dPmfwWvd0IZTzrMw_tjYERBe9';

// A kanonikus domain. A sitemapban KIZÁRÓLAG ez szerepelhet – ugyanaz a cím,
// amit az oldalak canonical tagjei is hirdetnek. Ezért itt (az og-hir.js
// og:url-jével ellentétben) NEM olvassuk ki a kérés címét: a www.-s vagy a
// vercel.app-os címen kért sitemap is a kanonikus URL-eket sorolja fel.
const SITE_URL = 'https://kozgazdaszklub.com';

// Az állandó oldalak. A <loc> értékeknek egyezniük kell az adott oldal
// <link rel="canonical"> értékével – új publikus oldalnál ide is, oda is fel
// kell venni a sort.
const STATIC_PAGES = [
    { path: '/', changefreq: 'weekly', priority: '1.0' },
    { path: '/hirek.html', changefreq: 'daily', priority: '0.8' },
    { path: '/kapcsolat.html', changefreq: 'monthly', priority: '0.6' },
    { path: '/adatvedelem.html', changefreq: 'yearly', priority: '0.2' },
];

// A hírcikkek értékei. Egy megjelent hír szövege ritkán változik.
const NEWS_CHANGEFREQ = 'monthly';
const NEWS_PRIORITY = '0.6';

// Felső korlát a lekért hírekre. A sitemap szabvány 50 000 URL-t enged
// fájlonként; ez a korlát csak azért van itt, hogy egy váratlanul nagy tábla
// se eredményezzen kezelhetetlen méretű választ.
const MAX_NEWS = 5000;

// Meddig őrizze a Vercel a kész sitemapot (másodpercben). Egy új hír legkésőbb
// ennyi idő múlva jelenik meg benne. A keresők amúgy is naponta-hetente nézik
// meg a sitemapot, viszont így egy robotroham sem futtatja le újra minden
// egyes kérésnél a Supabase lekérdezést.
const CDN_CACHE_SECONDS = 3600;

// Ha a Supabase lekérdezés elszállt, a válasz hiányos (csak a négy állandó
// oldal). Azt NEM akarjuk egy órára befagyasztani a CDN-be: rövid életű
// gyorsítótárral a következő kérés már újra megpróbálja.
const CDN_CACHE_SECONDS_DEGRADED = 60;

// Ha a Supabase ennyi alatt nem válaszol, hiányos sitemapot adunk vissza.
const SUPABASE_TIMEOUT_MS = 4000;

// ============================================================
// SEGÉDFÜGGVÉNYEK
// ============================================================

// XML-escape. Az admin slug-validációja (admin.html, SLUG_PATTERN) ma csak
// a-z, 0-9 és kötőjel karaktereket enged, tehát ezek egyike sem fordulhat elő
// – de a sitemap NE bízzon ebben: ha valaha SQL-ből vagy importból kerülne be
// egy & jelet tartalmazó slug, az escape nélkül ÉRVÉNYTELEN XML-t adna, és a
// kereső az EGÉSZ sitemapot eldobná. Egy hibás slug miatt ne vesszen el a
// többi URL sem.
function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// A <lastmod> a sitemap szabvány szerint W3C Datetime kell legyen; az
// YYYY-MM-DD alak érvényes. A news.date ilyen, de ha valaha teljes időbélyeg
// lenne, az elejét vesszük. Bármi másra inkább KIHAGYJUK a lastmod sort: egy
// hibás dátum érvénytelenné tenné a bejegyzést.
function toLastmod(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value == null ? '' : value).trim());
    if (!match) return null;

    // Létező naptári nap-e? (A 2026-02-31 formailag stimmel, mégis hibás.)
    const year = match[1];
    const month = match[2];
    const day = match[3];
    const date = new Date(year + '-' + month + '-' + day + 'T00:00:00Z');
    if (Number.isNaN(date.getTime())) return null;
    if (date.getUTCFullYear() !== Number(year)) return null;
    if (date.getUTCMonth() + 1 !== Number(month)) return null;
    if (date.getUTCDate() !== Number(day)) return null;

    return year + '-' + month + '-' + day;
}

// Egyetlen <url> blokk összeállítása.
function buildUrlEntry(loc, changefreq, priority, lastmod) {
    const lines = [
        '    <url>',
        '        <loc>' + escapeXml(loc) + '</loc>',
    ];
    if (lastmod) lines.push('        <lastmod>' + lastmod + '</lastmod>');
    lines.push('        <changefreq>' + changefreq + '</changefreq>');
    lines.push('        <priority>' + priority + '</priority>');
    lines.push('    </url>');
    return lines.join('\n');
}

// ============================================================
// SUPABASE LEKÉRDEZÉS
// ============================================================

// Visszatérés: a hírek tömbje, VAGY null, ha bármi hiba történt. A kettő
// megkülönböztetése fontos – az üres tömb azt jelenti, hogy nincs publikált
// hír (ma pont ez a helyzet), a null pedig azt, hogy nem tudjuk. Csak az
// utóbbi rövidíti le a gyorsítótárat.
async function fetchNews() {
    const url = SUPABASE_URL + '/rest/v1/news'
        + '?select=slug,date'
        + '&order=date.desc'
        + '&limit=' + MAX_NEWS;

    try {
        const res = await fetch(url, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            },
            signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
        });

        if (!res.ok) {
            console.error('sitemap: Supabase hiba (' + res.status + ')');
            return null;
        }

        const rows = await res.json();
        if (!Array.isArray(rows)) {
            console.error('sitemap: váratlan válasz a Supabase-től (nem tömb)');
            return null;
        }
        return rows;
    } catch (err) {
        // Hálózati hiba, időtúllépés vagy értelmezhetetlen JSON.
        console.error('sitemap: a hírek lekérése nem sikerült –', err && err.message ? err.message : err);
        return null;
    }
}

// ============================================================
// A SITEMAP ÖSSZEÁLLÍTÁSA
// ============================================================

function buildSitemap(newsRows) {
    const entries = STATIC_PAGES.map(function (page) {
        return buildUrlEntry(SITE_URL + page.path, page.changefreq, page.priority, null);
    });

    // A slug egyedi a táblában (news_slug_key), de a sitemapban egy duplikált
    // URL akkor sem lehet – ez az ellenőrzés fillérekbe kerül.
    const seen = new Set();

    for (const row of newsRows || []) {
        const slug = row && typeof row.slug === 'string' ? row.slug.trim() : '';
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);

        entries.push(buildUrlEntry(
            SITE_URL + '/hir.html?slug=' + slug,
            NEWS_CHANGEFREQ,
            NEWS_PRIORITY,
            toLastmod(row.date)
        ));
    }

    return '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + entries.join('\n') + '\n'
        + '</urlset>\n';
}

// ============================================================
// A KÉRÉS KISZOLGÁLÁSA
// ============================================================

module.exports = async function handler(req, res) {
    let newsRows = null;

    try {
        newsRows = await fetchNews();
    } catch (err) {
        // A fetchNews() maga is elkap mindent, ide elvileg nem jutunk el – de
        // egy sitemap SOHA ne haljon el 500-zal. Egy hiányos sitemap (a négy
        // állandó oldallal) sokkal jobb, mint egy hibás válasz: abból a kereső
        // azt olvasná ki, hogy az oldal elérhetetlen.
        console.error('sitemap: váratlan hiba –', err);
        newsRows = null;
    }

    const degraded = newsRows === null;
    const xml = buildSitemap(newsRows);

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader(
        'Cache-Control',
        'public, max-age=0, s-maxage='
        + (degraded ? CDN_CACHE_SECONDS_DEGRADED : CDN_CACHE_SECONDS)
        + ', stale-while-revalidate=86400'
    );
    res.status(200).send(xml);
};
