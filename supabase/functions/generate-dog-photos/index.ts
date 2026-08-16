// generate-dog-photos
// Genere des photos de chien via Gemini 2.5 Flash Image (Nano Banana)
// selon un sujet, et upload les images sur Supabase Storage.
//
// Input  : {
//   bundle_id?: string,
//   prompt: string,
//   count?: number,                       // 1..6, defaut 1
//   aspect_ratio?: '1:1'|'4:5'|'16:9'|... // defaut '4:5'
//   style?: 'naturel'|'doux'|'raw',       // defaut 'naturel'
//   folder?: string,                      // sous-dossier de storage
// }
// Output : { urls, dimensions, prompt, model, aspect_ratio, duration_ms }
//
// v11 (16.08.2026) :
//   - preset de style 'naturel' : photo sur le vif au smartphone, grain,
//     imperfections volontaires. Le rendu leche facon banque d'images
//     trahissait l'IA (constat du 16.08 sur les couvertures d'articles).
//   - ratio passe par generationConfig.imageConfig.aspectRatio (parametre
//     natif de l'API) au lieu d'une simple phrase dans le prompt, qui
//     n'etait pas respectee (toutes les images sortaient en 1024x1024).
//   - dimensions reelles renvoyees (lecture du header PNG/JPEG) pour pouvoir
//     verifier que le ratio demande a bien ete applique.
//   - l'ancien preset (lumiere douce, ambiance bienveillante) reste
//     disponible sous style='doux'.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const GEMINI_MODEL = 'gemini-2.5-flash-image';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Ratios acceptes par l'API Gemini Image. Tout autre valeur -> 4:5.
const ALLOWED_RATIOS = new Set([
  '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
]);

// Interdiction de texte incruste : commune a tous les styles, ne jamais retirer.
// Gemini a tendance a ajouter des pancartes, sous-titres ou faux logos.
const NO_TEXT_RULE =
  "Aucun texte, aucune lettre, aucun chiffre, aucun logo, aucun filigrane, aucune pancarte nulle part dans l'image.";

const STYLE_PREFIXES: Record<string, string> = {
  // Style valide le 16.08.2026 (reference border collie) : on veut une photo
  // qui ressemble a celle qu'un proprietaire aurait prise avec son telephone,
  // pas a une photo de banque d'images.
  naturel: [
    "Photo prise sur le vif, style documentaire amateur au smartphone, en Suisse romande.",
    "Lumiere naturelle du moment, jamais d'eclairage d'appoint ni de retouche.",
    "Grain naturel, legere imperfection assumee : ciel un peu surexpose, cadrage spontane et pas parfaitement centre, mise au point qui aurait pu etre meilleure, pelage ebouriffe, herbes hautes ou branches qui passent devant.",
    "Si un humain apparait : vetements outdoor banals et un peu uses, cheveux au vent, attitude naturelle, jamais de regard camera pose.",
    "Interdits : pose studio, rendu leche, bokeh publicitaire, couleurs saturees, ciel retouche, chien parfaitement toilette, composition symetrique de magazine.",
    NO_TEXT_RULE,
  ].join(' '),
  // Ancien preset (v10) conserve pour compatibilite.
  doux: [
    "Photographie realiste de chien en Suisse romande, style education canine positive.",
    "Lumiere naturelle douce, ambiance bienveillante. Couleurs naturelles.",
    NO_TEXT_RULE,
  ].join(' '),
  // Le prompt du caller est envoye tel quel (hors regle anti-texte).
  raw: NO_TEXT_RULE,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const startedAt = Date.now();

  try {
    const {
      bundle_id,
      prompt,
      count = 1,
      aspect_ratio = '4:5',
      style = 'naturel',
      folder,
    } = await req.json();

    if (!prompt || typeof prompt !== 'string' || prompt.length < 5) {
      return jsonResponse({ error: 'prompt manquant ou trop court' }, 400);
    }
    if (count < 1 || count > 6) {
      return jsonResponse({ error: 'count doit etre entre 1 et 6' }, 400);
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return jsonResponse({ error: 'GEMINI_API_KEY manquant dans les secrets Supabase' }, 500);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Config Supabase manquante' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const ratio = ALLOWED_RATIOS.has(String(aspect_ratio)) ? String(aspect_ratio) : '4:5';
    const stylePrefix = STYLE_PREFIXES[String(style)] ?? STYLE_PREFIXES.naturel;
    const fullPrompt = `${stylePrefix}\n\n${prompt}`;

    const urls: string[] = [];
    const dimensions: Array<{ width: number; height: number } | null> = [];
    const errors: string[] = [];

    for (let i = 0; i < count; i++) {
      try {
        const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: count > 1 ? `${fullPrompt}\n\n(variation ${i + 1})` : fullPrompt }],
            }],
            generationConfig: {
              responseModalities: ['IMAGE'],
              temperature: 0.9,
              // Parametre natif de l'API : c'est lui qui fixe reellement le
              // cadrage. Une consigne de ratio dans le texte du prompt est
              // ignoree par le modele.
              imageConfig: { aspectRatio: ratio },
            },
          }),
        });

        if (!geminiRes.ok) {
          const txt = await geminiRes.text();
          errors.push(`gemini ${i + 1}: ${geminiRes.status} ${txt.slice(0, 300)}`);
          continue;
        }

        const data = await geminiRes.json();
        const parts = data?.candidates?.[0]?.content?.parts ?? [];
        const imagePart = parts.find((p: any) => p.inlineData?.data);

        if (!imagePart) {
          errors.push(`gemini ${i + 1}: pas d'image dans la reponse`);
          continue;
        }

        const base64 = imagePart.inlineData.data as string;
        const mimeType = (imagePart.inlineData.mimeType as string) || 'image/png';
        const ext = mimeType.split('/')[1] || 'png';

        // Decoder base64 vers Uint8Array (methode Deno-friendly).
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);

        const dir = folder || bundle_id || 'test';
        const filename = `${dir}/photo_${Date.now()}_${i + 1}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('editorial-images')
          .upload(filename, bytes, {
            contentType: mimeType,
            upsert: true,
          });

        if (uploadError) {
          errors.push(`upload ${i + 1}: ${uploadError.message}`);
          continue;
        }

        const { data: pub } = supabase.storage
          .from('editorial-images')
          .getPublicUrl(filename);
        urls.push(pub.publicUrl);
        dimensions.push(readImageSize(bytes));
      } catch (loopErr) {
        errors.push(`loop ${i + 1}: ${(loopErr as Error).message}`);
      }
    }

    return jsonResponse({
      urls,
      dimensions,
      errors: errors.length ? errors : undefined,
      prompt: fullPrompt,
      style: String(style),
      aspect_ratio: ratio,
      model: GEMINI_MODEL,
      duration_ms: Date.now() - startedAt,
    }, urls.length > 0 ? 200 : 500);
  } catch (err) {
    return jsonResponse({
      error: (err as Error).message,
      duration_ms: Date.now() - startedAt,
    }, 500);
  }
});

// Lit les dimensions depuis le header du fichier, sans decoder l'image :
// PNG -> chunk IHDR (offsets 16-24), JPEG -> marqueur SOFn.
// Permet de verifier que imageConfig.aspectRatio a bien ete applique.
function readImageSize(bytes: Uint8Array): { width: number; height: number } | null {
  try {
    // PNG : signature 89 50 4E 47
    if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    // JPEG : signature FF D8
    if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let off = 2;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      while (off + 9 < bytes.length) {
        if (bytes[off] !== 0xff) { off++; continue; }
        const marker = bytes[off + 1];
        // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
        const isSof = marker >= 0xc0 && marker <= 0xcf
          && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSof) {
          return { height: view.getUint16(off + 5), width: view.getUint16(off + 7) };
        }
        off += 2 + view.getUint16(off + 2);
      }
    }
  } catch (_) {
    // dimensions indisponibles : non bloquant
  }
  return null;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}
