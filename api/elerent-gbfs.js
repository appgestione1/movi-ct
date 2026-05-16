// api/elerent-gbfs.js
// Vercel Serverless Function — proxy per Elérent (ex Helbiz) GBFS Catania
// Elérent non espone CORS dal browser, questo proxy aggira il problema.

// Elérent usa ancora l'infrastruttura Helbiz per il GBFS
const ENDPOINTS = [
  "https://api.helbiz.com/admin/reporting/catania/gbfs/free_bike_status.json",
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  for (const url of ENDPOINTS) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "MoviCT/1.0 (app mobilità Catania)" },
      });

      if (response.status === 401 || response.status === 403) {
        // Endpoint trovato ma richiede auth — restituiamo array vuoto con segnale
        return res.status(200).json({
          data: { bikes: [] },
          _source: "elerent",
          _status: "needs_auth",
        });
      }

      if (!response.ok) continue;

      const data = await response.json();
      res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
      return res.status(200).json({ ...data, _source: "elerent_live" });

    } catch {
      continue;
    }
  }

  // Nessun endpoint raggiungibile
  return res.status(200).json({
    data: { bikes: [] },
    _source: "elerent",
    _status: "unavailable",
  });
}
