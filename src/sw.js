// Service worker: the app works offline after the first visit.
// The page is always fetched from the network when online (revalidated, not from the browser's HTTP
// cache), and it loads code and styles at versioned addresses (file.js?v=<version>, see build.mjs),
// so opening the app runs the latest deploy. Those versioned files never change, so they are served
// from the cache. The build puts the same version here, so a new build replaces the offline copy.
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

// Network first, with a timeout so a very slow connection falls back to the offline copy.
// cache: 'no-cache' makes the browser ask the server (a cheap 304 when nothing changed) instead of
// reusing its HTTP cache, which GitHub Pages lets keep a file for 10 minutes after a deploy.
async function fromNetwork(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const net = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' });
    const res = await (timeoutMs ? Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]) : net);
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
    // The page and config: network first (short timeout), the cached copy when offline.
    if (req.mode === 'navigate') { e.respondWith(fromNetwork(req, SHELL, 4000).catch(() => caches.match('./index.html'))); return; }
    if (url.pathname.endsWith('/config.js')) { e.respondWith(fromNetwork(req, SHELL, 4000)); return; }
    // Everything else: versioned or unchanging files, from the cache, else the network.
    e.respondWith(caches.match(req).then((hit) => hit || fromNetwork(req, SHELL)));
  }
});
