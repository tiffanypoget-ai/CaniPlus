// supabase/functions/submit-adhesion/index.ts
// -----------------------------------------------------------------------------
// Réception des demandes d'adhésion du formulaire public caniplus.ch/adhesion.
//
// Flux en 2 temps (le fichier RC ne transite pas par la fonction) :
//   1. action 'submit'   : valide les champs, insère adhesions + adhesion_chiens,
//                          renvoie une URL signée d'upload pour l'attestation RC.
//   2. action 'finalize' : vérifie que le fichier est bien dans le bucket,
//                          enregistre le chemin, envoie l'e-mail de confirmation
//                          au demandeur (Brevo) et notifie l'admin (notify-admin).
//
// Anti-spam : honeypot (champ "website") → réponse OK silencieuse sans insert.
// Le statut « membre » n'est acquis qu'après validation dans l'admin
// (edge function validate-adhesion).
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET = 'attestations-rc';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Mo
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'];

const BREVO_API_URL = 'https://api.brevo.com/v3';
const SENDER = { name: 'CaniPlus', email: 'info@caniplus.ch' };

function ok(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function fail(message: string, status = 400) { return ok({ error: message }, status); }

// Cotisation : 150 CHF/an/chien jusqu'au 29 juin 2026, puis 75 CHF/chien pour
// les nouvelles inscriptions en cours d'année (dès le 30 juin 2026).
// Barème 2027 (200/150/100 par foyer) : mention informative uniquement —
// la bascule technique sera programmée le moment venu, sur décision de Tiffany.
const COTISATION_BASCULE = new Date('2026-06-30T00:00:00+02:00');

function cotisationTexte(nbChiens: number, d = new Date()): string {
  const n = Math.max(nbChiens, 1);
  const prix = d >= COTISATION_BASCULE ? 75 : 150;
  const unite = d >= COTISATION_BASCULE
    ? `${prix} CHF par chien inscrit (inscription en cours d'année)`
    : `${prix} CHF par chien inscrit`;
  const total = n > 1 ? ` (${prix * n} CHF pour ${n} chiens)` : '';
  return `Cotisation : ${unite}${total}. Dès 2027 : 200 CHF pour le 1er chien du foyer, 150 CHF pour le 2e, 100 CHF dès le 3e.`;
}

function isEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

function sanitizeFilename(name: string): string {
  const base = (name || 'attestation').split(/[\\/]/).pop() || 'attestation';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

async function sendBrevoEmail(to: { email: string; name: string }, subject: string, html: string) {
  const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
  if (!apiKey) return { ok: false, error: 'BREVO_API_KEY manquante' };
  const r = await fetch(`${BREVO_API_URL}/smtp/email`, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify({ sender: SENDER, to: [to], subject, htmlContent: html }),
  });
  if (!r.ok) {
    let msg = `Brevo ${r.status}`;
    try { const j = await r.json(); if (j?.message) msg = j.message; } catch { /* noop */ }
    return { ok: false, error: msg };
  }
  return { ok: true };
}

function emailConfirmationHtml(prenom: string, chiens: { nom: string }[]) {
  const nomsChiens = chiens.map((c) => c.nom).join(', ');
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8F5F0;font-family:Inter,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8F5F0;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:24px 32px;background:#1F1F20;">
        <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#2BABE1;font-weight:600;">CaniPlus &middot; Ballaigues</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <h2 style="margin:0 0 14px 0;font-family:Georgia,serif;font-size:22px;color:#1F1F20;">Merci ${prenom} ! 🐾</h2>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#374151;">
          Ta demande d'adhésion est bien arrivée. Elle est entre les pattes du comité :
          tu recevras un e-mail dès qu'elle est validée.
        </p>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#374151;">
          <strong>Chien${chiens.length > 1 ? 's' : ''} inscrit${chiens.length > 1 ? 's' : ''} :</strong> ${nomsChiens}
        </p>
        <div style="background:#E8F6FC;border-radius:12px;padding:16px 20px;margin:0 0 14px 0;">
          <p style="margin:0;font-size:14px;line-height:1.6;color:#176E94;">
            <strong>${cotisationTexte(chiens.length)}</strong><br>
            Tu recevras les infos de paiement après validation de ton adhésion par le comité.
          </p>
        </div>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
          Une question entre-temps ? Réponds simplement à cet e-mail.
        </p>
      </td></tr>
      <tr><td style="padding:18px 32px;background:#F8F5F0;font-size:12px;color:#6b7280;text-align:center;">
        CaniPlus &middot; Club canin de Ballaigues &middot; caniplus.ch
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Méthode non autorisée', 405);

  let body: any = {};
  try { body = await req.json(); } catch { return fail('Corps de requête invalide'); }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const action = body?.action ?? 'submit';

  // ---------------------------------------------------------------- SUBMIT --
  if (action === 'submit') {
    // Honeypot : on répond comme si tout allait bien, sans rien enregistrer.
    if (typeof body?.website === 'string' && body.website.trim() !== '') {
      return ok({ success: true, adhesion_id: crypto.randomUUID(), honeypot: undefined });
    }

    const f = body?.form ?? {};
    const chiens = Array.isArray(body?.chiens) ? body.chiens : [];
    const att = body?.attestation ?? {};

    // Validations serveur (mêmes règles que le client, jamais confiance au client)
    const required: [string, string][] = [
      ['nom', 'ton nom'], ['prenom', 'ton prénom'], ['adresse', 'ton adresse'],
      ['npa_localite', 'ton NPA et ta localité'], ['telephone', 'ton numéro de téléphone'],
    ];
    for (const [key, label] of required) {
      if (typeof f[key] !== 'string' || f[key].trim() === '') {
        return fail(`Il manque ${label}.`);
      }
    }
    const email = String(f.email ?? '').trim().toLowerCase();
    if (!isEmail(email)) return fail('Vérifie ton adresse e-mail, le format ne semble pas valide.');
    if (f.consentement_confidentialite !== true) {
      return fail('Pour envoyer ta demande, tu dois accepter la politique de confidentialité.');
    }
    if (chiens.length === 0) return fail('Ajoute au moins un chien à ta demande.');
    for (const c of chiens) {
      if (typeof c?.nom !== 'string' || c.nom.trim() === '') return fail('Chaque chien doit avoir un nom.');
      if (typeof c?.numero_amicus !== 'string' || c.numero_amicus.trim() === '') {
        return fail(`Il manque le numéro Amicus de ${c.nom || 'ton chien'}.`);
      }
      if (typeof c?.vaccins_a_jour !== 'boolean') {
        return fail(`Indique si les vaccins de ${c.nom} sont à jour.`);
      }
      // Le sexe conditionne les libellés de stérilisation et sert en cours.
      if (c?.sexe !== 'M' && c?.sexe !== 'F') {
        return fail(`Indique le sexe de ${c.nom}.`);
      }
    }
    if (!att?.filename || typeof att.filename !== 'string') {
      return fail("Ajoute une photo ou un PDF de ton attestation RC privée.");
    }
    if (!ALLOWED_TYPES.includes(att.type)) {
      return fail('Format de fichier non accepté. Utilise un PDF, JPG, PNG ou HEIC.');
    }
    if (typeof att.size !== 'number' || att.size <= 0 || att.size > MAX_FILE_SIZE) {
      return fail('Le fichier est trop lourd (10 Mo maximum).');
    }

    // Une seule demande active par e-mail
    const { data: existing } = await supabase
      .from('adhesions')
      .select('id, statut')
      .ilike('email', email)
      .in('statut', ['en_attente', 'validee'])
      .maybeSingle();
    if (existing) {
      return fail(existing.statut === 'en_attente'
        ? 'On a déjà bien reçu ta demande, le comité s\'en occupe. Pas besoin de la renvoyer.'
        : 'Cette adresse e-mail correspond déjà à un membre. Écris-nous à info@caniplus.ch si besoin.');
    }

    const { data: adhesion, error: insErr } = await supabase
      .from('adhesions')
      .insert({
        nom: f.nom.trim(),
        prenom: f.prenom.trim(),
        adresse: f.adresse.trim(),
        npa_localite: f.npa_localite.trim(),
        telephone: f.telephone.trim(),
        email,
        invoice_method: f.invoice_method === 'papier' ? 'papier' : 'mail',
        consentement_photos: f.consentement_photos === true,
        consentement_confidentialite: true,
        consentements_horodatage: new Date().toISOString(),
      })
      .select('id, finalize_token')
      .single();
    if (insErr) return fail(`Enregistrement impossible : ${insErr.message}`, 500);

    const chienRows = chiens.map((c: any) => ({
      adhesion_id: adhesion.id,
      nom: c.nom.trim(),
      race: typeof c.race === 'string' && c.race.trim() !== '' ? c.race.trim() : null,
      date_naissance: c.date_naissance || null,
      numero_amicus: c.numero_amicus.trim(),
      sexe: c.sexe,
      etat: typeof c.etat === 'string' && c.etat.trim() !== '' ? c.etat.trim() : null,
      date_acquisition: c.date_acquisition || null,
      provenance: typeof c.provenance === 'string' && c.provenance.trim() !== '' ? c.provenance.trim() : null,
      vaccins_a_jour: c.vaccins_a_jour,
      date_dernier_rappel: c.date_dernier_rappel || null,
    }));
    const { error: dogsErr } = await supabase.from('adhesion_chiens').insert(chienRows);
    if (dogsErr) {
      await supabase.from('adhesions').delete().eq('id', adhesion.id);
      return fail(`Enregistrement des chiens impossible : ${dogsErr.message}`, 500);
    }

    const path = `${adhesion.id}/${sanitizeFilename(att.filename)}`;
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (signErr || !signed) {
      return fail(`Préparation de l'upload impossible : ${signErr?.message ?? 'inconnu'}`, 500);
    }

    return ok({
      success: true,
      adhesion_id: adhesion.id,
      finalize_token: adhesion.finalize_token,
      upload: { url: signed.signedUrl, path },
    });
  }

  // -------------------------------------------------------------- FINALIZE --
  if (action === 'finalize') {
    const { adhesion_id, finalize_token } = body ?? {};
    if (!adhesion_id || !finalize_token) return fail('Paramètres manquants.');

    const { data: adhesion, error } = await supabase
      .from('adhesions')
      .select('id, prenom, nom, email, statut, attestation_rc_path, finalize_token')
      .eq('id', adhesion_id)
      .single();
    if (error || !adhesion) return fail('Demande introuvable.', 404);
    if (adhesion.finalize_token !== finalize_token) return fail('Non autorisé.', 401);
    if (adhesion.statut !== 'en_attente') return fail('Cette demande a déjà été traitée.');

    // Vérifie que le fichier est bien arrivé dans le bucket
    const { data: files, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list(adhesion_id, { limit: 1 });
    if (listErr || !files || files.length === 0) {
      return fail("L'attestation RC n'a pas été reçue. Réessaie l'envoi du fichier.");
    }
    const path = `${adhesion_id}/${files[0].name}`;

    const { error: upErr } = await supabase
      .from('adhesions')
      .update({ attestation_rc_path: path })
      .eq('id', adhesion_id);
    if (upErr) return fail(upErr.message, 500);

    const { data: chiens } = await supabase
      .from('adhesion_chiens')
      .select('nom')
      .eq('adhesion_id', adhesion_id);

    // E-mail de confirmation au demandeur (non bloquant)
    let emailResult: unknown = null;
    try {
      emailResult = await sendBrevoEmail(
        { email: adhesion.email, name: `${adhesion.prenom} ${adhesion.nom}` },
        'Ta demande d\'adhésion CaniPlus est bien arrivée 🐾',
        emailConfirmationHtml(adhesion.prenom, chiens ?? []),
      );
    } catch (e) { emailResult = { ok: false, error: (e as Error).message }; }

    // Notification admin (in-app + push + e-mail), non bloquant
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-admin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'new_member',
          title: `Nouvelle demande d'adhésion — ${adhesion.prenom} ${adhesion.nom}`,
          body: `${(chiens ?? []).map((c) => c.nom).join(', ') || 'Aucun chien ?'} · à valider dans l'onglet Adhésions.`,
          metadata: { adhesion_id },
        }),
      });
    } catch { /* non bloquant */ }

    return ok({ success: true, email: emailResult });
  }

  return fail(`Action inconnue : ${action}`);
});
