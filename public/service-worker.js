// Service Worker CaniPlus — Cache réseau-first avec fallback hors ligne
const CACHE_NAME = 'caniplus-v2';

// On ne pré-cache que la coquille de l'app (pas les fichiers hashés de Vite/CRA)
const SHELL_ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Nettoyer les anciens caches
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;

  // Ne jamais cacher les requêtes API Supabase ou Stripe
  if (request.url.includes('supabase.co') || request.url.includes('stripe.com')) return;

  // Ne pas cacher les requêtes non-GET
  if (request.method !== 'GET') return;

  // Stratégie : réseau d'abord, cache en fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        // Mettre en cache les réponses valides (JS, CSS, images, polices)
        if (response.ok && (
          request.url.endsWith('.js') ||
          request.url.endsWith('.css') ||
          request.url.includes('/assets/') ||
          request.url.includes('/icons/') ||
          request.url.includes('/images/') ||
          request.url.includes('fonts.googleapis.com') ||
          request.url.includes('fonts.gstatic.com')
        )) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match('/index.html')))
  );
});
