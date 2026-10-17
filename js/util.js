// Petites fonctions partagées : échappement HTML, identifiants, dates, montants.

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const pad = (n) => String(n).padStart(2, '0');

// Les dates « jour » sont stockées au format 'AAAA-MM-JJ' en heure locale.
export function ymd(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function hm(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const today = () => ymd();

export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

// Nombre de jours de a vers b (b - a).
export function diffDays(a, b) {
  return Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
}

// Lundi de la semaine contenant s.
export function startOfWeek(s) {
  const dow = (parseYmd(s).getDay() + 6) % 7;
  return addDays(s, -dow);
}

// Dimanche qui suit s (le dimanche suivant si s est un dimanche).
export function nextSunday(s) {
  const dow = parseYmd(s).getDay();
  return addDays(s, dow === 0 ? 7 : 7 - dow);
}

const fmtCache = new Map();
function fmt(opts) {
  const key = JSON.stringify(opts);
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.DateTimeFormat('fr-FR', opts));
  return fmtCache.get(key);
}

export function fmtDate(s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return fmt(opts).format(parseYmd(s));
}

export function fmtLongDate(s) {
  const txt = fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(parseYmd(s));
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export function fmtMonth(key) {
  const txt = fmt({ month: 'long', year: 'numeric' }).format(parseYmd(`${key}-01`));
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export function relDay(s, ref = today()) {
  const d = diffDays(ref, s);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Demain';
  if (d === -1) return 'Hier';
  if (d > 1 && d < 7) return fmtDate(s, { weekday: 'long' });
  if (d < 0) return `il y a ${-d} j`;
  return fmtDate(s);
}

export function countdown(s, ref = today()) {
  const d = diffDays(ref, s);
  if (d === 0) return 'Jour J';
  return d > 0 ? `J-${d}` : `J+${-d}`;
}

export function monthKey(s = today()) {
  return s.slice(0, 7);
}

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// Même jour le mois suivant (ramené au dernier jour du mois si besoin : 31 → 30).
export function addMonthsKeepDay(s, n) {
  const key = addMonths(s.slice(0, 7), n);
  return `${key}-${String(Math.min(Number(s.slice(8, 10)), daysInMonth(key))).padStart(2, '0')}`;
}

export function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const money0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const fmtMoney = (n, round = false) => (round ? money0 : money).format(n || 0);

export function plural(n, one, many) {
  return `${n} ${n > 1 ? many : one}`;
}

export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];

export function timezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
}
