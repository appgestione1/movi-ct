import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SCOOTER_PROVIDERS } from '../data/scooterProviders';

const CATANIA_CENTER = [37.5022, 15.0872];
const NEARBY_DEG = 0.005; // ~500 m

function makeScooterIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:13px;height:13px;
      background:${color};
      border:2px solid rgba(255,255,255,0.85);
      border-radius:50%;
      box-shadow:0 0 8px ${color}BB;
    "></div>`,
    iconSize: [13, 13],
    iconAnchor: [6, 6],
  });
}

function makeUserIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:18px;height:18px;
      background:#4fc3f7;
      border:3px solid #fff;
      border-radius:50%;
      box-shadow:0 0 0 6px rgba(79,195,247,0.22);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function ScooterApp({ onBack }) {
  const mapDivRef   = useRef(null);
  const mapRef      = useRef(null);
  const layerRef    = useRef(null);
  const userPinRef  = useRef(null);

  const [activeId, setActiveId]     = useState('dott');
  const [scooters, setScooters]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [userPos, setUserPos]       = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const provider = SCOOTER_PROVIDERS.find(p => p.id === activeId);

  // ── Leaflet init ──────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return;

    const map = L.map(mapDivRef.current, {
      center: CATANIA_CENTER,
      zoom: 14,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current   = map;

    return () => {
      map.remove();
      mapRef.current  = null;
      layerRef.current = null;
    };
  }, []);

  // ── Geolocalizzazione ─────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;

    const wid = navigator.geolocation.watchPosition(
      ({ coords: { latitude: lat, longitude: lng } }) => {
        setUserPos([lat, lng]);
        const map = mapRef.current;
        if (!map) return;
        if (userPinRef.current) {
          userPinRef.current.setLatLng([lat, lng]);
        } else {
          userPinRef.current = L.marker([lat, lng], {
            icon: makeUserIcon(),
            zIndexOffset: 1000,
          }).addTo(map);
          map.setView([lat, lng], 15);
        }
      },
      null,
      { enableHighAccuracy: true, maximumAge: 15000 },
    );

    return () => navigator.geolocation.clearWatch(wid);
  }, []);

  // ── Fetch GBFS ────────────────────────────────────────────────
  const fetchScooters = useCallback(async () => {
    if (!provider?.gbfsUrl) {
      setScooters([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(provider.gbfsUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const all  = json?.data?.bikes ?? [];
      setScooters(all.filter(b => !b.is_disabled && !b.is_reserved));
      setLastUpdate(new Date());
    } catch {
      setError('Dati non disponibili');
      setScooters([]);
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    fetchScooters();
    const id = setInterval(fetchScooters, 60_000);
    return () => clearInterval(id);
  }, [fetchScooters]);

  // ── Markers ───────────────────────────────────────────────────
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const color = provider?.color ?? '#888';

    scooters.forEach(s => {
      if (!s.lat || !s.lon) return;

      const battery =
        s.current_fuel_percent != null
          ? `${Math.round(s.current_fuel_percent * 100)}%`
          : s.current_range_meters != null
            ? `~${(s.current_range_meters / 1000).toFixed(1)} km`
            : null;

      const popup = battery
        ? `<div class="scooter-popup-inner">🛴 ${provider.name} &nbsp; 🔋 ${battery}</div>`
        : `<div class="scooter-popup-inner">🛴 ${provider.name}</div>`;

      L.marker([s.lat, s.lon], { icon: makeScooterIcon(color) })
        .bindPopup(popup, { className: 'scooter-popup', closeButton: false, offset: [0, -4] })
        .addTo(layer);
    });
  }, [scooters, provider]);

  // ── Helpers ───────────────────────────────────────────────────
  const centerOnUser = () => {
    if (userPos && mapRef.current) mapRef.current.setView(userPos, 16);
  };

  const nearbyCount = userPos
    ? scooters.filter(s => Math.hypot(s.lat - userPos[0], s.lon - userPos[1]) < NEARBY_DEG).length
    : null;

  const timeStr = lastUpdate
    ? lastUpdate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : null;

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="scooter-app">
      <div className="ambient-red" />
      <div className="ambient-blue" />

      {/* Header */}
      <header className="header">
        <div className="header-logo">
          <span className="scooter-hdr-icon">🛴</span>
          <span className="logo-text">Monopattini</span>
        </div>
        <button className="scooter-back-btn" onClick={onBack}>⌂ Home</button>
      </header>

      {/* Provider pills */}
      <div className="scooter-pills">
        {SCOOTER_PROVIDERS.map(p => (
          <button
            key={p.id}
            className={`scooter-pill${activeId === p.id ? ' active' : ''}${p.comingSoon ? ' soon' : ''}`}
            style={activeId === p.id ? { '--pc': p.color } : {}}
            onClick={() => !p.comingSoon && setActiveId(p.id)}
            disabled={p.comingSoon}
          >
            <span className="scooter-pill-dot" style={{ background: p.color }} />
            {p.name}
            {p.comingSoon && <span className="scooter-pill-tag">presto</span>}
          </button>
        ))}
      </div>

      {/* Mappa */}
      <div className="scooter-map-wrap">
        <div ref={mapDivRef} className="scooter-map" />

        {error && !loading && (
          <div className="scooter-map-msg error">⚠ {error}</div>
        )}

        {!provider?.gbfsUrl && !loading && (
          <div className="scooter-map-msg info">
            Posizioni live non ancora disponibili per {provider?.name}
          </div>
        )}

        {userPos && (
          <button className="scooter-locate" onClick={centerOnUser} title="Centrami">◎</button>
        )}

        {timeStr && (
          <div className="scooter-timestamp">aggiornato {timeStr}</div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="scooter-bottom">
        <div className="scooter-count">
          {provider?.gbfsUrl ? (
            loading ? '…' : error ? '–' : (
              <>
                <strong>{scooters.length}</strong> disponibili
                {nearbyCount !== null && (
                  <> · <strong>{nearbyCount}</strong> a 500&nbsp;m</>
                )}
              </>
            )
          ) : (
            <span className="muted-text">Nessun dato live — apri l&apos;app</span>
          )}

          <button
            className="scooter-refresh"
            onClick={fetchScooters}
            disabled={loading || !provider?.gbfsUrl}
            title="Aggiorna"
          >
            ↺
          </button>
        </div>

        {provider?.appUrl && (
          <a
            href={provider.appUrl}
            target="_blank"
            rel="noreferrer"
            className="scooter-open-btn"
            style={{ '--pc': provider.color }}
          >
            Apri {provider.name} →
          </a>
        )}
      </div>
    </div>
  );
}
