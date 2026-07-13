// supabase/functions/claim-defi-reward/index.ts
// Active la récompense d'un défi terminé : 1 mois de premium OFFERT (abonnement
// Stripe RI avec essai de 30 jours), puis bascule automatique à 10 CHF/mois.
//
// Le parcours premium payant existant (create-checkout, type premium_mensuel)
// n'est PAS touché : cette fonction est réservée à la sortie de défi.
//
// Sécurité / règles :
//   - Identité prise dans le JWT (header Authorization), PAS dans le body.
//   - Le défi doit être réellement terminé (completed_at posé) et avoir duré
//     au moins duree_jours - 1 jours (déblocage quotidien → impossible de tout
//     valider d'un coup, même via l'API).
//   - Mois offert réservé aux personnes qui n'ont JAMAIS été abonnées premium
//     (profiles.premium_until et stripe_customer_id vides). Une fois le trial
//     activé, stripe_customer_id est posé par le webhook → irréclamable une
//     deuxième fois, même sur un autre défi.
//   - metadata.type = 'premium_mensuel' : le webhook stripe-webhook déployé
//     (v42) gère déjà ce type — premium_until = fin de la période courante
//     (= fin du trial), renouvellements, résiliation. Aucune modification.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TRIAL_DAYS = 30;
const PREMIUM_PRICE_CHF = 1000; // CHF 10.00 (en centimes) — même tarif que create-checkout

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── 0. Identifier l'utilisateur depuis son JWT ────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      throw new Error('Connecte-toi pour activer ta récompense.');
    }
    const userId = userData.user.id;

    const { defi_id } = await req.json();
    if (!defi_id) throw new Error('Paramètre manquant : defi_id');

    // ── 1. Le défi existe et offre bien un mois de premium ────────────────────
    const { data: defi, error: defiErr } = await supabase
      .from('defis')
      .select('id, titre, duree_jours, recompense_type')
      .eq('id', defi_id)
      .maybeSingle();
    if (defiErr || !defi) throw new Error('Défi introuvable');
    if (defi.recompense_type !== 'premium_trial_30j') {
      throw new Error('Ce défi ne donne pas droit au mois offert.');
    }

    // ── 2. Le défi est réellement terminé, sur la vraie durée ─────────────────
    const { data: prog, error: progErr } = await supabase
      .from('defi_progression')
      .select('id, started_at, completed_at')
      .eq('user_id', userId)
      .eq('defi_id', defi_id)
      .maybeSingle();
    if (progErr) throw progErr;
    if (!prog?.completed_at) {
      throw new Error('Termine d’abord le défi pour débloquer ta récompense !');
    }
    const elapsedDays =
      (new Date(prog.completed_at).getTime() - new Date(prog.started_at).getTime()) / 86400000;
    // Déblocage quotidien : un défi de 7 jours prend au minimum 6 jours pleins.
    if (elapsedDays < defi.duree_jours - 1.5) {
      throw new Error('La progression de ce défi n’est pas valide.');
    }

    // ── 3. Réservé aux personnes qui n'ont jamais été abonnées ────────────────
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('email, premium_until, stripe_customer_id')
      .eq('id', userId)
      .single();
    if (profErr || !profile) throw new Error('Profil introuvable');
    if (profile.premium_until || profile.stripe_customer_id) {
      throw new Error(
        'Le mois offert est réservé aux personnes qui n’ont jamais été abonnées au premium.',
      );
    }

    // ── 4. Créer la session Stripe : 30 jours offerts, puis 10 CHF/mois ──────
    // La carte est enregistrée à l'activation (comportement par défaut de
    // Checkout en mode subscription), le premier prélèvement part à la fin de
    // l'essai. Stripe affiche ses mentions d'essai natives sur la page de
    // paiement, en plus de l'écran de conformité affiché dans l'app.
    const appUrl = Deno.env.get('APP_URL') ?? 'https://app.caniplus.ch';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'chf',
            product_data: {
              name: 'CaniPlus Premium',
              description: `1 mois offert — récompense du défi « ${defi.titre} », puis CHF 10/mois`,
            },
            recurring: { interval: 'month' },
            unit_amount: PREMIUM_PRICE_CHF,
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { user_id: userId, source: 'defi_reward', defi_id },
      },
      success_url: `${appUrl}?payment=success&type=premium_trial&defi=${encodeURIComponent(defi_id)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}?payment=cancelled&type=premium_trial`,
      client_reference_id: userId,
      customer_email: profile.email ?? undefined,
      // type=premium_mensuel : reconnu tel quel par le webhook déployé.
      metadata: { user_id: userId, type: 'premium_mensuel', source: 'defi_reward', defi_id },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const message = (err as any)?.message ?? String(err) ?? 'Erreur inconnue';
    console.error('claim-defi-reward error:', JSON.stringify(err));
    return new Response(
      JSON.stringify({ error: message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
