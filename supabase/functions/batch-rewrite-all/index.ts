// supabase/functions/batch-rewrite-all/index.ts
// Reecrit en batch tout le contenu CaniPlus en base (resources, digital_products, news)
// Auth : admin_password.
// Output : { processed, errors }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

TA MISSION : reecrire pour qu'il ne sonne PAS IA. Garde le sens, les chiffres et faits exacts. Change le style.

CHARTE CaniPlus :
- Tutoiement systematique. Jamais "vous".
- Aucun emoji.
- Jamais : "dominant", "dominance", "alpha", "soumission", "chef de meute".
- Jamais : recommander cage, crate ou parc.
- Recompense : 3 niveaux (BASE kibble, MOYEN friandises classiques, HAUTE VALEUR fromage/poulet/foie). Le verbal seul N'EST PAS une recompense. ON NE RETIRE JAMAIS LA FRIANDISE.
- Protocoles par ETAPE jamais par jour. Aucun calendrier. Aucune frequence rigide. Aucun nombre fixe de repetitions. Criteres qualitatifs uniquement.
- Methodes : renforcement positif et langage canin uniquement.
- Grammaire pronominale : "Ton chien SE gratte" pas "Ton chien gratte".

ANTI-TICS IA — INTERDICTIONS STRICTES :
- VOCABULAIRE BANNI : crucial, essentiel, indispensable, primordial, fondamental, robuste, holistique, profond, veritable, fascinant, captivant, vibrant, riche, unique, dynamique, innovant, revolutionnaire, exceptionnel, transformateur, plonger dans, explorer, decortiquer, demystifier, naviguer dans le paysage, au coeur de, a l'ere de, dans le paysage de, pierre angulaire, tisser des liens, ouvrir la voie, levier puissant, jeter les bases, voyage / aventure / cheminement / parcours, tirer parti de, mettre en oeuvre des strategies, optimiser les processus, approche holistique, ecosysteme, synergie, defi a relever, opportunite d'apprentissage.
- DOUBLETS SYNONYMES : "crucial et essentiel", "robuste et fiable", etc. Un seul adjectif.
- ADVERBES EN -MENT : notamment (le PIRE), particulierement, specifiquement, essentiellement, fondamentalement. Max 1/paragraphe.
- CONNECTEURS MECANIQUES : "par ailleurs", "en outre", "il convient de noter", "dans cette optique", "cela etant dit". Max 3/500 mots.
- CONCLUSIONS AMPOULEES : "en somme", "en conclusion", "en definitive", "au final".
- TIRETS CADRATIN (—) ET DEMI-CADRATIN (–) : remplacer par virgule, parentheses, point, deux-points. Tiret simple (-) OK pour mots composes.
- ELLIPSES DE SUSPENSE (...) : aucun titre/excerpt ne se termine par "...".
- REGLE DE TROIS, pseudo-equilibre "d'un cote… de l'autre", "non seulement… mais aussi", participes presents accumules.
- Sections "Conclusion" / "Heritage" : interdites.
- Listes calibrees 3/5/7/10 items.
- Sur-structuration H4/H5.
- Titres en forme de question.
- Sources fantomes.

CE QU'IL FAUT FAIRE :
- Variation de longueur de phrase (nominale courte + moyenne + longue).
- 1-2 phrases memorables qu'on aurait envie de citer.
- Partis pris assumes (anti-cage, anti-dominance, anti-fading).
- Digressions, parentheses, apartes.
- Registre mixte : familier ("franchement", "en vrai", "ca galere") + soutenu + technique.
- Nuance ("ca marche pour la plupart, mais sur les tres peureux, faut tester en douceur").
- References locales Suisse romande quand pertinent : Ballaigues, Vallorbe, Vaud, Lac de Joux, "ca joue", "septante".
- Humour / ironie quand le contexte le permet.
- Repetition assumee des mots.
- Questions interpellantes dans le corps (5-15%).

FORMAT : reponds UNIQUEMENT avec le texte reecrit, sans intro, sans markdown fence, sans guillemets autour. Garde la meme structure (markdown si markdown, plain text si plain text). Garde la meme longueur (+/- 20%).`;

async function rewriteText(apiKey: string, text: string, context: string, maxTokens = 4096): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `CONTEXTE : ${context}\n\nTEXTE ORIGINAL :\n"""\n${text}\n"""\n\nReecris en appliquant les regles. Garde le sens, change le style.`,
      }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const rewritten = (data?.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim();

  if (!rewritten) throw new Error('Reponse Claude vide');
  return rewritten;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const { admin_password, dry_run, only_ids } = body ?? {};

    const expectedPassword = Deno.env.get('ADMIN_PASSWORD') ?? '';
    if (!admin_password || admin_password !== expectedPassword) {
      return fail('Mot de passe incorrect', 401);
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
    if (!anthropicKey) return fail('ANTHROPIC_API_KEY manquante', 500);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const processed: any[] = [];
    const errors: any[] = [];

    // 1. resources avec content textuel
    const { data: resources } = await supabase
      .from('resources')
      .select('id, title, description, content')
      .order('created_at', { ascending: false });

    for (const r of (resources ?? [])) {
      if (only_ids && !only_ids.includes(r.id)) continue;
      try {
        const updates: Record<string, unknown> = {};
        if (r.title) {
          updates.title = await rewriteText(anthropicKey, r.title, `Titre d'une ressource premium CaniPlus categorie "${r.title.slice(0, 30)}"`, 256);
        }
        if (r.description) {
          updates.description = await rewriteText(anthropicKey, r.description, `Description courte d'une ressource premium CaniPlus titre "${r.title}"`, 512);
        }
        if (r.content && r.content.length > 50) {
          updates.content = await rewriteText(anthropicKey, r.content, `Contenu complet d'une ressource premium CaniPlus titre "${r.title}". Format markdown.`, 4096);
        }
        if (Object.keys(updates).length > 0 && !dry_run) {
          const { error: upErr } = await supabase.from('resources').update(updates).eq('id', r.id);
          if (upErr) throw upErr;
        }
        processed.push({ table: 'resources', id: r.id, title: r.title, fields: Object.keys(updates) });
      } catch (e) {
        errors.push({ table: 'resources', id: r.id, title: r.title, error: (e as Error).message });
      }
    }

    // 2. digital_products (metadonnees seulement)
    const { data: products } = await supabase
      .from('digital_products')
      .select('id, title, subtitle, description, long_description, bullet_points')
      .order('created_at', { ascending: false });

    for (const p of (products ?? [])) {
      if (only_ids && !only_ids.includes(p.id)) continue;
      try {
        const updates: Record<string, unknown> = {};
        if (p.title) {
          updates.title = await rewriteText(anthropicKey, p.title, `Titre d'un guide payant CaniPlus`, 256);
        }
        if (p.subtitle) {
          updates.subtitle = await rewriteText(anthropicKey, p.subtitle, `Sous-titre d'un guide payant CaniPlus titre "${p.title}"`, 256);
        }
        if (p.description) {
          updates.description = await rewriteText(anthropicKey, p.description, `Description courte du guide "${p.title}"`, 512);
        }
        if (p.long_description) {
          updates.long_description = await rewriteText(anthropicKey, p.long_description, `Description longue du guide "${p.title}". Format markdown.`, 2048);
        }
        if (Array.isArray(p.bullet_points) && p.bullet_points.length > 0) {
          const joined = p.bullet_points.join('\n');
          const rewrittenJoined = await rewriteText(anthropicKey, joined, `Bullet points du guide "${p.title}". Garde un bullet par ligne.`, 1024);
          updates.bullet_points = rewrittenJoined.split('\n').map((s: string) => s.replace(/^[-*•]\s*/, '').trim()).filter((s: string) => s.length > 0);
        }
        if (Object.keys(updates).length > 0 && !dry_run) {
          const { error: upErr } = await supabase.from('digital_products').update(updates).eq('id', p.id);
          if (upErr) throw upErr;
        }
        processed.push({ table: 'digital_products', id: p.id, title: p.title, fields: Object.keys(updates) });
      } catch (e) {
        errors.push({ table: 'digital_products', id: p.id, title: p.title, error: (e as Error).message });
      }
    }

    // 3. news
    const { data: news } = await supabase
      .from('news')
      .select('id, title, content')
      .order('created_at', { ascending: false });

    for (const n of (news ?? [])) {
      if (only_ids && !only_ids.includes(n.id)) continue;
      try {
        const updates: Record<string, unknown> = {};
        if (n.title) {
          updates.title = await rewriteText(anthropicKey, n.title, `Titre d'une news interne CaniPlus`, 256);
        }
        if (n.content && n.content.length > 50) {
          updates.content = await rewriteText(anthropicKey, n.content, `Contenu d'une news interne CaniPlus titre "${n.title}"`, 2048);
        }
        if (Object.keys(updates).length > 0 && !dry_run) {
          const { error: upErr } = await supabase.from('news').update(updates).eq('id', n.id);
          if (upErr) throw upErr;
        }
        processed.push({ table: 'news', id: n.id, title: n.title, fields: Object.keys(updates) });
      } catch (e) {
        errors.push({ table: 'news', id: n.id, title: n.title, error: (e as Error).message });
      }
    }

    return ok({
      success: true,
      dry_run: !!dry_run,
      total_processed: processed.length,
      total_errors: errors.length,
      processed,
      errors,
    });

  } catch (e) {
    return fail(`Erreur serveur : ${(e as Error).message}`, 500);
  }
});
