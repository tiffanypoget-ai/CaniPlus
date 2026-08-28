// supabase/functions/notify-guest-confirmed/index.ts
// -----------------------------------------------------------------------------
// « Ton créneau est confirmé, voici le lien pour payer. »
//
// Appelée par un déclencheur Postgres (pg_net) quand une demande passe à
// status='confirmed' et qu'elle vient de quelqu'un sans compte. Un membre est
// prévenu autrement : admin-query s'en charge déjà via notification in-app et
// push, chemins qui supposent tous les deux un user_id.
//
// Pourquoi un déclencheur plutôt qu'un appel depuis admin-query : cette
// fonction-là fait 1424 lignes et sert tout le panneau d'administration. La
// retoucher pour y greffer un envoi d'email n'en valait pas le risque.
//
// La fonction est publique, donc elle ne fait confiance à rien :
//   - elle ne prend qu'un request_id, aucune donnée du corps n'est réutilisée
//   - elle relit tout en base et refuse si la demande n'est pas confirmée,
//     déjà payée, ou rattachée à un compte
//   - elle refuse un renvoi à moins d'une heure, sinon un appel en boucle
//     suffisait à harceler un client par email
// Le pire qu'un inconnu puisse faire, c'est renvoyer à un vrai client l'email
// qu'il a déjà reçu, une fois par heure.
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DELAI_RENVOI_MS = 60 * 60 * 1000;

/** Date lisible en français, à partir d'un créneau { date, start, end }. */
function creneauLisible(slot: { date?: string; start?: string; end?: string } | null): string {
  if (!slot?.date) return '';
  let jour = slot.date;
  try {
    jour = new Date(`${slot.date}T12:00:00`).toLocaleDateString('fr-CH', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  } catch { /* on garde la date brute */ }
  if (slot.start && slot.end) return `${jour}, de ${slot.start} à ${slot.end}`;
  if (slot.start) return `${jour} à ${slot.start}`;
  return jour;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const repondre = (corps: Record<string, unknown>) =>
    new Response(JSON.stringify(corps), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { request_id } = await req.json();
    if (!request_id) return repondre({ skipped: 'request_id manquant' });

    const { data: d, error } = await supabase
      .from('private_course_requests')
      .select('id, user_id, status, payment_status, is_remote, chosen_slot, price_chf, travel_extra_chf, guest_email, guest_name, public_token, payment_link_sent_at')
      .eq('id', request_id)
      .maybeSingle();

    if (error || !d) return repondre({ skipped: 'demande introuvable' });

    // ── Ce qui disqualifie un envoi ──────────────────────────────────────────
    if (d.user_id) return repondre({ skipped: 'demande rattachée à un compte' });
    if (!d.guest_email) return repondre({ skipped: 'pas d\'email' });
    if (d.status !== 'confirmed') return repondre({ skipped: 'pas encore confirmée' });
    if (d.payment_status === 'paid') return repondre({ skipped: 'déjà payée' });
    if (d.payment_link_sent_at
        && Date.now() - new Date(d.payment_link_sent_at).getTime() < DELAI_RENVOI_MS) {
      return repondre({ skipped: 'déjà envoyé il y a moins d\'une heure' });
    }

    const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
    if (!apiKey) {
      console.error('[notify-guest-confirmed] BREVO_API_KEY manquante');
      return repondre({ error: 'BREVO_API_KEY manquante' });
    }

    // ── Montant annoncé ──────────────────────────────────────────────────────
    // Recalculé comme dans public-pay-request pour que l'email et la page de
    // paiement disent le même chiffre.
    const slot = d.chosen_slot as { date?: string; start?: string; end?: string } | null;
    let dureeHeures = 1;
    if (slot?.start && slot?.end) {
      const [h1, m1] = slot.start.split(':').map(Number);
      const [h2, m2] = slot.end.split(':').map(Number);
      const minutes = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (minutes > 0) dureeHeures = minutes / 60;
    }
    const prixCours = Math.round(dureeHeures * 60);
    const deplacement = Number(d.travel_extra_chf) > 0 ? Number(d.travel_extra_chf) : 0;
    const total = prixCours + deplacement;

    const lienPaiement = `${Deno.env.get('SUPABASE_URL')}/functions/v1/public-pay-request?t=${d.public_token}`;
    const quand = creneauLisible(slot);
    const enVisio = d.is_remote === true;
    const prenom = (d.guest_name ?? '').split(' ')[0] || 'toi';

    const detailPrix = deplacement > 0
      ? `${prixCours} CHF pour la séance et ${deplacement} CHF de déplacement.`
      : `${prixCours} CHF, déplacement compris.`;

    const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#F8F5F0;font-family:'Helvetica Neue',Arial,sans-serif;color:#1f1f20;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.05);">
        <tr><td style="padding:32px 32px 8px;">
          <div style="font-family:'Brush Script MT',cursive;font-size:32px;color:#2BABE1;">CaniPlus</div>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <h1 style="font-size:24px;margin:0 0 14px;color:#1f1f20;">C'est confirmé !</h1>
          <p style="font-size:15px;line-height:1.7;margin:0 0 18px;color:#3d3d3d;">
            Bonjour ${prenom},<br/>
            Ton ${enVisio ? 'coaching en visio' : 'cours privé'} est fixé au
            <strong>${quand}</strong>.
          </p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 22px;color:#3d3d3d;">
            Il reste à régler <strong>${total} CHF</strong> — ${detailPrix}
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${lienPaiement}" style="display:inline-block;background:#2BABE1;color:#FFFFFF;padding:14px 30px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Payer ${total} CHF</a>
          </div>
          <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:18px 0 0;">
            Paiement par carte ou TWINT. Ce lien t'est personnel, ne le transfère pas.
            ${enVisio ? 'Le lien de la visio t\'arrivera avant le rendez-vous.' : ''}
          </p>
          <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:14px 0 0;">
            Un empêchement ou une question ? Réponds à cet email ou écris à
            <a href="mailto:info@caniplus.ch" style="color:#1e8db8;">info@caniplus.ch</a>.
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#F8F5F0;font-size:12px;color:#6b7280;text-align:center;">
          CaniPlus &middot; Tiffany Cotting &middot; Ballaigues
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'CaniPlus', email: 'info@caniplus.ch' },
        to: [{ email: d.guest_email, name: d.guest_name ?? undefined }],
        replyTo: { name: 'CaniPlus', email: 'info@caniplus.ch' },
        subject: enVisio ? 'Ton coaching CaniPlus est confirmé' : 'Ton cours privé CaniPlus est confirmé',
        htmlContent: html,
      }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('[notify-guest-confirmed] Brevo error:', r.status, t);
      return repondre({ error: `Brevo ${r.status}` });
    }

    // Marqué seulement après un envoi réussi : sinon un échec Brevo bloquait
    // le renvoi pendant une heure alors que le client n'a rien reçu.
    await supabase
      .from('private_course_requests')
      .update({ payment_link_sent_at: new Date().toISOString() })
      .eq('id', d.id);

    console.log(`[notify-guest-confirmed] lien de paiement envoyé pour ${d.id}`);
    return repondre({ sent: true, request_id: d.id, total_chf: total });

  } catch (err) {
    console.error('notify-guest-confirmed error:', (err as any)?.message ?? err);
    return repondre({ error: (err as any)?.message ?? 'Erreur inconnue' });
  }
});
