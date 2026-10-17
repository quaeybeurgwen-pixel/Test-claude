// Lecture de Google Agenda (lecture seule), avec la couleur de chaque agenda.
// Connexion OAuth « jeton implicite » : pas de serveur ; le jeton dure 1 heure,
// les rendez-vous restent ensuite affichés depuis le cache jusqu'au prochain rafraîchissement.
import { get, commit } from '../store.js';
import { uid, ymd, hm, addDays, today } from '../util.js';

const TOKEN_KEY = 'sauge.google.token';
const STATE_KEY = 'sauge.google.state';
const CACHE_KEY = 'sauge.google.cache';
const API = 'https://www.googleapis.com/calendar/v3';

export const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');

function readToken() {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY)); } catch { return null; }
}

export const isConfigured = () => !!get().settings.google.clientId;
export const tokenValid = () => { const t = readToken(); return !!t && Date.now() < t.exp; };
export const hasCache = () => !!readCache();

export function connect(returnTo = location.hash || '#/accueil') {
  const state = `gcal-${uid()}`;
  localStorage.setItem(STATE_KEY, JSON.stringify({ state, returnTo }));
  const p = new URLSearchParams({
    client_id: get().settings.google.clientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    include_granted_scopes: 'true',
    state,
  });
  location.href = `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

// Au retour de Google, le jeton arrive dans l'ancre de l'URL.
export function handleRedirect() {
  if (!/[#&](access_token|error)=/.test(location.hash) || !location.hash.includes('state=gcal-')) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  const saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
  localStorage.removeItem(STATE_KEY);
  history.replaceState(null, '', location.pathname + (saved.returnTo || '#/accueil'));
  if (p.get('state') !== saved.state) return 'Connexion Google : réponse inattendue, réessayez.';
  if (p.get('error')) return `Connexion Google impossible : ${p.get('error')}`;
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    access: p.get('access_token'),
    exp: Date.now() + (Number(p.get('expires_in') || 3600) - 60) * 1000,
  }));
  return 'Google Agenda connecté';
}

export function disconnect() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CACHE_KEY);
  get().settings.google.calendars = {};
  commit();
}

async function api(path) {
  const t = readToken();
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${t?.access}` } });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    throw new Error('Session Google expirée');
  }
  if (!res.ok) throw new Error(`Google Agenda : erreur ${res.status}`);
  return res.json();
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}

export const lastFetch = () => readCache()?.fetchedAt || null;

// Télécharge les agendas puis les rendez-vous de J-7 à J+90.
export async function refresh() {
  if (!tokenValid()) return false;
  const cals = get().settings.google.calendars;
  const list = await api('/users/me/calendarList?minAccessRole=reader');
  const fresh = {};
  for (const c of list.items) {
    const prev = cals[c.id];
    fresh[c.id] = {
      name: c.summaryOverride || c.summary,
      color: prev?.customColor || c.backgroundColor || '#7D9A7E',
      customColor: prev?.customColor || null,
      show: prev ? prev.show : c.selected !== false,
      primary: !!c.primary,
    };
  }
  get().settings.google.calendars = fresh;

  const timeMin = new Date(`${addDays(today(), -7)}T00:00:00`).toISOString();
  const timeMax = new Date(`${addDays(today(), 90)}T00:00:00`).toISOString();
  const events = [];
  for (const [calId, cal] of Object.entries(fresh)) {
    if (!cal.show) continue;
    let pageToken = '';
    do {
      const q = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
      if (pageToken) q.set('pageToken', pageToken);
      const page = await api(`/calendars/${encodeURIComponent(calId)}/events?${q}`);
      for (const e of page.items || []) {
        if (e.status === 'cancelled') continue;
        const allDay = !!e.start?.date;
        const start = allDay ? null : new Date(e.start.dateTime);
        const end = allDay ? null : new Date(e.end.dateTime);
        events.push({
          id: e.id,
          calId,
          title: e.summary || '(sans titre)',
          location: e.location || '',
          allDay,
          date: allDay ? e.start.date : ymd(start),
          lastDate: allDay ? addDays(e.end.date, -1) : ymd(end),
          start: allDay ? null : hm(start),
          end: allDay ? null : hm(end),
        });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
  }
  localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), events }));
  commit();
  return true;
}

// Rendez-vous d'un jour donné, triés (journée entière d'abord).
export function eventsOn(day) {
  const cals = get().settings.google.calendars;
  return (readCache()?.events || [])
    .filter((e) => cals[e.calId]?.show !== false && e.date <= day && e.lastDate >= day)
    .map((e) => ({ ...e, color: cals[e.calId]?.color || '#7D9A7E', calName: cals[e.calId]?.name || '' }))
    .sort((a, b) => (a.allDay === b.allDay ? (a.start || '').localeCompare(b.start || '') : a.allDay ? -1 : 1));
}
