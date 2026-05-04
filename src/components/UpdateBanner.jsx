// src/components/UpdateBanner.jsx
// Banner persistant qui propose de recharger l'app quand une nouvelle version
// du service worker a été installée. Sans ça, les utilisateurs avec la PWA
// installée sur leur téléphone restaient sur l'ancienne version jusqu'à ce
// qu'ils ferment/rouvrent l'app — c'est-à-dire potentiellement jamais.
//
// Fonctionnement :
//   1. Au montage, on récupère la registration du SW (déjà enregistré ailleurs)
//   2. Si un worker en état "waiting" existe → MAJ déjà prête, on affiche
//   3. On écoute "updatefound" pour les MAJ qui arrivent en cours de session
//   4. Au clic "Mettre à jour" : postMessage SKIP_WAITING au worker en attente
//   5. Quand le nouveau worker prend le contrôle, on recharge la page

import { useEffect, useState } from 'react';
import Icon from './Icons';

export default function UpdateBanner() {
  // 2026-05-04 : désactivé. Le service worker fait maintenant `self.skipWaiting()`
  // automatiquement à chaque install (v9+), donc les utilisateurs reçoivent les
  // mises à jour SANS clic. Ce banner créait une boucle (auto-skip → reload →
  // nouveau check → banner réapparaît). On garde le composant pour un retour
  // possible mais on retourne null directement.
  return null;

  // eslint-disable-next-line no-unreachable
  const [waitingWorker, setWaitingWorker] = useState(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const trackInstalling = (worker) => {
      worker.addEventListener('statechange', () => {
        // Quand le nouveau worker est "installed" et qu'il y a déjà un controller actif,
        // c'est qu'une MAJ est prête à être activée
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          setWaitingWorker(worker);
        }
      });
    };

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;

      // Cas 1 : un SW est déjà en attente (l'utilisateur a chargé la page,
      // une MAJ est arrivée pendant qu'il était dessus mais il n'a pas rechargé)
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaitingWorker(reg.waiting);
      }

      // Cas 2 : un SW est en train de s'installer
      if (reg.installing) {
        trackInstalling(reg.installing);
      }

      // Cas 3 : une nouvelle install démarre plus tard
      reg.addEventListener('updatefound', () => {
        if (reg.installing) trackInstalling(reg.installing);
      });

      // Force un check tout de suite : si Tiffany vient de pusher pendant
      // que le user était hors de l'app, ça affiche le banner sans attendre.
      reg.update().catch(() => {});
    });

    // Re-check à chaque retour sur l'app (changement d'onglet, retour depuis
    // l'arrière-plan sur mobile). Très efficace pour les PWA installées.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) reg.update().catch(() => {});
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    // Polling régulier pour les sessions longues (5 min au lieu de 1h pour
    // que les notifs de mise à jour arrivent vite après un push).
    const interval = setInterval(() => {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) reg.update().catch(() => {});
      });
    }, 5 * 60 * 1000);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(interval);
    };
  }, []);

  const handleUpdate = () => {
    if (!waitingWorker) return;
    setUpdating(true);
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    // Le rechargement se fait via controllerchange — fallback timeout au cas où
    setTimeout(() => window.location.reload(), 3000);
  };

  if (!waitingWorker) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'calc(100% - 24px)',
      maxWidth: 410,
      background: 'linear-gradient(135deg, #2BABE1, #1a8bbf)',
      color: '#fff',
      borderRadius: 14,
      padding: '12px 14px',
      boxShadow: '0 8px 24px rgba(43,171,225,0.35)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      animation: 'slideUpFade 0.3s ease',
    }}>
      <Icon name="bell" size={20} color="#fff" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.3 }}>Nouvelle version disponible</div>
        <div style={{ fontSize: 11, opacity: 0.85, marginTop: 1 }}>Recharge pour profiter des dernières améliorations</div>
      </div>
      <button
        onClick={handleUpdate}
        disabled={updating}
        style={{
          padding: '8px 14px',
          background: '#fff',
          color: '#1a8bbf',
          border: 'none',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 800,
          cursor: updating ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          opacity: updating ? 0.7 : 1,
          flexShrink: 0,
        }}
      >
        {updating ? '…' : 'Mettre à jour'}
      </button>

      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translate(-50%, 16px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}
