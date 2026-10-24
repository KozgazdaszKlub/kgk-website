# Üzemeltetés – KGK weboldal

Ez a dokumentum az üzemeltetőnek és a tartalék tulajdonosnak szól: hol vannak
a kulcsok, hogyan cserélhetők, mi a teendő, ha valami leáll.

> **Ebben a fájlban (és a repóban sehol) nincs titok, jelszó vagy kulcsérték.**
> A repó nyilvános – így is kell maradnia. A felelősök neve és elérhetősége
> egy belső, nem nyilvános listán legyen.

## Tartalom

1. [Szolgáltatások és szerepek](#1-szolgáltatások-és-szerepek)
2. [Kulcsok és titkok](#2-kulcsok-és-titkok)
3. [Elfelejtett admin jelszó](#3-elfelejtett-admin-jelszó)
4. [Fiókvédelem: második tulajdonos + 2FA](#4-fiókvédelem-második-tulajdonos--2fa)
5. [Keep-alive (a Supabase ébren tartása)](#5-keep-alive-a-supabase-ébren-tartása)
6. [Ha az oldal leáll](#6-ha-az-oldal-leáll)
7. [Monitorozás (UptimeRobot)](#7-monitorozás-uptimerobot)

---

## 1. Szolgáltatások és szerepek

| Szolgáltatás | Mire való | Ki kezeli |
|---|---|---|
| GitHub – `KozgazdaszKlub/kgk-website` | forráskód, GitHub Actions (keep-alive) | üzemeltető |
| Vercel | hosting, `api/` függvények, környezeti változók | üzemeltető |
| Supabase | adatbázis, admin fiókok, képek/PDF tárhely | üzemeltető |
| Cloudflare | a domain DNS-e (nem proxyzott, „DNS only") | üzemeltető |
| Gmail – küldő fiók | a kapcsolat űrlap leveleit küldi (alkalmazásjelszóval) | üzemeltető |
| Gmail – klub fiók | ide érkeznek a kapcsolat űrlap üzenetei | elnökség |
| UptimeRobot | az oldal figyelése, e-mail riasztás leálláskor (7. pont) | üzemeltető (+ tartalék tulajdonos) |
| Admin felület (`/admin.html`) | tartalom | tartalomfelelősök |

**Szerepek:**

- **Tartalomfelelős** (admin fiókkal): hírek, tartalom, szekció-kapcsolók,
  karbantartás mód. Hibát észlel → jelzi az üzemeltetőnek.
- **Üzemeltető**: kód, deploy, kulcsok, SQL, hibaelhárítás.
- **Tartalék tulajdonos**: ha az üzemeltető nem érhető el, ezen dokumentum
  alapján elvégzi a vészhelyzeti lépéseket (rollback, Supabase visszaállítás,
  karbantartás mód). Ehhez saját tulajdonosi hozzáférés kell (lásd 4. pont).
- **Elnökség**: hosszabb leállásnál tájékoztatja a tagokat (Facebook,
  Instagram).

## 2. Kulcsok és titkok

### Hol van mi

| Kulcs / titok | Hol van | Titkos? |
|---|---|---|
| Supabase **publishable** kulcs (`sb_publishable_…`) | a kódban, **6 fájlban**: `script.js`, `admin.html`, `maintenance.js`, `api/og-hir.js`, `api/sitemap.js`, `api/health.js` | **nem** – nyilvános kulcs, a táblákat a Supabase jogosultsági szabályai (RLS) védik |
| ugyanez még egyszer | GitHub → Settings → Secrets and variables → Actions → `SUPABASE_ANON_KEY` (a keep-alive használja) | nem, de secretként tároljuk |
| Supabase **secret** / `service_role` kulcs | **sehol** – nem kell a weboldalnak | **igen** – mindenhez jogot ad, megkerüli az RLS-t |
| `SMTP_APP_PASSWORD` – a küldő Gmail fiók alkalmazásjelszava | Vercel → Project → Settings → Environment Variables | **igen** |
| `SMTP_USER` – a küldő Gmail cím | Vercel → Environment Variables | nem titok |
| `CONTACT_EMAIL_TO` – a címzett | Vercel → Environment Variables | nem titok |
| `HEALTH_CHECK_TOKEN` – az e-mail-ellenőrzés (`/api/health?deep=1`) tokenje | Vercel → Environment Variables **és** az UptimeRobot „KGK – e-mail" figyelőjének címe (7. pont) | **igen**, de kis tétű: csak egy (ritkított) SMTP-ellenőrzést indít, adatot nem lát |
| Admin fiókok jelszavai | Supabase → Authentication → Users (csak a hash) | **igen** |
| Karbantartás előnézeti érték | `maintenance.js` (`BYPASS_VALUE`) + `admin.html` (`MAINTENANCE_BYPASS_VALUE`) | **nem** – benne van a nyilvános JS-ben; csak a véletlen látogató ellen véd |

A gitignore-olt `.env` fájl régi maradvány, semmi nem olvassa.

### Rotáció: Supabase publishable kulcs

Ritkán kell (nyilvános kulcs), pl. ha visszaélnek vele. A régi kulcsot csak a
legvégén töröld, különben az oldal közben elérhetetlen.

1. Supabase Dashboard → **Project Settings → API Keys** → *Publishable key* →
   új kulcs létrehozása.
2. Cseréld a kulcsot mind a **6 fájlban**. Így találod meg őket:
   ```bash
   git grep -n "sb_publishable_"
   ```
3. Commit, push, várd meg a Vercel deployt.
4. Ellenőrzés: a főoldal tartalma betölt, az admin bejelentkezés működik, egy
   hír oldala megnyílik, a `/sitemap.xml` 200-at ad, a `/api/health`
   `{"status":"ok"}`-t ír. (Ha a régi kulcs törlése után a health 503-at ad,
   az `api/health.js`-ben maradt a régi kulcs.)
5. GitHub → Settings → Secrets and variables → Actions → `SUPABASE_ANON_KEY`
   → **Update** az új értékkel. Utána Actions → *Supabase keep-alive* →
   **Run workflow** → zöld pipa kell.
6. Várj kb. egy órát (a már nyitva lévő admin fülek a régi kulccsal futnak –
   egy frissítés elég nekik), majd a Supabase-ben **töröld a régi kulcsot**.
7. Ellenőrizd újra a 4. pontot.

### Rotáció: Gmail alkalmazásjelszó (`SMTP_APP_PASSWORD`)

Akkor kell, ha kiszivárgott, ha valaki elhagyja a csapatot, akinek megvolt,
vagy ha a küldő fiók jelszavát megváltoztatták (**a Google ilyenkor az összes
alkalmazásjelszót érvényteleníti** – a kapcsolat űrlap addig nem küld).

1. Jelentkezz be a **küldő** Gmail fiókba (a Vercel `SMTP_USER` értéke).
2. Google-fiók → **Biztonság** → a kétlépcsős azonosításnak bekapcsolva kell
   lennie → **Alkalmazásjelszavak** → új jelszó (pl. „kgk-website-2026-11").
   A 16 karakteres jelszó csak egyszer látszik.
3. Vercel → Project → **Settings → Environment Variables** →
   `SMTP_APP_PASSWORD` → **Edit** → illeszd be (szóközök nélkül) → Save.
4. **Redeploy kell** – a változó csak az új deployban él: Deployments → a
   legutóbbi Production deploy → **⋯ → Redeploy**.
5. Próba: küldj egy üzenetet a kapcsolat űrlapon, és nézd meg, megérkezik-e.
   (Ha a kapcsolat szekció ki van kapcsolva, előtte kapcsold be az adminban.)
   Levél nélküli próba: nyisd meg a „KGK – e-mail" figyelő címét (7. pont) –
   `{"status":"ok"}` kell. Az új deploy friss példányokon fut, tehát ez már
   az új jelszóval jelentkezik be.
6. A Google-fiókban **töröld a régi** alkalmazásjelszót.

Ha a próba nem sikerül: Vercel → Project → **Logs**, szűrés a
`kapcsolat-submit` függvényre. Az `535` kezdetű hiba = rossz jelszó.

### Rotáció: `SMTP_USER`, `CONTACT_EMAIL_TO`

Ugyanaz, mint fent a 3–5. lépés: Vercel → Environment Variables → Edit →
**Redeploy** → próbaüzenet. Új küldő fióknál új alkalmazásjelszó is kell.

### Rotáció: `HEALTH_CHECK_TOKEN`

Akkor kell, ha kiszivárgott (pl. képernyőképen vagy egy megosztott
UptimeRobot-fiókban látszott), vagy ha valaki elhagyja a csapatot, akinek
megvolt. Kis tétű titok: csak az e-mail-ellenőrzést indítja el, azt is
legfeljebb 10 percenként.

1. Új érték készítése (7. pont, 1. lépés).
2. Vercel → Environment Variables → `HEALTH_CHECK_TOKEN` → **Edit** → Save →
   **Redeploy**.
3. UptimeRobot → a „KGK – e-mail" figyelő → **Edit** → a címben a
   `token=` utáni rész cseréje → Save.
4. Ellenőrzés: a figyelő zöld. A régi tokennel megnyitott cím 401-et ad
   (`{"status":"unauthorized"}`).

A 2. és a 3. lépés között a figyelő egy ideig pirosat jelezhet (401) – ez
várható, nem leállás.

### Supabase secret / `service_role` kulcs

- A weboldal **nem használja**, tehát nincs mit cserélni a kódban.
- Ha egy helyi eszközhöz ideiglenesen kell egy secret kulcs: **Project
  Settings → API Keys → Secret keys** → létrehozás → használat → **azonnal
  töröld**. Soha ne kerüljön fájlba, a Vercelre vagy a GitHubra.
- Ha kiszivárgott: töröld a Dashboardon. A weboldalra nincs hatása.
- **Régi (legacy) `anon` / `service_role` kulcsok:** ha a Dashboardon még
  engedélyezve vannak, és semmi nem használja őket, érdemes letiltani őket.
  Előtte ellenőrizd, hogy a GitHub `SUPABASE_ANON_KEY` secretje sem régi kulcs
  – ha igen, előbb cseréld le az új publishable kulcsra, és futtasd le a
  keep-alive-ot.

### Karbantartás előnézeti érték

Nem titok, de ha túl sokan ismerik, cserélhető: írd át **ugyanarra** az új
értékre a `maintenance.js` `BYPASS_VALUE` és az `admin.html`
`MAINTENANCE_BYPASS_VALUE` konstansát → commit, push. A régi linket megnyitók
böngészője még emlékszik a régi jelzőre, de azt az új érték nem fogadja el.
Az új linket az admin *Szekciók* fülén lehet kimásolni.

## 3. Elfelejtett admin jelszó

> **A Supabase „Send password recovery" e-mailje NEM működik nálunk**: az
> admin felületen nincs „új jelszó megadása" oldal, a levélben kapott link nem
> vezet sehova. Ne ezzel próbálkozz.

Az admin fiókokat a Supabase Dashboardon kezeljük (Supabase → a projekt →
**Authentication → Users**). Ha az adott felhasználó adatlapján van jelszó-
módosítási lehetőség, az a legegyszerűbb. Ha nincs:

**A) Új fiók (ajánlott, SQL nélkül)**

1. Authentication → Users → **Add user → Create new user**.
2. E-mail cím, új erős jelszó, **Auto Confirm User** bepipálva → Create.
3. Az érintett ezzel jelentkezik be a `/admin.html`-en.
4. Ha a régi fiókra már nincs szükség: a sorában **Delete user**. (Ha a
   törlés hibát ad, a régi fiók maradhat – a tartalmat nem érinti.)

Ha ugyanazzal az e-mail címmel kell az új fiók, előbb a régit kell törölni.

**B) A meglévő fiók jelszavának cseréje SQL-lel** (csak az üzemeltető)

Supabase → SQL Editor:

```sql
UPDATE auth.users
SET encrypted_password = extensions.crypt('ÚJ-JELSZÓ-IDE', extensions.gen_salt('bf'))
WHERE email = 'AZ-ADMIN-EMAIL-CÍME';
```

- Az eredmény „1 row" legyen. „0 row" = elírt e-mail cím.
- A lekérdezést **ne mentsd el** (snippetként), és a futtatás után zárd be a
  fület – a jelszó szövegként szerepel benne.

**Jó gyakorlat:**

- Mindenkinek **saját** admin fiókja legyen, közös jelszó helyett. Ha valaki
  elhagyja a csapatot: Authentication → Users → **Delete user**.
- Authentication → Sign In / Providers: **az új felhasználók regisztrációja
  („Allow new users to sign up") legyen kikapcsolva.** Admin fiókot csak a
  Dashboardon hozunk létre.

## 4. Fiókvédelem: második tulajdonos + 2FA

**Az üzemeltető teendője.** Cél: ha az üzemeltető fiókja elérhetetlenné válik
(elveszett telefon, kilépés a klubból), a klub ne veszítse el a weboldalt.

- [ ] **GitHub**
  - a `KozgazdaszKlub` szervezetben **második Owner** (People → Invite member
    → Owner);
  - szervezet → Settings → Authentication security → **Require two-factor
    authentication**;
  - mindkét tulajdonosnál 2FA, a helyreállító kódok biztonságos helyen.
- [ ] **Supabase**
  - Organization → Team → **Invite** → szerep: **Owner**;
  - mindkét fióknál **MFA** (Account → Security, hitelesítő alkalmazással);
  - ha a szervezet beállításai között elérhető: MFA kötelezővé tétele.
- [ ] **Vercel**
  - **2FA** (Account Settings → Authentication);
  - második hozzáférés: ha a projekt egy csapatban (Team) van, második
    tulajdonos meghívása. Ha személyes, ingyenes (Hobby) fiókban, oda nem
    lehet tagot hívni – ilyenkor a vészterv: a tartalék tulajdonos a saját
    Vercel fiókjába importálja a GitHub repót, beállítja a környezeti
    változókat (2. pont), és átállítja a domaint (ehhez Cloudflare-hozzáférés
    kell).
- [ ] **Cloudflare** (DNS): 2FA + második tag.
- [ ] **A két Gmail fiók**: 2FA, a helyreállító e-mail / telefonszám klubos
  kézben legyen, ne egy volt tagnál.
- [ ] A szerepek (1. pont) **neve és elérhetősége** egy belső, nem nyilvános
  helyen.

## 5. Keep-alive (a Supabase ébren tartása)

**Mit csinál:** a `.github/workflows/supabase-keepalive.yml` minden éjjel
**03:17 UTC**-kor egyetlen olvasó lekérdezést küld a Supabase-nek
(`news?select=id&limit=1`). Semmit nem ír. Kézzel is indítható: GitHub →
Actions → *Supabase keep-alive* → **Run workflow**.

**Miért:** az ingyenes Supabase-csomag **7 nap tétlenség után szünetelteti** a
projektet. Ilyenkor a weboldalon a tartalom helyén „Nem sikerült betölteni"
áll, és az adminba sem lehet belépni.

**A 60 napos csapda:** a GitHub egy nyilvános repóban **automatikusan
kikapcsolja az ütemezett workflow-kat, ha 60 napig nem volt commit**
(előtte e-mailben figyelmeztet). Utána a keep-alive nem fut. Ha közben az
oldalnak sincs látogatója (pl. nyáron), 7 nap múlva a Supabase leáll.

Megelőzés és javítás:

1. Havonta egyszer nézz rá: GitHub → **Actions** → az utolsó futások zöldek-e.
   (Ha a 7. pont „KGK – adatbázis" figyelője fut, az 5 percenként maga is
   lekérdezi a Supabase-t, tehát ébren tartja – a keep-alive ettől még
   maradjon, ez a tartalék.)
2. Ha a workflow ki van kapcsolva: Actions → *Supabase keep-alive* →
   **Enable workflow** → **Run workflow**. (Egy commit is újraindítja a 60
   napos számlálót.)
3. Ha a Supabase már szünetel: Supabase Dashboard → a projekt → **Restore
   project** (pár perc). A Supabase csak korlátozott ideig (jelenleg 90 napig)
   engedi a Dashboardról visszaállítani – ne hagyd sokáig.

Piros X az Actions fülön:

| Hibaüzenet | Ok | Teendő |
|---|---|---|
| HTTP 401 / 403 | rossz vagy lecserélt kulcs a secretben | `SUPABASE_ANON_KEY` frissítése (2. pont) |
| HTTP 000 / hálózati hiba | a Supabase nem érhető el | status.supabase.com; a projekt szünetel-e |
| egyéb HTTP kód | Supabase-oldali hiba | Supabase Dashboard, projekt állapota |

## 6. Ha az oldal leáll

### Gyors diagnózis

| Tünet | Valószínű ok | Első lépés | Ki |
|---|---|---|---|
| Az oldal egyáltalán nem tölt be, Vercel-hibaoldal | rossz deploy vagy Vercel-kiesés | https://www.vercel-status.com, aztán **rollback** (lent) | üzemeltető / tartalék |
| A domain nem válaszol, de a Vercelen a deploy *Ready*, és a deploy saját (`…vercel.app`) címe működik | DNS | Cloudflare DNS beállítások | üzemeltető |
| Az oldal betölt, de a tartalom helyén „Nem sikerült betölteni" | Supabase szünetel vagy kiesik | https://status.supabase.com, Supabase Dashboard: szünetel-e → Restore | üzemeltető / tartalék |
| Mindenhol „Hamarosan érkezik" | be van kapcsolva a karbantartás mód | admin → Szekciók → kikapcsolás | tartalomfelelős |
| Nem lehet belépni az adminba | jelszó, vagy Supabase-kiesés | 3. pont; Supabase állapota | üzemeltető |
| A kapcsolat űrlap hibát ír | Gmail alkalmazásjelszó, vagy napi küldési korlát | Vercel → Logs → `kapcsolat-submit` | üzemeltető |
| Hibás / nem oda való tartalom jelent meg | szerkesztési hiba | admin: javítás, hírnél **Piszkozat**, vagy törlés | tartalomfelelős |
| Facebook-megosztásnál rossz kép / cím | gyorsítótár | Sharing Debugger → Scrape Again (ADMIN-UTMUTATO.md) | tartalomfelelős |
| UptimeRobot riasztás: „KGK – főoldal" | az oldal nem érhető el, vagy nem a mi oldalunk jön | a fenti első két sor (Vercel, DNS) | üzemeltető / tartalék |
| UptimeRobot riasztás: „KGK – adatbázis" | a Supabase nem válaszol | a „Nem sikerült betölteni" sor; Vercel → Logs → `/api/health` | üzemeltető / tartalék |
| UptimeRobot riasztás: „KGK – e-mail" | a kapcsolat űrlap nem tud küldeni | 7. pont → *Ha riasztás jön* | üzemeltető |

(A `kgk-website.vercel.app` ehhez nem jó: az 308-cal a fő domainre irányít.
A deploy saját címét a Vercel Dashboard → Deployments → a deploy adatlapján
találod.)

### Vercel rollback (rossz deploy után)

**A) Gyors visszaállítás a Vercelen** (üzemeltető vagy tartalék tulajdonos)

1. Vercel Dashboard → a projekt → **Instant Rollback** (vagy Deployments →
   az előző, *Ready* állapotú Production deploy → **⋯** menü). Az ingyenes
   csomagban ez az **előző** production deployra visz vissza.
2. Ellenőrzés: a főoldal, egy hír oldala, az admin bejelentkező képernyője.
3. **Fontos:** rollback után a Vercel az új pusht **nem teszi automatikusan
   élesbe**, amíg a javított deployt kézzel élesbe nem teszed (*Promote*),
   vagy az *Undo Rollback*-et meg nem nyomod. A Vercel ezt a projekt oldalán
   jelzi.

**B) Visszavonás a kódban** (üzemeltető) – akkor is működik, ha régebbi
állapotra kell visszamenni:

```bash
git revert <hibás-commit-azonosító>
```

```bash
git push origin main
```

A push új deployt indít a javított kóddal (ha előtte A) is történt, ezt a
deployt kézzel kell élesbe tenni – lásd az A) 3. lépését).

### Karbantartás mód vészhelyzetben

Ha az oldal félkész vagy hibás tartalmat mutat, és a javítás időbe telik:
admin → **Szekciók → Karbantartás mód** bekapcsolása (ADMIN-UTMUTATO.md,
13. pont). Az admin ilyenkor is elérhető.

- **Supabase-kiesésnél nem segít**: a kapcsoló a Supabase-ben van, és ha az
  nem válaszol, a weboldal szándékosan a valódi oldalt mutatja („hiba esetén
  minden látszik").
- Ha az admin nem érhető el, de a Supabase igen, az üzemeltető SQL-lel is
  bekapcsolhatja (Supabase → SQL Editor):

  ```sql
  UPDATE public.feature_flags SET enabled = true WHERE flag_key = 'maintenance_mode';
  ```

  Kikapcsolás ugyanígy, `enabled = false`-szal.

### Utána

- Írd le röviden, mi történt, mikor, mi lett a megoldás (a GitHub issue-k
  között vagy a belső jegyzetekben).
- Ha kulcs vagy jelszó szivárgott ki: rotáció a 2. pont szerint.

## 7. Monitorozás (UptimeRobot)

**Mit csinál:** egy külső szolgáltatás (UptimeRobot, ingyenes csomag)
rendszeresen lekéri az oldalt, és e-mailt küld, ha nem jó választ kap – majd
még egyet, amikor helyreállt. Így egy leállásról nem a látogatóktól
értesülünk.

> A lépéseket az UptimeRobot leírásai alapján írtuk (2026-10), a felületet nem
> kattintottuk végig – ha egy menüpontot máshogy hívnak, a logika ugyanaz.

### Mit figyelünk

| # | Figyelő neve | Típus | Cím | Gyakoriság | Ha piros, akkor… |
|---|---|---|---|---|---|
| 1 | KGK – főoldal | **Keyword** (kulcsszó) | `https://kozgazdaszklub.com/` | 5 perc | az oldal nem érhető el, vagy nem a mi oldalunk jön (pl. lejárt domain, rossz DNS) |
| 2 | KGK – adatbázis | **HTTP(s)** | `https://kozgazdaszklub.com/api/health` | 5 perc | a Supabase nem válaszol: a weboldalon a tartalom helyén „Nem sikerült betölteni" áll, az adminba nem lehet belépni |
| 3 | KGK – e-mail | **HTTP(s)** | `https://kozgazdaszklub.com/api/health?deep=1&token=<HEALTH_CHECK_TOKEN>` | 60 perc | a kapcsolat űrlap nem tud levelet küldeni |

### A `/api/health` válaszai

| Válasz | Jelentés |
|---|---|
| `200` `{"status":"ok"}` | minden rendben |
| `503` `{"status":"error","failed":["database"]}` | a Supabase 3 másodpercen belül nem válaszolt, vagy hibát adott |
| `503` `{"status":"error","failed":["email"]}` | (csak `?deep=1`) a Gmail-bejelentkezés nem sikerült, vagy a Vercelen hiányzik egy `SMTP_…` / `CONTACT_EMAIL_TO` változó |
| `503` `{"status":"error","failed":["database","email"]}` | mindkettő |
| `401` `{"status":"unauthorized"}` | (csak `?deep=1`) hiányzó vagy hibás token, vagy a Vercelen nincs beállítva a `HEALTH_CHECK_TOKEN` |
| `405` `{"status":"method_not_allowed"}` | nem GET / HEAD kérés |

A válaszban szándékosan nincs több részlet (hibaüzenet, kulcs, e-mail cím). A
pontos ok a Vercel naplójában van: Vercel → Project → **Logs** → szűrés:
`/api/health`.

A válasz soha nem kerül gyorsítótárba (`Cache-Control: no-store`), és a
keresők nem veszik fel (`X-Robots-Tag: noindex`). A sitemapban nincs benne.

### Karbantartás módban is 200 – ez rendben van

A karbantartás mód a böngészőben kapcsol be: a `maintenance.js` takarja le az
oldalt. A szerver mindkét esetben **ugyanazt a HTML-t** küldi, a figyelő pedig
nem futtat JavaScriptet – tehát a főoldal figyelője karbantartás alatt is
zöld. Ez így helyes: a figyelő azt nézi, hogy **elérhető-e** az oldal, nem
azt, hogy mit lát a látogató. A `/api/health` sem nézi a kapcsolót: a
karbantartás szándékos állapot, nem hiba.

**Ezeket a figyelők NEM jelzik:**

- ha a karbantartás mód bekapcsolva maradt → admin → *Szekciók* fül;
- ha egy rossz deploy után a JavaScript elromlik (a HTML megjön, de a
  szekciók nem töltődnek be) → deploy után mindig nézz rá az oldalra
  (README → *Deploy*);
- a hír-oldalak és az admin felület egyedi hibái.

**Miért kulcsszavas a főoldal figyelője?** A sima 200 félrevezető lehet: egy
lejárt domain parkoló oldala vagy egy elállított DNS mögötti idegen oldal is
200-at ad. A kulcsszó (`maintenance.js`) minden publikus oldalunk fejében
ott áll, és szándékosan nem változik (README, 4. buktató) – egy idegen oldalon
nem szerepel. A neve ellenére **nem** a karbantartás módot figyeli, csak azt,
hogy a mi oldalunk jön-e.

A `/api/health`-hez nem kell kulcsszó: a válasz kódja (200 / 503) maga a
jelzés.

### Miért csak óránként az e-mail-ellenőrzés, és miért kell hozzá token

Az e-mail-ellenőrzés minden alkalommal **valódi bejelentkezés** a küldő Gmail
fiókba. 5 percenként ez napi 288 bejelentkezés változó címekről – a Google ezt
gyanúsnak veheti, és letilthatja a fiókot, épp a kapcsolat űrlapot állítva le.
Ha pedig bárki elindíthatná, a sorozatos sikertelen bejelentkezésekkel a fiókot
is zárolhatná. Ezért:

- token nélkül nem fut (`401`);
- tokennel is legfeljebb 10 percenként jelentkezik be ténylegesen (a közben
  érkező kérések az előző eredményt kapják);
- a figyelőben **60 perc** (vagy ritkább) legyen.

Az UptimeRobot ingyenes csomagja nem küld egyedi fejlécet (az UptimeRobot
leírása szerint az fizetős funkció), ezért a token **a címbe** kerül
(`&token=…`). Így látszik az UptimeRobot felületén és a Vercel naplójában –
kis tétű titok, de ne oszd meg, és ha kiszivárgott, cseréld (2. pont →
*Rotáció: `HEALTH_CHECK_TOKEN`*). A végpont az `Authorization: Bearer <token>`
fejlécet is elfogadja, ha egyszer olyan figyelőre váltasz, ami tud fejlécet
küldeni (a cím akkor token nélkül: `…/api/health?deep=1`).

### Beállítás lépésenként

**1. Token készítése** (csak a 3. figyelőhöz kell)

- Jelszókezelővel: véletlen jelszó, **legalább 40 karakter, csak betű és
  szám** (speciális karakter nélkül, mert a címbe kerül).
- Vagy ha van Node.js a gépen:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- 32 karakternél rövidebb tokent a végpont nem fogad el (`401`).

**2. A token a Vercelen**

1. Vercel → Project → **Settings → Environment Variables** → **Add**: név
   `HEALTH_CHECK_TOKEN`, érték a token, környezet: **Production** → Save.
2. **Redeploy** (Deployments → a legutóbbi Production deploy → **⋯ →
   Redeploy**) – a változó csak az új deployban él.
3. Próba böngészőben: `https://kozgazdaszklub.com/api/health?deep=1&token=<a token>`
   → `{"status":"ok"}`. Ha `{"status":"unauthorized"}`: a token nem egyezik,
   vagy a redeploy még nem futott le.

**3. UptimeRobot fiók**

1. Regisztráció az uptimerobot.com-on, **Free** csomag. A riasztások a fiók
   e-mail címére mennek – ez az üzemeltető címe, vagy egy klub által kezelt
   cím legyen.
2. Kapcsold be a fiókban a kétlépcsős azonosítást (mint a 4. pontban).

**4. „KGK – főoldal" figyelő**

1. **New monitor** → típus: **Keyword**.
2. URL: `https://kozgazdaszklub.com/`
3. Keyword: `maintenance.js` – riasztás, ha a kulcsszó **nem** szerepel
   („Keyword not exists").
4. Interval: **5 perc**. Alert contact: a saját e-mail címed → Create.

**5. „KGK – adatbázis" figyelő**

1. **New monitor** → típus: **HTTP(s)**.
2. URL: `https://kozgazdaszklub.com/api/health`
3. Interval: **5 perc**, alert contact: a saját címed → Create.

**6. „KGK – e-mail" figyelő**

1. **New monitor** → típus: **HTTP(s)**.
2. URL: `https://kozgazdaszklub.com/api/health?deep=1&token=<a token>`
3. Interval: **60 perc** → Create.
4. Ezt a figyelőt **csak egy** UptimeRobot fiókban állítsd be – egy második
   példány kétszer annyi Gmail-bejelentkezést jelentene.

**7. Riasztás a tartalék tulajdonosnak (nem kötelező)**

Az ingyenes csomag riasztásait alapból a fiók e-mail címe kapja. Ha a
felületen (Integrations / Alert contacts) fel tudsz venni egy második e-mail
címet, vedd fel a tartalék tulajdonosét, és kapcsold rá az 1. és a 2.
figyelőre. Ha ez fizetős csomaghoz kötött, két ingyenes út van:

- **A)** a tartalék tulajdonos saját, ingyenes UptimeRobot fiókot nyit, és
  abban felveszi az **1. és a 2.** figyelőt (a 3.-at nem, lásd fent). Ez egyben
  tartalék is, ha az egyik fiók elérhetetlenné válik.
- **B)** a te postafiókodban egy szűrő továbbítja neki az UptimeRobot
  leveleit (Gmail: Beállítások → Szűrők és letiltott címek → új szűrő →
  „Továbbítás").

**8. Próba: megérkezik-e a riasztás**

1. Ideiglenes figyelő: HTTP(s), URL
   `https://kozgazdaszklub.com/api/health?deep=1` (token **nélkül** → mindig
   401), interval 5 perc.
2. 5–10 percen belül jönnie kell egy „Down" levélnek (a tartalék
   tulajdonosnak is, ha be van állítva).
3. Töröld az ideiglenes figyelőt.

A Vercel naplójában ilyenkor `health: ?deep=1 kérés hiányzó vagy hibás
tokennel` sorok jelennek meg – ez várható.

### Ha riasztás jön

| Figyelő | Első lépés |
|---|---|
| KGK – főoldal | 6. pont → *Gyors diagnózis*, az első két sor (Vercel, DNS) |
| KGK – adatbázis | status.supabase.com és a Supabase Dashboard: szünetel-e a projekt → **Restore** (5. pont). Kulcscsere után: maradt-e régi kulcs az `api/health.js`-ben (2. pont) |
| KGK – e-mail, `503` | Vercel → Logs → `/api/health`. `EAUTH` + `535` = rossz vagy érvénytelenné vált alkalmazásjelszó (2. pont → rotáció). „hiányzó környezeti változó" = a Vercelen hiányzik a felsorolt változó. `ETIMEDOUT` / `HEALTH_TIMEOUT` = a Gmail nem volt elérhető; ha magától helyreáll, nincs teendő |
| KGK – e-mail, `401` | a token nem egyezik a Vercelen beállítottal, vagy a változó beállítása után elmaradt a Redeploy |

Javítás után az e-mail-ellenőrzés legfeljebb 10 percig még a régi eredményt
adhatja (ha ugyanaz a függvénypéldány válaszol); egy Redeploy után azonnal
friss.

### Miért UptimeRobot, és nem Better Stack?

Mindkettő megfelel; ennél az oldalnál az UptimeRobot az egyszerűbb.

| | UptimeRobot Free | Better Stack Free |
|---|---|---|
| Figyelők | 50 | 10 (a szívverés-figyelőkkel együtt) |
| Gyakoriság | 5 perc | 3 perc |
| Kulcsszavas figyelés | van | van |
| Riasztás | e-mail | e-mail, Slack |
| Egyedi fejléc (token fejlécben) | csak fizetős | a leírása szerint beállítható; hogy ingyenesen is, nem ellenőriztük |
| Felhasználás | a feltételei szerint bármilyen; a csomag leírása: hobbi- és nonprofit projektekhez | „personal projects" |

(A szolgáltatók oldalai alapján, 2026-10-24.) A Better Stack két előnye – a
3 perc és a fejlécben küldhető token – itt keveset számít: egy klub-oldalnál a
2 perc különbség nem lényeges, a token pedig kis tétű.
