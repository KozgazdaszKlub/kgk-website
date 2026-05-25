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
// RÓLUNK BETÖLTÉSE
// ============================================================
async function loadAbout() {
    const textEl = document.getElementById('rolunk-text');
    const imgEl = document.getElementById('rolunk-img');
    if (!textEl) return;

    const data = await supabaseFetch('about', { limit: 1 });
    if (!data.length) return;

    const about = data[0];
    textEl.textContent = about.text;
    if (about.image_url && imgEl) {
        imgEl.src = about.image_url;
    }
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
    const members = await supabaseFetch('team_members', { order: 'id.asc' });
    if (!members.length) return;
    teamGrid.innerHTML = members.map((m, i) => `
        <div class="member-card hidden" style="transition-delay: ${i * 200}ms">
            <img src="${m.image_url || 'images/placeholder.jpg'}" alt="${m.name}">
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
    const groups = await supabaseFetch('groups', { order: 'id.asc' });
    const mainGroups = groups.filter(g => g.type === 'main');
    const smallGroups = groups.filter(g => g.type === 'small');
    if (grids[0] && mainGroups.length) {
        grids[0].innerHTML = mainGroups.map((g, i) => `
            <div class="group-card hidden" style="border-top: 5px solid ${g.color || '#08122b'}; transition-delay: ${i * 200}ms">
                <h3 style="margin-top: 20px;">${g.title}</h3>
                <p>${g.description}</p>
            </div>
        `).join('');
    }
    if (grids[1] && smallGroups.length) {
        grids[1].innerHTML = smallGroups.map((g, i) => `
            <div class="group-card hidden" style="border-top: 5px solid ${g.color || '#08122b'}; transition-delay: ${i * 200}ms">
                ${g.image_url ? `<img src="${g.image_url}" alt="${g.title} Logo" class="group-logo">` : ''}
                <h3>${g.title}</h3>
                <p>${g.description}</p>
            </div>
        `).join('');
    }
    initObserver();
}

// ============================================================
// RENDEZVÉNYEK BETÖLTÉSE
// ============================================================
async function loadEvents() {
    const eventsGrid = document.querySelector('.events-grid');
    if (!eventsGrid) return;
    const events = await supabaseFetch('events', { order: 'date.asc' });
    if (!events.length) return;
    eventsGrid.innerHTML = events.map(e => {
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
    const news = await supabaseFetch('news', { order: 'date.desc', limit: 3 });
    if (!news.length) return;
    newsGrid.innerHTML = news.map((n, i) => `
        <article class="news-item hidden" style="transition-delay: ${i * 200}ms">
            <h3>${n.title}</h3>
            <p class="meta">${formatDateHu(n.date)}</p>
            <p>${n.excerpt || n.content.substring(0, 120)}...</p>
            <a href="hir.html?slug=${n.slug}">Tovább olvasom &rarr;</a>
        </article>
    `).join('');
    initObserver();
}

// ============================================================
// HÍR OLDAL BETÖLTÉSE (hir.html)
// ============================================================
async function loadArticle() {
    const articleContainer = document.querySelector('.article-container');
    if (!articleContainer) return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');
    if (!slug) { articleContainer.innerHTML = '<p>Hír nem található.</p>'; return; }
    const results = await supabaseFetch('news', { eq: { column: 'slug', value: slug } });
    const article = results[0];
    if (!article) { articleContainer.innerHTML = '<p>Ez a hír nem létezik.</p>'; return; }
    document.title = `${article.title} | KGK`;
    articleContainer.innerHTML = `
        <p class="article-date">${formatDateHu(article.date)}</p>
        <h1>${article.title}</h1>
        ${article.image_url ? `<img src="${article.image_url}" alt="${article.title}" class="article-image">` : ''}
        <div class="article-text">${article.content}</div>
        <br><br>
        <a href="index.html#hirek" class="btn">← Vissza a hírekhez</a>
    `;
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
        await Promise.all([
            loadAbout(),
            loadTeam(),
            loadGroups(),
            loadEvents(),
            loadNews(),
            loadGolyaPdf(),
        ]);
    }

    if (isArticlePage) {
        await loadArticle();
    }
});
