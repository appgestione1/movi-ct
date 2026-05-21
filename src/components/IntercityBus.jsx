import { useEffect, useMemo, useRef, useState } from 'react';
import {
  QUICK_TAPS,
  CATEGORY_LABELS,
} from '../data/intercityNetwork';
import {
  searchCities,
  buildResults,
  getCity,
  getHub,
  cityName,
  getAvailableBuses,
  generateTicketLink,
  mapsUrl,
  clipboardText,
  reportErrorMailto,
  getDocsForCarrier,
  docUrl,
  DOC_TYPE_LABELS,
} from '../utils/intercity';

// Carriers e città coperti da serviziinformazioni.it (dati live)
const LIVE_CARRIERS = new Set(['interbus', 'etna', 'segesta']);
const LIVE_CITIES   = new Set([
  'catania','aeroporto',
  'siracusa','noto','ragusa','modica',
  'taormina','francavilla',
  'messina','palermo','enna','caltanissetta',
  'caltagirone','gela','piazza-armerina',
  'troina','nicosia',
  'acireale','belpasso',
]);

// Carriers con proxy SAIS (api/sais-live.js — stub finché API non configurata)
const SAIS_CARRIERS = new Set(['sais', 'saist']);

// Carriers senza dati live ma con biglietteria online diretta (portale ufficiale).
// Il dettaglio tratta mostra il pulsante "Acquista" su ogni corsa e una nota
// sulla validità del titolo. Non c'è prenotazione posto: AST e FCE vendono
// titoli validi per la tratta/fascia, non per la singola corsa.
const PORTAL_CARRIERS = new Set(['ast', 'fce']);
const PORTAL_TICKET_NOTE = {
  ast: 'Biglietto valido per la tratta · acquisto sul portale AST, in app, a bordo o in rivendita',
  fce: 'Biglietto a fasce chilometriche, validità giornaliera · acquisto sul portale FCE, in app, a bordo o in rivendita',
};

// Topic ntfy.sh per notifica errore proxy SAIS.
// Configura VITE_NTFY_TOPIC in .env.local (o Vercel env) con il tuo topic.
// Scarica l'app ntfy (iOS/Android) e iscriviti allo stesso topic.
const NTFY_TOPIC = import.meta.env.VITE_NTFY_TOPIC || 'movi-ct-sais-alerts';

function sendErrorNotification(carrierName, originId, destId) {
  fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: 'POST',
    headers: {
      Title:    `Movì CT — ${carrierName} live down`,
      Priority: 'high',
      Tags:     'warning,bus',
    },
    body: `Proxy ${carrierName} (${originId}→${destId}) ha restituito errore.\nVerifica e ripristina api/sais-live.js oppure attiva il fallback.`,
  }).catch(() => {});
}

// Formatta una Date come valore per <input type="datetime-local"> ("YYYY-MM-DDTHH:MM").
function toLocalInputValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return (
    date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + 'T' +
    pad(date.getHours()) + ':' +
    pad(date.getMinutes())
  );
}

function parseLocalInputValue(value) {
  if (!value) return new Date();
  const [d, t] = value.split('T');
  const [Y, M, D] = d.split('-').map(Number);
  const [h, m] = (t || '00:00').split(':').map(Number);
  return new Date(Y, M - 1, D, h, m);
}

// ─────────────────────────────────────────────────────────────────────────
// Componente principale: gestisce il routing tra le 3 viste interne.
// ─────────────────────────────────────────────────────────────────────────
export default function IntercityBus({ onBack }) {
  const [view, setView] = useState('search'); // 'search' | 'results' | 'detail'

  // stato ricerca
  const [fromId, setFromId] = useState(null);
  const [toId, setToId] = useState(null);
  const [hubMode, setHubMode] = useState(null); // null | 'aeroporto'
  const [searchAt, setSearchAt] = useState(() => toLocalInputValue(new Date()));

  // risultato selezionato per il dettaglio
  const [selected, setSelected] = useState(null);

  function goToResults() {
    setView('results');
    setSelected(null);
  }

  function startCityRoute(from, to) {
    setHubMode(null);
    setFromId(from);
    setToId(to);
    goToResults();
  }

  function startHubMode(mode) {
    setHubMode(mode);
    setFromId(null);
    setToId(null);
    goToResults();
  }

  if (view === 'detail' && selected) {
    return (
      <IntercityDetail
        result={selected}
        searchAt={parseLocalInputValue(searchAt)}
        onBack={() => setView('results')}
        onHome={onBack}
      />
    );
  }

  if (view === 'results') {
    return (
      <IntercityResults
        fromId={fromId}
        toId={toId}
        hubMode={hubMode}
        onPick={result => { setSelected(result); setView('detail'); }}
        onEdit={() => setView('search')}
        onHome={onBack}
      />
    );
  }

  return (
    <IntercitySearch
      fromId={fromId}
      toId={toId}
      onFromChange={setFromId}
      onToChange={setToId}
      searchAt={searchAt}
      onSearchAtChange={setSearchAt}
      onSubmit={() => startCityRoute(fromId, toId)}
      onQuickTap={tap => {
        if (tap.kind === 'hub') startHubMode(tap.hubMode);
        else startCityRoute('catania', tap.cityId);
      }}
      onHome={onBack}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// View 1 — Dashboard / Ricerca
// ─────────────────────────────────────────────────────────────────────────
function IntercitySearch({
  fromId, toId, onFromChange, onToChange,
  searchAt, onSearchAtChange,
  onSubmit, onQuickTap, onHome,
}) {
  const canSearch = fromId && toId && fromId !== toId;

  function swap() {
    onFromChange(toId);
    onToChange(fromId);
  }

  function setNow() {
    onSearchAtChange(toLocalInputValue(new Date()));
  }

  return (
    <div className="ic-page">
      <div className="ob-header">
        <div className="bus-title-row">
          <div className="logo-badge ic-logo">🚍</div>
          <h1 className="ob-title" style={{ margin: 0 }}>Pullman Sicilia</h1>
        </div>
        <p className="ob-sub">Collegamenti extraurbani · da e per Catania</p>
      </div>

      <div className="ic-search-card">
        <CityField
          label="Da"
          accent="green"
          selectedId={fromId}
          excludeId={toId}
          onChange={onFromChange}
          placeholder="Punto di partenza…"
        />

        <button
          className="ic-swap"
          onClick={swap}
          aria-label="Inverti origine e destinazione"
          disabled={!fromId && !toId}
        >⇅</button>

        <CityField
          label="A"
          accent="red"
          selectedId={toId}
          excludeId={fromId}
          onChange={onToChange}
          placeholder="Destinazione…"
        />

        <div className="ic-when">
          <label className="planner-label">🕓 Quando</label>
          <div className="ic-when-row">
            <input
              type="datetime-local"
              className="ic-datetime"
              value={searchAt}
              onChange={e => onSearchAtChange(e.target.value)}
            />
            <button className="ic-when-now" onClick={setNow}>Adesso</button>
          </div>
        </div>

        <button
          className={`ic-cta ${canSearch ? '' : 'ic-cta-disabled'}`}
          onClick={() => canSearch && onSubmit()}
          disabled={!canSearch}
        >
          Cerca pullman
        </button>
      </div>

      <p className="ic-section-label">Mete rapide</p>
      <div className="ic-quicktaps">
        {QUICK_TAPS.map((t, i) => (
          <button
            key={i}
            className="ic-quicktap"
            onClick={() => onQuickTap(t)}
          >
            <span className="ic-quicktap-icon">{t.icon}</span>
            <span className="ic-quicktap-label">{t.label}</span>
          </button>
        ))}
      </div>

      <p className="ic-disclaimer">
        Movì CT centralizza i collegamenti dei vettori siciliani. Gli orari
        ufficiali e l'acquisto dei biglietti restano sui siti delle compagnie:
        non pubblichiamo orari non verificati.
      </p>

      <button className="home-btn" onClick={onHome}>⌂ Home</button>
    </div>
  );
}

// ── Input città con autocompletamento ───────────────────────────────────
function CityField({ label, accent, selectedId, excludeId, onChange, placeholder }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const selected = selectedId ? getCity(selectedId) : null;

  // chiudi dropdown al click fuori
  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const results = useMemo(
    () => (open ? searchCities(selected ? '' : text, { excludeId }) : []),
    [text, selected, excludeId, open],
  );

  function pick(city) {
    onChange(city.id);
    setText('');
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setText('');
    setOpen(false);
  }

  const accentClass = accent === 'green' ? 'ic-dot-green'
    : accent === 'red' ? 'ic-dot-red'
    : '';

  return (
    <div className="ic-field" ref={wrapRef}>
      <label className="planner-label">
        <span className={`ic-dot ${accentClass}`} /> {label}
      </label>
      <div className="planner-input-wrap">
        {selected ? (
          <div className="ic-selected">
            <span className="ic-selected-name">{selected.name}</span>
            <button className="planner-clear" onClick={clear} aria-label="Cancella">×</button>
          </div>
        ) : (
          <input
            className="ob-search planner-input"
            type="text"
            value={text}
            onChange={e => { setText(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            autoComplete="off"
          />
        )}
        {open && !selected && results.length > 0 && (
          <div className="planner-dropdown ic-dropdown">
            {results.map(city => (
              <button
                key={city.id}
                className="planner-drop-item"
                onClick={() => pick(city)}
              >
                <span>{city.name}</span>
                {city.area && <span className="ic-area-tag">{city.area}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// View 2 — Risultati
// ─────────────────────────────────────────────────────────────────────────
function IntercityResults({ fromId, toId, hubMode, onPick, onEdit, onHome }) {
  const [carrierFilter, setCarrierFilter] = useState(null); // carrierId | null
  const [onlyDirect, setOnlyDirect] = useState(false);

  const allRows = useMemo(() => {
    if (hubMode) return buildResults({ hubMode });
    return buildResults({ fromId, toId });
  }, [fromId, toId, hubMode]);

  const carrierChips = useMemo(() => {
    const seen = new Map();
    for (const r of allRows) seen.set(r.carrier.id, r.carrier);
    return Array.from(seen.values());
  }, [allRows]);

  const rows = useMemo(() => {
    let r = allRows;
    if (carrierFilter) r = r.filter(x => x.carrier.id === carrierFilter);
    if (onlyDirect)   r = r.filter(x => x.isDirect);
    // ordina: dirette prima, poi per nome destinazione/vettore
    return [...r].sort((a, b) => {
      if (a.isDirect !== b.isDirect) return a.isDirect ? -1 : 1;
      const an = cityName(a.destId), bn = cityName(b.destId);
      if (an !== bn) return an.localeCompare(bn);
      return a.carrier.name.localeCompare(b.carrier.name);
    });
  }, [allRows, carrierFilter, onlyDirect]);

  const title = hubMode === 'aeroporto'
    ? 'Linee dall\'Aeroporto'
    : `${cityName(fromId)} → ${cityName(toId)}`;

  return (
    <div className="ic-page">
      <div className="ic-results-header">
        <button className="ic-back" onClick={onEdit}>← Modifica</button>
        <h2 className="ic-results-title">{title}</h2>
        <p className="ic-results-sub">
          {rows.length === 0
            ? 'Nessuna tratta diretta trovata'
            : `${rows.length} collegament${rows.length === 1 ? 'o' : 'i'}`}
        </p>
      </div>

      {allRows.length > 0 && (
        <div className="ic-filters">
          <button
            className={`ic-chip ${carrierFilter === null ? 'is-on' : ''}`}
            onClick={() => setCarrierFilter(null)}
          >Tutte</button>
          {carrierChips.map(c => (
            <button
              key={c.id}
              className={`ic-chip ${carrierFilter === c.id ? 'is-on' : ''}`}
              style={carrierFilter === c.id
                ? { background: c.color, borderColor: c.color, color: '#fff' }
                : { borderColor: c.color, color: c.color }}
              onClick={() => setCarrierFilter(carrierFilter === c.id ? null : c.id)}
            >{c.name.replace(' Autolinee', '').replace(' Trasporti', '')}</button>
          ))}
          <button
            className={`ic-chip ${onlyDirect ? 'is-on' : ''}`}
            onClick={() => setOnlyDirect(v => !v)}
          >Solo dirette</button>
        </div>
      )}

      <div className="ic-results-list">
        {rows.length === 0 && (
          <EmptyResults fromId={fromId} toId={toId} hubMode={hubMode} />
        )}
        {rows.map(r => (
          <button key={r.id} className="ic-result-card" onClick={() => onPick(r)}>
            <div className="ic-card-row">
              <span className="ic-carrier-badge" style={{ background: r.carrier.color }}>
                {r.carrier.mono}
              </span>
              <div className="ic-card-route">
                <span className="ic-card-from">{cityName(r.originId)}</span>
                <span className="ic-card-arrow">→</span>
                <span className="ic-card-to">{cityName(r.destId)}</span>
              </div>
              <span className="ic-card-chev">›</span>
            </div>
            <div className="ic-card-meta">
              <span className="ic-card-carrier" style={{ color: r.carrier.color }}>
                {r.carrier.name}
              </span>
              {r.isDirect
                ? <span className="ic-card-pill ic-pill-direct">Diretta</span>
                : <span className="ic-card-pill">{r.viaCities.length} ferm.</span>}
              <span className="ic-card-category">{CATEGORY_LABELS[r.category] || r.category}</span>
            </div>
            <div className="ic-card-hub">
              {r.departureHubId
                ? <>📍 {getHub(r.departureHubId).short}</>
                : <>📍 Fermata di {cityName(r.originId)}</>}
            </div>
            {!r.isDirect && (
              <div className="ic-card-via">
                via {r.viaCities.map(cityName).join(' · ')}
              </div>
            )}
          </button>
        ))}
      </div>

      <button className="home-btn" onClick={onHome}>⌂ Home</button>
    </div>
  );
}

function EmptyResults({ fromId, toId, hubMode }) {
  // Caso speciale: collegamento città → aeroporto interno alla città di Catania.
  if (!hubMode && (
      (fromId === 'catania' && toId === 'aeroporto') ||
      (fromId === 'aeroporto' && toId === 'catania'))) {
    return (
      <div className="ic-empty">
        <p><strong>Per il collegamento Città ↔ Aeroporto usa la sezione Bus.</strong></p>
        <p>Il servizio Alibus di AMTS collega la Stazione Centrale con Fontanarossa
           ogni 25 min circa. Non si tratta di una tratta extraurbana.</p>
      </div>
    );
  }
  return (
    <div className="ic-empty">
      <p><strong>Nessun pullman extraurbano collega direttamente queste due località.</strong></p>
      <p>Prova a cercare con una città intermedia o cambia la destinazione.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// View 3 — Dettaglio tratta
// ─────────────────────────────────────────────────────────────────────────
function IntercityDetail({ result, searchAt, onBack, onHome }) {
  const { connection, carrier, originId, destId, departureHubId, viaCities, isDirect } = result;
  const hub = departureHubId ? getHub(departureHubId) : null;
  const [copied, setCopied] = useState(false);

  const link = useMemo(
    () => generateTicketLink(carrier.id, originId, destId, searchAt),
    [carrier.id, originId, destId, searchAt],
  );

  // Eventuali corse reali per il giorno scelto (vuoto finché non ci sono orari ufficiali).
  const trips = useMemo(
    () => getAvailableBuses(originId, destId, searchAt).filter(t => t.carrier.id === carrier.id),
    [originId, destId, searchAt, carrier.id],
  );

  // Provenance: mostrata sia quando ci sono orari in app (per dichiarare la fonte),
  // sia quando non ce ne sono ma esiste un PDF/sito ufficiale che li contiene.
  const meta = connection.schedulesMeta || null;

  // Documenti ufficiali pertinenti (carrier-level + connection-level).
  const docs = useMemo(
    () => getDocsForCarrier(carrier.id, connection.id),
    [carrier.id, connection.id],
  );

  async function copyTratta() {
    const text = clipboardText(originId, destId, searchAt);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback: alcuni browser bloccano clipboard in contesti non sicuri
      window.prompt('Copia la tratta da incollare nel sito ufficiale:', text);
    }
  }

  function openCta() {
    if (link.url) window.open(link.url, '_blank', 'noopener,noreferrer');
  }

  function openMaps() {
    if (!hub) return;
    window.open(mapsUrl(hub.lat, hub.lng, hub.name), '_blank', 'noopener,noreferrer');
  }

  function openPhone() {
    if (carrier.phone) window.location.href = `tel:${carrier.phone}`;
  }

  function reportError() {
    window.location.href = reportErrorMailto(carrier.name, originId, destId);
  }

  // Tappe ordinate per la timeline: origine → via → destinazione.
  const stops = [originId, ...viaCities, destId];

  return (
    <div className="ic-page">
      <div className="ic-detail-header">
        <button className="ic-back" onClick={onBack}>← Risultati</button>
        <div className="ic-detail-route">
          <span className="ic-carrier-badge ic-detail-badge" style={{ background: carrier.color }}>
            {carrier.mono}
          </span>
          <div className="ic-detail-route-text">
            <span className="ic-detail-from">{cityName(originId)}</span>
            <span className="ic-detail-arrow">→</span>
            <span className="ic-detail-to">{cityName(destId)}</span>
          </div>
        </div>
        <p className="ic-detail-carrier" style={{ color: carrier.color }}>
          {carrier.name}
          {isDirect ? ' · Tratta diretta' : ` · ${viaCities.length} ferm. intermedie`}
        </p>
      </div>

      {hub && (
        <div className="ic-hub-card">
          <div className="ic-hub-head">
            <span className="ic-hub-pin">📍</span>
            <div>
              <strong>Partenza: {hub.short}</strong>
              <p>{hub.desc}</p>
            </div>
          </div>
          <button className="ic-hub-maps" onClick={openMaps}>Apri in Mappe</button>
        </div>
      )}

      <p className="ic-section-label">Tappe</p>
      <ol className="ic-stops">
        {stops.map((sid, i) => (
          <li
            key={sid + i}
            className={`ic-stop ${i === 0 ? 'is-origin' : i === stops.length - 1 ? 'is-dest' : ''}`}
          >
            <span className="ic-stop-dot" />
            <span className="ic-stop-name">{cityName(sid)}</span>
          </li>
        ))}
      </ol>

      <OfficialRouteStops connection={connection} originId={originId} destId={destId} />

      <FareTable meta={meta} originId={originId} destId={destId} routes={connection.routes} />

      {connection.note && (
        <div className="ic-alert ic-alert-info">
          <span className="ic-alert-icon">ℹ️</span>
          <p>{connection.note}</p>
        </div>
      )}

      <div className="ic-alert ic-alert-warn">
        <span className="ic-alert-icon">⚠️</span>
        <p>{carrier.note}</p>
      </div>

      <p className="ic-section-label">Orari per {formatDay(searchAt)}</p>
      {trips.length > 0 ? (
        <>
          <ul className="ic-trips-detailed">
            {trips.map((t, i) => (
              <li key={i} className="ic-trip-row">
                <div className="ic-trip-times">
                  <span className="ic-trip-time">{t.orario_partenza}</span>
                  <span className="ic-trip-arrow">→</span>
                  <span className="ic-trip-time">{t.orario_arrivo || '—'}</span>
                </div>
                {t.note && <span className="ic-trip-note">{t.note}</span>}
                {PORTAL_CARRIERS.has(carrier.id) && (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ic-trip-book"
                  >
                    🎟️ Acquista ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
          {PORTAL_CARRIERS.has(carrier.id) && (
            <p className="ic-live-note">{PORTAL_TICKET_NOTE[carrier.id]}</p>
          )}
          {meta && <SchedulesProvenance meta={meta} />}
        </>
      ) : (
        <div className="ic-no-schedules-block">
          <p className="ic-no-schedules">
            {meta && meta.sourceUrl
              ? 'Per questa tratta Movì CT non ha ancora orari ufficiali estratti. Apri il quadro orari completo sul sito del vettore:'
              : "Movì CT non pubblica orari non verificati. Consulta il quadro orari aggiornato sul sito ufficiale del vettore."}
          </p>
          {meta && meta.sourceUrl && (
            <a
              href={meta.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ic-pdf-btn"
            >📄 Apri PDF orari ufficiali ↗</a>
          )}
          {meta && <SchedulesProvenance meta={meta} />}
          {PORTAL_CARRIERS.has(carrier.id) && (
            <>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ic-sais-book-btn"
              >
                🎟️ {link.label} ↗
              </a>
              <p className="ic-live-note">{PORTAL_TICKET_NOTE[carrier.id]}</p>
            </>
          )}
        </div>
      )}

      {LIVE_CARRIERS.has(carrier.id) &&
       LIVE_CITIES.has(originId) &&
       LIVE_CITIES.has(destId) && (
        <LiveDepartures
          originId={originId}
          destId={destId}
          carrierId={carrier.id}
          date={searchAt}
        />
      )}

      {SAIS_CARRIERS.has(carrier.id) && (
        <SaisLiveDepartures
          originId={originId}
          destId={destId}
          carrierId={carrier.id}
          date={searchAt}
          trips={trips}
          carrier={carrier}
          bookingUrl={link.url}
        />
      )}

      {docs.length > 0 && (
        <>
          <p className="ic-section-label">📂 Documenti ufficiali</p>
          <ul className="ic-docs">
            {docs.map(d => (
              <li key={d.id}>
                <a
                  href={docUrl(d)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ic-doc"
                >
                  <div className="ic-doc-head">
                    <span className="ic-doc-type">{DOC_TYPE_LABELS[d.type] || d.type}</span>
                    <span className="ic-doc-title">{d.title}</span>
                  </div>
                  {d.note && <p className="ic-doc-note">{d.note}</p>}
                  <div className="ic-doc-meta">
                    {d.tratta ? <span className="ic-doc-tag ic-doc-tag-tratta">Per questa tratta</span> : <span className="ic-doc-tag">Generico vettore</span>}
                    {d.size && <span>{(d.size / 1024 / 1024).toFixed(2)} MB</span>}
                    {d.filename ? <span>PDF locale</span> : <span>Sito vettore ↗</span>}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="ic-detail-actions">
        <button className="ic-cta" onClick={openCta}>
          {link.label} ↗
        </button>
        <button className="ic-cta-secondary" onClick={copyTratta}>
          {copied ? '✓ Tratta copiata' : '📋 Copia tratta'}
        </button>
        {carrier.phone && (
          <button className="ic-cta-secondary" onClick={openPhone}>
            📞 Contatta {carrier.name.split(' ')[0]}
          </button>
        )}
        <button className="ic-report" onClick={reportError}>
          ⚠︎ Segnala un errore o invia un orario in questa tratta
        </button>
      </div>

      <button className="home-btn" onClick={onHome}>⌂ Home</button>
    </div>
  );
}

// Mostra il percorso ufficiale completo della linea (codice ministeriale + km +
// fermate in ordine, tra origine e destinazione scelte dall'utente).
// Si attiva solo quando il manifest ha `connection.routes[]` popolato dal
// parser Regione Sicilia. Non sostituisce le "tappe" sintetiche, le integra.
function OfficialRouteStops({ connection, originId, destId }) {
  const routes = connection.routes;
  if (!Array.isArray(routes) || routes.length === 0) return null;

  // Per ogni route della linea, mostra solo il segmento tra origine e dest.
  const segments = routes.map(route => {
    const fermate = Array.isArray(route.fermate) ? route.fermate : [];
    if (fermate.length === 0) return null;
    const iFrom = fermate.findIndex(f => f.cityId === originId);
    const iTo = fermate.findIndex(f => f.cityId === destId);
    if (iFrom < 0 || iTo < 0) return null;
    const [lo, hi] = iFrom < iTo ? [iFrom, iTo] : [iTo, iFrom];
    const segment = fermate.slice(lo, hi + 1);
    const kmStart = segment[0].km;
    const kmEnd = segment[segment.length - 1].km;
    const km = (kmStart != null && kmEnd != null && segment.length > 1)
      ? Math.abs(kmEnd - kmStart)
      : null;
    return { route, segment, km };
  }).filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <div className="ic-official-routes">
      <p className="ic-section-label">🚏 Fermate ufficiali della linea</p>
      {segments.map((s, i) => (
        <div key={s.route.code + '-' + i} className="ic-official-route">
          <div className="ic-official-route-head">
            <strong>Linea {s.route.code}</strong>
            {s.route.label && <span> · {s.route.label}</span>}
            {s.km != null && <span className="ic-official-km"> · {s.km.toFixed(1)} km</span>}
          </div>
          <ol className="ic-official-stops">
            {s.segment.map((f, j) => (
              <li key={j} className="ic-official-stop">
                <span className="ic-official-stop-km">{f.km != null ? f.km.toFixed(1) + ' km' : '—'}</span>
                <span className="ic-official-stop-name">{f.name}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

// Tariffe chilometriche pubblicate dalla Regione (quando disponibili nel PDF).
// Calcola la fascia applicabile alla distanza tra origine e destinazione.
function FareTable({ meta, originId, destId, routes }) {
  const fareTable = meta && Array.isArray(meta.fareTable) ? meta.fareTable : null;
  if (!fareTable || fareTable.length === 0) return null;

  // Tenta di stimare la distanza tra origine e destinazione usando la route
  // ufficiale con il km totale più rappresentativo.
  let estKm = null;
  if (Array.isArray(routes)) {
    for (const r of routes) {
      const fermate = Array.isArray(r.fermate) ? r.fermate : [];
      const a = fermate.find(f => f.cityId === originId);
      const b = fermate.find(f => f.cityId === destId);
      if (a && b && a.km != null && b.km != null) {
        estKm = Math.abs(b.km - a.km);
        break;
      }
    }
  }
  const applicable = estKm != null
    ? fareTable.find(f => f.kmMax >= estKm) || fareTable[fareTable.length - 1]
    : null;

  return (
    <div className="ic-fares">
      <p className="ic-section-label">💶 Tariffe ufficiali (Regione Sicilia)</p>
      {applicable && estKm != null && (
        <p className="ic-fare-est">
          Tratta stimata <strong>{estKm.toFixed(1)} km</strong> · fascia
          fino a {applicable.kmMax} km: <strong>€ {applicable.euro.toFixed(2)}</strong>
        </p>
      )}
      <ul className="ic-fare-list">
        {fareTable.map((f, i) => (
          <li key={i} className={applicable && f.kmMax === applicable.kmMax ? 'is-active' : ''}>
            fino a <strong>{f.kmMax} km</strong> — € {f.euro.toFixed(2)}
          </li>
        ))}
      </ul>
      <p className="ic-fare-note">
        Tariffario ufficiale del concedente regionale. Verifica sempre a bordo o in biglietteria.
      </p>
    </div>
  );
}

// Mostra fonte ufficiale + data ultimo refresh + periodo di validità.
function SchedulesProvenance({ meta }) {
  const fmt = iso => {
    if (!iso) return null;
    const [Y, M, D] = iso.split('-');
    return `${D}/${M}/${Y}`;
  };
  return (
    <div className="ic-provenance">
      <p>
        Aggiornato il <strong>{fmt(meta.lastUpdatedAt)}</strong>
        {meta.source && <> · fonte: <strong>{meta.source}</strong></>}
      </p>
      {(meta.validFrom || meta.validTo) && (
        <p className="ic-provenance-sub">
          Quadro orari in vigore
          {meta.validFrom && <> dal {fmt(meta.validFrom)}</>}
          {meta.validTo && <> fino al {fmt(meta.validTo)}</>}.
        </p>
      )}
      {meta.sourceUrl && (
        <a
          href={meta.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ic-provenance-link"
        >Vedi fonte ufficiale ↗</a>
      )}
    </div>
  );
}

function formatDay(date) {
  const giorni = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
                'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  return `${giorni[date.getDay()]} ${date.getDate()} ${mesi[date.getMonth()]}`;
}

// ─────────────────────────────────────────────────────────────────────────
// SaisLiveDepartures — blocco disponibilità per SAIS Autolinee / SAIS Trasporti
//
// Stato del proxy (api/sais-live.js):
//   'live'           → orari reali da /search/s: corse con orario, prezzo, acquisto
//   'not_configured' → tratta non coperta o 0 corse: mostra orari statici + booking
//   'error'          → proxy/API rotto: toast + notifica ntfy + fallback statico
// ─────────────────────────────────────────────────────────────────────────
function SaisLiveDepartures({ originId, destId, carrierId, date, trips, carrier, bookingUrl }) {
  const [state, setState] = useState('loading');
  const [corse, setCorse] = useState([]);
  const [toast, setToast] = useState(false);

  const dateStr = date instanceof Date
    ? date.toLocaleDateString('sv-SE')
    : new Date().toLocaleDateString('sv-SE');

  const nowHHMM = date instanceof Date
    ? `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
    : '00:00';

  useEffect(() => {
    setState('loading');
    setCorse([]);
    fetch(`/api/sais-live?from=${originId}&to=${destId}&date=${dateStr}&carrier=${carrierId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        if (data.status === 'live') {
          const future = data.corse.filter(c => c.dep >= nowHHMM);
          setCorse(future.length > 0 ? future : data.corse);
          setState('live');
        } else if (data.status === 'not_configured') {
          setState('not_configured');
        } else {
          // proxy configurato ma ha restituito errore
          setState('error');
          setToast(true);
          sendErrorNotification(carrier.name, originId, destId);
          setTimeout(() => setToast(false), 6000);
        }
      })
      .catch(() => {
        setState('error');
        setToast(true);
        sendErrorNotification(carrier.name, originId, destId);
        setTimeout(() => setToast(false), 6000);
      });
  }, [originId, destId, carrierId, dateStr]);

  // ── Stato: live ──────────────────────────────────────────────────────────
  if (state === 'live') {
    return (
      <div className="ic-live-block">
        <p className="ic-section-label">
          ⚡ Orari in tempo reale
          <span className="ic-live-badge">LIVE</span>
        </p>
        {corse.length === 0 ? (
          <div className="ic-live-empty">Nessuna corsa SAIS per questa data.</div>
        ) : (
          <ul className="ic-live-list">
            {corse.map((c, i) => (
              <li key={i} className="ic-live-row">
                <div className="ic-live-times">
                  <span className="ic-live-dep">{c.dep}</span>
                  <span className="ic-live-arr-sep">→</span>
                  <span className="ic-live-arr">{c.arr}</span>
                </div>
                <div className="ic-live-meta">
                  {c.price != null && (
                    <span className="ic-live-price">€{c.price.toFixed(2)}</span>
                  )}
                  {c.changes > 0 && (
                    <span className="ic-live-code">
                      {c.changes} {c.changes === 1 ? 'cambio' : 'cambi'}
                    </span>
                  )}
                </div>
                {c.bookUrl && (
                  <a href={c.bookUrl} target="_blank" rel="noopener noreferrer" className="ic-live-book">
                    Acquista ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="ic-live-note">Orari e tariffe in tempo reale · fonte: SAIS Autolinee</p>
      </div>
    );
  }

  // ── Stato: error — mostra toast + fallback ───────────────────────────────
  const showFallback = state === 'error';

  // ── Stato: not_configured o error → blocco prenotazione ─────────────────
  const hasTrips = Array.isArray(trips) && trips.length > 0;

  return (
    <>
      {toast && (
        <div className="ic-update-toast">
          <span>🔧 Dati live temporaneamente non disponibili — sito in aggiornamento</span>
          <button className="ic-toast-close" onClick={() => setToast(false)}>×</button>
        </div>
      )}

      {state === 'loading' && (
        <div className="ic-live-block">
          <div className="ic-live-loading">Carico disponibilità…</div>
        </div>
      )}

      {(state === 'not_configured' || showFallback) && (
        <div className="ic-live-block ic-sais-block">
          <p className="ic-section-label">
            🎟️ Disponibilità e biglietti
            {showFallback
              ? <span className="ic-sais-badge ic-sais-badge-warn">IN AGGIORNAMENTO</span>
              : <span className="ic-sais-badge">ONLINE</span>
            }
          </p>

          {/* Orari programmati dal manifest (fallback Option A) */}
          {hasTrips && showFallback && (
            <>
              <p className="ic-sais-fallback-note">
                Orari programmati verificati (dati live temporaneamente non disponibili):
              </p>
              <ul className="ic-live-list">
                {trips.map((t, i) => (
                  <li key={i} className="ic-live-row">
                    <div className="ic-live-times">
                      <span className="ic-live-dep">{t.orario_partenza}</span>
                      <span className="ic-live-arr-sep">→</span>
                      <span className="ic-live-arr">{t.orario_arrivo || '—'}</span>
                    </div>
                    {t.note && <span className="ic-live-code">{t.note}</span>}
                  </li>
                ))}
              </ul>
              <p className="ic-live-note">Orari verificati · non in tempo reale</p>
            </>
          )}

          {/* Booking link (Option B) */}
          {bookingUrl && (
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ic-sais-book-btn"
            >
              Verifica disponibilità e acquista su {carrier.name} ↗
            </a>
          )}
          {!bookingUrl && (
            <p className="ic-live-empty">Verifica disponibilità sul sito ufficiale del vettore.</p>
          )}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// LiveDepartures — partenze in tempo reale via serviziinformazioni.it
// Visibile solo per Interbus / Etna Trasporti / Segesta e città coperte.
// ─────────────────────────────────────────────────────────────────────────
function LiveDepartures({ originId, destId, carrierId, date }) {
  const [state, setState] = useState('idle'); // 'idle'|'loading'|'ok'|'error'
  const [corse, setCorse] = useState([]);

  const dateStr = date instanceof Date
    ? date.toLocaleDateString('sv-SE') // YYYY-MM-DD
    : new Date().toLocaleDateString('sv-SE');

  useEffect(() => {
    setState('loading');
    setCorse([]);
    const url = `/api/intercity-live?from=${originId}&to=${destId}&date=${dateStr}`;
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        // Filtra per carrier principale; se il filtro non produce risultati
        // (es. tratta servita da affiliato/subvettore), mostra tutte le corse.
        const CARRIER_IDS = { interbus: 2, etna: 1, segesta: 3 };
        const myId = CARRIER_IDS[carrierId];
        const byCarrier = myId ? data.corse.filter(c => c.carrierId === myId) : data.corse;
        const filtered = byCarrier.length > 0 ? byCarrier : data.corse;
        // mostra solo partenze dall'ora in poi (rispetto a date/ora ricerca)
        const nowHHMM = date instanceof Date
          ? `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
          : '00:00';
        const future = filtered.filter(c => c.dep >= nowHHMM);
        setCorse(future.length > 0 ? future : filtered);
        setState('ok');
      })
      .catch(() => setState('error'));
  }, [originId, destId, carrierId, dateStr]);

  if (state === 'idle') return null;

  return (
    <div className="ic-live-block">
      <p className="ic-section-label">
        ⚡ Partenze in tempo reale
        <span className="ic-live-badge">LIVE</span>
      </p>

      {state === 'loading' && (
        <div className="ic-live-loading">Carico disponibilità…</div>
      )}

      {state === 'error' && (
        <div className="ic-live-error">
          Dati live non disponibili al momento.
        </div>
      )}

      {state === 'ok' && corse.length === 0 && (
        <div className="ic-live-empty">
          Nessuna corsa disponibile per questa data su questo vettore.
        </div>
      )}

      {state === 'ok' && corse.length > 0 && (
        <ul className="ic-live-list">
          {corse.map((c, i) => (
            <li key={i} className="ic-live-row">
              <div className="ic-live-times">
                <span className="ic-live-dep">{c.dep}</span>
                <span className="ic-live-arr-sep">→</span>
                <span className="ic-live-arr">{c.arr}</span>
              </div>
              <div className="ic-live-meta">
                <span
                  className={`ic-live-seats ${
                    c.seats === 0 ? 'is-full' : c.seats <= 5 ? 'is-scarce' : ''
                  }`}
                >
                  {c.seats === 0 ? 'Esaurito' : `${c.seats} posti`}
                </span>
                {c.code && <span className="ic-live-code">{c.code}</span>}
              </div>
              {c.bookUrl && c.seats > 0 && (
                <a
                  href={c.bookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ic-live-book"
                >
                  Acquista ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="ic-live-note">Posti disponibili in tempo reale · fonte: vettore</p>
    </div>
  );
}
