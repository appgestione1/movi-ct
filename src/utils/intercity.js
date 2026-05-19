// ─────────────────────────────────────────────────────────────────────────
// Movì CT — Logica del modulo pullman extraurbani
// Ricerca tratte, calendario feriale/festivo/scolastico, deep-link biglietti.
// ─────────────────────────────────────────────────────────────────────────

import { CITIES, CARRIERS, CONNECTIONS, HUBS, FEEDBACK_EMAIL } from '../data/intercityNetwork';
import DOCS_MANIFEST from '../data/intercityDocs.json';

// ── Lookup di base ───────────────────────────────────────────────────────
const CITY_BY_ID    = Object.fromEntries(CITIES.map(c => [c.id, c]));
const CARRIER_BY_ID = Object.fromEntries(CARRIERS.map(c => [c.id, c]));

export const getCity    = id => CITY_BY_ID[id]    || null;
export const getCarrier = id => CARRIER_BY_ID[id] || null;
export const getHub     = id => HUBS[id]          || null;
export const cityName   = id => (CITY_BY_ID[id] ? CITY_BY_ID[id].name : id);

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove gli accenti combinanti
    .trim();
}

// ── Autocompletamento località ───────────────────────────────────────────
// Ordina: prima chi inizia con la query, poi chi la contiene.
export function searchCities(query, { excludeId = null, limit = 8 } = {}) {
  const q = normalize(query);
  const pool = CITIES.filter(c => c.id !== excludeId);
  if (!q) {
    // senza query mostra il capoluogo e le mete regionali più rilevanti
    return pool.slice(0, limit);
  }
  const scored = [];
  for (const city of pool) {
    const haystacks = [normalize(city.name), ...((city.aliases || []).map(normalize))];
    let score = -1;
    for (const h of haystacks) {
      if (h.startsWith(q)) { score = Math.max(score, 2); }
      else if (h.includes(q)) { score = Math.max(score, 1); }
    }
    if (score >= 0) scored.push({ city, score });
  }
  scored.sort((a, b) => b.score - a.score || a.city.name.localeCompare(b.city.name));
  return scored.slice(0, limit).map(s => s.city);
}

// ── Calendario: feriale / festivo / scolastico ───────────────────────────

// Domenica di Pasqua per un dato anno (algoritmo del Computus di Gauss).
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = aprile
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Festività civili italiane a data fissa (mese 0-based, giorno).
const FIXED_HOLIDAYS = [
  [0, 1],   // Capodanno
  [0, 6],   // Epifania
  [3, 25],  // Liberazione
  [4, 1],   // Festa dei lavoratori
  [5, 2],   // Festa della Repubblica
  [7, 15],  // Ferragosto
  [10, 1],  // Ognissanti
  [11, 8],  // Immacolata
  [11, 25], // Natale
  [11, 26], // Santo Stefano
];

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

// True se la data è festiva: domenica, festività fissa o Lunedì dell'Angelo.
export function isFestivo(date) {
  if (date.getDay() === 0) return true;
  const m = date.getMonth();
  const d = date.getDate();
  if (FIXED_HOLIDAYS.some(([fm, fd]) => fm === m && fd === d)) return true;
  const easter = easterSunday(date.getFullYear());
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);
  return sameDay(date, easterMonday);
}

// Periodo scolastico indicativo per la Sicilia: metà settembre – metà giugno.
export function isScholastic(date) {
  const m = date.getMonth();
  const d = date.getDate();
  if (m === 8) return d >= 15;   // settembre dal 15
  if (m === 5) return d <= 15;   // giugno fino al 15
  return m > 8 || m < 5;         // ott–dic e gen–mag
}

// 'festivo' | 'feriale' — tipo di giorno per il filtro orari.
export function dayType(date) {
  return isFestivo(date) ? 'festivo' : 'feriale';
}

// ── Ricerca tratte ───────────────────────────────────────────────────────

// Insieme ordinato di tutte le fermate toccate da una connection,
// da Catania verso la destinazione.
export function orderedStops(connection) {
  return [connection.endpoints[0], ...connection.via, connection.endpoints[1]];
}

// Tutte le connection che collegano `fromId` e `toId` (in qualunque verso),
// passando anche per le tappe intermedie.
export function findConnections(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return [];
  return CONNECTIONS.filter(conn => {
    const stops = orderedStops(conn);
    return stops.includes(fromId) && stops.includes(toId);
  });
}

// Tutte le connection che toccano un determinato hub di partenza/arrivo.
export function connectionsByHubMode(hubMode) {
  if (hubMode === 'aeroporto') {
    return CONNECTIONS.filter(conn => conn.endpoints.includes('aeroporto'));
  }
  return [];
}

// Hub di partenza per un dato lato origine di una connection.
function departureHubId(connection, originId) {
  if (originId === 'catania')   return 'ct-archimede';
  if (originId === 'aeroporto') return 'ct-airport';
  // Viaggio in direzione opposta (verso Catania): partenza da fermata locale.
  return null;
}

// Costruisce le card dei risultati: una per ogni coppia (tratta, vettore).
// `query` = { fromId, toId } per una ricerca città→città
//         | { hubMode: 'aeroporto' } per "tutte le linee dall'aeroporto".
export function buildResults(query) {
  let rows = [];

  if (query.hubMode) {
    const conns = connectionsByHubMode(query.hubMode);
    for (const conn of conns) {
      const originId = query.hubMode; // 'aeroporto'
      const destId = conn.endpoints.find(e => e !== originId);
      rows.push(makeResultRows(conn, originId, destId));
    }
  } else {
    const conns = findConnections(query.fromId, query.toId);
    for (const conn of conns) {
      rows.push(makeResultRows(conn, query.fromId, query.toId));
    }
  }

  // appiattisce (una connection genera N righe, una per vettore)
  return rows.flat();
}

function makeResultRows(connection, originId, destId) {
  const stops = orderedStops(connection);
  const iFrom = stops.indexOf(originId);
  const iTo = stops.indexOf(destId);
  const lo = Math.min(iFrom, iTo);
  const hi = Math.max(iFrom, iTo);
  const segment = stops.slice(lo, hi + 1);
  const viaCities = segment.slice(1, -1);
  const isDirect = viaCities.length === 0;

  return connection.carriers.map(carrierId => ({
    id: `${connection.id}-${carrierId}`,
    connection,
    carrier: getCarrier(carrierId),
    originId,
    destId,
    departureHubId: departureHubId(connection, originId),
    viaCities,
    isDirect,
    category: connection.category,
  }));
}

// ── Filtro orari (predisposto per orari ufficiali reali) ─────────────────
// Schema corsa: vedi data/intercityNetwork.js.
// Filtra le corse confrontando:
//  - direzione (schedule.from === fromId && schedule.to === toId)
//  - calendario del giorno (feriale/festivo/scolastico)
//  - orario successivo a quello di ricerca
// Quando per una tratta non ci sono ancora orari verificati, ritorna [].
export function getAvailableBuses(fromId, toId, searchDate) {
  const connections = findConnections(fromId, toId);
  const kind = dayType(searchDate);                  // 'feriale' | 'festivo'
  const scholastic = isScholastic(searchDate);
  const searchMinutes = searchDate.getHours() * 60 + searchDate.getMinutes();

  const trips = [];
  for (const conn of connections) {
    for (const sched of conn.schedules) {
      // 0. direzione esatta della corsa
      if (sched.from !== fromId || sched.to !== toId) continue;
      // 1. il giorno di ricerca deve corrispondere al calendario della corsa
      const runsToday = kind === 'festivo' ? sched.festivo : sched.feriale;
      if (!runsToday) continue;
      // 2. le corse solo-scolastiche valgono solo nel periodo scolastico
      if (sched.scolastico && !scholastic) continue;
      // 3. la partenza deve essere successiva all'orario di ricerca
      const [h, m] = sched.orario_partenza.split(':').map(Number);
      if (h * 60 + m < searchMinutes) continue;

      trips.push({
        connectionId: conn.id,
        carrier: getCarrier(sched.carrierId),
        orario_partenza: sched.orario_partenza,
        orario_arrivo: sched.orario_arrivo,
        note: sched.note || null,
      });
    }
  }

  // 4. ordine cronologico rigoroso per orario di partenza
  trips.sort((a, b) => a.orario_partenza.localeCompare(b.orario_partenza));
  return trips;
}

// Tutte le corse del giorno per una connection completa, senza filtro su
// from/to (utile in dettaglio per mostrare "tutte le corse di oggi").
export function getDailyTrips(connection, searchDate) {
  const kind = dayType(searchDate);
  const scholastic = isScholastic(searchDate);

  const trips = [];
  for (const sched of connection.schedules) {
    const runsToday = kind === 'festivo' ? sched.festivo : sched.feriale;
    if (!runsToday) continue;
    if (sched.scolastico && !scholastic) continue;
    trips.push({
      carrier: getCarrier(sched.carrierId),
      from: sched.from,
      to: sched.to,
      orario_partenza: sched.orario_partenza,
      orario_arrivo: sched.orario_arrivo,
      note: sched.note || null,
    });
  }
  trips.sort((a, b) => a.orario_partenza.localeCompare(b.orario_partenza));
  return trips;
}

// ── Deep-link biglietti / orari ──────────────────────────────────────────
// Genera il link di reindirizzamento della CTA in base al vettore.
//
// NOTA IMPORTANTE: i 5 vettori siciliani (SAIS, Interbus, Etna, AST, FCE)
// non espongono parametri URL pubblici documentati per pre-compilare i campi
// origine/destinazione/data nei loro motori di ricerca. SAIS e gruppo
// Interbus girano su front-end dinamici (Next.js / PHP con stato di sessione);
// AST e FCE non vendono biglietti online. Per non produrre link errati o
// fragili, Movì CT rimanda alla pagina ufficiale corretta SENZA inventare
// parametri. La query (from/to/date) è disponibile nel return per essere
// copiata nella clipboard dell'utente lato UI.
export function generateTicketLink(carrierId, fromId, toId, date) {
  const carrier = getCarrier(carrierId);
  const query = {
    from: cityName(fromId),
    to: cityName(toId),
    date: date instanceof Date ? date.toISOString().slice(0, 10) : null,
  };

  if (!carrier) {
    return {
      url: 'https://www.google.com/search?q=' +
        encodeURIComponent(`pullman ${query.from} ${query.to} orari`),
      label: 'Cerca orari online',
      type: 'search',
      query,
    };
  }

  switch (carrier.group) {
    case 'sais':
      // SAIS Autolinee / SAIS Trasporti: portale con biglietteria online.
      // Booking app su sottodominio dedicato (Next.js).
      return {
        url: carrier.id === 'sais'
          ? 'https://booking.saisautolinee.it/it/'
          : carrier.website,
        label: 'Apri portale ' + carrier.name,
        type: 'booking',
        query,
      };
    case 'interbus':
      // Gruppo Interbus / Etna Trasporti / Segesta: motore di ricerca interno.
      return {
        url: carrier.website,
        label: 'Apri motore di ricerca ' + carrier.name,
        type: 'booking',
        query,
      };
    case 'ast':
      // AST: nessun acquisto online diretto → quadri orari ufficiali.
      return {
        url: carrier.website,
        label: 'Quadri orari ufficiali AST',
        type: 'timetable',
        query,
      };
    case 'fce':
      // FCE: autolinee Circumetnea → pagina orari ufficiale.
      return {
        url: carrier.website,
        label: 'Orari autolinee FCE',
        type: 'timetable',
        query,
      };
    default:
      return {
        url: carrier.website,
        label: 'Sito ufficiale ' + carrier.name,
        type: 'website',
        query,
      };
  }
}

// Testo "Catania → Taormina · 20/05/2026" da copiare nella clipboard.
// L'utente lo incolla nei form dei vettori che non accettano deep-link.
export function clipboardText(fromId, toId, date) {
  const parts = [`${cityName(fromId)} → ${cityName(toId)}`];
  if (date instanceof Date) {
    const d = date;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    parts.push(`${dd}/${mm}/${d.getFullYear()}`);
  }
  return parts.join(' · ');
}

// Costruisce un mailto: per segnalare un errore su una tratta.
export function reportErrorMailto(carrierName, fromId, toId) {
  const subject = `[Movì CT] Segnalazione orari — ${cityName(fromId)} → ${cityName(toId)} (${carrierName})`;
  const body = `Tratta: ${cityName(fromId)} → ${cityName(toId)}\nVettore: ${carrierName}\n\nDescrivi cosa hai trovato di sbagliato o mancante:\n\n`;
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// URL Google Maps per un punto geografico (hub di partenza).
export function mapsUrl(lat, lng, label) {
  const q = label ? encodeURIComponent(label) : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}&center=${lat},${lng}`;
}

// ── Documenti ufficiali (PDF / brochure / pagine info) ──────────────────
// Restituisce i documenti del vettore pertinenti alla tratta corrente:
//  - doc generici del vettore (tratta === null)
//  - doc specifici di quella connection (tratta === connectionId)
// Ordinati per pertinenza (specifici prima) e poi per data più recente.
export function getDocsForCarrier(carrierId, connectionId = null) {
  if (!Array.isArray(DOCS_MANIFEST.docs)) return [];
  return DOCS_MANIFEST.docs
    .filter(d => d.carrierId === carrierId)
    .filter(d => d.tratta === null || d.tratta === connectionId)
    .sort((a, b) => {
      const aSpec = a.tratta ? 0 : 1;
      const bSpec = b.tratta ? 0 : 1;
      if (aSpec !== bSpec) return aSpec - bSpec;
      return (b.addedAt || '').localeCompare(a.addedAt || '');
    });
}

// URL pubblica per un documento ospitato in repo o esterna.
export function docUrl(doc) {
  if (doc.filename) return `/intercity-docs/${doc.filename}`;
  return doc.sourceUrl || null;
}

// Etichetta umana del tipo documento.
export const DOC_TYPE_LABELS = {
  orari:    '🕓 Orari',
  tariffe:  '💶 Tariffe',
  brochure: '📘 Brochure',
  avviso:   '⚠️ Avviso',
  info:     'ℹ️ Info',
};
