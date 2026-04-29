// supabase/functions/newsletter-subscribe/index.ts
// -----------------------------------------------------------------------------
// Inscription a la newsletter CaniPlus via Brevo (anciennement Sendinblue).
//
// Utilise pour :
//   - le formulaire "Etre informe-e" du rallye canin sur le site vitrine
//   - le formulaire d'inscription newsletter (footer ou page dediee)
//   - tout autre point d'entree d'inscription
//
// Cree (ou met a jour) le contact dans la liste Brevo configuree, avec ses
// attributs FIRSTNAME et SOURCE (utile pour analyser d'ou viennent les
// inscriptions). N'envoie PAS de mail de confirmation lui-meme : Brevo s'en
// charge si le double opt-in est active sur la liste.
//
// Auth : aucune (endpoint public utilise par le site vitrine).
// Variables d'env Supabase requises :
//   BREVO_API_KEY    cle API v3 (xkeysib-...)
//   BREVO_LIST_ID    id numerique de la liste (ex: 2)
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BREVO_API_URL = 'https://api.brevo.com/v3';

function ok(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function fail(message: string, status = 400) { return ok({ error: message }, status); }

// Valide un email basiquement (anti-typo, pas garantie d'existence)
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('POST attendu', 405);

  const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
  const listId = Number(Deno.env.get('BREVO_LIST_ID') ?? '0');
  if (!apiKey)  return fail('BREVO_API_KEY manquante cote serveur', 500);
  if (!listId)  return fail('BREVO_LIST_ID manquante cote serveur', 500);

  let body: any;
  try { body = await req.json(); } catch { return fail('Corps JSON invalide', 400); }

  const email     = String(body?.email ?? '').trim().toLowerCase();
  const firstname = String(body?.firstname ?? body?.prenom ?? '').trim().slice(0, 80);
  const source    = String(body?.source ?? 'site').trim().slice(0, 40);

  if (!email)             return fail('Email manquant', 400);
  if (!isValidEmail(email)) return fail('Email invalide', 400);

  // Brevo : POST /contacts cree le contact OU renvoie 400 si deja existant.
  // updateEnabled:true permet de mettre a jour les attributs et d'ajouter aux
  // nouvelles listes meme si le contact existe deja.
  const payload = {
    email,
    attributes: {
      ...(firstname ? { FIRSTNAME: firstname } : {}),
      SOURCE: source,
    },
    listIds: [listId],
    updateEnabled: true,
  };

  try {
    const res = await fetch(`${BREVO_API_URL}/contacts`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        'accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // 201 = cree, 204 = mis a jour. Les deux sont OK.
    if (res.status === 201 || res.status === 204) {
      // Notifie l'admin (uniquement si nouveau contact, pas si juste mise a jour)
      if (res.status === 201) {
        try {
          const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
          if (supaUrl && serviceKey) {
            await fetch(`${supaUrl}/functions/v1/notify-admin`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                kind: 'newsletter_signup',
                title: 'Nouvelle inscription newsletter',
                body: `${email}${firstname ? ' (' + firstname + ')' : ''} via ${source}`,
                metadata: { email, firstname, source },
              }),
            });
          }
        } catch { /* notif admin n'empeche pas la reponse positive */ }
      }
      return ok({ success: true, email, list_id: listId, created: res.status === 201 });
    }

    // En cas d'erreur, on renvoie le message de Brevo pour debug
    let errMsg = `Brevo API a renvoye ${res.status}`;
    try {
      const data = await res.json();
      if (data?.message) errMsg = data.message;
    } catch { /* pas de body JSON */ }
    return fail(`Inscription impossible : ${errMsg}`, 502);
  } catch (e) {
    return fail(`Erreur reseau Brevo : ${(e as Error).message}`, 502);
  }
});
