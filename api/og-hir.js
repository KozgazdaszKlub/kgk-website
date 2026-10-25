// ============================================================
// MEGOSZTÁSI ELŐNÉZET (Open Graph) A HÍR-OLDALHOZ
// ============================================================
// Miért kell ez?
// A hir.html a tartalmát a böngészőben, JavaScripttel tölti be a Supabase-ből
// (script.js -> loadArticle). A közösségi oldalak linkelőnézet-robotjai
// (facebookexternalhit, WhatsApp, Messenger, LinkedIn, Twitter/X) viszont NEM
// futtatnak JavaScriptet: ők csak a nyers HTML-t látják, amiben nincs se cím,
// se leírás, se kép. Emiatt lett eddig üres/általános a megosztott link
// előnézete.
//
// Ez a függvény elfogja a /hir.html kéréseket, a slug alapján lekéri a hír
// adatait a Supabase-ből, és beszúrja a megfelelő meta tag-eket a <head>-be,
// MIELŐTT a HTML elindul a böngésző/robot felé.
//
// A kliensoldali logika ettől függetlenül ugyanúgy fut tovább - a látogató
// pontosan ugyanazt látja, mint eddig.
//
// A /hir.html -> /api/og-hir átirányítást a vercel.json "routes" része végzi.
// ============================================================

const fs = require('fs');
const path = require('path');

// ============================================================
// BEÁLLÍTÁSOK
// ============================================================

// Supabase - ugyanaz a publikus (anon) kulcs, mint a script.js-ben, az
// admin.html-ben és a többi api/ függvényben. Kulcscserénél MINDEN helyen
// frissíteni kell - a pontos, naprakész lista a CLAUDE.md-ben (Supabase
// szakasz) és az OPERATIONS.md-ben (Rotáció: Supabase publishable kulcs) van,
// vagy: git grep -n "sb_publishable_".
const SUPABASE_URL = 'https://agdstsliixwysbjedppu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LXqTP-dPmfwWvd0IZTzrMw_tjYERBe9';

// A végleges domain. Ez CSAK vésztartalék: alapesetben mindig az aktuális
// címet írjuk az og:url-be (amit a kérésből olvasunk ki), így a
// kozgazdaszklub.com rákötésekor sem kell hozzányúlni ehhez a fájlhoz.
// A canonical link és a JSON-LD viszont SZÁNDÉKOSAN mindig ezt a címet
// használja (lásd buildSeoTags): ugyanez az oldal a www.-s és a vercel.app-os
// címen is elérhető, a keresőnek pedig egyetlen kanonikus címet kell mutatni.
const SITE_URL = 'https://kozgazdaszklub.com';

// Ez jelenik meg az előnézet tetején, az oldal neveként.
const SITE_NAME = 'Közgazdász Klub';

// Alapértelmezett megosztási kép, ha a hírnek nincs saját borítóképe.
// Üresen hagyva ilyenkor egyszerűen nem kerül kép az előnézetbe.
// Ha szeretnél alapértelmezett képet: tegyél az images/ mappába egy kb.
// 1200x630-as, NEM átlátszó hátterű képet, és írd ide az elérési útját,
// például: 'images/og-default.jpg'
const DEFAULT_OG_IMAGE = '';

// A kiadó (a klub) logója a NewsArticle JSON-LD-ben. Négyzetes, sötétkék
// hátterű kép: a fehér, átlátszó hátterű PNG a Google fehér hátterén
// láthatatlan lenne.
const PUBLISHER_LOGO = 'images/kgk-logo-negyzet.png';

// Meddig őrizze a Vercel a kész HTML-t (másodpercben). Ennyi ideig látszhat
// egy admin-oldali szerkesztés után még a régi cím/kép a megosztásokban.
const CDN_CACHE_SECONDS = 600;

// Ha a Supabase nem válaszolt rendesen, a válasz a sima sablon (meta tagek
// nélkül). Azt NEM akarjuk 10 percre befagyasztani a CDN-be: rövid életű
// gyorsítótárral a következő kérés már újra megpróbálja. Itt szándékosan
// nincs stale-while-revalidate sem, hogy egy ilyen válasz később se jöhessen
// elő elavult példányként.
const CDN_CACHE_SECONDS_DEGRADED = 60;

// A nem létező hír 404-es válaszát is csak röviden őrizzük: ha a címet egy
// hír publikálása ELŐTT már lekérte valaki (pl. piszkozatként), a publikálás
// után legfeljebb ennyi ideig kaphatják még a keresők a 404-et. Itt sincs
// stale-while-revalidate, különben a lejárat után még egyszer kimenne.
const CDN_CACHE_SECONDS_NOT_FOUND = 60;

// A nem létező hír oldalára (404) kerülő robots meta tag. Ugyanezt mondja az
// X-Robots-Tag fejléc is; a kettő együtt biztos, hogy a kereső ne vegye fel.
const NOINDEX_META = '<meta name="robots" content="noindex">';

// ============================================================
// A STATIKUS hir.html BEOLVASÁSA
// ============================================================
// A fájl a vercel.json "includeFiles" beállítása miatt kerül bele a függvény
// csomagjába. Több útvonalon is keressük, mert a munkakönyvtár deploy-
// környezetenként eltérhet. Egyszer olvassuk be, utána memóriában marad.

let templateCache = null;

function readTemplate() {
    if (templateCache !== null) return templateCache;

    const candidates = [
        path.join(process.cwd(), 'hir.html'),
        path.join(__dirname, '..', 'hir.html'),
        path.join(__dirname, 'hir.html'),
    ];

    for (const file of candidates) {
        try {
            templateCache = fs.readFileSync(file, 'utf8');
            return templateCache;
        } catch (err) {
            // Nincs ott - megyünk tovább a következő útvonalra.
        }
    }

    // Ha idáig eljutunk, a hir.html nem került be a függvény csomagjába.
    // Kilistázzuk, mi van ott – így a Vercel logból egyből látszik a hiba oka.
    let listing = '';
    try {
        listing = ' | A munkakönyvtár tartalma: ' + fs.readdirSync(process.cwd()).join(', ');
    } catch (err) {
        listing = ' | A munkakönyvtár nem olvasható.';
    }
    throw new Error('A hir.html sablon nem található. Keresett útvonalak: ' + candidates.join(' , ') + listing);
}

// ============================================================
// SEGÉDFÜGGVÉNYEK
// ============================================================

// HTML-escape: enélkül egy idézőjel vagy & jel a hír címében eltörné a
// meta tag-et (és XSS felület is lenne).
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Azok a HTML-entitások, amik a szerkesztőből a szövegbe kerülhetnek.
// Enélkül a leírásban ilyesmi jelenne meg: "megrendezz&uuml;k".
const HTML_ENTITIES = {
    nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
    aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
    ouml: 'ö', uuml: 'ü', odblac: 'ő', udblac: 'ű',
    Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
    Ouml: 'Ö', Uuml: 'Ü', Odblac: 'Ő', Udblac: 'Ű',
    hellip: '…', ndash: '–', mdash: '—', bdquo: '„', ldquo: '“',
    rdquo: '”', lsquo: '‘', rsquo: '’', laquo: '«', raquo: '»',
};

// A számmal megadott entitásokat (&#233; vagy &#xE9;) általánosan kezeljük,
// a nevesítetteket a fenti lista alapján.
function decodeEntities(text) {
    return String(text).replace(/&(#\d+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g, (match, code) => {
        if (code[0] === '#') {
            const num = (code[1] === 'x' || code[1] === 'X')
                ? parseInt(code.slice(2), 16)
                : parseInt(code.slice(1), 10);
            if (!Number.isFinite(num) || num < 1 || num > 0x10FFFF) return match;
            return String.fromCodePoint(num);
        }
        return Object.prototype.hasOwnProperty.call(HTML_ENTITIES, code) ? HTML_ENTITIES[code] : match;
    });
}

// A hír szövege HTML, a leíráshoz viszont sima szöveg kell.
// Ugyanaz a minta, mint a script.js loadNews() függvényében, kiegészítve az
// entitások visszaalakításával és a fölös szóközök/sortörések rendezésével.
function toPlainText(html) {
    return decodeEntities(String(html).replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ')
        .trim();
}

// Leírás: elsősorban a rövid összefoglaló (excerpt), ha nincs, akkor a
// tartalom első 160 karaktere. Szó közepén nem vágunk.
function buildDescription(article) {
    const excerpt = toPlainText(article.excerpt || '');
    const source = excerpt || toPlainText(article.content || '');
    if (source.length <= 160) return source;

    let cut = source.substring(0, 160);
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 100) cut = cut.substring(0, lastSpace);
    return cut.trim() + '…';
}

// A slug kiolvasása a kérésből.
function getSlug(req) {
    let slug = req.query && req.query.slug;
    if (Array.isArray(slug)) slug = slug[0];

    // Átirányítás után biztosabb, ha a nyers URL-ből is megpróbáljuk.
    if (!slug) {
        try {
            slug = new URL(req.url, 'http://localhost').searchParams.get('slug');
        } catch (err) {
            slug = null;
        }
    }

    if (!slug) return null;
    slug = String(slug).trim();

    // Hosszkorlát SZÁNDÉKOSAN nincs: a null itt 404-et jelent, az admin
    // viszont nem korlátozza a slug hosszát – egy hosszú, de létező hír így
    // kieshetne a keresőből. Hogy létezik-e, azt mindig a Supabase dönti el.
    if (!slug) return null;
    return slug;
}

// Az oldal jelenlegi címe (protokoll + domain) a kérés fejlécéből.
// Így a vercel.app-on és a végleges domainen is helyes og:url kerül a HTML-be.
function getOrigin(req) {
    const raw = req.headers['x-forwarded-host'] || req.headers.host || '';
    const host = String(raw).split(',')[0].trim();

    // Csak szabályos domain-nevet fogadunk el (a Host fejléc hamisítható).
    if (!host || !/^[A-Za-z0-9.\-_]+(:\d+)?$/.test(host)) return SITE_URL;

    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    return `${proto === 'http' ? 'http' : 'https'}://${host}`;
}

// ============================================================
// META TAG-EK ÖSSZEÁLLÍTÁSA
// ============================================================

function buildMetaTags(article, pageUrl, origin) {
    const title = escapeHtml(article.title || 'Hír');
    const description = escapeHtml(buildDescription(article));

    // A borítókép abszolút URL kell legyen - a Supabase Storage URL-jei már
    // azok, de ha valaki mégis relatív utat mentett, kiegészítjük.
    let image = String(article.image_url || '').trim();
    if (!image && DEFAULT_OG_IMAGE) image = DEFAULT_OG_IMAGE;
    if (image && !/^https?:\/\//i.test(image)) image = `${origin}/${image.replace(/^\//, '')}`;
    const imageTag = image ? escapeHtml(image) : '';

    const tags = [
        `<meta name="description" content="${description}">`,
        `<meta property="og:title" content="${title}">`,
        `<meta property="og:description" content="${description}">`,
        `<meta property="og:url" content="${escapeHtml(pageUrl)}">`,
        `<meta property="og:type" content="article">`,
        `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">`,
        `<meta property="og:locale" content="hu_HU">`,
    ];

    if (article.date) {
        tags.push(`<meta property="article:published_time" content="${escapeHtml(article.date)}">`);
    }

    if (imageTag) {
        tags.push(`<meta property="og:image" content="${imageTag}">`);
        tags.push(`<meta property="og:image:alt" content="${title}">`);
    }

    // Kép nélkül a nagy képes kártya üresen tátongana, ilyenkor a kicsi kell.
    tags.push(`<meta name="twitter:card" content="${imageTag ? 'summary_large_image' : 'summary'}">`);
    tags.push(`<meta name="twitter:title" content="${title}">`);
    tags.push(`<meta name="twitter:description" content="${description}">`);
    if (imageTag) tags.push(`<meta name="twitter:image" content="${imageTag}">`);

    return tags.map(tag => '    ' + tag).join('\n');
}

// Canonical link és strukturált adat (NewsArticle JSON-LD). A buildMetaTags()
// tagjei UTÁN kerülnek a <head>-be. Szándékosan külön függvény: így a meglévő
// megosztási tagek egyetlen bájtja sem változik.
//
// JSON egy <script> tag belsejébe: a böngésző ennek a tartalmát nem HTML-ként
// olvassa, ezért itt nem az escapeHtml() kell. A < jelet unicode-escape
// alakban írjuk, különben egy "</script>" a hír címében idő előtt lezárná a
// tag-et (és XSS felület lenne). A JSON jelentésén ez nem változtat.
function jsonForScript(data) {
    return JSON.stringify(data).replace(/</g, '\\u003c');
}

function buildSeoTags(article, canonicalUrl) {
    // Ugyanaz a képválasztás, mint a buildMetaTags()-ben, csak a relatív utat
    // itt a kanonikus domainhez egészítjük ki.
    let image = String(article.image_url || '').trim();
    if (!image && DEFAULT_OG_IMAGE) image = DEFAULT_OG_IMAGE;
    if (image && !/^https?:\/\//i.test(image)) image = `${SITE_URL}/${image.replace(/^\//, '')}`;

    const description = buildDescription(article);
    const club = { '@type': 'Organization', name: SITE_NAME, url: `${SITE_URL}/` };

    const data = {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: String(article.title || 'Hír'),
        ...(description ? { description } : {}),
        ...(article.date ? { datePublished: String(article.date) } : {}),
        ...(image ? { image: [image] } : {}),
        url: canonicalUrl,
        mainEntityOfPage: canonicalUrl,
        inLanguage: 'hu',
        author: club,
        publisher: { ...club, logo: { '@type': 'ImageObject', url: `${SITE_URL}/${PUBLISHER_LOGO}` } },
    };

    return [
        `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
        `<script type="application/ld+json">${jsonForScript(data)}</script>`,
    ].map(tag => '    ' + tag).join('\n');
}

// A meta tag-ek befűzése a <head>-be, a <title> lecserélésével együtt.
function injectMeta(html, article, origin, slug) {
    const pageUrl = `${origin}/hir.html?slug=${encodeURIComponent(slug)}`;
    // A canonical a kérés címétől függetlenül mindig a kanonikus domainre mutat.
    const canonicalUrl = `${SITE_URL}/hir.html?slug=${encodeURIComponent(slug)}`;
    const metaBlock = buildMetaTags(article, pageUrl, origin)
        + '\n' + buildSeoTags(article, canonicalUrl);
    const pageTitle = escapeHtml(`${article.title || 'Hír'} | KGK`);

    // Függvényes csere kell: string-cserében a $ jelnek különleges jelentése
    // van, és az simán előfordulhat egy hír címében.
    if (/<title>[\s\S]*?<\/title>/i.test(html)) {
        return html.replace(
            /<title>[\s\S]*?<\/title>/i,
            () => `<title>${pageTitle}</title>\n${metaBlock}`
        );
    }

    // Vésztartalék, ha valamiért nincs <title> a sablonban.
    return html.replace(
        /<head[^>]*>/i,
        (headTag) => `${headTag}\n    <title>${pageTitle}</title>\n${metaBlock}`
    );
}

// A noindex meta tag befűzése a nem létező hír oldalába, a <title> UTÁN –
// ugyanúgy, mint az injectMeta(). A sablonból semmi nem törlődik, a cím sem
// változik: a „nem található" feliratot és címet a loadArticle() írja ki.
function injectNoindex(html) {
    if (/<title>[\s\S]*?<\/title>/i.test(html)) {
        return html.replace(
            /<title>[\s\S]*?<\/title>/i,
            (titleTag) => `${titleTag}\n    ${NOINDEX_META}`
        );
    }

    return html.replace(
        /<head[^>]*>/i,
        (headTag) => `${headTag}\n    ${NOINDEX_META}`
    );
}

// ============================================================
// SUPABASE LEKÉRDEZÉS
// ============================================================
// Három kimenet, és a különbségük a lényeg:
//  - a hír sora: létezik (és publikus – a piszkozatot az RLS elrejti);
//  - null: a Supabase rendben válaszolt, de nincs ilyen hír -> 404;
//  - dobott hiba: NEM tudjuk, létezik-e (HTTP hiba, hálózati hiba,
//    időtúllépés, értelmezhetetlen válasz) -> SOHA nem 404.

async function fetchArticle(slug) {
    const url = `${SUPABASE_URL}/rest/v1/news`
        + `?slug=eq.${encodeURIComponent(slug)}`
        + `&select=title,excerpt,content,image_url,date`
        + `&limit=1`;

    const res = await fetch(url, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        // Ha a Supabase lassú, ne akadjon meg tőle az oldal betöltése.
        signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
        throw new Error(`Supabase hiba (${res.status}) – slug: ${slug}`);
    }

    const rows = await res.json();
    if (!Array.isArray(rows)) {
        throw new Error(`Váratlan Supabase-válasz (nem lista) – slug: ${slug}`);
    }
    return rows.length ? rows[0] : null;
}

// ============================================================
// A KÉRÉS KISZOLGÁLÁSA
// ============================================================

module.exports = async function handler(req, res) {
    let html;

    try {
        html = readTemplate();
    } catch (err) {
        // Ide csak akkor jutunk, ha a hir.html nem került be a függvény
        // csomagjába - ez deploy-hiba, a vercel.json includeFiles beállítását
        // kell megnézni.
        console.error('og-hir:', err.message);
        res.status(500).send('A hír-oldal ideiglenesen nem elérhető.');
        return;
    }

    // A kérés kimenete – ettől függ a státusz és a gyorsítótár:
    //  - 'found':   létező hír -> 200, meta tagekkel (mint eddig);
    //  - 'missing': nincs slug, vagy a Supabase szerint nincs ilyen hír ->
    //               404 + noindex. A látogató ugyanazt az oldalt látja: a
    //               loadArticle() kiírja, hogy a hír nem található.
    //  - 'unknown': nem tudjuk, létezik-e -> 200, sima sablon, rövid cache.
    let outcome = 'unknown';

    try {
        const slug = getSlug(req);
        if (!slug) {
            // Slug nélkül (pl. valaki simán a /hir.html-t nyitja meg) nincs
            // mit megjeleníteni: a loadArticle() is a „nem található" oldalt adja.
            outcome = 'missing';
        } else {
            const article = await fetchArticle(slug);
            if (article) {
                html = injectMeta(html, article, getOrigin(req), slug);
                outcome = 'found';
            } else {
                outcome = 'missing';
            }
        }
    } catch (err) {
        // Bármilyen hiba esetén az eredeti HTML megy vissza, 200-zal. A
        // látogató ugyanúgy látja a hírt, csak a megosztási előnézet lesz
        // általános. SZÁNDÉKOSAN nem 404 (egy átmeneti hiba miatt a kereső
        // valódi híreket dobna ki) és nem is 503: ha egyszer csak ez a
        // függvény romlik el tartósan (pl. kulcscserénél kimarad ez a fájl),
        // a 503 miatt a kereső pár nap alatt az ÖSSZES hírt kidobná, miközben
        // a látogatóknak – a script.js-nek köszönhetően – minden működik.
        console.error('og-hir hiba:', err);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (outcome === 'unknown') {
        res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${CDN_CACHE_SECONDS_DEGRADED}`);
        res.status(200).send(html);
        return;
    }

    if (outcome === 'missing') {
        res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${CDN_CACHE_SECONDS_NOT_FOUND}`);
        res.setHeader('X-Robots-Tag', 'noindex');
        res.status(404).send(injectNoindex(html));
        return;
    }

    res.setHeader(
        'Cache-Control',
        `public, max-age=0, s-maxage=${CDN_CACHE_SECONDS}, stale-while-revalidate=86400`
    );
    res.status(200).send(html);
};
