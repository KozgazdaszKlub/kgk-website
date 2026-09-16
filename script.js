// ============================================================
// SUPABASE KONFIGURÁCIÓ
// ============================================================
const SUPABASE_URL = 'https://agdstsliixwysbjedppu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LXqTP-dPmfwWvd0IZTzrMw_tjYERBe9';

// Idokorlat egy Supabase kereshez (a valasz torzsenek letoltesevel egyutt).
// Enelkul egy beragadt keres orokre a helyen hagyna a skeletont.
const SUPABASE_FETCH_TIMEOUT_MS = 10000;

// Ha a hivas `count: true`-t kap, a visszateresi ertek { data, total } objektum,
// minden mas esetben - mint eddig - egy sima tomb.
//
// HIBA ESETEN HIBAT DOB, nem ures tombot: HTTP hibanal, halozati hibanal es
// idotullepesnel is. Igy a hivo szet tudja valasztani a ket esetet:
//   - ures tomb   = sikeres valasz, csak nincs adat (pl. nincs publikalt hir)
//   - dobott hiba = nem sikerult betolteni
// A halozati hiba (fetch) mar korabban is hibat dobott, tehat minden hivonak
// eddig is kezelnie kellett - most a HTTP hiba es az idotullepes is ugyanigy
// viselkedik. A hibauzenetet mutato loaderek: lasd createLoadError().
async function supabaseFetch(table, options = {}) {
    const { select = '*', order = null, limit = null, eq = null, offset = null, count = false } = options;
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}`;
    if (order) url += `&order=${order}`;
    if (limit) url += `&limit=${limit}`;
    if (offset) url += `&offset=${offset}`;
    if (eq) url += `&${eq.column}=eq.${eq.value}`;

    const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    };
    // A lapozashoz tudnunk kell, osszesen hany sor van - ezt a Prefer fejlec keri le
    if (count) headers['Prefer'] = 'count=exact';

    // Az abort a torzs olvasasat (res.json) is megszakitja, ezert az idozitot
    // csak a legvegen, a finally-ben toroljuk - nem mar a fejlecek megerkezesekor.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS);

    try {
        const res = await fetch(url, { headers, signal: controller.signal });

        // 416-ot csak lapozasnal kaphatunk: a kert oldal a lista vegen tul van.
        // Ez nem hiba - a valos darabszam ilyenkor is megjon a Content-Range fejlecben.
        const overRange = count && res.status === 416;

        if (!res.ok && !overRange) throw new Error(`HTTP ${res.status}`);

        const data = overRange ? [] : await res.json();
        if (!count) return data;

        // A teljes darabszam a Content-Range fejlecben erkezik, pl. "0-8/42" vagy "*/42"
        const total = parseInt((res.headers.get('content-range') || '').split('/')[1], 10);
        return { data, total: Number.isFinite(total) ? total : data.length };
    } catch (err) {
        // Mindharom hibafajta EGY helyen kerul a konzolra, a tabla nevevel.
        // Az idotullepes a bongeszoben csak egy semmitmondo AbortError lenne.
        const error = controller.signal.aborted
            ? new Error(`idotullepes (${SUPABASE_FETCH_TIMEOUT_MS} ms)`)
            : err;
        console.error(`Supabase hiba (${table}):`, error.message);
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

// ============================================================
// DÁTUM FORMÁZÁS
// ============================================================
const MONTHS_HU = ['JAN','FEB','MÁR','ÁPR','MÁJ','JÚN','JÚL','AUG','SZEP','OKT','NOV','DEC'];

function formatDateHu(dateStr) {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = d.toLocaleString('hu-HU', { month: 'long' });
    const day = d.getDate();
    return `${year}. ${month.charAt(0).toUpperCase() + month.slice(1)} ${day}.`;
}

// ============================================================
// FUNKCIÓ-KAPCSOLÓK (feature flags)
// ============================================================
// Az admin felületről ki/be kapcsolható szekciók állapota a `feature_flags`
// táblából jön. A HTML-ben a jelölők kötik össze az adatbázissal:
//
//   data-flag="<flag_key>"      → az elem CSAK akkor látszik, ha a kapcsoló BE van kapcsolva
//   data-flag-off="<flag_key>"  → az elem CSAK akkor látszik, ha a kapcsoló KI van kapcsolva
//   class="flag-pending"        → betöltés alatt a tartalom helyett shimmer látszik (style.css)
//
// Új kapcsolóhoz így NEM kell ehhez a fájlhoz hozzányúlni: elég egy új sor az
// adatbázisban, és a HTML-ben a data-flag jelölő.
//
// FONTOS ALAPELV – „hiba esetén MINDEN LÁTSZIK".
// Ha a tábla még nem létezik, üres, vagy a hálózat elszáll, akkor az összes
// szekció láthatóan marad. Egy adatbázishiba soha ne tüntesse el az oldal
// tartalmát – rosszabb egy üres főoldal, mint egy kapcsoló, ami nem hatott.
const FEATURE_FLAG_FALLBACK = {
    golya_visible: true,
    kapcsolat_visible: true,
    szponzorok_visible: true
};

// Időkorlát: ha a lekérés ennyi alatt nem jön meg, a shimmer NE ragadjon be –
// inkább jelenjen meg minden. (Ugyanaz az elv, mint a szponzor-logók
// betöltésénél az imagesSettled() időkorlátjánál.)
const FEATURE_FLAG_TIMEOUT_MS = 4000;

let featureFlags = { ...FEATURE_FLAG_FALLBACK };

async function loadFeatureFlags() {
    try {
        // A supabaseFetch hiba esetén (nem létező tábla, hálózati hiba, a saját
        // 10 mp-es időkorlátja) hibát dob – ezt a lenti catch kapja el, és marad
        // a fallback. Itt SZÁNDÉKOSAN nincs hibaüzenet: lásd a fenti alapelvet.
        const rows = await Promise.race([
            supabaseFetch('feature_flags', { select: 'flag_key,enabled' }),
            new Promise(resolve => setTimeout(() => resolve(null), FEATURE_FLAG_TIMEOUT_MS))
        ]);

        if (!Array.isArray(rows)) {
            console.warn('feature_flags: időtúllépés – minden szekció láthatóan marad.');
        } else if (!rows.length) {
            console.warn('feature_flags: nincs sor (vagy nincs tábla) – minden szekció láthatóan marad.');
        } else {
            rows.forEach(row => {
                if (!row || typeof row.flag_key !== 'string') return;
                // Csak az explicit `false` kapcsol ki. A null/undefined érték
                // „látszik"-ot jelent – lásd a fenti alapelvet.
                featureFlags[row.flag_key] = row.enabled !== false;
            });
        }
    } catch (err) {
        console.error('loadFeatureFlags hiba:', err);
    }
    return featureFlags;
}

// Egy kapcsoló állapota. Ismeretlen kulcsra `true`-t ad: ha valaki elír egy
// data-flag nevet a HTML-ben, a szekció látszani fog, nem tűnik el némán.
function isFeatureEnabled(key) {
    return featureFlags[key] !== false;
}

function applyFeatureFlags() {
    // 1) Bekapcsolt állapotban látszó elemek
    document.querySelectorAll('[data-flag]').forEach(el => {
        const enabled = isFeatureEnabled(el.dataset.flag);

        // A pending osztály MINDKÉT ágon lekerül: bekapcsolva azért, hogy a
        // tartalom megjelenjen, kikapcsolva azért, hogy ne maradjon ott egy
        // örökké villogó shimmer egy display:none-olt elem belsejében.
        el.classList.remove('flag-pending');
        if (enabled) return;

        el.style.display = 'none';

        // A display:none önmagában nem tenné használhatatlanná egy űrlap
        // mezőit (programozott beküldés, autofill). A letiltás igen.
        el.querySelectorAll('input, textarea, select, button').forEach(mezo => {
            mezo.disabled = true;
        });
    });

    // 2) Kikapcsolt állapotban látszó elemek (pl. a „form nem elérhető" üzenet)
    document.querySelectorAll('[data-flag-off]').forEach(el => {
        if (isFeatureEnabled(el.dataset.flagOff)) return;
        el.hidden = false;
    });

    // 3) A pending konténerek, amikre nincs saját data-flag (pl. a
    //    kapcsolat.html doboza, ahol nem az egészet rejtjük el, csak a
    //    tartalmát cseréljük). Ezekről is le kell venni az osztályt.
    document.querySelectorAll('.flag-pending').forEach(el => el.classList.remove('flag-pending'));
}

// ============================================================
// SKELETON GENERÁTOROK
// ============================================================
function skeletonMemberCards(count = 4) {
    return Array(count).fill(0).map(() => `
        <div class="skeleton-member-card">
            <div class="skeleton skeleton-avatar"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line short"></div>
        </div>
    `).join('');
}

function skeletonNewsItems(count = 3) {
    return Array(count).fill(0).map(() => `
        <div class="skeleton-news-item">
            <div class="skeleton skeleton-news-title"></div>
            <div class="skeleton skeleton-news-meta"></div>
            <div class="skeleton skeleton-news-text"></div>
            <div class="skeleton skeleton-news-text last"></div>
            <div class="skeleton skeleton-news-link"></div>
        </div>
    `).join('');
}

function skeletonEventCards(count = 3) {
    return Array(count).fill(0).map(() => `
        <div class="skeleton-event-card">
            <div class="skeleton-event-date skeleton"></div>
            <div class="skeleton-event-info">
                <div class="skeleton skeleton-event-title"></div>
                <div class="skeleton skeleton-event-desc"></div>
            </div>
        </div>
    `).join('');
}

function skeletonGroupCards(count = 3) {
    return Array(count).fill(0).map(() => `
        <div class="skeleton-group-card">
            <div class="skeleton skeleton-group-title"></div>
            <div class="skeleton skeleton-group-desc"></div>
            <div class="skeleton skeleton-group-desc last"></div>
        </div>
    `).join('');
}

function skeletonRolunk() {
    return `
        <div class="image-box">
            <div class="skeleton skeleton-rolunk-img"></div>
        </div>
        <div class="text-box skeleton-rolunk-text">
            <div class="skeleton skeleton-rolunk-line"></div>
            <div class="skeleton skeleton-rolunk-line"></div>
            <div class="skeleton skeleton-rolunk-line short"></div>
        </div>
    `;
}

// ============================================================
// ÜRES ÁLLAPOT ÜZENET
// ============================================================
function emptyMessage(text) {
    return `<p class="loading-text">${text}</p>`;
}

// ============================================================
// BETÖLTÉSI HIBA ÜZENET + ÚJRAPRÓBÁLÁS
// ============================================================
// A „nincs adat" és a „nem sikerült betölteni" két KÜLÖN eset:
//   - üres eredménynél marad a megszokott „Hamarosan..." szöveg – ez a várt
//     állapot, pl. amíg nincs egyetlen publikált hír sem;
//   - hibánál (a supabaseFetch hibát dob) ez a doboz jelenik meg.
//
// A loaderekben a minta:
//   const x = await supabaseFetch(...).catch(() => null);
//   if (!x) { showLoadError(kontener, loadX); return; }   ← null = HIBA
//   if (!x.length) { ...a régi üres ág, változatlanul... } ← [] = nincs adat
//
// SZÁNDÉKOSAN nincs hibaüzenet a kapcsolóknál (loadFeatureFlags), a
// statisztikáknál (loadSiteContent) és a footer partnereinél
// (loadInstitutionalPartners): ott a hiba esetére kitalált fallback a jó
// viselkedés, lásd ott.
//
// A dobozt DOM-elemként rakjuk össze, nem HTML szövegként: így a gomb a saját
// kattintás-figyelőjével együtt születik, nem kell utólag megkeresni.
function createLoadError(loader) {
    const box = document.createElement('div');
    box.className = 'load-error';

    const text = document.createElement('p');
    text.className = 'load-error-text';
    text.textContent = 'Nem sikerült betölteni a tartalmat.';

    // <button>, nem <a> vagy <div>: így Enterrel és Space-szel is működik
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'load-error-retry';
    btn.textContent = 'Újrapróbálom';
    btn.addEventListener('click', () => retryLoader(loader, btn));

    box.appendChild(text);
    box.appendChild(btn);
    return box;
}

// A konténer teljes tartalmát (a skeletont) a hibadobozra cseréli
function showLoadError(container, loader) {
    container.innerHTML = '';
    container.appendChild(createLoadError(loader));
}

// Az éppen újrafutó loaderek. Egy loader egyszerre CSAK EGYSZER futhat újra:
// dupla kattintás, billentyű-ismétlés vagy a loadGroups két gombja (a két
// rácsban) sem indít párhuzamos lekéréseket. Automatikus újrapróbálás nincs –
// csak kattintásra indul, tehát végtelen ciklus sem alakulhat ki, és egy
// próbálkozás a supabaseFetch időkorlátja miatt legfeljebb ~10 mp.
const retryingLoaders = new Set();

async function retryLoader(loader, btn) {
    if (retryingLoaders.has(loader)) return;
    retryingLoaders.add(loader);
    btn.disabled = true;
    try {
        await loader();
    } catch (err) {
        console.error(`${loader.name} hiba:`, err);
    } finally {
        retryingLoaders.delete(loader);
        // A loader normál esetben lecseréli a dobozt (skeletonra, majd a
        // tartalomra vagy egy ÚJ hibadobozra). Ha valamiért mégis itt maradt,
        // a gomb ne ragadjon letiltva.
        btn.disabled = false;
    }
}

function skeletonArticle() {
    return `
        <div class="skeleton skeleton-article-date"></div>
        <div class="skeleton skeleton-article-title"></div>
        <div class="skeleton skeleton-article-img"></div>
        <div class="skeleton skeleton-article-para"></div>
        <div class="skeleton skeleton-article-para"></div>
        <div class="skeleton skeleton-article-para"></div>
        <div class="skeleton skeleton-article-para short"></div>
        <br>
        <div class="skeleton skeleton-article-para"></div>
        <div class="skeleton skeleton-article-para short"></div>
    `;
}

// ============================================================
// RÓLUNK BETÖLTÉSE
// ============================================================
async function loadAbout() {
    const container = document.querySelector('#rolunk .container');
    if (!container) return;

    // Skeleton megjelenítése
    container.innerHTML = skeletonRolunk();

    const data = await supabaseFetch('about', { limit: 1 }).catch(() => null);
    if (!data) { showLoadError(container, loadAbout); return; }
    if (!data.length) {
        container.innerHTML = emptyMessage('A Rólunk szöveg hamarosan elérhető...');
        return;
    }

    const about = data[0];
    container.innerHTML = `
        <div class="image-box hidden">
            <img id="rolunk-img" src="${escapeAttr(safeUrl(about.image_url)) || 'images/Csopkép elnökség 24-25.jpg'}" alt="KGK Elnökség Csoportkép" onerror="this.onerror=null;this.src='images/Csopkép elnökség 24-25.jpg';">
        </div>
        <div class="text-box hidden">
            <p id="rolunk-text">${escapeAttr(about.text)}</p>
        </div>
    `;
    initObserver();
}

// ============================================================
// GÓLYA PDF BETÖLTÉSE
// ============================================================
async function loadGolyaPdf() {
    const btn = document.getElementById('golya-pdf-btn');
    const missing = document.getElementById('golya-pdf-missing');
    if (!btn) return;

    // Újrapróbáláskor a korábbi hibadoboz lekerül, és visszajön a „Hamarosan
    // elérhető..." – innentől minden úgy fut, mint az első betöltéskor. (Első
    // betöltéskor nincs hibadoboz, ilyenkor ez a blokk semmihez nem nyúl.)
    const prevError = btn.parentElement.querySelector('.load-error');
    if (prevError) {
        prevError.remove();
        if (missing) missing.hidden = false;
    }

    const data = await supabaseFetch('documents', { limit: 1, order: 'created_at.desc' }).catch(() => null);
    if (!data) {
        // Hibánál a „Hamarosan elérhető..." félrevezető lenne: lehet, hogy van
        // PDF, csak most nem értük el. A helyén a hibadoboz látszik.
        if (missing) missing.hidden = true;
        (missing || btn).after(createLoadError(loadGolyaPdf));
        return;
    }
    if (!data.length) return;

    const doc = data[0];
    // Csak http(s) link kerülhet a gombra – lásd safeUrl()
    const url = safeUrl((doc.file_url || '').trim());
    // Használhatatlan linknél a gomb NEM jelenik meg. Üres `href` az AKTUÁLIS
    // oldalt töltené újra (a target="_blank" miatt új lapon), letöltés helyett –
    // ezért marad a „Hamarosan elérhető...", vagyis ugyanaz az állapot, mint
    // amikor egyáltalán nincs feltöltött PDF.
    if (!url) return;
    btn.href = url;
    btn.style.display = 'inline-block';
    if (missing) missing.style.display = 'none';
}

// ============================================================
// STATISZTIKÁK + GÓLYÁKNAK SZÖVEG BETÖLTÉSE
// ============================================================
// Ha a site_content tábla nem érhető el (hálózati hiba, üres tábla), ezek az
// értékek jelennek meg – így a szekció sosem marad üresen vagy 0-n ragadva.
const SITE_CONTENT_FALLBACK = {
    stat_1_value: 15,  stat_1_label: 'Év Tapasztalat',
    stat_2_value: 500, stat_2_label: 'Aktív Tag',
    stat_3_value: 50,  stat_3_label: 'Éves Rendezvény',
    stat_4_value: 100, stat_4_label: '% Közösség',
    golyaknak_title: 'Üdvözlünk az egyetemen!',
    golyaknak_text: 'Tudjuk, hogy az első hetek nehezek lehetnek, de mi segítünk eligazodni. Töltsd le a Gólya Kisokost, amiben mindent megtalálsz!'
};

async function loadSiteContent() {
    const statsContainer = document.querySelector('#stats .stats-container');
    const golyaTitle = document.getElementById('golyaknak-title');
    const golyaText = document.getElementById('golyaknak-text');
    if (!statsContainer && !golyaTitle && !golyaText) return;

    const content = { ...SITE_CONTENT_FALLBACK };
    try {
        const data = await supabaseFetch('site_content', { limit: 1 });
        if (data.length) {
            // Csak a kitöltött mezőket vesszük át, a null-oknál marad az alapérték
            for (const [key, val] of Object.entries(data[0])) {
                if (key in content && val !== null && val !== undefined) content[key] = val;
            }
        } else {
            console.warn('site_content: nincs sor, az alapértelmezett tartalom jelenik meg.');
        }
    } catch (err) {
        console.error('loadSiteContent hiba:', err);
    }

    // Statisztikák – a data-target értéket az initCounters() olvassa ki
    if (statsContainer) {
        statsContainer.querySelectorAll('.stat-box').forEach((box, i) => {
            const counter = box.querySelector('.counter');
            const label = box.querySelector('p');
            if (counter) {
                counter.setAttribute('data-target', Number(content[`stat_${i + 1}_value`]) || 0);
                counter.textContent = '0';   // a skeleton helyére a kiindulási érték
            }
            if (label) label.textContent = content[`stat_${i + 1}_label`] || '';
        });
    }

    // Gólyáknak szekció szövege (a PDF gombot a loadGolyaPdf() kezeli)
    if (golyaTitle) golyaTitle.textContent = content.golyaknak_title || '';
    if (golyaText) golyaText.textContent = content.golyaknak_text || '';

    // A számlálók CSAK most kapcsolódhatnak rá. Korábban (DOMContentLoaded-kor)
    // még nem volt data-target, így az observer 0-ra futtatta volna a felfutást
    // és a szám rögtön "0+"-nál akadt volna meg.
    initCounters();
}

// ============================================================
// ELNÖKSÉG BETÖLTÉSE
// ============================================================
// Egy közösségi ikon a tag kártyáján. Üres `href` az AKTUÁLIS oldalt töltené
// újra (a target="_blank" miatt új lapon), ezért a nem http(s) címnél (safeUrl)
// az ikon <span>-ként marad a helyén: látszik, de nem kattintható. Ugyanaz a
// minta, mint a lábléc partnereinél – lásd loadInstitutionalPartners().
// A stílust a `.socials a, .socials span` szabály adja mindkét alakra, a hover
// viszont csak a linkre (style.css, „SOCIAL IKONOK STÍLUSA").
function socialIcon(rawUrl, iconClass) {
    if (!rawUrl) return '';
    const icon = `<i class="${iconClass}"></i>`;
    // A trim a safeUrl ELŐTT kell: a csupa szóközből álló cím átmenne a
    // safeUrl-en (az URL-értelmező az oldal saját címére oldja fel), és megint
    // csak az aktuális oldal töltődne újra. A lábléc partnerei is így csinálják.
    const url = safeUrl(String(rawUrl).trim());
    return url
        ? `<a href="${escapeAttr(url)}" target="_blank">${icon}</a>`
        : `<span>${icon}</span>`;
}

async function loadTeam() {
    const teamGrid = document.querySelector('.team-grid');
    if (!teamGrid) return;

    // Skeleton
    teamGrid.innerHTML = skeletonMemberCards(4);

    const members = await supabaseFetch('team_members', { order: 'sort_order.asc' }).catch(() => null);
    if (!members) { showLoadError(teamGrid, loadTeam); return; }
    if (!members.length) { teamGrid.innerHTML = emptyMessage('Hamarosan bemutatjuk az elnökséget...'); return; }
    teamGrid.innerHTML = members.map((m, i) => `
        <div class="member-card hidden" style="transition-delay: ${i * 200}ms">
            <img src="${escapeAttr(safeUrl(m.image_url)) || 'images/placeholder.svg'}" alt="${escapeAttr(m.name)}" onerror="this.onerror=null;this.src='images/placeholder.svg';">
            <h3>${escapeAttr(m.name)}</h3>
            <p>${escapeAttr(m.position)}</p>
            ${(m.facebook_url || m.instagram_url || m.linkedin_url) ? `
            <div class="socials">
                ${socialIcon(m.facebook_url, 'fab fa-facebook')}
                ${socialIcon(m.instagram_url, 'fab fa-instagram')}
                ${socialIcon(m.linkedin_url, 'fab fa-linkedin')}
            </div>` : ''}
        </div>
    `).join('');
    initObserver();
}

// ============================================================
// MUNKACSOPORTOK BETÖLTÉSE
// ============================================================
async function loadGroups() {
    const grids = document.querySelectorAll('.groups-grid');
    if (!grids.length) return;

    // Skeleton mindkét gridbe
    grids.forEach(g => g.innerHTML = skeletonGroupCards(3));

    const groups = await supabaseFetch('groups', { order: 'sort_order.asc' }).catch(() => null);
    // Egy lekérés tölti mindkét rácsot, ezért mindkettőbe kerül hibadoboz – a
    // két gomb ugyanazt a loadert hívja (a retryLoader nem futtatja kétszer)
    if (!groups) { grids.forEach(g => showLoadError(g, loadGroups)); return; }
    const mainGroups = groups.filter(g => g.type === 'main');
    const smallGroups = groups.filter(g => g.type === 'small');
    if (grids[0]) {
        grids[0].innerHTML = mainGroups.length ? mainGroups.map((g, i) => `
            <div class="group-card hidden" style="border-top: 5px solid ${safeHexColor(g.color)}; transition-delay: ${i * 200}ms">
                <h3 style="margin-top: 20px;">${escapeAttr(g.title)}</h3>
                <p>${escapeAttr(g.description)}</p>
            </div>
        `).join('') : emptyMessage('Hamarosan bemutatjuk a munkacsoportokat...');
    }
    if (grids[1]) {
        grids[1].innerHTML = smallGroups.length ? smallGroups.map((g, i) => `
            <div class="group-card hidden" style="border-top: 5px solid ${safeHexColor(g.color)}; transition-delay: ${i * 200}ms">
                ${g.image_url ? `<img src="${escapeAttr(safeUrl(g.image_url))}" alt="${escapeAttr(g.title)} Logo" class="group-logo" onerror="this.style.display='none';">` : ''}
                <h3>${escapeAttr(g.title)}</h3>
                <p>${escapeAttr(g.description)}</p>
            </div>
        `).join('') : emptyMessage('Hamarosan bemutatjuk a kiscsoportokat...');
    }
    initObserver();
}

// ============================================================
// RENDEZVÉNYEK BETÖLTÉSE
// ============================================================
async function loadEvents() {
    const eventsGrid = document.querySelector('.events-grid');
    if (!eventsGrid) return;

    // Skeleton
    eventsGrid.innerHTML = skeletonEventCards(3);

    const events = await supabaseFetch('events', { order: 'date.asc' }).catch(() => null);
    if (!events) { showLoadError(eventsGrid, loadEvents); return; }

    // Csak a mai naptól jövőbeli (vagy mai) rendezvényeket mutatjuk a főoldalon
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const upcoming = events.filter(e => {
        const d = new Date(e.date);
        return !isNaN(d) && d >= todayStart;
    });

    if (!upcoming.length) { eventsGrid.innerHTML = emptyMessage('Jelenleg nincs közelgő rendezvény. Nézz vissza hamarosan!'); return; }
    eventsGrid.innerHTML = upcoming.map(e => {
        const d = new Date(e.date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = MONTHS_HU[d.getMonth()];
        return `
            <div class="event-card">
                <div class="event-date">
                    <span class="day">${day}</span>
                    <span class="month">${month}</span>
                </div>
                <div class="event-info">
                    <h3>${escapeAttr(e.title)}</h3>
                    <p>${escapeAttr(e.description)}</p>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// HÍR KÁRTYA (közös a főoldal és a hírarchívum között)
// ============================================================
// Az `excerpt` sima szöveg, ezért escape-eljük. Ha üres, a `content` elejéből
// vágunk ki egy darabot – azt SZÁNDÉKOSAN nem: a content a rich text editorból
// jövő HTML, a címkéket a regex leszedi, a benne maradt entitásokat (pl.
// &nbsp;, &amp;) viszont a böngészőnek kell visszaalakítania. Ugyanez a
// tartalom a hir.html-en amúgy is escape nélkül jelenik meg.
function newsCardHtml(n, delay = 0) {
    return `
        <article class="news-item hidden" style="transition-delay: ${delay}ms">
            ${n.image_url ? `<img
                class="news-card-img"
                data-src="${escapeAttr(safeUrl(n.image_url))}"
                src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"
                alt="${escapeAttr(n.title)}"
                loading="lazy"
                onerror="this.style.display='none';">` : ''}
            <h3>${escapeAttr(n.title)}</h3>
            <p class="meta">${formatDateHu(n.date)}</p>
            <p>${escapeAttr(n.excerpt) || (n.content || '').replace(/<[^>]+>/g, '').substring(0, 120)}...</p>
            <a href="hir.html?slug=${escapeAttr(n.slug)}">Tovább olvasom &rarr;</a>
        </article>
    `;
}

// Lazy load a hírkártya képeknél: csak akkor töltődnek le, ha a képernyőre gördülnek
function initNewsCardLazyLoad(container) {
    if (!container) return;
    const imgObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
                img.classList.add('loaded');
                imgObserver.unobserve(img);
            }
        });
    }, { rootMargin: '200px' });

    container.querySelectorAll('img[data-src]').forEach(img => imgObserver.observe(img));
}

// ============================================================
// HÍREK BETÖLTÉSE (főoldalon)
// ============================================================
async function loadNews() {
    const newsGrid = document.querySelector('.news-grid');
    if (!newsGrid) return;

    newsGrid.innerHTML = skeletonNewsItems(3);

    const news = await supabaseFetch('news', { order: 'date.desc', limit: 3 }).catch(() => null);
    // null = hiba. Az üres lista NEM hiba: amíg nincs publikált hír, ez a várt
    // állapot, és marad a „Hamarosan érkeznek a híreink..." szöveg.
    if (!news) { showLoadError(newsGrid, loadNews); return; }
    if (!news.length) { newsGrid.innerHTML = emptyMessage('Hamarosan érkeznek a híreink...'); return; }
    newsGrid.innerHTML = news.map((n, i) => newsCardHtml(n, i * 200)).join('');

    initNewsCardLazyLoad(newsGrid);
    initObserver();
}

// ============================================================
// HÍRARCHÍVUM (hirek.html) – lapozható lista
// ============================================================
const NEWS_PER_PAGE = 9;

// Egy oldalnyi hír lekérése + a hírek teljes darabszáma
async function fetchNewsPage(page) {
    return supabaseFetch('news', {
        order: 'date.desc',
        limit: NEWS_PER_PAGE,
        offset: (page - 1) * NEWS_PER_PAGE,
        count: true
    });
}

// Melyik oldalszámok látszódjanak: az első, az utolsó és az aktuális körüliek,
// a kimaradó részek helyére "…" kerül
function buildPageList(current, total) {
    const wanted = [1, total, current - 1, current, current + 1];
    const pages = [...new Set(wanted)].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
    const list = [];
    pages.forEach((p, i) => {
        if (i > 0 && p - pages[i - 1] > 1) list.push('...');
        list.push(p);
    });
    return list;
}

function renderPagination(container, page, totalPages) {
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const prev = page > 1
        ? `<a class="page-btn" href="hirek.html?page=${page - 1}">&laquo; Előző</a>`
        : `<span class="page-btn disabled">&laquo; Előző</span>`;

    const next = page < totalPages
        ? `<a class="page-btn" href="hirek.html?page=${page + 1}">Következő &raquo;</a>`
        : `<span class="page-btn disabled">Következő &raquo;</span>`;

    const numbers = buildPageList(page, totalPages).map(p => {
        if (p === '...') return `<span class="page-gap">…</span>`;
        if (p === page) return `<span class="page-num active" aria-current="page">${p}</span>`;
        return `<a class="page-num" href="hirek.html?page=${p}" aria-label="${p}. oldal">${p}</a>`;
    }).join('');

    container.innerHTML = `${prev}<div class="page-numbers">${numbers}</div>${next}`;
}

async function loadNewsArchive() {
    const grid = document.querySelector('#hirek-archivum .news-grid');
    const pager = document.getElementById('pagination');
    if (!grid) return;

    grid.innerHTML = skeletonNewsItems(NEWS_PER_PAGE);
    if (pager) pager.innerHTML = '';

    // Az oldalszám az URL-ből jön (hirek.html?page=2); hiányzó vagy hibás érték = első oldal
    let page = parseInt(new URLSearchParams(window.location.search).get('page'), 10);
    if (!Number.isFinite(page) || page < 1) page = 1;

    let result = await fetchNewsPage(page).catch(() => null);
    if (!result) { showLoadError(grid, loadNewsArchive); return; }
    const totalPages = Math.max(1, Math.ceil(result.total / NEWS_PER_PAGE));

    // Ha az URL-ben nagyobb oldalszám szerepel, mint ahány oldal van, az utolsót mutatjuk
    if (page > totalPages) {
        page = totalPages;
        result = await fetchNewsPage(page).catch(() => null);
        if (!result) { showLoadError(grid, loadNewsArchive); return; }
    }

    if (!result.data.length) {
        grid.innerHTML = emptyMessage('Még nincs egyetlen hírünk sem. Nézz vissza hamarosan!');
        if (pager) pager.innerHTML = '';
        return;
    }

    // Soronként (3 kártya) lépcsőzik be az animáció
    grid.innerHTML = result.data.map((n, i) => newsCardHtml(n, (i % 3) * 200)).join('');
    initNewsCardLazyLoad(grid);
    initObserver();

    renderPagination(pager, page, totalPages);
    if (totalPages > 1) document.title = `Híreink – ${page}. oldal | KGK`;
}

// ============================================================
// SZPONZOROK BETÖLTÉSE
// ============================================================
function skeletonSponsors(count = 4) {
    return Array(count).fill(0).map(() => `
        <div class="skeleton sponsor-skeleton"></div>
    `).join('');
}

async function loadSponsors() {
    const belt = document.querySelector('.sponsors-belt');
    const track = document.querySelector('.sponsors-track');
    if (!track) return;

    track.innerHTML = skeletonSponsors(4);

    const sponsors = await supabaseFetch('sponsors', { order: 'sort_order.asc' }).catch(() => null);
    // Hibánál a szekció NEM rejtőzik el – az csak azt jelenti, hogy nincs szponzor
    if (!sponsors) { showLoadError(track, loadSponsors); return; }
    if (!sponsors.length) {
        const section = document.getElementById('szponzorok');
        if (section) section.style.display = 'none';
        return;
    }

    function renderItems(list) {
        return list.map(s => {
            const name = escapeAttr(s.name);
            // A logó mellé kirakjuk a nevet is: alapból rejtve, csak akkor látszik,
            // ha a kép nem tölthető be (lásd initSponsorImages)
            const logo = `
                <img src="${escapeAttr(safeUrl(s.logo_url))}" alt="${name}" title="${name}">
                <span class="sponsor-name-fallback">${name}</span>`;
            // Üres `href` az AKTUÁLIS oldalt töltené újra (a target="_blank" miatt
            // új lapon), ezért a nem http(s) cím (safeUrl) ugyanarra az ágra fut,
            // mint a weboldal nélküli szponzor: a logó látszik, csak nem link.
            const website = safeUrl((s.website_url || '').trim());
            return `
            <div class="sponsor-item">
                ${website
                    ? `<a href="${escapeAttr(website)}" target="_blank" rel="noopener noreferrer" class="sponsor-link">${logo}</a>`
                    : logo
                }
                <span class="sponsor-tooltip">${name}</span>
            </div>
        `;
        }).join('');
    }

    // Hibás logó esetén NEM tüntetjük el az egész szponzort, csak a képet rejtjük el,
    // és helyette a szponzor nevét mutatjuk
    function initSponsorImages(root) {
        root.querySelectorAll('.sponsor-item img').forEach(img => {
            if (img.dataset.kezelve) return;
            img.dataset.kezelve = '1';

            const hibaraNevet = () => {
                const item = img.closest('.sponsor-item');
                if (item) item.classList.add('no-logo');
            };
            img.addEventListener('error', hibaraNevet);
            // Ha a kép már a figyelő felrakása előtt elhasalt volna
            if (img.complete && img.naturalWidth === 0) hibaraNevet();

            // Ha egy kép az időkorlát után érkezik meg, akkor is jó módba álljon a szalag
            img.addEventListener('load', () => updateSponsorMode());
        });
    }

    // Megvárjuk, hogy a logók tényleg betöltsenek (vagy hibázzanak), különben
    // 0 széles képekkel mérnénk. Időkorláttal, hogy sose ragadjon be.
    function imagesSettled(root, timeoutMs) {
        const pending = [...root.querySelectorAll('.sponsor-item img')]
            .filter(img => !img.complete)
            .map(img => new Promise(resolve => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
            }));
        if (!pending.length) return Promise.resolve();
        return Promise.race([
            Promise.all(pending),
            new Promise(resolve => setTimeout(resolve, timeoutMs))
        ]);
    }

    // A DOM-hoz csak akkor nyúlunk, ha tényleg scrollozó módba kell váltani.
    // Ha statikus marad, semmit nem írunk felül - így a már látszó logók nem villannak el.
    function updateSponsorMode() {
        if (track.classList.contains('scrolling')) return;

        const beltWidth = belt ? belt.offsetWidth : window.innerWidth;
        if (track.scrollWidth <= beltWidth * 0.85) return;

        // Túl sok szponzor: scrollozó mód. A meglévő (már betöltött) elemeket nem
        // cseréljük le, csak másolatot fűzünk mögéjük - így nincs újratöltés.
        track.classList.add('scrolling');
        if (belt) belt.classList.add('scrolling');

        [...track.children].map(node => node.cloneNode(true)).forEach(masolat => {
            const img = masolat.querySelector('img');
            if (img) delete img.dataset.kezelve;
            track.appendChild(masolat);
        });
        initSponsorImages(track);
    }

    // Először statikus középre igazított módban rendereljük
    track.classList.remove('scrolling');
    if (belt) belt.classList.remove('scrolling');
    track.innerHTML = renderItems(sponsors);
    initSponsorImages(track);

    // Csak a képek betöltése után döntünk a módról
    await imagesSettled(track, 1500);
    updateSponsorMode();
}

// ============================================================
// INTÉZMÉNYI PARTNEREK (footer, MINDEN publikus oldalon)
// ============================================================
// Az `institutional_partners` táblából jön, ami PONTOSAN KÉT sort tartalmaz
// (a kar és az egyetem). Létrehozó script: migrations/institutional_partners.sql
//
// Ez a loader szándékosan NEM az `isIndexPage` ágban fut, hanem minden
// publikus oldalon: a footer mind az ötben ott van.
//
// „Hiba esetén ne látszódjon félkész dolog": ha a tábla üres, a `supabaseFetch`
// üres tömböt ad vissza; ha nem létezik, vagy a kérés elszáll, hibát dob, amit
// a DOMContentLoaded `.catch`-e nyel el. Mindkét esetben érintetlenül hagyjuk a
// konténert – itt SZÁNDÉKOSAN nincs hibaüzenet és Újrapróbálom gomb. Az üres
// `<div>` nem foglal helyet, tehát a footer pontosan úgy néz ki, mint a
// funkció bevezetése előtt.

// Attribútumba és szövegbe kerülő értékek ártalmatlanítása.
// A tartalmat csak bejelentkezett admin írja, tehát ez nem támadás elleni
// védelem, hanem hibatűrés: egy idézőjel a névben vagy az URL-ben enélkül
// idő előtt lezárná az attribútumot, és szétesne a footer HTML-je.
//
// Ez a fájl EGYETLEN escape függvénye: MINDEN render függvény ezt használja
// az adatbázisból jövő szövegekre (cím, név, pozíció, leírás, alt, URL…),
// attribútumban és szövegben egyaránt. Kivétel CSAK a hír `content` mezője,
// ami szándékosan HTML – lásd newsCardHtml() és loadArticle().
// A null/undefined értékből üres szöveg lesz.
function escapeAttr(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// URL ellenőrzés `src` és `href` attribútumhoz: CSAK http: és https: link
// mehet át, minden más (`javascript:`, `data:`, `mailto:`…) üres szöveget ad.
// Egy `javascript:` link kattintásra kódot futtatna – ezt az escape egymagában
// nem akadályozza meg, hiszen abban nincs egyetlen veszélyes karakter sem.
//
// Szövegminta helyett a böngésző saját URL-értelmezőjét kérdezzük meg, mert az
// pontosan úgy olvassa a trükkös alakokat (" JaVaScRiPt:", "java<TAB>script:"),
// ahogy kattintáskor is tenné. A relatív cím (pl. "images/logo.png") az oldal
// saját https címéhez oldódik fel, tehát átmegy.
//
// Az eredmény NINCS escape-elve – attribútumba így kerül:
//   src="${escapeAttr(safeUrl(x.image_url))}"
// Ez a sémát nézi, az escapeAttr a karaktereket.
function safeUrl(value) {
    const url = String(value ?? '');
    try {
        const { protocol } = new URL(url, window.location.href);
        return protocol === 'http:' || protocol === 'https:' ? url : '';
    } catch (err) {
        return '';
    }
}

// SZÍN ellenőrzés `style` attribútumhoz: CSAK valódi hex szín (#rgb vagy
// #rrggbb) mehet át, minden más az alapértelmezett navy-t kapja.
// Az escapeAttr megakadályozza, hogy az érték KITÖRJÖN az attribútumból, de a
// `style`-on BELÜL maradva még mindig lehetne belőle CSS-injektálás
// (pl. "red; background-image: url(…)"). Admin jogosultság kell hozzá, tehát
// alacsony súlyú – de így le van zárva.
//
// Az eredmény NEM kap escape-et, és nem is kell: a minta csak `#`-et és hexa
// számjegyeket enged át, tehát idézőjel, pontosvessző és szóköz nem lehet benne.
const DEFAULT_GROUP_COLOR = '#08122b';
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function safeHexColor(value, fallback = DEFAULT_GROUP_COLOR) {
    const color = String(value ?? '').trim();
    return HEX_COLOR_PATTERN.test(color) ? color : fallback;
}

async function loadInstitutionalPartners() {
    const container = document.getElementById('footer-partners');
    if (!container) return;

    const partners = await supabaseFetch('institutional_partners', { order: 'sort_order.asc' });
    if (!partners.length) return;

    container.innerHTML = partners.map(p => {
        const name = escapeAttr(p.name);

        // Ha még nincs feltöltött logó, a NÉV jelenik meg helyette. Ugyanaz az
        // elv, mint a szponzoroknál: a partner sose tűnjön el csak azért, mert
        // a képe hiányzik vagy nem tölthető be.
        //
        // Az `onerror` a betöltéskor elszálló képet kezeli: elrejti a képet, és
        // megmutatja a mögötte lévő név-feliratot. (Ugyanaz az idióma, mint a
        // script.js többi `onerror` ágában.)
        const inner = p.logo_url
            ? `<img src="${escapeAttr(safeUrl(p.logo_url))}" alt="${name}"
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
               <span class="footer-partner-name" style="display:none">${name}</span>`
            : `<span class="footer-partner-name">${name}</span>`;

        // Üres `href` az AKTUÁLIS oldalt töltené újra – ezért link nélkül
        // jelenítjük meg, amíg nincs megadva weboldal. A nem http(s) link
        // (safeUrl) ugyanide, a link nélküli ágra fut.
        const url = safeUrl((p.website_url || '').trim());
        return url
            ? `<a class="footer-partner" href="${escapeAttr(url)}" target="_blank"
                  rel="noopener noreferrer" title="${name}">${inner}</a>`
            : `<span class="footer-partner" title="${name}">${inner}</span>`;
    }).join('');

    container.classList.add('loaded');
}

// ============================================================
// NEM LÉTEZŐ HÍR (hir.html)
// ============================================================
function showArticleNotFound(container) {
    document.title = 'Hír nem található | KGK';
    container.innerHTML = `
        <div class="article-missing">
            <div class="article-missing-badge">?</div>
            <h1>Ez a hír nem található</h1>
            <p>Lehet, hogy elírtuk a linket, vagy a hír időközben lekerült az oldalról.
               A hírarchívumban minden korábbi hírünket megtalálod.</p>
            <div class="article-missing-actions">
                <a href="hirek.html" class="btn">Összes hír megtekintése</a>
                <a href="index.html" class="article-missing-link">Vissza a főoldalra</a>
            </div>
        </div>
    `;
}

// ============================================================
// HÍR OLDAL BETÖLTÉSE (hir.html)
// ============================================================
// A hír-galériából ennyi kép töltődik be azonnal; a többi csak akkor, amikor a
// csúszkában a látómező közelébe ér (hir.html initGalleryLazyLoad).
const GALLERY_EAGER_COUNT = 3;

async function loadArticle() {
    const articleContainer = document.querySelector('.article-container');
    if (!articleContainer) return;

    // Skeleton azonnal
    articleContainer.innerHTML = skeletonArticle();

    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');
    if (!slug) { showArticleNotFound(articleContainer); return; }
    const results = await supabaseFetch('news', { eq: { column: 'slug', value: slug } }).catch(() => null);
    // Hibánál NEM a „nem található" képernyő jön: a hír lehet, hogy létezik,
    // csak most nem értük el. (Piszkozatnál és rossz slugnál üres a lista.)
    if (!results) { showLoadError(articleContainer, loadArticle); return; }
    const article = results[0];
    if (!article) { showArticleNotFound(articleContainer); return; }
    // A document.title sima szöveg, nem HTML: ide NEM kell escapeAttr (a
    // böngészőfülön különben &quot; jelenne meg idézőjel helyett).
    document.title = `${article.title} | KGK`;

    // Galéria képek betöltése
    const galleryImages = await supabaseFetch('news_images', {
        select: 'image_url,sort_order',
        order: 'sort_order.asc',
        eq: { column: 'news_id', value: article.id }
    }).catch(() => null);

    // Galéria HTML
    // (null = a galériát nem sikerült betölteni: a hír ettől még megjelenik,
    // a galéria helyére a render után kerül a hibadoboz – lásd lent)
    let galleryHtml = '';
    // A lightbox URL-listája. Csak itt, a memóriában él: a képekre NEM kerül
    // inline onclick (az korábban a teljes listát képenként beleírta a DOM-ba),
    // a kattintást a render után a csúszka egyetlen figyelője kezeli – lásd lent.
    let galleryUrls = [];
    if (galleryImages && galleryImages.length > 0) {
        // A nem http(s) kép már itt kiesik, így a lightbox sem kapja meg.
        galleryUrls = galleryImages.map(img => safeUrl(img.image_url));
        // Az első GALLERY_EAGER_COUNT kép src-vel, a többi data-src-vel kerül be:
        // azt a hir.html initGalleryLazyLoad() teszi át src-be, amikor a kép a
        // látómező közelébe ér – addig a böngésző le sem tölti. A kiszűrt (üres)
        // URL src-ben marad, hogy az onerror ugyanúgy elrejtse, mint eddig.
        const imgTags = galleryUrls.map((url, i) => `
            <img ${i >= GALLERY_EAGER_COUNT && url ? 'data-src' : 'src'}="${escapeAttr(url)}" alt="Galéria kép ${i+1}" onerror="this.style.display='none';">
        `).join('');

        galleryHtml = `
            <div class="article-gallery">
                <h3>Képgaléria</h3>
                <div class="gallery-slider-wrapper">
                    <div class="gallery-slider" id="gallery-slider" onscroll="updateGalleryNavBtns()">
                        ${imgTags}
                    </div>
                </div>
                ${galleryUrls.length > 1 ? `
                <div class="gallery-nav">
                    <button class="gallery-nav-btn" id="gallery-prev" onclick="scrollGallery(-1)" disabled>&#8249;</button>
                    <button class="gallery-nav-btn" id="gallery-next" onclick="scrollGallery(1)">&#8250;</button>
                </div>` : ''}
            </div>
        `;
    }

    // A `content` SZÁNDÉKOSAN escape nélkül megy be: a rich text editorból
    // jövő HTML (bekezdések, linkek, formázás). Minden más mező escape-elt.
    articleContainer.innerHTML = `
        <p class="article-date">${formatDateHu(article.date)}</p>
        <h1>${escapeAttr(article.title)}</h1>
        ${article.image_url ? `<img src="${escapeAttr(safeUrl(article.image_url))}" alt="${escapeAttr(article.title)}" class="article-image" onerror="this.style.display='none';">` : ''}
        <div class="article-text">${article.content}</div>
        ${galleryHtml}
        <br><br>
        <a href="index.html#hirek" class="btn">← Vissza a hírekhez</a>
    `;

    // Lightbox: egyetlen kattintás-figyelő a csúszkán (event delegation). A kép
    // sorszáma a csúszkán belüli helye – ez megegyezik a galleryUrls indexével,
    // a rejtett (onerror) képekkel együtt, ahogy korábban az onclick-ben is.
    // A `:scope >` miatt a hír szövegében lévő, azonos osztályú elem nem zavar
    // be. A csúszka minden rendereléskor új elem, így újrapróbáláskor sem lesz
    // rajta dupla figyelő.
    const gallerySlider = articleContainer.querySelector(':scope > .article-gallery .gallery-slider');
    if (gallerySlider) {
        gallerySlider.addEventListener('click', (e) => {
            const img = e.target.closest('img');
            if (!img || !gallerySlider.contains(img)) return;
            const index = [...gallerySlider.querySelectorAll('img')].indexOf(img);
            if (index === -1 || typeof openLightbox !== 'function') return;
            openLightbox(galleryUrls, index);
        });
    }

    // A galéria hibadoboza a cikk szövege után, ahol a galéria lenne. Az
    // Újrapróbálom az egész hírt tölti újra: a loadArticle egyben kezeli a kettőt.
    if (!galleryImages) {
        const galleryBox = document.createElement('div');
        galleryBox.className = 'article-gallery';
        const heading = document.createElement('h3');
        heading.textContent = 'Képgaléria';
        galleryBox.appendChild(heading);
        galleryBox.appendChild(createLoadError(loadArticle));
        articleContainer.querySelector('.article-text').after(galleryBox);
    }

    // Galéria nav gombok + lazy load inicializálása
    setTimeout(() => {
        if (typeof updateGalleryNavBtns === 'function') updateGalleryNavBtns();
        document.dispatchEvent(new Event('galleryLoaded'));
    }, 100);
}

// ============================================================
// SCROLL ANIMÁCIÓ
// ============================================================
function initObserver() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) entry.target.classList.add('show');
        });
    });
    document.querySelectorAll('.hidden').forEach((el) => observer.observe(el));
}

// ============================================================
// SZÁMLÁLÓK
// ============================================================
function initCounters() {
    const counters = document.querySelectorAll('.counter');
    const speed = 200;
    const countObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = entry.target;
                const updateCount = () => {
                    const target = +counter.getAttribute('data-target');
                    const count = +counter.innerText;
                    const inc = target / speed;
                    if (count < target) {
                        counter.innerText = Math.ceil(count + inc);
                        setTimeout(updateCount, 20);
                    } else {
                        counter.innerText = target + '+';
                    }
                };
                updateCount();
                observer.unobserve(counter);
            }
        });
    });
    counters.forEach(counter => countObserver.observe(counter));
}

// ============================================================
// HAMBURGER MENÜ
// ============================================================
function initHamburger() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-links');
    if (!hamburger || !navMenu) return;

    // Az aria-expanded és az aria-label a képernyőolvasónak mondja meg, hogy
    // a menü épp nyitva van-e. Egy helyen frissítjük, hogy egérrel és
    // billentyűzettel is ugyanaz az állapot alakuljon ki.
    const syncAria = isOpen => {
        hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        hamburger.setAttribute('aria-label', isOpen ? 'Menü bezárása' : 'Menü megnyitása');
    };

    const toggleMenu = () => {
        const isOpen = hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
        syncAria(isOpen);
    };

    const closeMenu = () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
        syncAria(false);
    };

    hamburger.addEventListener('click', toggleMenu);

    // A hamburger <div>, nem <button>, ezért a billentyűzetes aktiválást
    // nekünk kell megvalósítanunk: Enter és Space is nyissa/zárja a menüt.
    hamburger.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault(); // a Space alapból görgetné az oldalt
            toggleMenu();
        }
    });

    document.querySelectorAll('.nav-links a').forEach(n => n.addEventListener('click', closeMenu));

    // Kívülre kattintás/koppintás bezárja a nyitott menüt (mobil overlay).
    // A hamburgert kihagyjuk, mert annak saját toggle-je van: e nélkül a
    // kattintás előbb bezárná, majd ez a listener visszanyitná a menüt.
    document.addEventListener('click', e => {
        if (!navMenu.classList.contains('active')) return;
        if (navMenu.contains(e.target) || hamburger.contains(e.target)) return;
        closeMenu();
    });

    // Escape is zárja a menüt (külső billentyűzet, akadálymentesítés).
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && navMenu.classList.contains('active')) {
            closeMenu();
        }
    });
}

// ============================================================
// VISSZA A TETEJÉRE GOMB
// ============================================================
// A gombot innen hozzuk létre és fűzzük a body végére – így egyik publikus
// HTML fájlt sem kell módosítani, és mind a négy oldal (index, hir, hirek,
// 404) automatikusan megkapja. Az admin.html nem tölti be ezt a scriptet,
// ott tehát nem jelenik meg.
const BACK_TO_TOP_THRESHOLD = 400; // px – ennyi görgetés után bukkan elő

function initBackToTop() {
    if (!document.body || document.querySelector('.back-to-top')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'back-to-top';
    btn.setAttribute('aria-label', 'Vissza a tetejére');
    // Beágyazott SVG nyíl, nem Font Awesome ikon: a Font Awesome CSAK az
    // index.html-en van betöltve, a hir/hirek/404 oldalakon üres helyet
    // hagyna maga után.
    btn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M12 5 L5 12 M12 5 L19 12 M12 5 L12 20" fill="none" ' +
        'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" ' +
        'stroke-linejoin="round"/></svg>';
    document.body.appendChild(btn);

    btn.addEventListener('click', () => {
        // A rendszerszintű „kevesebb animáció" beállítást tiszteletben tartjuk
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });

    // A .visible osztály kapcsolja be a gombot. Mivel a küszöb a görgetési
    // pozícióhoz van kötve, egy a küszöbnél rövidebb oldalon (pl. 404) a gomb
    // sosem jelenik meg – ott nincs is mit visszagörgetni.
    const syncVisibility = () => {
        btn.classList.toggle('visible', window.scrollY > BACK_TO_TOP_THRESHOLD);
    };

    // passive: true – nem hívunk preventDefault-ot, így a görgetés gördülékeny marad
    window.addEventListener('scroll', syncVisibility, { passive: true });
    // Frissítéskor a böngésző visszaállíthatja a korábbi görgetési pozíciót,
    // ezért induláskor is egyeztetjük az állapotot
    syncVisibility();
}

// ============================================================
// OLDAL BETÖLTÉSE
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    // ── KARBANTARTÁS MÓD — mindennél előbb ──
    // A maintenance.js (a <head>-ben, defer nélkül) már elindította a
    // `maintenance_mode` kapcsoló lekérését, és ide teszi a promise-t.
    // Ha be van kapcsolva, ITT MEGÁLLUNK: nem indítunk egyetlen Supabase
    // lekérést sem, és nem is teszünk hozzá semmit a DOM-hoz (az
    // initBackToTop() például egy gombot fűzne a body végére, ami átlátszana
    // a karbantartás képernyőn).
    //
    // Azért promise-t várunk be, és nem egy egyszerű globális változót,
    // mert a válasz még nem biztos, hogy megjött, mire ide érünk.
    //
    // Az `if` azért kell, mert a maintenance.js hiánya (pl. ha valaki egy új
    // oldalról kifelejti a <script> tag-et) nem törhet el mindent – olyankor
    // egyszerűen a régi viselkedés marad.
    if (window.KGK_MAINTENANCE_READY) {
        const karbantartas = await window.KGK_MAINTENANCE_READY.catch(() => false);
        if (karbantartas) return;
    }

    initHamburger();
    initObserver();
    initBackToTop();
    // initCounters() NEM itt fut: a data-target a Supabase válaszából kerül a
    // DOM-ba, ezért a loadSiteContent() végén hívjuk meg. Ide visszatéve a
    // számlálók üres data-target-tel indulnának el.

    // A funkció-kapcsolók MINDEN publikus oldalon kellenek: az „Írj nekünk"
    // menüpont mindegyik nav-ban ott van.
    //
    // Szándékosan NEM await-eljük itt, hanem a többi loaderrel PÁRHUZAMOSAN
    // fut – különben minden szekció megvárná ezt az egy kérést, és lassulna
    // az egész oldal. A villanás ettől még kizárt: a kapcsolható szekciók a
    // HTML-ben `flag-pending` állapotban indulnak (shimmer látszik), és az
    // osztályt CSAK az applyFeatureFlags() veszi le, tehát az garantáltan a
    // válasz UTÁN történik.
    const flagsReady = loadFeatureFlags()
        .then(applyFeatureFlags)
        .catch(err => console.error('applyFeatureFlags hiba:', err));

    // Az intézményi partner-logók is MINDEN publikus oldalon kellenek: a
    // footer mind az ötben ott van. Ugyanúgy nincs await-elve, mint a
    // kapcsolóknál – párhuzamosan fut a többi lekéréssel, és a végén várjuk be.
    const partnersReady = loadInstitutionalPartners()
        .catch(err => console.error('loadInstitutionalPartners hiba:', err));

    const isArticlePage = document.querySelector('.article-container') !== null;
    const isIndexPage = document.querySelector('#hero') !== null;
    const isNewsArchivePage = document.querySelector('#hirek-archivum') !== null;

    if (isIndexPage) {
        const loaders = [loadSiteContent, loadAbout, loadTeam, loadGroups, loadEvents, loadNews, loadGolyaPdf, loadSponsors];
        await Promise.all(loaders.map(fn => fn().catch(err => console.error(`${fn.name} hiba:`, err))));
    }

    if (isArticlePage) {
        await loadArticle();
    }

    if (isNewsArchivePage) {
        await loadNewsArchive().catch(err => console.error('loadNewsArchive hiba:', err));
    }

    // A fenti loaderekkel párhuzamosan futottak, itt már csak bevárjuk – így a
    // DOMContentLoaded kezelő nem fejeződik be korábban, mint a kapcsolók.
    await flagsReady;
    await partnersReady;
});
