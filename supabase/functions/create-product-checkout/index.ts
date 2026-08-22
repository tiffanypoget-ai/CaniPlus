// supabase/functions/create-product-checkout/index.ts
// Crée une session de paiement Stripe one-shot pour l'achat d'un produit numérique
// (guide PDF, pack de fiches, ebook, soirée/webinaire) depuis l'app CaniPlus.
//
// Entité : STRIPE_SECRET_KEY = compte Stripe de la raison individuelle. Les
// guides comme les soirées relèvent de la RI. Le compte du club a ses propres
// secrets (STRIPE_SECRET_KEY_CLUB) et son propre webhook (stripe-webhook-club) ;
// aucun encaissement de cette fonction ne doit y arriver.
//
// Flux :
//   1. Le front envoie { user_id, user_email, product_id } (ou product_slug),
//      et éventuellement promo_code (code promotionnel Stripe saisi dans l'app)
//   2. La fonction vérifie que le produit existe et est publié
//   3. Elle vérifie qu'il n'y a pas déjà un achat payé (évite double paiement)
//   4. Si un code promo est fourni : validation Stripe (actif, non expiré) +
//      règle maison « une seule utilisation par client » (refusé si un achat
//      payé de ce client porte déjà ce code)
//   5. Elle crée une ligne user_purchases status='pending'
//   6. Elle crée la session Stripe (mode: 'payment') et retourne l'URL.
//      Pour une soirée (category='soiree'), l'URL de retour porte
//      purchase=webinar pour ramener l'utilisateur vers l'onglet Apprendre.
//   7. Le webhook stripe-webhook marquera user_purchases.status='paid' à confirmation

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { user_id, user_email, product_id, product_slug, promo_code } = await req.json();

    if (!user_id || (!product_id && !product_slug)) {
      throw new Error('Paramètres manquants : user_id, product_id ou product_slug');
    }

    // ── 1. Récupérer le produit ───────────────────────────────────────────────
    let query = supabase.from('digital_products').select('*').eq('is_published', true);
    if (product_id) query = query.eq('id', product_id);
    else query = query.eq('slug', product_slug);

    const { data: product, error: productErr } = await query.maybeSingle();
    if (productErr || !product) throw new Error('Produit introuvable ou non publié');

    // ── 1bis. Soirées : refuser une séance annulée ou déjà passée ────────────
    // L'app grise déjà ces boutons, mais la règle doit tenir côté serveur :
    // l'edge function est appelable directement.
    if (product.category === 'soiree') {
      if (product.event_cancelled) {
        throw new Error('Cette soirée est annulée, les inscriptions sont closes.');
      }
      // Même tolérance que l'app : une soirée reste ouverte jusqu'à 3h après son
      // début, le temps que le live se termine.
      if (product.event_date && new Date(product.event_date).getTime() + 3 * 3600 * 1000 < Date.now()) {
        throw new Error("Cette soirée a déjà eu lieu. Retrouve les prochaines dates dans l'app !");
      }

      // Plafond de places (20 par défaut). Le décompte ne compte que les achats
      // réellement payés : une session Stripe abandonnée ne bloque pas de place.
      const { data: places } = await supabase.rpc('soiree_places', { p_slug: product.slug });
      const etat = Array.isArray(places) ? places[0] : places;
      if (etat?.complet) {
        throw new Error('Cette soirée est complète. Inscris-toi à la suivante, ou écris-nous à info@caniplus.ch.');
      }
    }

    // ── 2. Vérifier qu'il n'y a pas déjà un achat payé ────────────────────────
    const { data: existing } = await supabase
      .from('user_purchases')
      .select('id, status')
      .eq('user_id', user_id)
      .eq('product_id', product.id)
      .maybeSingle();

    if (existing?.status === 'paid') {
      throw new Error(
        product.category === 'soiree'
          ? 'Tu es déjà inscrit·e à cette soirée.'
          : 'Tu as déjà acheté ce produit. Retrouve-le dans Mes achats.',
      );
    }

    // ── 2bis. Code promo (promotion codes Stripe) ─────────────────────────────
    // Le code est créé/régénéré/expiré dans le dashboard Stripe. Ici on :
    //   a) applique la règle « une seule utilisation par client » (vérifiée en
    //      base : un achat payé de ce client porte-t-il déjà ce code ?)
    //   b) vérifie côté Stripe que le code existe, est actif et non expiré
    //   c) l'applique à la session via `discounts`
    let discounts: { promotion_code: string }[] | undefined;
    let promoCodeClean: string | null = null;
    if (promo_code && String(promo_code).trim()) {
      promoCodeClean = String(promo_code).trim().toUpperCase();

      const { data: usedBefore } = await supabase
        .from('user_purchases')
        .select('id')
        .eq('user_id', user_id)
        .eq('promo_code', promoCodeClean)
        .eq('status', 'paid')
        .limit(1);
      if (usedBefore?.length) {
        throw new Error('Tu as déjà utilisé ce code promo.');
      }

      const promoList = await stripe.promotionCodes.list({
        code: promoCodeClean,
        active: true,
        limit: 1,
      });
      const promo = promoList.data?.[0];
      if (!promo) throw new Error('Code promo invalide ou expiré.');
      if (promo.expires_at && promo.expires_at * 1000 < Date.now()) {
        throw new Error('Ce code promo a expiré.');
      }
      discounts = [{ promotion_code: promo.id }];
    }

    // ── 3. Créer (ou mettre à jour) l'entrée user_purchases status='pending' ──
    let purchaseId = existing?.id;
    if (!purchaseId) {
      const { data: newPurchase, error: insertErr } = await supabase
        .from('user_purchases')
        .insert({
          user_id,
          product_id: product.id,
          amount_chf: product.price_chf,
          status: 'pending',
          promo_code: promoCodeClean,
        })
        .select('id')
        .single();
      if (insertErr) throw insertErr;
      purchaseId = newPurchase.id;
    } else {
      // Achat pending réutilisé : synchroniser le code promo (saisi, changé ou retiré)
      await supabase
        .from('user_purchases')
        .update({ promo_code: promoCodeClean })
        .eq('id', purchaseId);
    }

    // ── 4. Créer la session Stripe ────────────────────────────────────────────
    const appUrl = Deno.env.get('APP_URL') ?? 'https://app.caniplus.ch';
    const amountCents = Math.round(Number(product.price_chf) * 100);
    // Les soirées (webinaires) ramènent vers l'onglet Apprendre, les guides vers la boutique
    const purchaseKind = product.category === 'soiree' ? 'webinar' : 'product';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'chf',
            product_data: {
              name: product.title,
              description: product.subtitle ?? product.description?.slice(0, 200) ?? undefined,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}?payment=success&purchase=${purchaseKind}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}?payment=cancelled&purchase=${purchaseKind}`,
      client_reference_id: user_id,
      customer_email: user_email ?? undefined,
      ...(discounts ? { discounts } : {}),
      metadata: {
        user_id,
        type: 'product_purchase',
        product_id: product.id,
        product_slug: product.slug,
        purchase_id: purchaseId,
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const message = (err as any)?.message ?? String(err) ?? 'Erreur inconnue';
    console.error('create-product-checkout error:', JSON.stringify(err));
    return new Response(
      JSON.stringify({ error: message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
