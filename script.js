// ============================================================
// SUPABASE KONFIGURÁCIÓ
// ============================================================
const SUPABASE_URL = 'https://agdstsliixwysbjedppu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LXqTP-dPmfwWvd0IZTzrMw_tjYERBe9';

async function supabaseFetch(table, options = {}) {
    const { select = '*', order = null, limit = null, eq = null } = options;
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}`;
    if (order) url += `&order=${order}`;
    if (limit) url += `&limit=${limit}`;
    if (eq) url += `&${eq.column}=eq.${eq.value}`;
    const res = await fetch(url, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        }
    });
    if (!res.ok) { console.error(`Supabase hiba (${table}):`, res.status); return []; }
    return res.json();
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
// ELNÖKSÉG BETÖLTÉSE
// ============================================================
async function loadTeam() {
    const teamGrid = document.querySelector('.team-grid');
    if (!teamGrid) return;

    // Skeleton
    teamGrid.innerHTML = skeletonMemberCards(4);

    const members = await supabaseFetch('team_members', { order: 'id.asc' });
    if (!members.length) { teamGrid.innerHTML = emptyMessage('Hamarosan bemutatjuk az elnökséget...'); return; }
    teamGrid.innerHTML = members.map((m, i) => `
        <div class="member-card hidden" style="transition-delay: ${i * 200}ms">
            <img src="${m.image_url || 'images/placeholder.jpg'}" alt="${m.name}" onerror="this.onerror=null;this.src='images/placeholder.jpg';">
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

    const groups = await supabaseFetch('groups', { order: 'id.asc' });
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
// HÍREK BETÖLTÉSE (főoldalon)
// ============================================================
async function loadNews() {
    const newsGrid = document.querySelector('.news-grid');
    if (!newsGrid) return;

    newsGrid.innerHTML = skeletonNewsItems(3);

    const news = await supabaseFetch('news', { order: 'date.desc', limit: 3 });
    if (!news.length) { newsGrid.innerHTML = emptyMessage('Hamarosan érkeznek a híreink...'); return; }
    newsGrid.innerHTML = news.map((n, i) => `
        <article class="news-item hidden" style="transition-delay: ${i * 200}ms">
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
    `).join('');

    // Lazy load a news kártya képeknél
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

    newsGrid.querySelectorAll('img[data-src]').forEach(img => imgObserver.observe(img));
    initObserver();
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

    const sponsors = await supabaseFetch('sponsors', { order: 'id.asc' });
    if (!sponsors.length) {
        const section = document.getElementById('szponzorok');
        if (section) section.style.display = 'none';
        return;
    }

    function renderItems(list) {
        return list.map(s => `
            <div class="sponsor-item">
                ${s.website_url
                    ? `<a href="${s.website_url}" target="_blank" rel="noopener noreferrer" class="sponsor-link">
                           <img src="${s.logo_url}" alt="${s.name}" title="${s.name}" loading="lazy" onerror="this.closest('.sponsor-item').style.display='none';">
                       </a>`
                    : `<img src="${s.logo_url}" alt="${s.name}" title="${s.name}" loading="lazy" onerror="this.closest('.sponsor-item').style.display='none';">`
                }
                <span class="sponsor-tooltip">${s.name}</span>
            </div>
        `).join('');
    }

    // Először statikus középre igazított módban rendereljük
    track.classList.remove('scrolling');
    if (belt) belt.classList.remove('scrolling');
    track.innerHTML = renderItems(sponsors);

    // Egy frame után megnézzük kell-e scroll
    requestAnimationFrame(() => {
        const beltWidth = belt ? belt.offsetWidth : window.innerWidth;
        const trackWidth = track.scrollWidth;

        if (trackWidth > beltWidth * 0.85) {
            // Túl sok szponzor: scrollozó módba váltunk, duplikálással
            track.classList.add('scrolling');
            if (belt) belt.classList.add('scrolling');
            track.innerHTML = renderItems([...sponsors, ...sponsors]);
        }
    });
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
    if (!slug) { articleContainer.innerHTML = '<p>Hír nem található.</p>'; return; }
    const results = await supabaseFetch('news', { eq: { column: 'slug', value: slug } });
    const article = results[0];
    if (!article) { articleContainer.innerHTML = '<p>Ez a hír nem létezik.</p>'; return; }
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
            <img src="${url}" alt="Galéria kép ${i+1}" onclick="openLightbox(${JSON.stringify(urls)}, ${i})" onerror="this.style.display='none';">
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
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });
    document.querySelectorAll('.nav-links a').forEach(n => n.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
    }));
}

// ============================================================
// OLDAL BETÖLTÉSE
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    initHamburger();
    initObserver();
    initCounters();

    const isArticlePage = document.querySelector('.article-container') !== null;
    const isIndexPage = document.querySelector('#hero') !== null;

    if (isIndexPage) {
        const loaders = [loadAbout, loadTeam, loadGroups, loadEvents, loadNews, loadGolyaPdf, loadSponsors];
        await Promise.all(loaders.map(fn => fn().catch(err => console.error(`${fn.name} hiba:`, err))));
    }

    if (isArticlePage) {
        await loadArticle();
    }
});
