// Storage popup pubblicitari: Firestore real-time + localStorage cache offline.
// Cooldown e password admin restano locali (per-device).

import { doc, setDoc, getDoc, deleteDoc, onSnapshot, collection } from 'firebase/firestore';
import { db } from '../firebase';

// Sentinel salvato in popup.videoUrl quando il video è caricato dalla galleria
// e spezzato a chunk base64 in Firestore (collezione popup_videos).
export const VIDEO_SENTINEL = 'firestore://popup_video';
const VIDEO_CHUNK_SIZE = 800 * 1024; // ~800KB per doc, sotto il limite 1MB Firestore

const CACHE_KEY = 'movi-popups-v2';
const COOLDOWN_PREFIX = 'movi-popup-shown-';

export const POPUP_SECTIONS = [
  { id: 'home', label: 'Apertura app' },
  { id: 'metro', label: 'Metro' },
  { id: 'bus', label: 'Bus' },
  { id: 'treni', label: 'Treni' },
  { id: 'pullman', label: 'Pullman Sicilia' },
  { id: 'scooter', label: 'Monopattini' },
];

export const DEFAULT_POPUP = {
  enabled: false,
  type: 'image',
  imageUrl: '',
  videoUrl: '',
  title: '',
  slogan: '',
  ctaText: '',
  ctaUrl: '',
  expireAt: '',
  cooldownMinutes: 15,
  updatedAt: 0,
};

// In-memory cache, hydrated from localStorage and kept in sync by onSnapshot
let cache = {};
const listeners = new Set();

function loadCacheFromStorage() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch { cache = {}; }
}
loadCacheFromStorage();

function saveCacheToStorage() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
}

function notifyListeners() {
  for (const fn of listeners) fn();
}

// Subscribe in real-time to the popups collection
let unsub = null;
export function startSync() {
  if (unsub) return;
  // Preload dei video già noti dalla cache locale, prima ancora del primo snapshot
  preloadVideosFromMap(cache);
  unsub = onSnapshot(collection(db, 'popups'), (snap) => {
    const next = {};
    snap.forEach(d => { next[d.id] = d.data(); });
    cache = next;
    saveCacheToStorage();
    notifyListeners();
    // Scarica/decodifica in background i video da galleria così, quando il
    // popup si apre, il blob è già pronto (o servito dalla cache persistente).
    preloadVideosFromMap(next);
  }, (err) => {
    console.warn('[popups] Firestore sync error:', err.message);
  });
}

function preloadVideosFromMap(map) {
  for (const [sec, p] of Object.entries(map || {})) {
    if (p?.enabled && p?.type === 'video' && p?.videoUrl === VIDEO_SENTINEL) {
      preloadPopupVideo(sec);
    }
  }
}

export function stopSync() {
  if (unsub) { unsub(); unsub = null; }
}

export function onPopupsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── API (synchronous reads, async writes) ───────────────────────────
export function getPopup(section) {
  return { ...DEFAULT_POPUP, ...(cache[section] || {}) };
}

export function getAllPopups() {
  const out = {};
  for (const s of POPUP_SECTIONS) {
    out[s.id] = { ...DEFAULT_POPUP, ...(cache[s.id] || {}) };
  }
  return out;
}

export async function setPopup(section, config) {
  const payload = { ...DEFAULT_POPUP, ...config, updatedAt: Date.now() };
  // Optimistic local update
  cache[section] = payload;
  saveCacheToStorage();
  notifyListeners();
  // Write to Firestore (the snapshot listener will re-sync)
  await setDoc(doc(db, 'popups', section), payload);
}

// ── Video popup caricati dalla galleria (chunk base64 in Firestore) ──
// Il limite di 1MB/doc Firestore impedisce di salvare un video in un solo
// campo: lo spezziamo in chunk da ~800KB sotto popup_videos/{section}_chunk_N
// + un doc meta {chunks, type}. In popup.videoUrl mettiamo VIDEO_SENTINEL.

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Carica un file video come chunk base64. onProgress riceve 0..100.
// Ritorna il sentinel da salvare in popup.videoUrl.
export async function uploadPopupVideo(section, file, onProgress) {
  const base64 = await fileToDataUrl(file);
  const chunks = [];
  for (let i = 0; i < base64.length; i += VIDEO_CHUNK_SIZE) {
    chunks.push(base64.slice(i, i + VIDEO_CHUNK_SIZE));
  }

  // Elimina i chunk in eccesso se un video precedente ne aveva di più
  const metaRef = doc(db, 'popup_videos', `${section}_meta`);
  const oldMeta = await getDoc(metaRef);
  if (oldMeta.exists()) {
    const oldCount = oldMeta.data()?.chunks || 0;
    for (let i = chunks.length; i < oldCount; i++) {
      await deleteDoc(doc(db, 'popup_videos', `${section}_chunk_${i}`)).catch(() => {});
    }
  }

  // Scrive i chunk uno alla volta (un batch supererebbe il limite 10MB)
  for (let i = 0; i < chunks.length; i++) {
    await setDoc(doc(db, 'popup_videos', `${section}_chunk_${i}`), { data: chunks[i] });
    onProgress?.(Math.round(((i + 1) / chunks.length) * 95));
  }
  // `updatedAt` fa da versione: cambia ad ogni upload → invalida la cache locale.
  await setDoc(metaRef, { chunks: chunks.length, type: file.type || 'video/mp4', updatedAt: Date.now() });
  onProgress?.(100);
  return VIDEO_SENTINEL;
}

// ── Cache persistente del video assemblato (Cache Storage API) ───────
// Dopo il primo download/decodifica il video resta sul dispositivo: le
// aperture successive del popup sono immediate, senza ri-scaricare i chunk.
const VIDEO_CACHE_NAME = 'movi-popup-videos-v1';
const videoBlobMem = {}; // section -> { sig, blob }: cache in-memory per la sessione

async function readCachedVideo(section, sig) {
  try {
    if (!('caches' in window)) return null;
    const cache = await caches.open(VIDEO_CACHE_NAME);
    const res = await cache.match(`/popup-video/${section}?sig=${sig}`);
    return res ? await res.blob() : null;
  } catch { return null; }
}

async function writeCachedVideo(section, sig, blob) {
  try {
    if (!('caches' in window)) return;
    const cache = await caches.open(VIDEO_CACHE_NAME);
    // Elimina le versioni vecchie della stessa sezione per non accumularle
    for (const req of await cache.keys()) {
      if (req.url.includes(`/popup-video/${section}?`) && !req.url.endsWith(`sig=${sig}`)) {
        await cache.delete(req);
      }
    }
    await cache.put(`/popup-video/${section}?sig=${sig}`, new Response(blob));
  } catch {}
}

// Ottiene il Blob del video (mem cache → cache persistente → download chunk).
async function fetchPopupVideoBlob(section) {
  const metaSnap = await getDoc(doc(db, 'popup_videos', `${section}_meta`));
  if (!metaSnap.exists()) return null;
  const { chunks, type, updatedAt } = metaSnap.data();
  const sig = String(updatedAt || chunks || '0');

  const mem = videoBlobMem[section];
  if (mem && mem.sig === sig) return mem.blob;

  const cached = await readCachedVideo(section, sig);
  if (cached) { videoBlobMem[section] = { sig, blob: cached }; return cached; }

  const parts = await Promise.all(
    Array.from({ length: chunks }, (_, i) =>
      getDoc(doc(db, 'popup_videos', `${section}_chunk_${i}`))
    )
  );
  // I chunk ricompongono l'intero data URL (`data:video/...;base64,...`):
  // lasciamo decodificare il base64 nativamente al browser → molto più veloce
  // del loop atob() carattere per carattere sui MB.
  const dataUrl = parts.map(p => p.data()?.data || '').join('');
  if (!dataUrl) return null;
  const blob = await (await fetch(dataUrl)).blob();
  videoBlobMem[section] = { sig, blob };
  writeCachedVideo(section, sig, blob); // fire-and-forget
  return blob;
}

// Avvia in background download+decodifica del video (chiamato allo startup).
export function preloadPopupVideo(section) {
  fetchPopupVideoBlob(section).catch(() => {});
}

// Riassembla i chunk in un blob URL riproducibile da <video src>. null se assente.
export async function loadPopupVideoBlobUrl(section) {
  const blob = await fetchPopupVideoBlob(section);
  return blob ? URL.createObjectURL(blob) : null;
}

// Elimina meta + tutti i chunk del video di una sezione.
export async function deletePopupVideo(section) {
  const metaRef = doc(db, 'popup_videos', `${section}_meta`);
  const metaSnap = await getDoc(metaRef);
  if (!metaSnap.exists()) return;
  const oldCount = metaSnap.data()?.chunks || 0;
  for (let i = 0; i < oldCount; i++) {
    await deleteDoc(doc(db, 'popup_videos', `${section}_chunk_${i}`)).catch(() => {});
  }
  await deleteDoc(metaRef).catch(() => {});
}

export function shouldShowPopup(section) {
  const p = getPopup(section);
  if (!p.enabled) return false;
  if (!p.imageUrl && !p.videoUrl) return false;
  if (p.expireAt) {
    const exp = new Date(p.expireAt + 'T23:59:59');
    if (Date.now() > exp.getTime()) return false;
  }
  const lastShown = parseInt(localStorage.getItem(COOLDOWN_PREFIX + section) || '0', 10);
  // Cooldown in minuti; fallback per i doc vecchi che usavano le ore.
  const cooldownMin = p.cooldownMinutes != null
    ? p.cooldownMinutes
    : (p.cooldownHours || 0) * 60;
  const cooldownMs = cooldownMin * 60_000;
  if (lastShown && Date.now() - lastShown < cooldownMs) return false;
  return true;
}

export function markPopupShown(section) {
  localStorage.setItem(COOLDOWN_PREFIX + section, String(Date.now()));
}

export function resetCooldown(section) {
  if (section) {
    localStorage.removeItem(COOLDOWN_PREFIX + section);
  } else {
    for (const s of POPUP_SECTIONS) {
      localStorage.removeItem(COOLDOWN_PREFIX + s.id);
    }
  }
}

// ── Admin password (locale per-device) ──────────────────────────────
const ADMIN_PWD_KEY = 'movi-admin-pwd';
const DEFAULT_ADMIN_PWD = 'movict2026';

export function verifyAdminPassword(input) {
  const saved = localStorage.getItem(ADMIN_PWD_KEY) || DEFAULT_ADMIN_PWD;
  return input === saved;
}

export function setAdminPassword(newPwd) {
  localStorage.setItem(ADMIN_PWD_KEY, newPwd);
}
