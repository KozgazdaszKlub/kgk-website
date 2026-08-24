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

// Supabase - ugyanaz a publikus (anon) kulcs, mint a script.js-ben és az
// admin.html-ben. Kulcscserénél MIND A HÁROM helyen frissíteni kell.
const SUPABASE_URL = 'https://agdstsliixwysbjedppu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LXqTP-dPmfwWvd0IZTzrMw_tjYERBe9';

// A végleges domain. Ez CSAK vésztartalék: alapesetben mindig az aktuális
// címet írjuk az og:url-be (amit a kérésből olvasunk ki), így a
// kozgazdaszklub.com rákötésekor sem kell hozzányúlni ehhez a fájlhoz.
const SITE_URL = 'https://kozgazdaszklub.com';

// Ez jelenik meg az előnézet tetején, az oldal neveként.
const SITE_NAME = 'Közgazdász Klub';

// Alapértelmezett megosztási kép, ha a hírnek nincs saját borítóképe.
// Üresen hagyva ilyenkor egyszerűen nem kerül kép az előnézetbe.
// Ha szeretnél alapértelmezett képet: tegyél az images/ mappába egy kb.
// 1200x630-as, NEM átlátszó hátterű képet, és írd ide az elérési útját,
// például: 'images/og-default.jpg'
const DEFAULT_OG_IMAGE = '';

// Meddig őrizze a Vercel a kész HTML-t (másodpercben). Ennyi ideig látszhat
// egy admin-oldali szerkesztés után még a régi cím/kép a megosztásokban.
const CDN_CACHE_SECONDS = 600;

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

    // Ilyen hosszú slug biztosan nem létezik - felesleges lekérdezni.
    if (!slug || slug.length > 200) return null;
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

// A meta tag-ek befűzése a <head>-be, a <title> lecserélésével együtt.
function injectMeta(html, article, origin, slug) {
    const pageUrl = `${origin}/hir.html?slug=${encodeURIComponent(slug)}`;
    const metaBlock = buildMetaTags(article, pageUrl, origin);
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

// ============================================================
// SUPABASE LEKÉRDEZÉS
// ============================================================

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
        console.error(`og-hir: Supabase hiba (${res.status}) – slug: ${slug}`);
        return null;
    }

    const rows = await res.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
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

    try {
        const slug = getSlug(req);
        // Slug nélkül (pl. valaki simán a /hir.html-t nyitja meg) nincs mit
        // beszúrni - megy vissza az eredeti HTML, a kliensoldali JS kezeli.
        if (slug) {
            const article = await fetchArticle(slug);
            // Nem létező slug esetén sem hibázunk: a loadArticle() ugyanúgy
            // kiírja majd, hogy a hír nem található.
            if (article) html = injectMeta(html, article, getOrigin(req), slug);
        }
    } catch (err) {
        // Bármilyen hiba esetén az eredeti HTML megy vissza. A látogató
        // ugyanúgy látja a hírt, csak a megosztási előnézet lesz általános.
        console.error('og-hir hiba:', err);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
        'Cache-Control',
        `public, max-age=0, s-maxage=${CDN_CACHE_SECONDS}, stale-while-revalidate=86400`
    );
    res.status(200).send(html);
};
