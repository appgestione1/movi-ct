/**
 * i18n Movì CT: it / en / es / fr / de (stesso modello di WHAT?).
 *
 * - Ogni sezione ha il suo file in `./locales/<namespace>.js` che esporta
 *   `{ it: {...}, en: {...}, es: {...}, fr: {...}, de: {...} }`; qui vengono
 *   uniti sotto la chiave del namespace (nome file) → `t('scooter.title')`.
 * - Lingua iniziale da `navigator.language`; scelta manuale persistita in
 *   localStorage (`movi.lang`). Fallback: lingua → en → it → chiave.
 */
import { useSyncExternalStore, useCallback } from 'react';

export const LANGS = [
  { code: 'it', label: 'Italiano', short: 'IT', flag: '🇮🇹' },
  { code: 'en', label: 'English', short: 'EN', flag: '🇬🇧' },
  { code: 'es', label: 'Español', short: 'ES', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', short: 'FR', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', short: 'DE', flag: '🇩🇪' },
];
export const SUPPORTED = LANGS.map((l) => l.code);
const STORAGE_KEY = 'movi.lang';

const dict = { it: {}, en: {}, es: {}, fr: {}, de: {} };
const modules = import.meta.glob('./locales/*.js', { eager: true });
for (const [path, mod] of Object.entries(modules)) {
  const ns = path.split('/').pop().replace(/\.js$/, '');
  const data = mod.default || {};
  for (const code of SUPPORTED) dict[code][ns] = data[code] || {};
}

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED.includes(v) ? v : null;
  } catch { return null; }
}

function detectLanguage() {
  const nav = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'it';
  const c = String(nav).toLowerCase().slice(0, 2);
  return SUPPORTED.includes(c) ? c : 'en';
}

let current = readStored() || detectLanguage();
let explicit = Boolean(readStored());
const listeners = new Set();

export function getLang() { return current; }
export function isExplicit() { return explicit; }

export function setLang(code) {
  if (!SUPPORTED.includes(code)) return;
  explicit = true;
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* storage non disponibile */ }
  current = code;
  if (typeof document !== 'undefined') document.documentElement.lang = code;
  listeners.forEach((fn) => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function lookup(lang, key) {
  return key.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), dict[lang]);
}

export function translate(key, vars, lang = current) {
  let value = lookup(lang, key);
  if (value === undefined) value = lookup('en', key);
  if (value === undefined) value = lookup('it', key);
  if (value === undefined) return key;
  if (typeof value !== 'string') return value;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}
export const t = translate;

/** Locale BCP-47 per Intl / toLocaleTimeString. */
export function getLocale(lang = current) {
  return { it: 'it-IT', en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' }[lang] || 'it-IT';
}

export function useI18n() {
  const lang = useSyncExternalStore(subscribe, getLang, getLang);
  const tr = useCallback((key, vars) => translate(key, vars, lang), [lang]);
  return { lang, t: tr, setLang, locale: getLocale(lang), langs: LANGS };
}

if (typeof document !== 'undefined') document.documentElement.lang = current;
