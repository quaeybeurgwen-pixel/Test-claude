// Mise en cache de l'application pour l'ouvrir même sans réseau.
const CACHE = 'gwennou-app-v15';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/app.js', 'js/store.js', 'js/util.js', 'js/ui.js', 'js/icons.js', 'js/tasks.js', 'js/formations.js', 'js/quotes.js', 'js/lock.js',
  'js/integrations/google.js', 'js/integrations/microsoft.js',
  'js/views/home.js', 'js/views/perso.js', 'js/views/isp.js', 'js/views/sport.js', 'js/views/finances.js', 'js/views/settings.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' : ne pas reprendre les copies du cache HTTP (GitHub Pages les garde 10 minutes).
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Réseau d'abord, en revalidant toujours auprès du serveur (pour recevoir les mises à jour), cache si hors connexion.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Une requête de navigation ne peut pas être recopiée avec des options : on repart de son adresse.
  const fresh = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache' }) : fetch(req, { cache: 'no-cache' });
  e.respondWith(fresh
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })
    .catch(() => caches.match(req, { ignoreSearch: true })));
});
