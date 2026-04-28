// supabase/functions/weekly-newsletter/index.ts
// -----------------------------------------------------------------------------
// Newsletter hebdomadaire CaniPlus — envoyee tous les mercredis a 09h00 (CET/CEST).
//
// Agrege le contenu publie sur 7 jours glissants :
//   - 1 article blog (publie cette semaine)
//   - 1 ressource premium (publiee cette semaine)
//   - Cours collectifs des 7 prochains jours
//   - Conditionnel : nouveaux produits boutique
//   - Conditionnel : prochain evenement (rallye, sortie...)
//   - Conseil pratique court (genere par Claude a partir de l'article)
//
// Si toutes les sections sont vides : skip l'envoi (pas de mail vide).
//
// Auth : Bearer service role (appel par pg_cron) OU admin_password (test manuel).
//
// Variables d'env :
//   BREVO_API_KEY, BREVO_LIST_ID
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   ANTHROPIC_API_KEY (optionnel — sans, le conseil de la semaine est skip)
//   ADMIN_PASSWORD (pour tests manuels via UI admin)
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BREVO_API_URL = 'https://api.brevo.com/v3';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const SITE_BASE_URL = 'https://caniplus.ch';
const APP_BASE_URL = 'https://app.caniplus.ch';
const SENDER_NAME = 'CaniPlus';
const SENDER_EMAIL = 'info@caniplus.ch';
const LOGO_URL = `${SITE_BASE_URL}/images/newsletter/logo-caniplus.png`;

function ok(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function fail(message: string, status = 400) { return ok({ error: message }, status); }

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Format date FR : "samedi 3 mai" (sans annee, on est dans la semaine en cours)
function formatDateFr(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  } catch { return iso; }
}
// Format heure : "18h00"
function formatHourFr(iso: string): string {
  try {
    const d = new Date(iso);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}h${m}`;
  } catch { return ''; }
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
interface Article {
  id: string; slug: string; title: string; excerpt: string | null;
  cover_image_url: string | null; read_time_min: number | null; category: string | null;
}
interface Resource { id: string; title: string; description: string | null; type: string | null; category: string | null; }
interface Course { id: string; title: string; type: string; date_start: string; date_end: string | null; location: string | null; }
interface Product { id: string; slug: string; title: string; subtitle: string | null; price_chf: number; cover_image_url: string | null; }
interface EventRow { id: string; title: string; date_start: string; location: string | null; }

interface NewsletterData {
  article: Article | null;
  resource: Resource | null;
  courses: Course[];
  products: Product[];
  event: EventRow | null;
  tip: string | null;          // conseil genere par Claude (ou null si skip)
  weekLabel: string;           // ex: "Semaine du 28 avril 2026"
}

// -----------------------------------------------------------------------------
// Conseil de la semaine — genere via Claude a partir de l'article
// -----------------------------------------------------------------------------
async function generateTip(article: Article | null): Promise<string | null> {
  if (!article) return null;
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return null;

  const prompt = `Tu es Tiffany Cotting, educatrice canine bienveillante a Ballaigues.
A partir de l'article suivant, redige UN conseil pratique court (3 phrases maximum, ~50 mots) qu'on peut appliquer ce week-end.
Ton : tutoiement, chaleureux, concret. Pas de superlatifs, pas de tirets cadratin, pas de "il faut". Pas de regle de trois.

Titre : ${article.title}
Resume : ${article.excerpt ?? ''}

Reponds UNIQUEMENT avec le texte du conseil, sans introduction ni guillemets.`;

  try {
    const r = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const text = j?.content?.[0]?.text;
    if (typeof text !== 'string') return null;
    return text.trim();
  } catch { return null; }
}

// -----------------------------------------------------------------------------
// Recuperation des donnees
// -----------------------------------------------------------------------------
async function fetchData(supabase: any): Promise<NewsletterData> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // 1. Article de la semaine (le plus recent publie sur 7j)
  const { data: articles } = await supabase
    .from('articles')
    .select('id, slug, title, excerpt, cover_image_url, read_time_min, category')
    .eq('published', true)
    .gte('published_at', sevenDaysAgo)
    .order('published_at', { ascending: false })
    .limit(1);
  const article = (articles?.[0] as Article) ?? null;

  // 2. Ressource premium de la semaine
  const { data: resources } = await supabase
    .from('resources')
    .select('id, title, description, type, category')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(1);
  const resource = (resources?.[0] as Resource) ?? null;

  // 3. Tous les cours publics des 7 prochains jours (collectif + theorique)
  // On exclut 'prive' (info personnelle, pas a mettre en newsletter publique)
  // et 'evenement' (traite dans sa propre section ci-dessous).
  const { data: coursesData } = await supabase
    .from('courses')
    .select('id, title, date_start, date_end, location, type')
    .in('type', ['collectif', 'theorique'])
    .gte('date_start', nowIso)
    .lte('date_start', sevenDaysAhead)
    .order('date_start', { ascending: true });
  const courses: Course[] = (coursesData ?? []) as Course[];

  // 4. Nouveautes boutique
  const { data: productsData } = await supabase
    .from('digital_products')
    .select('id, slug, title, subtitle, price_chf, cover_image_url')
    .eq('is_published', true)
    .gte('created_at', sevenDaysAgo)
    .order('display_order', { ascending: true });
  const products: Product[] = (productsData ?? []) as Product[];

  // 5. Prochain evenement (type='evenement' avec date future)
  const { data: eventsData } = await supabase
    .from('courses')
    .select('id, title, date_start, location')
    .eq('type', 'evenement')
    .gte('date_start', nowIso)
    .order('date_start', { ascending: true })
    .limit(1);
  const event = (eventsData?.[0] as EventRow) ?? null;

  // 6. Conseil de la semaine (genere depuis l'article)
  const tip = await generateTip(article);

  // Label de semaine pour le sujet
  const today = new Date();
  const weekLabel = `Semaine du ${today.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  return { article, resource, courses, products, event, tip, weekLabel };
}

// -----------------------------------------------------------------------------
// Construction du HTML
// -----------------------------------------------------------------------------
function section(content: string): string { return content; }

function buildHtml(d: NewsletterData): string {
  const articleBlock = d.article ? `
    <tr>
      <td style="padding: 0 48px 32px 48px;">
        <p style="margin: 0 0 8px 0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:11px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#2BABE1;">Nouvel article du blog</p>
        ${d.article.cover_image_url ? `<img src="${esc(d.article.cover_image_url)}" alt="" width="504" style="display:block; width:100%; max-width:504px; height:auto; border-radius:12px; margin: 0 0 20px 0;" />` : ''}
        <h2 style="margin:0 0 12px 0; font-family:'Playfair Display', Georgia, serif; font-size:26px; line-height:1.2; font-weight:600; color:#1F1F20;">${esc(d.article.title)}</h2>
        ${d.article.excerpt ? `<p style="margin:0 0 16px 0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#374151;">${esc(d.article.excerpt)}</p>` : ''}
        ${d.article.read_time_min ? `<p style="margin:0 0 16px 0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:13px; color:#9CA3AF;">${d.article.read_time_min} min de lecture</p>` : ''}
        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="border-radius:8px; background-color:#2BABE1;" align="center">
              <a href="${SITE_BASE_URL}/blog/${esc(d.article.slug)}.html" style="display:inline-block; padding:12px 24px; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:14px; font-weight:600; color:#FFFFFF; text-decoration:none;">Lire l'article complet</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : '';

  const resourceBlock = d.resource ? `
    <tr>
      <td style="padding: 0 48px 32px 48px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F8F5F0; border-radius:12px;">
          <tr>
            <td style="padding: 24px;">
              <p style="margin:0 0 8px 0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:11px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#1E8DB8;">Premium &middot; reserve aux membres</p>
              <h3 style="margin:0 0 8px 0; font-family:'Playfair Display', Georgia, serif; font-size:20px; line-height:1.3; font-weight:500; color:#1F1F20;">${esc(d.resource.title)}</h3>
              ${d.resource.description ? `<p style="margin:0 0 14px 0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:14px; line-height:1.5; color:#374151;">${esc(d.resource.description)}</p>` : ''}
              <a href="${APP_BASE_URL}/ressources" style="font-family:'Inter',Helvetica,Arial,sans-serif; font-size:13px; font-weight:600; color:#1E8DB8; text-decoration:underline;">Acceder aux ressources premium &rarr;</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : '';

  const typeLabel = (t: string) => t === 'theorique' ? 'Theorique' : t === 'collectif' ? 'Collectif' : t;
  const coursesRows = d.courses.map(c => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB;" valign="top">
        <p style="margin:0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:12px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#6B7280;">${esc(formatDateFr(c.date_start))}</p>
        <p style="margin:4px 0 2px 0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:15px; font-weight:600; color:#1F1F20;">${esc(c.title || 'Cours')} <span style="display:inline-block; margin-left:6px; padding:2px 8px; font-size:11px; font-weight:600; letter-spacing:0.5px; color:#1E8DB8; background-color:#E8F6FC; border-radius:4px; vertical-align:middle;">${esc(typeLabel(c.type))}</span></p>
        <p style="margin:0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:13px; color:#6B7280;">${esc(formatHourFr(c.date_start))}${c.date_end ? ` &middot; ${esc(formatHourFr(c.date_end))}` : ''}${c.location ? ` &middot; ${esc(c.location)}` : ''}</p>
      </td>
    </tr>`).join('');

  const coursesBlock = d.courses.length > 0 ? `
    <tr>
      <td style="padding: 0 48px 32px 48px;">
        <p style="margin:0 0 16px 0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:11px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#2BABE1;">Cette semaine au club</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${coursesRows}</table>
        <a href="${APP_BASE_URL}/planning" style="display:inline-block; margin-top:14px; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:13px; font-weight:600; color:#1E8DB8; text-decoration:underline;">Voir tout le planning &rarr;</a>
      </td>
    </tr>` : '';

  const tipBlock = d.tip ? `
    <tr>
      <td style="padding: 0 48px 32px 48px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#E8F6FC; border-radius:12px;">
          <tr>
            <td style="padding: 22px 24px;">
              <p style="margin:0 0 10px 0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:11px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#1E8DB8;">Le conseil de la semaine</p>
              <p style="margin:0; font-family:'Playfair Display', Georgia, serif; font-style:italic; font-size:17px; line-height:1.5; color:#1F1F20;">${esc(d.tip)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : '';

  const productsRows = d.products.map(p => `
    <tr>
      <td style="padding: 8px 0;" valign="middle">
        ${p.cover_image_url ? `<img src="${esc(p.cover_image_url)}" alt="" width="60" style="display:inline-block; vertical-align:middle; width:60px; height:auto; border-radius:6px; margin-right:12px;" />` : ''}
        <span style="display:inline-block; vertical-align:middle;">
          <p style="margin:0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:14px; font-weight:600; color:#1F1F20;">${esc(p.title)}</p>
          ${p.subtitle ? `<p style="margin:2px 0 0 0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:12px; color:#6B7280;">${esc(p.subtitle)}</p>` : ''}
          <p style="margin:4px 0 0 0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:13px; font-weight:600; color:#2BABE1;">CHF ${Number(p.price_chf).toFixed(0)}</p>
        </span>
      </td>
    </tr>`).join('');

  const productsBlock = d.products.length > 0 ? `
    <tr>
      <td style="padding: 0 48px 32px 48px;">
        <p style="margin:0 0 14px 0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:11px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#2BABE1;">Nouveau dans la boutique</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${productsRows}</table>
        <a href="${SITE_BASE_URL}/#boutique" style="display:inline-block; margin-top:12px; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:13px; font-weight:600; color:#1E8DB8; text-decoration:underline;">Decouvrir la boutique &rarr;</a>
      </td>
    </tr>` : '';

  const eventBlock = d.event ? `
    <tr>
      <td style="padding: 0 48px 32px 48px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#1F1F20; border-radius:12px;">
          <tr>
            <td style="padding: 24px;">
              <p style="margin:0 0 8px 0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:11px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#2BABE1;">Prochain evenement</p>
              <h3 style="margin:0 0 6px 0; font-family:'Playfair Display', Georgia, serif; font-size:22px; line-height:1.2; font-weight:500; color:#FFFFFF;">${esc(d.event.title)}</h3>
              <p style="margin:0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:14px; color:#D1D5DB;">${esc(formatDateFr(d.event.date_start))} &middot; ${esc(formatHourFr(d.event.date_start))}${d.event.location ? ` &middot; ${esc(d.event.location)}` : ''}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CaniPlus &mdash; ${esc(d.weekLabel)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;1,400&display=swap" rel="stylesheet">
<style type="text/css">
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #F8F5F0; }
  a { color: #2BABE1; text-decoration: none; }
  @media screen and (max-width: 620px) {
    .px-mobile { padding-left: 24px !important; padding-right: 24px !important; }
    .h1-mobile { font-size: 28px !important; line-height: 1.2 !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#F8F5F0; font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#F8F5F0;">
  ${d.article ? esc(d.article.title) : 'Les nouveautes CaniPlus de la semaine'}, et ce qui se passe au club cette semaine.
</div>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F8F5F0;">
  <tr>
    <td align="center" style="padding: 32px 16px;">

      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; background-color:#FFFFFF; border-radius:16px; overflow:hidden;">

        <tr>
          <td class="px-mobile" style="padding: 32px 48px 20px 48px;" align="left">
            <img src="${LOGO_URL}" alt="CaniPlus" width="120" style="display:block; height:auto; max-width:120px;" />
          </td>
        </tr>

        <tr>
          <td class="px-mobile" style="padding: 0 48px;">
            <div style="height:2px; line-height:2px; font-size:0; background-color:#2BABE1;">&nbsp;</div>
          </td>
        </tr>

        <tr>
          <td class="px-mobile" style="padding: 32px 48px 24px 48px;">
            <p style="margin:0 0 12px 0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:12px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#6B7280;">${esc(d.weekLabel)}</p>
            <h1 class="h1-mobile" style="margin:0; font-family:'Playfair Display', Georgia, serif; font-size:36px; line-height:1.15; font-weight:500; color:#1F1F20; letter-spacing:-0.5px;">Tes nouveautes de la semaine</h1>
          </td>
        </tr>

        ${section(articleBlock)}
        ${section(resourceBlock)}
        ${section(tipBlock)}
        ${section(coursesBlock)}
        ${section(productsBlock)}
        ${section(eventBlock)}

        <tr>
          <td style="background-color:#1F1F20; padding: 28px 48px; text-align:center;">
            <p style="margin:0 0 8px 0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:13px; color:#D1D5DB;">CaniPlus &middot; Education canine bienveillante</p>
            <p style="margin:0 0 12px 0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:12px; color:#9CA3AF;">Ballaigues, canton de Vaud &middot; <a href="mailto:info@caniplus.ch" style="color:#2BABE1; text-decoration:none;">info@caniplus.ch</a></p>
            <p style="margin:0; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:11px; color:#9CA3AF;">
              Tu recois cet email car tu es inscrit&middot;e a la newsletter CaniPlus.<br>
              <a href="*|UNSUB|*" style="color:#9CA3AF; text-decoration:underline;">Se desinscrire</a>
            </p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`;
}

// -----------------------------------------------------------------------------
// Endpoint
// -----------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Auth : Bearer service role (pg_cron) OU admin_password (test manuel)
  const authHeader = req.headers.get('Authorization') ?? '';
  const expectedServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const expectedAdmin = Deno.env.get('ADMIN_PASSWORD') ?? '';
  let authorized = authHeader === `Bearer ${expectedServiceKey}`;
  let body: any = {};
  try { body = await req.json(); } catch {}
  const { admin_password, dry_run } = body ?? {};
  if (!authorized && admin_password && admin_password === expectedAdmin) authorized = true;
  if (!authorized) return fail('Non autorise', 401);

  const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
  const listId = Number(Deno.env.get('BREVO_LIST_ID') ?? '0');
  if (!apiKey)  return fail('BREVO_API_KEY manquante', 500);
  if (!listId)  return fail('BREVO_LIST_ID manquante', 500);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    expectedServiceKey,
  );

  const data = await fetchData(supabase);

  // Skip si rien a raconter (pas d'article, pas de ressource, pas de cours, pas de produit, pas d'evenement)
  const isEmpty = !data.article && !data.resource && data.courses.length === 0
    && data.products.length === 0 && !data.event;
  if (isEmpty) {
    return ok({ skipped: true, reason: 'semaine vide', week: data.weekLabel });
  }

  const html = buildHtml(data);
  const subject = data.article
    ? `${data.article.title}`
    : `CaniPlus — ${data.weekLabel}`;

  if (dry_run) {
    return ok({
      dry_run: true,
      preview: {
        subject,
        html_length: html.length,
        sections: {
          article: !!data.article,
          resource: !!data.resource,
          courses: data.courses.length,
          products: data.products.length,
          event: !!data.event,
          tip: !!data.tip,
        },
      },
    });
  }

  // Brevo : creer la campagne puis l'envoyer
  const campaignRes = await fetch(`${BREVO_API_URL}/emailCampaigns`, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify({
      name: `Newsletter hebdo — ${data.weekLabel}`,
      subject,
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      htmlContent: html,
      recipients: { listIds: [listId] },
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
    week: data.weekLabel,
    sections: {
      article: data.article?.slug ?? null,
      resource: data.resource?.title ?? null,
      courses_count: data.courses.length,
      products_count: data.products.length,
      event_title: data.event?.title ?? null,
      tip_generated: !!data.tip,
    },
  });
});
