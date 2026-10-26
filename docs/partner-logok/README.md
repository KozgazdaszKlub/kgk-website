# Intézményi partnerlogók – fehér változat a láblécbe

A weboldal minden oldalának alján, a **sötétkék** (`#08122b`) láblécen két
intézményi logó áll: a kar és az egyetem. A lábléc szándékosan háttérkártya
nélkül mutatja őket, ezért **világos / fehér** logófájl kell. Egy fekete vagy
sötétkék logó ott gyakorlatilag eltűnik. Ebben a mappában a két logó fehér
(negatív) változata van, feltöltésre készen.

A mappa a GitHubon látható, a weboldalra nem kerül ki (`.vercelignore`:
`/docs/`).

## Melyik fájl hova kerül

Az admin **Partnerek** fülén, a partner **neve** alapján. A sorrend a
„Sorrend cseréje" gombbal felcserélhető, ezért ne a „1. / 2. logó" felirat
alapján válassz.

| Fájl | Partner (név az adminban) | Méret |
|---|---|---|
| `fsega-feher.png` | Közgazdaság- és Gazdálkodástudományi Kar | 500×114 px, 32 675 bájt |
| `ubb-feher.png` | Babeș-Bolyai Tudományegyetem | 500×194 px, 46 579 bájt |

**Egyszerre csak egy partnert cserélj:** logó kiválasztása → **Mentés** →
csak utána a másik. A mentés újratölti mindkét dobozt, így a másik dobozban
kiválasztott, még el nem mentett kép elveszne. A második mentés ilyenkor is
„Partner sikeresen mentve!"-t ír, de logó nélkül.

Az admin előnézete a lábléc sötétkék színén (`#08122b`) mutatja a logót,
tehát már a Mentés előtt látszik, hogyan fog kinézni a weboldalon.

Az admin feltöltéskor minden PNG-t újrakódol (a minőség nem változik, a
pixelek azonosak), a tárhelyre ezért nagyobb fájl kerül: kb. 41 KB, illetve
80 KB.

## Források

Mindkettő hivatalos, az intézmény saját felületéről vagy azzal megegyező
forrásból. Letöltve 2026-10-26-án.

| Logó | Forrás | Eredeti fájl |
|---|---|---|
| Babeș-Bolyai Tudományegyetem | Wikimedia Commons: „Logo Universitatea Babes-Bolyai UBB 2021.svg" – a Commons adatlapja szerint forrása a `https://www.ubbcluj.ro/ro/`, szerzője a Universitatea Babeș-Bolyai, közkincs (public domain). Közvetlen cím: `https://upload.wikimedia.org/wikipedia/commons/9/9d/Logo_Universitatea_Babes-Bolyai_UBB_2021.svg` | SVG, 387 312 bájt, egyszínű kék (`#004E84`) |
| Közgazdaság- és Gazdálkodástudományi Kar (FSEGA) | A kar magyar tagozatának honlapja: `https://hu.econ.ubbcluj.ro/assets/img/logo/logo-white.webp` – a kar SAJÁT fehér változata | WebP, 3369×824 px, átlátszó háttér |

Megvizsgált, de nem használt fájlok:

- `https://www.ubbcluj.ro/img/Logo-UBB.svg` – ugyanaz az egyetemi logó, de
  alatta egy „Tradiție și Excelență…" szlogen is áll. A Commons-os SVG
  pontosan a korábban használt kompozíció.
- `https://econ.ubbcluj.ro/img/logo_narrow.png` – nem átlátszó (tömör fehér
  háttér), és egy kézírásos felirat is van rajta.
- `https://hu.econ.ubbcluj.ro/assets/img/logo/logo.webp` – a kar színes
  logója (szürke + piros); fehér kártyás megjelenítéshez való, ide nem.

## Hogyan készült

Újrarajzolás és torzítás nélkül, a hivatalos fájlokból:

- **Egyetem:** az SVG `<style>` blokkjában a három kék színkód (`#004E84`,
  `#004F82`, `#00527F`) helyére `#FFFFFF` került. A rajz és a nyomvonalak
  változatlanok; az SVG rejtett rétegei rejtve maradtak. Ezután a Chrome
  rajzolta ki 4000 px szélesen. Az átlátszó szélt a logó magasságának 2%-áig
  levágtuk, és 500 px szélesre kicsinyítettük (Lanczos, előszorzott
  alfával).
- **Kar:** a kar saját fehér fájlja. Csak az átlátszó szélt vágtuk le
  ugyanígy, és 500 px-re kicsinyítettük. A „UBB" felirat és a négyzetek
  világosszürkék – ez az eredeti fájl színe.
- A PNG-k veszteségmentesek (visszabontva bájtra azonos pixelek). Az
  egyetemi logó szürkeárnyalatos + alfa PNG, mert minden pixele fehér.

Kontraszt a `#08122b` háttéren: fehér 18,7:1, a kar logójának szürke része
8,6:1.

## Ellenőrző összegek (SHA-256)

```
38b89752996925ec20cfca039734c2ea0b77b2c4ae434c9c94887b484e722a37  fsega-feher.png
768bbad224be913021dab26e9e28053dcc033b7451ec2296d1f0fab8a3b80e1a  ubb-feher.png
```

## Ha valaha új logó kell

- Kérj vagy keress az intézménytől **fehér / negatív** változatot (a kar
  honlapján pl. `logo-white` néven van).
- Egyszínű logónál a színkód cseréje az SVG-ben elfogadható, többszínűnél
  NEM: ott a színek különítik el a rajz részeit.
- CSS-szűrőt (`invert`, `brightness`) ne használj: meghamisítja az
  intézmény színeit.
