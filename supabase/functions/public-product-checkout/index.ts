// supabase/functions/public-product-checkout/index.ts
// -----------------------------------------------------------------------------
// Crée une session de paiement Stripe Checkout pour un achat de guide depuis
// le site vitrine (caniplus.ch) — SANS authentification.
//
// L'acheteur tape son email + clique acheter. Après paiement, le webhook
// stripe-webhook lui envoie le PDF par email via Brevo.
//
// Depuis le 21.08.2026 ce chemin sert aussi aux soirées CaniPlus : le webhook
// détecte category='soiree' et délègue à soiree-emails, qui envoie le lien
// Zoom. Aucun compte n'est nécessaire pour s'inscrire ni pour participer.
//
// Flux :
//   1. Front (site vitrine) appelle avec { email, product_slug }
//   2. La fonction vérifie le produit
//   3. Crée user_purchases (user_id=NULL, guest_email=email, status='pending')
//   4. Crée la session Stripe Checkout avec customer_email préfilé
//   5. Metadata Stripe : type='product_purchase_guest', purchase_id, email
//   6. Retourne l'URL de checkout
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SITE_BASE_URL = 'https://caniplus.ch';

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

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

    const { email, product_slug, product_id } = await req.json();

    if (!email || !isValidEmail(String(email).trim())) {
      throw new Error('Adresse email invalide.');
    }
    if (!product_slug && !product_id) {
      throw new Error('Produit manquant.');
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // ── 1. Récupérer le produit ───────────────────────────────────────────────
    // Les soirées sont ouvertes au paiement invité depuis le 21.08.2026 : le
    // lien Zoom part par email, l'inscrit·e n'a pas besoin de compte. Obliger à
    // créer un compte avant de payer faisait perdre trop de monde en route.
    let query = supabase.from('digital_products').select('*')
      .eq('is_published', true);
    if (product_id) query = query.eq('id', product_id);
    else query = query.eq('slug', product_slug);

    const { data: product, error: productErr } = await query.maybeSingle();
    if (productErr || !product) throw new Error('Produit introuvable ou non publié.');

    const estSoiree = product.category === 'soiree';

    // ── 1bis. Soirées : annulée, déjà passée, ou complète ─────────────────────
    // Mêmes règles que create-product-checkout : la fonction est appelable
    // directement, la garde ne peut pas vivre uniquement dans la page.
    if (estSoiree) {
      if (product.event_cancelled) {
        throw new Error('Cette soirée est annulée, les inscriptions sont closes.');
      }
      if (product.event_date && new Date(product.event_date).getTime() + 3 * 3600 * 1000 < Date.now()) {
        throw new Error('Cette soirée a déjà eu lieu. Choisis une prochaine date dans le calendrier.');
      }

      const { data: places } = await supabase.rpc('soiree_places', { p_slug: product.slug });
      const etat = Array.isArray(places) ? places[0] : places;
      if (etat?.complet) {
        throw new Error('Cette soirée est complète. Choisis une prochaine date, ou écris-nous à info@caniplus.ch.');
      }

      // Éviter qu'une même personne paie deux fois la même soirée. Pour un
      // guide on laisse racheter (le PDF est simplement renvoyé) ; pour une
      // soirée, un second paiement n'apporte rien.
      const { data: dejaInscrit } = await supabase
        .from('user_purchases')
        .select('id')
        .eq('product_id', product.id)
        .eq('status', 'paid')
        .eq('guest_email', cleanEmail)
        .limit(1);
      if (dejaInscrit && dejaInscrit.length > 0) {
        throw new Error('Tu es déjà inscrit·e à cette soirée avec cette adresse. Le lien Zoom est dans ton email de confirmation.');
      }
    }

    // ── 2. Créer une nouvelle ligne user_purchases en pending ─────────────────
    // On ne déduplique pas par email : un invité peut racheter (sera renvoyé).
    const { data: newPurchase, error: insertErr } = await supabase
      .from('user_purchases')
      .insert({
        user_id: null,
        guest_email: cleanEmail,
        product_id: product.id,
        amount_chf: product.price_chf,
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertErr || !newPurchase) {
      console.error('public-product-checkout insert error:', insertErr);
      throw new Error('Impossible de créer la commande. Réessaie dans un instant.');
    }

    const purchaseId = newPurchase.id;

    // ── 3. Créer la session Stripe Checkout ───────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      // Ne PAS ajouter payment_method_types : le fixer ferait ignorer les
      // préférences du Dashboard Stripe et masquerait TWINT.
      // https://docs.stripe.com/payments/dashboard-payment-methods
      mode: 'payment',
      customer_email: cleanEmail,
      line_items: [
        {
          price_data: {
            currency: 'chf',
            unit_amount: Math.round(Number(product.price_chf) * 100),
            product_data: {
              name: estSoiree ? `Soirée CaniPlus — ${product.title}` : product.title,
              description: product.subtitle?.substring(0, 200) || undefined,
            },
          },
          quantity: 1,
        },
      ],
      success_url: estSoiree
        ? `${SITE_BASE_URL}/pages/soirees-caniplus?inscription=success`
        : `${SITE_BASE_URL}/?achat=success&product=${encodeURIComponent(product.slug)}#boutique`,
      cancel_url: estSoiree
        ? `${SITE_BASE_URL}/pages/soirees-caniplus?inscription=cancelled`
        : `${SITE_BASE_URL}/?achat=cancelled#boutique`,
      metadata: {
        type: 'product_purchase_guest',
        purchase_id: purchaseId,
        product_id: product.id,
        product_slug: product.slug,
        guest_email: cleanEmail,
      },
      // Limite la session à 30 minutes
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    // ── 4. Stocker le session_id sur la purchase pour faciliter le suivi ──────
    await supabase
      .from('user_purchases')
      .update({ stripe_session_id: session.id })
      .eq('id', purchaseId);

    return new Response(
      JSON.stringify({
        url: session.url,
        purchase_id: purchaseId,
        session_id: session.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const message = (err as any)?.message ?? String(err) ?? 'Erreur inconnue';
    console.error('public-product-checkout error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
