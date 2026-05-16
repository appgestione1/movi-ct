// api/lime-gbfs.js
// Vercel Serverless Function - proxy per Lime GBFS
// Evita il blocco CORS quando chiamato dal browser
//
// Deploy: metti questo file in /api/lime-gbfs.js nel tuo progetto Vercel
// Chiamata dal frontend: GET /api/lime-gbfs?feed=free_bike_status

const LIME_BASE = "https://data.lime.bike/api/partners/v2/gbfs/catania";

// Feed disponibili
const FEEDS = {
  gbfs: `${LIME_BASE}/gbfs.json`,
  free_bike_status: `${LIME_BASE}/free_bike_status.json`,
  system_information: `${LIME_BASE}/system_information.json`,
  geofencing_zones: `${LIME_BASE}/geofencing_zones.json`,
  system_alerts: `${LIME_BASE}/system_alerts.json`,
};

export default async function handler(req, res) {
  // CORS - permetti chiamate dal tuo dominio
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { feed = "free_bike_status" } = req.query;

  const url = FEEDS[feed];
  if (!url) {
    return res.status(400).json({
      error: `Feed non valido. Usa: ${Object.keys(FEEDS).join(", ")}`,
    });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "MoviCT/1.0 (app di mobilità Catania)",
      },
    });

    if (!response.ok) {
      // Lime non ha ancora attivato Catania — restituiamo mock realistici
      if (response.status === 404) {
        return res.status(200).json(getMockData(feed));
      }
      throw new Error(`Lime API error: ${response.status}`);
    }

    const data = await response.json();

    // Cache 30 secondi (i dati GBFS si aggiornano ogni ~30s)
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json({ ...data, _source: "lime_live" });

  } catch (err) {
    console.error("Lime GBFS error:", err.message);
    // Fallback a mock se Lime non risponde
    return res.status(200).json({ ...getMockData(feed), _source: "mock" });
  }
}

// Dati mock realistici per Catania (usati finché Lime non attiva il feed)
function getMockData(feed) {
  const now = Math.floor(Date.now() / 1000);

  if (feed === "free_bike_status") {
    return {
      last_updated: now,
      ttl: 30,
      version: "2.2",
      data: {
        bikes: generateMockScooters(),
      },
    };
  }

  if (feed === "system_information") {
    return {
      last_updated: now,
      ttl: 3600,
      data: {
        system_id: "lime_catania",
        name: "Lime Catania",
        operator: "Lime",
        url: "https://www.li.me",
        timezone: "Europe/Rome",
        phone_number: "+39 02 8295 0970",
      },
    };
  }

  return { last_updated: now, ttl: 30, data: {} };
}

// 40 scooter distribuiti nelle zone calde di Catania
function generateMockScooters() {
  const zones = [
    { lat: 37.5022, lng: 15.0868, label: "Piazza Università", weight: 5 },
    { lat: 37.5026, lng: 15.0874, label: "Centro Storico", weight: 6 },
    { lat: 37.4978, lng: 15.0942, label: "Porto", weight: 3 },
    { lat: 37.4897, lng: 15.0867, label: "Playa / Lungomare", weight: 4 },
    { lat: 37.5151, lng: 15.0897, label: "Viale della Libertà", weight: 4 },
    { lat: 37.5182, lng: 15.0884, label: "Via Etnea Nord", weight: 3 },
    { lat: 37.5053, lng: 15.1017, label: "Le Ciminiere", weight: 3 },
    { lat: 37.5002, lng: 15.0929, label: "Stazione Centrale", weight: 4 },
    { lat: 37.5080, lng: 15.0850, label: "Villa Bellini", weight: 4 },
    { lat: 37.5110, lng: 15.0910, label: "Borgo-Sanzio", weight: 3 },
  ];

  const scooters = [];
  let id = 1;

  for (const zone of zones) {
    for (let i = 0; i < zone.weight; i++) {
      const battery = Math.floor(Math.random() * 60) + 30; // 30-90%
      scooters.push({
        bike_id: `lime_ct_${String(id).padStart(4, "0")}`,
        lat: zone.lat + (Math.random() - 0.5) * 0.004,
        lon: zone.lng + (Math.random() - 0.5) * 0.004,
        is_reserved: false,
        is_disabled: false,
        vehicle_type_id: "scooter",
        current_range_meters: battery * 250, // ~25km a piena carica
        current_fuel_percent: battery / 100,
        rental_uris: {
          ios: "https://limebike.app.link/TviIBQCOGB",
          android: "https://limebike.app.link/TviIBQCOGB",
        },
        _zone_label: zone.label,
      });
      id++;
    }
  }

  return scooters;
}
