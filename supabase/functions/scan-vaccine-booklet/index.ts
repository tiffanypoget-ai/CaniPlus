// supabase/functions/scan-vaccine-booklet/index.ts
// Analyse une photo de carnet de vaccination avec Claude Vision
// et retourne les données structurées (vaccins + dates)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY non configuré');

    const body = await req.json();
    const { image_base64, media_type } = body; // ex: "image/jpeg"
    if (!image_base64) throw new Error('image_base64 manquant');

    // ── Appel Claude Vision ────────────────────────────────────────────────
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: media_type ?? 'image/jpeg',
                  data: image_base64,
                },
              },
              {
                type: 'text',
                text: `Tu es un assistant vétérinaire. Analyse cette photo d'un carnet de vaccination de chien.

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

"confidence" vaut "high" si tu as pu lire clairement les dates, "medium" si quelques doutes, "low" si peu lisible.
Si l'image n'est pas un carnet de vaccination, réponds : { "error": "Image non reconnue comme carnet de vaccination" }`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} — ${err}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '';

    // ── Parser le JSON retourné par Claude ────────────────────────────────
    let parsed: Record<string, unknown>;
    try {
      // Extraire le JSON même si Claude a ajouté du texte autour
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Aucun JSON trouvé dans la réponse');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (_) {
      throw new Error('Impossible de parser la réponse : ' + text.slice(0, 200));
    }

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
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
