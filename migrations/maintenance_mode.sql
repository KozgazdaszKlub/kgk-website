-- ============================================================================
-- KGK — „Karbantartás mód" kapcsoló felvétele a feature_flags táblába
-- ============================================================================
--
-- MIT CSINÁL
--   Egyetlen új sort szúr be a MÁR LÉTEZŐ public.feature_flags táblába. Nem
--   hoz létre táblát, nem módosít policy-t, nem nyúl egyetlen meglévő sorhoz
--   sem. Ez pontosan az a bővítési minta, amit a migrations/feature_flags.sql
--   végén az „ÚJ KAPCSOLÓ FELVÉTELE KÉSŐBB" szakasz leír.
--
-- MI EZ A KAPCSOLÓ
--   A többi kapcsoló EGY szekciót rejt el a főoldalon. Ez EGGYEL FELJEBB
--   dolgozik: bekapcsolva a TELJES publikus oldal (index, hir, hirek,
--   kapcsolat, 404) helyett egy „Hamarosan érkezik" képernyő fogadja a
--   látogatót. Akkor hasznos, ha a domain már él, de a tartalom még nincs kész.
--
--   Az admin felület (/admin.html) SOHA nem esik a karbantartás alá – onnan
--   bármikor vissza lehet kapcsolni.
--
-- MIÉRT `false` A KEZDŐÉRTÉK
--   Hogy a futtatás pillanatában az éles oldal NE változzon semmit. A
--   karbantartás módot utána, az adminban (Szekciók fül) lehet bekapcsolni,
--   amikor tényleg kell.
--
--   FIGYELEM: ez ELTÉR a feature_flags.sql három kezdő sorától, amik `true`
--   értékkel indulnak. Ott a `true` jelentette a „minden marad, ahogy volt";
--   itt a `false` jelenti ugyanezt, mert ennél a kapcsolónál fordított a
--   logika (bekapcsolva = az oldal NEM látszik).
--
-- AZ ON CONFLICT SZEREPE
--   Ha a sor valamiért már létezne (pl. másodszor futtatod, vagy közben már
--   bekapcsoltad az adminban), a script nem hasal el rajta, és főleg NEM
--   írja vissza `false`-ra egy szándékosan bekapcsolt karbantartás módot.
--
-- ELŐFELTÉTEL
--   A migrations/feature_flags.sql már lefutott (létezik a tábla). Ha nem,
--   ez a script hibával leáll — előbb azt futtasd le.
--
-- HASZNÁLAT
--   Supabase Dashboard → SQL Editor → az egész fájl bemásolása → Run.
--   Utána futtasd le a fájl végén lévő ELLENŐRZŐ LEKÉRDEZÉST.
--
-- Készült: 2026-08-30
-- ============================================================================


INSERT INTO public.feature_flags (flag_key, enabled, label) VALUES
    ('maintenance_mode', false, 'Karbantartás mód — a teljes publikus oldal „Hamarosan érkezik" üzenetet mutat minden látogatónak')
ON CONFLICT (flag_key) DO NOTHING;


-- ============================================================================
-- ELLENŐRZŐ LEKÉRDEZÉS — futtasd le a beszúrás után
-- ============================================================================
-- Négy sornak kell megjelennie. A maintenance_mode `enabled` értéke `false`,
-- a másik háromé változatlan (ha korábban kikapcsoltál valamit, az marad
-- kikapcsolva — ez a script hozzájuk nem nyúlt).
SELECT id, flag_key, enabled, label FROM public.feature_flags ORDER BY id;


-- ============================================================================
-- KAPCSOLÁS SQL-BŐL — csak vészhelyzetre
-- ============================================================================
-- Normál esetben az adminból kell kapcsolni (Szekciók fül). Ezek a sorok
-- akkor kellenek, ha valamiért nem tudsz belépni az adminba.
--
-- Bekapcsolás (az oldal eltűnik a látogatók elől):
--   UPDATE public.feature_flags SET enabled = true, updated_at = now()
--   WHERE flag_key = 'maintenance_mode';
--
-- Kikapcsolás (az oldal újra elérhető):
--   UPDATE public.feature_flags SET enabled = false, updated_at = now()
--   WHERE flag_key = 'maintenance_mode';


-- ============================================================================
-- VISSZAÁLLÍTÁS — csak vészhelyzetre
-- ============================================================================
-- Ez törli a kapcsolót. Utána a publikus oldal MINDIG normálisan töltődik be
-- (a maintenance.js a hiányzó sort „nincs karbantartás"-ként kezeli), az admin
-- Szekciók füléről pedig eltűnik a kapcsoló.
--
-- DELETE FROM public.feature_flags WHERE flag_key = 'maintenance_mode';
