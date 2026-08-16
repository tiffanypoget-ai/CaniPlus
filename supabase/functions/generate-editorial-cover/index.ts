// supabase/functions/generate-editorial-cover/index.ts
// -----------------------------------------------------------------------------
// Image de couverture d'un bundle editorial (16.08.2026).
//
// Appelee :
//   - automatiquement par generate-editorial-bundle, au stade BROUILLON, pour
//     que Tiffany relise l'image en meme temps que le texte ;
//   - manuellement depuis l'editeur admin (bouton « Regenerer la couverture »),
//     via admin-auth-proxy.
//
// Ce qu'elle fait :
//   1. choisit une race de chien differente des 10 dernieres couvertures
//      (requete sur editorial_bundles.cover_breed), en variant aussi gabarit,
//      age et couleur de robe, et un decor coherent avec la saison ;
//   2. compose le prompt image : race + scene (content_blog.image_prompt,
//      produite par generate-editorial-bundle, sans mention de race) + decor ;
//   3. appelle generate-dog-photos (style 'naturel', 1 seul appel Gemini) ;
//   4. ecrit content_blog.cover_image_url / cover_image_alt,
//      editorial_bundles.instagram_image_url (image Instagram de secours tant
//      que les slides n'existent pas), cover_breed, image_generation_prompt et
//      image_generated_at.
//
// Input (format plat) : {
//   admin_password | cron_secret,
//   bundle_id: string,
//   aspect_ratio?: string,   // defaut 16:9 (og:image + Google Business)
//   scene_prompt?: string,   // force la scene, sinon content_blog.image_prompt
//   breed?: string,          // force la race, sinon choisie par le modele
//   chain_slides?: boolean,  // enchaine render-instagram-slides apres la couverture
// }
//
// Le chainage existe parce que les fonctions edge du plan gratuit ont un budget
// d'execution limite : generate-editorial-bundle declenche cette fonction sans
// attendre sa reponse, et tout le pipeline images tourne ici, avec son propre
// budget.
//
// Budget : 1 appel Gemini par couverture. Le choix de race/decor passe par un
// appel Claude Haiku (court, JSON), pas par Gemini.
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
// Choix de race + decor : tache courte et cadree, Haiku suffit largement.
const BREED_MODEL = 'claude-haiku-4-5-20251001';

// Ratio par defaut : la couverture sert d'og:image (vignette Facebook), d'image
// d'en-tete d'article et d'image Google Business. Le paysage est le bon
// compromis pour ces trois usages. Instagram passe par les slides brandees.
const DEFAULT_RATIO = '16:9';

function ok(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function fail(message: string, status = 400) { return ok({ error: message }, status); }

// Saison de publication (hemisphere nord, Suisse romande) a partir de la date
// de publication prevue, sinon de la date du jour.
function seasonFor(date: Date): { name: string; hints: string } {
  const m = date.getUTCMonth() + 1;
  if (m === 12 || m <= 2) {
    return {
      name: 'hiver',
      hints: 'arbres nus, sol gele ou neige tassee, lumiere rasante et grise, humains en veste epaisse et bonnet',
    };
  }
  if (m <= 5) {
    return {
      name: 'printemps',
      hints: 'herbe encore courte et humide, bourgeons, ciel changeant, boue sur les chemins, humains en coupe-vent',
    };
  }
  if (m <= 8) {
    return {
      name: 'ete',
      hints: 'herbes hautes et seches, lumiere dure de milieu de journee, ombre des arbres, humains en t-shirt',
    };
  }
  return {
    name: 'automne',
    hints: 'feuilles au sol, brume matinale, couleurs terreuses, humains en pull et bottes',
  };
}

// Decors possibles : la liste sert d'inspiration au modele, pas de carcan.
const DECORS = [
  'pre jurassien en pente',
  'lisiere de foret',
  'ruelle ou place de village vaudois',
  "terrain d'education canine avec quelques agres discrets",
  'interieur de maison, salon ou cuisine',
  'chemin de campagne entre deux champs',
  'berge du lac de Joux',
  'parking de depart de balade, coffre de voiture ouvert',
];

async function callClaude(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: BREED_MODEL,
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data?.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim();
}

function safeParseJson(raw: string): any {
  let cleaned = raw.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startedAt = Date.now();

  try {
    const body = await req.json().catch(() => ({} as any));
    const {
      admin_password,
      cron_secret,
      bundle_id,
      aspect_ratio,
      scene_prompt,
      breed: forcedBreed,
      chain_slides,
    } = body ?? {};

    const expectedAdmin = Deno.env.get('ADMIN_PASSWORD') ?? '';
    const expectedCron = Deno.env.get('CRON_SECRET') ?? '';
    const isAdmin = !!admin_password && !!expectedAdmin && admin_password === expectedAdmin;
    const isCron = !!cron_secret && !!expectedCron && cron_secret === expectedCron;
    if (!isAdmin && !isCron) return fail('Authentification requise.', 401);
    if (!bundle_id) return fail('bundle_id manquant.', 400);

    const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supaUrl, serviceKey);

    const { data: bundle, error: e1 } = await supabase
      .from('editorial_bundles')
      .select('id, theme, theme_description, content_blog, cover_breed, scheduled_for, published_at, status')
      .eq('id', bundle_id)
      .single();
    if (e1) throw e1;
    if (!bundle) return fail('Bundle introuvable.', 404);

    const blog = (bundle.content_blog ?? {}) as Record<string, any>;
    const scene = String(scene_prompt ?? blog.image_prompt ?? '').trim();

    // ── 1. Races a exclure : les 10 dernieres couvertures non rejetees ────────
    const { data: recent } = await supabase
      .from('editorial_bundles')
      .select('cover_breed, created_at')
      .not('cover_breed', 'is', null)
      .neq('status', 'rejected')
      .neq('id', bundle_id)
      .order('created_at', { ascending: false })
      .limit(10);

    const excluded: string[] = [];
    for (const r of recent ?? []) {
      const b = String((r as any).cover_breed ?? '').trim();
      if (b && !excluded.some(x => x.toLowerCase() === b.toLowerCase())) excluded.push(b);
    }

    const when = new Date(bundle.scheduled_for ?? bundle.published_at ?? Date.now());
    const season = seasonFor(when);

    // ── 2. Choix race + decor + alt ──────────────────────────────────────────
    let breed = String(forcedBreed ?? '').trim();
    let subjectSentence = '';
    let decor = '';
    let alt = '';

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
    if (!anthropicKey) return fail('ANTHROPIC_API_KEY manquante.', 500);

    const choicePrompt = `Tu prepares la photo de couverture d'un article du club canin CaniPlus (Ballaigues, Suisse romande).

THEME DE L'ARTICLE : ${bundle.theme}
${bundle.theme_description ? `Contexte : ${bundle.theme_description}` : ''}
SCENE VOULUE (deja ecrite, sans mention de race) : ${scene || '(non precisee, invente une scene simple liee au theme)'}
SAISON DE PUBLICATION : ${season.name} (${season.hints})

RACES DEJA UTILISEES SUR LES DERNIERES COUVERTURES, INTERDITES ICI :
${excluded.length ? excluded.map(b => `- ${b}`).join('\n') : '(aucune, tu es libre)'}

${breed ? `RACE IMPOSEE : ${breed}. Tu dois l'utiliser telle quelle.` : `CHOISIS UNE RACE :
- librement, dans toute la diversite canine : chiens de berger, chiens de chasse, terriers, primitifs, molosses, chiens nordiques, petits chiens de compagnie, levriers, croises de refuge sans race identifiable, etc.
- credible chez un proprietaire de Suisse romande (pas de race exotique improbable)
- differente de TOUTES les races interdites ci-dessus, et pas non plus une variante ou une cousine proche de l'une d'elles (si "border collie" est interdit, ne propose ni "colley" ni "berger australien" ; si "cocker spaniel" est interdit, ne propose pas "springer spaniel")
- change aussi de FAMILLE par rapport aux 3 dernieres couvertures : si c'etaient des chiens de berger, passe a autre chose (chien de chasse, terrier, molosse, nordique, petit chien de compagnie, levrier, croise de refuge)
- varie le gabarit, l'age (chiot, adulte, senior) et la couleur de robe par rapport aux couvertures precedentes`}

CHOISIS AUSSI UN DECOR, coherent avec la scene et la saison. Inspirations possibles :
${DECORS.map(d => `- ${d}`).join('\n')}

Reponds UNIQUEMENT en JSON, sans texte autour :
{
  "breed": "nom de la race en francais, ou 'croise' + description courte si c'est un croise",
  "subject": "une phrase decrivant le chien : race, age, gabarit, couleur de robe, allure. Pas de nom propre.",
  "decor": "une phrase decrivant le lieu et la lumiere, coherents avec la saison",
  "alt": "texte alternatif de l'image pour l'accessibilite : une phrase factuelle en francais qui decrit ce qu'on voit, sans emoji, sans tiret cadratin, max 150 caracteres"
}`;

    try {
      const parsed = safeParseJson(await callClaude(anthropicKey, choicePrompt));
      breed = String(parsed.breed ?? breed ?? '').trim();
      subjectSentence = String(parsed.subject ?? '').trim();
      decor = String(parsed.decor ?? '').trim();
      alt = String(parsed.alt ?? '').trim();
    } catch (e) {
      // Filet : sans choix du modele, on part sur un croise de refuge, jamais
      // sur une race deja utilisee.
      console.warn(`[cover] choix race echoue : ${(e as Error).message}`);
      if (!breed) breed = 'croise de refuge';
      subjectSentence = `Un ${breed} adulte de taille moyenne, pelage ordinaire, allure detendue.`;
      decor = `${DECORS[when.getUTCDate() % DECORS.length]}, ${season.hints}`;
    }

    if (!breed) return fail('Impossible de determiner une race pour la couverture.', 500);

    // ── 3. Prompt image et appel Gemini (1 seul) ─────────────────────────────
    // Le modele ponctue deja ses phrases : on evite les ".." en fin de segment.
    const sentence = (s: string) => {
      const t = s.trim();
      return !t ? '' : (/[.!?]$/.test(t) ? t : `${t}.`);
    };
    const imagePrompt = [
      sentence(subjectSentence || `Un ${breed}`),
      sentence(scene),
      decor ? sentence(`Decor : ${decor}`) : '',
      `Nous sommes en ${season.name} en Suisse romande.`,
    ].filter(Boolean).join(' ');

    const ratio = String(aspect_ratio ?? DEFAULT_RATIO);

    const genRes = await fetch(`${supaUrl}/functions/v1/generate-dog-photos`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bundle_id,
        prompt: imagePrompt,
        count: 1,
        aspect_ratio: ratio,
        style: 'naturel',
        folder: `${bundle_id}/cover`,
      }),
    });
    const genJson = await genRes.json().catch(() => ({} as any));
    const coverUrl: string | undefined = Array.isArray(genJson?.urls) ? genJson.urls[0] : undefined;

    if (!coverUrl) {
      return ok({
        error: `generate-dog-photos : ${genJson?.error ?? genJson?.errors?.join(' | ') ?? `status ${genRes.status}`}`,
        breed,
        prompt: imagePrompt,
        duration_ms: Date.now() - startedAt,
      }, 502);
    }

    // ── 4. Ecriture dans le bundle ───────────────────────────────────────────
    if (!alt) {
      alt = `${breed} ${scene ? `en situation : ${scene}` : "en balade en Suisse romande"}`.slice(0, 150);
    }

    const nextBlog = {
      ...blog,
      cover_image_url: coverUrl,
      cover_image_alt: alt,
    };

    const { data: updated, error: e2 } = await supabase
      .from('editorial_bundles')
      .update({
        content_blog: nextBlog,
        cover_breed: breed,
        // Image Instagram de secours : utilisee seulement si les slides
        // brandees ne sont pas disponibles au moment de la publication.
        instagram_image_url: coverUrl,
        image_generation_prompt: imagePrompt,
        image_generated_at: new Date().toISOString(),
      })
      .eq('id', bundle_id)
      .select('id, cover_breed, instagram_image_url, content_blog, image_generated_at')
      .single();
    if (e2) throw e2;

    // ── 5. Slides Instagram, si on est dans le pipeline de generation ────────
    // Echec non bloquant : la couverture est deja enregistree, et l'editeur
    // admin signale l'absence de slides.
    let slides: unknown = undefined;
    if (chain_slides) {
      try {
        const sr = await fetch(`${supaUrl}/functions/v1/render-instagram-slides`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bundle_id,
            admin_password: Deno.env.get('ADMIN_PASSWORD') ?? '',
            cron_secret: Deno.env.get('CRON_SECRET') ?? '',
          }),
        });
        const sj = await sr.json().catch(() => ({} as any));
        slides = sj?.error ? { error: sj.error } : { count: sj?.count ?? 0 };
      } catch (e) {
        slides = { error: (e as Error).message };
      }
    }

    return ok({
      success: true,
      bundle: updated,
      slides,
      cover_image_url: coverUrl,
      cover_image_alt: alt,
      cover_breed: breed,
      excluded_breeds: excluded,
      season: season.name,
      aspect_ratio: ratio,
      dimensions: Array.isArray(genJson?.dimensions) ? genJson.dimensions[0] : null,
      prompt: imagePrompt,
      duration_ms: Date.now() - startedAt,
    });
  } catch (e) {
    return fail(`Erreur serveur : ${(e as Error).message}`, 500);
  }
});
