// Storage popup pubblicitari: Firestore real-time + localStorage cache offline.
// Cooldown e password admin restano locali (per-device).

import { doc, setDoc, onSnapshot, collection } from 'firebase/firestore';
import { db } from '../firebase';

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
  cooldownHours: 6,
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
  unsub = onSnapshot(collection(db, 'popups'), (snap) => {
    const next = {};
    snap.forEach(d => { next[d.id] = d.data(); });
    cache = next;
    saveCacheToStorage();
    notifyListeners();
  }, (err) => {
    console.warn('[popups] Firestore sync error:', err.message);
  });
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

export function shouldShowPopup(section) {
  const p = getPopup(section);
  if (!p.enabled) return false;
  if (!p.imageUrl && !p.videoUrl) return false;
  if (p.expireAt) {
    const exp = new Date(p.expireAt + 'T23:59:59');
    if (Date.now() > exp.getTime()) return false;
  }
  const lastShown = parseInt(localStorage.getItem(COOLDOWN_PREFIX + section) || '0', 10);
  const cooldownMs = (p.cooldownHours || 0) * 3600_000;
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
