import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const CATANIA = [37.5022, 15.0872];

function radiusForZoom(zoom) {
  if (zoom >= 16) return 7;
  if (zoom >= 14) return 6;
  return 5;
}
function stopNormal(zoom = 14) {
  return { radius: radiusForZoom(zoom), fillColor: '#4fc3f7', color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.85 };
}
function stopSelected(zoom = 14) {
  return { radius: radiusForZoom(zoom) + 5, fillColor: '#2a9d8f', color: '#fff', weight: 3, opacity: 1, fillOpacity: 1 };
}

function pinIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;
      background:#e63946;
      border:3px solid #fff;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

export default function StopMapPicker({ stopsIndex, field, onSelect, onClose }) {
  const innerRef   = useRef(null);
  const mapRef     = useRef(null);
  const circlesRef = useRef(new Map());
  const selectedRef = useRef(null);
  const pinRef     = useRef(null);

  const [selectedStop, setSelectedStop] = useState(null);
  const [query,        setQuery]        = useState('');
  const [geocoding,    setGeocoding]    = useState(false);
  const [geoMsg,       setGeoMsg]       = useState('');
  const [geoError,     setGeoError]     = useState('');

  const label = field === 'origin' ? 'partenza' : 'destinazione';

  /* ── Inizializza mappa ── */
  useEffect(() => {
    let cancelled = false;
    let tid;
    let ro = null;

    tid = setTimeout(() => {
      if (cancelled) return;
      const el = innerRef.current;
      if (!el || el._leaflet_id) return;

      const map = L.map(el, {
        center: CATANIA,
        zoom: 14,
        zoomControl: true,
        attributionControl: false,
        // 1322 fermate: canvas è più veloce/stabile dell'SVG. tolerance allarga
        // l'area di tocco invisibile dei pallini senza ingrandirli visivamente
        renderer: L.canvas({ tolerance: 10 }),
      });
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

      // Risincronizza Leaflet quando il container cambia dimensione (banner
      // "indirizzo trovato", tastiera mobile, rotazione) — senno coordinate sfasate
      ro = new ResizeObserver(() => { if (!cancelled) map.invalidateSize(); });
      ro.observe(el);

      map.whenReady(() => {
        if (cancelled) return;
        stopsIndex.forEach(stop => {
          // Alcune fermate GTFS hanno coordinate nulle: vanno saltate, altrimenti
          // L.circleMarker crea un layer con _latlng null che crasha Leaflet a ogni zoom
          if (typeof stop?.lat !== 'number' || typeof stop?.lon !== 'number') return;
          const c = L.circleMarker([stop.lat, stop.lon], stopNormal(map.getZoom())).addTo(map);
          c.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            const z = map.getZoom();
            if (selectedRef.current !== null)
              circlesRef.current.get(selectedRef.current)?.setStyle(stopNormal(z));
            c.setStyle(stopSelected(z));
            c.bringToFront();
            selectedRef.current = stop.id;
            setSelectedStop(stop);
          });
          circlesRef.current.set(stop.id, c);
        });

        // Aggiorna raggio a ogni cambio zoom (throttle a ~10fps durante flyTo)
        let lastZoomTick = 0;
        function updateRadii() {
          if (cancelled) return;
          const z = map.getZoom();
          circlesRef.current.forEach((circle, id) => {
            circle.setStyle(id === selectedRef.current ? stopSelected(z) : stopNormal(z));
          });
        }
        map.on('zoom', () => {
          const now = Date.now();
          if (now - lastZoomTick < 100) return;
          lastZoomTick = now;
          updateRadii();
        });
        map.on('zoomend', updateRadii);
      });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(tid);
      if (ro) ro.disconnect();
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      circlesRef.current.clear();
      selectedRef.current = null;
      pinRef.current = null;
    };
  }, [stopsIndex]);

  /* ── Geocoding ── */
  async function cerca() {
    const q = query.trim();
    if (!q) return;
    if (!mapRef.current) { setGeoError('Mappa non pronta, riprova tra un secondo'); return; }

    setGeocoding(true);
    setGeoError('');
    setGeoMsg('');

    try {
      const suffix = /catania/i.test(q) ? '' : ', Catania, Sicilia';
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + suffix)}&format=json&limit=1&countrycodes=it`;
      const data = await fetch(url).then(r => r.json());

      if (!data.length) { setGeoError('Indirizzo non trovato'); return; }

      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      const name = data[0].display_name.split(',')[0];
      setGeoMsg(name);

      // Rimuovi pin precedente
      if (pinRef.current) { pinRef.current.remove(); pinRef.current = null; }

      // Aggiungi pin sulla via trovata
      const map = mapRef.current;
      pinRef.current = L.marker([lat, lon], { icon: pinIcon() }).addTo(map);

      // Aspetta che il banner "trovato" sia nel layout, risincronizza la mappa,
      // poi vola — cosi flyTo calcola lo zoom sulle dimensioni corrette
      requestAnimationFrame(() => {
        map.invalidateSize();
        map.flyTo([lat, lon], 17, { duration: 1 });
      });

    } catch {
      setGeoError('Errore di rete. Riprova.');
    } finally {
      setGeocoding(false);
    }
  }

  function conferma() {
    onSelect(selectedStop, field);
    onClose();
  }

  return createPortal(
    <div className="smp-overlay">
      <div className="smp-topbar">
        <button className="smp-back" onClick={onClose}>←</button>
        <span className="smp-title">Scegli fermata di {label}</span>
      </div>

      <div className="smp-search-row">
        <input
          className="smp-input"
          type="text"
          placeholder="Cerca via o indirizzo…"
          value={query}
          onChange={e => { setQuery(e.target.value); setGeoError(''); setGeoMsg(''); }}
          onKeyDown={e => e.key === 'Enter' && cerca()}
          autoComplete="off"
          autoFocus
        />
        <button className="smp-go" onClick={cerca} disabled={geocoding || !query.trim()}>
          {geocoding ? '…' : '🔍'}
        </button>
      </div>

      {geoMsg   && <p className="smp-found-place">📍 {geoMsg}</p>}
      {geoError && <p className="smp-geo-error">{geoError}</p>}

      <div className="smp-map-wrap">
        <div ref={innerRef} className="smp-map-inner" />
        {selectedStop ? (
          <div className="smp-panel">
            <div className="smp-panel-name">
              <span className="smp-panel-dot" />
              {selectedStop.name}
            </div>
            <button className="smp-confirm" onClick={conferma}>
              Usa come {label} →
            </button>
          </div>
        ) : (
          <div className="smp-hint">Tocca una fermata 🚏 sulla mappa</div>
        )}
      </div>
    </div>,
    document.body
  );
}
