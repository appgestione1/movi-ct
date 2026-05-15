import FlipNumber from './FlipNumber';
import { STATIONS } from '../data/schedule';

function ProgressBar({ direction, interpolatedPos }) {
  if (interpolatedPos === null || interpolatedPos === undefined) return null;

  const pct = direction === 'stesicoro'
    ? (interpolatedPos / (STATIONS.length - 1)) * 100
    : ((STATIONS.length - 1 - interpolatedPos) / (STATIONS.length - 1)) * 100;

  const color = direction === 'stesicoro' ? '#e63946' : '#4fc3f7';

  return (
    <div className="progress-track">
      <div
        className="progress-fill"
        style={{
          width: `${Math.min(100, Math.max(0, pct))}%`,
          background: color,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
    </div>
  );
}

export default function TrainCard({ train, direction, travelMins }) {
  const isToStesicoro = direction === 'stesicoro';
  const label = isToStesicoro ? '→ Monte Po' : '← Stesicoro';
  const color = isToStesicoro ? '#e63946' : '#4fc3f7';
  const mins = Math.floor(train.minsToArrive);
  const secs = train.secsToArrive % 60;
  const isImminent = train.secsToArrive <= 60;

  return (
    <div className={`train-card ${isImminent ? 'imminent-card' : ''}`}>
      <div className="card-glow" style={{ background: color }} />

      <div className="train-card-header">
        <span className="direction-label" style={{ color, textShadow: `0 0 12px ${color}` }}>
          {label}
        </span>
        {isImminent && <span className="badge-imminent">IN ARRIVO</span>}
      </div>

      {train.currentStation && (
        <p className="current-pos">
          Treno a <strong>{train.currentStation}</strong>
        </p>
      )}

      <ProgressBar
        direction={direction}
        interpolatedPos={train.interpolatedPos}
      />

      <div className="train-card-time">
        {isImminent ? (
          <div className="countdown-imminent">
            <span className="secs-big">{train.secsToArrive}</span>
            <span className="secs-unit">sec</span>
          </div>
        ) : (
          <div className="countdown-display">
            <div className="countdown-block">
              <FlipNumber value={mins} />
              <span className="countdown-label">min</span>
            </div>
            <span className="countdown-colon">:</span>
            <div className="countdown-block">
              <FlipNumber value={secs} />
              <span className="countdown-label">sec</span>
            </div>
          </div>
        )}
        <span className="eta">⏱ {train.eta}</span>
      </div>
      {travelMins != null && (
        <div className="travel-time-row">
          <span className="travel-time-label">🚆 Percorso</span>
          <span className="travel-time-value">{travelMins} min</span>
        </div>
      )}
    </div>
  );
}

export function NoTrainCard({ direction, travelMins }) {
  const isToStesicoro = direction === 'stesicoro';
  const label = isToStesicoro ? '→ Monte Po' : '← Stesicoro';
  const color = isToStesicoro ? '#e63946' : '#4fc3f7';
  return (
    <div className="train-card no-train">
      <div className="train-card-header">
        <span className="direction-label" style={{ color }}>{label}</span>
      </div>
      <p className="no-service">Nessun treno nei prossimi 90 minuti</p>
      {travelMins != null && (
        <div className="travel-time-row">
          <span className="travel-time-label">🚆 Percorso</span>
          <span className="travel-time-value">{travelMins} min</span>
        </div>
      )}
    </div>
  );
}
