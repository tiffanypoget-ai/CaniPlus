// supabase/functions/propose-editorial-themes/index.ts
// -----------------------------------------------------------------------------
// Phase 1 de l'agent éditorial CaniPlus.
//
// Chaque lundi, le cron Vercel appelle cette fonction. Elle :
//   1. Authentifie l'appelant (cron_secret pour le cron, admin_password sinon).
//   2. Lit les thèmes déjà couverts (vue editorial_themes_covered) pour éviter
//      les doublons.
//   3. Lit les 5 articles les plus récents pour donner du contexte à l'agent.
//   4. Appelle l'API Claude (anthropic.com/v1/messages) avec la charte CaniPlus
//      en prompt et demande 3 propositions de thèmes éditoriaux.
//   5. Parse la réponse JSON et insère 3 lignes dans editorial_bundles avec
//      status='proposed' et le même proposal_batch_id.
//
// Variables d'environnement attendues (Supabase Dashboard → Edge Functions → Secrets) :
//   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY : auto-injectés par Supabase
//   - ANTHROPIC_API_KEY  : clé API Anthropic (console.anthropic.com)
//   - ADMIN_PASSWORD     : même mot de passe que admin-query (déclenchement manuel)
//   - CRON_SECRET        : secret partagé entre Vercel Cron et cette fonction
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL   = 'claude-sonnet-4-6';

// ── Helpers ────────────────────────────────────────────────────────────────
function ok(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function fail(message: string, status = 400) {
  return ok({ error: message }, status);
}

function slugify(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['']/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function currentSeasonFr(now = new Date()): string {
  const m = now.getMonth() + 1; // 1-12
  if (m === 12 || m <= 2) return 'hiver';
  if (m <= 5)            return 'printemps';
  if (m <= 8)            return 'été';
  return 'automne';
}

// ── Prompt système : la charte CaniPlus ────────────────────────────────────
const SYSTEM_PROMPT = `Tu es l'agent éditorial de CaniPlus, le club canin de Tiffany Cotting à Ballaigues (Suisse romande).

Tu écris pour deux audiences :
- Membres et futurs membres du club CaniPlus
- Propriétaires de chiens en Suisse romande qui découvrent le blog via Google

CHARTE OBLIGATOIRE — règles absolues :
- Tutoiement systématique, jamais de "vous"
- Aucun emoji
- JAMAIS les mots "dominant", "dominance", "alpha", "soumission". Remplacer par "caractère affirmé", "organisatrice bienveillante", etc.
- JAMAIS de recommandation de cage, crate ou parc pour chien (sauf cas de sécurité absolue, et même là c'est l'exception).
- Première nuit d'un nouveau chien : nouveau dans la chambre des humains, deux paniers SÉPARÉS si chien résident, jamais côte à côte.
- Protocoles progressifs : numérotés par ÉTAPE, jamais par jour (chaque chien progresse à son rythme).
- Ton bienveillant, scientifique, sans culpabilisation.
- Méthodes uniquement renforcement positif et compréhension du langage canin.

ÉCOSYSTÈME ÉDITORIAL — 3 supports complémentaires, JAMAIS de doublon entre eux :
- BLOG (article public, SEO) : LE POURQUOI. Teaser du premium. 700-900 mots. Étapes nommées sans détails (durées, distances, grilles).
- RESSOURCE PREMIUM (membres premium 10 CHF/mois) : LE COMMENT. Détaillé, avec durées, distances, grilles, exemples concrets.
- GUIDE PAYANT BOUTIQUE : approfondissement long format. Aucun chevauchement avec premium.

Chaque thème éditorial alimente CES TROIS niveaux. Tu dois choisir des thèmes qui ont assez de matière pour ces 3 niveaux SANS doublon.`;

// ── Prompt utilisateur : la demande hebdomadaire ───────────────────────────
function buildUserPrompt(opts: {
  season: string;
  isoDate: string;
  coveredThemes: Array<{ theme: string; covered_at: string }>;
  recentArticles: Array<{ title: string; category: string; published_at: string | null }>;
}): string {
  const coveredList = opts.coveredThemes.length === 0
    ? "(aucun pour le moment — premier passage de l'agent)"
    : opts.coveredThemes
        .map(t => `- ${t.theme} (${t.covered_at?.slice(0, 10) ?? '?'})`)
        .join('\n');

  const recentList = opts.recentArticles.length === 0
    ? '(aucun article récent)'
    : opts.recentArticles
        .map(a => `- ${a.title} [${a.category}] (${a.published_at?.slice(0, 10) ?? '?'})`)
        .join('\n');

  return `Nous sommes le ${opts.isoDate}. Saison actuelle : ${opts.season}.

Propose-moi 3 thèmes éditoriaux pour la semaine qui commence. Chaque thème doit pouvoir alimenter un article de blog (700-900 mots) + une ressource premium détaillée + des supports sociaux.

THÈMES DÉJÀ COUVERTS (à NE PAS reproposer, sauf angle radicalement nouveau) :
${coveredList}

5 DERNIERS ARTICLES PUBLIÉS (pour t'inspirer du ton et du niveau) :
${recentList}

CRITÈRES POUR TES 3 PROPOSITIONS :
1. Pertinence saisonnière (saison actuelle : ${opts.season}).
2. Diversité : 3 thèmes qui ne se chevauchent PAS entre eux.
3. Accroche pour propriétaires de chien lambda en Suisse romande (recherches Google plausibles).
4. Suffisamment de matière pour blog + premium + social SANS doublon entre les 3 supports.
5. Aucun thème déjà traité dans la liste ci-dessus.

RÉPONDS STRICTEMENT EN JSON, sans texte avant ni après, avec cette structure exacte :

{
  "proposals": [
    {
      "theme": "Titre court et accrocheur du thème (max 70 caractères)",
      "theme_description": "1-2 phrases : l'angle, ce que le lecteur va apprendre, pourquoi ça l'aide",
      "theme_rationale": "1 phrase : pourquoi ce thème maintenant (saison, gap éditorial, besoin lecteur)"
    },
    { ... },
    { ... }
  ]
}

Exactement 3 propositions. Pas de markdown, pas de commentaire, JSON pur.`;
}

// ── Appel API Claude ───────────────────────────────────────────────────────
async function callClaude(opts: {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: opts.systemPrompt,
      messages: [{ role: 'user', content: opts.userPrompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  // La réponse est dans content[0].text pour les messages text-only
  const text = (data?.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('Claude a renvoyé une réponse vide');
  return text;
}

function safeParseJson(raw: string): any {
  // Claude peut parfois envelopper dans ```json … ``` malgré la consigne
  let cleaned = raw.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  return JSON.parse(cleaned);
}

// ── Handler principal ──────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const { admin_password, cron_secret } = body ?? {};

    // ── Authentification : cron OU admin ─────────────────────────────────
    const expectedAdmin = Deno.env.get('ADMIN_PASSWORD') ?? '';
    const expectedCron  = Deno.env.get('CRON_SECRET') ?? '';

    const isCron  = !!cron_secret    && !!expectedCron  && cron_secret    === expectedCron;
    const isAdmin = !!admin_password && !!expectedAdmin && admin_password === expectedAdmin;

    if (!isCron && !isAdmin) {
      return fail('Authentification requise (cron_secret ou admin_password).', 401);
    }

    // ── Clé API Anthropic ────────────────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
    if (!anthropicKey) {
      return fail('ANTHROPIC_API_KEY manquante dans les secrets Supabase.', 500);
    }

    // ── Client Supabase (service role) ───────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── Garde-fou : ne pas regénérer si déjà 3 propositions cette semaine
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from('editorial_bundles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'proposed')
      .gte('proposed_at', oneWeekAgo);

    if ((recentCount ?? 0) >= 3) {
      return ok({
        skipped: true,
        reason: '3 propositions déjà en attente de choix cette semaine',
        recent_count: recentCount,
      });
    }

    // ── Lecture du contexte : thèmes couverts + articles récents ─────────
    const { data: coveredRaw } = await supabase
      .from('editorial_themes_covered')
      .select('theme, covered_at')
      .order('covered_at', { ascending: false })
      .limit(60);

    const { data: recentArticles } = await supabase
      .from('articles')
      .select('title, category, published_at')
      .eq('published', true)
      .order('published_at', { ascending: false })
      .limit(5);

    // ── Préparation du prompt + appel Claude ─────────────────────────────
    const now = new Date();
    const userPrompt = buildUserPrompt({
      season: currentSeasonFr(now),
      isoDate: now.toISOString().slice(0, 10),
      coveredThemes: coveredRaw ?? [],
      recentArticles: recentArticles ?? [],
    });

    const rawResponse = await callClaude({
      apiKey: anthropicKey,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
    });

    let parsed: any;
    try {
      parsed = safeParseJson(rawResponse);
    } catch (e) {
      return fail(`Parse JSON Claude impossible : ${e}. Raw: ${rawResponse.slice(0, 500)}`, 500);
    }

    const proposals = parsed?.proposals;
    if (!Array.isArray(proposals) || proposals.length !== 3) {
      return fail(`Claude n'a pas renvoye 3 propositions. Recu : ${JSON.stringify(parsed).slice(0, 500)}`, 500);
    }

    // ── Insertion en base ────────────────────────────────────────────────
    const proposal_batch_id = crypto.randomUUID();
    const rows = proposals.map((p: any) => ({
      proposal_batch_id,
      theme:             String(p.theme ?? '').slice(0, 200),
      theme_slug:        slugify(String(p.theme ?? '')),
      theme_description: String(p.theme_description ?? ''),
      theme_rationale:   String(p.theme_rationale ?? ''),
      status:            'proposed',
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from('editorial_bundles')
      .insert(rows)
      .select();

    if (insertErr) throw insertErr;

    return ok({
      success: true,
      proposal_batch_id,
      proposals: inserted,
      trigger: isCron ? 'cron' : 'admin',
    });

  } catch (e) {
    return fail(`Erreur serveur : ${(e as Error).message}`, 500);
  }
});
