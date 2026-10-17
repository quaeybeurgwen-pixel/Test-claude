// Synchronisation avec Microsoft To Do via Microsoft Graph.
// Connexion OAuth « code + PKCE » sans serveur : l'application doit être déclarée
// comme « Application monopage (SPA) » dans le portail Microsoft (voir GUIDE.md).
import { get, commit } from '../store.js';
import { uid, ymd, hm } from '../util.js';

const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'Tasks.ReadWrite offline_access';
const TOKEN_KEY = 'sauge.ms.token';
const PKCE_KEY = 'sauge.ms.pkce';

export const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function readToken() {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY)); } catch { return null; }
}

function storeToken(json) {
  const prev = readToken();
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    access: json.access_token,
    refresh: json.refresh_token || prev?.refresh,
    exp: Date.now() + (json.expires_in - 120) * 1000,
  }));
}

export const isConnected = () => !!readToken()?.refresh;
export const isConfigured = () => !!get().settings.ms.clientId;

export async function connect(returnTo = '#/reglages') {
  const { clientId } = get().settings.ms;
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = `ms-${uid()}`;
  localStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, returnTo }));
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  location.href = `${AUTH}/authorize?${p}`;
}

async function tokenRequest(params) {
  const res = await fetch(`${AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: get().settings.ms.clientId, scope: SCOPES, ...params }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || 'Connexion refusée');
  storeToken(json);
}

// Au retour de la page de connexion Microsoft : échange le code contre un jeton.
export async function handleRedirect() {
  const url = new URL(location.href);
  const state = url.searchParams.get('state');
  if (!state?.startsWith('ms-')) return null;
  const saved = JSON.parse(localStorage.getItem(PKCE_KEY) || '{}');
  localStorage.removeItem(PKCE_KEY);
  history.replaceState(null, '', location.pathname + (saved.returnTo || '#/reglages'));
  if (state !== saved.state) return 'Connexion Microsoft : réponse inattendue, réessayez.';
  const error = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (error) return `Connexion Microsoft impossible : ${error}`;
  try {
    await tokenRequest({
      grant_type: 'authorization_code',
      code: url.searchParams.get('code'),
      redirect_uri: redirectUri(),
      code_verifier: saved.verifier,
    });
    return 'Microsoft To Do connecté';
  } catch (e) {
    return `Connexion Microsoft impossible : ${e.message}`;
  }
}

async function accessToken() {
  const t = readToken();
  if (!t?.refresh) return null;
  if (t.access && Date.now() < t.exp) return t.access;
  try {
    await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh });
    return readToken().access;
  } catch {
    // Jeton expiré (24 h sans utilisation) : il faudra se reconnecter.
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

export function disconnect() {
  localStorage.removeItem(TOKEN_KEY);
  const ms = get().settings.ms;
  ms.lastSync = null;
  ms.lastError = null;
  for (const t of get().tasks) {
    t.ms = null;
    t.dirty = true;
  }
  get().msDeleted = [];
  commit();
}

async function graph(path, { method = 'GET', body } = {}) {
  const token = await accessToken();
  if (!token) throw new Error('Reconnectez Microsoft To Do dans les réglages');
  const res = await fetch(path.startsWith('http') ? path : GRAPH + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error?.message || `Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function all(path) {
  const out = [];
  let next = path;
  while (next) {
    const page = await graph(next);
    out.push(...page.value);
    next = page['@odata.nextLink'];
  }
  return out;
}

export const fetchLists = () => all('/me/todo/lists');
export const createList = (displayName) => graph('/me/todo/lists', { method: 'POST', body: { displayName } });

// --- Conversion tâche locale <-> tâche To Do ---

const IMPORTANCE = { haute: 'high', normale: 'normal', basse: 'low' };
const PRIORITY = { high: 'haute', normal: 'normale', low: 'basse' };

const utcIso = (d) => d.toISOString().slice(0, 19);
const fromGraphDate = (g) => (g?.dateTime ? new Date(g.dateTime.slice(0, 19) + (g.timeZone === 'UTC' ? 'Z' : '')) : null);

function toGraph(t) {
  // Échéance à midi UTC : le jour reste le même quel que soit le fuseau.
  const body = {
    title: t.title,
    importance: IMPORTANCE[t.priority] || 'normal',
    status: t.done ? 'completed' : 'notStarted',
    body: { content: t.notes || '', contentType: 'text' },
    dueDateTime: t.due ? { dateTime: `${t.due}T12:00:00`, timeZone: 'UTC' } : null,
    isReminderOn: !!(t.due && t.reminder && !t.done),
  };
  if (body.isReminderOn) {
    body.reminderDateTime = { dateTime: utcIso(new Date(`${t.due}T${t.reminder}:00`)), timeZone: 'UTC' };
  }
  return body;
}

function applyRemote(t, r, area) {
  const due = fromGraphDate(r.dueDateTime);
  const reminder = r.isReminderOn ? fromGraphDate(r.reminderDateTime) : null;
  Object.assign(t, {
    title: r.title || '(sans titre)',
    notes: r.body?.contentType === 'text' ? r.body.content || '' : t.notes || '',
    priority: PRIORITY[r.importance] || 'normale',
    done: r.status === 'completed',
    doneAt: r.status === 'completed' ? (t.doneAt || ymd(fromGraphDate(r.completedDateTime) || new Date())) : null,
    due: due ? ymd(due) : null,
    reminder: reminder ? hm(reminder) : null,
    area: t.area || area,
  });
  t.ms = { id: r.id, listId: t.ms?.listId, modified: r.lastModifiedDateTime };
}

// --- Synchronisation bidirectionnelle ---

let running = null;
let timer = null;

export function requestSync(delay = 1500) {
  if (!isConnected()) return;
  clearTimeout(timer);
  timer = setTimeout(() => sync().catch(() => {}), delay);
}

export function sync() {
  if (!running) running = doSync().finally(() => { running = null; });
  return running;
}

async function doSync() {
  const state = get();
  const ms = state.settings.ms;
  if (!isConnected() || !ms.listPerso) return;
  const listFor = (area) => (area === 'isp' && ms.listIsp ? ms.listIsp : ms.listPerso);
  try {
    // 1. Suppressions faites dans l'application.
    for (const d of [...state.msDeleted]) {
      await graph(`/me/todo/lists/${d.listId}/tasks/${d.id}`, { method: 'DELETE' })
        .catch((e) => { if (e.status !== 404) throw e; });
      state.msDeleted = state.msDeleted.filter((x) => x !== d);
    }

    // 2. Créations et modifications faites dans l'application.
    for (const t of state.tasks.filter((x) => x.dirty || !x.ms)) {
      const listId = listFor(t.area);
      if (t.ms && t.ms.listId !== listId) {
        await graph(`/me/todo/lists/${t.ms.listId}/tasks/${t.ms.id}`, { method: 'DELETE' }).catch(() => {});
        t.ms = null;
      }
      const r = t.ms
        ? await graph(`/me/todo/lists/${listId}/tasks/${t.ms.id}`, { method: 'PATCH', body: toGraph(t) })
          .catch((e) => { if (e.status === 404) return null; throw e; })
        : await graph(`/me/todo/lists/${listId}/tasks`, { method: 'POST', body: toGraph(t) });
      if (!r) {
        // Supprimée dans To Do entre-temps.
        state.tasks = state.tasks.filter((x) => x !== t);
        continue;
      }
      t.ms = { id: r.id, listId, modified: r.lastModifiedDateTime };
      t.dirty = false;
    }

    // 3. Récupération des tâches de To Do.
    const lists = [...new Set([ms.listPerso, ms.listIsp].filter(Boolean))];
    const cutoff = Date.now() - 14 * 86400000;
    for (const listId of lists) {
      const area = listId === ms.listIsp && listId !== ms.listPerso ? 'isp' : 'perso';
      const remote = await all(`/me/todo/lists/${listId}/tasks?$top=100`);
      const seen = new Set();
      for (const r of remote) {
        seen.add(r.id);
        let t = state.tasks.find((x) => x.ms?.id === r.id);
        if (!t) {
          const completedAt = fromGraphDate(r.completedDateTime);
          if (r.status === 'completed' && (!completedAt || completedAt.getTime() < cutoff)) continue;
          t = { id: uid(), area, createdAt: Date.now(), ms: { listId } };
          state.tasks.push(t);
        } else if (t.dirty || t.ms.modified === r.lastModifiedDateTime) {
          continue;
        }
        t.ms.listId = listId;
        applyRemote(t, r, area);
        t.dirty = false;
      }
      // Tâches supprimées dans To Do.
      state.tasks = state.tasks.filter((t) => t.ms?.listId !== listId || t.dirty || seen.has(t.ms.id));
    }
    ms.lastSync = new Date().toISOString();
    ms.lastError = null;
  } catch (e) {
    ms.lastError = e.message;
  }
  commit();
}
