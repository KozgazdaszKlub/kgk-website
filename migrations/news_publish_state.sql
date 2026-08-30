-- ============================================================================
-- KGK — „piszkozat" vs „publikus" állapot a hírekhez
-- ============================================================================
--
-- MIT CSINÁL
--   1. Felvesz egy új oszlopot a public.news táblára:  is_published boolean
--      NOT NULL DEFAULT true.
--   2. Átírja a publikus SELECT policy-t (`read_news`) úgy, hogy a NEM
--      bejelentkezett látogató CSAK a publikált hírt lássa.
--   3. Felvesz egy MÁSODIK SELECT policy-t (`read_news_admin`), ami a
--      bejelentkezett adminnak MINDKÉT állapotú sort megmutatja — enélkül a
--      saját admin felületünk sem látná a piszkozatait.
--
--   Ez egy ELŐKÉSZÍTŐ lépés: később egy külön rendszer (Instagram-import) fog
--   majd `is_published = false` sorokat létrehozni. Az a rész MÉG NEM létezik,
--   és ez a script sem hoz létre semmit belőle.
--
-- MIÉRT `DEFAULT true` — EZ A LEGFONTOSABB DÖNTÉS
--   A meglévő hírek a futtatás pillanatában MIND `true` értéket kapnak, és
--   minden ezután, kézzel felvitt hír is alapból publikus lesz. Vagyis a
--   futtatás után az éles oldal PONTOSAN ugyanúgy néz ki, mint előtte:
--   egyetlen hír sem tűnik el. Ha `false` lenne az alapérték, a migráció
--   pillanatában az ÖSSZES hír eltűnne a weboldalról.
--
-- MIT NEM CSINÁL — FONTOS
--   * NEM nyúl a `write_news` / `update_news` / `delete_news` policy-khoz.
--     Azok változatlanul `TO authenticated` maradnak — az admin ugyanúgy tud
--     írni, mint eddig.
--   * NEM nyúl a `news_images` táblához (lásd lentebb az „ISMERT KORLÁT"
--     szakaszt).
--   * Nem hoz létre indexet. A `news` tábla néhány tucat sor; egy index itt
--     csak karbantartási teher lenne, gyorsulás nélkül.
--
-- HOGYAN MŰKÖDIK EGYÜTT A KÉT SELECT POLICY
--   A Postgresben a permissive policy-k VAGY (OR) kapcsolatban állnak: egy sor
--   akkor látszik, ha LEGALÁBB EGY policy átengedi.
--
--     read_news        TO public         USING (is_published = true)
--     read_news_admin  TO authenticated  USING (true)
--
--   A `TO public` a Postgresben MINDEN szerepet jelent, az `authenticated`-et
--   is. Tehát:
--     • anon (a weboldal látogatója):  csak a read_news számít  → csak publikus
--     • authenticated (az admin):      read_news OR read_news_admin → MINDEN
--
--   Így a piszkozat a weboldalról nézve nem is létezik — se a főoldalon, se a
--   hírarchívumban, se közvetlen linken (hir.html?slug=...), se a megosztási
--   előnézetben (api/og-hir.js, ami szintén az anon kulcsot használja).
--   A kliensoldali kódban NINCS és NE IS LEGYEN külön szűrés: az „igazság
--   forrása" egyedül ez a policy. Egy kliensoldali szűrőt meg lehetne kerülni,
--   ezt nem.
--
-- ISMERT KORLÁT — a galéria-képek URL-je piszkozatnál is olvasható
--   A `news_images` táblán a `Public read news_images` policy `USING (true)`
--   marad, tehát egy piszkozat galéria-képeinek URL-je elméletben kiolvasható
--   az anon kulccsal. A gyakorlatban ez nem szivárogtat semmit, ami ne lenne
--   amúgy is nyilvános: a képek publikus Storage bucketben vannak, publikus
--   URL-lel. A weboldal ráadásul csak azután kéri le a galériát, hogy magát a
--   hírt megtalálta — piszkozatnál tehát el sem jut idáig.
--   Ha ezt is le akarod zárni, a fájl végén van rá egy KIKOMMENTELT, opcionális
--   blokk. NEM része ennek a migrációnak, külön döntés.
--
-- BIZTONSÁGI DÖNTÉSEK, AMIKET SZÁNDÉKOSAN ÍGY HOZTAM
--   1. Egyetlen tranzakció (BEGIN ... COMMIT). Ha bármelyik sor hibázik, az
--      EGÉSZ visszagördül. Nem lehet olyan pillanat, amikor az oszlop már
--      létezik, de a policy még a régi — vagy fordítva.
--   2. `ADD COLUMN` — szándékosan `IF NOT EXISTS` NÉLKÜL. Ha az oszlop már
--      létezik (pl. véletlenül másodszor futtatod), a script HANGOSAN elhasal
--      és visszagördül, ahelyett hogy csendben átugorná.
--   3. `DROP POLICY` — szintén szándékosan `IF EXISTS` NÉLKÜL, ugyanezen az
--      elven. Ha a policy-t időközben átnevezték, tudni akarunk róla; nem
--      akarjuk, hogy a régi, `USING (true)` policy némán bent maradjon az új
--      mellett — mert akkor a piszkozatok TOVÁBBRA IS látszanának.
--   4. A `read_news` nevet MEGTARTJUK. Így az AUDIT_RLS.md hivatkozásai
--      érvényesek maradnak, és ha a DROP valamiért kimaradna, az azonos nevű
--      CREATE ütközne és hibát dobna — újabb biztonsági háló.
--
-- ELŐFELTÉTEL
--   Semmi. Ez a script önállóan futtatható.
--
-- HASZNÁLAT
--   Supabase Dashboard → SQL Editor → az egész fájl bemásolása → Run.
--   Utána futtasd le a fájl végén lévő ELLENŐRZŐ LEKÉRDEZÉSEKET.
--
-- NEM KELL SIETNI VELE
--   Az admin felület (admin.html) magától észreveszi, hogy létezik-e már az
--   oszlop, és amíg nem létezik, a piszkozat-kapcsolót el sem mutatja, a
--   mentésbe pedig bele sem írja a mezőt. Vagyis a kód a futtatás ELŐTT és
--   UTÁN is hibátlanul működik.
--
-- Készült: 2026-08-30
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- OPCIONÁLIS ELŐ-ELLENŐRZÉS — futtatás ELŐTT, külön
-- Érdemes lementeni a kimenetét, hogy legyen mihez hasonlítani.
-- Amit most látnod kell: EGYETLEN SELECT sor a `news` táblán, `read_news`
-- néven, `{public}` szereppel, `qual` = true.
-- ────────────────────────────────────────────────────────────────────────────
-- SELECT tablename, policyname, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'news'
-- ORDER BY cmd, policyname;


BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- a) AZ ÚJ OSZLOP
-- ────────────────────────────────────────────────────────────────────────────
-- true  = kész, publikus hír — látszik a weboldalon
-- false = piszkozat — CSAK az admin felületen látszik
--
-- A NOT NULL + DEFAULT true páros együtt garantálja, hogy soha ne legyen
-- „se nem publikus, se nem piszkozat" (NULL) állapotú sor. Ha NULL lehetne,
-- az `is_published = true` feltétel arra a sorra sem igaz, sem hamis nem
-- lenne — a hír némán eltűnne a weboldalról.
ALTER TABLE public.news
    ADD COLUMN is_published boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.news.is_published IS
    'true = publikus (latszik a weboldalon), false = piszkozat (csak adminban). A szurest a read_news RLS policy vegzi, nem a kliensoldali kod.';


-- ────────────────────────────────────────────────────────────────────────────
-- b) A PUBLIKUS OLVASÁS SZŰKÍTÉSE
-- ────────────────────────────────────────────────────────────────────────────
-- Eddig:  FOR SELECT TO public USING (true)   → mindenki mindent látott.
-- Ezután: a piszkozat a weboldal felől nem is létezik.
DROP POLICY "read_news" ON public.news;
CREATE POLICY "read_news" ON public.news
    FOR SELECT TO public
    USING (is_published = true);


-- ────────────────────────────────────────────────────────────────────────────
-- c) AZ ADMIN OLVASÁSA — hogy a piszkozatot szerkeszteni lehessen
-- ────────────────────────────────────────────────────────────────────────────
-- Enélkül a b) pont után az admin felület Hírek listájából is eltűnnének a
-- piszkozatok, és soha nem lehetne őket publikálni.
--
-- `TO authenticated` — a natív, Postgres-szintű forma, nem az elavult
-- `auth.role() = 'authenticated'`. Ugyanaz, amire a migrations/rls_modernize.sql
-- az összes írási policy-t átállította.
CREATE POLICY "read_news_admin" ON public.news
    FOR SELECT TO authenticated
    USING (true);

COMMIT;


-- ============================================================================
-- ELLENŐRZŐ LEKÉRDEZÉS 1 — a policy-k
-- ============================================================================
-- Futtatás a COMMIT UTÁN, külön. Amit látnod kell a `news` táblán:
--
--   read_news        | {public}         | SELECT | (is_published = true)
--   read_news_admin  | {authenticated}  | SELECT | true
--   write_news       | {authenticated}  | INSERT |              ← érintetlen
--   update_news      | {authenticated}  | UPDATE | true         ← érintetlen
--   delete_news      | {authenticated}  | DELETE | true         ← érintetlen
--
-- Összesen 5 sor (eddig 4 volt — a read_news_admin az új).

SELECT policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'news'
ORDER BY cmd, policyname;


-- ============================================================================
-- ELLENŐRZŐ LEKÉRDEZÉS 2 — az oszlop és a meglévő sorok
-- ============================================================================
-- Amit látnod kell: `piszkozat` = 0. Vagyis a migráció EGYETLEN meglévő hírt
-- sem tett piszkozattá — mind maradt publikus, ahogy kell.

SELECT
    count(*)                                  AS osszes_hir,
    count(*) FILTER (WHERE is_published)      AS publikus,
    count(*) FILTER (WHERE NOT is_published)  AS piszkozat
FROM public.news;


-- ============================================================================
-- OPCIONÁLIS — a galéria-képek elrejtése piszkozatnál
-- ============================================================================
-- NEM RÉSZE ENNEK A MIGRÁCIÓNAK. Csak akkor futtasd le, ha a fenti „ISMERT
-- KORLÁT" szakaszt elolvastad, és tényleg le akarod zárni azt a rést is.
--
-- Amit csinál: a `news_images` publikus olvasása is csak akkor engedi a sort,
-- ha a hozzá tartozó hír publikus. Az admin (authenticated) olvasása
-- változatlan marad — enélkül a szerkesztő modál galériája ÜRESEN jönne fel
-- egy piszkozatnál, és a mentés ÁRVÁNAK HINNÉ a meglévő képeket, tehát
-- LETÖRÖLNÉ őket.
--
-- BEGIN;
-- DROP POLICY "Public read news_images" ON public.news_images;
-- CREATE POLICY "Public read news_images" ON public.news_images
--     FOR SELECT TO public
--     USING (EXISTS (
--         SELECT 1 FROM public.news n
--         WHERE n.id = news_images.news_id AND n.is_published
--     ));
-- CREATE POLICY "read_news_images_admin" ON public.news_images
--     FOR SELECT TO authenticated
--     USING (true);
-- COMMIT;


-- ============================================================================
-- VISSZAÁLLÍTÁS — csak vészhelyzetre
-- ============================================================================
-- Ha a futtatás után baj van, ezzel áll vissza pontosan az eredeti állapot.
-- Töröld a "--" jeleket a sorok elejéről, és futtasd le. (A COMMIT után a
-- fenti tranzakció már nem gördíthető vissza, ezért kell ez a külön script.)
--
-- FIGYELEM: a DROP COLUMN VÉGLEGESEN eldobja azt is, hogy melyik hír volt
-- piszkozat. Ha csak a szűrést akarod ideiglenesen kikapcsolni, elég az első
-- három sor (a policy visszaállítása) — az oszlopot hagyd meg.
--
-- BEGIN;
-- DROP POLICY "read_news_admin" ON public.news;
-- DROP POLICY "read_news" ON public.news;
-- CREATE POLICY "read_news" ON public.news FOR SELECT TO public USING (true);
-- ALTER TABLE public.news DROP COLUMN is_published;
-- COMMIT;
