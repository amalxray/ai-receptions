// سنّي service worker — offline shell for the /ask PWA surfaces.
// Strategy: network-first for everything (live content matters), falling back
// to the precached shell when the network is unreachable (offline).
const CACHE_NAME = 'sanni-v1';
const urlsToCache = ['/ask', '/ask/articles', '/ask/stories', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never cache API calls or Supabase traffic.
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Runtime-cache same-origin page/asset responses for offline fallback.
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match('/ask')))
  );
});