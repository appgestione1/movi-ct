// ─────────────────────────────────────────────────────────────────────────
// Movì CT — Extractor PDF Regione Siciliana (Assessorato Infrastrutture)
// ─────────────────────────────────────────────────────────────────────────
// Fonte ufficiale: portale `pti.regione.sicilia.it`, sezione "Orari
// Autolinee Extraurbane". Pubblica i quadri orario di tutti i vettori
// siciliani in PDF.
//
// I PDF hanno layout NON omogeneo tra vettori: AST usa un formato
// ricostruibile (marker "Capolinea"/"Fermata intermedia" + nome città sulla
// riga successiva); SAIS Trasporti e Interbus hanno tabelle a doppia
// direzione che pdftotext-layout non separa in modo affidabile.
//
// Strategia v1 (deliberatamente conservativa):
//   - **AST**: estraiamo elenco fermate con km cumulativi (NO orari corsa).
//   - **SAIS / Interbus**: estraiamo solo header (codice linea + nome).
//
// Restituiamo `routes[]` (percorso/fermate/km) che alimenta la sezione
// "Fermate ufficiali della linea" nel dettaglio tratta. Non produciamo
// `schedules[]` automatici perché ricostruire le colonne orario dai PDF
// scansionati è troppo fragile per un MVP — gli orari restano nei PDF a cui
// l'app già linka.
// ─────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

// ── URL ufficiali ────────────────────────────────────────────────────────
const PORTAL_BASE = 'https://pti.regione.sicilia.it/portal/page/portal/PIR_PORTALE'
  + '/PIR_LaStrutturaRegionale/PIR_AssInfrastruttureMobilita'
  + '/PIR_InfrastruttureMobilitaTrasporti/PIR_Areetematiche/PIR_Altricontenuti'
  + '/PIR_Trasportipubblici/PIR_OrariAutolinee';

const REGIONE_PDF = {
  ast: {
    label: 'AST — Provincia di Catania',
    url: `${PORTAL_BASE}/PIR_AST/AST%20prov.%20di%20CT%20-%20ORARI.pdf`,
    filename: 'AST_prov_CT.pdf',
    parser: 'ast',
  },
  saist: {
    label: 'SAIS Trasporti',
    url: `${PORTAL_BASE}/PIR_SAISTRASPORTI/SAIS%20TRASPORTI%20ORARI.pdf`,
    filename: 'SAIS_TRASPORTI.pdf',
    parser: 'header-only',
  },
  interbus: {
    label: 'Interbus (gruppo Interbus/Etna/Segesta)',
    url: `${PORTAL_BASE}/PIR_INTERBUSSPA/ORARI%20INTERBUS.pdf`,
    filename: 'INTERBUS.pdf',
    parser: 'header-only',
  },
};

// ── Utility I/O ──────────────────────────────────────────────────────────
function log(...m) { console.log('[regione]', ...m); }
function warn(...m) { console.warn('[regione]', ...m); }

function sha1OfBuffer(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function downloadFromRegione(agencyId, { timeoutMs = 60_000 } = {}) {
  const spec = REGIONE_PDF[agencyId];
  if (!spec) throw new Error(`agency sconosciuta: ${agencyId}`);
  return fetchBuffer(spec.url, { timeoutMs });
}

function fetchBuffer(url, { timeoutMs = 60_000, maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    function go(u, left) {
      const req = https.get(u, {
        headers: {
          'User-Agent': 'Movi-CT-Importer/1.0 (+https://movi-ct.vercel.app)',
          'Accept': 'application/pdf,*/*',
        },
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (left <= 0) return reject(new Error('too many redirects'));
          return go(new URL(res.headers.location, u).href, left - 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} su ${u}`));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      });
      req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout ${timeoutMs}ms su ${u}`)));
      req.on('error', reject);
    }
    go(url, maxRedirects);
  });
}

function pdfToTextLayout(pdfPath) {
  const txtPath = pdfPath.replace(/\.pdf$/i, '.txt');
  execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, txtPath], { stdio: 'pipe' });
  return fs.readFileSync(txtPath, 'utf8');
}

// ── Header sniff (comune a tutti i vettori) ──────────────────────────────
// AST:      "Orario Autolinea Extraurbana : <ORI> - <DEST> con deviazione ... (cod. 595 foglio 1)"
// SAIS:     "Orario Autolinee Extraurbane: AGRIGENTO-CANICATTI'-CALTANISSETTA-AEROPORTO-CATANIA"
// Interbus: "Orario Autolinee Extraurbane" (intestazione globale, codice linea nella riga "Impresa:")
//
// La regex riconosce: "Autolinea/Autolinee Extraurbana/Extraurbane", due punti opzionali,
// label fino a fine riga o a "(cod. NNN ...)" oppure "(codice NNN)".
const ROUTE_HEADER_RE = /Orario\s+Autoline[ae]\s+Extraurban[ae]\s*[:.]?\s*([^\n(]+?)(?:\(\s*(?:cod\.?|codice)\s*([0-9A-Z]+)(?:\s+foglio\s+(\d+))?\s*\))?\s*$/gim;

// "Impresa: <label>" — usato dai PDF Interbus dove l'header "Orario Autolinee
// Extraurbane" è generico e il dettaglio linea è nella riga Impresa.
const IMPRESA_LABEL_RE = /^\s*Impresa:\s*(.+?)\s*(?:Codice\s+(\d+))?\s*$/im;

function splitRouteBlocks(text) {
  const matches = [];
  let m;
  ROUTE_HEADER_RE.lastIndex = 0;
  while ((m = ROUTE_HEADER_RE.exec(text)) !== null) {
    let label = (m[1] || '').trim();
    if (!label || label.length < 4) {
      // Header generico ("Orario Autolinee Extraurbane" senza label inline):
      // cerchiamo la riga "Impresa: ..." appena prima dell'header
      const lookback = text.slice(Math.max(0, m.index - 800), m.index);
      const im = lookback.match(IMPRESA_LABEL_RE);
      if (im && im[1] && im[1].length > 4) {
        label = im[1].trim();
        if (!m[2] && im[2]) m[2] = im[2];
      } else {
        continue;
      }
    }
    matches.push({
      index: m.index,
      header: m[0],
      label,
      code: m[2] ? m[2].trim() : null,
      sheet: m[3] ? parseInt(m[3], 10) : null,
    });
  }
  if (matches.length === 0) return [];
  const blocks = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    blocks.push({ ...matches[i], body: text.slice(start, end) });
  }
  return blocks;
}

function splitOriginDest(label) {
  // Trattino di vari tipi (-, –, —); per le label SAIS senza spazi "X-Y-Z"
  // accettiamo trattini secchi.
  const parts = label.split(/\s*[-–—]\s*/);
  if (parts.length < 2) return { origine: label, destinazione: null, intermedie: [] };
  return {
    origine: parts[0].trim(),
    destinazione: parts[parts.length - 1].trim(),
    intermedie: parts.slice(1, -1).map(s => s.trim()),
  };
}

// ── Parser AST (formato "Capolinea" / "Fermata intermedia") ──────────────
//
// Riga marker tipica:
//   "6.40   8.15   ...   0,0   Capolinea           10,0   7.45   9.50   ..."
// La riga seguente (a 1-3 righe di distanza) contiene il nome città:
//   "                                      Acireale (terminal corso Italia)"
//
// Strategia: passata sul body per identificare marker-rows e name-rows in
// ordine, poi associazione 1:1 per ordine di apparizione.

const AST_MARKER_RE = /\b(Capolinea|Fermata\s+intermedia)\b/i;
// Numero KM con virgola decimale: 0,0   10,3   17,7. Cattura il PRIMO che
// appare nella stessa riga (= colonna KM-A, lato andata).
// IMPORTANTE: nei PDF AST gli orari hanno il PUNTO ("6.40") mentre i km
// hanno la VIRGOLA ("17,7"). Distinguere è necessario per evitare di
// scambiare un orario per una distanza.
const KM_FIRST_RE = /(?:^|\s)(\d{1,3},\d{1,3})(?=\s)/;
// Riga "principalmente testuale" = niente orari, niente cifre dominanti,
// almeno 4 caratteri alfabetici consecutivi.
function isNameLine(line) {
  const trimmed = line.trim();
  if (trimmed.length < 4) return false;
  if (/\d{1,2}[.:]\d{2}/.test(trimmed)) return false;       // ha orari
  if (AST_MARKER_RE.test(trimmed)) return false;             // è marker
  if (/^(KM|CORSE|FERIALE|FESTIVO|STAZIONAMENTI)\b/i.test(trimmed)) return false;
  if (/^(Allegato|Assessorato|Servizio|Contratto|Impresa|Codice|Prescrizioni|Pre\s*scrizi|Esercizio|Dipartimento|Orario)/i.test(trimmed)) return false;
  // Header impresa: "Azienda Siciliana Trasporti - A.S.T. S.p.A."
  if (/\bS\.?p\.?A\.?\b|\bS\.?r\.?l\.?\b|\bA\.?S\.?T\.?\b/i.test(trimmed)) return false;
  if (/Azienda\s+Siciliana|Autotrasporto\s+Persone/i.test(trimmed)) return false;
  // "non scol. non scol" / "orario orario" / artefatti di colonna ripetuta
  const words = trimmed.split(/\s+/);
  if (words.length === 2 && words[0].toLowerCase() === words[1].toLowerCase()) return false;
  if (words.length === 3 && words[0].toLowerCase() === words[2].toLowerCase()) return false;
  // Solo numeri + parola breve: "64 Codice", "157", ecc.
  if (/^\d+\s+\w{1,8}$/.test(trimmed)) return false;
  if (/^\d+$/.test(trimmed)) return false;
  // Almeno 4 lettere consecutive, e non una lista di codici tipo "1A 2A 3A"
  if (!/[A-Za-zÀ-ÿ]{4,}/.test(trimmed)) return false;
  if (/^[A-Z0-9\s]+$/.test(trimmed) && !/\([a-zà-ÿ]/i.test(trimmed)) {
    // Stringa solo uppercase senza descrittori → potrebbe essere intestazione
    // (es "STAZIONAMENTI"). La accettiamo solo se contiene una parentesi
    // toponomastica oppure ha lunghezza > 8.
    if (trimmed.length < 8) return false;
  }
  return true;
}

function cleanStopName(s) {
  // Rimuove residui di colonne stampate male: numeri sparsi, sequenze "ca"
  // staccate, asterischi.
  return s
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\|\s*$/, '')
    .replace(/^\|\s*/, '')
    .trim();
}

// Conta gli orari validi in una riga (filtrando KM e valori fuori range).
function countTimesInLine(line) {
  const TIME_RE = /\b(\d{1,2})[.:](\d{2})\b/g;
  let n = 0;
  let m;
  while ((m = TIME_RE.exec(line)) !== null) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h <= 23 && min <= 59) n++;
  }
  return n;
}

// Estrae gli orari su UNA SOLA riga (la migliore nel range ±1 dal marker).
// Separa A (sx del centro tabella) da R (dx) per posizione X del marker.
function extractTimesNearMarker(lines, markerIdx, otherMarkerLineIdxs) {
  const markerLine = lines[markerIdx];
  const markerMatch = markerLine.match(/\b(Capolinea|Fermata\s+intermedia)\b/i);
  let centerPos;
  if (markerMatch) {
    centerPos = markerLine.indexOf(markerMatch[0]);
  } else {
    const km = markerLine.match(/\d{1,3},\d{1,3}/);
    centerPos = km ? markerLine.indexOf(km[0]) : Math.floor(markerLine.length / 2);
  }

  // Sceglie la riga con più orari tra { markerIdx-1, markerIdx, markerIdx+1 }
  // escludendo altre righe-marker.
  const otherSet = new Set((otherMarkerLineIdxs || []).filter(i => i !== markerIdx));
  const candidates = [markerIdx, markerIdx - 1, markerIdx + 1];
  let best = { idx: markerIdx, count: -1 };
  for (const ci of candidates) {
    if (ci < 0 || ci >= lines.length) continue;
    if (otherSet.has(ci)) continue;
    const c = countTimesInLine(lines[ci]);
    // Preferisci la riga del marker a parità; poi precedente; poi successiva
    const priority = ci === markerIdx ? 2 : (ci === markerIdx - 1 ? 1 : 0);
    if (c > best.count || (c === best.count && priority > (best.priority || 0))) {
      best = { idx: ci, count: c, priority };
    }
  }
  if (best.count < 1) return { timesA: [], timesR: [] };

  const sourceLine = lines[best.idx];
  // Se il centerPos è stato preso da una riga diversa, riproietta basandoci
  // sulla posizione del marker stesso (resta la X più affidabile del centro).
  const TIME_RE = /\b(\d{1,2})[.:](\d{2})\b/g;
  const timesA = [];
  const timesR = [];
  let m;
  while ((m = TIME_RE.exec(sourceLine)) !== null) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h > 23 || min > 59) continue;
    const norm = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    if (m.index < centerPos) timesA.push(norm);
    else timesR.push(norm);
  }
  return { timesA, timesR };
}

function parseAstBlock(block) {
  const lines = block.body.split(/\r?\n/);
  const markerRows = [];
  const nameRows = [];

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (AST_MARKER_RE.test(ln)) {
      const kmMatch = ln.match(KM_FIRST_RE);
      const kmA = kmMatch ? parseFloat(kmMatch[1].replace(',', '.')) : null;
      const kind = /capolinea/i.test(ln) ? 'capolinea' : 'fermata';
      markerRows.push({ lineIdx: i, kmA, kind, rawLine: ln });
    } else if (isNameLine(ln)) {
      nameRows.push({ lineIdx: i, name: cleanStopName(ln) });
    }
  }

  if (markerRows.length === 0) return { stops: [], trips: [] };

  // ── Associazione fermate ↔ nomi (come prima) ──
  let nameCursor = 0;
  const stops = [];
  for (const mark of markerRows) {
    while (nameCursor < nameRows.length && nameRows[nameCursor].lineIdx < mark.lineIdx - 1) {
      nameCursor++;
    }
    const candidate = nameRows[nameCursor];
    if (candidate) {
      stops.push({
        km: mark.kmA,
        kind: mark.kind,
        name: candidate.name,
        rawLine: mark.rawLine,
      });
      nameCursor++;
    } else {
      stops.push({ km: mark.kmA, kind: mark.kind, name: null, rawLine: mark.rawLine });
    }
  }

  // Dedup
  const dedupStops = [];
  for (const s of stops) {
    if (!s.name) continue;
    const prev = dedupStops[dedupStops.length - 1];
    if (prev && prev.name === s.name && prev.km === s.km) continue;
    dedupStops.push(s);
  }

  // ── Estrazione orari corsa per corsa ──
  // I capolinea (kind='capolinea') hanno gli orari di partenza/arrivo.
  // Per ogni capolinea estraiamo l'array di orari A (sx del marker) e R (dx).
  // Le corse A vanno da capolinea[0] verso capolinea[ultimo].
  // Le corse R vanno da capolinea[ultimo] verso capolinea[0].
  const caps = markerRows.filter(r => r.kind === 'capolinea');
  // Costruisci la mappa rawLine → lineIdx (manteniamo solo righe utili)
  const otherMarkerIdxs = markerRows.map(r => r.lineIdx);
  const trips = [];

  // Mappa marker → nome città (riusiamo l'associazione già fatta sopra)
  const nameByMarkerIdx = new Map();
  // Ricostruzione: passo lineare sopra markerRows + nameRows
  {
    let nc = 0;
    for (const mark of markerRows) {
      while (nc < nameRows.length && nameRows[nc].lineIdx < mark.lineIdx - 1) nc++;
      if (nameRows[nc]) {
        nameByMarkerIdx.set(mark.lineIdx, nameRows[nc].name);
        nc++;
      }
    }
  }

  if (caps.length >= 2) {
    const origMark = caps[0];
    const destMark = caps[caps.length - 1];
    const origName = nameByMarkerIdx.get(origMark.lineIdx) || null;
    const destName = nameByMarkerIdx.get(destMark.lineIdx) || null;
    const origTimes = extractTimesNearMarker(lines, origMark.lineIdx, otherMarkerIdxs);
    const destTimes = extractTimesNearMarker(lines, destMark.lineIdx, otherMarkerIdxs);

    const lenA = Math.min(origTimes.timesA.length, destTimes.timesA.length);
    for (let i = 0; i < lenA; i++) {
      trips.push({
        direction: 'A',
        fromName: origName,
        toName: destName,
        partenza: origTimes.timesA[i],
        arrivo: destTimes.timesA[i],
      });
    }
    const lenR = Math.min(destTimes.timesR.length, origTimes.timesR.length);
    for (let i = 0; i < lenR; i++) {
      trips.push({
        direction: 'R',
        fromName: destName,
        toName: origName,
        partenza: destTimes.timesR[i],
        arrivo: origTimes.timesR[i],
      });
    }
  }

  return { stops: dedupStops, trips };
}

// ── Parser header-only (SAIS / Interbus) ─────────────────────────────────
// Per i PDF SAIS/Interbus estraiamo solo l'header. Le fermate restano nel
// PDF (a cui linkiamo da app). Tentiamo anche di pescare il "Codice NNN" che
// in SAIS/Interbus appare nella riga "Impresa: ... Codice NNN" o "157" a
// fianco della label.
function parseGenericBlock(block) {
  // Per i blocchi senza fermate ricostruibili, non torniamo nulla qui.
  // L'header (codice/label) è già in `block`.
  return null;
}

// ── Mapping fermate → cityId ─────────────────────────────────────────────

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    // rimuove i diacritici (range U+0300–U+036F)
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Rimuove specifiche di fermata dal nome ("via X", "piazza Y", ecc.)
const STOP_NOISE_RE = /\b(via|viale|piazza|p\.zza|p\.za|pza|stazione|capolinea|bivio|incrocio|fs|fermata|bus|piazzale|p\.le|terminal|km|sn|cda|contrada|loc|localita|frazione|corso|c\.so|largo|l\.go|str|strada|s\.s\.|ss)\b/g;

function stripStopPrefix(name) {
  return normalize(name)
    .replace(STOP_NOISE_RE, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapStopToCity(stopName, CITIES) {
  if (!stopName) return null;
  const raw = normalize(stopName);
  const cleaned = stripStopPrefix(stopName);
  if (!cleaned) return null;

  if (/\baeroporto\b/.test(raw) || /\bfontanarossa\b/.test(raw)) return 'aeroporto';

  // 1) Match esatto su nome/aliases
  for (const c of CITIES) {
    const cands = [c.name, ...(c.aliases || [])].map(normalize);
    for (const cand of cands) {
      if (cand === cleaned || cand === raw) return c.id;
    }
  }
  // 2) Stripped "starts with city"
  for (const c of CITIES) {
    const cands = [c.name, ...(c.aliases || [])].map(normalize);
    for (const cand of cands) {
      if (cand.length < 4) continue;
      if (cleaned.startsWith(cand) || raw.startsWith(cand)) return c.id;
    }
  }
  // 3) Contains
  for (const c of CITIES) {
    const cands = [c.name, ...(c.aliases || [])].map(normalize);
    for (const cand of cands) {
      if (cand.length < 5) continue;
      if (cleaned.includes(cand)) return c.id;
    }
  }
  return null;
}

// ── Tariffe (scan tabella in coda al PDF) ────────────────────────────────
function extractFareTable(fullText) {
  const lines = fullText.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const m = line.match(/(?:fino\s+a|oltre)\s+(\d{1,3})\s*km[^€]*€\s*(\d+[.,]\d{1,2})/i);
    if (m) out.push({ kmMax: parseInt(m[1], 10), euro: parseFloat(m[2].replace(',', '.')) });
  }
  return out.length > 0 ? out : null;
}

// ── API ──────────────────────────────────────────────────────────────────
function parsePdf(pdfPath, { agencyId, CITIES }) {
  const text = pdfToTextLayout(pdfPath);
  const blocks = splitRouteBlocks(text);
  const spec = REGIONE_PDF[agencyId];
  const parserKind = spec ? spec.parser : 'header-only';

  const routes = [];
  const unmappedStops = new Set();
  const warnings = [];

  // Consolida i fogli multipli della stessa linea per codice
  const routesByCode = new Map();

  for (const blk of blocks) {
    const { origine, destinazione, intermedie } = splitOriginDest(blk.label);

    let parsedBlock;
    if (parserKind === 'ast') {
      parsedBlock = parseAstBlock(blk);
    } else {
      parsedBlock = { stops: [], trips: [] };
    }
    const stops = parsedBlock.stops;
    const trips = parsedBlock.trips;

    const stopsMapped = (stops || []).map(s => ({
      ...s,
      cityId: mapStopToCity(s.name, CITIES),
    }));
    for (const s of stopsMapped) {
      if (s.name && !s.cityId) unmappedStops.add(s.name);
    }

    // Mappa il nome fermata cite originale → cityId, per gli orari corsa
    const tripsMapped = (trips || []).map(t => ({
      ...t,
      fromCityId: mapStopToCity(t.fromName, CITIES),
      toCityId: mapStopToCity(t.toName, CITIES),
    }));

    // Note operative del blocco (festivo soppresso, divieti, ecc.)
    const blockNotes = [];
    const upper = blk.body.toUpperCase();
    if (/SERVIZIO\s+FESTIVO\s+SOPPRESSO/.test(upper)) blockNotes.push('festivo soppresso');
    if (/SERVIZIO\s+FESTIVO\s+RIDOTTO/.test(upper)) blockNotes.push('festivo ridotto');
    if (/DIVIETO\s+DI\s+CARICO/.test(upper)) blockNotes.push('divieti di carico - vedi PDF');
    if (/SOLO\s+SCOLASTICO|PERIODO\s+SCOLASTICO/.test(upper)) blockNotes.push('alcune corse solo periodo scolastico');

    const route = {
      agencyId,
      code: blk.code,
      sheet: blk.sheet,
      label: blk.label,
      origine,
      destinazione,
      intermedie,
      stops: stopsMapped,
      trips: tripsMapped,
      blockNotes,
    };

    // Merge fogli (foglio 1 + foglio 2 della stessa linea)
    const key = route.code || route.label;
    if (routesByCode.has(key)) {
      const existing = routesByCode.get(key);
      // Foglio successivo: union delle fermate (per name+km)
      const known = new Set(existing.stops.map(s => `${s.name}|${s.km}`));
      for (const s of stopsMapped) {
        if (s.name && !known.has(`${s.name}|${s.km}`)) {
          existing.stops.push(s);
        }
      }
      // Union dei trips (per partenza+arrivo+direction)
      const knownT = new Set(existing.trips.map(t =>
        `${t.direction}|${t.partenza}|${t.arrivo}`));
      for (const t of tripsMapped) {
        if (!knownT.has(`${t.direction}|${t.partenza}|${t.arrivo}`)) {
          existing.trips.push(t);
        }
      }
      // Union dei blockNotes
      for (const n of blockNotes) {
        if (!existing.blockNotes.includes(n)) existing.blockNotes.push(n);
      }
    } else {
      routesByCode.set(key, route);
    }
  }

  // Filtro finale: solo route che hanno almeno 2 fermate utili (per i
  // parser header-only resta vuoto, e va bene così)
  for (const route of routesByCode.values()) {
    if (parserKind === 'ast' && (!route.stops || route.stops.length < 2)) {
      warnings.push(`cod.${route.code || '?'} "${route.label}": <2 fermate utili, route scartata`);
      continue;
    }
    routes.push(route);
  }

  const fareTable = extractFareTable(text);

  return { routes, unmappedStops: [...unmappedStops], warnings, fareTable, parserKind, raw: text };
}

// Trova le connection Movì CT compatibili con una route Regione.
// Heuristic A (con fermate parsate): almeno 2 cityId in comune.
// Heuristic B (parser header-only, no fermate): la label menziona AMBO
// origine e destinazione della connection (matching su nome città).
function routeMatchesConnection(route, conn, orderedStopsFn, CITIES) {
  if (route.stops && route.stops.length >= 2) {
    const connCities = new Set(orderedStopsFn(conn));
    const routeCities = new Set(route.stops.map(s => s.cityId).filter(Boolean));
    let overlap = 0;
    for (const c of connCities) if (routeCities.has(c)) overlap++;
    return overlap >= 2;
  }
  // Heuristic B: header-only — confronta la label con i nomi città
  const labelNorm = normalize(route.label || '');
  if (!labelNorm) return false;
  const cityIds = orderedStopsFn(conn);
  const cityNames = cityIds.map(id => {
    const c = (CITIES || []).find(x => x.id === id);
    if (!c) return null;
    return [c.name, ...(c.aliases || [])].map(normalize);
  }).filter(Boolean);
  // La label deve menzionare almeno gli endpoints (primo e ultimo cityId)
  const matchesCity = candArr => candArr.some(n => n.length >= 4 && labelNorm.includes(n));
  if (cityNames.length < 2) return false;
  return matchesCity(cityNames[0]) && matchesCity(cityNames[cityNames.length - 1]);
}

// Costruisce la mappa connectionId → { meta, routes } a partire dalle
// route parsate. NON produce schedules (vedi commento testa file).
function buildScheduleMap(parsed, { CONNECTIONS, orderedStopsFn, carrierId, sourceMeta, CITIES }) {
  const result = {};

  // Filtra solo connection che hanno il vettore corrente tra i loro carriers.
  // Evita che un'extractor AST alimenti per errore una connection FCE solo
  // perché le città coincidono.
  const eligibleConns = CONNECTIONS.filter(c =>
    Array.isArray(c.carriers) && c.carriers.includes(carrierId));

  for (const route of parsed.routes) {
    const matches = eligibleConns.filter(c => routeMatchesConnection(route, c, orderedStopsFn, CITIES));
    if (matches.length === 0) continue;

    const hasStops = route.stops && route.stops.length >= 2;
    const hasTrips = route.trips && route.trips.length >= 1;

    for (const conn of matches) {
      if (!result[conn.id]) {
        result[conn.id] = { meta: { ...sourceMeta }, routes: [], schedules: [] };
      }
      const routeEntry = {
        code: route.code,
        label: route.label,
        origine: route.origine,
        destinazione: route.destinazione,
        kmTotali: hasStops
          ? Math.abs(route.stops[route.stops.length - 1].km - route.stops[0].km)
          : null,
        fermate: hasStops
          ? route.stops.map(s => ({ name: s.name, km: s.km, cityId: s.cityId }))
          : [],
      };
      result[conn.id].routes.push(routeEntry);

      // ── schedules[] dai trips ────────────────────────────────────────
      // Genera una entry schedule per ogni corsa estratta, solo se entrambi
      // gli endpoint sono mappati a cityId Movì CT e coincidono con i
      // capilinea della connection (o appartengono al suo ordinato).
      if (hasTrips) {
        const connStops = orderedStopsFn(conn);
        const noteSuffix = (route.blockNotes || []).length > 0
          ? ` (${route.blockNotes.join('; ')})`
          : '';
        for (const t of route.trips) {
          if (!t.fromCityId || !t.toCityId) continue;
          if (!connStops.includes(t.fromCityId)) continue;
          if (!connStops.includes(t.toCityId)) continue;
          if (!t.partenza) continue;
          result[conn.id].schedules.push({
            carrierId,
            from: t.fromCityId,
            to: t.toCityId,
            orario_partenza: t.partenza,
            orario_arrivo: t.arrivo || null,
            feriale: true,    // AST: default feriale; festivo annotato in note
            festivo: false,
            scolastico: false,
            note: `Linea ${route.code || '?'}${noteSuffix}`,
          });
        }
      }
    }
  }

  // De-duplica schedules identiche (capita con linee multi-foglio)
  for (const k of Object.keys(result)) {
    const seen = new Set();
    result[k].schedules = result[k].schedules.filter(s => {
      const key = [s.carrierId, s.from, s.to, s.orario_partenza, s.orario_arrivo].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    result[k].schedules.sort((a, b) =>
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to) ||
      a.orario_partenza.localeCompare(b.orario_partenza));
  }

  return result;
}

module.exports = {
  REGIONE_PDF,
  PORTAL_BASE,
  downloadFromRegione,
  fetchBuffer,
  pdfToTextLayout,
  sha1OfBuffer,
  parsePdf,
  buildScheduleMap,
  mapStopToCity,
  splitRouteBlocks,
  parseAstBlock,
  routeMatchesConnection,
};
