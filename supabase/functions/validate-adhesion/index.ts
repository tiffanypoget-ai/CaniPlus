// supabase/functions/validate-adhesion/index.ts
// -----------------------------------------------------------------------------
// Gestion admin des demandes d'adhésion (onglet « Adhésions » du panel admin).
// Auth : admin_password dans le body (même pattern que admin-query).
//
// Actions :
//   list     : toutes les demandes + chiens (tri date desc)
//   detail   : une demande + URL signée temporaire de l'attestation RC
//   validate : crée le compte app (lien d'invitation), crée les chiens,
//              passe la demande en 'validee', e-mail de bienvenue au membre
//   refuse   : passe en 'refusee' (motif facultatif), e-mail courtois au demandeur
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET = 'attestations-rc';
const BREVO_API_URL = 'https://api.brevo.com/v3';
const SENDER = { name: 'CaniPlus', email: 'info@caniplus.ch' };
const APP_URL = 'https://app.caniplus.ch';

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

function cotisationCalc(nbChiens: number, d = new Date()): { total: number; detail: string } {
  const n = Math.max(nbChiens, 1);
  const prix = d >= COTISATION_BASCULE ? 75 : 150;
  const periode = d >= COTISATION_BASCULE ? ' · inscription en cours d\'année' : '';
  return {
    total: prix * n,
    detail: n > 1 ? `${prix} CHF × ${n} chiens${periode}` : `${prix} CHF par chien inscrit${periode}`,
  };
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

function wrapEmail(inner: string) {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8F5F0;font-family:Inter,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8F5F0;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:24px 32px;background:#1F1F20;">
        <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#2BABE1;font-weight:600;">CaniPlus &middot; Ballaigues</p>
      </td></tr>
      <tr><td style="padding:32px;">${inner}</td></tr>
      <tr><td style="padding:18px 32px;background:#F8F5F0;font-size:12px;color:#6b7280;text-align:center;">
        CaniPlus &middot; Club canin de Ballaigues &middot; caniplus.ch
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function emailValidationHtml(prenom: string, chiens: string[], actionLink: string) {
  const nbChiens = Math.max(chiens.length, 1);
  const { total, detail } = cotisationCalc(nbChiens);
  const clubIban = Deno.env.get('CLUB_IBAN') ?? '';
  const profilTxt = chiens.length > 1
    ? `les profils de ${chiens.join(', ')} sont déjà créés`
    : `le profil de ${chiens[0] ?? 'ton chien'} est déjà créé`;
  const paiement = clubIban
    ? `<p style="margin:0;font-size:14px;line-height:1.7;color:#176E94;">
         <strong>Cotisation annuelle : ${total} CHF</strong> (${detail})<br>
         À verser sur le compte du club :<br>
         IBAN ${clubIban}<br>
         Mention : « Cotisation ${new Date().getFullYear()} + ton nom »
       </p>`
    : `<p style="margin:0;font-size:14px;line-height:1.7;color:#176E94;">
         <strong>Cotisation annuelle : ${total} CHF</strong> (${detail})<br>
         Les informations de paiement te parviendront séparément.
       </p>`;
  return wrapEmail(`
        <h2 style="margin:0 0 14px 0;font-family:Georgia,serif;font-size:22px;color:#1F1F20;">Ton adhésion CaniPlus est confirmée 🎉</h2>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#374151;">
          Bienvenue au club, ${prenom} ! Ton espace personnel t'attend :
          ${profilTxt}, avec les fiches d'exercices et le suivi sur 12 semaines.
        </p>
        <div style="margin:0 0 18px 0;">
          <a href="${actionLink}" style="display:inline-block;background:#176E94;color:#FFFFFF;padding:14px 26px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Accéder à mon espace</a>
        </div>
        <p style="margin:0 0 18px 0;font-size:13px;line-height:1.6;color:#6b7280;">
          Ce lien d'activation est personnel et valable quelques jours. S'il a expiré,
          va sur <a href="${APP_URL}" style="color:#176E94;">app.caniplus.ch</a> et utilise « Mot de passe oublié » avec cette adresse e-mail.
        </p>
        <div style="background:#E8F6FC;border-radius:12px;padding:16px 20px;">
          ${paiement}
        </div>`);
}

function emailRefusHtml(prenom: string, motif: string | null) {
  return wrapEmail(`
        <h2 style="margin:0 0 14px 0;font-family:Georgia,serif;font-size:22px;color:#1F1F20;">Ta demande d'adhésion CaniPlus</h2>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#374151;">
          Bonjour ${prenom},<br><br>
          Merci pour l'intérêt que tu portes à CaniPlus. Après examen, le comité ne peut
          pas donner suite à ta demande d'adhésion pour le moment.
        </p>
        ${motif ? `<div style="background:#F8F5F0;border-radius:12px;padding:16px 20px;margin:0 0 14px 0;">
          <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;"><strong>Motif :</strong> ${motif}</p>
        </div>` : ''}
        <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
          Une question ? Réponds simplement à cet e-mail, on en discute volontiers.
        </p>`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Méthode non autorisée', 405);

  let body: any = {};
  try { body = await req.json(); } catch { return fail('Corps de requête invalide'); }

  const expectedPassword = Deno.env.get('ADMIN_PASSWORD') ?? '';
  if (!body?.admin_password || body.admin_password !== expectedPassword) {
    return fail('Mot de passe incorrect', 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const action = body?.action;
  const payload = body?.payload ?? {};

  // ------------------------------------------------------------------ LIST --
  if (action === 'list') {
    const { data, error } = await supabase
      .from('adhesions')
      .select('id, created_at, statut, nom, prenom, email, telephone, npa_localite, attestation_rc_path, valide_le, motif_refus, adhesion_chiens(id, nom, race, numero_amicus, vaccins_a_jour)')
      .order('created_at', { ascending: false });
    if (error) return fail(error.message, 500);
    return ok({ adhesions: data });
  }

  // ---------------------------------------------------------------- DETAIL --
  if (action === 'detail') {
    const { adhesion_id } = payload;
    if (!adhesion_id) return fail('adhesion_id requis');
    const { data, error } = await supabase
      .from('adhesions')
      .select('*, adhesion_chiens(*)')
      .eq('id', adhesion_id)
      .single();
    if (error || !data) return fail('Demande introuvable', 404);

    let attestation_url: string | null = null;
    if (data.attestation_rc_path) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(data.attestation_rc_path, 3600);
      attestation_url = signed?.signedUrl ?? null;
    }
    const { finalize_token: _ft, ...safe } = data;
    return ok({ adhesion: safe, attestation_url });
  }

  // -------------------------------------------------------------- VALIDATE --
  if (action === 'validate') {
    const { adhesion_id, valide_par } = payload;
    if (!adhesion_id) return fail('adhesion_id requis');

    const { data: adhesion, error } = await supabase
      .from('adhesions')
      .select('*, adhesion_chiens(*)')
      .eq('id', adhesion_id)
      .single();
    if (error || !adhesion) return fail('Demande introuvable', 404);
    if (adhesion.statut !== 'en_attente') return fail('Cette demande a déjà été traitée.');

    const fullName = `${adhesion.prenom} ${adhesion.nom}`.trim();
    const [npa, ...locParts] = String(adhesion.npa_localite ?? '').trim().split(/\s+/);
    const localite = locParts.join(' ');

    // 1. Compte app : lien d'invitation (crée l'utilisateur si besoin).
    //    Le trigger handle_new_user lit full_name + user_type dans les metadata.
    let userId: string | null = null;
    let actionLink: string | null = null;
    const inviteRes = await supabase.auth.admin.generateLink({
      type: 'invite',
      email: adhesion.email,
      options: {
        data: { full_name: fullName, user_type: 'member' },
        redirectTo: APP_URL,
      },
    });
    if (inviteRes.error) {
      // L'utilisateur existe peut-être déjà → lien magique à la place
      const magicRes = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: adhesion.email,
        options: { redirectTo: APP_URL },
      });
      if (magicRes.error) {
        return fail(`Création du compte impossible : ${inviteRes.error.message}`, 500);
      }
      userId = magicRes.data.user?.id ?? null;
      actionLink = magicRes.data.properties?.action_link ?? null;
    } else {
      userId = inviteRes.data.user?.id ?? null;
      actionLink = inviteRes.data.properties?.action_link ?? null;
    }
    if (!userId || !actionLink) return fail('Création du compte incomplète.', 500);

    // 2. Profil : s'assure du user_type member + localité
    await supabase.from('profiles').update({
      user_type: 'member',
      full_name: fullName,
      ...(npa && /^\d{4}$/.test(npa) ? { postal_code: npa } : {}),
      ...(localite ? { city: localite } : {}),
    }).eq('id', userId);

    // 3. Chiens : profils pré-remplis dans l'app
    const chiens = adhesion.adhesion_chiens ?? [];
    for (const c of chiens) {
      const birthYear = c.date_naissance ? new Date(c.date_naissance).getFullYear() : null;
      const { data: existingDog } = await supabase
        .from('dogs')
        .select('id')
        .eq('owner_id', userId)
        .ilike('name', c.nom)
        .maybeSingle();
      if (!existingDog) {
        await supabase.from('dogs').insert({
          owner_id: userId,
          name: c.nom,
          breed: c.race,
          birth_date: c.date_naissance,
          birth_year: birthYear,
          chip_number: c.numero_amicus,
          vaccinated: c.vaccins_a_jour,
        });
      }
    }

    // 4. Statut de la demande
    const { error: upErr } = await supabase
      .from('adhesions')
      .update({
        statut: 'validee',
        valide_par: valide_par || 'admin',
        valide_le: new Date().toISOString(),
        user_id: userId,
      })
      .eq('id', adhesion_id);
    if (upErr) return fail(upErr.message, 500);

    // 5. E-mail de bienvenue avec le lien d'activation
    const emailResult = await sendBrevoEmail(
      { email: adhesion.email, name: fullName },
      'Ton adhésion CaniPlus est confirmée 🎉',
      emailValidationHtml(adhesion.prenom, chiens.map((c: any) => c.nom), actionLink),
    );

    return ok({ success: true, user_id: userId, email: emailResult });
  }

  // ---------------------------------------------------------------- REFUSE --
  if (action === 'refuse') {
    const { adhesion_id, motif, valide_par } = payload;
    if (!adhesion_id) return fail('adhesion_id requis');

    const { data: adhesion, error } = await supabase
      .from('adhesions')
      .select('id, prenom, nom, email, statut')
      .eq('id', adhesion_id)
      .single();
    if (error || !adhesion) return fail('Demande introuvable', 404);
    if (adhesion.statut !== 'en_attente') return fail('Cette demande a déjà été traitée.');

    const { error: upErr } = await supabase
      .from('adhesions')
      .update({
        statut: 'refusee',
        motif_refus: typeof motif === 'string' && motif.trim() !== '' ? motif.trim() : null,
        valide_par: valide_par || 'admin',
        valide_le: new Date().toISOString(),
      })
      .eq('id', adhesion_id);
    if (upErr) return fail(upErr.message, 500);

    const emailResult = await sendBrevoEmail(
      { email: adhesion.email, name: `${adhesion.prenom} ${adhesion.nom}` },
      'Ta demande d\'adhésion CaniPlus',
      emailRefusHtml(adhesion.prenom, typeof motif === 'string' && motif.trim() !== '' ? motif.trim() : null),
    );

    return ok({ success: true, email: emailResult });
  }

  return fail(`Action inconnue : ${action}`);
});
