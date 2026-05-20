// api/intercity-live.js
// Vercel Serverless Function — proxy per orari intercity in tempo reale
// Fonte: cdn.serviziinformazioni.it (piattaforma Interbus / Etna Trasporti / Segesta)
//
// GET /api/intercity-live?from=catania&to=siracusa[&date=YYYY-MM-DD]
// Risposta: { date, from, to, corse: [{dep, arr, carrier, route, code, seats, bookUrl}] }

const API_URL =
  "https://cdn.serviziinformazioni.it/tpl/api/get_orari_multivettore.php";

// Stop IDs principali per le tratte coperte da serviziinformazioni.it
// (Interbus id=2, Etna Trasporti id=1, Segesta id=3, SicilBus id=4)
const STOP_IDS = {
  catania:    34,   // Via Archimede - Autostazione
  aeroporto:  35,   // Aeroporto Fontanarossa
  siracusa:   427,  // Corso Umberto, 196
  taormina:   92,   // Terminal Bus
  messina:    261,  // Piazza Repubblica Terminal Bus
  palermo:    170,  // Fazello Staz. FS
  enna:       368,  // Enna Centro - Viale Diaz
  ragusa:     861,  // Terminal Bus
  noto:       420,  // Via Confalonieri
  acireale:   767,  // Terminal Bus Corso Italia
  belpasso:   747,  // Via Santa Maria di Licodia
};

// Carrier names normalizzati
const CARRIER_NAMES = {
  "1": "Etna Trasporti",
  "2": "Interbus",
  "3": "Segesta",
  "4": "SicilBus",
  "7": "Isea",
  "8": "Russo",
};

// URL di prenotazione per carrier
const BOOK_URLS = {
  "2": "https://www.interbus.it/travel-plan/solution.php",
  "1": "https://www.etnatrasporti.it/travel-plan/solution.php",
  "3": "https://www.segesta.it/travel-plan/solution.php",
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { from, to, date } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: "Parametri obbligatori: from, to" });
  }

  const fromId = STOP_IDS[from.toLowerCase()];
  const toId = STOP_IDS[to.toLowerCase()];

  if (!fromId) {
    return res.status(400).json({
      error: `Città 'from' non supportata: ${from}`,
      supportate: Object.keys(STOP_IDS),
    });
  }
  if (!toId) {
    return res.status(400).json({
      error: `Città 'to' non supportata: ${to}`,
      supportate: Object.keys(STOP_IDS),
    });
  }

  // Data default = oggi (fuso Europe/Rome)
  const targetDate =
    date ||
    new Date()
      .toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" })
      .slice(0, 10);

  const apiUrl =
    `${API_URL}?cmd=lista_corse_per_relazione` +
    `&id_fermata_partenza=${fromId}` +
    `&id_fermata_destinazione=${toId}` +
    `&data_dal=${targetDate}` +
    `&data_al=${targetDate}`;

  try {
    const upstream = await fetch(apiUrl, {
      headers: {
        Referer: "https://www.interbus.it/",
        "User-Agent": "MoviCT/1.0",
      },
    });

    if (!upstream.ok) {
      throw new Error(`Upstream ${upstream.status}`);
    }

    // L'API ritorna text/html anche se il body è JSON
    const raw = await upstream.text();
    const data = JSON.parse(raw);

    const corse = data
      .filter((c) => !c.virtuale)
      .map((c) => {
        const carrierName =
          CARRIER_NAMES[c.id_vettore] || c.nome_vettore || "—";
        const bookBase = BOOK_URLS[c.id_vettore];
        const bookUrl = bookBase
          ? `${bookBase}?departure_stations=${fromId}&arrival_stations=${toId}&departure_date=${targetDate}&pax=1,0,0`
          : null;

        return {
          dep: c.orario_partenza,
          arr: c.orario_arrivo,
          carrier: carrierName,
          carrierId: Number(c.id_vettore),
          route: c.nome,
          code: c.codice,
          seats: c.posti_disponibili,
          bookUrl,
        };
      })
      .sort((a, b) => a.dep.localeCompare(b.dep));

    // Cache 60 secondi
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json({
      date: targetDate,
      from,
      to,
      fromId,
      toId,
      corse,
    });
  } catch (err) {
    console.error("intercity-live error:", err.message);
    return res.status(500).json({ error: "Errore API upstream", detail: err.message });
  }
}
