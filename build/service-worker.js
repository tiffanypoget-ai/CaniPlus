// Service Worker CaniPlus - Cache pour mode hors ligne
const CACHE_NAME = 'caniplus-v1';
const STATIC_ASSETS = ['/', '/index.html', '/static/js/main.chunk.js', '/static/css/main.chunk.css'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', event => {
  if (event.request.url.includes('supabase.co')) return; // Ne pas cacher les requêtes API
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
