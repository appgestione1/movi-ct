// api/sais-live.js
// Vercel Serverless Function — orari SAIS Autolinee in tempo reale
//
// Endpoint pubblico scoperto sul backend Albatross Gateway (SITRAP srl):
//   POST https://api.saisautolinee.it/search/s/{from}/{to}/{d1}/{d2}
//
// Non richiede login: l'unica protezione è una firma HMAC-SHA256 nell'header `s`,
// calcolata con una chiave estratta dal bundle JS del sito booking.saisautolinee.it.
// La chiave è statica → il proxy funziona in modo permanente senza token né cookie.
//
// GET /api/sais-live?from=catania&to=palermo&date=YYYY-MM-DD
// Risposta: { status, date, from, to, corse: [{dep, arr, price, changes, bookUrl}] }

import crypto from 'crypto';

const API_HOST  = 'api.saisautolinee.it';
const SIGN_KEY  = '2F0294611E814D078293452B58C324DC';
const TENANT    = 'sais';
const FRONTEND_VERSION = '8.2.335-9/3/446.288:47:233498';

// Mappa city ID interni Movì CT → nomi città accettati dall'endpoint SAIS.
// SAIS Autolinee copre: Catania, Palermo, Messina, Enna, Caltanissetta.
// (Agrigento è solo su SAIS Trasporti, sistema separato → non mappato.)
const SAIS_CITIES = {
  catania:       'Catania',
  aeroporto:     'Catania',   // il terminal aeroporto rientra in "Catania"
  palermo:       'Palermo',
  messina:       'Messina',
  enna:          'Enna',
  caltanissetta: 'Caltanissetta',
};

// ── Firma Albatross ────────────────────────────────────────────────────────
function newGuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function sign(fullUrl, method) {
  const cid = newGuid();
  const ts  = Math.floor(Date.now() / 1000);
  const nonce =
    crypto.randomBytes(16).toString('hex') +
    ':' +
    ts.toString(16).toUpperCase().padStart(16, '0');

  const params = { id: cid, nonce, ts: ts.toString() };
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&');

  const message = `${method.toUpperCase()}\n${fullUrl}\n${sortedParams}`;
  const mac = crypto
    .createHmac('sha256', Buffer.from(SIGN_KEY, 'utf8'))
    .update(message, 'utf8')
    .digest('hex');

  return `i="${cid}", t="${ts}", n="${nonce}", m="${mac}"`;
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { from, to, date } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'Parametri obbligatori: from, to' });
  }

  const fromCity = SAIS_CITIES[String(from).toLowerCase()];
  const toCity   = SAIS_CITIES[String(to).toLowerCase()];

  // Città non coperta da SAIS Autolinee → fallback lato client (orari statici)
  if (!fromCity || !toCity) {
    return res.status(200).json({
      status: 'not_configured',
      corse: [],
      reason: `Tratta non coperta da SAIS Autolinee: ${!fromCity ? from : to}`,
    });
  }

  const targetDate =
    date || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

  const path =
    `/search/s/${encodeURIComponent(fromCity)}/${encodeURIComponent(toCity)}` +
    `/${targetDate}/${targetDate}` +
    `?channel=1&reservationId=&inStaging=false&isReturn=false` +
    `&excludeExternals=false&partial=false&caller=&changeDate=false&locale=it&coupon=`;
  const fullUrl = `https://${API_HOST}${path}`;
  const body = '[{"fId":null,"extra":{},"subGroupId":0}]';

  try {
    const upstream = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'accept-language': 'it',
        'albatross-tenant': TENANT,
        charset: 'utf8',
        'content-type': 'application/json',
        'frontend-version': FRONTEND_VERSION,
        iw: '363',
        ih: '608',
        sc: '1',
        s: sign(fullUrl, 'POST'),
        origin: 'https://booking.saisautolinee.it',
        referer: 'https://booking.saisautolinee.it/',
        'user-agent':
          'Mozilla/5.0 (Linux; Android 6.0; Nexus 5) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
      },
      body,
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      throw new Error(`Upstream ${upstream.status}: ${errText.slice(0, 150)}`);
    }

    const data = await upstream.json();
    const corse = parseSaisSearch(data, fromCity, toCity, targetDate);

    // Nessuna corsa live (tratta non servita in questo verso, o giorno senza
    // servizio): ripiega sugli orari statici verificati lato client.
    if (corse.length === 0) {
      return res.status(200).json({
        status: 'not_configured',
        corse: [],
        reason: 'Nessuna corsa SAIS live per questa tratta/data',
      });
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      status: 'live',
      date: targetDate,
      from,
      to,
      corse,
    });
  } catch (err) {
    console.error('sais-live error:', err.message);
    return res.status(200).json({ status: 'error', corse: [], detail: err.message });
  }
}

// ── Parsing risposta /search/s ─────────────────────────────────────────────
// La risposta è un array di "gruppi soluzione": ogni gruppo ha trips[] (tratte),
// calculatedPrice, fullPrice. Lo stesso viaggio compare più volte (fermate di
// partenza diverse all'interno della città) → si deduplica per sequenza tripId,
// tenendo la variante con la partenza più mattutina (il terminal di origine).
function parseSaisSearch(data, fromCity, toCity, date) {
  if (!Array.isArray(data)) return [];

  const byJourney = {};
  for (const g of data) {
    if (!g || !Array.isArray(g.trips) || g.trips.length === 0) continue;
    if (g.trips.some((t) => t.trip && (t.trip.canceled || t.trip.blocked))) continue;

    const key = g.trips.map((t) => t.trip && t.trip.tripId).join('|');
    const prev = byJourney[key];
    if (!prev || g.trips[0].departureDateTime < prev.trips[0].departureDateTime) {
      byJourney[key] = g;
    }
  }

  const bookUrl =
    `https://booking.saisautolinee.it/it/from/${encodeURIComponent(fromCity)}` +
    `/${date.slice(2).replace(/-/g, '')}/to/${encodeURIComponent(toCity)}/?adulti=1`;

  const all = Object.values(byJourney)
    .map((g) => {
      const first = g.trips[0];
      const last = g.trips[g.trips.length - 1];
      const price = g.calculatedPrice ?? g.fullPrice ?? null;
      return {
        dep: hhmm(first.departureDateTime),
        arr: hhmm(last.arrivalDateTime),
        price: price !== null ? Number(price) : null,
        changes: g.trips.length - 1,
        carrier: 'SAIS Autolinee',
        bookUrl,
      };
    })
    .filter((c) => c.dep);

  // Se esistono corse dirette, mostra solo quelle: la ricerca SAIS include
  // anche combinazioni con cambi assurde (es. Catania→Messina in 5h con 2
  // cambi quando il diretto impiega 1h20). Solo se non c'è nessun diretto
  // si mostrano le corse con cambio.
  const direct = all.filter((c) => c.changes === 0);
  return (direct.length > 0 ? direct : all).sort((a, b) =>
    a.dep.localeCompare(b.dep),
  );
}

// "2026-05-22T13:35:00+00:00" → "13:35" (l'ora è già locale Europe/Rome)
function hhmm(iso) {
  if (!iso || typeof iso !== 'string' || iso.length < 16) return '';
  return iso.slice(11, 16);
}
