// supabase/functions/propose-editorial-themes/index.ts
// -----------------------------------------------------------------------------
// Phase 1 de l'agent editorial CaniPlus.
//
// Chaque lundi, le cron Vercel appelle cette fonction. Elle :
//   1. Authentifie l'appelant (cron_secret pour le cron, admin_password sinon).
//   2. Lit les themes deja couverts (vue editorial_themes_covered) pour eviter
//      les doublons.
//   3. Lit les 5 articles les plus recents pour donner du contexte a l'agent.
//   4. Appelle l'API Claude avec la charte CaniPlus en prompt et demande 3
//      propositions de themes editoriaux.
//   5. Parse la reponse JSON et insere 3 lignes dans editorial_bundles avec
//      status='proposed' et le meme proposal_batch_id.
//
// Mode RE-ROLL : si reroll_bundle_id est fourni, on REMPLACE une proposition
// existante (du meme batch) par une nouvelle.
//
// Les categories editoriales ont ete retirees le 27 aout 2026. Deux listes
// fermees coexistaient et avaient deja diverge : sur quinze articles publies,
// cinq n'etaient atteignables par aucun filtre de l'app et deux filtres ne
// pouvaient rien retourner. Le systeme optimisait une repartition entre cinq
// cases que personne n'avait validees, au lieu de proposer les meilleurs
// sujets. Ce que la regle de variete apportait est remplace par une consigne
// simple : ne pas reproposer un sujet deja traite, la liste des articles
// recents etant deja fournie au modele.
//
// Variables d'environnement attendues :
//   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-injectes)
//   - ANTHROPIC_API_KEY
//   - ADMIN_PASSWORD
//   - CRON_SECRET
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL   = 'claude-sonnet-4-6';

// Helpers
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
    .replace(/['’‘]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function currentSeasonFr(now = new Date()): string {
  const m = now.getMonth() + 1;
  if (m === 12 || m <= 2) return 'hiver';
  if (m <= 5)            return 'printemps';
  if (m <= 8)            return 'ete';
  return 'automne';
}

// Prompt systeme
const SYSTEM_PROMPT = `Tu es l'agent editorial de CaniPlus, le club canin de Tiffany Cotting a Ballaigues (Suisse romande).

Tu ecris pour deux audiences :
- Membres et futurs membres du club CaniPlus
- Proprietaires de chiens en Suisse romande qui decouvrent le blog via Google

CHARTE OBLIGATOIRE :
- Tutoiement systematique, jamais de "vous"
- Aucun emoji
- JAMAIS les mots "dominant", "dominance", "alpha", "soumission". Remplacer par "caractere affirme", "organisatrice bienveillante", etc.
- JAMAIS de recommandation de cage, crate ou parc pour chien (sauf cas de securite absolue).
- Premiere nuit d'un nouveau chien : nouveau dans la chambre des humains, deux paniers SEPARES si chien resident, jamais cote a cote.
- Protocoles progressifs : numerotes par ETAPE, jamais par jour.
- Ton bienveillant, scientifique, sans culpabilisation.
- Methodes uniquement renforcement positif et comprehension du langage canin.

ECOSYSTEME EDITORIAL :
- BLOG (public, SEO) : LE POURQUOI. Teaser du premium. 700-900 mots.
- RESSOURCE PREMIUM (membres) : LE COMMENT. Detaille, avec durees, distances, grilles.
- GUIDE PAYANT BOUTIQUE : approfondissement long format. Aucun chevauchement avec premium.

Chaque theme editorial alimente CES TROIS niveaux SANS doublon.`;

// Prompt utilisateur
function buildUserPrompt(opts: {
  season: string;
  isoDate: string;
  coveredThemes: Array<{ theme: string; covered_at: string }>;
  recentArticles: Array<{ title: string; published_at: string | null }>;
  scientificContext: Array<{ title: string; year: number | null; source: string }>;
  proposalsCount: number;
}): string {
  const coveredList = opts.coveredThemes.length === 0
    ? "(aucun pour le moment)"
    : opts.coveredThemes
        .map(t => `- ${t.theme} (${t.covered_at?.slice(0, 10) ?? '?'})`)
        .join('\n');

  const recentList = opts.recentArticles.length === 0
    ? '(aucun article recent)'
    : opts.recentArticles
        .map(a => `- ${a.title} (${a.published_at?.slice(0, 10) ?? '?'})`)
        .join('\n');

  const scientificBlock = opts.scientificContext.length === 0
    ? '(pas de publications recuperees)'
    : opts.scientificContext
        .map(p => `- ${p.title}${p.year ? ` (${p.year})` : ''} [${p.source}]`)
        .join('\n');

  return `Nous sommes le ${opts.isoDate}. Saison : ${opts.season}.

Propose-moi ${opts.proposalsCount} theme${opts.proposalsCount > 1 ? 's' : ''} editorial${opts.proposalsCount > 1 ? 'aux' : ''} pour la semaine qui commence.

THEMES DEJA COUVERTS (a NE PAS reproposer) :
${coveredList}

5 DERNIERS ARTICLES PUBLIES :
${recentList}

PUBLICATIONS SCIENTIFIQUES RECENTES (inspiration optionnelle) :
${scientificBlock}

CRITERES :
1. Pertinence saisonniere (${opts.season}).
2. Diversite des themes (pas de chevauchement).
3. Accroche pour proprietaires de chien lambda en Suisse romande.
4. Matiere pour blog + premium + social SANS doublon.
5. Aucun theme deja traite, ni dans les themes couverts ni dans les articles
   recents ci-dessus. C'est la seule regle de variete : propose les meilleurs
   sujets, sans chercher a repartir entre des rubriques.
6. Bonus si etude scientifique disponible.

REPONDS STRICTEMENT EN JSON :

{
  "proposals": [
    {
      "theme": "Titre court (max 70 caracteres)",
      "theme_description": "1-2 phrases : l'angle, ce que le lecteur va apprendre",
      "theme_rationale": "1 phrase : pourquoi ce theme maintenant",
      "scientific_angle": "1 phrase OU null"
    }
  ]
}

Exactement ${opts.proposalsCount} proposition${opts.proposalsCount > 1 ? 's' : ''}. JSON pur, pas de markdown.`;
}

async function fetchScientificContext(opts: {
  supaUrl: string;
  serviceKey: string;
}): Promise<Array<{ title: string; year: number | null; source: string }>> {
  try {
    const r = await fetch(`${opts.supaUrl}/functions/v1/fetch-scientific-sources`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${opts.serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_role_call: true,
        theme: 'comportement et education du chien',
        english_query: 'dog behavior training welfare',
        max_results: 8,
      }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return (j?.sources ?? []).map((s: any) => ({
      title: s.title,
      year: s.year,
      source: s.source,
    }));
  } catch {
    return [];
  }
}

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
  const text = (data?.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('Claude a renvoye une reponse vide');
  return text;
}

function safeParseJson(raw: string): any {
  let cleaned = raw.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  return JSON.parse(cleaned);
}

// Handler principal
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const {
      admin_password,
      cron_secret,
      reroll_bundle_id,
    } = body ?? {};

    const expectedAdmin = Deno.env.get('ADMIN_PASSWORD') ?? '';
    const expectedCron  = Deno.env.get('CRON_SECRET') ?? '';

    const isCron  = !!cron_secret    && !!expectedCron  && cron_secret    === expectedCron;
    const isAdmin = !!admin_password && !!expectedAdmin && admin_password === expectedAdmin;

    if (!isCron && !isAdmin) {
      return fail('Authentification requise.', 401);
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
    if (!anthropicKey) {
      return fail('ANTHROPIC_API_KEY manquante.', 500);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const isReroll = !!reroll_bundle_id;
    let rerollTarget: any = null;
    let rerollBatchId: string | null = null;

    if (isReroll) {
      if (!isAdmin) return fail('Re-roll reserve a l\'admin.', 401);

      const { data: target, error: e1 } = await supabase
        .from('editorial_bundles')
        .select('id, proposal_batch_id, status, theme')
        .eq('id', reroll_bundle_id)
        .maybeSingle();
      if (e1) throw e1;
      if (!target) return fail('Proposition cible introuvable', 404);
      if (target.status !== 'proposed') {
        return fail(`Cette proposition n'est plus a l'etat proposed (statut : ${target.status})`, 400);
      }
      rerollTarget = target;
      rerollBatchId = target.proposal_batch_id;
    } else {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { count: recentCount } = await supabase
        .from('editorial_bundles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'proposed')
        .gte('proposed_at', oneWeekAgo);

      if ((recentCount ?? 0) >= 3) {
        return ok({
          skipped: true,
          reason: '3 propositions deja en attente de choix cette semaine',
          recent_count: recentCount,
        });
      }
    }

    const { data: coveredRaw } = await supabase
      .from('editorial_themes_covered')
      .select('theme, covered_at')
      .order('covered_at', { ascending: false })
      .limit(60);

    const { data: recentArticles } = await supabase
      .from('articles')
      .select('title, published_at')
      .eq('published', true)
      .order('published_at', { ascending: false })
      .limit(5);

    const scientificContext = await fetchScientificContext({
      supaUrl: Deno.env.get('SUPABASE_URL') ?? '',
      serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    });

    const now = new Date();
    const proposalsCount = isReroll ? 1 : 3;

    const userPrompt = buildUserPrompt({
      season: currentSeasonFr(now),
      isoDate: now.toISOString().slice(0, 10),
      coveredThemes: coveredRaw ?? [],
      recentArticles: recentArticles ?? [],
      scientificContext,
      proposalsCount,
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
    if (!Array.isArray(proposals) || proposals.length !== proposalsCount) {
      return fail(`Claude n'a pas renvoye ${proposalsCount} proposition(s). Recu : ${JSON.stringify(parsed).slice(0, 500)}`, 500);
    }

    if (isReroll && rerollTarget) {
      const p = proposals[0];
      const { data: updated, error: updErr } = await supabase
        .from('editorial_bundles')
        .update({
          theme:             String(p.theme ?? '').slice(0, 200),
          theme_slug:        slugify(String(p.theme ?? '')),
          theme_description: String(p.theme_description ?? ''),
          theme_rationale:   String(p.theme_rationale ?? '')
            + (p.scientific_angle ? `\n\nAngle scientifique : ${String(p.scientific_angle)}` : ''),
          proposed_at:       new Date().toISOString(),
        })
        .eq('id', rerollTarget.id)
        .select()
        .single();
      if (updErr) throw updErr;

      return ok({
        success: true,
        rerolled: true,
        proposal_batch_id: rerollBatchId,
        proposal: updated,
        trigger: 'admin',
      });
    }

    const proposal_batch_id = crypto.randomUUID();
    const rows = proposals.map((p: any) => ({
      proposal_batch_id,
      theme:             String(p.theme ?? '').slice(0, 200),
      theme_slug:        slugify(String(p.theme ?? '')),
      theme_description: String(p.theme_description ?? ''),
      theme_rationale:   String(p.theme_rationale ?? '')
        + (p.scientific_angle ? `\n\nAngle scientifique : ${String(p.scientific_angle)}` : ''),
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
