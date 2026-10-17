// Point d'entrée : chargement des données, connexions, navigation.
import * as store from './store.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { ensureUnlocked } from './lock.js';
import * as google from './integrations/google.js';
import * as ms from './integrations/microsoft.js';
import * as home from './views/home.js';
import * as perso from './views/perso.js';
import * as isp from './views/isp.js';
import * as sport from './views/sport.js';
import * as finances from './views/finances.js';
import * as settings from './views/settings.js';

const routes = { accueil: home, perso, isp, sport, finances, reglages: settings };
const view = document.getElementById('view');
let lastRoute = '';

function render() {
  const [, name = 'accueil', sub, param] = location.hash.split('/');
  const mod = routes[name] || home;
  const route = `${name}/${sub || ''}`;

  // Conserve le champ actif et la position quand on redessine le même écran.
  const focusId = document.activeElement?.id;
  const sameRoute = route === lastRoute;
  const scroll = window.scrollY;

  const el = document.createElement('div');
  el.className = 'page';
  el.innerHTML = mod.render(sub, param);
  view.replaceChildren(el);
  mod.mount?.(el, sub, param);

  document.querySelectorAll('.tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === name);
    a.setAttribute('aria-current', a.dataset.tab === name ? 'page' : 'false');
  });
  if (sameRoute) {
    window.scrollTo(0, scroll);
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  } else {
    window.scrollTo(0, 0);
  }
  lastRoute = route;
}

async function boot() {
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
  store.load();

  // Retour des pages de connexion Google / Microsoft.
  const messages = [google.handleRedirect(), await ms.handleRedirect()].filter(Boolean);

  if (!location.hash || location.hash === '#') history.replaceState(null, '', '#/accueil');
  finances.generateRecurring();
  await ensureUnlocked();

  render();
  window.addEventListener('hashchange', render);
  store.onChange(render);
  messages.forEach((m) => toast(m));

  if (google.autoReconnect()) return;
  refreshIntegrations();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshIntegrations(); });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

let lastRefresh = 0;
function refreshIntegrations() {
  if (Date.now() - lastRefresh < 5 * 60 * 1000) return;
  lastRefresh = Date.now();
  if (google.autoReconnect()) return;
  if (google.tokenValid()) google.refresh().catch(() => {});
  google.requestReminderSync(300);
  if (ms.isConnected()) ms.requestSync(200);
}

boot();
