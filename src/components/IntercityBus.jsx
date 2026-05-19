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
              </li>
            ))}
          </ul>
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
        </div>
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
