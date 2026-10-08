import { useState, useEffect } from 'react';
import { useI18n } from '../i18n';
import { fetchRoutes, fetchRouteData, getDayType, getStopsForDirection } from '../utils/busCalculator';

export default function BusOnboarding({ onComplete, onBack }) {
  const { t } = useI18n();
  const [step, setStep]           = useState(1);
  const [routes, setRoutes]       = useState([]);
  const [selectedRoute, setRoute] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [direction, setDirection] = useState('0');
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState('');

  useEffect(() => {
    fetchRoutes().then(setRoutes);
  }, []);

  async function pickRoute(route) {
    setLoading(true);
    setRoute(route);
    const data = await fetchRouteData(route.id);
    setRouteData(data);
    setDirection('0');
    setLoading(false);
    setStep(2);
  }

  function pickStop(stop) {
    onComplete({ routeId: selectedRoute.id, routeName: selectedRoute.name, routeShort: selectedRoute.short, stopId: stop.id, stopName: stop.name, direction });
  }

  const dayType = getDayType();
  const stops = routeData ? getStopsForDirection(routeData, direction, dayType) : [];
  const hasDir1 = routeData?.directions?.['1'];

  const filtered = routes.filter(r =>
    !search ||
    r.short.toLowerCase().includes(search.toLowerCase()) ||
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="onboarding">
      <div className="ob-header">
        <button className="ob-back-top" onClick={onBack}>{t('bus.back')}</button>
        <div className="logo-badge" style={{ margin: '8px auto' }}>🚌</div>
        <h1 className="ob-title">{t('bus.title')}</h1>
      </div>

      <div className="ob-card">
        {step === 1 && (
          <>
            <p className="ob-question">
              <span className="ob-step">1/2</span>
              {t('bus.whichLine')}
            </p>
            <input
              className="ob-search"
              type="text"
              placeholder={t('bus.searchLine')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            <div className="ob-grid ob-grid-bus">
              {filtered.map(r => (
                <button key={r.id} className="ob-btn ob-btn-bus" onClick={() => pickRoute(r)}>
                  <strong className="ob-line-num">{r.short}</strong>
                  <span className="ob-line-name">{r.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="ob-question">
              <span className="ob-step">2/2</span>
              {t('bus.lineWord')} <strong style={{ color: '#4fc3f7' }}>{selectedRoute?.short}</strong> — {t('bus.pickStop')}
            </p>

            {hasDir1 && (
              <div className="ob-dir-toggle">
                <button className={`ob-dir-btn ${direction === '0' ? 'active' : ''}`} onClick={() => setDirection('0')}>
                  {t('bus.dirA')}
                </button>
                <button className={`ob-dir-btn ${direction === '1' ? 'active' : ''}`} onClick={() => setDirection('1')}>
                  {t('bus.dirB')}
                </button>
              </div>
            )}

            {loading ? (
              <p className="ob-loading">{t('bus.loadingStops')}</p>
            ) : (
              <div className="ob-stops-list">
                {stops.map((s, i) => (
                  <button key={s.id} className="ob-stop-btn" onClick={() => pickStop(s)}>
                    <span className="ob-stop-num">{i + 1}</span>
                    <span className="ob-stop-name">{s.name}</span>
                  </button>
                ))}
                {stops.length === 0 && <p className="ob-loading">{t('bus.noStopsToday')}</p>}
              </div>
            )}

            <button className="ob-back" onClick={() => setStep(1)}>{t('bus.changeLine')}</button>
          </>
        )}
      </div>
    </div>
  );
}
