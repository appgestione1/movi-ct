import { useState, useEffect, useCallback } from 'react';
import { fetchRouteData, getDayType, getStopsForDirection, getNextDepartures } from '../utils/busCalculator';

function BusDepartureCard({ dep, isFirst }) {
  const isImminent = dep.minsFromNow <= 2;
  return (
    <div className={`bus-dep-card ${isFirst ? 'bus-dep-first' : ''} ${isImminent ? 'imminent-card' : ''}`}>
      {isImminent && <span className="badge-imminent">IN ARRIVO</span>}
      <div className="bus-dep-time">{dep.time}</div>
      <div className="bus-dep-wait">
        {dep.minsFromNow === 0 ? 'Adesso' : `tra ${dep.minsFromNow} min`}
      </div>
    </div>
  );
}

export default function BusView({ route, onChangeRoute, onBack }) {
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
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  const dayLabel = { feriale: 'Feriale', sabato: 'Sabato', domenica: 'Domenica/Festivo' }[getDayType()] ?? '';

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

      {onBack && <button className="home-btn" onClick={onBack}>⌂ Home</button>}

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
            <span className="route-from">🚌 {route.routeName}</span>
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
          <div className="bus-walk-info">🚶 poi cammina {route.walkMeters}m fino alla destinazione</div>
        )}
        {route.transferInfo && (
          <div className="bus-transfer-info">🔄 {route.transferInfo}</div>
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
              {routeData ? 'Nessuna altra corsa oggi da questa fermata.' : 'Carico orari…'}
            </p>
          </div>
        )}
      </section>

      <button className="btn-nuova-ricerca btn-nr-bus" onClick={onChangeRoute}>
        🔍 Nuova Ricerca
      </button>

      <footer className="footer">
        <p>Orari programmati AMTS · Aggiornamento ogni 30 secondi</p>
      </footer>
    </div>
  );
}
