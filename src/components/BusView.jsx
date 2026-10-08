import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../i18n';
import { fetchRouteData, getDayType, getStopsForDirection, getNextDepartures } from '../utils/busCalculator';

function BusDepartureCard({ dep, isFirst }) {
  const { t } = useI18n();
  const isImminent = dep.minsFromNow <= 2;
  return (
    <div className={`bus-dep-card ${isFirst ? 'bus-dep-first' : ''} ${isImminent ? 'imminent-card' : ''}`}>
      {isImminent && <span className="badge-imminent">{t('bus.arriving')}</span>}
      <div className="bus-dep-time">{dep.time}</div>
      <div className="bus-dep-wait">
        {dep.minsFromNow === 0 ? t('bus.now') : t('bus.inMin', { n: dep.minsFromNow })}
      </div>
    </div>
  );
}

export default function BusView({ route, onChangeRoute, onBack }) {
  const { t, locale } = useI18n();
  // route = { routeId, routeName, routeShort, stopId, stopName, direction }
  const [now, setNow]           = useState(new Date());
  const [routeData, setRouteData] = useState(null);
  const [departures, setDepartures] = useState([]);

  useEffect(() => {
    fetchRouteData(route.routeId).then(setRouteData);
  }, [route.routeId]);

  const refresh = useCallback((date = new Date()) => {
    if (!routeData) return;
    const dayType = getDayType(date);
    const stops = getStopsForDirection(routeData, route.direction, dayType);
    setDepartures(getNextDepartures(stops, route.stopId, date, 3));
    setNow(date);
  }, [routeData, route]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => refresh(new Date()), 30000);
    return () => clearInterval(id);
  }, [refresh]);

  function formatTime(d) {
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  const dayLabel = { feriale: t('bus.dayFeriale'), sabato: t('bus.daySabato'), domenica: t('bus.dayDomenica') }[getDayType()] ?? '';

  return (
    <div className="app">
      <div className="ambient-red" />
      <div className="ambient-blue" />

      <header className="header">
        <div className="header-logo">
          <div className="logo-badge bus-badge">{route.routeShort}</div>
        </div>
        <div className="header-time">{formatTime(now)}</div>
      </header>

      {onBack && <button className="home-btn" onClick={onBack}>{t('bus.home')}</button>}

      {/* Route + stop info */}
      <section className="route-section">
        <div className="route-pill">
          {route.destStopName ? (
            <>
              <span className="route-from">{route.stopName}</span>
              <span className="route-arrow" style={{ color: '#2a9d8f' }}>→</span>
              <span className="route-to">{route.destStopName}</span>
            </>
          ) : (
            <span className="route-from">🚌 {t('bus.line', { n: route.routeShort })}</span>
          )}
        </div>
      </section>

      <section className="bus-stop-section">
        <div className="bus-stop-pill">
          <span className="bus-stop-icon">🚏</span>
          <span className="bus-stop-name">{route.stopName}</span>
          <span className="bus-day-label">{dayLabel}</span>
        </div>
        {route.walkMeters > 0 && (
          <div className="bus-walk-info">{t('bus.walkThen', { m: route.walkMeters })}</div>
        )}
        {(route.transferLegs || route.transferInfo) && (
          <div className="bus-transfer-info">
            🔄 {route.transferLegs
              ? route.transferLegs.map((l, i) =>
                  t(i === 0 ? 'bus.transferFirst' : 'bus.transferThen', { line: l.routeShort, stop: l.stopName })
                ).join(', ')
              : route.transferInfo}
          </div>
        )}
      </section>

      {/* Departures */}
      <section className="bus-departures-section">
        {departures.length > 0 ? (
          departures.map((dep, i) => (
            <BusDepartureCard key={dep.time} dep={dep} isFirst={i === 0} />
          ))
        ) : (
          <div className="train-card no-train" style={{ margin: '0 20px' }}>
            <p className="no-service">
              {routeData ? t('bus.noMoreRuns') : t('bus.loadingTimes')}
            </p>
          </div>
        )}
      </section>

      <button className="btn-nuova-ricerca btn-nr-bus" onClick={onChangeRoute}>
        {t('bus.newSearch')}
      </button>

      <footer className="footer">
        <p>{t('bus.footer')}</p>
      </footer>
    </div>
  );
}
