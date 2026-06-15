// api/elerent-gbfs.js
// Vercel Serverless Function — proxy CORS per il feed GBFS v3 pubblico di Elérent Catania.
//
// Fonte: https://elerent.rideatom.com/gbfs/v3_0/en/vehicle_status?id=2166
// Feed pubblico, nessuna API key richiesta.
// Mappa i veicoli GBFS v3 nella forma attesa da ScooterApp.jsx.

const GBFS_URL =
  "https://elerent.rideatom.com/gbfs/v3_0/en/vehicle_status?id=2166";

// max_range_meters dichiarato da vehicle_types (id 3866) — usato per calcolare
// la percentuale di batteria come current_range_meters / MAX_RANGE.
const MAX_RANGE = 1_000_000;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    const response = await fetch(GBFS_URL, {
      headers: { "User-Agent": "MoviCT/1.0 (app mobilità Catania)" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
      return res.status(200).json({
        data: { bikes: [] },
        _source: "elerent",
        _status: "unavailable",
        _http: response.status,
      });
    }

    const json = await response.json();
    const vehicles = json?.data?.vehicles ?? [];

    const bikes = vehicles
      .filter((v) => !v.is_reserved && !v.is_disabled)
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

function toGbfsBike(v) {
  const range = typeof v.current_range_meters === "number" ? v.current_range_meters : null;
  return {
    bike_id: String(v.vehicle_id),
    lat: v.lat,
    lon: v.lon,
    is_disabled: v.is_disabled ?? false,
    is_reserved: v.is_reserved ?? false,
    current_fuel_percent: range != null ? Math.min(range / MAX_RANGE, 1) : null,
    current_range_meters: null, // non mostriamo km (max_range dichiarato non è realistico)
    rental_uris: v.rental_uris ?? null, // { android, ios, web } — deep link diretto al mezzo
    vehicle_type_id: v.vehicle_type_id ?? null,
  };
}
