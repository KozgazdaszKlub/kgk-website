# AUDIT — `images/` mappa (statikus képek felmérése)

**Dátum:** 2026-08-28
**Állapot:** ✅ **VÉGREHAJTVA** — a felmérés megtörtént, és a törlés is (lásd a
**8. pontot** a végén). Az 1–7. pont a törlés ELŐTTI állapotot írja le, azért
maradt változatlanul, hogy a döntés indoklása visszakereshető legyen.
**Módszer:** teljes kódbázis-átvizsgálás + git history + élő Supabase adatellenőrzés.

---

## 0. Vezetői összefoglaló

A mappában **19 fájl** van, összesen **39,67 MB**.

| Kategória | Fájlok | Méret | Arány |
|---|---:|---:|---:|
| **SZÜKSÉGES** | 4 | 2,29 MB | 5,8 % |
| **BIZONYTALAN** | 1 | 0,64 MB | 1,6 % |
| **FELESLEGESNEK TŰNIK** | 14 | **36,73 MB** | **92,6 %** |
| Összesen | 19 | 39,67 MB | 100 % |

Röviden: a mappa **több mint 92 %-a olyan fájl, amire a kódban sehol nincs
hivatkozás, és a git történetében sem volt soha.** Mindössze 4 kép tartja
életben a weboldalt.

---

## 1. Hogyan mértem (hogy ellenőrizhető legyen)

1. **Közvetlen szövegkeresés**: minden fájlnévre rákerestem az összes
   `.html`, `.css`, `.js`, `.json`, `.xml`, `.txt`, `.yml`, `.sql` fájlban.
2. **Teljes `src`/`href` leltár**: kigyűjtöttem az ÖSSZES helyi (nem `http`)
   `src=` és `href=` értéket minden HTML-ből — így az sem maradhatott ki, ami
   `images/` előtag nélkül hivatkozna egy fájlra.
3. **CSS háttérképek**: `url(` és `background-image` keresés. **A `style.css`-ben
   egyetlen `url()` sincs** — tehát CSS-ből egyetlen kép sem töltődik.
4. **Dinamikus útvonal-építés**: kerestem `'images/' + valami` jellegű
   összefűzést. Nincs ilyen; az üres `src=""` találatok mind admin-előnézetek és
   a lightbox, ezeket felhasználói feltöltés tölti meg.
5. **URL-kódolt hivatkozások**: `%20`, `%C3`, `%C5` keresés (pl.
   `Csopk%C3%A9p`). Nincs találat.
6. **Git history**: `git log -S` és `git grep` **az összes commitra** —
   megnéztem, hogy a most nem hivatkozott fájlokra volt-e valaha hivatkozás.
7. **Élő adatbázis-ellenőrzés**: read-only GET a Supabase REST API-ra (anon
   kulcs), hogy kiderüljön, a fallback képek ténylegesen látszanak-e most.

---

## 2. Részletes táblázat

| Fájlnév | Méret | Hivatkozva-e kódból? | Hol (fájl:sor)? | Kategória |
|---|---:|---|---|---|
| `Copy of kgk_feher.ico` | 2 966 B (2,90 KB) | **IGEN** — 6 hivatkozás | `index.html:7`, `hir.html:7`, `hirek.html:7`, `kapcsolat.html:8`, `404.html:9`, `admin.html:7` | **SZÜKSÉGES** |
| `Copy of kgk_feher.png` | 35 868 B (35,03 KB) | **IGEN** — 9 hivatkozás | nav: `index.html:18`, `hirek.html:17`, `kapcsolat.html:18`, `404.html:19`, `hir.html:175` · footer: `index.html:194`, `hirek.html:51`, `kapcsolat.html:134`, `404.html:54` | **SZÜKSÉGES** |
| `Csopkép elnökség 24-25.jpg` | 2 365 601 B (2,26 MB) | **IGEN** — 3 hivatkozás | `index.html:50` (statikus kezdőérték) · `script.js:252` (fallback **és** `onerror`) | **SZÜKSÉGES** |
| `placeholder.svg` | 640 B | **IGEN** — 4 hivatkozás | `script.js:350` (fallback + `onerror`) · `admin.html:2775` (fallback + `onerror`) | **SZÜKSÉGES** |
| `Csillag_István.PNG` | 668 525 B (652,86 KB) | **NEM** — sehol, soha | — | **BIZONYTALAN** (lásd 4. pont) |
| `Lukács Lilla.jpg` | 22 425 976 B (21,39 MB) | **NEM** — sehol, soha | — | FELESLEGESNEK TŰNIK |
| `Kádár Andrea.jpg` | 12 288 656 B (11,72 MB) | **NEM** — sehol, soha | — | FELESLEGESNEK TŰNIK |
| `Soó Zoltán-Attila.jpg` | 2 625 976 B (2,50 MB) | **NEM** — sehol, soha | — | FELESLEGESNEK TŰNIK |
| `KGKx_logo_szines.png` | 457 127 B (446,41 KB) | **NEM** — sehol, soha | — | FELESLEGESNEK TŰNIK |
| `KGKx_logo_feher.png` | 262 737 B (256,58 KB) | **NEM** — sehol, soha | — | FELESLEGESNEK TŰNIK |
| `KGKx_logo_fekete.png` | 238 368 B (232,78 KB) | **NEM** — sehol, soha | — | FELESLEGESNEK TŰNIK |
| `KGCare színskála.png` | 54 961 B (53,67 KB) | **NEM** — sehol, soha | — | FELESLEGESNEK TŰNIK |
| `Copy of KGCharityRed.png` | 36 667 B (35,81 KB) | **NEM** — sehol, soha | — | FELESLEGESNEK TŰNIK |
| `Copy of KGCharity.png` | 36 350 B (35,50 KB) | **NEM** — sehol, soha | — | FELESLEGESNEK TŰNIK |
| `Szőcs-Pál Norbert.jpg` | 33 512 B (32,73 KB) | **NEM** — sehol, soha | — | FELESLEGESNEK TŰNIK |
| `KGKx.png` | 28 751 B (28,08 KB) | **NEM** — sehol, soha | — | FELESLEGESNEK TŰNIK |
| `FEHER (1).png` | 12 386 B (12,10 KB) | **NEM** — sehol, soha | — | FELESLEGESNEK TŰNIK |
| `Copy of kgk_fekete.jpg` | 11 727 B (11,45 KB) | **NEM** — sehol, soha | — | FELESLEGESNEK TŰNIK |
| `IMG_1698.PNG` | 6 327 B (6,18 KB) | **NEM** — sehol, soha | — | FELESLEGESNEK TŰNIK |

> A „sehol, soha" azt jelenti: sem a mai kódban, sem a git történet **egyetlen
> korábbi commitjában** nincs rájuk hivatkozás. Ezeket a `f38d581 Add files via
> upload` commit töltötte fel egyszerre, és azóta senki nem nyúlt hozzájuk.

---

## 3. A négy SZÜKSÉGES fájl — megerősítés konkrét kóddal

A feladatban felsorolt „valószínűleg szükséges" tételeket **mind a négyet
megerősítem**, konkrét kódhivatkozással:

### 3.1 Logó — `Copy of kgk_feher.png` — MEGERŐSÍTVE

A nav és a footer logója, 9 helyen. Két pontosítás:

- A **`hir.html`-ben CSAK a nav-ban van** (175. sor), a footerében nincs logó.
- Az **`admin.html` egyáltalán nem használja** — ott a bejelentkező logó egy
  sima szöveges elem (`admin.html:1192`: `<div class="login-logo">KGK</div>`).

### 3.2 Favicon — `Copy of kgk_feher.ico` — MEGERŐSÍTVE

Mind a **hat** HTML betölti, az `admin.html`-t is beleértve.
A `404.html` **abszolút úton** hivatkozza (`/images/...`), a többi relatívan —
ez szándékos, mert a 404 bármilyen mélységű URL-en előjöhet.

### 3.3 Placeholder — `placeholder.svg` — MEGERŐSÍTVE, és fontosabb, mint hittük

Két helyen fallback, mindkettő `||` ággal **és** `onerror` ággal:

- `script.js:350` — publikus elnökség-kártyák
- `admin.html:2775` — admin elnökség-lista

**Élő adat (Supabase, 2026-08-28):** a `team_members` táblában **5 tag van, és
MINDEGYIK `image_url` mezője `null`.**

```
Csillag István        -> image_url: null
Zonda Endre-István    -> image_url: null
Németi Zsolt          -> image_url: null
Koncz Gergő           -> image_url: null
Mészáros Renáta       -> image_url: null
```

Vagyis ez **nem ritka vészhelyzeti tartalék**: jelenleg az elnökség szekció
**mind az 5 kártyáján ez a kép látszik**, a főoldalon és az adminban is.
Ha törlődik, az egész elnökség szekció törött képikonokat mutat.

### 3.4 `#rolunk` kezdőkép — `Csopkép elnökség 24-25.jpg` — MEGERŐSÍTVE, és ez is ÉLŐ

Igen, valóban ott van statikusan az `index.html:50`-en, a Supabase-ből jövő
dinamikus kép ellenére — pontosan úgy, ahogy a feladat feltételezte. **De több
is igaz ennél:**

**Élő adat (Supabase, 2026-08-28):** az `about` tábla egyetlen sorában az
`image_url` mező **`null`**.

Tehát a `script.js:252` fallback ága sül el, és a végleges, felhasználó által
látott kép is **ugyanez a fájl**. Nem csak „villanásvédelem" — ez a Rólunk
szekció **tényleges, végleges képe** most.

---

## 4. A BIZONYTALAN eset — `Csillag_István.PNG`

**Miért nem soroltam a feleslegesek közé, pedig nulla kódhivatkozása van:**

A `team_members` tábla első sora **Csillag István**, aki tehát **jelenlegi
elnökségi tag** — és a képe **még nincs feltöltve** (`image_url: null`).
A repóban viszont ott van egy `Csillag_István.PNG` nevű, 653 KB-os fájl.

Ez erősen valószínűsíti, hogy ez **egy jelenlegi tag portréja, amit még nem
töltöttek fel az admin felületen keresztül**. Ha most törlődik, és később
Zsolti fel akarja tölteni Csillag István képét, a forrásfájl már nem lesz meg
a repóban.

**Emberi döntés kell:** van-e ez a kép máshol is (telefon, Google Drive,
OneDrive)? Ha igen, nyugodtan törölhető. Ha nem, érdemes előbb feltölteni az
adminon keresztül, és **csak utána** törölni.

**A másik négy személynevű fájl** (`Kádár Andrea`, `Lukács Lilla`,
`Soó Zoltán-Attila`, `Szőcs-Pál Norbert`) **nem szerepel a jelenlegi
`team_members` listában** — ezek a korábbi (24-25-ös) elnökség tagjai. Náluk
ez a kockázat nem áll fenn, ezért kerültek a „feleslegesnek tűnik"
kategóriába. Ugyanakkor ezek is **archív értékkel bírhatnak** (lásd 6. pont).

---

## 5. Amit külön ellenőriztem, és NEM találtam

Ezeket azért írom le, hogy látszódjon: nem csak egy egyszerű keresést futtattam.

| Ellenőrzés | Eredmény |
|---|---|
| CSS háttérkép (`url(...)`) | **Nincs egyetlen `url()` sem a `style.css`-ben** |
| Dinamikus útvonal-összefűzés | Nincs |
| URL-kódolt hivatkozás (`%20`, `%C3%A9`) | Nincs |
| Hivatkozás `images/` előtag nélkül | Nincs (teljes `src`/`href` leltár alapján) |
| `vercel.json` | Csak a `/hir.html` -> `/api/og-hir` útvonal, kép nincs |
| `sitemap.xml`, `robots.txt` | Nincs képhivatkozás |
| `.github/workflows/supabase-keepalive.yml` | Nincs képhivatkozás |
| `api/og-hir.js` — `DEFAULT_OG_IMAGE` | **Üres string** — jelenleg nem használ semmilyen statikus képet. A 44–46. sor kommentje viszont egy jövőbeli `images/og-default.jpg`-t javasol → ez később ÚJ fájl lenne, nem a meglévők valamelyike |
| `api/kapcsolat-submit.js` | Nincs képhivatkozás |
| Supabase DB (`groups`, `sponsors`, `news`) | **Egyetlen `image_url` / `logo_url` sem mutat lokális `images/` útvonalra** — mind Storage URL vagy `null` |
| Git: törölt fájlok a mappából | Soha egyetlen fájlt sem töröltek innen |
| Git: fájlok módosítása | Egyik kép sem lett soha módosítva (fájlonként pontosan 1 blob) |

---

## 6. Összegzés és javaslat

### Mennyi a nyereség?

| | Most | Törlés után | Változás |
|---|---:|---:|---:|
| `images/` mappa | 39,67 MB | **2,93 MB** | **−36,73 MB (−92,6 %)** |
| Fájlok száma | 19 | 5 | −14 |

*(A „törlés után" a 14 feleslegesnek tűnő fájl törlésével számol; a bizonytalan
`Csillag_István.PNG` benne marad. Ha az is megy, 2,29 MB / 4 fájl marad.)*

### FIGYELMEZTETÉS a repó méretéről

**A `git rm` NEM csökkenti a `.git` mappa méretét.** A `.git` jelenleg 40 MB,
és a törölt fájlok **bennmaradnak a git történetében örökre**. Egy friss
`git clone` továbbra is ~40 MB-ot töltene le.

A történet valódi megtisztításához `git filter-repo` vagy BFG kellene +
`--force` push. Ez **átírja a git történetét egy publikus repóban** — ez
külön, tudatos döntés, és nem tartozik ehhez a körhöz. **Nem javaslom
mellékesen elvégezni.**

### Amiben viszont VAN azonnali, valódi nyereség

1. **Vercel deploy**: minden deploy a teljes munkakönyvtárat viszi. 36,73 MB-tal
   kisebb csomag = gyorsabb deploy.
2. **Áttekinthetőség**: 19 fájl helyett 5, és mindegyikről tudni, mire való.
   Ez pontosan a projekt fő célját szolgálja („olyan ember is tudja kezelni,
   akinek nulla köze van a programozáshoz").
3. **Véletlen hivatkozás elkerülése**: most bárki beírhatna egy `<img>`-et egy
   22 MB-os fájlra, és észre sem venné.

### Javasolt sorrend a következő (törlési) körre

1. **Előbb tisztázni a `Csillag_István.PNG` sorsát** — van-e róla máshol
   másolat, vagy fel kell tölteni az adminba.
2. **A 3 nagy fájl a fő nyeremény**: `Lukács Lilla.jpg` (21,39 MB),
   `Kádár Andrea.jpg` (11,72 MB), `Soó Zoltán-Attila.jpg` (2,50 MB) — egyedül
   ez a három **35,61 MB**, vagyis a teljes megtakarítás **97 %-a**.
3. **Archiválás törlés előtt**: a személynevű képek és a KGKx / KGCharity /
   KGCare logók valószínűleg a szervezet arculati anyagai. Érdemes egy Drive
   vagy OneDrive mappába átmenteni őket, mielőtt kikerülnek a repóból — a
   repó nem jó archívum, de attól még kellhetnek valakinek.

---

## 7. Külön észrevétel (nem tartozik a törléshez, de itt jött elő)

**A `Csopkép elnökség 24-25.jpg` 2,26 MB, és MINDEN főoldal-betöltéskor
letöltődik.** Nem törölhető (aktívan ez látszik), de ez jelenleg a főoldal
messze legnagyobb egyedi letöltése.

Két lehetséges kezelés, **külön körben**:

- Zsolti feltölt egy tömörített változatot az adminon a Rólunk szekcióhoz
  (az admin úgyis tömörít: max 1400px, q=0,82) → utána a statikus fájl már
  csak villanásvédelem lenne.
- Vagy magát a repóban lévő fájlt cseréljük le egy tömörítettre.

**Latens csapda:** ha egyszer bekerül egy Supabase-kép a Rólunk szekcióhoz, az
`index.html:50` statikus képe **akkor is letöltődik** (a böngésző előbb tölti,
mint ahogy a JS lecserélné) — vagyis onnantól 2,26 MB tiszta pazarlás lenne.
Ezért érdemes a fájlt akkor is lecsökkenteni, ha a Supabase-be feltöltött kép
lesz a végleges.

---

## 8. ZÁRÓ BEJEGYZÉS — a törlés végrehajtva (2026-08-28)

Zsolti jóváhagyta **mind a 15 fájl** törlését: a 14 „feleslegesnek tűnik"
tételt **és** a bizonytalan `Csillag_István.PNG`-t is. Utóbbit tudatos
döntéssel — a képet később az admin felületen keresztül tölti fel, a
forrásfájl elvesztését vállalva.

### Mi történt

| | Érték |
|---|---|
| Törölt fájlok | **15** |
| Felszabadult hely a munkafában | **39 188 046 B = 37,37 MB** |
| `images/` mérete előtte → utána | 39,67 MB → **2,29 MB** (−94,2 %) |
| Fájlok száma előtte → utána | 19 → **4** |
| Módosított kód-fájl | **0 db** (egyetlen `.html` / `.css` / `.js` sem) |
| Az utolsó commit, ahol a fájlok MÉG megvoltak | **`c9a22b5`** |

> **Megjegyzés a számokhoz:** a 0. pont 36,73 MB-ot ír a „feleslegesnek tűnik"
> kategóriára (14 fájl). A ténylegesen törölt 37,37 MB ennél több, mert
> tartalmazza a bizonytalan `Csillag_István.PNG`-t is (0,64 MB).

### A 15 törölt fájl

`Csillag_István.PNG` · `Lukács Lilla.jpg` · `Kádár Andrea.jpg` ·
`Soó Zoltán-Attila.jpg` · `KGKx_logo_szines.png` · `KGKx_logo_feher.png` ·
`KGKx_logo_fekete.png` · `KGCare színskála.png` · `Copy of KGCharityRed.png` ·
`Copy of KGCharity.png` · `Szőcs-Pál Norbert.jpg` · `KGKx.png` ·
`FEHER (1).png` · `Copy of kgk_fekete.jpg` · `IMG_1698.PNG`

### A 4 megmaradt fájl (érintetlen)

`Copy of kgk_feher.ico` · `Copy of kgk_feher.png` ·
`Csopkép elnökség 24-25.jpg` · `placeholder.svg`

### Törlés előtti újraellenőrzés

A törlés előtt megismételtem a teljes keresést mind a 15 fájlra (HTML, CSS, JS,
JSON, XML, TXT, YML, SQL). **Mind a 15 fájl: 0 találat** — az audit elkészülte
óta senki nem adott hozzá új hivatkozást. Emellett újra lefuttattam a teljes
`src`/`href` leltárt és a CSS `url()` keresést is: változatlan az eredmény.

### Törlés utáni tesztelés

**1. Statikus feloldás.** Minden kódban hivatkozott `images/` útvonalat
feloldottam fájlrendszerre. Mind a 4 valós hivatkozás megvan. Egyetlen
„hiányzó" találat az `images/og-default.jpg` volt az `api/og-hir.js:46`-on —
ez egy **`//` kommentben szereplő példa**, a `DEFAULT_OG_IMAGE` értéke üres
string, és ez a fájl **soha nem is létezett** a repóban (git history igazolja).
Nem törés.

**2. Böngészős teszt (headless Chrome + CDP).** Helyi HTTP szerverrel
kiszolgálva betöltöttem mind a 6 oldalt (`index`, `hirek`, `kapcsolat`,
`hir`, `404`, `admin`), és megmértem minden `<img>` `naturalWidth` értékét,
valamint a hálózati hibákat. Eredmény: **22 kép, 0 törött, 0 saját 404.**
A böngésző ténylegesen csak ezt a 4 fájlt kérte le, mind `200`-zal.

**3. Kontroll-futás (ez a lényeg).** Ugyanezt a tesztet lefuttattam egy külön
`git worktree`-ben a **törlés előtti `c9a22b5` állapoton is**, ahol mind a 19
kép megvolt. Az eredmény **karakterre azonos**: ugyanaz a 22 kép, ugyanaz a
2 ismert, a törléstől független jelenség, és a böngésző **ott is csak ugyanezt
a 4 fájlt kérte le**. Ez bizonyítja, hogy a 15 törölt fájlt egyetlen oldal sem
töltötte be soha — a törlés előtt sem.

> A két „hibának" tűnő tétel mindkét futásban azonos, és nem a törléshez
> kapcsolódik:
> - `hir.html:205` — a lightbox `<img ... src="">` üres forrással; a böngésző
>   ilyenkor magát az oldal URL-jét próbálja képként betölteni. Rejtett elem,
>   kattintásra kap valódi `src`-t. **HEAD-en is pontosan így viselkedik.**
> - a `404.html` melletti `HTTP 404` a teszt **saját, szándékos** kérése egy
>   nem létező URL-re, hogy a 404 oldal előjöjjön — vagyis helyes működés.

### Visszaállítás, ha valaha kellene

A fájlok **nem vesztek el véglegesen**: a git történetben ott maradnak.
A `c9a22b5` az utolsó commit, ahol még megvoltak, tehát egyetlen fájl így
hozható vissza:

```bash
git checkout c9a22b5 -- "images/Csillag_István.PNG"
```

Az egész mappa törlés előtti állapota így nézhető meg:

```bash
git show c9a22b5 --stat -- images/
```

**De ez nem kényelmes visszaállítási út**, és nem is szabad annak tekinteni:

- Egy nem programozó számára ez nem járható — parancssort és git-ismeretet
  igényel. A projekt fő célja pont az, hogy Zsolti kódolás nélkül boldoguljon.
- A fájlnevek ékezetesek és szóközösek, ezért **kötelező az idézőjel** —
  enélkül a parancs némán nem azt csinálja, amit várnál.
- Ha a történetet valaha megtisztítjuk (lásd lentebb), ez az út **végleg
  megszűnik**.

**Ezért: ha ezek a képek bármelyike értékes, a helyes megoldás egy rendes
archívum** (Google Drive / OneDrive mappa), nem a git history.

### Amit ez a commit NEM old meg

**A `.git` mappa mérete nem csökkent.** A törölt blobok bennmaradnak a
történetben, tehát egy friss `git clone` továbbra is ~40 MB. Ami valóban
javult: minden jövőbeli **checkout és Vercel deploy 37,37 MB-tal kisebb**.

A történet valódi megtisztításához `git filter-repo` vagy BFG kellene +
`--force` push. Ez **átírja egy publikus repó történetét** (minden korábbi
commit hash megváltozik), ezért külön, tudatos döntés — **ebben a körben
szándékosan NEM végeztük el.**

---

*Az 1–7. pont a 2026-08-28-i felmérés eredeti szövege, változatlanul. A 8. pont
a végrehajtást rögzíti. A `.gitignore` NEM zárja ki ezt a fájlt (az
`AUDIT_RLS.md`-t és az `AUDIT_STORAGE.md`-t név szerint igen), tehát ez a
jelentés **bekerül a publikus repóba** — a törlési commit üzenete is erre
hivatkozik. Ha ez nem kívánatos, fel kell venni a `.gitignore` listára.*
