// src/hooks/usePushNotifications.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

const VAPID_PUBLIC_KEY = 'BPzDogj1Yt0zU_REZk5GNHZdCPNSfjAVNRgD7B0Azdwt6pxwyM4oLSQmiv0SehIsrhGQkkD3sQTa31tT8tc25dc';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function usePushNotifications() {
  const { profile } = useAuth();
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    // Check if already subscribed
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription()
    ).then(sub => {
      setSubscribed(!!sub);
    }).catch(() => {});
  }, [profile]);

  // subscribe : retourne { ok: true } ou { ok: false, error: 'message lisible' }
  const subscribe = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { ok: false, error: "Ce navigateur ne supporte pas les notifications push." };
    }
    if (!profile) {
      return { ok: false, error: "Tu n'es pas connectée à ton compte Supabase. Reconnecte-toi via la page de login (pas seulement le mot de passe admin)." };
    }
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;

      if (Notification.permission !== 'granted') {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result === 'denied') {
          return { ok: false, error: "Les notifications ont été bloquées. Autorise CaniPlus dans les paramètres de ton navigateur (icône cadenas dans la barre d'adresse)." };
        }
        if (result !== 'granted') {
          return { ok: false, error: "Permission refusée. Réessaie et clique sur Autoriser." };
        }
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const { data, error } = await supabase.functions.invoke('save-push-subscription', {
        body: { user_id: profile.id, subscription: sub.toJSON() },
      });
      if (error) {
        return { ok: false, error: `Erreur serveur (save-push-subscription) : ${error.message ?? error}` };
      }
      if (data?.error) {
        return { ok: false, error: `Erreur serveur : ${data.error}` };
      }

      setSubscribed(true);
      return { ok: true };
    } catch (e) {
      console.error('Push subscribe error:', e);
      return { ok: false, error: `${e.name ?? 'Erreur'} : ${e.message ?? String(e)}` };
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await supabase.functions.invoke('save-push-subscription', {
        body: { user_id: profile.id, action: 'unsubscribe' },
      });
      setSubscribed(false);
    } catch (e) {
      console.error('Push unsubscribe error:', e);
    } finally {
      setLoading(false);
    }
  };

  const supported = typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  return { supported, permission, subscribed, loading, subscribe, unsubscribe };
}
