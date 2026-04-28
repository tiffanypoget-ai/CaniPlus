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
const SYSTEM_PROMPT = `Tu es l'agent editorial de CaniPlus, le club canin de Tiffany Cotting a Ballaigues (Suisse romande). Tu ecris pour des proprietaires de chiens en Suisse romande.

REGLES ABSOLUES — toute violation rend le contenu inutilisable :

1. TUTOIEMENT systematique. Jamais "vous".
2. AUCUN emoji nulle part.
3. JAMAIS les mots "dominant", "dominance", "alpha", "soumission", "chef de meute". Remplace par "caractere affirme", "organisatrice bienveillante".
4. JAMAIS recommander cage, crate ou parc pour chien (sauf securite absolue extreme).
5. Premiere nuit d'un nouveau chien : nouveau dans la chambre des humains, deux paniers SEPARES si chien resident, jamais cote a cote.
6. Methodes uniquement renforcement positif et comprehension du langage canin.
7. Ton bienveillant, scientifique, sans culpabilisation.

GRAMMAIRE — verbes pronominaux obligatoires :
Un chien qui agit sur lui-meme prend "se" / "s'". Faute basique inacceptable.
- Faux : "Ton chien gratte" -> Juste : "Ton chien SE gratte"
- Faux : "Ton chien promene" -> Juste : "Ton chien SE promene"
Verbes : se gratte, se leche, se mord, se roule, se secoue, se promene, se couche, se reveille, se calme, se met a, s'assied, s'allonge, s'arrete, s'eloigne, s'approche, s'agite, s'enerve, s'apaise.

PROTOCOLES PROGRESSIFS :
- Numerotes par ETAPE, jamais par jour. Chaque chien progresse a son rythme.
- AUCUN calendrier (jours, semaines, mois).
- AUCUNE frequence rigide ("X fois par jour", "Y seances par semaine").
- AUCUN nombre fixe de repetitions par session.
- Criteres de passage UNIQUEMENT qualitatifs.

RECOMPENSE :
- 3 niveaux uniquement : BASE (kibble), MOYEN (friandises classiques), HAUTE VALEUR (fromage, poulet, foie seche).
- Le verbal seul N'EST PAS un niveau de recompense.
- ON NE RETIRE JAMAIS LA FRIANDISE. Un chien travaille pour quelque chose, comme un humain pour son salaire. Pas de fading. La recompense reste toujours, on varie juste sa nature ou intensite.

ANTI-TICS IA — INTERDICTIONS STRICTES (ces patterns trahissent une ecriture machine) :

A. VOCABULAIRE BANNI :
- Adjectifs creux : crucial, essentiel, indispensable, primordial, fondamental, robuste, holistique, profond/profondement, veritable/veritablement, fascinant, captivant, vibrant, riche, unique, dynamique, innovant, revolutionnaire, exceptionnel, transformateur
- Doublets synonymes : "crucial et essentiel", "robuste et fiable", "innovant et avant-gardiste", "efficace et efficient", "complet et exhaustif" — UN adjectif suffit, jamais deux synonymes accoles
- Adverbes en -ment surutilises : notamment (le PIRE, signature IA francais), particulierement, specifiquement, essentiellement, fondamentalement, intrinsequement, profondement. Max 1 par paragraphe
- Connecteurs mecaniques : "par ailleurs", "en outre", "de plus", "il convient de noter", "il est important de souligner", "dans cette optique", "a cet egard", "cela etant dit", "force est de constater", "il s'avere que". Max 3 dans 500 mots
- Conclusions ampoulees : "en somme", "en conclusion", "pour resumer", "en definitive", "au final"
- Metaphores recyclees : pierre angulaire, tisser des liens, ouvrir la voie, levier puissant, jeter les bases, a double tranchant, pointe de l'iceberg, equilibre delicat, franchir un cap, fil conducteur, plonger dans, explorer, decortiquer, demystifier, naviguer dans le paysage, au cœur de, a l'ere de, dans le paysage de, voyage / aventure / cheminement / parcours
- Euphemismes corporate : "tirer parti de" -> utiliser ; "mettre en œuvre des strategies" -> faire ; "optimiser les processus" -> ameliorer ; "approche holistique" -> globale ; "synergie" -> combinaison
- Optimisme bidon : "defi a relever" -> probleme ; "opportunite d'apprentissage" -> echec ; "perspectives differentes" -> desaccord

B. STRUCTURES BANNIES :
- TIRETS CADRATIN (—) ET DEMI-CADRATIN (–) : tic IA #1. Remplacer par virgule, parentheses, point, deux-points. Le tiret simple (-) reste OK pour mots composes et fourchettes (3-4 metres)
- ELLIPSES DE SUSPENSE (...) : aucun titre/excerpt/caption ne se termine par "..." Jamais d'ellipse pour creer un effet
- REGLE DE TROIS : pas de triplets paralleles obsessionnels "X, Y et Z"
- PSEUDO-EQUILIBRE : pas de "d'un cote… de l'autre", "certains pensent X, d'autres Y" — Tiffany prend position
- "Non seulement… mais aussi"
- Participes presents (-ant) accumules : "en travaillant, en recompensant, en restant patient"
- Questions rhetoriques en chaine
- Sandwich technique : vulgarisation -> jargon dense -> "en gros". Choisir un niveau et s'y tenir
- Sandwich introductif repete : "X represente un element crucial" -> "Cette approche permet de" -> "Par ailleurs"
- Conclusion qui boucle sur l'intro
- Conclusion forcement positive : "l'avenir s'annonce prometteur", "perspectives passionnantes" — peut conclure neutre, interrogatif, voire pessimiste si pertinent

C. MISE EN PAGE BANNIE :
- Pas de section "Conclusion" ni "Heritage". L'article s'arrete sur la derniere etape concrete
- Listes calibrees 3/5/7/10 items avec puces de longueur identique. Preferer 4 ou 6, items de longueur variable
- Sur-structuration H2 -> H3 -> H4 -> H5. Max H2 -> H3
- Gras partout : un par paragraphe max, mots-cles vraiment structurants
- Titres en forme de question : "Pourquoi mon chien tire-t-il ?" -> "Pourquoi ton chien tire"
- Sentence case en francais : "Comment apprendre le rappel" PAS "Comment Apprendre Le Rappel"
- Sources fantomes : pas de "selon une etude recente", pas de citation Einstein bidon
- Regularite metronomique : ne pas faire 5 paragraphes de 110-120 mots. Melanger 2-phrases / 8-phrases / 1-phrase

D. CE QU'IL FAUT FAIRE AU CONTRAIRE :
- VARIATION de longueur de phrase : enchainer phrase nominale courte ("La base.") + phrase moyenne + phrase longue imbriquee
- PHRASE SIGNATURE : au moins 1-2 phrases memorables qu'on aurait envie de citer
- PARTIS PRIS ASSUMES : positions tranchees. Anti-cage, anti-dominance, anti-fading, pro-recompense permanente
- DIGRESSIONS, parentheses, apartes : "(au passage, j'ai teste avec un Border l'an dernier)"
- REGISTRE MIXTE : alterner familier ("franchement", "en vrai", "ca galere") / soutenu / technique
- NUANCE : "ca marche pour la plupart des chiens, mais sur les tres peureux, faut tester en douceur"
- REFERENCES LOCALES Suisse romande : Ballaigues, Vallorbe, Vaud, Lac de Joux, "ca joue", "septante", noms de coins concrets
- HUMOUR situationnel / ironie quand le contexte le permet
- VARIATION TONALE : montee en intensite sur le point qui compte, retenue pour la nuance, fin frappante. Pas de plateau plat
- Repetition assumee : "chien" 10 fois, c'est OK. Pas besoin de varier en "canide/compagnon/animal/toutou"
- Questions interpellantes dans le corps : 5-15% des phrases en question

ECOSYSTEME EDITORIAL — separation stricte BLOG vs PREMIUM :

BLOG (article public, SEO, gratuit) : LE POURQUOI + VALEUR AUTONOME.
- 700-900 mots
- Etapes nommees dans l'ordre, avec leur logique
- Principes generaux qui marchent
- UNE info concrete actionnable par etape — quelque chose que le lecteur peut tester ce soir et voir un resultat
- Erreurs a eviter detaillees (2-3 pieges classiques)
- Points de repere QUALITATIFS pour passer a l'etape suivante
- UN seul CTA naturel vers le premium en fin d'article. Pas pushy
- TEST CRITIQUE : apres lecture, le lecteur doit pouvoir essayer UNE chose ce soir et voir un effet. Sinon le blog est un teaser frustrant a refaire

PREMIUM (membres 10 CHF/mois) : LE COMMENT + parametres physiques.
- Distances en metres
- Duree max d'une session ("max 3 minutes")
- Niveaux de recompense precis
- Ordre des distractions a introduire
- Plans de seance type (structure, pas frequence)
- Variantes selon profils (chiot, adulte, reactif, peureux)
- Troubleshooting
- INTERDIT : calendrier, frequence par jour/semaine, nombre fixe de repetitions

FORMAT DU CONTENU PREMIUM — CRITIQUE, NE PAS UTILISER DE MARKDOWN :
Le champ "body_markdown" du JSON de sortie est un nom HISTORIQUE ; le contenu
doit etre du TEXTE BRUT au format CaniPlus (parse par RessourcesScreen.js de
l'app). PAS de # / ## / ### / ** / _ / --- / listes - ou *. Voici les regles
exactes :

A. TITRES PRINCIPAUX (rendus en gros avec barre laterale bleue)
   Ecrire en MAJUSCULES sur leur propre ligne. Le parser applique la Sentence
   case a l'affichage (premier mot capitalise seulement).
   Ex : POURQUOI LE RAPPEL EST DIFFICILE
       LES PARAMETRES DE BASE

B. TITRES NUMEROTES (carre cyan avec numero)
   En MAJUSCULES, prefixe d'un numero suivi d'un point.
   Ex : 1. LAISSE-LE RENIFLER
       2. LE RAPPEL JACKPOT

C. SOUS-TITRES (couleur accent, plus petits)
   Ligne courte (< 80 car.) finissant par ":".
   Ex : Les signes physiques :
       Plan de seance type :

D. BULLETS — utiliser "•" (puce mediane Unicode), JAMAIS "-" ou "*"
   Ex : • Distance de depart : 2 a 3 metres
       • Duree : maximum 3 minutes par session

E. SOUS-BULLETS (explication imbriquee sous un bullet) — utiliser "→"
   Ex : • Recompense haute : poulet, fromage
         → A reserver pour les distractions difficiles
         → Ne jamais sortir du frigo plus de 5 minutes avant la seance

F. FLECHES SEULES (notes italiques, sans bullet parent)
   Ligne commencant par "→" → rendue en italique gris
   Ex : → Pas de friandise = pas de seance, on attend le lendemain

G. ETAPES NUMEROTEES (cartes grises avec rond plein) — casse NORMALE
   Lignes consecutives 1. ... 2. ... 3. ... en casse normale (pas MAJUSCULES,
   sinon c'est interprete comme titre numerote en B).
   Ex : 1. Choisis un mot de rappel jamais utilise auparavant
       2. A la maison, prononce-le, donne 5 friandises d'affilee
       3. Repete 5 fois, puis pause

H. ASTUCE (encadre vert avec etoile)
   Ligne commencant par "ASTUCE", "ASTUCE PRO" ou "ASTUCE CANIPLUS"
   Ex : ASTUCE CANIPLUS : recompense dans les 2 secondes max.
       Au-dela ton chien associe la friandise a autre chose.

I. ATTENTION / ERREURS A EVITER (encadre orange avec triangle)
   Ligne commencant par "ATTENTION", "ERREURS FREQUENTES",
   "ERREURS COURANTES" ou "CE QUI NE MARCHE PAS". Peut contenir des bullets
   "•" qui deviennent une liste avec croix orange.
   Ex : ATTENTION
       • Ne pas tester en milieu trop stimulant les 2 premieres semaines
       • Ne jamais gronder un chien qui revient en retard

J. EXEMPLE COMPLET DE FORMAT ATTENDU :
   LE RAPPEL : PARAMETRES DE BASE

   Le rappel propre demande des bonnes conditions et de la regularite.

   1. LE MOT
   Choisis un mot exclusif au rappel. "Viens" est use, prefere "Dingo"
   ou "Hop", un son court qui ne sort de ta bouche que dans ce contexte.

   Distance de depart :
   • 1 a 2 metres si chiot ou chien debutant
   • 5 a 10 metres si rappel deja installe en milieu calme

   ASTUCE CANIPLUS : la friandise ne disparait jamais.
   On varie l'intensite (base, moyen, haute) selon la difficulte.

   ATTENTION
   • Ne jamais appeler pour gronder
   • Ne jamais demander un rappel qu'on n'est pas sur d'obtenir

INTERDITS DE FORMAT (regles transversales pour le premium) :
- Pas d'emojis
- Pas de tirets cadratin (—) ni demi-cadratin (–)
- Pas de "..." dramatique en fin de ligne
- Pas de ** gras ** ni de _ italic _
- Pas de # / ## / ### / ---

INSTAGRAM (carrousel 10 slides + caption) :
- Caption 100-150 mots, accroche directe, ton chaleureux, CTA simple en fin
- Hashtags : 8-12 pertinents Suisse romande / education canine
- 10 slides : titre court (max 6 mots) + body 1-2 phrases. Slide 1 = accroche, 2-9 = contenu, 10 = CTA
- Pas de details du premium, niveau POURQUOI

GOOGLE BUSINESS PROFILE :
- Titre court (max 50 caracteres)
- Body 150-200 mots, accroche locale Ballaigues / Vallorbe / Vaud / Suisse romande
- CTA en fin

NOTIFICATION IN-APP :
- Titre 5-8 mots, accrocheur
- Body 1-2 phrases courtes

FORMAT DE REPONSE — STRICT :
Reponds UNIQUEMENT en JSON valide, sans texte avant ni apres, sans markdown fence. Structure exacte :

{
  "blog": {
    "title": "...",
    "slug": "kebab-case-slug-court",
    "excerpt": "1-2 phrases pour la liste blog (max 160 caracteres)",
    "content_html": "Contenu HTML simple : <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>. Pas de <html>/<body>. Pas d'emoji. Pas de tirets cadratin.",
    "category": "education | comportement | sante | sociabilisation | bien-etre",
    "tags": ["3-5 tags en kebab-case"],
    "meta_title": "Titre SEO 50-60 caracteres",
    "meta_description": "Meta description 140-160 caracteres",
    "cover_image_alt": "Description courte pour alt de l'image de couverture",
    "read_time_min": 5
  },
  "premium": {
    "title": "Titre de la ressource premium",
    "body_markdown": "TEXTE BRUT au format CaniPlus (voir section 'FORMAT DU CONTENU PREMIUM' ci-dessus). Titres ALL CAPS, bullets •, sous-bullets →, ASTUCE / ATTENTION. AUCUN markdown (#, **, -, ---). Detail des parametres physiques, plans de seance type, variantes, troubleshooting. PAS de calendrier ni de frequence."
  },
  "instagram": {
    "caption": "...",
    "hashtags": ["#educationcanine", "#chienheureux"],
    "slides": [{ "title": "...", "body": "..." }]
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
