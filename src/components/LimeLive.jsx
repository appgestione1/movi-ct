import { useState, useEffect, useCallback, useRef } from "react";

// In produzione usa il proxy Vercel; in locale usa il mock integrato
const USE_MOCK = import.meta.env.DEV;
const PROXY_URL = "/api/lime-gbfs?feed=free_bike_status";
const REFRESH_INTERVAL = 30000; // 30 secondi

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const ZONES = [
  { lat: 37.5022, lng: 15.0868, label: "Piazza Università", w: 5 },
  { lat: 37.5026, lng: 15.0874, label: "Centro Storico", w: 6 },
  { lat: 37.4978, lng: 15.0942, label: "Porto", w: 3 },
  { lat: 37.4897, lng: 15.0867, label: "Playa / Lungomare", w: 4 },
  { lat: 37.5151, lng: 15.0897, label: "Viale della Libertà", w: 4 },
  { lat: 37.5182, lng: 15.0884, label: "Via Etnea Nord", w: 3 },
  { lat: 37.5053, lng: 15.1017, label: "Le Ciminiere", w: 3 },
  { lat: 37.5002, lng: 15.0929, label: "Stazione Centrale", w: 4 },
  { lat: 37.5080, lng: 15.0850, label: "Villa Bellini", w: 4 },
  { lat: 37.5110, lng: 15.0910, label: "Borgo-Sanzio", w: 3 },
];

function generateMock() {
  const bikes = [];
  let id = 1;
  for (const z of ZONES) {
    for (let i = 0; i < z.w; i++) {
      const batt = Math.floor(Math.random() * 60) + 30;
      bikes.push({
        bike_id: `lime_ct_${String(id).padStart(4, "0")}`,
        lat: z.lat + (Math.random() - 0.5) * 0.004,
        lon: z.lng + (Math.random() - 0.5) * 0.004,
        current_fuel_percent: batt / 100,
        current_range_meters: batt * 250,
        _zone_label: z.label,
        is_reserved: false,
        is_disabled: false,
      });
      id++;
    }
  }
  return bikes;
}

// ─── MAP UTILS ───────────────────────────────────────────────────────────────
const MAP = { minLat: 37.482, maxLat: 37.528, minLng: 15.078, maxLng: 15.110 };

function toXY(lat, lng, W, H) {
  const x = ((lng - MAP.minLng) / (MAP.maxLng - MAP.minLng)) * W;
  const y = ((MAP.maxLat - lat) / (MAP.maxLat - MAP.minLat)) * H;
  return { x, y };
}

function battColor(pct) {
  if (pct >= 0.6) return "#C8F135";
  if (pct >= 0.3) return "#FFB347";
  return "#FF6B6B";
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────
function BattBar({ pct }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 48, height: 8, borderRadius: 4,
        background: "#1a2a3a", overflow: "hidden",
      }}>
        <div style={{
          width: `${pct * 100}%`, height: "100%",
          background: battColor(pct), borderRadius: 4,
          transition: "width 0.3s",
        }} />
      </div>
      <span style={{ fontSize: 11, color: battColor(pct), fontWeight: 700 }}>
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}

function ScooterPin({ x, y, scooter, selected, onClick }) {
  const color = battColor(scooter.current_fuel_percent);
  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      {selected && (
        <circle cx={x} cy={y} r={14} fill={color} opacity={0.25} />
      )}
      <circle cx={x} cy={y} r={selected ? 7 : 5}
        fill={color}
        stroke={selected ? "#fff" : "#0d1b2a"}
        strokeWidth={selected ? 2 : 1}
      />
      <circle cx={x} cy={y} r={2} fill="#0d1b2a" />
    </g>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
export default function LimeLive({ onBack }) {
  const [scooters, setScooters] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [source, setSource] = useState("—");
  const [countdown, setCountdown] = useState(30);
  const [filter, setFilter] = useState("all"); // all | high | low
  const svgRef = useRef(null);
  const [svgSize, setSvgSize] = useState({ W: 380, H: 320 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let bikes;
      if (USE_MOCK) {
        await new Promise(r => setTimeout(r, 600));
        bikes = generateMock();
        setSource("mock");
      } else {
        const res = await fetch(PROXY_URL);
        const json = await res.json();
        bikes = json.data?.bikes || [];
        setSource(json._source || "live");
      }
      setScooters(bikes);
      setLastUpdate(new Date());
      setCountdown(30);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setSvgSize({ W: width, H: Math.round(width * 0.75) });
    });
    if (svgRef.current) obs.observe(svgRef.current);
    return () => obs.disconnect();
  }, []);

  const { W, H } = svgSize;

  const filtered = scooters.filter(s => {
    if (filter === "high") return s.current_fuel_percent >= 0.6;
    if (filter === "low") return s.current_fuel_percent < 0.3;
    return true;
  });

  const selectedScooter = selected ? scooters.find(s => s.bike_id === selected) : null;

  const stats = {
    total: scooters.length,
    high: scooters.filter(s => s.current_fuel_percent >= 0.6).length,
    mid: scooters.filter(s => s.current_fuel_percent >= 0.3 && s.current_fuel_percent < 0.6).length,
    low: scooters.filter(s => s.current_fuel_percent < 0.3).length,
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070d16",
      color: "#e8e4dc",
      fontFamily: "'DM Mono', 'Courier New', monospace",
      paddingBottom: 80,
    }}>

      {/* HEADER */}
      <div style={{
        background: "#0d1b2a",
        borderBottom: "1px solid #1e3a5a",
        padding: "16px 16px 12px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "#C8F135", display: "flex",
            alignItems: "center", justifyContent: "center",
            fontSize: 18, flexShrink: 0,
          }}>🛴</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
              Lime · Catania Live
            </div>
            <div style={{ fontSize: 10, color: "#6b8aaa" }}>
              {lastUpdate
                ? `Aggiornato: ${lastUpdate.toLocaleTimeString("it-IT")}`
                : "Caricamento…"}
              {" · "}fonte: <span style={{ color: source === "live" ? "#C8F135" : "#FFB347" }}>
                {source}
              </span>
            </div>
          </div>
          <button onClick={fetchData} disabled={loading} style={{
            background: loading ? "#1a2a3a" : "#C8F135",
            color: "#0d1b2a", border: "none", borderRadius: 8,
            padding: "6px 12px", fontSize: 11, fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}>
            {loading ? "…" : `↺ ${countdown}s`}
          </button>
        </div>

        {/* STATS BAR */}
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { label: "Totale", val: stats.total, color: "#e8e4dc" },
            { label: "Alta 🟢", val: stats.high, color: "#C8F135" },
            { label: "Media 🟡", val: stats.mid, color: "#FFB347" },
            { label: "Bassa 🔴", val: stats.low, color: "#FF6B6B" },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, background: "#070d16", borderRadius: 8,
              padding: "6px 4px", textAlign: "center",
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 9, color: "#6b8aaa" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FILTRI */}
      <div style={{ display: "flex", gap: 6, padding: "10px 16px 0" }}>
        {[
          { id: "all", label: "Tutti" },
          { id: "high", label: "🟢 Alta batteria" },
          { id: "low", label: "🔴 Bassa batteria" },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            flex: 1, padding: "6px 4px", border: "none", borderRadius: 8,
            background: filter === f.id ? "#C8F135" : "#0d1b2a",
            color: filter === f.id ? "#0d1b2a" : "#6b8aaa",
            fontSize: 10, fontWeight: 700, cursor: "pointer",
            fontFamily: "inherit",
          }}>{f.label}</button>
        ))}
      </div>

      {/* MAPPA SVG */}
      <div ref={svgRef} style={{ padding: "12px 16px 0" }}>
        <div style={{
          background: "#0d1b2a",
          border: "1px solid #1e3a5a",
          borderRadius: 16, overflow: "hidden",
        }}>
          <svg width={W} height={H} onClick={() => setSelected(null)}>
            <defs>
              <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0a1628" />
                <stop offset="100%" stopColor="#0d2040" />
              </linearGradient>
            </defs>
            <rect width={W} height={H} fill="url(#bg)" />

            {/* Griglia */}
            {[...Array(6)].map((_, i) => (
              <line key={`h${i}`} x1={0} y1={i * H / 5} x2={W} y2={i * H / 5}
                stroke="#ffffff06" strokeWidth={1} />
            ))}
            {[...Array(7)].map((_, i) => (
              <line key={`v${i}`} x1={i * W / 6} y1={0} x2={i * W / 6} y2={H}
                stroke="#ffffff06" strokeWidth={1} />
            ))}

            {/* Costa Est */}
            <rect x={W * 0.94} y={0} width={W * 0.06} height={H}
              fill="#0a1e3a" opacity={0.7} />
            <text x={W * 0.96} y={H * 0.5} fill="#1e4080" fontSize={9}
              fontFamily="monospace" writingMode="tb">MAR IONIO</text>

            {/* Etna (nord-ovest) */}
            <polygon
              points={`${W * 0.08},${H * 0.05} ${W * 0.15},${H * 0.22} ${W * 0.01},${H * 0.22}`}
              fill="#1a0a0a" opacity={0.5}
            />
            <text x={W * 0.08} y={H * 0.28} textAnchor="middle"
              fill="#ff440040" fontSize={8} fontFamily="monospace">🌋 ETNA</text>

            {/* Landmarks */}
            {ZONES.map((z, i) => {
              const { x, y } = toXY(z.lat, z.lng, W, H);
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r={3} fill="#ffffff10" />
                  <text x={x + 4} y={y - 4} fill="#ffffff20" fontSize={7}
                    fontFamily="monospace">{z.label}</text>
                </g>
              );
            })}

            {/* SCOOTER */}
            {filtered.map(s => {
              const { x, y } = toXY(s.lat, s.lon, W, H);
              return (
                <ScooterPin
                  key={s.bike_id}
                  x={x} y={y}
                  scooter={s}
                  selected={selected === s.bike_id}
                  onClick={e => { e.stopPropagation(); setSelected(s.bike_id); }}
                />
              );
            })}

            {loading && (
              <rect width={W} height={H} fill="#070d1680" />
            )}
          </svg>
        </div>
      </div>

      {/* DETTAGLIO SCOOTER SELEZIONATO */}
      {selectedScooter ? (
        <div style={{
          margin: "12px 16px 0",
          background: "#0d1b2a",
          border: `1px solid ${battColor(selectedScooter.current_fuel_percent)}40`,
          borderRadius: 14, padding: "14px 16px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: "#6b8aaa", marginBottom: 2 }}>SCOOTER SELEZIONATO</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                {selectedScooter.bike_id}
              </div>
              {selectedScooter._zone_label && (
                <div style={{ fontSize: 11, color: "#6b8aaa", marginTop: 2 }}>
                  📍 {selectedScooter._zone_label}
                </div>
              )}
            </div>
            <button onClick={() => setSelected(null)} style={{
              background: "#1a2a3a", border: "none", borderRadius: 8,
              color: "#6b8aaa", padding: "4px 10px", cursor: "pointer",
              fontSize: 16, fontFamily: "inherit",
            }}>✕</button>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, background: "#070d16", borderRadius: 8, padding: "10px" }}>
              <div style={{ fontSize: 10, color: "#6b8aaa", marginBottom: 4 }}>Batteria</div>
              <BattBar pct={selectedScooter.current_fuel_percent} />
            </div>
            <div style={{ flex: 1, background: "#070d16", borderRadius: 8, padding: "10px" }}>
              <div style={{ fontSize: 10, color: "#6b8aaa", marginBottom: 4 }}>Autonomia</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                ~{Math.round(selectedScooter.current_range_meters / 1000)} km
              </div>
            </div>
          </div>

          <a
            href={selectedScooter.rental_uris?.ios || "https://www.li.me"}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block", textAlign: "center",
              background: "#C8F135", color: "#0d1b2a",
              padding: "10px", borderRadius: 10,
              fontWeight: 700, fontSize: 13,
              textDecoration: "none",
            }}
          >
            🛴 Apri in Lime App
          </a>
        </div>
      ) : (
        <div style={{
          margin: "12px 16px 0",
          background: "#0d1b2a20",
          border: "1px solid #1e3a5a",
          borderRadius: 12, padding: "12px 16px",
          textAlign: "center", color: "#6b8aaa", fontSize: 12,
        }}>
          Tocca uno scooter sulla mappa per i dettagli
        </div>
      )}

      {/* LISTA SCOOTER */}
      <div style={{ padding: "12px 16px 0" }}>
        <div style={{ fontSize: 10, color: "#6b8aaa", letterSpacing: 1, marginBottom: 8 }}>
          SCOOTER DISPONIBILI ({filtered.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
          {[...filtered]
            .sort((a, b) => b.current_fuel_percent - a.current_fuel_percent)
            .map(s => (
              <div key={s.bike_id}
                onClick={() => setSelected(s.bike_id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: selected === s.bike_id ? "#0d2a3a" : "#0d1b2a",
                  border: `1px solid ${selected === s.bike_id ? "#C8F135" : "#1e3a5a"}`,
                  borderRadius: 10, padding: "10px 12px",
                  cursor: "pointer",
                }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: battColor(s.current_fuel_percent) + "22",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14,
                }}>🛴</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#fff", fontWeight: 600 }}>
                    {s.bike_id}
                  </div>
                  {s._zone_label && (
                    <div style={{ fontSize: 10, color: "#6b8aaa" }}>{s._zone_label}</div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <BattBar pct={s.current_fuel_percent} />
                  <div style={{ fontSize: 10, color: "#6b8aaa", marginTop: 2 }}>
                    ~{Math.round(s.current_range_meters / 1000)} km
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* HOME BUTTON */}
      <button className="home-btn" onClick={onBack}>⌂ Home</button>
    </div>
  );
}
