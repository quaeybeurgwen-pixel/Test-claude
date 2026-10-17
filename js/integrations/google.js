// Google Agenda : lecture des agendas (avec leur couleur) et rappels des tâches.
// Les rappels sont des événements avec notification, placés dans un agenda dédié
// « Gwennou App — Rappels » que l'application crée et est seule à modifier.
// Connexion OAuth « jeton implicite » : pas de serveur ; le jeton dure 1 heure,
// les rendez-vous restent ensuite affichés depuis le cache jusqu'au prochain rafraîchissement.
import { get, commit } from '../store.js';
import { uid, ymd, hm, addDays, today, timezone } from '../util.js';

const TOKEN_KEY = 'sauge.google.token';
const STATE_KEY = 'sauge.google.state';
const CACHE_KEY = 'sauge.google.cache';
const API = 'https://www.googleapis.com/calendar/v3';
const SCOPE_READ = 'https://www.googleapis.com/auth/calendar.readonly';
const SCOPE_APP = 'https://www.googleapis.com/auth/calendar.app.created';
const REMINDER_CAL_NAME = 'Gwennou App — Rappels';
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
    // L'agenda des rappels doublonnerait les tâches : il n'est pas affiché.
    if (c.id === g.reminderCalId || c.summary === REMINDER_CAL_NAME) continue;
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

// ---------- Rappels des tâches ----------

const wantsReminder = (t) => !t.done && !!t.due && !!t.reminder;
const signature = (t) => [t.title, t.due, t.reminder, t.notes || '', t.area].join('|');
const reminderDate = (t) => new Date(`${t.due}T${t.reminder}:00`);
const isGone = (e) => e.status === 404 || e.status === 410;

// Nombre de rappels créés, modifiés ou supprimés pas encore envoyés à Google.
export function pendingReminders() {
  const s = get();
  return s.gcalDeleted.length + s.tasks.filter((t) => (wantsReminder(t)
    ? (t.gcal ? t.gcal.sig !== signature(t) : reminderDate(t) > new Date())
    : !!t.gcal)).length;
}

function eventBody(t) {
  const start = reminderDate(t);
  const end = new Date(start.getTime() + 15 * 60000);
  const tz = timezone();
  return {
    summary: `${t.area === 'isp' ? 'ISP · ' : ''}${t.title}`,
    description: [t.notes, 'Rappel créé par Gwennou App.'].filter(Boolean).join('\n\n'),
    start: { dateTime: `${ymd(start)}T${hm(start)}:00`, timeZone: tz },
    end: { dateTime: `${ymd(end)}T${hm(end)}:00`, timeZone: tz },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
    transparency: 'transparent',
  };
}

async function reminderCalendar() {
  const g = get().settings.google;
  if (!g.reminderCalId) {
    const cal = await api('/calendars', { method: 'POST', body: { summary: REMINDER_CAL_NAME, timeZone: timezone() } });
    g.reminderCalId = cal.id;
  }
  return g.reminderCalId;
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

async function doSyncReminders() {
  if (!remindersReady()) return;
  const s = get();
  const g = s.settings.google;
  const path = (calId, id = '') => `/calendars/${encodeURIComponent(calId)}/events${id ? `/${encodeURIComponent(id)}` : ''}`;
  try {
    const calId = await reminderCalendar();

    for (const d of [...s.gcalDeleted]) {
      await api(path(d.calId, d.id), { method: 'DELETE' }).catch((e) => { if (!isGone(e)) throw e; });
      s.gcalDeleted = s.gcalDeleted.filter((x) => x !== d);
    }

    for (const t of s.tasks) {
      if (!wantsReminder(t)) {
        if (t.gcal) {
          await api(path(t.gcal.calId, t.gcal.id), { method: 'DELETE' }).catch((e) => { if (!isGone(e)) throw e; });
          t.gcal = null;
        }
        continue;
      }
      if (t.gcal?.sig === signature(t)) continue;
      if (!t.gcal && reminderDate(t) <= new Date()) continue; // heure déjà passée
      let target = t.gcal?.calId;
      let ev = t.gcal
        ? await api(path(target, t.gcal.id), { method: 'PUT', body: eventBody(t) })
          .catch((e) => { if (isGone(e)) return null; throw e; })
        : null;
      if (!ev) {
        target = calId;
        ev = await api(path(calId), { method: 'POST', body: eventBody(t) });
      }
      t.gcal = { id: ev.id, calId: target, sig: signature(t) };
    }
    g.reminderError = null;
  } catch (e) {
    if (e.status === 404) {
      // L'agenda des rappels a été supprimé dans Google : il sera recréé.
      g.reminderCalId = null;
      s.tasks.forEach((t) => { t.gcal = null; });
      s.gcalDeleted = [];
    }
    g.reminderError = e.status === 403 ? 'Autorisation manquante : reconnectez Google' : e.message;
  }
  commit();
}
