// supabase/functions/generate-editorial-bundle/index.ts
// -----------------------------------------------------------------------------
// Phase 2 de l'agent editorial CaniPlus.
//
// Pour un bundle a l'etat 'chosen', genere les 5 supports en un seul appel
// Claude (claude-sonnet-4-6) :
//   - content_blog          : article public 700-900 mots (le pourquoi + valeur autonome)
//   - content_premium       : ressource detaillee (parametres physiques, sans calendrier)
//   - content_instagram     : caption + 10 slides
//   - content_google_business : post ~200 mots
//   - content_notification  : push membres premium
//
// Respecte strictement la charte CaniPlus (no dominant, no cage, tutoiement,
// recompense base/moyen/haute jamais retiree, etapes pas jours, etc.).
//
// Auth : admin_password OU cron_secret. Variables d'env :
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto)
//   ANTHROPIC_API_KEY
//   ADMIN_PASSWORD
//   CRON_SECRET
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL   = 'claude-sonnet-4-6';

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
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// --- Charte CaniPlus (prompt systeme) ---
const SYSTEM_PROMPT = `Tu es l'agent editorial de CaniPlus, le club canin de Tiffany Cotting a Ballaigues (Suisse romande).

REGLES ABSOLUES — toute violation rend le contenu inutilisable :

1. TUTOIEMENT systematique. Jamais "vous".
2. AUCUN emoji nulle part.
3. JAMAIS les mots "dominant", "dominance", "alpha", "soumission", "chef de meute". Remplace par "caractere affirme", "organisatrice bienveillante", etc.
4. JAMAIS recommander cage, crate ou parc pour chien (sauf cas de securite absolue, et meme la c'est l'exception).
5. Premiere nuit d'un nouveau chien : nouveau dans la chambre des humains, deux paniers SEPARES si chien resident, jamais cote a cote.
6. Methodes uniquement renforcement positif et comprehension du langage canin.
7. Ton bienveillant, scientifique, sans culpabilisation.

PROTOCOLES PROGRESSIFS — regle stricte :
- Numerotes par ETAPE, jamais par jour. Chaque chien progresse a son rythme.
- AUCUN calendrier (jours, semaines, mois).
- AUCUNE frequence rigide ("X fois par jour", "Y seances par semaine").
- AUCUN nombre fixe de repetitions par session.
- Criteres de passage UNIQUEMENT qualitatifs ("quand ton chien reussit avec aisance", "quand il revient sans hesiter").

RECOMPENSE — regle absolue :
- 3 niveaux uniquement : BASE (kibble), MOYEN (friandises classiques), HAUTE VALEUR (fromage, poulet, foie seche).
- Le verbal seul N'EST PAS un niveau de recompense. "Bon chien" sans rien d'autre ne paye pas le travail.
- ON NE RETIRE JAMAIS LA FRIANDISE. Un chien travaille pour quelque chose, comme un humain pour son salaire. Pas de "tu n'as plus besoin de la friandise". Pas de fading. La recompense reste toujours, on peut juste varier sa nature ou son intensite.

ECOSYSTEME EDITORIAL — separation stricte BLOG vs PREMIUM :

BLOG (article public, SEO, gratuit) : LE POURQUOI + VALEUR AUTONOME.
- 700-900 mots.
- Etapes nommees dans l'ordre, avec leur logique (pourquoi cette etape avant l'autre).
- Principes generaux qui marchent.
- UNE info concrete actionnable par etape — quelque chose que le lecteur peut tester ce soir et voir un resultat.
- Erreurs a eviter detaillees (2-3 pieges classiques).
- Points de repere QUALITATIFS pour passer a l'etape suivante.
- Regle d'or memorable.
- UN seul CTA naturel vers le premium en fin d'article. Pas de formulations pushy.
- TEST CRITIQUE : apres lecture, le lecteur doit pouvoir essayer UNE chose ce soir et voir un effet. S'il ne peut RIEN tester sans le premium, le blog est un teaser frustrant a refaire.

PREMIUM (ressource pour membres 10 CHF/mois) : LE COMMENT + parametres physiques.
- Distances en metres autorisees.
- Duree max d'une session autorisee (ex : "max 3 minutes").
- Niveaux de recompense precis.
- Ordre des distractions a introduire.
- Plans de seance type (structure d'une seance, pas frequence).
- Variantes selon profils (chiot, adulte, reactif, peureux).
- Troubleshooting.
- INTERDIT : calendrier, frequence par jour/semaine, nombre fixe de repetitions, "pendant X jours".

INSTAGRAM (carrousel 10 slides + caption) :
- Caption : 100-150 mots, accroche directe, ton chaleureux, finit par un CTA simple ("Plus de details sur le blog" ou "Lien en bio").
- Hashtags : 8-12 pertinents pour Suisse romande / education canine.
- 10 slides : titre court (max 6 mots) + body 1-2 phrases. Slide 1 = accroche, slides 2-9 = contenu, slide 10 = CTA.
- Pas de details du premium. Reste au niveau du POURQUOI.

GOOGLE BUSINESS PROFILE (post local) :
- Titre court (max 50 caracteres).
- Body 150-200 mots, accroche locale Ballaigues / Vallorbe / Vaud / Suisse romande.
- CTA en fin : visite du blog, contact club, ou inscription cours.

NOTIFICATION IN-APP (push membres premium) :
- Titre : 5-8 mots, accrocheur.
- Body : 1-2 phrases courtes, dit qu'une nouvelle ressource premium est dispo et donne une raison de cliquer.

FORMAT DE REPONSE — STRICT :
Reponds UNIQUEMENT en JSON valide, sans texte avant ni apres, sans markdown fence. Structure exacte :

{
  "blog": {
    "title": "...",
    "slug": "kebab-case-slug-court",
    "excerpt": "1-2 phrases pour la liste blog (max 160 caracteres)",
    "content_html": "Contenu complet en HTML simple : <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>. Pas de <html>/<body>. Pas d'emoji.",
    "category": "education | comportement | sante | sociabilisation | bien-etre",
    "tags": ["3-5 tags en kebab-case"],
    "meta_title": "Titre SEO 50-60 caracteres",
    "meta_description": "Meta description 140-160 caracteres",
    "cover_image_alt": "Description courte pour alt de l'image de couverture",
    "read_time_min": 5
  },
  "premium": {
    "title": "Titre de la ressource premium",
    "body_markdown": "Contenu en markdown avec ## titres, listes, **gras**. Inclut etapes detaillees, parametres physiques, plans de seance type, variantes, troubleshooting. PAS de calendrier ni de frequence."
  },
  "instagram": {
    "caption": "...",
    "hashtags": ["#educationcanine", "#chienheureux", ...],
    "slides": [
      { "title": "...", "body": "..." },
      { "title": "...", "body": "..." },
      ... 10 slides au total
    ]
  },
  "google_business": {
    "title": "...",
    "body": "...",
    "cta": "Lis l'article complet | Contacte le club | etc."
  },
  "notification": {
    "title": "...",
    "body": "..."
  }
}`;

function buildUserPrompt(opts: {
  theme: string;
  themeDescription: string;
  themeRationale: string;
  recentArticles: Array<{ title: string; published_at: string | null }>;
}): string {
  const recentList = opts.recentArticles.length === 0
    ? '(aucun article recent)'
    : opts.recentArticles
        .map(a => `- ${a.title} (${a.published_at?.slice(0, 10) ?? '?'})`)
        .join('\n');

  return `THEME EDITORIAL DE LA SEMAINE :
Titre : ${opts.theme}
Description : ${opts.themeDescription}
Pourquoi maintenant : ${opts.themeRationale}

ARTICLES BLOG DEJA PUBLIES (eviter chevauchement) :
${recentList}

TA TACHE :
Genere les 5 supports (blog + premium + instagram + google_business + notification) en respectant strictement la charte du systeme.

POINTS DE VIGILANCE POUR CE BUNDLE :
- Le blog DOIT permettre au lecteur de tester UNE chose ce soir et voir un effet concret. Ce n'est pas un teaser frustrant.
- Le premium DOIT etre detaille en parametres PHYSIQUES (distances, durees max d'une session, niveaux de recompense, plans de seance) MAIS ne doit JAMAIS contenir de calendrier (jours/semaines), de frequence rigide, ou de nombre fixe de repetitions.
- Les criteres de passage entre etapes sont qualitatifs.
- La recompense ne disparait jamais — varie l'intensite (base/moyen/haute), pas la presence.

Reponds maintenant en JSON pur, sans texte avant ni apres.`;
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
      max_tokens: 8192,
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

function validateBundle(parsed: any): string | null {
  if (!parsed || typeof parsed !== 'object') return 'Reponse non-objet';
  for (const key of ['blog', 'premium', 'instagram', 'google_business', 'notification']) {
    if (!parsed[key]) return `Section manquante : ${key}`;
  }
  if (!parsed.blog.title || !parsed.blog.content_html) return 'blog.title ou blog.content_html manquant';
  if (!parsed.premium.title || !parsed.premium.body_markdown) return 'premium.title ou premium.body_markdown manquant';
  if (!Array.isArray(parsed.instagram.slides) || parsed.instagram.slides.length < 5) return 'instagram.slides doit etre un tableau de 5+ slides';
  if (!parsed.google_business.body) return 'google_business.body manquant';
  if (!parsed.notification.title || !parsed.notification.body) return 'notification incomplete';
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const { admin_password, cron_secret, bundle_id } = body ?? {};

    const expectedAdmin = Deno.env.get('ADMIN_PASSWORD') ?? '';
    const expectedCron  = Deno.env.get('CRON_SECRET') ?? '';
    const isCron  = !!cron_secret    && !!expectedCron  && cron_secret    === expectedCron;
    const isAdmin = !!admin_password && !!expectedAdmin && admin_password === expectedAdmin;
    if (!isCron && !isAdmin) {
      return fail('Authentification requise.', 401);
    }

    if (!bundle_id) return fail('bundle_id manquant.', 400);

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
    if (!anthropicKey) return fail('ANTHROPIC_API_KEY manquante.', 500);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Recuperer le bundle
    const { data: bundle, error: e1 } = await supabase
      .from('editorial_bundles')
      .select('id, theme, theme_slug, theme_description, theme_rationale, status')
      .eq('id', bundle_id)
      .single();
    if (e1) throw e1;
    if (!bundle) return fail('Bundle introuvable.', 404);
    if (bundle.status !== 'chosen') {
      return fail(`Le bundle doit etre a l'etat 'chosen' (statut actuel : ${bundle.status}).`, 400);
    }

    // Articles recents pour anti-doublon
    const { data: recentArticles } = await supabase
      .from('articles')
      .select('title, published_at')
      .eq('published', true)
      .order('published_at', { ascending: false })
      .limit(15);

    const userPrompt = buildUserPrompt({
      theme: bundle.theme,
      themeDescription: bundle.theme_description ?? '',
      themeRationale: bundle.theme_rationale ?? '',
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
      return fail(`Parse JSON impossible : ${e}. Raw start: ${rawResponse.slice(0, 400)}`, 500);
    }

    const validationError = validateBundle(parsed);
    if (validationError) {
      return fail(`Bundle invalide : ${validationError}. Raw start: ${rawResponse.slice(0, 400)}`, 500);
    }

    // Forcer le slug du blog a partir du titre si absent ou vide
    if (!parsed.blog.slug || parsed.blog.slug.length < 3) {
      parsed.blog.slug = slugify(parsed.blog.title);
    }

    // Mise a jour du bundle
    const { data: updated, error: e2 } = await supabase
      .from('editorial_bundles')
      .update({
        content_blog: parsed.blog,
        content_premium: parsed.premium,
        content_instagram: parsed.instagram,
        content_google_business: parsed.google_business,
        content_notification: parsed.notification,
        status: 'drafted',
      })
      .eq('id', bundle_id)
      .select()
      .single();
    if (e2) throw e2;

    return ok({
      success: true,
      bundle: updated,
      trigger: isCron ? 'cron' : 'admin',
    });

  } catch (e) {
    return fail(`Erreur serveur : ${(e as Error).message}`, 500);
  }
});
