// supabase/functions/send-newsletter/index.ts
// -----------------------------------------------------------------------------
// Envoi d'une newsletter Brevo a tous les abonnes de la liste BREVO_LIST_ID,
// pour annoncer un nouvel article du blog CaniPlus.
//
// Utilise l'API Brevo emailCampaigns : cree une campagne avec un HTML simple
// (titre, excerpt, bouton CTA vers l'article) et la lance immediatement.
//
// Auth : admin_password (comme les autres actions admin Phase 2).
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BREVO_API_URL = 'https://api.brevo.com/v3';
const SITE_BASE_URL = 'https://caniplus.ch';
const SENDER_NAME = 'CaniPlus';
const SENDER_EMAIL = 'info@caniplus.ch';

function ok(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function fail(message: string, status = 400) { return ok({ error: message }, status); }

// Echappe les caracteres speciaux HTML (titres / excerpts venant de la base)
function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(article: {
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  read_time_min: number | null;
}): string {
  const url = `${SITE_BASE_URL}/blog/${article.slug}`;
  const cover = article.cover_image_url
    ? `<img src="${esc(article.cover_image_url)}" alt="" style="width:100%; max-width:560px; height:auto; border-radius:14px; margin: 0 auto 24px; display:block;" />`
    : '';
  const readTime = article.read_time_min
    ? `<span style="color:#9ca3af; font-size:13px;">${article.read_time_min} min de lecture</span>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(article.title)}</title>
</head>
<body style="margin:0; padding:0; background:#f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif; color:#1F1F20;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff;">

    <div style="padding: 32px 28px 16px; text-align: center; background: linear-gradient(135deg, #1F1F20, #2a3a4a); color: #ffffff;">
      <div style="font-family: 'Great Vibes', cursive, serif; font-size: 36px; line-height: 1;">CaniPlus</div>
      <div style="font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: #2BABE1; margin-top: 6px;">Nouvel article du blog</div>
    </div>

    <div style="padding: 32px 28px;">
      ${cover}
      <h1 style="font-family: Georgia, 'Playfair Display', serif; font-size: 26px; line-height: 1.3; margin: 0 0 12px; color: #1F1F20;">${esc(article.title)}</h1>
      ${readTime ? `<div style="margin-bottom: 16px;">${readTime}</div>` : ''}
      ${article.excerpt ? `<p style="font-size: 15px; line-height: 1.6; color: #374151; margin: 0 0 28px;">${esc(article.excerpt)}</p>` : ''}

      <div style="text-align: center; margin: 28px 0 8px;">
        <a href="${esc(url)}" style="display: inline-block; background: #2BABE1; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 700; font-size: 15px;">Lire l'article complet</a>
      </div>

      <p style="font-size: 13px; color: #6b7280; margin-top: 32px; text-align: center;">
        Tu re&ccedil;ois ce mail car tu es inscrit&middot;e &agrave; la newsletter CaniPlus.<br/>
        Pour te d&eacute;sinscrire, clique sur le lien tout en bas de ce mail.
      </p>
    </div>

    <div style="padding: 20px 28px; background: #1F1F20; color: #9ca3af; text-align: center; font-size: 12px;">
      CaniPlus &middot; &Eacute;ducation canine bienveillante &middot; Ballaigues (VD)<br/>
      <a href="${esc(SITE_BASE_URL)}" style="color: #2BABE1; text-decoration: none;">caniplus.ch</a>
    </div>
  </div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
  const listId = Number(Deno.env.get('BREVO_LIST_ID') ?? '0');
  if (!apiKey)  return fail('BREVO_API_KEY manquante', 500);
  if (!listId)  return fail('BREVO_LIST_ID manquante', 500);

  let body: any;
  try { body = await req.json(); } catch { return fail('Corps JSON invalide', 400); }

  const { admin_password, article_id, dry_run } = body ?? {};
  const expected = Deno.env.get('ADMIN_PASSWORD') ?? '';
  if (!admin_password || admin_password !== expected) return fail('Mot de passe incorrect', 401);
  if (!article_id) return fail('article_id manquant', 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Recupere l'article
  const { data: article, error } = await supabase
    .from('articles')
    .select('id, title, slug, excerpt, cover_image_url, read_time_min, published')
    .eq('id', article_id)
    .single();
  if (error) return fail(`Article introuvable : ${error.message}`, 404);
  if (!article) return fail('Article introuvable', 404);
  if (!article.published) return fail('Article non publie : on ne peut pas l\'envoyer en newsletter', 400);

  const subject = `Nouveau sur le blog : ${article.title}`;
  const htmlContent = buildHtml({
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    cover_image_url: article.cover_image_url,
    read_time_min: article.read_time_min,
  });

  if (dry_run) {
    return ok({
      dry_run: true,
      preview: { subject, html_length: htmlContent.length, article_url: `${SITE_BASE_URL}/blog/${article.slug}` },
    });
  }

  // 1. Creer la campagne Brevo
  const campaignRes = await fetch(`${BREVO_API_URL}/emailCampaigns`, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify({
      name: `Newsletter article : ${article.slug.slice(0, 60)}`,
      subject,
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      htmlContent,
      recipients: { listIds: [listId] },
      // Note : le champ "tag" n'est pas dispo sur le forfait Brevo gratuit.
      // On le reactivera quand on passera sur un forfait payant.
    }),
  });
  if (campaignRes.status !== 201) {
    let msg = `Brevo ${campaignRes.status}`;
    try { const j = await campaignRes.json(); if (j?.message) msg = j.message; } catch {}
    return fail(`Creation campagne impossible : ${msg}`, 502);
  }
  const campaign = await campaignRes.json();
  const campaignId = campaign?.id;
  if (!campaignId) return fail('Brevo n\'a pas renvoye d\'id de campagne', 502);

  // 2. Lancer immediatement
  const sendRes = await fetch(`${BREVO_API_URL}/emailCampaigns/${campaignId}/sendNow`, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'accept': 'application/json' },
  });
  if (sendRes.status !== 204) {
    let msg = `Brevo ${sendRes.status}`;
    try { const j = await sendRes.json(); if (j?.message) msg = j.message; } catch {}
    return fail(`Envoi campagne impossible : ${msg}`, 502);
  }

  return ok({
    success: true,
    campaign_id: campaignId,
    article_id: article.id,
    list_id: listId,
    subject,
  });
});
: article.id,
    list_id: listId,
    subject,
  });
});
