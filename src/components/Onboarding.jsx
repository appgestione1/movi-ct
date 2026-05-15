import { useState } from 'react';
import { STATIONS } from '../data/schedule';

export default function Onboarding({ onComplete, onBack }) {
  const [step, setStep] = useState(1);
  const [boardingIdx, setBoardingIdx] = useState(null);

  function pickBoarding(i) {
    setBoardingIdx(i);
    setStep(2);
  }

  function pickDestination(i) {
    onComplete({ boardingIdx, destinationIdx: i });
  }

  return (
    <div className="onboarding">
      <div className="ob-header">
        <div className="logo-badge" style={{ marginBottom: 8 }}>M</div>
        <h1 className="ob-title">Metro CT</h1>
        <p className="ob-sub">Metropolitana FCE · Catania</p>
      </div>

      <div className="ob-card">
        {step === 1 ? (
          <>
            <p className="ob-question">
              <span className="ob-step">1/2</span>
              Da dove sali?
            </p>
            <div className="ob-grid">
              {STATIONS.map((s, i) => (
                <button key={s.id} className="ob-btn" onClick={() => pickBoarding(i)}>
                  {s.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="ob-question">
              <span className="ob-step">2/2</span>
              Dove vuoi andare?
            </p>
            <div className="ob-selected-route">
              <span className="ob-from">{STATIONS[boardingIdx].name}</span>
              <span className="ob-arrow">→</span>
              <span className="ob-to">?</span>
            </div>
            <div className="ob-grid">
              {STATIONS.map((s, i) => {
                if (i === boardingIdx) return null;
                return (
                  <button
                    key={s.id}
                    className={`ob-btn ${i < boardingIdx ? 'ob-btn-blue' : ''}`}
                    onClick={() => pickDestination(i)}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
            <button className="ob-back" onClick={() => setStep(1)}>
              ← Cambia stazione di partenza
            </button>
          </>
        )}
      </div>

      {onBack && <button className="home-btn" onClick={onBack}>⌂ Home</button>}
    </div>
  );
}
