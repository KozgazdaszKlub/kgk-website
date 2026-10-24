# Admin útmutató – a KGK weboldal tartalmának szerkesztése

Ez az útmutató azoknak szól, akik a weboldalra tartalmat töltenek fel
(hírek, elnökség, rendezvények stb.). Programozói tudás nem kell hozzá.

**Az admin felület címe:** https://kozgazdaszklub.com/admin.html

> Ha bármi furcsát látsz, vagy egy hibaüzenet nem szerepel lent, szólj a
> weboldal üzemeltetőjének – és írd meg pontosan, mit látsz (egy képernyőkép
> a legjobb).

## Tartalom

1. [Bejelentkezés](#1-bejelentkezés)
2. [Általános tudnivalók](#2-általános-tudnivalók)
3. [Hír felvitele](#3-hír-felvitele)
4. [Elnökség](#4-elnökség)
5. [Rendezvények](#5-rendezvények)
6. [Munkacsoportok és kiscsoportok](#6-munkacsoportok-és-kiscsoportok)
7. [Szponzorok](#7-szponzorok)
8. [Intézményi partnerek (lábléc)](#8-intézményi-partnerek-lábléc)
9. [Rólunk](#9-rólunk)
10. [Statisztikák és Gólyáknak szöveg](#10-statisztikák-és-gólyáknak-szöveg)
11. [Gólya Kisokos PDF](#11-gólya-kisokos-pdf)
12. [Szekciók be- és kikapcsolása](#12-szekciók-be--és-kikapcsolása)
13. [Karbantartás mód](#13-karbantartás-mód)
14. [Fájlméret és formátum](#14-fájlméret-és-formátum)
15. [Gyakori hibaüzenetek](#15-gyakori-hibaüzenetek)

---

## 1. Bejelentkezés

1. Nyisd meg az admin címét.
2. Írd be az e-mail címedet és a jelszavadat → **Bejelentkezés**.
3. A végén jobb fent: **Kilépés**.

- A jelszót senkinek ne add tovább. Ha elfelejtetted, szólj az
  üzemeltetőnek – a jelszót a weboldalon belül nem lehet visszaállítani.
- Amíg dolgozol, a bejelentkezés magától meghosszabbodik. Ha mégis lejár, egy
  **piros sáv** jelenik meg felül: kattints a **Munkamenet meghosszabbítása**
  gombra, majd nyomd meg újra a **Mentés**-t. A beírt szöveg nem vész el.
- Ha a sáv azt írja, hogy **„Van egy nem mentett piszkozatod"**: a
  **Visszaállítom** gomb visszahozza a legutóbb el nem mentett űrlapot (a
  képeket újra ki kell választani), az **Elvetem** törli.

## 2. Általános tudnivalók

- **Semmi nem változik a weboldalon, amíg nem nyomod meg a Mentés gombot.**
- Mentés után alul egy rövid üzenet jelenik meg: **zöld** = sikerült,
  **piros** = nem sikerült (az üzenet megmondja, miért – lásd a
  [15. pontot](#15-gyakori-hibaüzenetek)).
- A változás a látogatóknál **a következő oldalfrissítéskor** látszik.
- A listákban: ✏️ (ceruza) = szerkesztés, 🗑️ (kuka) = törlés. A törlés
  **nem vonható vissza**, a gép előtte rákérdez.
- Ahol fel/le nyilak vannak (elnökség, csoportok, szponzorok), azokkal a
  weboldalon megjelenő sorrendet állítod.
- Ha mentés nélkül próbálod bezárni vagy frissíteni az oldalt, a böngésző
  rákérdez. Ilyenkor előbb ments.
- Képet a feltöltő mezőre kattintva vagy ráhúzva tudsz kiválasztani. A
  rendszer a képeket magától lekicsinyíti, előtte nem kell átméretezni.

## 3. Hír felvitele

1. **Hírek** fül → **Új hír**.
2. **Cím** – ez lesz a hír címe a weboldalon és a megosztásokban.
3. **Dátum** – kötelező. A hírek dátum szerint, a legújabb elöl jelennek meg.
4. **Slug** – a hír azonosítója a linkben:
   `https://kozgazdaszklub.com/hir.html?slug=`**`evnyito-2026`**
   - A címből magától kitöltődik, általában nem kell hozzányúlni.
   - Csak ékezet nélküli kisbetű, szám és kötőjel lehet benne (pl.
     `gólyatábor 2026!` helyett `golyatabor-2026`).
   - Két hírnek nem lehet ugyanaz a slugja. Ha foglalt, tegyél a végére egy
     számot (`-2`).
   - **Megosztás után ne írd át**, mert a régi link „Ez a hír nem található"
     oldalra visz.
5. **Rövid leírás** – 1–2 mondat, ez látszik a hírkártyán és a megosztásban.
6. **Tartalom** – a hír szövege. A gombokkal: félkövér, aláhúzás, lista,
   számozott lista, idézet, formázás törlése.
7. **Borítókép** – **mindig tölts fel egyet**: ez jelenik meg a hírkártyán és
   a Facebook-megosztásban. Kép nélkül a megosztásban nem lesz kép.
8. **Képgaléria** (nem kötelező) – legfeljebb **10 kép**. Több is kijelölhető
   egyszerre. A sorrendet a képek húzásával állítod (telefonon: tartsd nyomva,
   aztán húzd). Egy képet a sarkában lévő × gombbal veszel ki.
9. **Állapot:**
   - **Publikus** – a hír a mentés után megjelenik a weboldalon.
   - **Piszkozat** – csak az adminban látszik; a linkje „Ez a hír nem
     található" oldalt ad. Később bármikor publikussá teheted.
10. **Mentés**.

### Megosztás Facebookon (publikálás után)

1. **Publikálás után várj legalább 1 percet** a megosztással. (Ha a hír
   linkjét a publikálás előtt valaki megnyitotta, a weboldal kb. 1 percig még
   „nem található"-ként emlékezhet rá.)
2. Nyisd meg a Facebook ellenőrző eszközét:
   https://developers.facebook.com/tools/debug/ (Facebook-bejelentkezés kell).
3. Másold be a hír linkjét → **Debug**.
4. Ellenőrizd a képet, a címet és a leírást. Ha régi vagy hiányos:
   **Scrape Again** (Újrabeolvasás).
5. Ha jó, mehet a megosztás.

Ha egy **már megosztott** hírt módosítasz (pl. új borítókép), várj kb.
**10 percet**, aztán a fenti eszközben nyomd meg a **Scrape Again**-t – a
Facebook magától nem frissíti az előnézetet.

## 4. Elnökség

1. **Elnökség** fül → **Új tag**.
2. **Név**, **Pozíció** (pl. Elnök).
3. **Facebook / Instagram / LinkedIn URL** – nem kötelező. A teljes linket
   másold be (`https://…`-tal kezdődik).
4. **Profilkép** – a weboldalon **kör alakúra** vágva jelenik meg: négyzetes,
   középre igazított arcképet válassz. Kép nélkül egy egységes helyettesítő
   kép jelenik meg.
5. **Mentés**. A sorrendet a listában a fel/le nyilakkal állítod.

Kép törlése: a szerkesztőben **Kép eltávolítása** → megerősítés → **Mentés**.

## 5. Rendezvények

1. **Rendezvények** fül → **Új rendezvény**.
2. **Rendezvény neve**, **Dátum**, **Leírás** → **Mentés**.

A főoldalon **csak a mai és a jövőbeli** rendezvények jelennek meg. A
lejártak az adminban megmaradnak – nyugodtan törölheted őket.

## 6. Munkacsoportok és kiscsoportok

1. **Munkacsoportok** fül → **Új csoport**.
2. **Típus**: *Főmunkacsoport* vagy *Kiscsoport* – a weboldalon két külön
   részben jelennek meg.
3. **Név**, **Leírás**.
4. **Szín** – a kártya tetején lévő színes csík.
5. **Logó** – csak kiscsoportnál.
6. **Mentés**. Sorrend: fel/le nyilak.

## 7. Szponzorok

1. **Szponzorok** fül → **Új szponzor**.
2. **Cég neve**, **Weboldal URL** (nem kötelező – ide visz a logóra kattintás).
3. **Logó** – új szponzornál kötelező. Legjobb az **átlátszó hátterű PNG**
   vagy az **SVG**.
4. **Mentés**.

Ha nincs egy szponzor sem, a szekció nem jelenik meg. Ha sok van, a logók
folyamatosan gördülnek.

## 8. Intézményi partnerek (lábléc)

A minden oldal alján látható **két** logó (a kar és az egyetem).
Újat felvenni és törölni szándékosan nem lehet.

1. **Partnerek** fül → a partner sorában írd át a **nevet**, a **weboldalt**
   (kötelező) vagy válassz új **logót**.
2. **Mentés** az adott partnernél.
3. **Sorrend cseréje** – felcseréli a két logót.

Amíg nincs logó, a weboldalon a partner neve jelenik meg.

## 9. Rólunk

1. **Rólunk** fül → **Szöveg** átírása.
2. **Csoportkép** – új kép kiválasztása (nem kötelező).
3. **Mentés**.

## 10. Statisztikák és Gólyáknak szöveg

**Statisztikák** – a főoldal sötétkék sávjának négy száma:

- Mind a négy **szám** és **felirat** kötelező; a szám csak egész, nem negatív
  lehet.
- A szám mögé alapból **„+"** kerül (pl. `400` → „400+").
- Ha **mértékegység** kell, írd a felirat **elejére**: `% Közösség` → a
  weboldalon „100%" és alatta „KÖZÖSSÉG". Így működik a `%`, `‰`, `°` és a
  pénznemjelek (pl. `€`). Szöveges egység (pl. „Ft") nem.

**Gólyáknak szöveg** – a Gólyáknak szekció címe és bevezetője. A letölthető
PDF-et külön, a **Gólya PDF** fülön cseréled.

Végül: **Mentés**.

## 11. Gólya Kisokos PDF

1. **Gólya PDF** fül → válaszd ki a PDF-et (legfeljebb **20 MB**).
2. **Feltöltés & Mentés**. Az új PDF lecseréli a régit, a régi törlődik.

**PDF eltávolítása**: a „Jelenlegi PDF" dobozban → megerősítés. Utána a
weboldalon a „Hamarosan elérhető..." felirat látszik.

## 12. Szekciók be- és kikapcsolása

**Szekciók** fül. A kapcsoló **azonnal mentődik** (nincs Mentés gomb), és a
látogatóknál a következő oldalfrissítéskor látszik. A tartalom ilyenkor nem
törlődik, csak elrejtődik – bármikor visszakapcsolható.

| Kapcsoló | Mit rejt el |
|---|---|
| Gólya Kisokos | a főoldal Gólyáknak szekcióját és a „Gólyáknak" menüpontot |
| Kapcsolatfelvétel | a kapcsolat űrlapot, az „Írj nekünk" menüpontot és a főoldali felhívást |
| Szponzorok | a főoldal Szponzorok szekcióját |
| Karbantartás mód | **a teljes weboldalt** – lásd a következő pontot |

## 13. Karbantartás mód

Bekapcsolva a látogatók **minden oldalon** csak egy „Hamarosan érkezik"
üzenetet látnak. Az admin felület ilyenkor is működik.

1. **Bekapcsolás előtt** a *Szekciók* fülön, a karbantartás kártya alatt
   keresd meg **„A te előnézeti linked"** dobozt → **Másolás** → mentsd el
   könyvjelzőnek.
2. Kapcsold be a **Karbantartás mód** kapcsolót. A kártya **pirosra** vált,
   és azt írja: **„Oldal rejtve"**. (Kikapcsolva: „Oldal él".)
3. Az előnézeti linket egyszer megnyitva **te továbbra is a valódi oldalt
   látod** a saját böngésződben.
4. Ha meg akarod nézni, mit lát a látogató, nyisd meg a doboz második linkjét
   (`…?preview=ki`).
5. Ha végeztél, kapcsold ki.

Az előnézeti link **nem jelszó**: akinek odaadod, az is látja az oldalt. Ne
tedd ki nyilvánosan.

## 14. Fájlméret és formátum

| Mit töltesz fel | Formátum | Legfeljebb |
|---|---|---|
| Fénykép (hír, galéria, elnökség, Rólunk) | **JPG** vagy **PNG** | **10 MB** |
| Logó (szponzor, partner, kiscsoport) | **PNG** (átlátszó háttérrel) vagy **SVG** | **10 MB** |
| Gólya Kisokos | csak **PDF** | **20 MB** |

- **iPhone-os képek (HEIC):** a legtöbb böngésző nem tudja megnyitni, ezért
  az admin elutasítja. Megoldás:
  - küldd el magadnak a képet e-mailben / Messengeren, és a letöltött
    (JPG) változatot töltsd fel, **vagy**
  - iPhone-on: *Beállítások → Kamera → Formátumok →* **„Leginkább
    kompatibilis"** – ezután JPG-ben fotóz.
- A képeket a rendszer magától lekicsinyíti (legfeljebb 1400 pixel
  szélesre), tehát a 10 MB alatti fotókat nem kell előtte átméretezni.
- SVG-t csak logóhoz használj.
- A galériába legfeljebb 10 kép kerülhet.

## 15. Gyakori hibaüzenetek

| Üzenet (vagy eleje) | Mit jelent | Mit tegyél |
|---|---|---|
| **Piros sáv:** „A bejelentkezésed lejárt mentés közben" | lejárt a bejelentkezés | **Munkamenet meghosszabbítása**, majd újra **Mentés**. Ha nem megy: **Jelentkezz be újra** – a szöveget a gép megjegyzi (piszkozat) |
| „Nem sikerült elérni a szervert…" | nincs internet, vagy megszakadt | ellenőrizd a netet, és próbáld újra |
| „A szerver most nem tudta teljesíteni a kérést (HTTP 5…)" | átmeneti szerverhiba | várj pár percet, próbáld újra; ha tartósan fennáll, szólj az üzemeltetőnek |
| „Túl sok kérés érkezett rövid idő alatt…" | túl gyors egymásutánban mentettél | várj egy percet |
| „Ehhez nincs jogosultság…" | a szerver elutasította | szólj az üzemeltetőnek |
| „A fájlok tárhelye nem található…" | beállítási hiba | szólj az üzemeltetőnek |
| „A kép túl nagy (… MB)…" / „A PDF túl nagy…" / „A fájl túl nagy, a tárhely nem fogadta el…" | túl nagy a fájl | válassz kisebbet, vagy kicsinyítsd le |
| „Ez egy iPhone-os HEIC/HEIF kép…" | HEIC formátum | lásd a [14. pontot](#14-fájlméret-és-formátum) |
| „Ezt a fájlt a böngésző nem tudja képként megnyitni…" | sérült fájl, vagy nem kép | mentsd el JPG / PNG formában, és válaszd ki újra |
| „Ezt a fájltípust a tárhely nem fogadja el…" | nem megengedett formátum | fotóhoz JPG / PNG, logóhoz PNG / SVG, Gólyához PDF |
| „Ez nem PDF fájl…" | a Gólyához nem PDF-et választottál | PDF-et válassz |
| „Add meg a hír címét / dátumát / a slugot…" | kötelező mező üres | töltsd ki |
| „A slugban csak ékezet nélküli kisbetű, szám és kötőjel lehet…" | hibás slug | lásd a [3. pontot](#3-hír-felvitele) |
| „Ez a slug már foglalt…" | van már ilyen slugú hír | tegyél a végére egy számot (pl. `-2`) |
| „Ez az érték már szerepel egy másik elemnél." | ismétlődő érték | írd át egyedire |
| „Valamelyik szöveg túl hosszú…" / „Valamelyik mező formátuma hibás…" | túl hosszú vagy rossz formátumú mező | rövidíts / javítsd (pl. a dátumot) |
| „Egy kötelező mező üresen maradt…" | hiányzó adat | töltsd ki |
| „Maximum 10 kép tölthető fel!" | tele a galéria | vegyél ki képet |
| „A hír elmentve, de a galériát nem sikerült teljesen menteni…" | a szöveg kész, néhány kép nem | nyisd meg újra a hírt, ellenőrizd a képeket, és mentsd el még egyszer |
| „A hír elmentve. A galéria nem töltődött be…" | a galéria most nem érhető el; a képekhez a gép nem nyúlt | később nyisd meg újra a hírt |
| „Új szponzornál a logó feltöltése kötelező!" | hiányzik a logó | válassz logót |
| „A weboldal megadása kötelező…" (partner) | hiányzik a link | írd be a partner weboldalát |
| „Váratlan hiba…" | ismeretlen hiba | próbáld újra; ha ismétlődik, szólj az üzemeltetőnek (képernyőképpel) |
