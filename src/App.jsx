import { useState, useEffect, useCallback } from 'react';
import Landing from './components/Landing';
import Onboarding from './components/Onboarding';
import MetroMapVertical from './components/MetroMapVertical';
import TrainCard, { NoTrainCard } from './components/TrainCard';
import BusPlanner from './components/BusPlanner';
import BusView from './components/BusView';
import ScooterApp from './components/ScooterApp';
import { STATIONS, STATION_TIMES } from './data/schedule';
import { getNextTrains } from './utils/calculator';
import './App.css';

function formatTime(date) {
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ── Metro view ─────────────────────────────────────────────────
function MetroApp({ onBack }) {
  const [route, setRoute] = useState(load('metro-route'));
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [now, setNow] = useState(new Date());
  const [trains, setTrains] = useState({ toStesicoro: [], toMontePo: [] });
  const [showNext, setShowNext] = useState(false);

  const direction = route
    ? (route.boardingIdx < route.destinationIdx ? 'stesicoro' : 'montePo')
    : null;
  const stationIdx = route?.boardingIdx ?? 4;

  const refresh = useCallback((date = new Date()) => {
    setNow(date);
    setTrains(getNextTrains(stationIdx, date));
  }, [stationIdx]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => refresh(new Date()), 1000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => { setShowNext(false); }, [stationIdx, direction]);

  function handleRouteComplete(r) {
    save('metro-route', r);
    setRoute(r);
    setShowOnboarding(false);
    setShowNext(false);
  }

  if (showOnboarding) {
    return <Onboarding onComplete={handleRouteComplete} onBack={onBack} />;
  }

  const relevantTrains = direction === 'stesicoro' ? trains.toStesicoro : trains.toMontePo;
  const activeTrain = relevantTrains[showNext ? 1 : 0] ?? null;

  const trainPositions = [
    ...trains.toStesicoro.filter(t => t.interpolatedPos != null).map(t => ({ position: t.interpolatedPos, direction: 'stesicoro' })),
    ...trains.toMontePo.filter(t => t.interpolatedPos != null).map(t => ({ position: t.interpolatedPos, direction: 'montePo' })),
  ];

  const boarding = STATIONS[route.boardingIdx];
  const destination = STATIONS[route.destinationIdx];
  const dirColor = direction === 'stesicoro' ? '#e63946' : '#4fc3f7';
  const travelMins = Math.round(Math.abs(STATION_TIMES[route.destinationIdx] - STATION_TIMES[route.boardingIdx]));

  return (
    <div className="app">
      <div className="ambient-red" /><div className="ambient-blue" />

      <header className="header">
        <div className="header-logo">
          <div className="logo-badge">M</div>
          <span className="logo-text">Metro FCE</span>
        </div>
        <div className="header-time">{formatTime(now)}</div>
      </header>

      <button className="home-btn" onClick={onBack}>⌂ Home</button>

      <div className="metro-body">
        <div className="metro-content">
          <section className="route-section">
            <div className="route-pill">
              <span className="route-from">{boarding.name}</span>
              <span className="route-arrow" style={{ color: dirColor }}>→</span>
              <span className="route-to">{destination.name}</span>
            </div>
          </section>

          <section className="arrivals-section single">
            <div className="train-slot">
              {activeTrain
                ? <TrainCard train={activeTrain} direction={direction} travelMins={travelMins} />
                : <NoTrainCard direction={direction} travelMins={travelMins} />}
            </div>
            <div className="next-row">
              {relevantTrains.length >= 2 && (
                <button className={`next-btn ${showNext ? 'active' : ''}`} onClick={() => setShowNext(v => !v)}>
                  {showNext ? '← Precedente' : 'Prossimo →'}
                </button>
              )}
              {relevantTrains.length < 2 && <span className="next-empty">Nessun altro treno</span>}
            </div>
          </section>

          <button
            className="btn-nuova-ricerca btn-nr-metro"
            onClick={() => setShowOnboarding(true)}
          >
            🔍 Nuova Ricerca
          </button>

          <footer className="footer"><p>Stime basate sull&apos;orario FCE — dati non ufficiali</p></footer>
        </div>

        <div className="metro-sidebar">
          <MetroMapVertical
            selectedIdx={route.boardingIdx}
            destinationIdx={route.destinationIdx}
            trainPositions={trainPositions}
          />
        </div>
      </div>
    </div>
  );
}

// ── Bus view ───────────────────────────────────────────────────
function BusApp({ onBack }) {
  const [busRoute, setBusRoute] = useState(load('bus-journey'));
  const [showPlanner, setShowPlanner] = useState(true);

  function handleJourneyComplete(journey) {
    let route;
    if (journey.type === 'transfer') {
      const transferInfo = journey.legs === 3
        ? `poi cambia: Linea ${journey.leg2RouteShort} → ${journey.transfer2Stop.name}, poi Linea ${journey.leg3RouteShort} → ${journey.destStop.name}`
        : `poi cambia: Linea ${journey.leg2RouteShort} → ${journey.destStop.name}`;
      route = {
        routeId:      journey.leg1RouteId,
        routeShort:   journey.leg1RouteShort,
        routeName:    `Linea ${journey.leg1RouteShort}`,
        stopId:       journey.originStop.id,
        stopName:     journey.originStop.name,
        direction:    journey.leg1Direction,
        destStopName: journey.transferStop.name,
        walkMeters:   0,
        transferInfo,
      };
    } else {
      route = {
        routeId:      journey.routeId,
        routeShort:   journey.routeShort,
        routeName:    `Linea ${journey.routeShort}`,
        stopId:       journey.originStop.id,
        stopName:     journey.originStop.name,
        direction:    journey.direction,
        destStopName: journey.destStop.name,
        walkMeters:   journey.walkMeters,
      };
    }
    save('bus-journey', route);
    setBusRoute(route);
    setShowPlanner(false);
  }

  if (showPlanner) {
    return <BusPlanner onComplete={handleJourneyComplete} onBack={onBack} />;
  }

  return <BusView route={busRoute} onChangeRoute={() => setShowPlanner(true)} onBack={onBack} />;
}

// ── Root ───────────────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState(null); // null | 'metro' | 'bus' | 'scooter'

  if (mode === 'metro')   return <MetroApp onBack={() => setMode(null)} />;
  if (mode === 'bus')     return <BusApp   onBack={() => setMode(null)} />;
  if (mode === 'scooter') return <ScooterApp onBack={() => setMode(null)} />;
  return <Landing onSelect={setMode} />;
}
