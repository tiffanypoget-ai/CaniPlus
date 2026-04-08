// supabase/functions/scan-vaccine-booklet/index.ts
// Analyse une photo de carnet de vaccination avec Groq (llama-4-scout vision)
// Flow: base64 → upload Supabase Storage → URL publique → Groq → JSON

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROMPT = `Tu es un assistant vétérinaire. Analyse cette photo d'un carnet de vaccination de chien.

Extrais UNIQUEMENT les informations de vaccination visibles. Pour chaque vaccin trouvé, identifie :
- Le nom du vaccin (mappe vers l'une de ces catégories si possible : "Rage", "CHPL", "Leptospirose", "Toux du chenil")
- La date du dernier vaccin administré (format YYYY-MM-DD)
- La date du prochain rappel si indiquée (format YYYY-MM-DD)

Si une date n'est pas lisible ou absente, mets null.

Réponds UNIQUEMENT avec du JSON valide, sans texte avant ni après, au format exactement :
{
  "vaccines": [
    { "name": "Rage", "last_date": "2023-05-15", "next_due_date": "2026-05-15" },
    { "name": "CHPL", "last_date": "2023-05-15", "next_due_date": "2026-05-15" },
    { "name": "Leptospirose", "last_date": "2023-05-15", "next_due_date": "2024-05-15" },
    { "name": "Toux du chenil", "last_date": null, "next_due_date": null }
  ],
  "dog_name": "Rex",
  "chip_number": "756...",
  "birth_date": "2020-03-10",
  "confidence": "high"
}

"confidence" vaut "high" si les dates sont clairement lisibles, "medium" si quelques doutes, "low" si peu lisible.
Si l'image n'est pas un carnet de vaccination, réponds : { "error": "Image non reconnue comme carnet de vaccination" }`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const tempPath = `scans/temp_${Date.now()}.jpg`;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY non configuré');

    const body = await req.json();
    const { image_base64, media_type } = body;
    if (!image_base64) throw new Error('image_base64 manquant');

    // ── 1. Décoder le base64 en bytes ─────────────────────────────────────
    const binary = atob(image_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    // ── 2. Upload temporaire dans Supabase Storage ────────────────────────
    const { error: upErr } = await supabase.storage
      .from('dog-photos')
      .upload(tempPath, bytes, {
        contentType: media_type ?? 'image/jpeg',
        upsert: true,
      });
    if (upErr) throw new Error('Upload storage: ' + upErr.message);

    const { data: urlData } = supabase.storage.from('dog-photos').getPublicUrl(tempPath);
    const imageUrl = urlData.publicUrl;

    // ── 3. Appel Groq Vision ──────────────────────────────────────────────
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: PROMPT },
          ],
        }],
        max_tokens: 1024,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Groq API error: ${response.status} — ${err}`);
    }

    const groqData = await response.json();
    const text = groqData.choices?.[0]?.message?.content ?? '';
    if (!text) throw new Error('Réponse vide de Groq');

    // ── 4. Parser le JSON ─────────────────────────────────────────────────
    let parsed: Record<string, unknown>;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Aucun JSON trouvé');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (_) {
      throw new Error('Impossible de parser : ' + text.slice(0, 300));
    }

    // ── 5. Supprimer l'image temporaire ───────────────────────────────────
    await supabase.storage.from('dog-photos').remove([tempPath]);

    if (parsed.error) {
      return new Response(JSON.stringify({ error: parsed.error }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    // Nettoyage en cas d'erreur
    await supabase.storage.from('dog-photos').remove([tempPath]).catch(() => {});
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
