export default function Landing({ onSelect }) {
  return (
    <div className="landing">
      <div className="landing-header">
        <div className="logo-badge landing-logo movi-logo">
          <svg viewBox="0 0 48 48" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="24" r="7" fill="white"/>
            <rect x="19" y="22" width="10" height="4" rx="2" fill="white"/>
            <circle cx="36" cy="24" r="7" fill="none" stroke="#4fc3f7" strokeWidth="3.5"/>
            <circle cx="36" cy="24" r="2.5" fill="#4fc3f7"/>
          </svg>
        </div>
        <h1 className="landing-title">Movì CT</h1>
        <p className="landing-sub">Trasporti pubblici · Catania</p>
      </div>

      <div className="landing-buttons">
        <button className="landing-btn metro-btn" onClick={() => onSelect('metro')}>
          <span className="landing-btn-icon">🚇</span>
          <span className="landing-btn-label">Metro</span>
          <span className="landing-btn-desc">FCE · 12 stazioni</span>
        </button>

        <button className="landing-btn bus-btn" onClick={() => onSelect('bus')}>
          <span className="landing-btn-icon">🚌</span>
          <span className="landing-btn-label">Bus</span>
          <span className="landing-btn-desc">AMTS · 46 linee</span>
        </button>
      </div>

      <p className="landing-footer">Dati non ufficiali — FCE &amp; AMTS Catania</p>
    </div>
  );
}
