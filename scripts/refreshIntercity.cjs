#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Movì CT — Refresh degli orari pullman extraurbani
// ─────────────────────────────────────────────────────────────────────────
// Scarica i PDF degli orari ufficiali dei vettori, estrae il testo, rileva
// il periodo di validità e salva in `src/data/intercitySchedules.json`.
//
// Fonti:
//   - FCE: PDF "Orario Autolinee" su circumetnea.it (WordPress Download Mgr)
//   - AST / SAIS Trasporti / Interbus: portale ufficiale Regione Siciliana
//     `pti.regione.sicilia.it` (sezione Orari Autolinee Extraurbane)
//
// Uso:
//   npm run refresh-intercity                       # refresh totale
//   npm run refresh-intercity -- --only ast         # solo AST
//   npm run refresh-intercity -- --dry-run          # non scrive il JSON
//   npm run refresh-intercity -- --input <pdf>      # parsa un PDF locale (debug)
//   npm run refresh-intercity -- --force            # ignora hash, riprocessa
//
// Dipendenza esterna: `pdftotext` (Poppler). Su Ubuntu/Debian:
//   sudo apt-get install -y poppler-utils
// Su Windows è incluso in Git for Windows (mingw64/bin/pdftotext).
// ─────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const RS = require('./extractors/regione-sicilia.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'intercitySchedules.json');
const IMPORT_LOG_FILE = path.join(ROOT, 'data', 'import-log.json');
const MANUAL_DIR = path.join(ROOT, 'data', 'manual');
const TMP_DIR = path.join(os.tmpdir(), 'movict-refresh');

// ── CLI args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const ARG_ONLY = pickArg('--only');
const ARG_INPUT = pickArg('--input');
const ARG_AGENCY = pickArg('--agency');   // usato con --input
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

function pickArg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

// ── Utility ──────────────────────────────────────────────────────────────
function log(...m) { console.log('[refresh]', ...m); }
function warn(...m) { console.warn('[refresh]', ...m); }

function todayISO() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// GET HTTPS generico (per le fonti non-Regione).
function fetchBuffer(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    function go(u, left) {
      https.get(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MoviCT-Refresh/1.0; +https://github.com/appgestione1/movi-ct)',
          'Accept': 'text/html,application/xhtml+xml,application/pdf,*/*',
        },
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (left <= 0) return reject(new Error('too many redirects'));
          return go(new URL(res.headers.location, u).href, left - 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} su ${u}`));
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    }
    go(url, maxRedirects);
  });
}

function pdfToText(pdfPath) {
  const txtPath = pdfPath.replace(/\.pdf$/i, '.txt');
  execFileSync('pdftotext', ['-layout', pdfPath, txtPath], { stdio: 'pipe' });
  return fs.readFileSync(txtPath, 'utf8');
}

// Estrae una data italiana ("30 marzo 2026") da una stringa.
const MESI_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
                 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
function parseItalianDate(str) {
  if (!str) return null;
  const re = /(\d{1,2})\s+([a-zà]+)\s+(\d{4})/i;
  const m = str.toLowerCase().match(re);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthIdx = MESI_IT.indexOf(m[2]);
  if (monthIdx < 0) return null;
  const year = parseInt(m[3], 10);
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ── Import log ───────────────────────────────────────────────────────────
// Tiene traccia di hash e timestamp dei PDF già scaricati per evitare di
// riprocessare file immutati (skip parsing). Versionato nel repo per dare
// visibilità nei diff di GitHub Action.
function loadImportLog() {
  if (!fs.existsSync(IMPORT_LOG_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(IMPORT_LOG_FILE, 'utf8')); }
  catch { return {}; }
}

function saveImportLog(logObj) {
  ensureDir(path.dirname(IMPORT_LOG_FILE));
  fs.writeFileSync(IMPORT_LOG_FILE, JSON.stringify(logObj, null, 2) + '\n', 'utf8');
}

// ── Helper: carica il dataset Movì CT da src/data/intercityNetwork.js ───
// Lo script è CommonJS, il modulo dati è ESM: importazione dinamica via
// file:// URL (Node ≥14).
async function loadNetwork() {
  const url = pathToFileURL(path.join(ROOT, 'src', 'data', 'intercityNetwork.js')).href;
  const mod = await import(url);
  return {
    CITIES: mod.CITIES,
    CARRIERS: mod.CARRIERS,
    CONNECTIONS: mod.CONNECTIONS,
    HUBS: mod.HUBS,
  };
}

function orderedStops(conn) {
  return [conn.endpoints[0], ...(conn.via || []), conn.endpoints[1]];
}

// ── Extractor: FCE Autolinee (Circumetnea) ───────────────────────────────
async function refreshFCE() {
  log('FCE: scarico PDF orari autolinee…');

  // La pagina /le-nostre-linee/ contiene i link "download" con parametri
  // wpdmdl/refresh: fetchando quelli si ottiene il PDF binario.
  const landing = 'https://www.circumetnea.it/le-nostre-linee/';
  const landingHtml = (await fetchBuffer(landing)).toString('utf8');
  const candidates = [...landingHtml.matchAll(
    /https:\/\/www\.circumetnea\.it\/download\/orario-autolinee[^"' ]*?wpdmdl=\d+[^"' ]*/g
  )].map(m => m[0]);
  if (candidates.length === 0) {
    throw new Error('FCE: nessun link wpdmdl per "orario-autolinee" trovato in /le-nostre-linee/');
  }
  const pdfUrl = candidates.find(u => /filename=[^&]*\.pdf/i.test(u)) || candidates[0];

  ensureDir(TMP_DIR);
  const pdfPath = path.join(TMP_DIR, 'fce-autolinee.pdf');
  const buf = await fetchBuffer(pdfUrl);
  fs.writeFileSync(pdfPath, buf);
  log(`FCE: PDF salvato (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);

  const text = pdfToText(pdfPath);

  const titleMatch = text.match(/AGGIORNATO\s+IL\s+(\d{1,2}\s+[A-ZÀ]+\s+\d{4})/i);
  const validFrom = titleMatch ? parseItalianDate(titleMatch[1]) : null;

  const seasonMatch = text.match(/ORARIO\s+(INVERNALE|ESTIVO)\s+(\d{4})\s*[-–]\s*(\d{4})/i);
  const season = seasonMatch
    ? `${seasonMatch[1].toLowerCase()} ${seasonMatch[2]}-${seasonMatch[3]}`
    : null;

  log(`FCE: validità rilevata = ${validFrom || '(nessuna)'} · stagione = ${season || '(n/d)'}`);

  const stableSourceUrl = pdfUrl.split('?')[0];

  const meta = {
    source: `FCE — Autolinee Circumetnea (${season || 'orario in vigore'})`,
    sourceUrl: stableSourceUrl,
    lastUpdatedAt: todayISO(),
    validFrom,
    validTo: null,
  };

  // TODO parsing per-corsa del PDF FCE (matrice multi-colonna con codici C/S/K).
  // Per ora solo meta fresca; gli schedules curati a mano vengono preservati
  // dal merge nel writer.
  const empty = [];
  return {
    'c-fce-randazzo':     { meta, schedules: empty },
    'c-fce-linguaglossa': { meta, schedules: empty },
    'c-fce-nicolosi':     { meta, schedules: empty },
  };
}

// ── Extractor: vettori dal portale Regione Sicilia ───────────────────────
// AST / SAIS Trasporti / Interbus pubblicano gli orari ufficiali su
// `pti.regione.sicilia.it`. Stessa pipeline per tutti: download PDF + hash
// check + parser comune.
async function refreshRegione(agencyId, carrierId, network, importLog) {
  const spec = RS.REGIONE_PDF[agencyId];
  if (!spec) throw new Error(`vettore Regione sconosciuto: ${agencyId}`);
  log(`${agencyId.toUpperCase()}: pipeline Regione Sicilia — ${spec.label}`);

  ensureDir(TMP_DIR);
  const tmpPdf = path.join(TMP_DIR, spec.filename);

  // 1) Acquisizione: prima tenta download dal portale, poi fallback locale.
  let buf;
  let acquired = 'download';
  try {
    log(`  ↳ download ${spec.url}`);
    buf = await RS.downloadFromRegione(agencyId);
    fs.writeFileSync(tmpPdf, buf);
  } catch (e) {
    warn(`  ↳ download fallito (${e.message}); cerco un fallback in data/manual/${agencyId}/`);
    const manualDir = path.join(MANUAL_DIR, agencyId);
    if (!fs.existsSync(manualDir)) {
      warn(`  ↳ ${manualDir} non esiste, skip`);
      return {};
    }
    const pdfs = fs.readdirSync(manualDir).filter(f => /\.pdf$/i.test(f));
    if (pdfs.length === 0) {
      warn(`  ↳ nessun PDF in ${manualDir}, skip`);
      return {};
    }
    const localPath = path.join(manualDir, pdfs[0]);
    buf = fs.readFileSync(localPath);
    fs.copyFileSync(localPath, tmpPdf);
    acquired = `manual:${pdfs[0]}`;
    log(`  ↳ uso PDF locale ${localPath}`);
  }

  // 2) Hash check — se è lo stesso file dell'ultimo run, skip
  const sha1 = RS.sha1OfBuffer(buf);
  const logKey = `regione:${agencyId}`;
  const prev = importLog[logKey];
  if (!FORCE && prev && prev.sha1 === sha1) {
    log(`  ↳ hash invariato (${sha1.slice(0, 8)}), skip parsing`);
    importLog[logKey] = { ...prev, lastCheckedAt: new Date().toISOString() };
    return {};   // nessuna modifica al manifest
  }
  log(`  ↳ sha1 ${sha1.slice(0, 8)} · size ${(buf.length / 1024 / 1024).toFixed(2)} MB`);

  // 3) Parsing
  const parsed = RS.parsePdf(tmpPdf, { agencyId, CITIES: network.CITIES });
  log(`  ↳ trovate ${parsed.routes.length} linee con orari`);
  if (parsed.unmappedStops.length > 0) {
    warn(`  ↳ ${parsed.unmappedStops.length} fermate NON mappate a una città Movì CT:`);
    parsed.unmappedStops.slice(0, 20).forEach(s => warn(`      · ${s}`));
    if (parsed.unmappedStops.length > 20) warn(`      … (+${parsed.unmappedStops.length - 20} altre, vedi log completo)`);
  }
  for (const w of parsed.warnings) warn(`  ↳ ${w}`);

  // 4) Map sui connectionId di Movì CT
  const sourceMeta = {
    source: `Regione Siciliana — ${spec.label}`,
    sourceUrl: spec.url,
    lastUpdatedAt: todayISO(),
    validFrom: null,
    validTo: null,
  };
  const scheduleMap = RS.buildScheduleMap(parsed, {
    CONNECTIONS: network.CONNECTIONS,
    CITIES: network.CITIES,
    orderedStopsFn: orderedStops,
    carrierId,
    sourceMeta,
  });
  const connCount = Object.keys(scheduleMap).length;
  const schedCount = Object.values(scheduleMap).reduce((n, v) => n + v.schedules.length, 0);
  log(`  ↳ ${connCount} connection alimentate, ${schedCount} schedules generate`);

  // 5) Aggiorna import-log
  importLog[logKey] = {
    sha1,
    sizeBytes: buf.length,
    sourceUrl: spec.url,
    acquired,
    fetchedAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
    parsedRoutes: parsed.routes.length,
    parsedSchedules: schedCount,
    unmappedStops: parsed.unmappedStops,
    fareTable: parsed.fareTable,
  };

  // 6) Le fareTable Regione si applicano all'intero vettore: le replico
  //    su ogni meta per renderle accessibili dal frontend
  if (parsed.fareTable) {
    for (const k of Object.keys(scheduleMap)) {
      scheduleMap[k].meta.fareTable = parsed.fareTable;
    }
  }

  return scheduleMap;
}

// Modalità debug: parsa un PDF locale (--input) usando un agency arbitrario.
async function refreshLocalPdf(pdfPath, agencyId, carrierId, network) {
  log(`LOCAL: parsing ${pdfPath} come agency=${agencyId}, carrier=${carrierId}`);
  const parsed = RS.parsePdf(pdfPath, { agencyId, CITIES: network.CITIES });
  log(`  ↳ ${parsed.routes.length} linee, ${parsed.warnings.length} warnings`);
  for (const r of parsed.routes.slice(0, 8)) {
    const km = r.stops.length > 0 ? Math.abs(r.stops[r.stops.length - 1].km - r.stops[0].km).toFixed(1) : '?';
    log(`    · cod.${r.code || '—'} ${r.label}: ${r.stops.length} fermate, ${km} km`);
  }
  if (parsed.unmappedStops.length > 0) {
    warn(`  ↳ ${parsed.unmappedStops.length} fermate non mappate (prime 30):`);
    parsed.unmappedStops.slice(0, 30).forEach(s => warn(`      · ${s}`));
  }
  const sourceMeta = {
    source: `Regione Siciliana — debug ${agencyId}`,
    sourceUrl: RS.REGIONE_PDF[agencyId]?.url || null,
    lastUpdatedAt: todayISO(),
    validFrom: null,
    validTo: null,
  };
  return RS.buildScheduleMap(parsed, {
    CONNECTIONS: network.CONNECTIONS,
    CITIES: network.CITIES,
    orderedStopsFn: orderedStops,
    carrierId,
    sourceMeta,
  });
}

// ── Driver ───────────────────────────────────────────────────────────────
// Mappa key CLI → handler. Per i vettori Regione la chiave è il key
// agencyId nello script, e per ognuno specifichiamo quale carrierId Movì CT
// alimenta nelle entry `schedules[]`.
const REGIONE_TARGETS = {
  ast:      { agencyId: 'ast',      carrierId: 'ast' },
  sais:     { agencyId: 'saist',    carrierId: 'saist' },     // PIR_SAISTRASPORTI
  interbus: { agencyId: 'interbus', carrierId: 'interbus' },  // PIR_INTERBUSSPA
};

(async function main() {
  const network = await loadNetwork();
  const importLog = loadImportLog();
  const merged = {};
  let okCount = 0;
  let failCount = 0;

  // Modalità --input: parsa un singolo PDF locale.
  if (ARG_INPUT) {
    const agencyId = ARG_AGENCY || 'ast';
    const carrierId = REGIONE_TARGETS[agencyId]?.carrierId || agencyId;
    try {
      const result = await refreshLocalPdf(ARG_INPUT, agencyId, carrierId, network);
      Object.assign(merged, result);
      okCount++;
    } catch (e) {
      failCount++;
      warn(`LOCAL: ERRORE — ${e.message}`);
    }
  } else {
    // FCE: pipeline dedicata (sito Circumetnea).
    if (!ARG_ONLY || ARG_ONLY === 'fce') {
      try { Object.assign(merged, await refreshFCE()); okCount++; }
      catch (e) { failCount++; warn(`fce: ERRORE — ${e.message}`); }
    }

    // AST / SAIST / Interbus: pipeline Regione Sicilia.
    for (const [key, { agencyId, carrierId }] of Object.entries(REGIONE_TARGETS)) {
      if (ARG_ONLY && ARG_ONLY !== key) continue;
      try {
        const result = await refreshRegione(agencyId, carrierId, network, importLog);
        Object.assign(merged, result);
        okCount++;
        // Rate limit cortese tra fetch al portale Regione
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        failCount++;
        warn(`${key}: ERRORE — ${e.message}`);
      }
    }
  }

  log(`completati ${okCount} extractor, falliti ${failCount}`);

  if (DRY_RUN) {
    log('--dry-run: non scrivo il manifest');
    log(JSON.stringify(merged, null, 2));
    return;
  }

  // Merge con manifest esistente (le tratte non toccate restano com'erano).
  let existing = {};
  if (fs.existsSync(OUT_FILE)) {
    try { existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); }
    catch { existing = {}; }
  }
  const final = { ...existing, ...merged };

  // Preserva schedules + meta curati a mano quando l'extractor automatico
  // non produce ancora dati per quella connection.
  for (const [k, v] of Object.entries(final)) {
    const prev = existing[k];
    const newEmpty = !v.schedules || v.schedules.length === 0;
    const prevHasData = prev && Array.isArray(prev.schedules) && prev.schedules.length > 0;
    if (newEmpty && prevHasData) {
      v.schedules = prev.schedules;
      if (prev.meta) v.meta = prev.meta;
      if (prev.routes) v.routes = prev.routes;
      log(`preservati ${prev.schedules.length} schedule curati per ${k}`);
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(final, null, 2) + '\n', 'utf8');
  log(`scritto ${path.relative(ROOT, OUT_FILE)} (${Object.keys(final).length} tratte con metadata)`);

  // Persisti import-log
  saveImportLog(importLog);
  log(`scritto ${path.relative(ROOT, IMPORT_LOG_FILE)}`);
})().catch(err => {
  console.error('[refresh] FATAL', err);
  process.exit(1);
});
