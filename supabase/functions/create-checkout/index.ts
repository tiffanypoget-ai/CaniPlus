// supabase/functions/create-checkout/index.ts
// Crée une session de paiement Stripe — paiement unique OU abonnement mensuel.
// v42 : double compte Stripe. Cours collectifs + cotisations → compte CLUB ;
// premium, produits, coaching, leçon privée → compte RI (clé historique).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Moyens de paiement : pilotés par le Dashboard Stripe ────────────────────
// Aucune session ci-dessous ne fixe `payment_method_types`. Dès qu'une session
// le fait, Stripe ignore les préférences du Dashboard et n'affiche QUE ce qui
// est listé — c'est ce qui cachait TWINT derrière « carte + Google Pay » jusqu'au
// 27.08.2026. Sans ce paramètre, chaque compte (RI et CLUB) décide de ses moyens
// de paiement dans Paramètres → Moyens de paiement, sans redéploiement.
// Deux règles à garder en tête pour TWINT :
//   · il n'apparaît qu'en `mode: 'payment'` (jamais en subscription ni setup) ;
//   · il disparaît dès qu'un `setup_future_usage` est posé au niveau session —
//     si un jour il faut enregistrer la carte, le mettre dans
//     `payment_method_options.card.setup_future_usage`.
// Doc : https://docs.stripe.com/payments/dashboard-payment-methods

// ─── Choix du compte Stripe selon l'entité encaissante ───────────────────
// CLUB (association) : cours collectifs + cotisations annuelles.
// RI (Tiffany) : tout le reste. Si la clé club manque, on lève une erreur
// explicite plutôt que d'encaisser par erreur sur le mauvais compte.
const CLUB_TYPES = new Set(['cours_collectif', 'cotisation_annuelle']);

function stripeFor(type: string): Stripe {
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

// ─── Bascule du tarif cotisation cours de groupe ─────────────────────────────
// CHF 150/an/chien jusqu'au 29 juin 2026, puis CHF 75/chien (nouvelles
// inscriptions en cours d'année) dès le 30 juin 2026. Montant calculé au
// moment du paiement. Barème 2027 (200/150/100 par foyer) : bascule technique
// à programmer le moment venu, sur décision de Tiffany.
const COTISATION_BASCULE = new Date('2026-06-30T00:00:00+02:00');
function cotisationCents(now = new Date()): number {
  return now >= COTISATION_BASCULE ? 7500 : 15000; // CHF 75.00 / CHF 150.00 (en centimes)
}

// ─── Paiements uniques (cotisation / leçon privée) ───────────────────────────
// cotisation_annuelle : CHF 150, puis CHF 75 dès le 30 juin 2026 (inclut 1 cours de groupe/semaine)
const ONE_TIME_CONFIG: Record<string, { amount: number; name: string; description: string }> = {
  cotisation_annuelle: {
    amount: 15000, // CHF 150.00 (en centimes) — remplacé dynamiquement par cotisationCents()
    name: 'Cotisation annuelle CaniPlus',
    description: '1 cours de groupe par semaine selon planning annuel · par chien',
  },
  lecon_privee: {
    amount: 6000, // CHF 60.00
    name: 'Leçon privée CaniPlus',
    description: 'Leçon individuelle avec un éducateur · CaniPlus Ballaigues',
  },
  cours_theorique: {
    amount: 5000, // CHF 50.00
    name: 'Cours théorique CaniPlus',
    description: 'Cours théorique · CaniPlus Ballaigues',
  },
};

// ─── Abonnement mensuel premium ──────────────────────────────────────────────
const PREMIUM_PRICE_CHF = 1000; // CHF 10.00 (en centimes)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const body = await req.json();
    const { type, user_id, user_email, subscription_id } = body;

    if (!type || !user_id) {
      throw new Error('Paramètres manquants : type, user_id');
    }

    // Sélection du compte Stripe (club ou RI) selon le type de paiement
    const stripe = stripeFor(type);

    const appUrl = Deno.env.get('APP_URL') ?? 'https://app.caniplus.ch';

    // ── CAS 1 : Abonnement mensuel premium (RI) ───────────────────────────
    // mode: 'subscription' → TWINT n'y apparaîtra pas (il ne supporte pas les
    // paiements récurrents). Comportement normal, ne pas chercher à le forcer.
    if (type === 'premium_mensuel') {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{
          price_data: {
            currency: 'chf',
            product_data: {
              name: 'CaniPlus Premium',
              description: 'Ressources, vidéos, documents · CaniPlus Ballaigues',
            },
            recurring: { interval: 'month' },
            unit_amount: PREMIUM_PRICE_CHF,
          },
          quantity: 1,
        }],
        success_url: `${appUrl}?payment=success&type=premium_mensuel&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${appUrl}?payment=cancelled`,
        client_reference_id: user_id,
        customer_email: user_email ?? undefined,
        metadata: { user_id, type: 'premium_mensuel' },
      });
      return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── CAS 2 : Paiement cours collectif (CLUB) ───────────────────────────
    if (type === 'cours_collectif') {
      const { course_id, course_title, amount, dog_ids } = body;
      if (!course_id || !amount) throw new Error('course_id et amount requis');

      const { data: existing } = await supabase
        .from('course_payments')
        .select('id, status')
        .eq('user_id', user_id)
        .eq('course_id', course_id)
        .maybeSingle();
      if (existing?.status === 'paid') throw new Error('Ce cours est déjà payé');

      let paymentId = existing?.id;
      if (!paymentId) {
        const { data: newPayment, error: insertErr } = await supabase
          .from('course_payments')
          .insert({ user_id, course_id, amount, status: 'pending' })
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        paymentId = newPayment.id;
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'chf',
            product_data: { name: course_title ?? 'Cours CaniPlus', description: 'Cours · CaniPlus Ballaigues' },
            unit_amount: amount * 100,
          },
          quantity: 1,
        }],
        success_url: `${appUrl}?payment=success&type=cours_collectif&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${appUrl}?payment=cancelled`,
        client_reference_id: user_id,
        customer_email: user_email ?? undefined,
        metadata: {
          user_id, type: 'cours_collectif', course_payment_id: paymentId, course_id,
          // Stripe metadata accepte uniquement strings — on sérialise les dog_ids en JSON
          dog_ids: Array.isArray(dog_ids) && dog_ids.length > 0 ? JSON.stringify(dog_ids) : '',
        },
      });
      return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── CAS 3 : Paiement unique (cotisation CLUB / leçon privée RI) ───────
    if (!subscription_id) {
      throw new Error('subscription_id requis pour les paiements uniques');
    }

    // Vérifier que l'abonnement appartient bien à cet utilisateur
    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscription_id)
      .eq('user_id', user_id)
      .single();
    if (subError || !sub) throw new Error('Abonnement introuvable');
    if (sub.status === 'paid') throw new Error('Cet abonnement est déjà payé');

    // ── Le créneau est-il encore à venir ? ────────────────────────────────
    // Sans ce test, l'API acceptait de créer une session Stripe pour un cours
    // dont la date était passée : l'app affichait « le cours n'a pas pu être
    // maintenu » et l'API vendait quand même le créneau. Le garde-fou côté
    // interface (PrivateLessonTracker) ne ferme que la porte de l'app.
    // lesson_date est un timestamptz, donc la comparaison est directe et sans
    // question de fuseau. Le seuil est le début du cours, comme dans l'app.
    if (sub.lesson_date) {
      const lessonMs = new Date(sub.lesson_date).getTime();
      if (!Number.isNaN(lessonMs) && lessonMs <= Date.now()) {
        throw new Error(
          "La date de ce cours est passée et le créneau a été libéré. Fais une nouvelle demande de cours privé.",
        );
      }
    }

    const config = ONE_TIME_CONFIG[type] ?? { amount: 5000, name: 'Paiement CaniPlus', description: 'CaniPlus · Ballaigues' };
    // Cotisation : montant selon la date du paiement (150 avant le 30 juin 2026, 75 après),
    // multiplié par le nombre de chiens transmis par l'app (validé serveur, 1 à 10).
    const unitAmount = type === 'cotisation_annuelle' ? cotisationCents() : config.amount;
    const quantity = type === 'cotisation_annuelle'
      ? Math.min(Math.max(parseInt(String(body.dogs_count ?? 1), 10) || 1, 1), 10)
      : 1;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'chf',
          product_data: { name: config.name, description: config.description },
          unit_amount: unitAmount,
        },
        quantity,
      }],
      success_url: `${appUrl}?payment=success&type=${encodeURIComponent(type)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}?payment=cancelled`,
      client_reference_id: user_id,
      customer_email: sub.user_email ?? user_email ?? undefined,
      metadata: { subscription_id, user_id, type },
    });
    return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    const message = (err as any)?.message ?? (err as any)?.details ?? (err as any)?.hint ?? String(err) ?? 'Erreur inconnue';
    console.error('create-checkout error:', JSON.stringify(err));
    // On retourne 200 pour que le client puisse lire data.error
    return new Response(JSON.stringify({ error: message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
