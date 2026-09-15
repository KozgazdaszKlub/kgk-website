-- ============================================================================
-- KGK — a hírek slug-ja legyen EGYEDI és KÖTELEZŐ
-- ============================================================================
--
-- MIT CSINÁL
--   1. Ellenőrzi, hogy nincs-e két hír ugyanazzal a sluggal, és nincs-e slug
--      nélküli hír. Ha van, HANGOSAN megáll, és semmit nem változtat.
--   2. Egyedi (UNIQUE) szabályt tesz a public.news.slug oszlopra — de CSAK
--      akkor, ha még nincs rajta ilyen (lásd „MIT MÉRTÜNK" lentebb).
--   3. Kötelezővé (NOT NULL) teszi a slugot. Ha már az, ez a lépés nem
--      csinál semmit.
--
-- MIÉRT
--   A slug a hír azonosítója az URL-ben (hir.html?slug=...). Ha két hírnek ugyanaz
--   a slugja, a link nem egyértelmű. Ezzel a szabállyal az ütköző mentést
--   maga az adatbázis utasítja el (hibakód: 23505), nem csak a böngészőben
--   futó ellenőrzés — ez akkor is véd, ha valaha más is ír a news táblába
--   (pl. egy későbbi, automatikus hírimport; annak ezt a hibát kezelnie kell).
--
-- MIT MÉRTÜNK ELŐTTE (2026-09-14)
--   Kívülről mérve a news.slug oszlopon MÁR VAN egyedi index (nem részleges,
--   pontosan erre az egy oszlopra). A 2. lépés ezért várhatóan NEM hoz létre
--   semmit — csak akkor, ha a mérés tévedett. Azt, hogy a slug kötelező-e
--   (NOT NULL), kívülről nem lehetett megmérni; a 3. lépés ezt biztosítja.
--
-- MIT NEM CSINÁL — FONTOS
--   * EGYETLEN hírt sem módosít, és egyet sem töröl. Ha duplikált vagy
--     hiányzó slug van, azt kézzel kell rendbe tenni (lásd „HA AZ 1. LÉPÉS
--     LISTÁJA NEM ÜRES").
--   * Az üres slug ('') ellen NEM véd: a NOT NULL csak a hiányzó (NULL)
--     értéket tiltja. Az üres slugú hírt az 1. lépés figyelmeztetésként
--     kilistázza, de a scriptet nem állítja meg.
--   * Nem nyúl a news_images táblához, a jogosultságokhoz, és a news tábla
--     többi oszlopához.
--
-- BIZTONSÁGI DÖNTÉSEK, AMIKET SZÁNDÉKOSAN ÍGY HOZTAM
--   1. Egyetlen tranzakció (BEGIN ... COMMIT). Ha bármelyik lépés hibázik, az
--      EGÉSZ visszagördül.
--   2. Az a) őrszem MINDEN változtatás előtt fut, és magyar hibaüzenetben
--      megnevezi a problémás slugokat / híreket. Így ha valaki az 1. lépést
--      kihagyva rögtön az egész fájlt futtatja, akkor sem történik baj.
--   3. A b) lépés — a többi migrációnkkal ELLENTÉTBEN — feltételes („csak ha
--      még nincs"). Oka: a mérés szerint az egyedi index már létezik, és egy
--      feltétel nélküli ADD CONSTRAINT vagy névütközés miatt elhasalna, vagy
--      (ha a meglévő index neve más) egy MÁSODIK, felesleges indexet hozna
--      létre ugyanarra az oszlopra. A többi migrációnál azért nem feltételes
--      semmi, mert ott egy újrafuttatás beállításokat írna vissza; itt nincs
--      mit felülírni, tehát az újrafuttatás ártalmatlan.
--   4. A szabály neve `news_slug_key` — ugyanaz, amit a Postgres (és a
--      Supabase felülete) magától adna egy egyedi slug oszlopnak.
--
-- HASZNÁLAT
--   1. LÉPÉS — Másold be CSAK a lenti „1. LÉPÉS" lekérdezést egy új SQL Editor
--      fülre, és futtasd (Run). Csak olvas, semmit nem módosít.
--        • „Success. No rows returned" → minden rendben, mehetsz tovább.
--        • Ha van sor a táblázatban → lásd „HA AZ 1. LÉPÉS LISTÁJA NEM ÜRES".
--      Az SQL Editor a piszkozat híreket is látja, nem csak a publikusakat.
--   2. LÉPÉS (ajánlott) — Futtasd le külön a fájl végén lévő ELLENŐRZŐ
--      LEKÉRDEZÉST is, és készíts róla képernyőképet. Ez az „előtte" állapot;
--      a VISSZAÁLLÍTÁSnál ebből látod, mi volt eredetileg.
--   3. LÉPÉS — Supabase Dashboard → SQL Editor → az EGÉSZ fájl bemásolása →
--      Run. A végén az ELLENŐRZŐ LEKÉRDEZÉS eredménye jelenik meg.
--
-- HA AZ 1. LÉPÉS LISTÁJA NEM ÜRES
--   DUPLIKÁLT sor (ugyanaz a slug több hírnél):
--     Az admin felületen nyisd meg az érintett hírek közül azt, amelyiknek a
--     linkjét kevésbé osztották meg (általában az újabbat), írd át a slugját
--     egyedire (pl. a végére „-2"), és mentsd. Hírt NE törölj emiatt.
--     FIGYELEM: a slug átírása megváltoztatja a hír linkjét — a régi link
--     ezután „Ez a hír nem található" oldalt ad.
--     Ezután futtasd újra az 1. LÉPÉST, amíg üres nem lesz.
--   HIÁNYZÓ sor (nincs slug):
--     Az admin felületen nyisd meg a hírt, adj neki slugot, és mentsd.
--   ÜRES sor (üres vagy csak szóközből álló slug):
--     A scriptet nem állítja meg, de a hírnek nincs működő linkje. Érdemes
--     ugyanúgy slugot adni neki az admin felületen.
--
-- Készült: 2026-09-14
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. LÉPÉS — ELŐ-ELLENŐRZÉS: problémás slugok (csak olvas)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    'DUPLIKÁLT – ugyanaz a slug több hírnél'::text AS problema,
    n.slug::text                                   AS slug,
    count(*)                                       AS hirek_szama,
    string_agg(format('id=%s · dátum=%s · cím: %s', n.id, n.date, coalesce(n.title, '(nincs cím)')),
               '   |   ' ORDER BY n.id)            AS erintett_hirek
FROM public.news n
WHERE n.slug IS NOT NULL
GROUP BY n.slug
HAVING count(*) > 1

UNION ALL

SELECT
    'HIÁNYZÓ – nincs slug (NULL)',
    NULL,
    count(*),
    string_agg(format('id=%s · dátum=%s · cím: %s', n.id, n.date, coalesce(n.title, '(nincs cím)')),
               '   |   ' ORDER BY n.id)
FROM public.news n
WHERE n.slug IS NULL
HAVING count(*) > 0

UNION ALL

SELECT
    'ÜRES – üres vagy csak szóköz (a scriptet NEM állítja meg)',
    n.slug,
    count(*),
    string_agg(format('id=%s · dátum=%s · cím: %s', n.id, n.date, coalesce(n.title, '(nincs cím)')),
               '   |   ' ORDER BY n.id)
FROM public.news n
WHERE n.slug IS NOT NULL AND btrim(n.slug) = ''
GROUP BY n.slug

ORDER BY 1, 2;


BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- a) ŐRSZEM — duplikált vagy hiányzó slugnál megáll, MIELŐTT bármi változna
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    duplikaltak text;
    hianyzok    text;
BEGIN
    SELECT string_agg(format('"%s" (%s hír)', d.slug, d.db), ', ' ORDER BY d.slug)
      INTO duplikaltak
      FROM (SELECT slug, count(*) AS db
              FROM public.news
             WHERE slug IS NOT NULL
             GROUP BY slug
            HAVING count(*) > 1) AS d;

    IF duplikaltak IS NOT NULL THEN
        RAISE EXCEPTION 'MEGÁLLTAM, SEMMI NEM VÁLTOZOTT. Ezek a slugok több hírnél is szerepelnek: %. Javítsd őket a fájl elején leírt módon, aztán futtasd újra.', duplikaltak;
    END IF;

    SELECT string_agg(format('id=%s', id), ', ' ORDER BY id)
      INTO hianyzok
      FROM public.news
     WHERE slug IS NULL;

    IF hianyzok IS NOT NULL THEN
        RAISE EXCEPTION 'MEGÁLLTAM, SEMMI NEM VÁLTOZOTT. Ezeknek a híreknek nincs slugja: %. Adj nekik slugot a fájl elején leírt módon, aztán futtasd újra.', hianyzok;
    END IF;
END
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- b) EGYEDI SLUG — csak ha még nincs pontosan erre az oszlopra egyedi index
-- ────────────────────────────────────────────────────────────────────────────
-- A feltétel azt keresi, ami ténylegesen kikényszeríti az egyediséget:
-- egyedi, érvényes, EGYETLEN oszlopos (nem összetett), nem részleges (nincs
-- WHERE feltétele) és nem kifejezésen alapuló (pl. lower(slug)) index a slug
-- oszlopon. Egy UNIQUE constraint is ilyen indexet hoz létre, tehát azt is
-- megtalálja.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_index i
          JOIN pg_attribute a
            ON a.attrelid = i.indrelid
           AND a.attnum   = i.indkey[0]
         WHERE i.indrelid    = 'public.news'::regclass
           AND i.indisunique
           AND i.indisvalid
           AND i.indnkeyatts = 1
           AND i.indpred   IS NULL
           AND i.indexprs  IS NULL
           AND a.attname     = 'slug'
    ) THEN
        ALTER TABLE public.news ADD CONSTRAINT news_slug_key UNIQUE (slug);
    END IF;
END
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- c) KÖTELEZŐ SLUG
-- ────────────────────────────────────────────────────────────────────────────
-- Ha az oszlop már NOT NULL, ez a sor nem csinál semmit (nem hiba).
-- Hiányzó slug esetén ide el sem jutunk: az a) őrszem már megállt.
ALTER TABLE public.news ALTER COLUMN slug SET NOT NULL;

COMMIT;


-- ============================================================================
-- ELLENŐRZŐ LEKÉRDEZÉS — futtasd a script ELŐTT is (2. LÉPÉS) és UTÁNA is
-- ============================================================================
-- Amit a script UTÁN látnod kell:
--
--   slug_kotelezo         | igen
--   egyedi_indexek_szama  | 1
--   indexek               | CREATE UNIQUE INDEX ... ON public.news USING btree (slug)
--
-- Ha az egyedi_indexek_szama 2 vagy több, ugyanarra az oszlopra több
-- egyforma index van — ez nem veszélyes, de szólj, mert felesleges.

SELECT
    (SELECT CASE WHEN a.attnotnull THEN 'igen' ELSE 'NEM' END
       FROM pg_attribute a
      WHERE a.attrelid = 'public.news'::regclass
        AND a.attname  = 'slug')                     AS slug_kotelezo,
    (SELECT count(*)
       FROM pg_index i
       JOIN pg_attribute a
         ON a.attrelid = i.indrelid
        AND a.attnum   = i.indkey[0]
      WHERE i.indrelid    = 'public.news'::regclass
        AND i.indisunique
        AND i.indisvalid
        AND i.indnkeyatts = 1
        AND i.indpred   IS NULL
        AND i.indexprs  IS NULL
        AND a.attname     = 'slug')                  AS egyedi_indexek_szama,
    (SELECT string_agg(pg_get_indexdef(i.indexrelid), E'\n')
       FROM pg_index i
       JOIN pg_attribute a
         ON a.attrelid = i.indrelid
        AND a.attnum   = ANY (i.indkey)
      WHERE i.indrelid = 'public.news'::regclass
        AND a.attname  = 'slug')                     AS indexek;


-- ============================================================================
-- VISSZAÁLLÍTÁS — csak vészhelyzetre
-- ============================================================================
-- Az admin felület mentése a szabályok nélkül is működik, tehát erre
-- várhatóan soha nem lesz szükség. Ha mégis: töröld a "--" jeleket a kellő
-- sor elejéről, és futtasd.
--
-- CSAK azt állítsd vissza, amit ez a script tett. Ehhez kell a 2. LÉPÉS
-- „előtte" képernyőképe:
--
--   • Ha ELŐTTE slug_kotelezo = NEM volt:
-- ALTER TABLE public.news ALTER COLUMN slug DROP NOT NULL;
--
--   • Ha ELŐTTE egyedi_indexek_szama = 0 volt (a mérés szerint NEM ez a helyzet,
--     tehát ezt a sort várhatóan SOHA ne futtasd — a már eredetileg is meglévő
--     egyedi indexet dobná el):
-- ALTER TABLE public.news DROP CONSTRAINT news_slug_key;
