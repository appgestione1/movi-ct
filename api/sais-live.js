// api/sais-live.js
// Vercel Serverless Function — proxy orari SAIS Autolinee in tempo reale
//
// Backend scoperto: Albatross Gateway v8.2 (SITRAP srl) su api.saisautolinee.it
// - /stops    → 200 pubblico   (locality IDs già estratti qui sotto)
// - /trips    → 401 auth req.  (POST con Bearer token)
//
// ─── PER ATTIVARE IL LIVE ────────────────────────────────────────────────────
// 1. Installa mitmproxy o Charles Proxy sul PC/telefono
// 2. Apri l'app SAIS Autolinee (com.sitrap.sais) e fai una ricerca corse
// 3. Cattura la chiamata POST a api.saisautolinee.it/trips
// 4. Copia il valore dell'header Authorization (es. "Bearer eyJ...")
// 5. Aggiungilo come variabile d'ambiente in Vercel: SAIS_BEARER_TOKEN=eyJ...
// 6. Imposta SAIS_LIVE_CONFIGURED=true (variabile d'ambiente Vercel)
//    oppure cambia il valore qui sotto
//
// Alternativa: contatta SITRAP srl (info@sitrap.it) per accesso API partner.
// ─────────────────────────────────────────────────────────────────────────────

// Legge la config da env Vercel per non dover ricommittare
const SAIS_LIVE_CONFIGURED =
  process.env.SAIS_LIVE_CONFIGURED === 'true' || false;

const SAIS_API_URL = 'https://api.saisautolinee.it/trips';

// Locality IDs estratti da api.saisautolinee.it/stops (pubblico)
// Usati come parametri departureLocalityId / arrivalLocalityId nel POST
const LOCALITY_IDS = {
  catania:     '342bcab3-e36a-45b7-bf19-8ac39ee8fdf4',
  palermo:     'c518e433-60ab-4762-b74e-959160a7e743',
  messina:     '94393218-6067-4adf-a8f6-fda6ad592bb6',
  siracusa:    '1c84b45d-58fe-4450-aa90-7b3fb07ed49d',
  enna:        'b5ccfa49-6ce6-4cfc-91e4-264f07fcfde3',
  // Note: Agrigento e Caltanissetta sono SAIS Trasporti, sistema diverso
};

// Stop ID "purchasable" preferito per città (per SAIS, Catania = Aeroporto Terminal Bus)
const PREFERRED_STOP = {
  catania: 'ab3ddeef-767f-42aa-961d-0c6c87064015', // IT15CTCAAATA — Terminal Bus
};

const BOOK_BASE = 'https://booking.saisautolinee.it/it/';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SAIS_LIVE_CONFIGURED) {
    return res.status(200).json({ status: 'not_configured', corse: [] });
  }

  const token = process.env.SAIS_BEARER_TOKEN;
  if (!token) {
    console.warn('sais-live: SAIS_BEARER_TOKEN non configurato');
    return res.status(200).json({ status: 'not_configured', corse: [] });
  }

  const { from, to, date } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'Parametri obbligatori: from, to' });
  }

  const fromKey = from.toLowerCase().replace(/-/g, '');
  const toKey   = to.toLowerCase().replace(/-/g, '');
  const fromLocalityId = LOCALITY_IDS[fromKey] || LOCALITY_IDS[from.toLowerCase()];
  const toLocalityId   = LOCALITY_IDS[toKey]   || LOCALITY_IDS[to.toLowerCase()];

  if (!fromLocalityId || !toLocalityId) {
    return res.status(200).json({
      status: 'not_configured',
      corse: [],
      reason: `Città non coperta da SAIS Autolinee: ${!fromLocalityId ? from : to}`,
    });
  }

  const targetDate = date ||
    new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

  // ── Corpo POST per Albatross Gateway ──────────────────────────────────────
  // Schema ipotizzato dal reverse dell'API — adattare dopo aver catturato
  // una richiesta reale dall'app mobile (step 3 nelle istruzioni sopra).
  const body = {
    departureLocalityId: fromLocalityId,
    arrivalLocalityId:   toLocalityId,
    departureDate:       targetDate,
    passengers:          1,
    // departureStopId: PREFERRED_STOP[fromKey] || undefined,
  };

  try {
    const upstream = await fetch(SAIS_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
        'Referer':       'https://booking.saisautolinee.it/',
        'User-Agent':    'MoviCT/1.0',
        'Origin':        'https://booking.saisautolinee.it',
      },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      throw new Error(`Upstream ${upstream.status}: ${errText.slice(0, 200)}`);
    }

    const data = await upstream.json();
    const corse = parseSaisTrips(data, targetDate);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ status: 'live', date: targetDate, from, to, corse });

  } catch (err) {
    console.error('sais-live error:', err.message);
    return res.status(200).json({ status: 'error', corse: [], detail: err.message });
  }
}

// ── Parsing risposta Albatross /trips ──────────────────────────────────────
// Schema IPOTIZZATO — verificare con una risposta reale e adattare i nomi
// dei campi. L'Albatross Gateway usa tipicamente camelCase.
// Formato uscita compatibile con intercity-live.js.
function parseSaisTrips(data, date) {
  const trips = Array.isArray(data) ? data
    : Array.isArray(data?.trips)    ? data.trips
    : Array.isArray(data?.corse)    ? data.corse
    : Array.isArray(data?.results)  ? data.results
    : [];

  return trips.map(t => {
    const dep = formatTime(t.departureTime || t.dep || t.orario_partenza || '');
    const arr = formatTime(t.arrivalTime   || t.arr || t.orario_arrivo   || '');

    const seats = t.availableSeats ?? t.available_seats ?? t.seats ?? t.posti ?? null;
    const code  = t.tripCode || t.code || t.codice || '';

    return {
      dep,
      arr,
      carrier:   'SAIS Autolinee',
      carrierId: 5,
      route:     t.routeDescription || t.linea || t.route || '',
      code,
      seats:     seats !== null ? Number(seats) : null,
      bookUrl:   t.bookingUrl || t.bookUrl || BOOK_BASE,
    };
  }).filter(t => t.dep);
}

function formatTime(raw) {
  if (!raw) return '';
  // ISO 8601 → HH:MM
  if (raw.includes('T')) {
    const d = new Date(raw);
    if (!isNaN(d)) {
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
  }
  // già HH:MM o HH:MM:SS
  return raw.slice(0, 5);
}
