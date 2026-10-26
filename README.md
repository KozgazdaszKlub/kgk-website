# Közgazdász Klub (KGK) – weboldal

A kolozsvári Közgazdász Klub nyilvános weboldala: **https://kozgazdaszklub.com**

A tartalmat (hírek, elnökség, rendezvények, csoportok, szponzorok, Gólya
Kisokos stb.) egy saját admin felületen (`/admin.html`) lehet szerkeszteni,
programozói tudás nélkül. Az adatok a Supabase-ben vannak, a weboldal a
Vercelen fut.

- **Tartalomszerkesztőknek:** [ADMIN-UTMUTATO.md](ADMIN-UTMUTATO.md)
- **Üzemeltetés, kulcsok, vészhelyzet:** [OPERATIONS.md](OPERATIONS.md)

## Technológia

| Rész | Mi | Megjegyzés |
|---|---|---|
| Weboldal | sima HTML, CSS, JavaScript | **nincs build lépés, framework és bundler** |
| Adatbázis, bejelentkezés, fájlok | [Supabase](https://supabase.com) (Postgres + Auth + Storage) | a kód natív `fetch`-csel hívja a REST API-t, `supabase-js` nélkül |
| Hosting | [Vercel](https://vercel.com) | a statikus fájlok + 5 szerveroldali függvény (`api/`) |
| Monitorozás | UptimeRobot (ingyenes) + `/api/health` | beállítás: OPERATIONS.md, 7. pont |
| Ütemezett feladat | GitHub Actions | a Supabase ébren tartása (lásd OPERATIONS.md) |
| Betűtípusok | Inter, Montserrat – saját tárhelyről (`fonts/`, woff2, OFL licenc) | a `@font-face` a `style.css`-ben (az adminé a sajátjában); Google Fonts-ot egyik oldal sem tölt be |
| Külső | Font Awesome 6.4.0 (cdnjs, SRI hash-sel) | csak az `index.html` (és az admin) tölti be |

A `package.json` **kizárólag** az `api/` függvények npm-függősége
(`nodemailer`) miatt létezik. Nincs benne és ne is kerüljön bele `build`
script – akkor a Vercel nem a gyökérből szolgálná ki a HTML fájlokat.

## Mappastruktúra

```
index.html            főoldal (a szekciókat a script.js tölti fel)
hir.html              egy hír oldala (?slug=…)
hirek.html            hírarchívum lapozással
kapcsolat.html        kapcsolatfelvételi űrlap
adatvedelem.html      adatvédelmi tájékoztató
404.html              hibaoldal
admin.html            admin felület – önálló fájl, saját CSS és JS
script.js             a publikus oldalak teljes logikája (Supabase olvasás)
style.css             a publikus oldalak stílusa
maintenance.js        karbantartás mód (a <head> első scriptje)
favicon.ico, apple-touch-icon.png   ikonok – a gyökérben kell maradniuk
images/               statikus képek (logók, megosztási kép, tartalékképek)
fonts/                betűtípusok (Inter, Montserrat; woff2) + a licencük (OFL)
api/
  og-hir.js           /hir.html → megosztási (Open Graph) tagek, 404 nem létező hírnél
  sitemap.js          /sitemap.xml → futásidőben generált sitemap
  kapcsolat-submit.js a kapcsolat űrlap → e-mail (Gmail SMTP)
  health.js           /api/health → állapotjelzés a monitorozáshoz (200 / 503)
  csp-report.js       /api/csp-report → a CSP-jelentések egy-egy sora a Vercel naplóba
migrations/           kézzel futtatandó SQL scriptek (Supabase SQL Editor)
.github/workflows/    supabase-keepalive.yml – éjszakai ébren tartó lekérdezés
vercel.json           útvonalak, átirányítások, biztonsági fejlécek (köztük a CSP, egyelőre Report-Only)
.vercelignore         ami NEM kerül ki a weboldalra
robots.txt            keresőrobotoknak
```

## Helyi futtatás

Nincs mit buildelni: egy egyszerű statikus szerver elég a repó gyökeréből.

```bash
python -m http.server 8000
```

Utána: http://localhost:8000 és http://localhost:8000/admin.html

Tudnivalók:

- **Helyben is az ÉLES adatbázissal dolgozol.** A Supabase címe és a
  publikus kulcs a kódban van, külön teszt-adatbázis nincs. Ami helyben az
  adminban mentődik, az azonnal megjelenik a kozgazdaszklub.com-on is.
- **Ha élesben be van kapcsolva a karbantartás mód, helyben is a „Hamarosan
  érkezik" képernyő jön.** Az előnézeti link (lásd lent) helyben is működik,
  de a böngésző címenként jegyzi meg, tehát a `localhost`-on külön meg kell
  nyitni.
- **Statikus szerverrel az `api/` függvények nem futnak:** a kapcsolat űrlap
  nem küld, a `/sitemap.xml` 404, és a hír-oldal megosztási tagjei hiányoznak
  (maga a hír betölt, mert azt a böngésző tölti le). A függvényekhez a Vercel
  CLI kell (`vercel dev`, bejelentkezéssel és a projekt összekapcsolásával).
  Vigyázz: a `vercel env pull` egy `.env.local` fájlba írja a valódi
  titkokat. A `.gitignore` kizárja (`.env*.local`), de ne másold át más
  néven, és ne commitold `git add -f`-fel.
- Az `npm install` csak az `api/` függvényekhez kell.

## Deploy

1. Push a `main` ágra.
2. A Vercel magától telepít (általában fél perc – egy perc). Build lépés nincs:
   a gyökérben lévő fájlok statikusan, az `api/` fájlok függvényként mennek
   ki.
3. Ellenőrzés: a főoldal betölt, az admin bejelentkező képernyője megjelenik,
   a `/sitemap.xml` 200-at ad, a `/api/health` `{"status":"ok"}`-t ír, és a
   Vercel naplóban nincs új `csp-report:` sor (OPERATIONS.md, 8. pont).

- **Ami nem kerül ki a weboldalra:** a `.vercelignore` sorolja fel (pl.
  `migrations/`, `.github/`, a dokumentáció). A GitHubon ezek ettől még
  megvannak – a repó nyilvános.
- **Visszaállítás rossz deploy után:** lásd OPERATIONS.md → *Ha az oldal
  leáll*.
- **Adatbázis-változás (tábla, oszlop, jogosultság):** SQL scriptként a
  `migrations/` mappába, és kézzel kell lefuttatni a Supabase SQL Editorban.
  Automatikusan semmi nem futtatja őket.

## Környezeti változók és kulcsok

Értékek itt szándékosan nincsenek. Hogy hol vannak és hogyan cserélhetők:
OPERATIONS.md → *Kulcsok és titkok*.

| Név | Hol van beállítva | Ki használja | Titkos? |
|---|---|---|---|
| `SMTP_USER` | Vercel → Environment Variables | `api/kapcsolat-submit.js` – a küldő Gmail fiók | nem titok, de ne terjeszd |
| `SMTP_APP_PASSWORD` | Vercel → Environment Variables | `api/kapcsolat-submit.js` – Google alkalmazásjelszó | **igen** |
| `CONTACT_EMAIL_TO` | Vercel → Environment Variables | `api/kapcsolat-submit.js` – ide érkeznek az üzenetek | nem |
| `HEALTH_CHECK_TOKEN` | Vercel → Environment Variables (+ az UptimeRobot e-mail-figyelőjének címe) | `api/health.js` – a `?deep=1` (SMTP) ellenőrzés tokenje, min. 32 karakter | **igen** (kis tétű) |
| `SUPABASE_ANON_KEY` | GitHub → Settings → Secrets and variables → Actions | `.github/workflows/supabase-keepalive.yml` | nem titok (publikus kulcs) |
| Supabase URL + publikus (publishable) kulcs | a kódban, 6 fájlban | a weboldal, az admin és a függvények | **nem titok** – a táblákat a Supabase jogosultsági szabályai (RLS) védik |

Az `api/health.js` az `SMTP_USER`, `SMTP_APP_PASSWORD` és `CONTACT_EMAIL_TO`
változót is olvassa (a `?deep=1` mód ellenőrzi, hogy megvannak-e, és hogy a
Gmail-bejelentkezés sikerül-e).

- A Supabase **secret / `service_role` kulcsa soha nem kerülhet a kódba**, a
  Vercelre vagy a GitHubra.
- A `.env` fájl (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) egy régi
  maradvány: build lépés nélkül semmi nem olvassa. Gitignore-olt.

## Karbantartás mód és előnézeti link

- **Hol van a kapcsoló:** admin → *Szekciók* fül → *Karbantartás mód*
  (a `feature_flags` tábla `maintenance_mode` sora). Bekapcsolva minden
  publikus oldal a „Hamarosan érkezik" képernyőt mutatja. Az admin felület
  ilyenkor is elérhető.
- **Hogyan működik:** a `maintenance.js` minden publikus oldal `<head>`-jében
  az első script, `defer` nélkül. Lekérdezi a kapcsolót, és addig takarja az
  oldalt. **Csak egy kifejezett „be" érték kapcsol karbantartásra** – ha a
  lekérdezés hibázik vagy 3,5 másodpercnél tovább tart, a valódi oldal
  jelenik meg.
- **Előnézeti link:** `https://kozgazdaszklub.com/?preview=<érték>`. Az
  értéket a `maintenance.js` `BYPASS_VALUE` és az `admin.html`
  `MAINTENANCE_BYPASS_VALUE` konstansa tartalmazza (a kettőnek egyeznie kell),
  és az admin *Szekciók* fülén kész linkként kimásolható.
  - Elég egyszer megnyitni: a böngésző megjegyzi (`localStorage`,
    `kgk_maintenance_bypass` kulcs), és utána minden aloldalon a valódi oldalt
    mutatja.
  - Kikapcsolása: `?preview=ki` (vagy `?preview=off`).
  - **Ez nem jelszavas védelem**, csak arra való, hogy a véletlen látogató ne
    egy félkész oldalt lásson.

## Ismert buktatók röviden

1. **`vercel.json`: `routes` kell, nem `rewrites` / `redirects` / felső szintű
   `headers`.** A `/hir.html` és a `/sitemap.xml` csak így jut el a
   függvényekhez. A sorrend számít: elöl a két host-átirányítás (www,
   vercel.app), utána a fejléces bejegyzések `continue: true`-val, a végén a
   `dest`-es bejegyzések.
2. **A `hir.html` `<head>`-jébe ne kerüljön statikus description, `og:*`,
   `twitter:*`, canonical vagy JSON-LD** – ezeket hírenként az `api/og-hir.js`
   szúrja be az első `<title>` után.
3. **A piszkozat hírek kiszűrése kizárólag a Supabase jogosultsági
   szabályaiban (RLS) van.** A kliensbe és a függvényekbe ne kerüljön
   `is_published` szűrő.
4. **A `maintenance.js` nem kaphat `defer`-t**, és az `admin.html` soha nem
   töltheti be (különben karbantartás alatt az admin is elérhetetlen lenne).
5. **„Hiba esetén minden látszik":** a szekció-kapcsolók és a karbantartás
   mód csak kifejezett értékre rejt el bármit. Egy adatbázishiba soha ne
   tüntesse el a tartalmat.
6. **A publikus kulcs 6 fájlban van** (`script.js`, `admin.html`,
   `maintenance.js`, `api/og-hir.js`, `api/sitemap.js`, `api/health.js`) + a
   GitHub secretben. Cserénél mindegyiket (OPERATIONS.md).
7. **Az adminban minden tokenes kérés az `authFetch`-en, minden feltöltés az
   `uploadImage`-en, minden Storage-törlés a `deleteStorageFile`-on megy át.**
   Új kérést is ezekkel indíts – így működik a munkamenet automatikus
   frissítése és az egységes hibaüzenet.
8. **A Storage fájlnevek időbélyegesek, és 1 éves gyorsítótárat kapnak.**
   Ugyanazon a néven soha ne tölts fel más tartalmat – csere = új fájl.
9. **Új publikus oldalnál** fel kell venni: a canonical tag + `og:url`, az
   `api/sitemap.js` `STATIC_PAGES` listája, a `<main>` elem, és a `.vercelignore`
   ne zárja ki.
10. **A `.vercelignore`-ba soha ne kerüljön** `api/`, `.html` oldal (különösen
    a `hir.html`), `images/`, `fonts/`, a két ikon, `robots.txt`, `script.js`,
    `style.css`, `maintenance.js`, `vercel.json`, `package*.json`.
11. **SQL-t csak kézzel, a Supabase SQL Editorban futtatunk.** Új táblához
    RLS policy-k ÉS explicit `GRANT` is kell, ugyanabban a scriptben.
12. **A `migrations/` mappa nincs gitignore-olva** – commitolásnál mindig
    explicit fájlnévvel stage-elj (`git add <fájl>`), ne `git add .`-tal.
13. **Sorvégek:** a `.gitattributes` minden szöveges fájlt LF-re állít.
14. **Betűtípus-csere = új fájlnév.** A `fonts/` woff2 fájljai 1 éves,
    `immutable` gyorsítótárat kapnak (`vercel.json`), ezért ugyanazon a néven
    soha ne tegyél fel más fájlt. Fájlnév-változásnál a `style.css` (és az
    `admin.html`) `@font-face` szabályait és a hat HTML `preload` sorát is
    át kell írni.
15. **Új külső forrásnál a CSP-t is bővíteni kell.** A `vercel.json`
    `Content-Security-Policy-Report-Only` fejléce felsorolja, honnan jöhet
    script, stílus, kép, betűtípus és `fetch` (ma: a saját domain, a
    Supabase projekt címe és a cdnjs). Egy új külső forrás (pl. beágyazott
    videó, analitika, másik CDN) ma még működik, de minden betöltésnél egy
    `csp-report:` sort ír a Vercel naplóba – és ha a CSP egyszer élesítve lesz,
    nem töltődne be. Ugyanez igaz, ha a Supabase projekt címe változna. A
    jelentések olvasása: OPERATIONS.md, 8. pont.
