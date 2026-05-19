#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Movì CT — Refresh degli orari pullman extraurbani
// ─────────────────────────────────────────────────────────────────────────
// Scarica i PDF/HTML degli orari ufficiali dei vettori, estrae il testo,
// rileva il periodo di validità e salva in `src/data/intercitySchedules.json`.
//
// L'estrazione delle singole CORSE (orario_partenza, orario_arrivo per ogni
// tratta) è un parsing dedicato per ogni vettore — vedi sezione "extractors"
// più sotto. Ogni extractor è opzionale: quando manca, il manifest aggiorna
// solo `schedulesMeta` (fonte/data/validità) per le tratte di quel vettore.
//
// Uso:
//   npm run refresh-intercity                       # refresh totale
//   npm run refresh-intercity -- --only fce         # solo FCE
//   npm run refresh-intercity -- --dry-run          # non scrive il JSON
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

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'intercitySchedules.json');
const TMP_DIR = path.join(os.tmpdir(), 'movict-refresh');

// ── CLI args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const ARG_ONLY = (() => {
  const i = args.indexOf('--only');
  return i >= 0 ? args[i + 1] : null;
})();
const DRY_RUN = args.includes('--dry-run');

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

// GET HTTPS con redirect a catena (max 5).
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

// ── Extractor: FCE Autolinee ─────────────────────────────────────────────
async function refreshFCE() {
  log('FCE: scarico PDF orari autolinee…');

  // La pagina /le-nostre-linee/ contiene direttamente i link "download" con
  // parametri wpdmdl/refresh: fetchando quelli si ottiene il PDF binario
  // (WordPress Download Manager risponde con application/pdf).
  const landing = 'https://www.circumetnea.it/le-nostre-linee/';
  const landingHtml = (await fetchBuffer(landing)).toString('utf8');
  const candidates = [...landingHtml.matchAll(
    /https:\/\/www\.circumetnea\.it\/download\/orario-autolinee[^"' ]*?wpdmdl=\d+[^"' ]*/g
  )].map(m => m[0]);
  if (candidates.length === 0) {
    throw new Error('FCE: nessun link wpdmdl per "orario-autolinee" trovato in /le-nostre-linee/');
  }
  // Preferisci la URL con filename .pdf esplicito quando presente.
  const pdfUrl = candidates.find(u => /filename=[^&]*\.pdf/i.test(u)) || candidates[0];

  ensureDir(TMP_DIR);
  const pdfPath = path.join(TMP_DIR, 'fce-autolinee.pdf');
  const buf = await fetchBuffer(pdfUrl);
  fs.writeFileSync(pdfPath, buf);
  log(`FCE: PDF salvato (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);

  const text = pdfToText(pdfPath);

  // Estrai la data di validità dal titolo del PDF.
  // Esempio: "ORARIO INVERNALE 2025 - 2026 (AGGIORNATO IL 30 MARZO 2026)"
  const titleMatch = text.match(/AGGIORNATO\s+IL\s+(\d{1,2}\s+[A-ZÀ]+\s+\d{4})/i);
  const validFrom = titleMatch ? parseItalianDate(titleMatch[1]) : null;

  // L'orario stagionale è normalmente Inverno/Estate.
  const seasonMatch = text.match(/ORARIO\s+(INVERNALE|ESTIVO)\s+(\d{4})\s*[-–]\s*(\d{4})/i);
  const season = seasonMatch
    ? `${seasonMatch[1].toLowerCase()} ${seasonMatch[2]}-${seasonMatch[3]}`
    : null;

  log(`FCE: validità rilevata = ${validFrom || '(nessuna)'} · stagione = ${season || '(n/d)'}`);

  // La URL "stabile" da mostrare all'utente è la landing /download/<slug>/
  // (la variante con wpdmdl ha un parametro `refresh` che cambia ad ogni fetch).
  const stableSourceUrl = pdfUrl.split('?')[0];

  // Le 3 connection FCE condividono la stessa fonte/data.
  const meta = {
    source: `FCE — Autolinee Circumetnea (${season || 'orario in vigore'})`,
    sourceUrl: stableSourceUrl,
    lastUpdatedAt: todayISO(),
    validFrom,
    validTo: null,
  };

  // TODO: parsing per-corsa del PDF FCE.
  // Il PDF ha una matrice multi-colonna con codici calendario C/S/K che indicano
  // feriale/scolastico/altro. Per non produrre dati errati, il parsing va scritto
  // e validato a parte (un extractor dedicato per ognuna delle 3 tratte FCE).
  // Finché non è pronto, schedules resta vuoto ma meta è già fresca.
  const schedules = {
    'c-fce-randazzo':    [],
    'c-fce-linguaglossa': [],
    'c-fce-nicolosi':    [],
  };

  return {
    'c-fce-randazzo':     { meta, schedules: schedules['c-fce-randazzo'] },
    'c-fce-linguaglossa': { meta, schedules: schedules['c-fce-linguaglossa'] },
    'c-fce-nicolosi':     { meta, schedules: schedules['c-fce-nicolosi'] },
  };
}

// ── Extractor: AST ───────────────────────────────────────────────────────
// Il sito ufficiale AST presenta un certificato SSL self-signed: la fetch
// fallisce su client che validano la catena. Finché AST non sistema il TLS,
// il refresh automatico non è praticabile. Resta possibile caricare i PDF
// manualmente sotto `data/manual/ast/` e farli leggere da uno script futuro.
async function refreshAST() {
  warn('AST: refresh saltato — certificato SSL del sito ufficiale non valido. ' +
       'Caricare i PDF manualmente in data/manual/ast/ e ri-eseguire.');
  return {};
}

// ── Extractor: gruppi dinamici (SAIS / Interbus / Etna) ──────────────────
// I motori di ricerca biglietti girano interamente lato JavaScript (Next.js,
// PHP con stato di sessione) e non espongono pagine statiche di orari. Per
// estrarne i quadri orario servirebbe un browser headless (Playwright). Lo
// scaffolding è qui ma l'extractor reale è da implementare.
async function refreshSAIS()     { warn('SAIS: refresh non implementato (booking dinamico).');     return {}; }
async function refreshInterbus() { warn('Interbus: refresh non implementato (booking dinamico).'); return {}; }
async function refreshEtna()     { warn('Etna Trasporti: refresh non implementato (idem).');       return {}; }

// ── Driver ───────────────────────────────────────────────────────────────
const EXTRACTORS = {
  fce: refreshFCE,
  ast: refreshAST,
  sais: refreshSAIS,
  interbus: refreshInterbus,
  etna: refreshEtna,
};

(async function main() {
  const targets = ARG_ONLY ? [ARG_ONLY] : Object.keys(EXTRACTORS);
  const merged = {};
  let okCount = 0;
  let failCount = 0;

  for (const key of targets) {
    const fn = EXTRACTORS[key];
    if (!fn) { warn(`vettore sconosciuto: ${key}`); continue; }
    try {
      const result = await fn();
      Object.assign(merged, result);
      okCount++;
    } catch (e) {
      failCount++;
      warn(`${key}: ERRORE — ${e.message}`);
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
  // non produce ancora dati per quella connection. Senza questa salvaguardia
  // un refresh azzererebbe il lavoro di curatela manuale dei PDF.
  for (const [k, v] of Object.entries(final)) {
    const prev = existing[k];
    const newEmpty = !v.schedules || v.schedules.length === 0;
    const prevHasData = prev && Array.isArray(prev.schedules) && prev.schedules.length > 0;
    if (newEmpty && prevHasData) {
      v.schedules = prev.schedules;
      if (prev.meta) v.meta = prev.meta;
      log(`preservati ${prev.schedules.length} schedule curati per ${k}`);
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(final, null, 2) + '\n', 'utf8');
  log(`scritto ${path.relative(ROOT, OUT_FILE)} (${Object.keys(final).length} tratte con metadata)`);
})().catch(err => {
  console.error('[refresh] FATAL', err);
  process.exit(1);
});
