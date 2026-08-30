-- ============================================================================
-- KGK — institutional_partners tábla (a footer két intézményi partner-logója)
-- ============================================================================
--
-- MIT CSINÁL
--   Létrehoz egy új táblát PONTOSAN KÉT sorral: a kar és az egyetem logója,
--   ami minden publikus oldal footerében megjelenik, egymás mellett,
--   kattinthatóan. Az admin felület („Partnerek" fül) ezt a két sort tudja
--   szerkeszteni — képet, nevet, linket cserélni.
--
--   A második, KÜLÖN tranzakció létrehozza a `partner-logos` Storage bucketet
--   is, ahova az admin a logókat feltölti.
--
-- MIÉRT KÜLÖN TÁBLA, ÉS NEM A `sponsors`
--   Fogalmilag más. A `sponsors` egy BŐVÍTHETŐ lista (admin vehet fel újat,
--   törölhet, a szalag pedig görgetni kezd, ha sok van). Ez itt FIX KÉT elem,
--   egy állandó footer-elrendezésben. Ha egy táblába kerülnének, egyetlen
--   elkattintott „Új szponzor" gomb elrontaná a footer elrendezését, és a
--   szponzor-szalagba is bekerülne a két intézményi logó.
--
-- MIT NEM CSINÁL — FONTOS
--   * NINCS INSERT és NINCS DELETE policy. Ez SZÁNDÉKOS, ugyanaz az elv, mint
--     a `feature_flags` táblánál: a két sort kizárólag ez a script hozza létre,
--     az admin CSAK módosítani tudja őket. Így egy elkattintott gomb soha nem
--     tud harmadik partnert létrehozni, és nem tud egyet kitörölni sem —
--     vagyis a „mindig pontosan két logó egymás mellett" elrendezés nem tud
--     elromlani a felületről. NE tegyél bele ilyen policy-t később sem, hacsak
--     nem szándékosan bővíted az admin jogosultságát.
--   * Nem nyúl egyetlen meglévő táblához, policy-hoz vagy buckethez sem.
--
-- MIÉRT ÜRES A `website_url` ÉS NULL A `logo_url` INDULÁSKOR
--   Mert a valódi logófájlok és a hivatalos linkek még nincsenek meg. A kód
--   mindkét hiányt kezeli, és NEM törik el tőle semmi:
--     * `logo_url IS NULL`  → a footerben a kép helyett a partner NEVE jelenik
--                             meg szövegesen (ugyanaz a fallback-elv, mint a
--                             szponzoroknál a `.sponsor-name-fallback`)
--     * `website_url = ''`  → a logó/név megjelenik, de nem lesz link
--                             (nem csinálunk `href=""`-t, ami az aktuális
--                             oldalt töltené újra)
--   Amint Zsoltinak megvannak a fájlok és a linkek, az admin „Partnerek"
--   fülén tölti fel őket — SQL-hez többé nem kell hozzányúlni.
--
-- MIÉRT `NOT NULL DEFAULT ''` A `website_url`, ÉS NEM SIMÁN NULLABLE
--   A cél az volt, hogy a link kötelező legyen. Ez a DB szintjén annyit tud
--   garantálni, hogy soha ne legyen NULL; a „ne is legyen üres" részt az
--   admin felület kényszeríti ki (üres URL-lel nem enged menteni). Azért nem
--   `CHECK (website_url <> '')`, mert akkor ezt a két kezdősort sem lehetne
--   beszúrni addig, amíg a valódi linkek meg nem vannak — vagyis a funkciót
--   nem lehetne bevezetni, csak egy kitalált linkkel.
--
-- BIZTONSÁGI DÖNTÉSEK, AMIKET SZÁNDÉKOSAN ÍGY HOZTAM
--   1. `CREATE TABLE` — szándékosan `IF NOT EXISTS` NÉLKÜL, és az INSERT-en
--      SINCS `ON CONFLICT`. Ha a script véletlenül másodszor futna le,
--      HANGOSAN elhasal és visszagördül, ahelyett hogy csendben átugorná a
--      létrehozást, vagy visszaírná a Zsolti által már beállított neveket és
--      linkeket a kezdő üres értékekre.
--   2. Az írási policy `TO authenticated` — a natív, Postgres-szintű forma,
--      nem az elavult `auth.role() = 'authenticated'`. Ugyanaz, amire a
--      migrations/rls_modernize.sql az összes többi táblát átállította.
--   3. A policy-nevek a projekt eddigi mintáját követik: „Public read <tábla>"
--      az olvasásra, „Auth update <tábla>" az írásra (lásd AUDIT_RLS.md).
--
-- MIÉRT KÉT KÜLÖN TRANZAKCIÓ
--   Az 1. blokk a tábla, a 2. a Storage bucket. Azért nincsenek egyben, mert
--   a `storage.objects` policy létrehozása nem minden projektben engedélyezett
--   SQL-ből. Ha egyben lennének, egy ilyen jogosultsági hiba a MŰKÖDŐ tábla
--   létrehozását is visszagördítené. Így viszont: ha a 2. blokk elhasal, az
--   1. már véglegesen megvan, és a bucketet a Supabase felületén is létre
--   lehet hozni kézzel (lásd a 2. blokk fölötti megjegyzést).
--   Mindkét blokk ÖNMAGÁBAN teljes: nincs olyan pillanat, amikor egy tábla
--   RLS nélkül állna.
--
-- HASZNÁLAT
--   Supabase Dashboard → SQL Editor → az egész fájl bemásolása → Run.
--   Utána futtasd le a fájl végén lévő ELLENŐRZŐ LEKÉRDEZÉSEKET.
--
-- NEM KELL SIETNI VELE
--   A weboldal a futtatás ELŐTT is hibátlanul működik: ha a tábla nem létezik,
--   a `loadInstitutionalPartners()` üres listát kap, és a footer pontosan
--   ugyanúgy néz ki, mint eddig. Az admin „Partnerek" füle pedig egy segítő
--   üzenetet mutat arról, hogy ezt a scriptet kell lefuttatni.
--
-- Készült: 2026-08-30
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
--  1. BLOKK — A TÁBLA
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- a) A TÁBLA
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.institutional_partners (
    -- `by default as identity`: a Postgres adja az id-t, de kézzel is
    -- megadható, ha valaha egy adott sorszámra lenne szükség.
    id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,

    -- Az intézmény neve. Ez kerül a logó `alt` attribútumába (képernyőolvasó
    -- ezt mondja fel), és ez jelenik meg szövegesen, ha még nincs logó.
    -- Ezért NOT NULL: név nélkül a sor a footerben láthatatlan lenne.
    name        text        NOT NULL,

    -- A logó publikus Storage URL-je. NULL = még nincs feltöltve; ilyenkor a
    -- footerben a `name` jelenik meg helyette.
    logo_url    text,

    -- Az intézmény hivatalos weboldala. Lásd a fejlécben, miért
    -- `NOT NULL DEFAULT ''` és nem CHECK-kel kikényszerített nem-üres érték.
    website_url text        NOT NULL DEFAULT '',

    -- Megjelenítési sorrend a footerben (balról jobbra, növekvő). Az adminban
    -- a „Sorrend cseréje" gomb ezt a két értéket cseréli fel.
    sort_order  integer     NOT NULL DEFAULT 0,

    updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.institutional_partners IS
    'A footer ket intezmenyi partner-logoja. PONTOSAN 2 sor, kizarolag SQL-bol hozhato letre - az adminnak csak UPDATE joga van.';


-- ────────────────────────────────────────────────────────────────────────────
-- b) RLS + POLICY-K
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.institutional_partners ENABLE ROW LEVEL SECURITY;

-- Olvasás: bárkinek. A publikus oldal anon kulccsal kéri le — enélkül a
-- látogató böngészője nem tudná, mit rajzoljon a footerbe.
CREATE POLICY "Public read institutional_partners" ON public.institutional_partners
    FOR SELECT TO public
    USING (true);

-- Írás: KIZÁRÓLAG bejelentkezett adminnak, és KIZÁRÓLAG meglévő sor
-- módosítása. Nincs INSERT és nincs DELETE policy — lásd a fejlécet.
CREATE POLICY "Auth update institutional_partners" ON public.institutional_partners
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- JOGOSULTSÁGOK (biztonsági háló)
-- ────────────────────────────────────────────────────────────────────────────
-- A Supabase alapból minden új public sémás táblára ad GRANT-ot az anon és
-- authenticated szerepnek, tehát ez a két sor jó eséllyel nem csinál semmit.
-- Azért van itt, hogy a tábla akkor is működjön, ha ezt az alapértelmezést
-- valaha megváltoztatnák.
--
-- FIGYELEM: a GRANT nem szűkít, csak bővít. A védelmet a fenti RLS policy-k
-- adják, nem ez a két sor. (AUDIT_RLS.md, K-2.)
GRANT SELECT ON public.institutional_partners TO anon, authenticated;
GRANT UPDATE ON public.institutional_partners TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- c) A KÉT PARTNER SORA
-- ────────────────────────────────────────────────────────────────────────────
-- Ez az EGYETLEN hely, ahol ezek a sorok létrejöhetnek (nincs INSERT policy).
--
-- A `logo_url` NULL, a `website_url` üres — mindkettőt az admin felületen
-- kell majd kitölteni. Addig a footerben a nevek jelennek meg szövegesen,
-- link nélkül. Semmi nem törik el tőle.
--
-- A NEVEK PONTOSÍTHATÓK az adminból, ehhez a fájlhoz nem kell hozzányúlni.
-- Amit ide írtam, az a kar magyar nyelvű megnevezése a BBTE-n; ha Zsolti
-- pontosabb hivatalos alakot használ, egyszerűen átírja a felületen.
--
-- A LINKEKET SZÁNDÉKOSAN NEM TALÁLTAM KI. Egy rossz cím élesben rosszabb,
-- mint egy hiányzó: a látogató elkattintana valahova, ahova nem akartuk.
-- Zsolti a saját maga által ismert hivatalos címeket írja be az adminban.
INSERT INTO public.institutional_partners (name, logo_url, website_url, sort_order) VALUES
    ('Közgazdaság- és Gazdálkodástudományi Kar', NULL, '', 1),
    ('Babeș-Bolyai Tudományegyetem',             NULL, '', 2);

COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
--  2. BLOKK — A `partner-logos` STORAGE BUCKET
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ide tölti fel az admin a két logót. Külön bucket, a projekt eddigi mintája
-- szerint (minden tartalomtípusnak sajátja van: news-images, team-images,
-- group-images, about-images, sponsor-logos, documents).
--
-- HA EZ A BLOKK JOGOSULTSÁGI HIBÁVAL ELHASAL, nincs baj — az 1. blokk már
-- véglegesen lefutott. A bucketet ilyenkor a felületen hozd létre:
--   Supabase Dashboard → Storage → New bucket
--     Name:   partner-logos
--     Public bucket:  BE (a weboldal <img> taggel tölti be a logókat)
--   majd Storage → partner-logos → Policies → New policy:
--     - SELECT, „public" szerepre
--     - INSERT és UPDATE, „authenticated" szerepre
--
-- MIÉRT KELL AZ UPDATE POLICY IS: az admin `x-upsert: true` fejléccel tölt
-- fel, tehát ugyanarra a névre ismételten menteni is tud. Enélkül a második
-- feltöltés hibára futna.

BEGIN;

-- A bucket. `public = true`, mert a weboldal sima <img src="..."> taggel
-- tölti be a logókat — ehhez a fájloknak bejelentkezés nélkül elérhetőnek
-- kell lenniük. Ugyanaz, mint a többi képbucketnél. (AUDIT_STORAGE.md, 2.1)
INSERT INTO storage.buckets (id, name, public)
VALUES ('partner-logos', 'partner-logos', true);

-- Olvasás/listázás: bárkinek, de KIZÁRÓLAG ebben a bucketben.
-- A `bucket_id = 'partner-logos'` feltétel nem díszítés: enélkül a policy az
-- ÖSSZES bucketre vonatkozna.
CREATE POLICY "Public read partner-logos" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'partner-logos');

-- Feltöltés: csak bejelentkezett adminnak, csak ebbe a bucketbe.
CREATE POLICY "Auth insert partner-logos" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'partner-logos');

-- Felülírás (x-upsert): csak bejelentkezett adminnak, csak ebben a bucketben.
CREATE POLICY "Auth update partner-logos" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'partner-logos')
    WITH CHECK (bucket_id = 'partner-logos');

-- DELETE policy SZÁNDÉKOSAN NINCS. Az admin ebben a szekcióban nem töröl
-- fájlt: logócserénél a régi bent marad (ugyanaz a már ismert viselkedés,
-- mint a többi képnél — lásd CLAUDE.md „Ismert hiányosságok"). Két logóról
-- van szó, tehát ez itt legfeljebb néhány kilobájt.

COMMIT;


-- ============================================================================
-- ELLENŐRZŐ LEKÉRDEZÉSEK — futtasd le a COMMIT-ok után
-- ============================================================================

-- 1) Pontosan KÉT sornak kell lennie, sort_order 1 és 2 értékkel,
--    üres website_url-lel és NULL logo_url-lel.
SELECT id, name, logo_url, website_url, sort_order
FROM public.institutional_partners
ORDER BY sort_order;

-- 2) Pontosan KÉT policy-nak kell lennie a táblán:
--      Public read institutional_partners  | {public}         | SELECT
--      Auth update institutional_partners  | {authenticated}  | UPDATE
--    INSERT és DELETE sor NEM lehet — ez így helyes, lásd a fejlécet.
SELECT policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'institutional_partners'
ORDER BY cmd;

-- 3) Az RLS-nek bekapcsolva kell lennie (rowsecurity = true).
SELECT relname, relrowsecurity AS rowsecurity
FROM pg_class
WHERE oid = 'public.institutional_partners'::regclass;

-- 4) A bucketnek léteznie kell, `public = true` értékkel.
SELECT id, name, public
FROM storage.buckets
WHERE id = 'partner-logos';

-- 5) A bucket három policy-ja (SELECT / INSERT / UPDATE). DELETE nem lehet.
SELECT policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE '%partner-logos%'
ORDER BY cmd;


-- ============================================================================
-- VISSZAÁLLÍTÁS — csak vészhelyzetre
-- ============================================================================
-- Ez TÖRLI a táblát a két partnerrel együtt, és a bucketet a benne lévő
-- fájlokkal. A publikus oldal ettől nem törik el: a footer partner-blokkja
-- egyszerűen nem jelenik meg, minden más marad. Az admin „Partnerek" füle
-- üres állapotot mutat a segítő üzenettel.
--
-- BEGIN;
-- DROP POLICY "Auth update partner-logos" ON storage.objects;
-- DROP POLICY "Auth insert partner-logos" ON storage.objects;
-- DROP POLICY "Public read partner-logos" ON storage.objects;
-- DELETE FROM storage.objects WHERE bucket_id = 'partner-logos';
-- DELETE FROM storage.buckets WHERE id = 'partner-logos';
-- DROP TABLE public.institutional_partners;
-- COMMIT;
