import { useI18n } from '../i18n';

export default function TreniApp({ onBack }) {
  const { t } = useI18n();
  const sub = t('treni.soonSub');
  return (
    <div className="app treni-app">
      <div className="ambient-red" /><div className="ambient-blue" />

      <header className="header">
        <div className="header-logo">
          <div className="logo-badge">🚆</div>
          <span className="logo-text">{t('treni.title')}</span>
        </div>
      </header>

      <button className="home-btn" onClick={onBack}>{t('scooter.home')}</button>

      <div className="treni-coming-soon">
        <div className="treni-coming-icon">🚆</div>
        <h2>{t('treni.soonTitle')}</h2>
        <p>{t('treni.soonText')}</p>
        <p className="treni-coming-sub">{sub.map((line, i) => (<span key={i}>{i > 0 && <br />}{line}</span>))}</p>
        <a
          href="https://www.trenitalia.com"
          target="_blank"
          rel="noopener noreferrer"
          className="treni-cta"
        >
          {t('treni.cta')}
        </a>
      </div>
    </div>
  );
}
