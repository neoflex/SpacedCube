// Service worker: the app works offline after the first visit.
// The build replaces the version with a hash of the app files, so a new build replaces the old cache.
const VERSION = '@VERSION@';
const SHELL = 'shell-' + VERSION;
const RUNTIME = 'runtime-v1';
const FILES = ['./', './index.html', './config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
const THREE = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })));
    // three.js is only needed for the 3D replay; fetch it now so the replay also works offline.
    try { const rt = await caches.open(RUNTIME); if (!(await rt.match(THREE))) await rt.add(new Request(THREE, { mode: 'no-cors' })); } catch (err) { /* offline at install: cached on first use */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function fromNetwork(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const res = await (timeoutMs ? Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]) : fetch(req));
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
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
  if (url.origin === self.location.origin) {
    // Pages and config: network first (short timeout) so updates and config changes arrive, cache when offline.
    if (req.mode === 'navigate') { e.respondWith(fromNetwork(req, SHELL, 3000).catch(() => caches.match('./index.html'))); return; }
    if (url.pathname.endsWith('/config.js')) { e.respondWith(fromNetwork(req, SHELL, 3000)); return; }
    e.respondWith(caches.match(req).then((hit) => hit || fromNetwork(req, SHELL)));
    return;
  }
  // Fonts and three.js never change at a given URL: cache first.
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(RUNTIME).then((c) => c.match(req)).then((hit) => hit || fromNetwork(req, RUNTIME)));
  }
  // Everything else (the sync server) goes straight to the network.
});
