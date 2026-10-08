import { useI18n } from '../i18n';

// Scelta lingua: al primo avvio (nessuna lingua salvata) e dal pulsante lingua in home.
export default function LanguagePicker({ onDone }) {
  const { t, lang, langs, setLang } = useI18n();
  return (
    <div className="landing lang-picker">
      <div className="landing-header">
        <h1 className="landing-title">Movì CT</h1>
        <p className="landing-sub">{t('home.chooseLanguage')}</p>
      </div>
      <div className="lang-picker-list">
        {langs.map(l => (
          <button
            key={l.code}
            className={`lang-picker-btn${l.code === lang ? ' active' : ''}`}
            onClick={() => { setLang(l.code); onDone?.(); }}
          >
            <span className="lang-picker-flag">{l.flag}</span>
            <span>{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
