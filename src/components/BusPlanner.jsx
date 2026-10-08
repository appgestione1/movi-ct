import { useState, useEffect } from 'react';
import { loadPlannerData, searchStops, findJourneys, findTransferJourneys } from '../utils/busPlanner';
import { useI18n } from '../i18n';
import StopMapPicker from './StopMapPicker';

export default function BusPlanner({ onComplete, onBack }) {
  const { t } = useI18n();
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
  const [showMap,   setShowMap]   = useState(null); // null | 'origin' | 'dest'

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

  function handleMapSelect(stop, field) {
    if (field === 'origin') selectOrigin(stop);
    else selectDest(stop);
    setShowMap(null);
  }

  if (!plannerData && !loadError) {
    return (
      <div className="onboarding">
        <p className="ob-loading" style={{ marginTop: 80 }}>{t('bus.loadingPlanner')}</p>
        {onBack && <button className="home-btn" onClick={onBack}>{t('bus.home')}</button>}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="onboarding">
        <p className="ob-loading" style={{ marginTop: 80, color: 'var(--red)' }}>
          {t('bus.loadError')}
        </p>
        {onBack && <button className="home-btn" onClick={onBack}>{t('bus.home')}</button>}
      </div>
    );
  }

  return (
    <div className="onboarding planner-page">
      <div className="ob-header">
        <div className="bus-title-row">
          <div className="logo-badge" style={{ background: '#2a9d8f', boxShadow: '0 0 16px rgba(42,157,143,0.5)', flexShrink: 0 }}>B</div>
          <h1 className="ob-title" style={{ margin: 0 }}>{t('bus.titleShort')}</h1>
        </div>
        <p className="ob-sub">{t('bus.sub')}</p>
      </div>

      <div className="ob-card planner-card">
        <div className="planner-field">
          <label className="planner-label">{t('bus.whereFrom')}</label>
          <div className="planner-input-row">
            <div className="planner-input-wrap">
              <input
                className="ob-search planner-input"
                type="text"
                placeholder={t('bus.originPlaceholder')}
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
            <button className="planner-pin-btn" onClick={() => setShowMap('origin')} title={t('bus.findOnMap')}>📍</button>
          </div>
        </div>

        <div className="planner-field planner-field-dest">
          <label className="planner-label">{t('bus.whereTo')}</label>
          <div className="planner-input-row">
            <div className="planner-input-wrap">
              <input
                className="ob-search planner-input"
                type="text"
                placeholder={t('bus.destPlaceholder')}
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
            <button className="planner-pin-btn" onClick={() => setShowMap('dest')} title={t('bus.findOnMap')}>📍</button>
          </div>
        </div>
      </div>

      {showMap && plannerData && (
        <StopMapPicker
          stopsIndex={plannerData.stopsIndex}
          field={showMap}
          onSelect={handleMapSelect}
          onClose={() => setShowMap(null)}
        />
      )}

      {searching && (
        <p className="ob-loading" style={{ marginTop: 24 }}>{t('bus.searching')}</p>
      )}

      {journeys !== null && !searching && journeys.length === 0 && transfers !== null && transfers.length === 0 && (
        <div className="planner-empty">
          <p>{t('bus.noConnection')}</p>
          <p className="planner-empty-hint">{t('bus.noConnectionHint')}</p>
        </div>
      )}

      {journeys !== null && !searching && journeys.length === 0 && transfers !== null && transfers.length > 0 && (
        <div className="planner-results-list">
          <p className="planner-count planner-transfer-title">
            {t(transfers.length === 1 ? 'bus.noDirectOne' : 'bus.noDirectMany', { n: transfers.length })}
          </p>
          {transfers.map((tr, idx) => (
            <button
              key={idx}
              className="planner-journey planner-transfer-card"
              onClick={() => onComplete({ ...tr, originStop, destStop })}
            >
              {/* Leg 1 */}
              <div className="planner-j-header">
                <span className="planner-route-badge">{tr.leg1RouteShort}</span>
                <div className="planner-j-route">
                  <span className="planner-j-from">{originStop.name}</span>
                  <span className="planner-j-to">→ {tr.transferStop.name}</span>
                </div>
              </div>
              {/* Transfer 1 */}
              <div className="planner-transfer-change">
                <span className="planner-transfer-icon">🔄</span>
                <span className="planner-transfer-label">{t('bus.changeAt')} </span>
                <strong>{tr.transferStop.name}</strong>
              </div>
              {/* Leg 2 */}
              <div className="planner-transfer-leg2">
                <span className="planner-route-badge planner-badge-leg2">{tr.leg2RouteShort}</span>
                {tr.legs === 3 ? (
                  <span className="planner-leg2-text">→ {tr.transfer2Stop.name}</span>
                ) : (
                  <span className="planner-leg2-text">→ {destStop.name}</span>
                )}
              </div>
              {/* Transfer 2 + Leg 3 (only for 3-leg) */}
              {tr.legs === 3 && (
                <>
                  <div className="planner-transfer-change" style={{ marginTop: 4 }}>
                    <span className="planner-transfer-icon">🔄</span>
                    <span className="planner-transfer-label">{t('bus.changeAt')} </span>
                    <strong>{tr.transfer2Stop.name}</strong>
                  </div>
                  <div className="planner-transfer-leg2">
                    <span className="planner-route-badge planner-badge-leg3">{tr.leg3RouteShort}</span>
                    <span className="planner-leg2-text">→ {destStop.name}</span>
                  </div>
                </>
              )}
              {/* Departure times for leg 1 */}
              <div className="planner-times" style={{ marginTop: 10 }}>
                {tr.nextDepartures.map((dep, i) => (
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
            {t(journeys.length === 1 ? 'bus.solutionsOne' : 'bus.solutionsMany', { n: journeys.length })}
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
                <div className="planner-walk">{t('bus.walkThenShort', { m: j.walkMeters })}</div>
              )}
              <div className="planner-times">
                {j.nextDepartures.length > 0
                  ? j.nextDepartures.map((time, i) => (
                      <span key={i} className={`planner-time${i === 0 ? ' planner-time-first' : ''}`}>{time}</span>
                    ))
                  : <span className="planner-time planner-no-dep">{t('bus.noDepartureToday')}</span>
                }
              </div>
            </button>
          ))}
        </div>
      )}

      {onBack && <button className="home-btn" onClick={onBack}>{t('bus.home')}</button>}
    </div>
  );
}
