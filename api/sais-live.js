// api/sais-live.js
// Vercel Serverless Function — proxy orari SAIS Autolinee / SAIS Trasporti
//
// STATO ATTUALE: stub — l'endpoint dell'API SAIS non è ancora stato scoperto.
//
// ─── COME COMPLETARE L'INTEGRAZIONE ────────────────────────────────────────
// 1. Aprire booking.saisautolinee.it nel browser (Chrome/Firefox)
// 2. Aprire DevTools → scheda Network → filtra per XHR/Fetch
// 3. Fare una ricerca corse (es. Catania → Palermo, data odierna)
// 4. Trovare la richiesta che restituisce JSON con le corse (orario, posti, ecc.)
// 5. Fare clic destro → "Copy as cURL" e analizzare URL + header + corpo
// 6. Aggiornare: SAIS_LIVE_CONFIGURED, SAIS_API_URL, STOP_IDS, CARRIER_IDS
//    e la funzione parseSaisResponse() qui sotto
// ───────────────────────────────────────────────────────────────────────────
//
// Risposta al frontend:
//   { status: 'live' | 'not_configured' | 'error', corse: [...], date, from, to }
//   Ogni corsa: { dep, arr, carrier, carrierId, route, code, seats, bookUrl }

// ── Configurazione (da aggiornare dopo aver trovato l'API) ──────────────────
const SAIS_LIVE_CONFIGURED = false;

const SAIS_API_URL = null;
// es: 'https://api.booking.saisautolinee.it/v1/search'

// Stop IDs usati dall'API SAIS (da scoprire via DevTools)
const STOP_IDS = {
  catania:       null,
  palermo:       null,
  messina:       null,
  agrigento:     null,
  caltanissetta: null,
  enna:          null,
  piazza_armerina: null,
};

// Carrier IDs usati dall'API SAIS (da scoprire)
const CARRIER_IDS = {
  sais:  null, // SAIS Autolinee
  saist: null, // SAIS Trasporti
};

// URL di booking per la CTA "Acquista"
const BOOK_URLS = {
  sais:  'https://booking.saisautolinee.it/it/',
  saist: 'https://www.saistrasporti.it/',
};
// ───────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SAIS_LIVE_CONFIGURED) {
    return res.status(200).json({ status: 'not_configured', corse: [] });
  }

  const { from, to, date, carrier: carrierId } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'Parametri obbligatori: from, to' });
  }

  const fromId = STOP_IDS[from.toLowerCase().replace('-', '_')];
  const toId   = STOP_IDS[to.toLowerCase().replace('-', '_')];

  if (!fromId || !toId) {
    return res.status(200).json({ status: 'not_configured', corse: [] });
  }

  const targetDate = date ||
    new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

  try {
    const params = new URLSearchParams({ from: fromId, to: toId, date: targetDate });
    const upstream = await fetch(`${SAIS_API_URL}?${params}`, {
      headers: {
        Referer:      'https://booking.saisautolinee.it/',
        'User-Agent': 'MoviCT/1.0',
      },
    });

    if (!upstream.ok) throw new Error(`Upstream ${upstream.status}`);

    const data = await upstream.json();
    const corse = parseSaisResponse(data, carrierId, from, to, targetDate);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ status: 'live', date: targetDate, from, to, corse });

  } catch (err) {
    console.error('sais-live error:', err.message);
    return res.status(200).json({ status: 'error', corse: [], detail: err.message });
  }
}

// ── Parsing risposta API SAIS ───────────────────────────────────────────────
// Da implementare quando l'API è nota.
// Formato atteso in uscita (compatibile con intercity-live):
//   [{
//     dep:       'HH:MM',               // orario partenza
//     arr:       'HH:MM',               // orario arrivo
//     carrier:   'SAIS Autolinee',
//     carrierId: 5,                     // assegna ID numerico fisso per SAIS
//     route:     'nome linea',
//     code:      'codice corsa',
//     seats:     12,                    // posti disponibili (0 = esaurito)
//     bookUrl:   'https://...',
//   }]
function parseSaisResponse(data, carrierId, from, to, date) {
  // TODO: implementare dopo aver analizzato il formato JSON reale
  return [];
}
