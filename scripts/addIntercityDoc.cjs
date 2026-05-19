#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Movì CT — Aggiungi un documento ufficiale di un vettore
// ─────────────────────────────────────────────────────────────────────────
// Registra un PDF o una pagina ufficiale nel manifest `intercityDocs.json`.
// Se è un file locale, lo copia in `public/intercity-docs/` e lo serve come
// asset statico dal deploy Vercel.
//
// Esempi:
//   # PDF locale, generico per il vettore:
//   npm run add-intercity-doc -- ./orario-ast.pdf \
//     --carrier ast --title "Orario linea Acireale 2026" --type orari
//
//   # Solo link ufficiale (niente file locale):
//   npm run add-intercity-doc -- \
//     --url https://www.example.it/orari.pdf \
//     --carrier sais --title "Tariffe SAIS 2026" --type tariffe
//
//   # Specifico per una tratta:
//   npm run add-intercity-doc -- ./pdf-rifugio.pdf \
//     --carrier ast --title "Linea Etna estate 2026" --type orari \
//     --tratta c-rifugio --valid-from 2026-06-01 --valid-to 2026-09-30
// ─────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS_FILE = path.join(ROOT, 'src', 'data', 'intercityDocs.json');
const DOCS_PUBLIC_DIR = path.join(ROOT, 'public', 'intercity-docs');
const NETWORK_FILE = path.join(ROOT, 'src', 'data', 'intercityNetwork.js');

// ── Parse CLI args ───────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args[key] = next; i++; }
      else { args[key] = true; }
    } else {
      args._.push(a);
    }
  }
  return args;
}
const args = parseArgs(process.argv.slice(2));

function die(msg) { console.error('[add-doc] ' + msg); process.exit(1); }

// ── Validazioni ──────────────────────────────────────────────────────────
const carrier = args.carrier;
const title = args.title;
const type = args.type || 'orari';
const tratta = args.tratta || null;
const sourceUrl = args.url || null;
const validFrom = args['valid-from'] || null;
const validTo = args['valid-to'] || null;
const note = args.note || null;
const localFile = args._[0] || null;

if (!carrier) die('manca --carrier <id> (es. ast, fce, sais, interbus, etna, segesta, saist)');
if (!title) die('manca --title "<titolo>"');
if (!localFile && !sourceUrl) die('serve un file locale (primo argomento) oppure --url <URL>');

// Controllo coerenza vettore con la rete (errori a tempo di add, non di build).
const networkSrc = fs.readFileSync(NETWORK_FILE, 'utf8');
const knownCarriers = [...networkSrc.matchAll(/id:\s*'([a-z]+)'.+?group:/g)].map(m => m[1]);
// fallback: liste manuali
const validCarriers = new Set(['sais', 'saist', 'interbus', 'etna', 'segesta', 'ast', 'fce',
  ...knownCarriers]);
if (!validCarriers.has(carrier)) {
  die(`vettore sconosciuto: "${carrier}". Validi: ${[...validCarriers].join(', ')}`);
}

const validTypes = new Set(['orari', 'tariffe', 'brochure', 'avviso', 'info']);
if (!validTypes.has(type)) {
  die(`type "${type}" non valido. Usa: ${[...validTypes].join(', ')}`);
}

if (tratta) {
  // Verifica che la tratta esista nella rete
  if (!networkSrc.includes(`id: '${tratta}'`)) {
    die(`tratta sconosciuta: "${tratta}". Cerca in src/data/intercityNetwork.js`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────
function slugify(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
function todayISO() {
  const d = new Date(), pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

// ── Copia il file se locale ──────────────────────────────────────────────
let filename = null;
let size = null;
if (localFile) {
  if (!fs.existsSync(localFile)) die(`file non trovato: ${localFile}`);
  ensureDir(DOCS_PUBLIC_DIR);
  const ext = path.extname(localFile).toLowerCase() || '.pdf';
  filename = `${carrier}-${slugify(title)}${ext}`;
  const dest = path.join(DOCS_PUBLIC_DIR, filename);
  fs.copyFileSync(localFile, dest);
  size = fs.statSync(dest).size;
  console.log(`[add-doc] file copiato in public/intercity-docs/${filename} (${(size/1024).toFixed(1)} KB)`);
}

// ── Registrazione nel manifest ───────────────────────────────────────────
let manifest = { docs: [] };
if (fs.existsSync(DOCS_FILE)) {
  manifest = JSON.parse(fs.readFileSync(DOCS_FILE, 'utf8'));
  if (!Array.isArray(manifest.docs)) manifest.docs = [];
}

const id = `${carrier}-${slugify(title)}`;
const existing = manifest.docs.findIndex(d => d.id === id);
const entry = {
  id,
  carrierId: carrier,
  tratta,
  title,
  filename,
  sourceUrl,
  type,
  size,
  validFrom,
  validTo,
  addedAt: todayISO(),
  note,
};

if (existing >= 0) {
  manifest.docs[existing] = { ...manifest.docs[existing], ...entry };
  console.log(`[add-doc] aggiornata voce esistente: ${id}`);
} else {
  manifest.docs.push(entry);
  console.log(`[add-doc] aggiunta voce: ${id}`);
}

fs.writeFileSync(DOCS_FILE, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`[add-doc] manifest ora contiene ${manifest.docs.length} documenti.`);
console.log('[add-doc] OK. Ricordati di: git add . && git commit && git push');
