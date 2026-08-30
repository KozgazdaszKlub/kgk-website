// ============================================================
// KARBANTARTÁS MÓD (maintenance mode)
// ============================================================
// MIT CSINÁL
//   Ha a `feature_flags` táblában a `maintenance_mode` kapcsoló BE van
//   kapcsolva, akkor a publikus oldalak helyett egy egyszerű „Hamarosan
//   érkezik" képernyő fogadja a látogatót. Kikapcsolt állapotban (ez az
//   alapértelmezés) az oldal pontosan úgy működik, mint eddig.
//
// MIÉRT KÜLÖN FÁJL, ÉS MIÉRT A <head>-BEN
//   Ez a réteg EGGYEL FELJEBB dolgozik, mint a script.js-beli funkció-
//   kapcsolók: nem egy szekciót rejt el, hanem az EGÉSZ oldalt cseréli le.
//   Ezért nem várhat meg semmit – a legelső dolognak kell lennie, ami lefut.
//   A <head>-ben álló, NEM defer-elt <script src="maintenance.js"> a HTML
//   értelmezése közben azonnal végrehajtódik, tehát:
//     * a kapcsoló lekérése a lehető leghamarabb elindul (a style.css
//       letöltésével PÁRHUZAMOSAN – lásd lentebb, „Villanás ellen"),
//     * a DOMContentLoaded figyelőnk garantáltan ELŐBB regisztrálódik, mint
//       a defer-rel betöltött script.js-é.
//
//   Az admin.html SZÁNDÉKOSAN nem tölti be ezt a fájlt. Karbantartás mód
//   alatt is be kell tudni lépni, hogy a kapcsolót ki lehessen kapcsolni.
//
// VILLANÁS ELLEN
//   A kapcsoló állapotát csak hálózatról tudjuk meg, tehát van egy rövid
//   „még nem tudjuk" szakasz. Erre az időre a <html> elem megkapja a
//   `kgk-karbantartas-ellenorzes` osztályt, ami elrejti a <body>-t – ugyanaz
//   az elv, mint a script.js `flag-pending` osztályánál, csak az EGÉSZ
//   oldalra. Ez a gyakorlatban nem lassítja az oldalt: a style.css a
//   <head>-ben van, tehát renderelés-blokkoló – a böngésző addig ÚGYSEM fest
//   ki semmit, amíg az meg nem érkezik (mért adat lassú hálózaton: style.css
//   4258 ms, első festés 4296 ms). A kapcsoló lekérése ezzel párhuzamosan
//   fut, és jóval kisebb válasz.
//
// „HIBA ESETÉN MINDEN LÁTSZIK"
//   Ugyanaz az alapelv, mint a script.js funkció-kapcsolóinál, csak itt még
//   fontosabb: ha a tábla nem létezik, a sor hiányzik, a hálózat elszáll vagy
//   a kérés időtúllépésbe fut, akkor a VALÓDI OLDAL jelenik meg. Karbantartás
//   módba KIZÁRÓLAG explicit `enabled === true` válasz visz. Egy adatbázis-
//   hiba soha ne tegye elérhetetlenné az egész weboldalt.
//
// AMIT EZ NEM NYÚJT — FONTOS
//   Ez NEM jelszavas védelem. A tartalom továbbra is ott van a hálózaton, és
//   aki ismeri (vagy kitalálja) a bypass-linket, az látja az oldalt. A célja
//   annyi, hogy a véletlen látogató ne egy félkész oldalt lásson.
// ============================================================

(function () {
    'use strict';

    // Ugyanaz a publikus (anon) kulcs, mint a script.js-ben, az admin.html-ben
    // és az api/og-hir.js-ben. Kulcscserénél MIND A NÉGY helyen frissíteni kell.
    const SUPABASE_URL = 'https://agdstsliixwysbjedppu.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_LXqTP-dPmfwWvd0IZTzrMw_tjYERBe9';

    // A kapcsoló gépi neve a feature_flags táblában.
    const FLAG_KEY = 'maintenance_mode';

    // ── BYPASS (a webmester átjárója) ────────────────────────────────
    // Nem biztonsági elem, csak egy nem publikus „kulcs", hogy véletlenül
    // senki ne bukkanjon rá. Ha valaha kiszivárogna, elég itt átírni az
    // értéket – SQL-hez és adatbázishoz nem kell hozzányúlni.
    const BYPASS_PARAM = 'preview';
    const BYPASS_VALUE = 'kgk-belso-2f8a4d61';

    // A jelzőt eltesszük a böngészőbe, így elég EGYSZER megnyitni a linket:
    // utána minden aloldalon, minden újratöltésnél a valódi oldal látszik.
    const BYPASS_STORAGE_KEY = 'kgk_maintenance_bypass';

    // A bypass kikapcsolása: ?preview=ki (vagy ?preview=off). Erre azért van
    // szükség, hogy a webmester meg tudja nézni, mit LÁT a látogató – enélkül
    // a saját böngészőjében soha többé nem jelenne meg a karbantartás oldal.
    const BYPASS_OFF_VALUES = ['ki', 'off'];

    // Időkorlát. Rövidebb, mint a script.js FEATURE_FLAG_TIMEOUT_MS-e (4000),
    // mert amíg ez fut, az EGÉSZ oldal takarva van, nem csak egy szekció.
    const TIMEOUT_MS = 3500;

    // Osztályok a <html> elemen. Kettő van, mert két külön állapot:
    //   ELLENORZES → „még nem tudjuk" – a body rejtve, semmi nem látszik
    //   AKTIV      → „karbantartás" – a body tartalma rejtve, a takaró látszik
    const ELLENORZES_CLASS = 'kgk-karbantartas-ellenorzes';
    const AKTIV_CLASS = 'kgk-karbantartas-aktiv';
    const TAKARO_ID = 'kgk-karbantartas';

    // Gyökérhez képesti út: a 404.html bármilyen mély URL-en megjelenhet,
    // relatív úttal ott nem találná meg a logót.
    const LOGO_URL = '/images/Copy%20of%20kgk_feher.png';

    // Ha a böngésző nem tud fetch-elni, meg se próbáljuk: maradjon a normál
    // oldal. (Lásd „hiba esetén minden látszik".)
    if (typeof window.fetch !== 'function') return;

    // ────────────────────────────────────────────────────────────────
    // BYPASS ELDÖNTÉSE — hálózat nélkül, azonnal
    // ────────────────────────────────────────────────────────────────
    // A localStorage privát módban vagy letiltott sütiknél kivételt dobhat,
    // ezért minden hozzáférés try/catch-ben van. Ha nem működik, a bypass
    // egyszerűen nem marad meg – az URL paraméterrel akkor is használható.
    function bypassOlvas() {
        try {
            return localStorage.getItem(BYPASS_STORAGE_KEY) === 'true';
        } catch (err) {
            return false;
        }
    }

    function bypassIr(ertek) {
        try {
            if (ertek) localStorage.setItem(BYPASS_STORAGE_KEY, 'true');
            else localStorage.removeItem(BYPASS_STORAGE_KEY);
        } catch (err) {
            // Nem tudjuk elmenteni – ettől még ezen az oldalbetöltésen működik.
        }
    }

    function bypassAktiv() {
        let param = null;
        try {
            param = new URLSearchParams(window.location.search).get(BYPASS_PARAM);
        } catch (err) {
            param = null;
        }

        if (param === BYPASS_VALUE) {
            bypassIr(true);
            return true;
        }

        if (param !== null && BYPASS_OFF_VALUES.indexOf(param) !== -1) {
            bypassIr(false);
            return false;
        }

        // Se jó, se kikapcsoló paraméter – marad, ami a böngészőben el van téve.
        return bypassOlvas();
    }

    // A bypass MINDENT visz: ilyenkor egy sort sem futtatunk tovább, se
    // takarást nem teszünk fel, se lekérdezést nem indítunk. Így a webmester
    // pontosan azt az oldalt kapja, mint karbantartás mód nélkül.
    if (bypassAktiv()) {
        window.KGK_MAINTENANCE_READY = Promise.resolve(false);
        return;
    }

    // ────────────────────────────────────────────────────────────────
    // TAKARÁS
    // ────────────────────────────────────────────────────────────────
    // A stílus JS-ből kerül be, nem a style.css-be: így akkor is helyes a
    // karbantartás képernyő, ha a style.css lassan jön vagy el sem érhető.
    //
    // A takaró NEM törli a body tartalmát, csak elrejti (`display: none`).
    // Ez szándékos: a hir.html és a kapcsolat.html saját beágyazott JS-e
    // hivatkozik a saját elemeire – ha kitörölnénk őket a DOM-ból, azok
    // null-referencián elszállnának (pl. a hir.html keydown figyelője).
    function stilustBeszur() {
        const style = document.createElement('style');
        style.textContent = [
            // Amíg nem tudjuk a kapcsoló állapotát: semmi nem látszik.
            // A háttér a publikus oldal háttérszíne, hogy kikapcsolt
            // karbantartásnál ne legyen fehér villanás a megjelenés előtt.
            'html.' + ELLENORZES_CLASS + ' { background: #F1F1E6; }',
            'html.' + ELLENORZES_CLASS + ' body { visibility: hidden !important; }',

            // Karbantartás módban a body eredeti tartalma eltűnik, a takaró
            // viszont látszik. A :not() kizárás miatt a takaró magára a
            // szabályra nem illeszkedik.
            'html.' + AKTIV_CLASS + ', html.' + AKTIV_CLASS + ' body {',
            '  background: #08122b !important;',
            '  overflow: hidden !important;',
            '  height: 100%;',
            '}',
            'html.' + AKTIV_CLASS + ' body > *:not(#' + TAKARO_ID + ') { display: none !important; }',

            '#' + TAKARO_ID + ' {',
            '  position: fixed;',
            '  inset: 0;',
            '  z-index: 2147483647;',
            '  display: flex;',
            '  flex-direction: column;',
            '  align-items: center;',
            '  justify-content: center;',
            '  text-align: center;',
            '  padding: 32px 24px;',
            '  background: #08122b;',
            '  color: #F1F1E6;',
            '  font-family: Inter, "Segoe UI", system-ui, sans-serif;',
            '  -webkit-font-smoothing: antialiased;',
            '}',

            // A logó szélessége a képernyőhöz igazodik: kis telefonon sem
            // lóg ki, nagy kijelzőn sem nő aránytalanul naggyá.
            '#' + TAKARO_ID + ' .kgk-karb-logo {',
            '  width: min(180px, 45vw);',
            '  height: auto;',
            '  margin-bottom: 32px;',
            '}',

            // A `text-transform` és a `letter-spacing` SZÁNDÉKOSAN itt is ki
            // van írva, pedig a style.css `h1, h2, h3` szabálya amúgy is
            // nagybetűssé tenné. Enélkül a képernyő máshogy nézne ki, ha a
            // style.css lassan jön vagy el sem érhető – pont abban a
            // helyzetben, amikor a legfontosabb, hogy rendben legyen.
            '#' + TAKARO_ID + ' h1 {',
            '  font-family: Montserrat, "Segoe UI", system-ui, sans-serif;',
            '  font-weight: 700;',
            '  font-size: clamp(1.6rem, 6vw, 2.6rem);',
            '  line-height: 1.25;',
            '  letter-spacing: 1px;',
            '  text-transform: uppercase;',
            '  color: #F1C039;',
            '  margin: 0;',
            '  padding: 0;',
            '}',

            // Vékony arany elválasztó a cím és a magyarázat között.
            '#' + TAKARO_ID + ' .kgk-karb-vonal {',
            '  width: 64px;',
            '  height: 3px;',
            '  border-radius: 2px;',
            '  background: #F1C039;',
            '  margin: 24px 0;',
            '}',

            '#' + TAKARO_ID + ' p {',
            '  font-size: clamp(0.95rem, 3.4vw, 1.1rem);',
            '  line-height: 1.7;',
            '  max-width: 30rem;',
            '  margin: 0;',
            '  padding: 0;',
            '  text-transform: none;',
            '  color: rgba(241, 241, 230, 0.82);',
            '}'
        ].join('\n');

        // A <head> a script futásakor már létezik (benne is vagyunk), de a
        // documentElement tartalék akkor sem árt, ha valaki elmozdítja a
        // <script> tag-et.
        (document.head || document.documentElement).appendChild(style);
    }

    stilustBeszur();
    document.documentElement.classList.add(ELLENORZES_CLASS);

    // Vészfék: ha a lekérés valamiért se nem sikerül, se nem hibázik, se nem
    // fut időtúllépésbe (pl. egy soha be nem fejeződő fetch), a takarás akkor
    // se ragadjon be örökre. Ez a Promise.race-től FÜGGETLEN védelem.
    const veszfek = setTimeout(felfed, TIMEOUT_MS + 500);

    function felfed() {
        clearTimeout(veszfek);
        document.documentElement.classList.remove(ELLENORZES_CLASS);
    }

    // ────────────────────────────────────────────────────────────────
    // A DOM ELKÉSZÜLTE
    // ────────────────────────────────────────────────────────────────
    // Ez a figyelő SZINKRONBAN, a <head> értelmezésekor regisztrálódik –
    // tehát biztosan előbb, mint a defer-rel betöltött script.js-é.
    const domKesz = new Promise(resolve => {
        if (document.readyState !== 'loading') resolve();
        else document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });

    function amikorVanBody(fn) {
        if (document.body) { fn(); return; }
        domKesz.then(fn);
    }

    // ────────────────────────────────────────────────────────────────
    // A KARBANTARTÁS KÉPERNYŐ
    // ────────────────────────────────────────────────────────────────
    function karbantartastMutat() {
        amikorVanBody(() => {
            // Ha valamiért kétszer futna le, ne duplázzuk meg a takarót.
            if (document.getElementById(TAKARO_ID)) return;

            const takaro = document.createElement('div');
            takaro.id = TAKARO_ID;
            // A képernyőolvasónak is legyen egyértelmű, hogy ez egy
            // állapotközlés, nem az oldal szokásos tartalma.
            takaro.setAttribute('role', 'status');

            const logo = document.createElement('img');
            logo.className = 'kgk-karb-logo';
            logo.src = LOGO_URL;
            logo.alt = 'Közgazdász Klub';
            // Hiányzó logónál ne egy törött kép ikon éktelenkedjen a
            // képernyő közepén.
            logo.addEventListener('error', () => { logo.style.display = 'none'; });

            const cim = document.createElement('h1');
            cim.textContent = 'Hamarosan érkezik';

            const vonal = document.createElement('div');
            vonal.className = 'kgk-karb-vonal';
            vonal.setAttribute('aria-hidden', 'true');

            const szoveg = document.createElement('p');
            szoveg.textContent = 'Weboldalunk jelenleg frissül, kérjük nézz vissza hamarosan!';

            takaro.appendChild(logo);
            takaro.appendChild(cim);
            takaro.appendChild(vonal);
            takaro.appendChild(szoveg);
            document.body.appendChild(takaro);

            // Az osztálycsere egy lépésben történik: nincs olyan pillanat,
            // amikor egyik sem áll a <html>-en, tehát nincs felvillanás.
            document.documentElement.classList.add(AKTIV_CLASS);
            document.documentElement.classList.remove(ELLENORZES_CLASS);
            clearTimeout(veszfek);

            document.title = 'Hamarosan érkezik | KGK';
        });
    }

    // ────────────────────────────────────────────────────────────────
    // A KAPCSOLÓ LEKÉRÉSE
    // ────────────────────────────────────────────────────────────────
    async function karbantartasBe() {
        const url = SUPABASE_URL + '/rest/v1/feature_flags'
            + '?select=enabled'
            + '&flag_key=eq.' + encodeURIComponent(FLAG_KEY)
            + '&limit=1';

        // A `no-store` azért kell, hogy a kikapcsolás azonnal hasson: egy
        // gyorsítótárazott „be van kapcsolva" válasz különben azután is
        // karbantartás oldalt mutatna, hogy az adminban már kikapcsoltuk.
        const valasz = await fetch(url, {
            cache: 'no-store',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
            }
        });

        if (!valasz.ok) {
            console.error('maintenance: Supabase hiba (' + valasz.status + ') – az oldal normálisan töltődik.');
            return false;
        }

        const sorok = await valasz.json();

        // KIZÁRÓLAG az explicit `true` kapcsol karbantartás módba. Üres lista
        // (nincs ilyen sor / nincs tábla), null, hiányzó mező → normál oldal.
        return Array.isArray(sorok) && sorok.length > 0 && sorok[0].enabled === true;
    }

    // A Promise.race gondoskodik az időkorlátról: ha a válasz nem érkezik meg
    // időben, `false` nyer, és a valódi oldal jelenik meg.
    //
    // A script.js DOMContentLoaded kezelője ezt a promise-t várja be, mielőtt
    // bármit betöltene – lásd ott a „KARBANTARTÁS MÓD" guard-ot.
    window.KGK_MAINTENANCE_READY = Promise.race([
        karbantartasBe().catch(err => {
            console.error('maintenance hiba – az oldal normálisan töltődik:', err);
            return false;
        }),
        new Promise(resolve => setTimeout(() => {
            console.warn('maintenance: időtúllépés – az oldal normálisan töltődik.');
            resolve(false);
        }, TIMEOUT_MS))
    ]).then(be => {
        if (be) karbantartastMutat();
        else felfed();
        return be;
    });
})();
