export default function TreniApp({ onBack }) {
  return (
    <div className="app treni-app">
      <div className="ambient-red" /><div className="ambient-blue" />

      <header className="header">
        <div className="header-logo">
          <div className="logo-badge">🚆</div>
          <span className="logo-text">Treni</span>
        </div>
      </header>

      <button className="home-btn" onClick={onBack}>⌂ Home</button>

      <div className="treni-coming-soon">
        <div className="treni-coming-icon">🚆</div>
        <h2>Prossimamente disponibile</h2>
        <p>Orari treni regionali Trenitalia in Sicilia.</p>
        <p className="treni-coming-sub">Stiamo lavorando per integrare le tratte<br/>Catania–Siracusa, Catania–Messina, Catania–Palermo<br/>e le altre linee regionali.</p>
        <a
          href="https://www.trenitalia.com"
          target="_blank"
          rel="noopener noreferrer"
          className="treni-cta"
        >
          Vai a Trenitalia.com →
        </a>
      </div>
    </div>
  );
}
