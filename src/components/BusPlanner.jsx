import { useState, useEffect } from 'react';
import { loadPlannerData, searchStops, findJourneys, findTransferJourneys } from '../utils/busPlanner';

export default function BusPlanner({ onComplete, onBack }) {
  const [plannerData, setPlannerData] = useState(null);
  const [loadError, setLoadError] = useState(false);

  const [originInput, setOriginInput] = useState('');
  const [destInput,   setDestInput]   = useState('');
  const [originStop,  setOriginStop]  = useState(null);
  const [destStop,    setDestStop]    = useState(null);

  const [originResults, setOriginResults] = useState([]);
  const [destResults,   setDestResults]   = useState([]);

  const [journeys,  setJourneys]  = useState(null);
  const [transfers, setTransfers] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadPlannerData()
      .then(setPlannerData)
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    if (!plannerData || originStop) { setOriginResults([]); return; }
    setOriginResults(searchStops(originInput, plannerData.stopsIndex));
  }, [originInput, plannerData, originStop]);

  useEffect(() => {
    if (!plannerData || destStop) { setDestResults([]); return; }
    setDestResults(searchStops(destInput, plannerData.stopsIndex));
  }, [destInput, plannerData, destStop]);

  useEffect(() => {
    if (!originStop || !destStop || !plannerData) return;
    setSearching(true);
    setJourneys(null);
    setTransfers(null);
    findJourneys(originStop, destStop, plannerData.stopsIndex, plannerData.stopRoutes)
      .then(async results => {
        setJourneys(results);
        if (results.length === 0) {
          const t = await findTransferJourneys(
            originStop, destStop, plannerData.stopsIndex, plannerData.stopRoutes
          );
          setTransfers(t);
        }
      })
      .finally(() => setSearching(false));
  }, [originStop, destStop, plannerData]);

  function selectOrigin(stop) {
    setOriginStop(stop);
    setOriginInput(stop.name);
    setOriginResults([]);
    setJourneys(null);
  }

  function selectDest(stop) {
    setDestStop(stop);
    setDestInput(stop.name);
    setDestResults([]);
    setJourneys(null);
  }

  function clearOrigin() { setOriginStop(null); setOriginInput(''); setJourneys(null); setTransfers(null); }
  function clearDest()   { setDestStop(null);   setDestInput('');   setJourneys(null); setTransfers(null); }

  if (!plannerData && !loadError) {
    return (
      <div className="onboarding">
        <p className="ob-loading" style={{ marginTop: 80 }}>Caricamento fermate AMTS…</p>
        {onBack && <button className="home-btn" onClick={onBack}>⌂ Home</button>}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="onboarding">
        <p className="ob-loading" style={{ marginTop: 80, color: 'var(--red)' }}>
          Errore nel caricamento. Riprova.
        </p>
        {onBack && <button className="home-btn" onClick={onBack}>⌂ Home</button>}
      </div>
    );
  }

  return (
    <div className="onboarding planner-page">
      <div className="ob-header">
        <div className="logo-badge" style={{ background: '#2a9d8f', boxShadow: '0 0 16px rgba(42,157,143,0.5)', marginBottom: 8 }}>B</div>
        <h1 className="ob-title">Bus CT</h1>
        <p className="ob-sub">AMTS · Catania</p>
      </div>

      <div className="ob-card planner-card">
        <div className="planner-field">
          <label className="planner-label">🟢 Da dove parti?</label>
          <div className="planner-input-wrap">
            <input
              className="ob-search planner-input"
              type="text"
              placeholder="Cerca fermata di partenza…"
              value={originInput}
              onChange={e => { setOriginInput(e.target.value); if (originStop) clearOrigin(); }}
              autoComplete="off"
            />
            {originStop && <button className="planner-clear" onClick={clearOrigin}>×</button>}
            {originResults.length > 0 && (
              <div className="planner-dropdown">
                {originResults.map(s => (
                  <button key={s.id} className="planner-drop-item" onClick={() => selectOrigin(s)}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="planner-field planner-field-dest">
          <label className="planner-label">🔴 Dove vuoi andare?</label>
          <div className="planner-input-wrap">
            <input
              className="ob-search planner-input"
              type="text"
              placeholder="Cerca fermata di destinazione…"
              value={destInput}
              onChange={e => { setDestInput(e.target.value); if (destStop) clearDest(); }}
              autoComplete="off"
            />
            {destStop && <button className="planner-clear" onClick={clearDest}>×</button>}
            {destResults.length > 0 && (
              <div className="planner-dropdown">
                {destResults.map(s => (
                  <button key={s.id} className="planner-drop-item" onClick={() => selectDest(s)}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {searching && (
        <p className="ob-loading" style={{ marginTop: 24 }}>Ricerca percorsi…</p>
      )}

      {journeys !== null && !searching && journeys.length === 0 && transfers !== null && transfers.length === 0 && (
        <div className="planner-empty">
          <p>Nessun collegamento trovato.</p>
          <p className="planner-empty-hint">Le due fermate potrebbero non essere collegate dalla rete AMTS.</p>
        </div>
      )}

      {journeys !== null && !searching && journeys.length === 0 && transfers !== null && transfers.length > 0 && (
        <div className="planner-results-list">
          <p className="planner-count planner-transfer-title">
            🔄 Nessun diretto — {transfers.length} percors{transfers.length === 1 ? 'o' : 'i'} con cambio
          </p>
          {transfers.map((t, idx) => (
            <button
              key={idx}
              className="planner-journey planner-transfer-card"
              onClick={() => onComplete({ ...t, originStop, destStop })}
            >
              {/* Leg 1 */}
              <div className="planner-j-header">
                <span className="planner-route-badge">{t.leg1RouteShort}</span>
                <div className="planner-j-route">
                  <span className="planner-j-from">{originStop.name}</span>
                  <span className="planner-j-to">→ {t.transferStop.name}</span>
                </div>
              </div>
              {/* Transfer 1 */}
              <div className="planner-transfer-change">
                <span className="planner-transfer-icon">🔄</span>
                <span className="planner-transfer-label">Cambia a </span>
                <strong>{t.transferStop.name}</strong>
              </div>
              {/* Leg 2 */}
              <div className="planner-transfer-leg2">
                <span className="planner-route-badge planner-badge-leg2">{t.leg2RouteShort}</span>
                {t.legs === 3 ? (
                  <span className="planner-leg2-text">→ {t.transfer2Stop.name}</span>
                ) : (
                  <span className="planner-leg2-text">→ {destStop.name}</span>
                )}
              </div>
              {/* Transfer 2 + Leg 3 (only for 3-leg) */}
              {t.legs === 3 && (
                <>
                  <div className="planner-transfer-change" style={{ marginTop: 4 }}>
                    <span className="planner-transfer-icon">🔄</span>
                    <span className="planner-transfer-label">Cambia a </span>
                    <strong>{t.transfer2Stop.name}</strong>
                  </div>
                  <div className="planner-transfer-leg2">
                    <span className="planner-route-badge planner-badge-leg3">{t.leg3RouteShort}</span>
                    <span className="planner-leg2-text">→ {destStop.name}</span>
                  </div>
                </>
              )}
              {/* Departure times for leg 1 */}
              <div className="planner-times" style={{ marginTop: 10 }}>
                {t.nextDepartures.map((dep, i) => (
                  <span key={i} className={`planner-time${i === 0 ? ' planner-time-first' : ''}`}>{dep}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      {journeys !== null && journeys.length > 0 && (
        <div className="planner-results-list">
          <p className="planner-count">
            {journeys.length} soluzion{journeys.length === 1 ? 'e trovata' : 'i trovate'}
          </p>
          {journeys.map((j, idx) => (
            <button key={idx} className="planner-journey" onClick={() => onComplete(j)}>
              <div className="planner-j-header">
                <span className="planner-route-badge">{j.routeShort}</span>
                <div className="planner-j-route">
                  <span className="planner-j-from">{j.originStop.name}</span>
                  <span className="planner-j-to">→ {j.destStop.name}</span>
                </div>
              </div>
              {j.walkMeters > 0 && (
                <div className="planner-walk">🚶 poi cammina {j.walkMeters}m</div>
              )}
              <div className="planner-times">
                {j.nextDepartures.length > 0
                  ? j.nextDepartures.map((t, i) => (
                      <span key={i} className={`planner-time${i === 0 ? ' planner-time-first' : ''}`}>{t}</span>
                    ))
                  : <span className="planner-time planner-no-dep">Nessuna partenza oggi</span>
                }
              </div>
            </button>
          ))}
        </div>
      )}

      {onBack && <button className="home-btn" onClick={onBack}>⌂ Home</button>}
    </div>
  );
}
