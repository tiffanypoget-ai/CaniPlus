// supabase/functions/_shared/stripe-accounts.ts
// Choix du compte Stripe selon l'entité encaissante. Sorti de create-checkout
// (v42) pour que toute fonction qui encaisse pour le club passe par le même
// routage, sans en réécrire un second.
//
// CLUB (association) : cours collectifs, cotisations annuelles, rallye canin.
// RI (Tiffany) : tout le reste. Si la clé club manque, on lève une erreur
// explicite plutôt que d'encaisser par erreur sur le mauvais compte.

import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno';

export const CLUB_TYPES = new Set(['cours_collectif', 'cotisation_annuelle', 'rallye']);

export function stripeFor(type: string): Stripe {
  const isClub = CLUB_TYPES.has(type);
  const key = isClub
    ? Deno.env.get('STRIPE_SECRET_KEY_CLUB')
    : Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) {
    throw new Error(isClub
      ? 'Clé Stripe du club manquante (STRIPE_SECRET_KEY_CLUB). Paiement non créé pour éviter un encaissement sur le mauvais compte.'
      : 'Clé Stripe (RI) manquante (STRIPE_SECRET_KEY).');
  }
  return new Stripe(key, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  });
}
