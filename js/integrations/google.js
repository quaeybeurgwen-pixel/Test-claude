// Google Agenda : lecture des agendas (avec leur couleur) et rappels des tâches.
// Les rappels sont des événements avec notification, placés dans un agenda dédié
// « Gwennou App — Rappels » que l'application crée et est seule à modifier.
// Connexion OAuth « jeton implicite » : pas de serveur ; le jeton dure 1 heure,
// les rendez-vous restent ensuite affichés depuis le cache jusqu'au prochain rafraîchissement.
import { get, commit } from '../store.js';
import { uid, ymd, hm, addDays, today, timezone } from '../util.js';
import { findFormation } from '../formations.js';

const TOKEN_KEY = 'sauge.google.token';
const STATE_KEY = 'sauge.google.state';
const CACHE_KEY = 'sauge.google.cache';
const API = 'https://www.googleapis.com/calendar/v3';
const SCOPE_READ = 'https://www.googleapis.com/auth/calendar.readonly';
const SCOPE_APP = 'https://www.googleapis.com/auth/calendar.app.created';
const REMINDER_CAL_NAME = 'Gwennou App — Rappels';
const SPORT_CAL_NAME = 'Gwennou App — Sport';
// Identifiant client OAuth de Gwennou App (public, sans valeur secrète) ; modifiable dans les Réglages.
const DEFAULT_CLIENT_ID = '49066473850-dtj7c832nvbsh4a6jn73cab995sq2rlq.apps.googleusercontent.com';

export const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');

function readToken() {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY)); } catch { return null; }
}

export const clientId = () => get().settings.google.clientId || DEFAULT_CLIENT_ID;
export const isConfigured = () => !!clientId();
export const tokenValid = () => { const t = readToken(); return !!t && Date.now() < t.exp; };
export const hasCache = () => !!readCache();
// Jeton valide et autorisation de gérer l'agenda des rappels.
// État du rappel d'une tâche : 'sent' (envoyé à Google), 'pending' (pas encore envoyé), 'past', ou null.
export function reminderState(t) {
  if (!wantsReminder(t)) return null;
  if (t.gcal && t.gcal.sig === signature(t)) return 'sent';
  return reminderDate(t) <= new Date() && !t.gcal ? 'past' : 'pending';
}
export const remindersReady = () => tokenValid() && (readToken().scope || '').includes(SCOPE_APP);

export function connect(returnTo = location.hash || '#/accueil') {
  const state = `gcal-${uid()}`;
  localStorage.setItem(STATE_KEY, JSON.stringify({ state, returnTo }));
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: `${SCOPE_READ} ${SCOPE_APP}`,
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
    scope: p.get('scope') || '',
    exp: Date.now() + (Number(p.get('expires_in') || 3600) - 60) * 1000,
  }));
  return (p.get('scope') || '').includes(SCOPE_APP)
    ? 'Google Agenda connecté'
    : 'Google Agenda connecté, mais sans les rappels : cochez l\'autorisation des agendas secondaires.';
}

export function disconnect() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CACHE_KEY);
  get().settings.google.calendars = {};
  commit();
}

async function api(path, { method = 'GET', body } = {}) {
  const t = readToken();
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${t?.access}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    throw new Error('Session Google expirée');
  }
  if (res.status === 204) return null;
  if (!res.ok) {
    const err = new Error(`Google Agenda : erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}

export const lastFetch = () => readCache()?.fetchedAt || null;

// Télécharge les agendas puis les rendez-vous de J-7 à J+90.
export async function refresh() {
  if (!tokenValid()) return false;
  const g = get().settings.google;
  const list = await api('/users/me/calendarList?minAccessRole=reader');
  const fresh = {};
  for (const c of list.items) {
    // Les agendas créés par l'application doublonneraient les tâches et séances : ils ne sont pas affichés.
    if ([g.reminderCalId, g.sportCalId].includes(c.id) || [REMINDER_CAL_NAME, SPORT_CAL_NAME].includes(c.summary)) continue;
    const prev = g.calendars[c.id];
    fresh[c.id] = {
      name: c.summaryOverride || c.summary,
      color: prev?.customColor || c.backgroundColor || '#7D9A7E',
      customColor: prev?.customColor || null,
      show: prev ? prev.show : c.selected !== false,
      primary: !!c.primary,
    };
  }
  g.calendars = fresh;

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

// ---------- Envoi vers Google : rappels des tâches et séances de sport ----------
// Chaque élément envoyé garde { id, calId, sig } dans .gcal ; sig change quand il faut le mettre à jour.

const wantsReminder = (t) => !t.done && !!t.due && !!t.reminder;
const signature = (t) => [t.title, t.due, t.reminder, t.notes || '', t.area, t.formationId || ''].join('|');
const reminderDate = (t) => new Date(`${t.due}T${t.reminder}:00`);
const isGone = (e) => e.status === 404 || e.status === 410;
const tz = () => timezone();
const localDateTime = (d) => ({ dateTime: `${ymd(d)}T${hm(d)}:00`, timeZone: tz() });

function reminderBody(t) {
  const start = reminderDate(t);
  return {
    summary: `${t.area === 'isp' ? `${findFormation(t.formationId)?.name || 'ISP'} · ` : ''}${t.title}`,
    description: [t.notes, 'Rappel créé par Gwennou App.'].filter(Boolean).join('\n\n'),
    start: localDateTime(start),
    end: localDateTime(new Date(start.getTime() + 15 * 60000)),
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
    transparency: 'transparent',
  };
}

const sessionSig = (x) => [x.date, x.time, x.type, x.title, x.details, x.distance, x.duration].join('|');

function sessionBody(x) {
  const km = x.distance != null ? `${String(x.distance).replace('.', ',')} km` : '';
  const min = x.duration != null ? `${x.duration} min` : '';
  const timing = x.time
    ? (() => {
      const start = new Date(`${x.date}T${x.time}:00`);
      return { start: localDateTime(start), end: localDateTime(new Date(start.getTime() + (x.duration || 60) * 60000)) };
    })()
    : { start: { date: x.date }, end: { date: addDays(x.date, 1) } };
  return {
    summary: `${x.type}${x.title ? ` · ${x.title}` : ''}`,
    description: [[km, min].filter(Boolean).join(' · '), x.details, 'Séance planifiée dans Gwennou App.'].filter(Boolean).join('\n\n'),
    ...timing,
    reminders: { useDefault: false, overrides: [] },
    transparency: 'transparent',
  };
}

// Les deux familles d'éléments envoyées dans leur propre agenda.
const KINDS = [
  {
    calKey: 'reminderCalId',
    calName: REMINDER_CAL_NAME,
    items: () => get().tasks,
    wants: wantsReminder,
    sig: signature,
    body: reminderBody,
    tooLate: (t) => reminderDate(t) <= new Date(), // heure déjà passée : inutile de créer le rappel
  },
  {
    calKey: 'sportCalId',
    calName: SPORT_CAL_NAME,
    items: () => get().sport.sessions,
    wants: () => true,
    sig: sessionSig,
    body: sessionBody,
    tooLate: (x) => x.date < addDays(today(), -14), // pas d'envoi rétroactif des vieilles séances
  },
];

// Nombre d'éléments (rappels, séances) pas encore envoyés à Google.
export function pendingReminders() {
  let n = get().gcalDeleted.length;
  for (const k of KINDS) {
    n += k.items().filter((x) => (k.wants(x)
      ? (x.gcal ? x.gcal.sig !== k.sig(x) : !k.tooLate(x))
      : !!x.gcal)).length;
  }
  return n;
}

async function ownCalendar(k) {
  const g = get().settings.google;
  if (!g[k.calKey]) {
    const cal = await api('/calendars', { method: 'POST', body: { summary: k.calName, timeZone: tz() } });
    g[k.calKey] = cal.id;
  }
  return g[k.calKey];
}

let running = null;
let timer = null;

export function requestReminderSync(delay = 1200) {
  if (!remindersReady()) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncReminders().catch(() => {}), delay);
}

export function syncReminders() {
  if (!running) running = doSyncReminders().finally(() => { running = null; });
  return running;
}

const path = (calId, id = '') => `/calendars/${encodeURIComponent(calId)}/events${id ? `/${encodeURIComponent(id)}` : ''}`;
const del = (calId, id) => api(path(calId, id), { method: 'DELETE' }).catch((e) => { if (!isGone(e)) throw e; });

async function syncKind(k) {
  const g = get().settings.google;
  try {
    const calId = await ownCalendar(k);
    for (const x of k.items()) {
      if (!k.wants(x)) {
        if (x.gcal) { await del(x.gcal.calId, x.gcal.id); x.gcal = null; }
        continue;
      }
      if (x.gcal?.sig === k.sig(x)) continue;
      if (!x.gcal && k.tooLate(x)) continue;
      let target = x.gcal?.calId;
      let ev = x.gcal
        ? await api(path(target, x.gcal.id), { method: 'PUT', body: k.body(x) })
          .catch((e) => { if (isGone(e)) return null; throw e; })
        : null;
      if (!ev) {
        target = calId;
        ev = await api(path(calId), { method: 'POST', body: k.body(x) });
      }
      x.gcal = { id: ev.id, calId: target, sig: k.sig(x) };
    }
  } catch (e) {
    if (e.status === 404) {
      // L'agenda a été supprimé dans Google : il sera recréé au prochain envoi.
      g[k.calKey] = null;
      k.items().forEach((x) => { x.gcal = null; });
    }
    throw e;
  }
}

async function doSyncReminders() {
  if (!remindersReady()) return;
  const s = get();
  const g = s.settings.google;
  try {
    for (const d of [...s.gcalDeleted]) {
      await del(d.calId, d.id);
      s.gcalDeleted = s.gcalDeleted.filter((x) => x !== d);
    }
    for (const k of KINDS) await syncKind(k);
    g.reminderError = null;
  } catch (e) {
    g.reminderError = e.status === 403 ? 'Autorisation manquante : reconnectez Google' : e.message;
  }
  commit();
}
