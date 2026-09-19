/* Noam Nex V Music — offline service worker */
const V = 'nnv-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css', './js/store.js', './js/player.js', './js/ui.js', './js/tabbar.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-256.png', './icons/icon-512.png', './icons/icon-1024.png',
  './icons/icon-180.png', './icons/maskable-512.png', './icons/favicon.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) {
      // refresh in the background, serve instantly offline
      fetch(req).then(r => { if (r && r.ok) caches.open(V).then(c => c.put(req, r.clone())); }).catch(() => {});
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok) { const c = await caches.open(V); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      return (await caches.match('./index.html')) || new Response('offline', { status: 503 });
    }
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
