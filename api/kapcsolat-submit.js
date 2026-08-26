// ============================================================
// KAPCSOLATFELVÉTELI ŰRLAP – E-MAIL KÜLDÉS
// ============================================================
// Ez fogadja a kapcsolat.html űrlapjának beküldését, és e-mailben
// továbbítja a klub postafiókjába.
//
// Miért kell szerveroldali kód?
// A böngészőből nem lehet közvetlenül e-mailt küldeni: ahhoz SMTP
// hitelesítés (felhasználónév + jelszó) kell, azt pedig soha nem
// szabad kiadni a kliensnek. Ez a függvény a Vercelen fut, ahol a
// jelszó környezeti változóként él, és a látogató soha nem látja.
//
// Útvonal: /api/kapcsolat-submit
// A Vercel az api/ mappa fájljait automatikusan végponttá alakítja,
// ezért ehhez NEM kell bejegyzés a vercel.json-be (az ott lévő
// "routes" szabály csak a /hir.html elfogásához kell).
//
// ------------------------------------------------------------
// SZÜKSÉGES KÖRNYEZETI VÁLTOZÓK (Vercel > Settings > Environment Variables)
// ------------------------------------------------------------
//   SMTP_USER          – a küldő Gmail fiók címe (kgcontact00@gmail.com)
//   SMTP_APP_PASSWORD  – ANNAK a fióknak a Google "alkalmazásjelszava"
//                        (NEM a rendes Gmail jelszó!)
//   CONTACT_EMAIL_TO   – ide érkezzenek az üzenetek (kozgazdaszklubkgk@gmail.com)
//
// Valós értéket SOHA ne írj ebbe a fájlba – csak process.env-ből olvasunk.
// ============================================================

const nodemailer = require('nodemailer');

// ============================================================
// BEÁLLÍTÁSOK
// ============================================================

// Ugyanazok a hosszkorlátok, mint a kapcsolat.html maxlength értékei.
// A böngészőben lévő korlát csak kényelmi funkció: aki közvetlenül
// küld HTTP kérést a végpontra, azt semmi nem akadályozza – ezért
// itt is ellenőrizni kell.
const MAX_HOSSZ = {
    nev:    120,
    email:  200,
    targy:  150,
    uzenet: 4000,
};

// A beolvasott kérés-törzs felső határa (100 KB). Enélkül valaki
// tetszőlegesen nagy adattal megpróbálhatná megfektetni a függvényt.
const MAX_BODY_BYTE = 100 * 1024;

// Egyszerű e-mail formátum-ellenőrzés. Szándékosan megengedő: a cím
// tényleges létezését úgysem tudjuk itt eldönteni, csak a nyilvánvaló
// hibákat (hiányzó @ vagy pont) akarjuk kiszűrni.
const EMAIL_MINTA = /^\S+@\S+\.\S+$/;

// A tárgy elé kerülő jelölés, hogy a postafiókban egyből látszódjon,
// honnan jött az üzenet (és lehessen rá szűrőt/címkét csinálni).
const TARGY_PREFIX = '[KGK Kapcsolat] ';

// SMTP időkorlátok. A Vercel függvény alapból 10 másodperc után leáll,
// ezért ez alatt kell maradnunk – különben időtúllépéssel halna el a
// kérés, és a látogató semmilyen visszajelzést nem kapna.
const SMTP_IDOKORLAT = {
    connectionTimeout: 5000, // meddig várjunk a kapcsolat felépülésére
    greetingTimeout:   5000, // meddig várjunk a szerver köszönésére
    socketTimeout:     7000, // meddig lóghat egy tétlen kapcsolat
};

// Egyszerű ütemkorlát: ugyanarról az IP-ről percenként ennyi beküldés
// mehet át. FONTOS: ez csak a MELEG függvénypéldány memóriájában él –
// hidegindításkor nullázódik, és több párhuzamos példány külön számol.
// Vagyis nem valódi védelem eltökélt támadó ellen, csak a véletlen
// duplaküldést és az egyszerű spam-hullámokat fogja meg.
const IDOABLAK_MS = 60 * 1000;
const ABLAKONKENT_MAX = 5;
const utolsoKuldesek = new Map(); // IP -> időbélyegek tömbje

// ============================================================
// SEGÉDFÜGGVÉNYEK
// ============================================================

// A kérés törzsének beolvasása.
// A Vercel a legtöbb esetben már feldolgozva adja (req.body objektum),
// de nem támaszkodunk rá: kezeljük a szöveges és a nyers (stream)
// esetet is, így a végpont akkor sem törik el, ha ez a viselkedés
// egyszer megváltozik.
async function beolvasBody(req) {
    // 1) Már feldolgozott objektum – ez a leggyakoribb eset.
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        return req.body;
    }

    // 2) Szövegként vagy bufferként kaptuk meg.
    let nyers = null;
    if (typeof req.body === 'string') nyers = req.body;
    else if (Buffer.isBuffer(req.body)) nyers = req.body.toString('utf8');

    // 3) Semmit nem kaptunk – magunk olvassuk ki a streamből.
    if (nyers === null) {
        const darabok = [];
        let meret = 0;
        for await (const darab of req) {
            meret += darab.length;
            if (meret > MAX_BODY_BYTE) throw new Error('A kérés törzse túl nagy.');
            darabok.push(darab);
        }
        nyers = Buffer.concat(darabok).toString('utf8');
    }

    nyers = String(nyers).trim();
    if (!nyers) return {};

    // JSON-t várunk (a kapcsolat.html azt küld), de ha valaki mégis
    // űrlap-formátumban küldi, azt is elfogadjuk.
    const tipus = String(req.headers['content-type'] || '').toLowerCase();
    if (tipus.includes('x-www-form-urlencoded')) {
        return Object.fromEntries(new URLSearchParams(nyers));
    }

    try {
        const ertelmezett = JSON.parse(nyers);
        return (ertelmezett && typeof ertelmezett === 'object') ? ertelmezett : {};
    } catch (err) {
        // Nem JSON – utolsó esélyként megpróbáljuk űrlapként.
        return Object.fromEntries(new URLSearchParams(nyers));
    }
}

// Egy mező kiolvasása szövegként, magyar VAGY angol kulcsnévvel.
// A kapcsolat.html mindkét változatot elküldi, de a végpont akkor is
// működjön, ha csak az egyik érkezik meg.
function mezo(body, ...kulcsok) {
    for (const kulcs of kulcsok) {
        const ertek = body[kulcs];
        if (typeof ertek === 'string' && ertek.trim()) return ertek.trim();
        // Ha tömbként érkezne (ismételt űrlapmező), az elsőt vesszük.
        if (Array.isArray(ertek) && typeof ertek[0] === 'string' && ertek[0].trim()) {
            return ertek[0].trim();
        }
    }
    return '';
}

// Fejlécbe kerülő értékek (tárgy, név, válaszcím) megtisztítása a
// sortörésektől. Enélkül valaki a tárgy mezőbe írt sortöréssel saját
// e-mail fejléceket (pl. Bcc) csempészhetne be – ez a "header injection".
function fejlecTisztit(szoveg) {
    return String(szoveg).replace(/[\r\n]+/g, ' ').trim();
}

// HTML-escape a levél HTML változatához: enélkül a beküldött szöveg
// tag-jei tényleges HTML-ként jelennének meg a postafiókban.
function escapeHtml(ertek) {
    return String(ertek)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// A beküldő IP-je – a Vercel az x-forwarded-for fejlécbe teszi.
function kuldoIp(req) {
    const nyers = req.headers['x-forwarded-for'] || '';
    return String(nyers).split(',')[0].trim() || 'ismeretlen';
}

// Átlépte-e ez az IP a percenkénti korlátot?
function tullepteAKorlatot(ip, most) {
    const korabbi = (utolsoKuldesek.get(ip) || []).filter(t => most - t < IDOABLAK_MS);

    // Takarítás: a Map ne nőjön a végtelenségig egy hosszan élő példányon.
    if (utolsoKuldesek.size > 500) utolsoKuldesek.clear();

    if (korabbi.length >= ABLAKONKENT_MAX) {
        utolsoKuldesek.set(ip, korabbi);
        return true;
    }

    korabbi.push(most);
    utolsoKuldesek.set(ip, korabbi);
    return false;
}

// Magyar nyelvű, olvasható időbélyeg a levélbe.
function magyarIdopont() {
    try {
        return new Date().toLocaleString('hu-HU', {
            timeZone: 'Europe/Bucharest',
            dateStyle: 'long',
            timeStyle: 'short',
        });
    } catch (err) {
        return new Date().toISOString();
    }
}

// ============================================================
// VALIDÁCIÓ
// ============================================================
// A böngésző HTML5 validációjában nem bízhatunk meg: bárki küldhet
// közvetlen HTTP kérést a végpontra, kihagyva az űrlapot.
// Visszatérés: hibaüzenet szövege, vagy null, ha minden rendben.

function ellenoriz({ nev, email, targy, uzenet }) {
    if (!nev)    return 'A név megadása kötelező.';
    if (!email)  return 'Az e-mail cím megadása kötelező.';
    if (!targy)  return 'A tárgy megadása kötelező.';
    if (!uzenet) return 'Az üzenet megadása kötelező.';

    if (!EMAIL_MINTA.test(email)) return 'Az e-mail cím formátuma nem megfelelő.';

    if (nev.length    > MAX_HOSSZ.nev)    return `A név legfeljebb ${MAX_HOSSZ.nev} karakter lehet.`;
    if (email.length  > MAX_HOSSZ.email)  return `Az e-mail cím legfeljebb ${MAX_HOSSZ.email} karakter lehet.`;
    if (targy.length  > MAX_HOSSZ.targy)  return `A tárgy legfeljebb ${MAX_HOSSZ.targy} karakter lehet.`;
    if (uzenet.length > MAX_HOSSZ.uzenet) return `Az üzenet legfeljebb ${MAX_HOSSZ.uzenet} karakter lehet.`;

    return null;
}

// ============================================================
// A LEVÉL ÖSSZEÁLLÍTÁSA
// ============================================================

function levelSzoveg({ nev, email, targy, uzenet }) {
    return [
        'Új üzenet érkezett a KGK weboldal kapcsolatfelvételi űrlapján keresztül.',
        '',
        `Név:    ${nev}`,
        `E-mail: ${email}`,
        `Tárgy:  ${targy}`,
        '',
        'Üzenet:',
        '--------------------------------------------------',
        uzenet,
        '--------------------------------------------------',
        '',
        `Beküldve: ${magyarIdopont()}`,
        'Válaszolni közvetlenül erre a levélre tudsz – a válasz a beküldőhöz megy.',
    ].join('\n');
}

function levelHtml({ nev, email, targy, uzenet }) {
    const biztonsagosEmail = escapeHtml(email);
    return `
<div style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.6;">
  <p style="margin: 0 0 18px;">Új üzenet érkezett a KGK weboldal kapcsolatfelvételi űrlapján keresztül.</p>

  <table style="border-collapse: collapse; margin-bottom: 18px;">
    <tr>
      <td style="padding: 4px 14px 4px 0; color: #666; vertical-align: top;">Név</td>
      <td style="padding: 4px 0;"><strong>${escapeHtml(nev)}</strong></td>
    </tr>
    <tr>
      <td style="padding: 4px 14px 4px 0; color: #666; vertical-align: top;">E-mail</td>
      <td style="padding: 4px 0;"><a href="mailto:${biztonsagosEmail}">${biztonsagosEmail}</a></td>
    </tr>
    <tr>
      <td style="padding: 4px 14px 4px 0; color: #666; vertical-align: top;">Tárgy</td>
      <td style="padding: 4px 0;">${escapeHtml(targy)}</td>
    </tr>
  </table>

  <div style="border-left: 4px solid #F1C039; background: #faf8f0; padding: 12px 16px; margin-bottom: 18px;">
    <div style="color: #666; font-size: 13px; margin-bottom: 6px;">Üzenet</div>
    <div style="white-space: pre-wrap;">${escapeHtml(uzenet)}</div>
  </div>

  <p style="margin: 0; color: #666; font-size: 13px;">
    Beküldve: ${escapeHtml(magyarIdopont())}<br>
    Válaszolni közvetlenül erre a levélre tudsz – a válasz a beküldőhöz megy.
  </p>
</div>`.trim();
}

// ============================================================
// SMTP KAPCSOLAT
// ============================================================
// A transporter modulszinten készül el, és a "meleg" függvénypéldányok
// újrahasználják – így nem kell minden kérésnél újra felépíteni.

let transporterCache = null;

function getTransporter() {
    if (transporterCache) return transporterCache;

    transporterCache = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // 587-en STARTTLS-sel titkosítunk, nem induláskor
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_APP_PASSWORD,
        },
        ...SMTP_IDOKORLAT,
    });

    return transporterCache;
}

// ============================================================
// A KÉRÉS KISZOLGÁLÁSA
// ============================================================

module.exports = async function handler(req, res) {
    // --- 1. Csak POST ---
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).json({ success: false, error: 'Csak POST kérés engedélyezett.' });
        return;
    }

    // --- 2. A kérés törzsének beolvasása ---
    let body;
    try {
        body = await beolvasBody(req);
    } catch (err) {
        console.error('kapcsolat-submit: a kérés törzse nem olvasható –', err.message);
        res.status(400).json({ success: false, error: 'A beküldött adat nem értelmezhető.' });
        return;
    }

    // --- 3. Mezők kiolvasása (magyar vagy angol kulcsnévvel) ---
    const adat = {
        nev:    mezo(body, 'nev', 'name'),
        email:  mezo(body, 'email'),
        targy:  mezo(body, 'targy', 'subject'),
        uzenet: mezo(body, 'uzenet', 'message'),
    };

    // --- 4. Csapda-mező (honeypot) ---
    // A kapcsolat.html-ben van egy rejtett "website" mező, amit valódi
    // látogató nem lát és nem tölt ki – az űrlapot automatikusan kitöltő
    // botok viszont igen. Ha ez ki van töltve, NEM küldünk levelet, de
    // sikert jelzünk vissza: így a bot nem tudja meg, hogy lebukott, és
    // nem kezd el másik módszerrel próbálkozni.
    if (mezo(body, 'website', 'honeypot')) {
        console.warn('kapcsolat-submit: csapda-mező kitöltve, az üzenet eldobva.');
        res.status(200).json({ success: true });
        return;
    }

    // --- 5. Validáció ---
    const hiba = ellenoriz(adat);
    if (hiba) {
        res.status(400).json({ success: false, error: hiba });
        return;
    }

    // --- 6. Ütemkorlát ---
    if (tullepteAKorlatot(kuldoIp(req), Date.now())) {
        res.setHeader('Retry-After', '60');
        res.status(429).json({
            success: false,
            error: 'Túl sok üzenetet küldtél rövid idő alatt. Kérjük, várj egy percet.',
        });
        return;
    }

    // --- 7. Környezeti változók megléte ---
    // Ha bármelyik hiányzik, a küldés úgyis elszállna – jobb, ha a
    // Vercel logban egyértelmű üzenet jelenik meg a valódi okról.
    const { SMTP_USER, SMTP_APP_PASSWORD, CONTACT_EMAIL_TO } = process.env;
    if (!SMTP_USER || !SMTP_APP_PASSWORD || !CONTACT_EMAIL_TO) {
        const hianyzik = [
            !SMTP_USER && 'SMTP_USER',
            !SMTP_APP_PASSWORD && 'SMTP_APP_PASSWORD',
            !CONTACT_EMAIL_TO && 'CONTACT_EMAIL_TO',
        ].filter(Boolean).join(', ');
        console.error(`kapcsolat-submit: hiányzó környezeti változó(k): ${hianyzik}`);
        res.status(500).json({
            success: false,
            error: 'Szerverhiba történt, kérjük próbáld újra később.',
        });
        return;
    }

    // --- 8. Levél küldése ---
    try {
        await getTransporter().sendMail({
            // A feladó KÖTELEZŐEN a saját fiókunk: a Gmail nem engedi, hogy
            // idegen címről küldjünk. A beküldő címe a replyTo-ba kerül.
            from:    `"KGK Kapcsolatfelvétel" <${SMTP_USER}>`,
            to:      CONTACT_EMAIL_TO,
            replyTo: `"${fejlecTisztit(adat.nev).replace(/"/g, "'")}" <${fejlecTisztit(adat.email)}>`,
            subject: TARGY_PREFIX + fejlecTisztit(adat.targy),
            text:    levelSzoveg(adat),
            html:    levelHtml(adat),
        });
    } catch (err) {
        // A technikai részleteket SZÁNDÉKOSAN nem adjuk vissza a kliensnek
        // (SMTP hibaüzenetek fiókneveket, szerver-adatokat szivárogtatnának).
        // A Vercel logban viszont ott a teljes hiba, ha debugolni kell:
        // Vercel > Deployments > (deploy) > Functions > kapcsolat-submit.
        console.error('kapcsolat-submit: sikertelen e-mail küldés –', err);
        res.status(500).json({
            success: false,
            error: 'Szerverhiba történt, kérjük próbáld újra később.',
        });
        return;
    }

    // --- 9. Siker ---
    res.status(200).json({ success: true });
};
