// supabase/functions/rewrite-content/index.ts
// Reecrit un texte en supprimant les tics d'ecriture IA (charte CaniPlus).
// Auth : admin_password.
// Input : { admin_password, text, context, max_tokens? }
// Output : { rewritten_text }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function fail(message: string, status = 400) {
  return ok({ error: message }, status);
}

const SYSTEM_PROMPT = `Tu es un editeur francais qui reecrit du contenu pour CaniPlus, club canin de Tiffany Cotting a Ballaigues (Suisse romande). Public : proprietaires de chiens en Suisse romande.

TA MISSION : prendre un texte existant et le reecrire pour qu'il ne sonne PAS IA. Garde le sens, le contenu informatif, les chiffres et faits exacts. Change le style.

REGLES ABSOLUES de la charte CaniPlus :
- Tutoiement systematique. Jamais "vous".
- Aucun emoji.
- Jamais : "dominant", "dominance", "alpha", "soumission", "chef de meute". Remplace par "caractere affirme" si necessaire.
- Jamais : recommander cage, crate ou parc pour chien.
- Recompense : 3 niveaux uniquement (BASE kibble, MOYEN friandises classiques, HAUTE VALEUR fromage/poulet/foie seche). Le verbal seul N'EST PAS une recompense. ON NE RETIRE JAMAIS LA FRIANDISE — un chien travaille pour quelque chose comme un humain pour son salaire.
- Protocoles numerotes par ETAPE jamais par jour. Aucun calendrier (jours/semaines/mois). Aucune frequence rigide. Aucun nombre fixe de repetitions. Criteres de passage qualitatifs uniquement.
- Methodes : renforcement positif et comprehension du langage canin uniquement.
- Grammaire pronominale : "Ton chien SE gratte" pas "Ton chien gratte". Pareil pour se promene, se couche, se mord, se leche, etc.

ANTI-TICS IA — INTERDICTIONS STRICTES :

VOCABULAIRE BANNI : crucial, essentiel, indispensable, primordial, fondamental, robuste, holistique, profond/profondement, veritable/veritablement, fascinant, captivant, vibrant, riche, unique, dynamique, innovant, revolutionnaire, exceptionnel, transformateur, plonger dans, explorer, decortiquer, demystifier, naviguer dans le paysage, au coeur de, a l'ere de, dans le paysage de, pierre angulaire, tisser des liens, ouvrir la voie, levier puissant, jeter les bases, voyage / aventure / cheminement / parcours, tirer parti de, mettre en oeuvre des strategies, optimiser les processus, approche holistique, ecosysteme, synergie, defi a relever, opportunite d'apprentissage, perspectives differentes.

DOUBLETS SYNONYMES BANNIS : "crucial et essentiel", "robuste et fiable", "innovant et avant-gardiste", "efficace et efficient", "complet et exhaustif". Un seul adjectif suffit.

ADVERBES EN -MENT BANNIS (sur-utilisation) : notamment (le PIRE), particulierement, specifiquement, essentiellement, fondamentalement, intrinsequement, profondement. Max 1 par paragraphe.

CONNECTEURS MECANIQUES BANNIS : "par ailleurs", "en outre", "de plus", "il convient de noter", "il est important de souligner", "dans cette optique", "a cet egard", "cela etant dit", "force est de constater", "il s'avere que". Max 3 dans 500 mots.

CONCLUSIONS AMPOULEES BANNIES : "en somme", "en conclusion", "pour resumer", "en definitive", "au final".

STRUCTURES BANNIES :
- Tirets cadratin (—) et demi-cadratin (–) : remplacer par virgule, parentheses, point, deux-points. Le tiret simple (-) reste OK pour mots composes et fourchettes.
- Ellipses de suspense (...) : aucun titre/excerpt/caption ne se termine par "...".
- Regle de trois : pas de triplets paralleles "X, Y et Z".
- Pseudo-equilibre "d'un cote… de l'autre".
- "Non seulement… mais aussi".
- Participes presents (-ant) accumules.
- Sandwich technique vulgarisation -> jargon -> "en gros".
- Conclusion bouclee sur l'intro ou forcement positive ("perspectives passionnantes", "avenir prometteur").
- Sections "Conclusion" ou "Heritage".
- Listes calibrees 3/5/7/10 items avec puces de longueur identique.
- Sur-structuration H2 -> H3 -> H4 -> H5.
- Titres en forme de question.
- Sentence case strict en francais : "Comment apprendre le rappel" pas "Comment Apprendre Le Rappel".
- Sources fantomes ("selon une etude recente", citations Einstein bidon).

CE QU'IL FAUT FAIRE AU CONTRAIRE :
- Variation forte de longueur de phrase (nominale courte + moyenne + longue imbriquee).
- Au moins 1-2 phrases memorables qu'on aurait envie de citer.
- Partis pris assumes (anti-cage, anti-dominance, anti-fading).
- Digressions, parentheses, apartes : "(au passage, j'ai teste avec un Border l'an dernier)".
- Registre mixte : alterner familier ("franchement", "en vrai", "ca galere") / soutenu / technique.
- Nuance : "ca marche pour la plupart des chiens, mais sur les tres peureux, faut tester en douceur".
- References locales Suisse romande quand pertinent : Ballaigues, Vallorbe, Vaud, Lac de Joux, "ca joue", "septante".
- Humour / ironie quand le contexte le permet.
- Variation tonale : montee en intensite sur le point qui compte, retenue pour la nuance, fin frappante.
- Repetition assumee des mots : "chien" 10 fois c'est OK, pas besoin de varier en "canide/compagnon/animal/toutou".
- Questions interpellantes dans le corps (5-15% des phrases).

FORMAT DE REPONSE :
Reponds UNIQUEMENT avec le texte reecrit, sans introduction, sans commentaire, sans markdown fence, sans guillemets autour. Le texte reecrit doit pouvoir remplacer directement l'original dans la base de donnees. Garde la meme structure (markdown si markdown, HTML si HTML, plain text si plain text). Garde la meme longueur approximative (+/- 20%).`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const { admin_password, text, context, max_tokens } = body ?? {};

    const expectedPassword = Deno.env.get('ADMIN_PASSWORD') ?? '';
    if (!admin_password || admin_password !== expectedPassword) {
      return fail('Mot de passe incorrect', 401);
    }

    if (!text || typeof text !== 'string') {
      return fail('text manquant ou invalide', 400);
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
    if (!anthropicKey) return fail('ANTHROPIC_API_KEY manquante', 500);

    const userPrompt = `CONTEXTE : ${context ?? 'contenu CaniPlus'}

TEXTE ORIGINAL A REECRIRE :
"""
${text}
"""

Reecris ce texte en appliquant strictement les regles. Ne change pas le sens ni les faits, change le style.`;

    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: max_tokens ?? 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return fail(`Claude API error ${res.status}: ${errText}`, 500);
    }

    const data = await res.json();
    const rewritten = (data?.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim();

    if (!rewritten) return fail('Reponse Claude vide', 500);

    return ok({ rewritten_text: rewritten, original_length: text.length, rewritten_length: rewritten.length });

  } catch (e) {
    return fail(`Erreur serveur : ${(e as Error).message}`, 500);
  }
});
