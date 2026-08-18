// supabase/functions/get-webinar-access/index.ts
// Donne accès au contenu d'une soirée CaniPlus (webinaire payant) à son acheteur :
// lien Zoom de la séance, PDF de support (URL signée 1h) et replay.
//
// Sécurité :
//   - L'identité vient du JWT Supabase (header Authorization envoyé par
//     supabase.functions.invoke), PAS du body : impossible de demander l'accès
//     d'un autre utilisateur.
//   - L'achat payé de CETTE soirée précise est vérifié dans user_purchases
//     (l'achat d'une soirée ne donne accès qu'à elle, pas aux autres).
//   - Les secrets (zoom_url, replay) vivent dans webinar_access, table sans
//     lecture publique, lue ici en service_role.
//   - Le replay cesse d'être servi passé replay_expires_at (7 jours inclus dans
//     le prix). La suppression de l'enregistrement côté Zoom reste manuelle.
//   - Un remboursement fait passer l'achat en 'refunded' : le filtre
//     status='paid' ci-dessous coupe alors l'accès au lien comme au replay.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SIGNED_URL_DURATION_SECONDS = 3600; // 1 heure, comme get-product-download

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── 0. Identifier l'utilisateur depuis son JWT ────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      throw new Error('Connecte-toi pour accéder à ta soirée.');
    }
    const userId = userData.user.id;

    const { product_id } = await req.json();
    if (!product_id) throw new Error('Paramètre manquant : product_id');

    // ── 1. Vérifier l'achat payé de CETTE soirée ──────────────────────────────
    const { data: purchase, error: purchaseErr } = await supabase
      .from('user_purchases')
      .select('id, status')
      .eq('user_id', userId)
      .eq('product_id', product_id)
      .eq('status', 'paid')
      .maybeSingle();

    if (purchaseErr) throw purchaseErr;
    if (!purchase) {
      throw new Error("Tu n'es pas inscrit·e à cette soirée. Réserve ta place pour y accéder.");
    }

    // ── 2. Récupérer la soirée ────────────────────────────────────────────────
    const { data: product, error: productErr } = await supabase
      .from('digital_products')
      .select('id, title, file_path, category, event_date, event_duration_min, event_cancelled')
      .eq('id', product_id)
      .eq('category', 'soiree')
      .maybeSingle();

    if (productErr || !product) throw new Error('Soirée introuvable');

    // ── 3. Secrets d'accès (Zoom + replay) ────────────────────────────────────
    const { data: access } = await supabase
      .from('webinar_access')
      .select('zoom_url, bunny_video_id, replay_url, replay_code, replay_expires_at')
      .eq('product_id', product_id)
      .maybeSingle();

    // ── 3bis. Replay : lien Zoom protégé par code, ou embed Bunny ────────────
    // Saison 1 : le replay est le lien de partage cloud Zoom, protégé par un
    // code — Bunny Stream n'est pas encore sécurisé. Les deux formes coexistent
    // ici, le lien Zoom étant prioritaire quand les deux sont renseignés :
    //   replay_url   → lien externe à ouvrir dans un onglet (Zoom)
    //   replay_embed → iframe intégrable dans l'app (Bunny)
    // Passé replay_expires_at, plus rien n'est renvoyé : le replay disparaît de
    // l'espace inscrit.
    const replayExpired = access?.replay_expires_at
      ? new Date(access.replay_expires_at).getTime() < Date.now()
      : false;

    let replayUrl: string | null = null;
    let replayEmbedUrl: string | null = null;
    if (!replayExpired) {
      const zoomReplay = access?.replay_url?.trim();
      if (zoomReplay) {
        replayUrl = zoomReplay;
      } else {
        // bunny_video_id accepte "librairieId/videoGuid" ou une URL d'embed
        // complète. On construit l'URL d'iframe Bunny Stream sinon.
        const bunnyId = access?.bunny_video_id?.trim();
        if (bunnyId) {
          replayEmbedUrl = bunnyId.startsWith('http')
            ? bunnyId
            : `https://iframe.mediadelivery.net/embed/${bunnyId}?autoplay=false&preload=false`;
        }
      }
    }

    // ── 4. PDF de support : URL signée temporaire (bucket privé) ─────────────
    let pdfUrl: string | null = null;
    if (product.file_path) {
      const { data: signed } = await supabase
        .storage
        .from('digital-products')
        .createSignedUrl(product.file_path, SIGNED_URL_DURATION_SECONDS, {
          download: product.file_path.split('/').pop() || 'support-soiree-caniplus.pdf',
        });
      pdfUrl = signed?.signedUrl ?? null;
    }

    return new Response(
      JSON.stringify({
        title: product.title,
        event_date: product.event_date,
        event_duration_min: product.event_duration_min,
        event_cancelled: product.event_cancelled ?? false,
        zoom_url: product.event_cancelled ? null : (access?.zoom_url ?? null),
        replay_url: replayUrl,
        replay_embed_url: replayEmbedUrl,
        // Le code n'accompagne que le lien Zoom (Bunny n'en utilise pas).
        replay_code: replayUrl ? (access?.replay_code ?? null) : null,
        replay_expires_at: (replayUrl || replayEmbedUrl) ? (access?.replay_expires_at ?? null) : null,
        replay_expired: replayExpired,
        pdf_url: pdfUrl,
        pdf_expires_in: pdfUrl ? SIGNED_URL_DURATION_SECONDS : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const message = (err as any)?.message ?? String(err) ?? 'Erreur inconnue';
    console.error('get-webinar-access error:', JSON.stringify(err));
    return new Response(
      JSON.stringify({ error: message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
