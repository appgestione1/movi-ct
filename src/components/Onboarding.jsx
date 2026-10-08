import { useState } from 'react';
import { STATIONS } from '../data/schedule';
import { useI18n } from '../i18n';

export default function Onboarding({ onComplete, onBack }) {
  const { t } = useI18n();
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
        <h1 className="ob-title">{t('metro.title')}</h1>
        <p className="ob-sub">{t('metro.sub')}</p>
      </div>

      <div className="ob-card">
        {step === 1 ? (
          <>
            <p className="ob-question">
              <span className="ob-step">1/2</span>
              {t('metro.whereFrom')}
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
              {t('metro.whereTo')}
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
              {t('metro.changeStart')}
            </button>
          </>
        )}
      </div>

      {onBack && <button className="home-btn" onClick={onBack}>{t('metro.home')}</button>}
    </div>
  );
}
