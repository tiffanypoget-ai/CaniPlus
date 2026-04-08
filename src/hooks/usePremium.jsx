// src/hooks/usePremium.js
// Vérifie si l'utilisateur a un abonnement premium actif (CHF 10/mois)

import { useAuth } from './useAuth';

export function usePremium() {
  const { profile } = useAuth();

  if (!profile) return { isPremium: false, premiumUntil: null, loading: true };

  const premiumUntil = profile.premium_until ? new Date(profile.premium_until) : null;
  const isPremium = premiumUntil ? premiumUntil > new Date() : false;

  return {
    isPremium,
    premiumUntil,
    loading: false,
    // Texte formaté ex: "actif jusqu'au 8 mai 2026"
    statusLabel: isPremium && premiumUntil
      ? `Actif jusqu'au ${premiumUntil.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : 'Non abonné',
  };
}
