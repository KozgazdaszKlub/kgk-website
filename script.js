// ============================================================
// SUPABASE KONFIGURÁCIÓ
// ============================================================
const SUPABASE_URL = 'https://agdstsliixwysbjedppu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LXqTP-dPmfwWvd0IZTzrMw_tjYERBe9';

// Ha a hivas `count: true`-t kap, a visszateresi ertek { data, total } objektum,
// minden mas esetben - mint eddig - egy sima tomb.
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

    const res = await fetch(url, { headers });

    // 416-ot csak lapozasnal kaphatunk: a kert oldal a lista vegen tul van.
    // Ez nem hiba - a valos darabszam ilyenkor is megjon a Content-Range fejlecben.
    const overRange = count && res.status === 416;

    if (!res.ok && !overRange) {
        console.error(`Supabase hiba (${table}):`, res.status);
        return count ? { data: [], total: 0 } : [];
    }

    const data = overRange ? [] : await res.json();
    if (!count) return data;

    // A teljes darabszam a Content-Range fejlecben erkezik, pl. "0-8/42" vagy "*/42"
    const total = parseInt((res.headers.get('content-range') || '').split('/')[1], 10);
    return { data, total: Number.isFinite(total) ? total : data.length };
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

    const data = await supabaseFetch('about', { limit: 1 });
    if (!data.length) {
        container.innerHTML = emptyMessage('A Rólunk szöveg hamarosan elérhető...');
        return;
    }

    const about = data[0];
    container.innerHTML = `
        <div class="image-box hidden">
            <img id="rolunk-img" src="${about.image_url || 'images/Csopkép elnökség 24-25.jpg'}" alt="KGK Elnökség Csoportkép" onerror="this.onerror=null;this.src='images/Csopkép elnökség 24-25.jpg';">
        </div>
        <div class="text-box hidden">
            <p id="rolunk-text">${about.text || ''}</p>
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

    const data = await supabaseFetch('documents', { limit: 1, order: 'created_at.desc' });
    if (!data.length) return;

    const doc = data[0];
    btn.href = doc.file_url;
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
async function loadTeam() {
    const teamGrid = document.querySelector('.team-grid');
    if (!teamGrid) return;

    // Skeleton
    teamGrid.innerHTML = skeletonMemberCards(4);

    const members = await supabaseFetch('team_members', { order: 'sort_order.asc' });
    if (!members.length) { teamGrid.innerHTML = emptyMessage('Hamarosan bemutatjuk az elnökséget...'); return; }
    teamGrid.innerHTML = members.map((m, i) => `
        <div class="member-card hidden" style="transition-delay: ${i * 200}ms">
            <img src="${m.image_url || 'images/placeholder.svg'}" alt="${m.name}" onerror="this.onerror=null;this.src='images/placeholder.svg';">
            <h3>${m.name}</h3>
            <p>${m.position}</p>
            ${(m.facebook_url || m.instagram_url || m.linkedin_url) ? `
            <div class="socials">
                ${m.facebook_url ? `<a href="${m.facebook_url}" target="_blank"><i class="fab fa-facebook"></i></a>` : ''}
                ${m.instagram_url ? `<a href="${m.instagram_url}" target="_blank"><i class="fab fa-instagram"></i></a>` : ''}
                ${m.linkedin_url ? `<a href="${m.linkedin_url}" target="_blank"><i class="fab fa-linkedin"></i></a>` : ''}
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

    const groups = await supabaseFetch('groups', { order: 'sort_order.asc' });
    const mainGroups = groups.filter(g => g.type === 'main');
    const smallGroups = groups.filter(g => g.type === 'small');
    if (grids[0]) {
        grids[0].innerHTML = mainGroups.length ? mainGroups.map((g, i) => `
            <div class="group-card hidden" style="border-top: 5px solid ${g.color || '#08122b'}; transition-delay: ${i * 200}ms">
                <h3 style="margin-top: 20px;">${g.title}</h3>
                <p>${g.description || ''}</p>
            </div>
        `).join('') : emptyMessage('Hamarosan bemutatjuk a munkacsoportokat...');
    }
    if (grids[1]) {
        grids[1].innerHTML = smallGroups.length ? smallGroups.map((g, i) => `
            <div class="group-card hidden" style="border-top: 5px solid ${g.color || '#08122b'}; transition-delay: ${i * 200}ms">
                ${g.image_url ? `<img src="${g.image_url}" alt="${g.title} Logo" class="group-logo" onerror="this.style.display='none';">` : ''}
                <h3>${g.title}</h3>
                <p>${g.description || ''}</p>
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

    const events = await supabaseFetch('events', { order: 'date.asc' });

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
                    <h3>${e.title}</h3>
                    <p>${e.description || ''}</p>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// HÍR KÁRTYA (közös a főoldal és a hírarchívum között)
// ============================================================
function newsCardHtml(n, delay = 0) {
    return `
        <article class="news-item hidden" style="transition-delay: ${delay}ms">
            ${n.image_url ? `<img
                class="news-card-img"
                data-src="${n.image_url}"
                src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"
                alt="${n.title}"
                loading="lazy"
                onerror="this.style.display='none';">` : ''}
            <h3>${n.title}</h3>
            <p class="meta">${formatDateHu(n.date)}</p>
            <p>${n.excerpt || (n.content || '').replace(/<[^>]+>/g, '').substring(0, 120)}...</p>
            <a href="hir.html?slug=${n.slug}">Tovább olvasom &rarr;</a>
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

    const news = await supabaseFetch('news', { order: 'date.desc', limit: 3 });
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

    let result = await fetchNewsPage(page);
    const totalPages = Math.max(1, Math.ceil(result.total / NEWS_PER_PAGE));

    // Ha az URL-ben nagyobb oldalszám szerepel, mint ahány oldal van, az utolsót mutatjuk
    if (page > totalPages) {
        page = totalPages;
        result = await fetchNewsPage(page);
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

    const sponsors = await supabaseFetch('sponsors', { order: 'sort_order.asc' });
    if (!sponsors.length) {
        const section = document.getElementById('szponzorok');
        if (section) section.style.display = 'none';
        return;
    }

    function renderItems(list) {
        return list.map(s => {
            // A logó mellé kirakjuk a nevet is: alapból rejtve, csak akkor látszik,
            // ha a kép nem tölthető be (lásd initSponsorImages)
            const logo = `
                <img src="${s.logo_url}" alt="${s.name}" title="${s.name}">
                <span class="sponsor-name-fallback">${s.name}</span>`;
            return `
            <div class="sponsor-item">
                ${s.website_url
                    ? `<a href="${s.website_url}" target="_blank" rel="noopener noreferrer" class="sponsor-link">${logo}</a>`
                    : logo
                }
                <span class="sponsor-tooltip">${s.name}</span>
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
async function loadArticle() {
    const articleContainer = document.querySelector('.article-container');
    if (!articleContainer) return;

    // Skeleton azonnal
    articleContainer.innerHTML = skeletonArticle();

    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');
    if (!slug) { showArticleNotFound(articleContainer); return; }
    const results = await supabaseFetch('news', { eq: { column: 'slug', value: slug } });
    const article = results[0];
    if (!article) { showArticleNotFound(articleContainer); return; }
    document.title = `${article.title} | KGK`;

    // Galéria képek betöltése
    const galleryImages = await supabaseFetch('news_images', {
        select: 'image_url,sort_order',
        order: 'sort_order.asc',
        eq: { column: 'news_id', value: article.id }
    });

    // Galéria HTML
    let galleryHtml = '';
    if (galleryImages.length > 0) {
        const urls = galleryImages.map(img => img.image_url);
        const imgTags = urls.map((url, i) => `
            <img src="${url}" alt="Galéria kép ${i+1}" onclick='openLightbox(${JSON.stringify(urls).replace(/'/g,"&#39;")}, ${i})' onerror="this.style.display='none';">
        `).join('');

        galleryHtml = `
            <div class="article-gallery">
                <h3>Képgaléria</h3>
                <div class="gallery-slider-wrapper">
                    <div class="gallery-slider" id="gallery-slider" onscroll="updateGalleryNavBtns()">
                        ${imgTags}
                    </div>
                </div>
                ${urls.length > 1 ? `
                <div class="gallery-nav">
                    <button class="gallery-nav-btn" id="gallery-prev" onclick="scrollGallery(-1)" disabled>&#8249;</button>
                    <button class="gallery-nav-btn" id="gallery-next" onclick="scrollGallery(1)">&#8250;</button>
                </div>` : ''}
            </div>
        `;
    }

    articleContainer.innerHTML = `
        <p class="article-date">${formatDateHu(article.date)}</p>
        <h1>${article.title}</h1>
        ${article.image_url ? `<img src="${article.image_url}" alt="${article.title}" class="article-image" onerror="this.style.display='none';">` : ''}
        <div class="article-text">${article.content}</div>
        ${galleryHtml}
        <br><br>
        <a href="index.html#hirek" class="btn">← Vissza a hírekhez</a>
    `;

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
    if (!hamburger) return;

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
}

// ============================================================
// OLDAL BETÖLTÉSE
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    initHamburger();
    initObserver();
    // initCounters() NEM itt fut: a data-target a Supabase válaszából kerül a
    // DOM-ba, ezért a loadSiteContent() végén hívjuk meg. Ide visszatéve a
    // számlálók üres data-target-tel indulnának el.

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
});
