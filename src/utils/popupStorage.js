// Storage popup pubblicitari per sezione: home | metro | bus | treni | pullman | scooter
// Versione attuale: localStorage (no backend). Swap futuro a Firestore mantenendo questa API.

const STORAGE_KEY = 'movi-popups-v1';
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
  type: 'image',         // 'image' | 'video'
  imageUrl: '',          // base64 o URL
  videoUrl: '',          // URL diretto o YouTube
  title: '',
  slogan: '',
  ctaText: '',
  ctaUrl: '',
  expireAt: '',          // YYYY-MM-DD
  cooldownHours: 6,      // ore minime fra due visualizzazioni
  updatedAt: 0,
};

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeAll(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getPopup(section) {
  const all = readAll();
  return { ...DEFAULT_POPUP, ...(all[section] || {}) };
}

export function getAllPopups() {
  const all = readAll();
  const out = {};
  for (const s of POPUP_SECTIONS) {
    out[s.id] = { ...DEFAULT_POPUP, ...(all[s.id] || {}) };
  }
  return out;
}

export function setPopup(section, config) {
  const all = readAll();
  all[section] = { ...DEFAULT_POPUP, ...config, updatedAt: Date.now() };
  writeAll(all);
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

// Password admin (default; modificabile dal pannello segreto)
const ADMIN_PWD_KEY = 'movi-admin-pwd';
const DEFAULT_ADMIN_PWD = 'movict2026';

export function verifyAdminPassword(input) {
  const saved = localStorage.getItem(ADMIN_PWD_KEY) || DEFAULT_ADMIN_PWD;
  return input === saved;
}

export function setAdminPassword(newPwd) {
  localStorage.setItem(ADMIN_PWD_KEY, newPwd);
}
