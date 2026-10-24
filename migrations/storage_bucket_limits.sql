-- ============================================================================
-- KGK — szerveroldali méret- és típuskorlát a Storage bucketeken
-- ============================================================================
--
-- MIT CSINÁL
--   A hét tárhely-bucket mindegyikére beállítja, hogy
--     * mekkora lehet egy feltöltött fájl (file_size_limit), és
--     * milyen típusú fájl kerülhet bele (allowed_mime_types).
--   Ha egy feltöltés ezeken kívül esik, a Supabase maga utasítja el – akkor
--   is, ha valaki nem az admin felületen keresztül próbál feltölteni.
--
-- MIÉRT
--   Az admin felület (admin.html) már a böngészőben ellenőriz: kép legfeljebb
--   10 MB, PDF legfeljebb 20 MB, és csak megnyitható kép / valódi PDF mehet
--   fel. Ez viszont csak a böngészőben fut. A szerveroldali korlát a második
--   védvonal: egy bejelentkezett munkamenettel (vagy egy ellopott tokennel)
--   se lehessen 50 MB-os fájlt, HTML-oldalt vagy programot feltölteni a
--   nyilvános bucketekbe.
--
-- MIT MÉRTÜNK ELŐTTE (2026-10-24, Zsolti futtatta)
--   * Projekt-szintű korlát: 50 MB (ingyenes csomag, nem állítható).
--   * Mind a 7 bucket: public = true, file_size_limit = NULL,
--     allowed_mime_types = NULL – vagyis ma bucket-szinten SEMMI nincs
--     korlátozva, csak az 50 MB-os projekt-korlát él.
--
-- HONNAN JÖNNEK A TÍPUSOK – az admin.html tényleges feltöltési kódjából
--   Minden feltöltés az uploadImage()-en megy át, és a Content-Type fejlécet
--   a prepareUpload() a fájl VALÓDI tartalmából állítja be:
--     * Képek: a böngésző feltöltés előtt tömörít (compressImage). A
--       kimenet PNG-ből PNG (átlátszóság miatt), minden másból JPEG
--       → image/jpeg, image/png.
--     * Ha a tömörítés valamiért nem sikerül, az eredeti fájl csak akkor mehet
--       fel, ha JPEG / PNG / GIF / WebP → ritkán image/gif, image/webp is.
--     * SVG-t a kód nem tömörít, változatlanul feltölti → image/svg+xml.
--       Mivel minden képfeltöltő mező `accept="image/*"`, SVG MA bármelyik
--       képbucketbe kerülhet.
--     * HEIC / AVIF soha nem megy fel (a böngésző vagy JPEG-et csinál belőle,
--       vagy az admin elutasítja).
--     * A Gólya PDF az egyetlen feltöltés a documents bucketbe → application/pdf.
--       Más bucketbe PDF nem kerül.
--
--   Bucketek és feltöltési helyek:
--     about-images   Rólunk csoportkép                   (fotó)
--     news-images    hír borítókép + galéria             (fotó)
--     team-images    elnökségi tag profilképe            (fotó)
--     group-images   kiscsoport logó (az admin mezője:
--                    „Logó (csak kiscsoportnál)")        (logó)
--     sponsor-logos  szponzor logó                       (logó)
--     partner-logos  intézményi partner logó (footer)    (logó)
--     documents      Gólya Kisokos PDF                   (PDF)
--
-- A JAVASLAT
--   * Fotós bucketek: JPEG, PNG, GIF, WebP – SVG NÉLKÜL, legfeljebb 10 MB.
--     Ez az egyetlen pont, ahol a szerver szigorúbb, mint a mai kód: egy SVG
--     fotónak nem való, viszont egy SVG fájlba szkript is írható. Ha valaki
--     mégis SVG-t választ pl. tagképnek, a Mentésnél ezt az üzenetet kapja:
--     „Ezt a fájltípust a tárhely nem fogadja el. Képnél JPG vagy PNG…"
--     Ha ezt nem szeretnéd, a b) lépés listájához add hozzá: 'image/svg+xml'.
--   * Logó bucketek (a group-images is – oda a kiscsoportok logói kerülnek):
--     ugyanez + SVG (logó gyakran vektoros), legfeljebb 10 MB.
--   * documents: csak PDF, legfeljebb 20 MB.
--   A 10 / 20 MB pontosan az admin saját korlátja (MAX_IMAGE_BYTES,
--   MAX_PDF_BYTES): amit az admin elfogad, azt a szerver is.
--
-- MIT TÖRNE EL, HA ROSSZUL ÁLLÍTJUK
--   * Hiányzik az 'image/jpeg' → MINDEN fotó feltöltése elhasal (a tömörítés
--     kimenete szinte mindig JPEG).
--   * Hiányzik az 'image/png' → minden PNG elhasal, főleg a logók (átlátszó
--     PNG-k – a kód PNG-ként hagyja őket).
--   * Hiányzik az 'application/pdf' a documents-ből → a Gólya PDF nem
--     cserélhető.
--   * Hiányzik az 'image/svg+xml' a logó bucketekből → SVG logó nem tölthető fel.
--   * A file_size_limit BÁJTBAN értendő. Ha valaki „10"-et ír a
--     „10 * 1024 * 1024" helyett, az 10 bájt → minden feltöltés elhasal.
--     Ezért áll lent kiszámolva.
--   * A file_size_limit kisebb, mint az admin korlátja (pl. 2 MB) → az admin a
--     kiválasztáskor még elfogadja a fájlt, és csak a Mentésnél jön a hiba
--     („A fájl túl nagy, a tárhely nem fogadta el…").
--   * Elírt bucket-név → az UPDATE csendben 0 sort módosítana, és a bucket
--     védelem nélkül maradna. Ezt az a) őrszem és a d) ellenőrzés megfogja.
--   * Ha valaki a `public` oszlopot is átírná false-ra, a weboldalon minden kép
--     eltűnne. Ez a script a `public` oszlophoz NEM nyúl.
--   Hibás beállításnál az admin érthető magyar üzenetet ad (413 → „túl nagy",
--   415 → „ezt a fájltípust a tárhely nem fogadja el"), adat nem vész el:
--   a feltöltés a mentés ELSŐ lépése, utána semmi nem fut le. A galériánál a
--   hibás kép kimarad, a többi elmentődik, és figyelmeztetés jelenik meg.
--
-- MIT NEM CSINÁL
--   * A már feltöltött fájlokhoz nem nyúl – a korlát csak az ÚJ feltöltésekre
--     vonatkozik (a news-images-ben pl. van egy régi, 16 MB-os fájl; az
--     marad, és továbbra is letölthető).
--   * Nem változtat a bucketek nyilvánosságán (public) és a jogosultságokon
--     (policy-k).
--   * Az olvasást (a képek megjelenítését a weboldalon) nem érinti.
--
-- HASZNÁLAT
--   Supabase Dashboard → SQL Editor → az EGÉSZ fájl bemásolása → Run.
--   A végén az ELLENŐRZŐ LEKÉRDEZÉS eredménye jelenik meg: mind a 7 sorban
--   legyen kitöltve a file_size_limit és az allowed_mime_types.
--   Utána érdemes az adminban egy képet és a Gólya PDF-et próbaképp
--   feltölteni (pl. egy tag képét lecserélni, majd visszacserélni).
--
-- VISSZAÁLLÍTÁS (a mostani, korlát nélküli állapotra)
--   UPDATE storage.buckets
--   SET file_size_limit = NULL, allowed_mime_types = NULL
--   WHERE id IN ('about-images', 'documents', 'group-images', 'news-images',
--                'partner-logos', 'sponsor-logos', 'team-images');
--
-- Készült: 2026-10-24
-- ============================================================================

BEGIN;

-- a) Őrszem: mind a 7 bucketnek léteznie kell. Ha valamelyik hiányzik (vagy
--    el van írva), a script megáll, és semmi nem változik.
DO $$
DECLARE
    hianyzo text;
BEGIN
    SELECT string_agg(v.id, ', ') INTO hianyzo
    FROM (VALUES ('about-images'), ('documents'), ('group-images'), ('news-images'),
                 ('partner-logos'), ('sponsor-logos'), ('team-images')) AS v(id)
    WHERE NOT EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = v.id);

    IF hianyzo IS NOT NULL THEN
        RAISE EXCEPTION 'Nem található bucket: %. Semmi nem változott.', hianyzo;
    END IF;
END $$;

-- b) Fotók: JPEG, PNG, GIF, WebP – SVG nélkül; legfeljebb 10 MB
UPDATE storage.buckets
SET file_size_limit    = 10 * 1024 * 1024,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
WHERE id IN ('about-images', 'news-images', 'team-images');

-- c) Logók (szponzor, partner, kiscsoport): ugyanez + SVG; legfeljebb 10 MB
UPDATE storage.buckets
SET file_size_limit    = 10 * 1024 * 1024,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
WHERE id IN ('group-images', 'partner-logos', 'sponsor-logos');

-- d) Gólya PDF: csak PDF; legfeljebb 20 MB
UPDATE storage.buckets
SET file_size_limit    = 20 * 1024 * 1024,
    allowed_mime_types = ARRAY['application/pdf']
WHERE id = 'documents';

-- e) Ellenőrzés: mind a 7 bucketnek kaptak korlátot. Ha nem, minden
--    visszagördül.
DO $$
DECLARE
    beallitva int;
BEGIN
    SELECT count(*) INTO beallitva
    FROM storage.buckets
    WHERE id IN ('about-images', 'documents', 'group-images', 'news-images',
                 'partner-logos', 'sponsor-logos', 'team-images')
      AND file_size_limit IS NOT NULL
      AND allowed_mime_types IS NOT NULL;

    IF beallitva <> 7 THEN
        RAISE EXCEPTION 'Csak % bucket kapott korlátot a 7-ből. Semmi nem változott.', beallitva;
    END IF;
END $$;

COMMIT;

-- ── ELLENŐRZŐ LEKÉRDEZÉS (csak olvas) ──
SELECT id,
       public,
       file_size_limit,
       pg_size_pretty(file_size_limit) AS meret,
       allowed_mime_types
FROM storage.buckets
ORDER BY id;
