// Service worker: the app works offline after the first visit.
// The build replaces the version with a hash of the app files, so a new build replaces the old cache.
const VERSION = '@VERSION@';
const SHELL = 'shell-' + VERSION;
// Every file of the app, listed by the build. All are same-origin: the app contacts no CDN.
const FILES = ['./', .../*@FILES@*/[]];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function fromNetwork(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const res = await (timeoutMs ? Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]) : fetch(req));
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Other origins (the sync server, the sign-in check) go straight to the network and are never cached.
  if (url.origin === self.location.origin) {
    // Pages and config: network first (short timeout) so updates and config changes arrive, cache when offline.
    if (req.mode === 'navigate') { e.respondWith(fromNetwork(req, SHELL, 3000).catch(() => caches.match('./index.html'))); return; }
    if (url.pathname.endsWith('/config.js')) { e.respondWith(fromNetwork(req, SHELL, 3000)); return; }
    e.respondWith(caches.match(req).then((hit) => hit || fromNetwork(req, SHELL)));
  }
});
