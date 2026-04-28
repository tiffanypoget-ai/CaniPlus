// Service Worker CaniPlus — Cache réseau-first avec fallback hors ligne
const CACHE_NAME = 'caniplus-v4';

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

// ── Push web : réception et affichage des notifications poussées ────────────
// FCM/Apple/Mozilla envoient le push, le navigateur le déchiffre (via les
// VAPID keys), puis dispatch ici. Sans ce listener, le push arrive mais
// n'affiche rien (cause du silence avant le 28 avril 2026).
self.addEventListener('push', event => {
  let data = { title: 'CaniPlus', body: 'Nouvelle notification' };
  try {
    if (event.data) {
      const payload = event.data.json();
      data = { ...data, ...payload };
    }
  } catch (_e) {
    // payload non-JSON ou vide : on garde les valeurs par défaut
    try { if (event.data) data.body = event.data.text() || data.body; } catch (_e2) {}
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.tag || 'caniplus-notification',
    renotify: true,
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Quand l'utilisateur clique sur une notification, on focus l'app si elle est
// déjà ouverte ou on ouvre un nouvel onglet, sur l'URL fournie dans le push.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsList => {
      for (const client of clientsList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) { try { client.navigate(targetUrl); } catch (_e) {} }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
