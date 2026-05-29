// api/elerent-gbfs.js
// Vercel Serverless Function — proxy per Elérent (piattaforma ATOM Mobility) Catania.
//
// Elérent gira su ATOM Mobility (rideatom.com). L'endpoint pubblico documentato
//   POST https://app.rideatom.com/openapi/v1.0/sharing/get-vehicles
// restituisce i mezzi con posizione GPS + livello batteria usando la SOLA
// App-Public-Key dell'operatore (nessun token utente/login necessario — verificato).
//
// Doc: https://app.rideatom.com/api/docs
//
// CONFIGURAZIONE (obbligatoria per i dati live):
//   Imposta la variabile d'ambiente  ELERENT_APP_PUBLIC_KEY  su Vercel
//   (Project Settings → Environment Variables) con la App-Public-Key dell'app
//   Elérent. Senza di essa il proxy risponde `needs_auth` e l'app mostra il
//   fallback "servizio non disponibile".

const ATOM_ENDPOINT = "https://app.rideatom.com/openapi/v1.0/sharing/get-vehicles";

// Centro Catania + raggio ampio per coprire l'intera area urbana.
const CATANIA = { lat: 37.5022, lon: 15.0872 };
const DEFAULT_RADIUS_KM = 20;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const appKey = process.env.ELERENT_APP_PUBLIC_KEY;
  if (!appKey) {
    // Chiave non configurata: l'app mostra il messaggio di fallback.
    return res.status(200).json({
      data: { bikes: [] },
      _source: "elerent",
      _status: "needs_auth",
    });
  }

  // Centro ricerca: usa lat/lon dal client se passati, altrimenti Catania.
  const lat = clampNum(req.query?.lat, CATANIA.lat);
  const lon = clampNum(req.query?.lon, CATANIA.lon);
  const radius = Math.round(clampNum(req.query?.radius_km, DEFAULT_RADIUS_KM));

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    const response = await fetch(ATOM_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "App-Public-Key": appKey,
        "User-Agent": "MoviCT/1.0 (app mobilità Catania)",
      },
      body: JSON.stringify({
        user_latitude: lat,
        user_longitude: lon,
        radius_in_km: radius,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (response.status === 401 || response.status === 403) {
      // Chiave presente ma rifiutata.
      return res.status(200).json({
        data: { bikes: [] },
        _source: "elerent",
        _status: "needs_auth",
      });
    }

    if (!response.ok) {
      return res.status(200).json({
        data: { bikes: [] },
        _source: "elerent",
        _status: "unavailable",
        _http: response.status,
      });
    }

    const json = await response.json();
    const bikes = (json?.vehicles ?? [])
      .filter((v) => v?.coordinates && !v.is_active_ride && !v.is_paused)
      .filter((v) => !v.type || v.type === "SCOOTER")
      .map(toGbfsBike);

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json({
      data: { bikes },
      _source: "elerent_live",
    });
  } catch {
    return res.status(200).json({
      data: { bikes: [] },
      _source: "elerent",
      _status: "unavailable",
    });
  }
}

// Mappa un veicolo ATOM nella forma GBFS-like attesa dal frontend.
function toGbfsBike(v) {
  return {
    bike_id: String(v.id),
    lat: v.coordinates.latitude,
    lon: v.coordinates.longitude,
    is_disabled: false,
    is_reserved: false,
    // battery_level ATOM è 0-100 → GBFS usa 0..1
    current_fuel_percent:
      typeof v.battery_level === "number" ? v.battery_level / 100 : null,
    // get-vehicles non espone l'autonomia in metri (solo lato admin)
    current_range_meters: null,
    // numero mezzo (es. "0001"), utile per il deep link di sblocco
    vehicle_nr: v.nr ?? null,
    vehicle_type_id: v.type ?? "SCOOTER",
  };
}

function clampNum(v, fallback) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
