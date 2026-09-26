// AI-Receptions service worker - offline shell for the PWA surfaces.
// Strategy: network-first (prices, slots and chat must stay live), falling
// back to the precached offline shell when the network is unreachable.
const CACHE_NAME = 'ai-receptions-v2';
const OFFLINE_URL = '/';
const urlsToCache = ['/', '/ask', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // Each URL is cached independently: one failure (e.g. an env-less deploy)
      // must never abort the whole install.
      .then((cache) => Promise.all(urlsToCache.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

/** Documents fall back to the precached shell when the network is unreachable. */
async function offlineFallback(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const shell = await caches.match(OFFLINE_URL);
  if (shell) return shell;
  return new Response('أنت غير متصل بالإنترنت حاليًا.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Same-origin only: never intercept API calls, Supabase or third-party CDNs.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Runtime-cache same-origin page/asset responses for offline fallback.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(() => offlineFallback(request))
  );
});