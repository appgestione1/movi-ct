import { INTERCITY_COMPANIES, INTERCITY_DESTINATIONS, TERMINAL } from '../data/intercityProviders';

export default function IntercityBus({ onBack }) {
  const companyById = id => INTERCITY_COMPANIES.find(c => c.id === id);

  return (
    <div className="intercity-page">
      <div className="ob-header">
        <div className="bus-title-row">
          <div
            className="logo-badge"
            style={{ background: '#f59e0b', boxShadow: '0 0 16px rgba(245,158,11,0.5)', flexShrink: 0 }}
          >
            🚍
          </div>
          <h1 className="ob-title" style={{ margin: 0 }}>Pullman Sicilia</h1>
        </div>
        <p className="ob-sub">Collegamenti extraurbani · Catania</p>
      </div>

      <div className="intercity-scroll">
        <div className="intercity-terminal">
          <span className="intercity-terminal-pin">📍</span>
          <div>
            <strong>{TERMINAL.name}</strong>
            <p>{TERMINAL.desc}</p>
          </div>
        </div>

        <p className="intercity-section-label">Destinazioni</p>

        <div className="intercity-list">
          {INTERCITY_DESTINATIONS.map(d => (
            <div key={d.city} className="intercity-card">
              <span className="intercity-city">{d.city}</span>
              <div className="intercity-companies">
                {d.companies.map(id => {
                  const c = companyById(id);
                  return (
                    <a
                      key={id}
                      className="intercity-chip"
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ borderColor: c.color, color: c.color }}
                    >
                      {c.name}
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <p className="intercity-note">
          Orari aggiornati e acquisto biglietti sui siti ufficiali delle compagnie.
          Movì CT non vende biglietti.
        </p>
      </div>

      <button className="home-btn" onClick={onBack}>⌂ Home</button>
    </div>
  );
}
