import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const CATANIA_CENTER = [37.5022, 15.0872];

function stopIcon(selected) {
  const size   = selected ? 16 : 8;
  const color  = selected ? '#2a9d8f' : '#4fc3f7';
  const border = selected ? '2.5px' : '1.5px';
  const extra  = selected ? ',0 0 0 5px rgba(42,157,143,0.25)' : '';
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:${border} solid #fff;
      border-radius:50%;
      box-shadow:0 2px 6px rgba(0,0,0,0.45)${extra};
    "></div>`,
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function StopMapPicker({ stopsIndex, onSelect, onClose }) {
  const containerRef   = useRef(null);
  const mapRef         = useRef(null);
  const markersRef     = useRef(new Map()); // stopId → L.Marker
  const selectedIdRef  = useRef(null);

  const [selectedStop, setSelectedStop] = useState(null);
  const [addressQuery, setAddressQuery] = useState('');
  const [geocoding,    setGeocoding]    = useState(false);
  const [geoError,     setGeoError]     = useState(false);

  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: CATANIA_CENTER,
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    stopsIndex.forEach(stop => {
      const marker = L.marker([stop.lat, stop.lon], { icon: stopIcon(false) }).addTo(map);

      marker.on('click', e => {
        L.DomEvent.stop(e);

        if (selectedIdRef.current !== null) {
          markersRef.current.get(selectedIdRef.current)?.setIcon(stopIcon(false));
        }
        marker.setIcon(stopIcon(true));
        selectedIdRef.current = stop.id;
        setSelectedStop(stop);
        map.panTo([stop.lat, stop.lon], { animate: true, duration: 0.4 });
      });

      markersRef.current.set(stop.id, marker);
    });

    requestAnimationFrame(() => requestAnimationFrame(() => map.invalidateSize()));
    mapRef.current = map;

    return () => {
      map.remove();
      markersRef.current.clear();
    };
  }, [stopsIndex]);

  async function searchAddress() {
    const q = addressQuery.trim();
    if (!q) return;
    setGeocoding(true);
    setGeoError(false);
    try {
      const encoded = encodeURIComponent(`${q}, Catania, Sicilia`);
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=it`
      );
      const data = await res.json();
      if (data.length > 0) {
        mapRef.current.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 16, { animate: true });
      } else {
        setGeoError(true);
      }
    } catch {
      setGeoError(true);
    } finally {
      setGeocoding(false);
    }
  }

  function useStop(field) {
    onSelect(selectedStop, field);
    onClose();
  }

  return (
    <div className="stop-map-overlay">
      {/* ── Top bar ── */}
      <div className="stop-map-topbar">
        <button className="stop-map-back" onClick={onClose} aria-label="Chiudi">
          ←
        </button>
        <input
          className="stop-map-search-input"
          type="text"
          placeholder="Cerca via, piazza o indirizzo…"
          value={addressQuery}
          onChange={e => { setAddressQuery(e.target.value); setGeoError(false); }}
          onKeyDown={e => e.key === 'Enter' && searchAddress()}
          autoComplete="off"
        />
        <button className="stop-map-go-btn" onClick={searchAddress} disabled={geocoding}>
          {geocoding ? '…' : '🔍'}
        </button>
      </div>

      {geoError && (
        <div className="stop-map-geo-error">Indirizzo non trovato — prova a essere più specifico</div>
      )}

      {/* ── Map ── */}
      <div className="stop-map-wrap">
        <div ref={containerRef} className="stop-map-container" />
      </div>

      {/* ── Hint when nothing selected ── */}
      {!selectedStop && (
        <div className="stop-map-hint">Tocca una fermata sulla mappa</div>
      )}

      {/* ── Bottom panel ── */}
      {selectedStop && (
        <div className="stop-map-panel">
          <div className="stop-map-panel-name">
            <span className="stop-map-panel-dot" />
            <span>{selectedStop.name}</span>
          </div>
          <div className="stop-map-panel-actions">
            <button className="stop-map-btn stop-map-btn-origin" onClick={() => useStop('origin')}>
              🟢 Usa come partenza
            </button>
            <button className="stop-map-btn stop-map-btn-dest" onClick={() => useStop('dest')}>
              🔴 Usa come destinazione
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
