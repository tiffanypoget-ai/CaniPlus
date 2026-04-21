// supabase/functions/create-product-checkout/index.ts
// Crée une session de paiement Stripe one-shot pour l'achat d'un produit numérique
// (guide PDF, pack de fiches, ebook) depuis la boutique CaniPlus.
//
// Flux :
//   1. Le front envoie { user_id, user_email, product_id } (ou product_slug)
//   2. La fonction vérifie que le produit existe et est publié
//   3. Elle vérifie qu'il n'y a pas déjà un achat payé (évite double paiement)
//   4. Elle crée une ligne user_purchases status='pending'
//   5. Elle crée la session Stripe (mode: 'payment') et retourne l'URL
//   6. Le webhook stripe-webhook marquera user_purchases.status='paid' à confirmation

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

    const { user_id, user_email, product_id, product_slug } = await req.json();

    if (!user_id || (!product_id && !product_slug)) {
      throw new Error('Paramètres manquants : user_id, product_id ou product_slug');
    }

    // ── 1. Récupérer le produit ───────────────────────────────────────────────
    let query = supabase.from('digital_products').select('*').eq('is_published', true);
    if (product_id) query = query.eq('id', product_id);
    else query = query.eq('slug', product_slug);

    const { data: product, error: productErr } = await query.maybeSingle();
    if (productErr || !product) throw new Error('Produit introuvable ou non publié');

    // ── 2. Vérifier qu'il n'y a pas déjà un achat payé ────────────────────────
    const { data: existing } = await supabase
      .from('user_purchases')
      .select('id, status')
      .eq('user_id', user_id)
      .eq('product_id', product.id)
      .maybeSingle();

    if (existing?.status === 'paid') {
      throw new Error('Tu as déjà acheté ce produit. Retrouve-le dans Mes achats.');
    }

    // ── 3. Créer (ou récupérer) l'entrée user_purchases status='pending' ──────
    let purchaseId = existing?.id;
    if (!purchaseId) {
      const { data: newPurchase, error: insertErr } = await supabase
        .from('user_purchases')
        .insert({
          user_id,
          product_id: product.id,
          amount_chf: product.price_chf,
          status: 'pending',
        })
        .select('id')
        .single();
      if (insertErr) throw insertErr;
      purchaseId = newPurchase.id;
    }

    // ── 4. Créer la session Stripe ────────────────────────────────────────────
    const appUrl = Deno.env.get('APP_URL') ?? 'https://cani-plus.vercel.app';
    const amountCents = Math.round(Number(product.price_chf) * 100);

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
      success_url: `${appUrl}?payment=success&purchase=product&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}?payment=cancelled&purchase=product`,
      client_reference_id: user_id,
      customer_email: user_email ?? undefined,
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
