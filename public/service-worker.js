// Service worker CaniPlus : DERNIÈRE VERSION (coupure de l'app, novembre 2026).
//
// L'app app.caniplus.ch ferme : les membres passent par caniplus.ch/espace.
// Les téléphones qui ont installé l'app gardent l'ancien service worker et
// ses caches tant qu'on ne les remplace pas. Celui-ci prend sa place, vide
// tous les caches, se désinscrit, puis recharge les fenêtres ouvertes : la
// redirection de Vercel les envoie alors sur caniplus.ch/espace.
//
// Ne pas supprimer ce fichier tant que des téléphones peuvent avoir l'ancien
// service worker : il doit rester servi à la même adresse (exclu de la
// redirection dans vercel.json).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cles = await caches.keys();
    await Promise.all(cles.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    fenetres.forEach((f) => {
      try { f.navigate(f.url); } catch (_e) { /* fenêtre déjà fermée */ }
    });
  })());
});

// Plus aucune interception : tout passe par le réseau.
