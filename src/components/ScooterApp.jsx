import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SCOOTER_PROVIDERS } from '../data/scooterProviders';

const CATANIA_CENTER = [37.5022, 15.0872];
const NEARBY_METERS = 500;

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function battColor(pct) {
  if (pct >= 0.6) return '#C8F135';
  if (pct >= 0.3) return '#FFB347';
  return '#FF6B6B';
}

function makeScooterIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:16px;height:16px;
      background:${color};
      border:2.5px solid #fff;
      border-radius:50%;
      box-shadow:0 2px 6px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.08);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function makeScooterIconSelected(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:22px;height:22px;
      background:${color};
      border:3px solid #fff;
      border-radius:50%;
      box-shadow:0 2px 10px rgba(0,0,0,0.3), 0 0 0 5px ${color}33;
    "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function makeUserIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:16px;height:16px;
      background:#4fc3f7;
      border:3px solid #fff;
      border-radius:50%;
      box-shadow:0 0 0 6px rgba(79,195,247,0.25);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function BattBar({ pct }) {
  const color = battColor(pct);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color, minWidth: 36, textAlign: 'right' }}>
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}

export default function ScooterApp({ onBack }) {
  const mapDivRef   = useRef(null);
  const mapRef      = useRef(null);
  const layerRef    = useRef(null);
  const userPinRef  = useRef(null);
  const markerMap   = useRef(new Map()); // bike_id → marker
  const selectedRef = useRef(null);      // stable ref, avoids stale closure

  const [activeId,   setActiveId]   = useState('dott');
  const [scooters,   setScooters]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [userPos,    setUserPos]    = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selected,   setSelected]   = useState(null); // scooter object | null
  const [address,    setAddress]    = useState(null); // reverse geocode

  selectedRef.current = selected;

  const provider = SCOOTER_PROVIDERS.find(p => p.id === activeId);

  // ── Leaflet init ──────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return;

    const map = L.map(mapDivRef.current, {
      center: CATANIA_CENTER,
      zoom: 14,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current   = map;

    map.on('click', () => {
      setSelected(null);
    });

    return () => {
      map.remove();
      mapRef.current   = null;
      layerRef.current = null;
      markerMap.current.clear();
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
    if (!provider?.gbfsUrl) { setScooters([]); setError(null); return; }
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(provider.gbfsUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json._status === 'needs_auth') throw new Error('autenticazione richiesta');
      const all = json?.data?.bikes ?? [];
      setScooters(all.filter(b => !b.is_disabled && !b.is_reserved));
      setLastUpdate(new Date());
    } catch (e) {
      setError(e.message.includes('auth') ? 'Servizio non disponibile (API privata)' : 'Dati non disponibili');
      setScooters([]);
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    setSelected(null);
    fetchScooters();
    const id = setInterval(fetchScooters, 60_000);
    return () => clearInterval(id);
  }, [fetchScooters]);

  // ── Markers ───────────────────────────────────────────────────
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    markerMap.current.clear();

    const color = provider?.color ?? '#888';

    scooters.forEach(s => {
      if (!s.lat || !s.lon) return;
      const marker = L.marker([s.lat, s.lon], {
        icon: makeScooterIcon(color),
      });
      marker.on('click', e => {
        e.originalEvent?.stopPropagation();
        const prev = selectedRef.current;
        // Ripristina icona del precedente selezionato
        if (prev && markerMap.current.has(prev.bike_id)) {
          markerMap.current.get(prev.bike_id).setIcon(makeScooterIcon(color));
        }
        marker.setIcon(makeScooterIconSelected(color));
        setSelected(s);
      });
      marker.addTo(layer);
      markerMap.current.set(s.bike_id, marker);
    });
  }, [scooters, provider]);

  // Quando si deseleziona, ripristina icona
  useEffect(() => {
    if (!selected) {
      const color = provider?.color ?? '#888';
      markerMap.current.forEach(m => m.setIcon(makeScooterIcon(color)));
    }
  }, [selected, provider]);

  // ── Reverse geocoding ─────────────────────────────────────────
  useEffect(() => {
    if (!selected) { setAddress(null); return; }
    let cancelled = false;
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${selected.lat}&lon=${selected.lon}&format=json&accept-language=it`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        const a = d.address;
        setAddress(a?.road || a?.pedestrian || a?.neighbourhood || d.display_name?.split(',')[0] || null);
      })
      .catch(() => { if (!cancelled) setAddress(null); });
    return () => { cancelled = true; };
  }, [selected]);

  const centerOnUser = () => {
    if (userPos && mapRef.current) mapRef.current.setView(userPos, 16);
  };

  const nearbyCount = userPos
    ? scooters.filter(s => haversine(s.lat, s.lon, userPos[0], userPos[1]) < NEARBY_METERS).length
    : null;

  const batt  = selected?.current_fuel_percent;
  const range = selected?.current_range_meters;

  return (
    <div className="scooter-app">
      <div className="ambient-red" />
      <div className="ambient-blue" />

      {/* Header */}
      <header className="header">
        <div className="header-logo">
          <span style={{ fontSize: 22, lineHeight: 1 }}>🛴</span>
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
            style={activeId === p.id ? { '--pc': p.color, borderColor: p.color + '55' } : {}}
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
          <div className="scooter-map-overlay error">⚠ {error}</div>
        )}
        {!provider?.gbfsUrl && !loading && (
          <div className="scooter-map-overlay info">
            Posizioni live non disponibili per {provider?.name}
          </div>
        )}
        {loading && (
          <div className="scooter-map-overlay loading">Caricamento…</div>
        )}

        {userPos && (
          <button className="scooter-locate" onClick={centerOnUser} title="La mia posizione">
            ◎
          </button>
        )}
        {lastUpdate && (
          <div className="scooter-timestamp">
            {lastUpdate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* Detail sheet — appare solo quando uno scooter è selezionato */}
      {selected ? (
        <div className="scooter-detail" style={{ borderTopColor: (provider?.color ?? '#888') + '55' }}>
          <div className="scooter-detail-row scooter-detail-header">
            <div className="scooter-detail-title">
              <span className="scooter-pill-dot" style={{ background: provider?.color, width: 10, height: 10 }} />
              <span className="scooter-detail-provider">{provider?.name}</span>
            </div>
            <button className="scooter-detail-close" onClick={() => setSelected(null)}>✕</button>
          </div>

          {address && (
            <div className="scooter-detail-address">📍 {address}</div>
          )}

          <div className="scooter-detail-stats">
            {batt != null && (
              <div className="scooter-detail-stat">
                <div className="scooter-detail-label">Batteria</div>
                <BattBar pct={batt} />
              </div>
            )}
            {range != null && (
              <div className="scooter-detail-stat">
                <div className="scooter-detail-label">Autonomia</div>
                <div className="scooter-detail-value">~{Math.round(range / 1000)} km</div>
              </div>
            )}
            {batt == null && range == null && (
              <div className="scooter-detail-stat">
                <div className="scooter-detail-label">Stato</div>
                <div className="scooter-detail-value" style={{ color: '#C8F135' }}>Disponibile</div>
              </div>
            )}
          </div>

          {provider?.appUrl && (
            <a
              href={selected.rental_uris?.ios || selected.rental_uris?.android || provider.appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="scooter-open-btn"
              style={{ '--pc': provider?.color ?? '#888' }}
            >
              Sblocca con {provider?.name} →
            </a>
          )}
        </div>
      ) : (
        /* Bottom bar — visibile solo quando nessuno scooter è selezionato */
        <div className="scooter-bottom">
          <div className="scooter-count">
            {provider?.gbfsUrl ? (
              loading ? '…' : error ? (
                <span style={{ color: 'var(--muted)' }}>—</span>
              ) : (
                <>
                  <strong>{scooters.length}</strong> disponibili
                  {nearbyCount !== null && <> · <strong>{nearbyCount}</strong> a 500&nbsp;m</>}
                </>
              )
            ) : (
              <span style={{ color: 'var(--muted)' }}>Nessun dato live</span>
            )}
            <button
              className="scooter-refresh"
              onClick={fetchScooters}
              disabled={loading || !provider?.gbfsUrl}
            >↺</button>
          </div>

          {provider?.appUrl && (
            <a
              href={provider.appUrl}
              target="_blank"
              rel="noreferrer"
              className="scooter-open-btn"
              style={{ '--pc': provider?.color ?? '#888' }}
            >
              Apri {provider?.name} →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
