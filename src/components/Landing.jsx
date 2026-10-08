import { useState } from 'react';
import { useI18n } from '../i18n';

// Griglia 2 colonne della home. `soon`: sezione annunciata ma non ancora attiva.
// Testi in src/i18n/locales/home.js (home.<id>.label / .desc).
const TILES = [
  { id: 'metro', icon: '🚇' },
  { id: 'bus', icon: '🚌' },
  { id: 'treni', icon: '🚆' },
  { id: 'pullman', icon: '🚍' },
  { id: 'scooter', icon: '🛴' },
  { id: 'taxi', icon: '🚕', soon: true },
  { id: 'parking', icon: '🅿️', soon: true },
];

export default function Landing({ onSelect, onSecretTrigger, onLanguage }) {
  const [shared, setShared] = useState(false);
  const { t, lang, langs } = useI18n();
  const currentLang = langs.find(l => l.code === lang);

  async function handleShare() {
    const url = window.location.origin;
    const shareData = {
      title: 'Movì CT',
      text: t('home.shareText'),
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {
      // Condivisione annullata dall'utente: nessuna azione.
    }
  }

  function handleExit() {
    // Chiude la finestra/PWA; se il browser non lo permette (finestra non
    // aperta da script) si va su una pagina vuota come fallback.
    try { window.close(); } catch { /* ignorato */ }
    setTimeout(() => {
      try { window.location.href = 'about:blank'; } catch { /* ignorato */ }
    }, 200);
  }

  return (
    <div className="landing">
      <button className="landing-lang-btn" onClick={onLanguage} aria-label={t('home.language')}>
        <span>{currentLang?.flag}</span>
        <span>{currentLang?.short}</span>
      </button>
      <div className="landing-header">
        <div
          className="logo-badge landing-logo movi-logo"
          onClick={onSecretTrigger}
          style={{ cursor: 'pointer' }}
        >
          <svg viewBox="0 0 48 48" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="24" r="7" fill="white"/>
            <rect x="19" y="22" width="10" height="4" rx="2" fill="white"/>
            <circle cx="36" cy="24" r="7" fill="none" stroke="white" strokeWidth="3.5"/>
            <circle cx="36" cy="24" r="2.5" fill="white"/>
          </svg>
        </div>
        <h1 className="landing-title">Movì CT</h1>
        <p className="landing-sub">{t('home.sub')}</p>
      </div>

      <div className="landing-buttons">
        {TILES.map(tile => (
          <button
            key={tile.id}
            className={`landing-btn ${tile.id}-btn${tile.soon ? ' is-soon' : ''}`}
            onClick={tile.soon ? undefined : () => onSelect(tile.id)}
            disabled={tile.soon}
          >
            <span className="landing-btn-icon">{tile.icon}</span>
            <span className="landing-btn-text">
              <span className="landing-btn-label">{t(`home.${tile.id}.label`)}</span>
              <span className="landing-btn-desc">{t(`home.${tile.id}.desc`)}</span>
            </span>
            {tile.soon && <span className="landing-btn-soon">{t('home.soon')}</span>}
          </button>
        ))}
      </div>

      <div className="landing-actions">
        <button className="landing-share-btn" onClick={handleShare}>
          <span className="landing-share-icon">📤</span>
          <span>{shared ? t('home.copied') : t('home.share')}</span>
        </button>
        <button className="landing-exit-btn" onClick={handleExit}>
          <span className="landing-share-icon">⏻</span>
          <span>{t('home.exit')}</span>
        </button>
      </div>

      <p className="landing-footer">
        {t('home.footer')}
        <br />
        <span className="landing-credit">Product 2026 · Stefano Di Bella</span>
      </p>
    </div>
  );
}
