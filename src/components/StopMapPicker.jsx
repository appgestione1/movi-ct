import { useState } from 'react';
import { createPortal } from 'react-dom';
import { findNearbyStops } from '../utils/busPlanner';

export default function StopMapPicker({ stopsIndex, onSelect, onClose }) {
  const [query,    setQuery]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [stops,    setStops]    = useState(null); // null = non ancora cercato

  async function cerca() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setStops(null);
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', Catania')}&format=json&limit=1&countrycodes=it`
      );
      const data = await res.json();
      if (!data.length) { setError('Indirizzo non trovato. Prova con una via diversa.'); return; }
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      const vicine = findNearbyStops(lat, lon, stopsIndex, 800);
      setStops(vicine.slice(0, 8));
    } catch {
      setError('Errore di rete. Riprova.');
    } finally {
      setLoading(false);
    }
  }

  function scegli(stop, field) {
    onSelect(stop, field);
    onClose();
  }

  return createPortal(
    <div className="smp-overlay">
      {/* Header */}
      <div className="smp-header">
        <button className="smp-back" onClick={onClose}>←</button>
        <span className="smp-title">Trova fermata vicina</span>
      </div>

      {/* Search */}
      <div className="smp-search-wrap">
        <input
          className="smp-input"
          type="text"
          placeholder="Es. Via Etnea, Piazza Duomo…"
          value={query}
          onChange={e => { setQuery(e.target.value); setError(''); setStops(null); }}
          onKeyDown={e => e.key === 'Enter' && cerca()}
          autoComplete="off"
          autoFocus
        />
        <button className="smp-go" onClick={cerca} disabled={loading || !query.trim()}>
          {loading ? '…' : 'Cerca'}
        </button>
      </div>

      {error && <p className="smp-error">{error}</p>}

      {/* Results */}
      <div className="smp-results">
        {stops === null && !loading && (
          <p className="smp-hint">Inserisci un indirizzo per trovare le fermate AMTS più vicine</p>
        )}

        {stops !== null && stops.length === 0 && (
          <p className="smp-hint">Nessuna fermata trovata nel raggio di 800m</p>
        )}

        {stops !== null && stops.length > 0 && (
          <>
            <p className="smp-count">{stops.length} fermate trovate nei dintorni</p>
            {stops.map(stop => (
              <div key={stop.id} className="smp-stop-card">
                <div className="smp-stop-info">
                  <span className="smp-stop-name">{stop.name}</span>
                  <span className="smp-stop-dist">{stop.dist}m</span>
                </div>
                <div className="smp-stop-actions">
                  <button className="smp-btn smp-btn-origin" onClick={() => scegli(stop, 'origin')}>
                    🟢 Partenza
                  </button>
                  <button className="smp-btn smp-btn-dest" onClick={() => scegli(stop, 'dest')}>
                    🔴 Destinazione
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
