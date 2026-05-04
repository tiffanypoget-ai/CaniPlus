// Service Worker CaniPlus — Cache réseau-first avec fallback hors ligne
const CACHE_NAME = 'caniplus-v9';

// On ne pré-cache que la coquille de l'app (pas les fichiers hashés de Vite/CRA)
const SHELL_ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .catch(() => {})
  );
  // 2026-05-04 : skipWaiting auto. Avant on attendait le clic utilisateur sur
  // le banner "Mettre à jour", mais beaucoup ne le voyaient pas et restaient
  // sur une vieille version du SW (ex: Dan qui n'a jamais reçu de push à
  // cause du tag par défaut qui faisait écraser les notifs sur Android).
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

// Permet au frontend de déclencher l'activation de la nouvelle version du SW
// via window.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
  // LOG DIAGNOSTIC (à retirer une fois le push debuggé). Si on voit ce log
  // dans la console SW lors d'un envoi depuis admin, ça veut dire que Chrome
  // a réussi à déchiffrer. Si on ne voit RIEN, le déchiffrement a échoué et
  // Chrome jette le push en silence (probable bug encryptPushPayload).
  console.log('[SW push] reçu à', new Date().toISOString(), 'hasData:', !!event.data);
  if (event.data) {
    try { console.log('[SW push] data text:', event.data.text()); } catch (e) { console.log('[SW push] erreur text:', e.message); }
  }

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

  // IMPORTANT : chaque notif doit avoir un tag UNIQUE sinon Chrome Android
  // remplace silencieusement la précédente (sans biper/vibrer). Avant le
  // 2026-05-02 le tag par défaut était 'caniplus-notification' → toutes les
  // notifs s'écrasaient et seule la dernière reçue restait visible.
  const uniqueTag = data.tag || `caniplus-${data.kind || 'notif'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',     // grande icône à gauche
    badge: '/icons/icon-192.png',    // petit badge en haut Android
    image: data.image || undefined,  // image héro optionnelle (envoyée par le serveur)
    data: { url: data.url || '/' },
    tag: uniqueTag,
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],        // pattern de vibration Android (ms vibrer / pause / vibrer)
    silent: false,
    timestamp: Date.now(),
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
