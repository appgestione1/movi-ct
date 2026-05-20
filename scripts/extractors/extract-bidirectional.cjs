#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Movì CT — Estrattore orari da PDF Regione Siciliana (formato SAIS/Interbus)
// ─────────────────────────────────────────────────────────────────────────
// Legge i file .txt generati da pdftotext -layout e, per ogni route block,
// cerca righe contenenti nomi di città noti e ne estrae gli orari di
// partenza/arrivo dal lato sinistro (direzione A) e destro (direzione B).
//
// Uso:
//   node scripts/extractors/extract-bidirectional.cjs saist
//   node scripts/extractors/extract-bidirectional.cjs interbus
//   node scripts/extractors/extract-bidirectional.cjs ast
// ─────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '../..');
const MANUAL_DIR = path.join(ROOT, 'data', 'manual');

const AGENCY = process.argv[2] || 'interbus';
const FILTER_CITY = process.argv[3]; // opzionale: filtra per cityId

const TXT_MAP = {
  ast:      path.join(MANUAL_DIR, 'ast',      'AST_prov_CT.txt'),
  saist:    path.join(MANUAL_DIR, 'saist',    'SAIS_TRASPORTI.txt'),
  interbus: path.join(MANUAL_DIR, 'interbus', 'INTERBUS.txt'),
};

const txtPath = TXT_MAP[AGENCY];
if (!txtPath || !fs.existsSync(txtPath)) {
  console.error(`File non trovato: ${txtPath}`);
  process.exit(1);
}

// Regex orari: HH.MM o HH:MM (non km che hanno virgola)
const TIME_RE = /\b(\d{1,2})[.:](\d{2})\b/g;

function extractTimes(str) {
  const results = [];
  let m;
  TIME_RE.lastIndex = 0;
  while ((m = TIME_RE.exec(str)) !== null) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h > 23 || min > 59) continue;
    results.push({
      t: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
      pos: m.index,
    });
  }
  return results;
}

// Normalizza stringa per confronto
function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Città rilevanti per Catania (subset da intercityNetwork.js)
const KNOWN_CITIES = [
  { id: 'catania',         names: ['catania', 'via d amico', 'piazza giovanni xxiii', 'terminal bus'] },
  { id: 'aeroporto',       names: ['aeroporto', 'fontanarossa', 'apt catania', 'fontanarossa'] },
  { id: 'siracusa',        names: ['siracusa'] },
  { id: 'noto',            names: ['noto'] },
  { id: 'ragusa',          names: ['ragusa'] },
  { id: 'agrigento',       names: ['agrigento'] },
  { id: 'caltanissetta',   names: ['caltanissetta'] },
  { id: 'enna',            names: ['enna'] },
  { id: 'palermo',         names: ['palermo'] },
  { id: 'messina',         names: ['messina'] },
  { id: 'taormina',        names: ['taormina'] },
  { id: 'giardini-naxos',  names: ['giardini'] },
  { id: 'francavilla',     names: ['francavilla'] },
  { id: 'nicosia',         names: ['nicosia'] },
  { id: 'troina',          names: ['troina'] },
  { id: 'leonforte',       names: ['leonforte'] },
  { id: 'acireale',        names: ['acireale'] },
  { id: 'belpasso',        names: ['belpasso'] },
  { id: 'nicolosi',        names: ['nicolosi'] },
  { id: 'paterno',         names: ['paterno', 'patern'] },
  { id: 'caltagirone',     names: ['caltagirone'] },
  { id: 'scordia',         names: ['scordia'] },
  { id: 'palagonia',       names: ['palagonia'] },
  { id: 'ramacca',         names: ['ramacca'] },
];

function matchCity(lineSegment) {
  const n = norm(lineSegment);
  for (const city of KNOWN_CITIES) {
    for (const cand of city.names) {
      if (n.includes(cand)) return city.id;
    }
  }
  return null;
}

// Divide il testo nei blocchi "Orario Autolinee"
const BLOCK_HEADER_RE = /(?:Orario Autoline[ae] Extraurban[ae]|Impresa:)/gim;

function splitBlocks(text) {
  const matches = [];
  let m;
  BLOCK_HEADER_RE.lastIndex = 0;
  while ((m = BLOCK_HEADER_RE.exec(text)) !== null) {
    matches.push(m.index);
  }
  const blocks = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i];
    const end = i + 1 < matches.length ? matches[i + 1] : text.length;
    blocks.push(text.slice(start, end));
  }
  return blocks;
}

// Analizza un blocco route e restituisce le city rows trovate
function analyzeBlock(blockText) {
  const lines = blockText.split(/\r?\n/);

  // Trova la posizione del header STAZIONAMENTI nella riga
  let centerPos = -1;
  for (const line of lines) {
    const idx = line.indexOf('STAZIONAMENTI');
    if (idx >= 0) {
      centerPos = idx + Math.floor('STAZIONAMENTI'.length / 2);
      break;
    }
  }

  const cityRows = [];

  for (const line of lines) {
    // Salta righe vuote o troppo brevi
    if (line.trim().length < 4) continue;
    // Salta righe che sono solo header (niente cifre OR testo puro header)
    if (/^\s*(Orario Autoline|Impresa:|Contratto|Servizio|Assessorato|Allegato|Prescrizioni|CORSE)/i.test(line)) continue;

    // Cerca nomi città nella riga
    const windowStart = centerPos > 0 ? Math.max(0, centerPos - 80) : 0;
    const windowEnd = centerPos > 0 ? Math.min(line.length, centerPos + 120) : line.length;
    const centerWindow = line.slice(windowStart, windowEnd);

    let foundCityId = null;
    let cityWindowPos = -1;

    for (const city of KNOWN_CITIES) {
      for (const cand of city.names) {
        if (cand.length < 4) continue;
        const normWin = norm(centerWindow);
        const normCand = norm(cand);
        const idx = normWin.indexOf(normCand);
        if (idx >= 0) {
          foundCityId = city.id;
          // Posizione nella riga originale (approssimata)
          cityWindowPos = windowStart + idx;
          break;
        }
      }
      if (foundCityId) break;
    }

    if (!foundCityId) continue;

    // Estrai orari dal lato sinistro e destro rispetto al punto città
    const splitPos = cityWindowPos > 0 ? cityWindowPos : Math.floor(line.length / 2);
    const leftPart = line.slice(0, splitPos);
    const rightPart = line.slice(splitPos + (centerWindow.length > 0 ? Math.min(80, centerWindow.length) : 40));

    const leftTimes = extractTimes(leftPart).map(t => t.t);
    const rightTimes = extractTimes(rightPart).map(t => t.t);

    // Cerca km=0,0 per identificare capolinea
    const hasKm0Left  = /\b0,0\b/.test(leftPart.slice(-30));
    const hasKm0Right = /\b0,0\b/.test(rightPart.slice(0, 30));

    if (leftTimes.length > 0 || rightTimes.length > 0) {
      cityRows.push({ cityId: foundCityId, leftTimes, rightTimes, hasKm0Left, hasKm0Right, line: line.trim().slice(0, 120) });
    }
  }

  return cityRows;
}

// Main
const text = fs.readFileSync(txtPath, 'utf8');
const blocks = splitBlocks(text);

console.log(`\n[extract] ${AGENCY} — ${blocks.length} blocchi trovati\n`);

const output = {};

for (const block of blocks) {
  const firstLine = block.slice(0, 200).replace(/\s+/g, ' ').trim();

  // Filtra solo blocchi con "CATANIA" o la città target
  const targetFilter = FILTER_CITY || 'catania';
  if (!norm(block).includes(norm(targetFilter))) continue;

  const cityRows = analyzeBlock(block);
  if (cityRows.length === 0) continue;

  console.log(`\n── BLOCCO: ${firstLine.slice(0, 100)}`);
  for (const row of cityRows) {
    console.log(`  city=${row.cityId}  left=[${row.leftTimes.join(', ')}]  right=[${row.rightTimes.join(', ')}]  km0L=${row.hasKm0Left} km0R=${row.hasKm0Right}`);
    console.log(`    (riga: ${row.line})`);
  }
}
