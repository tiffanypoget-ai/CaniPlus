// supabase/functions/get-product-download/index.ts
// Génère une URL de téléchargement signée (1h de validité) pour un produit
// numérique acheté. Vérifie que l'utilisateur a bien payé le produit.
//
// Flux :
//   1. Le front appelle cette fonction avec { user_id, product_id }
//   2. La fonction vérifie dans user_purchases que status='paid' pour ce couple
//   3. Elle récupère le file_path du produit
//   4. Elle crée une URL signée Storage valable 1h
//   5. Elle retourne l'URL au front qui déclenche le téléchargement

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SIGNED_URL_DURATION_SECONDS = 3600; // 1 heure

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { user_id, product_id } = await req.json();

    if (!user_id || !product_id) {
      throw new Error('Paramètres manquants : user_id et product_id');
    }

    // ── 1. Vérifier l'achat (status='paid') ───────────────────────────────────
    const { data: purchase, error: purchaseErr } = await supabase
      .from('user_purchases')
      .select('id, status')
      .eq('user_id', user_id)
      .eq('product_id', product_id)
      .eq('status', 'paid')
      .maybeSingle();

    if (purchaseErr) throw purchaseErr;
    if (!purchase) {
      throw new Error("Tu n'as pas acheté ce produit. Rends-toi dans la boutique pour l'obtenir.");
    }

    // ── 2. Récupérer le file_path du produit ──────────────────────────────────
    const { data: product, error: productErr } = await supabase
      .from('digital_products')
      .select('file_path, title')
      .eq('id', product_id)
      .single();

    if (productErr || !product) throw new Error('Produit introuvable');

    // ── 3. Générer l'URL signée ───────────────────────────────────────────────
    const { data: signed, error: signedErr } = await supabase
      .storage
      .from('digital-products')
      .createSignedUrl(product.file_path, SIGNED_URL_DURATION_SECONDS, {
        download: product.file_path.split('/').pop() || 'guide-caniplus.pdf',
      });

    if (signedErr || !signed) throw new Error('Impossible de générer le lien de téléchargement');

    return new Response(
      JSON.stringify({
        url: signed.signedUrl,
        expires_in: SIGNED_URL_DURATION_SECONDS,
        title: product.title,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const message = (err as any)?.message ?? String(err) ?? 'Erreur inconnue';
    console.error('get-product-download error:', JSON.stringify(err));
    return new Response(
      JSON.stringify({ error: message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
