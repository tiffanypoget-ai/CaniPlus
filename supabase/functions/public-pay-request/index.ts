// supabase/functions/public-pay-request/index.ts
// -----------------------------------------------------------------------------
// Paiement d'un cours privé réservé depuis le site, sans compte.
//
// Un membre paie depuis son planning dans l'app : il a une session, donc un
// écran où cliquer. Quelqu'un qui a réservé depuis caniplus.ch n'a ni compte ni
// session. Il reçoit donc un lien personnel par email, et ce lien arrive ici.
//
//   GET /public-pay-request?t=<public_token>  →  302 vers Stripe Checkout
//
// Le jeton VAUT identification : qui l'a peut payer cette demande-là, et rien
// d'autre. C'est le même compromis que les liens de désinscription d'une
// newsletter. Il ne donne accès à aucune donnée et ne permet pas d'annuler.
//
// Les metadata Stripe reprennent celles de pay-coaching-request
// (type='coaching_request' + request_id) : la branche correspondante de
// stripe-webhook passe donc la demande en payée sans une ligne de plus.
//
// Cette page est ouverte par un humain depuis sa boîte mail : les erreurs
// sortent en HTML lisible, pas en JSON.
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE_BASE_URL = 'https://caniplus.ch';
const PRIX_HEURE_CHF = 60;

/** Page d'erreur lisible : quelqu'un arrive ici depuis un email, pas un script. */
function pageErreur(titre: string, message: string, statut = 200): Response {
  const html = `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${titre} · CaniPlus</title>
<style>
  body { margin:0; background:#F8F5F0; font-family:'Helvetica Neue',Arial,sans-serif;
         color:#1f1f20; display:flex; align-items:center; justify-content:center;
         min-height:100vh; padding:24px; }
  .carte { background:#fff; border-radius:16px; padding:36px 32px; max-width:460px;
           box-shadow:0 4px 16px rgba(0,0,0,0.06); text-align:center; }
  h1 { font-size:22px; margin:0 0 14px; }
  p { font-size:15px; line-height:1.7; color:#3d3d3d; margin:0 0 18px; }
  a { display:inline-block; background:#176E94; color:#fff; text-decoration:none;
      padding:12px 24px; border-radius:999px; font-weight:600; font-size:15px; }
</style></head>
<body><div class="carte">
  <h1>${titre}</h1>
  <p>${message}</p>
  <a href="mailto:info@caniplus.ch">Écrire à CaniPlus</a>
</div></body></html>`;
  return new Response(html, { status: statut, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const token = (url.searchParams.get('t') ?? '').trim();

    // Le jeton est un UUID : tout le reste est rejeté avant de toucher la base.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      return pageErreur(
        'Lien incomplet',
        'Ce lien de paiement n\'est pas valide. Vérifie que tu l\'as copié en entier depuis ton email, ou réponds à cet email et on t\'en renvoie un.',
      );
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: demande, error } = await supabase
      .from('private_course_requests')
      .select('id, status, payment_status, is_remote, chosen_slot, price_chf, travel_extra_chf, guest_email, guest_name, user_id')
      .eq('public_token', token)
      .maybeSingle();

    if (error || !demande) {
      return pageErreur(
        'Lien inconnu',
        'Ce lien de paiement ne correspond à aucune réservation. Il a peut-être été remplacé par un plus récent : regarde le dernier email reçu.',
      );
    }

    // ── Garde d'état ─────────────────────────────────────────────────────────
    if (demande.payment_status === 'paid') {
      return pageErreur(
        'Déjà payé',
        'Ce cours est déjà réglé, il n\'y a rien à payer. Tiffany te confirme le rendez-vous par email.',
      );
    }
    if (demande.status !== 'confirmed') {
      return pageErreur(
        'Créneau pas encore fixé',
        'Ta demande est bien arrivée, mais le créneau n\'est pas encore confirmé. Tiffany te contacte sur WhatsApp, et le paiement se fera à ce moment-là.',
      );
    }
    const slot = demande.chosen_slot as { date?: string; start?: string; end?: string } | null;
    if (!slot?.date) {
      return pageErreur(
        'Créneau manquant',
        'Le créneau de ce cours n\'est pas lisible. Écris-nous et on règle ça tout de suite.',
      );
    }

    // Un créneau passé ne se paie plus : sans ce test on vendait un cours qui
    // n'aura pas lieu. Même règle que create-checkout et pay-coaching-request.
    if (slot.date < new Date().toISOString().slice(0, 10)) {
      return pageErreur(
        'Ce créneau est passé',
        'La date de ce cours est dépassée. Écris-nous pour en fixer une nouvelle, il n\'y a rien à payer d\'ici là.',
      );
    }

    // ── Montant ──────────────────────────────────────────────────────────────
    // Durée réelle du créneau confirmé, comme dans pay-coaching-request : un
    // cours de deux heures se facture deux heures.
    let dureeHeures = 1;
    if (slot.start && slot.end) {
      const [h1, m1] = slot.start.split(':').map(Number);
      const [h2, m2] = slot.end.split(':').map(Number);
      const minutes = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (minutes > 0) dureeHeures = minutes / 60;
    }
    const prixCours = Math.round(dureeHeures * PRIX_HEURE_CHF);
    const deplacement = Number(demande.travel_extra_chf) > 0 ? Number(demande.travel_extra_chf) : 0;
    const total = prixCours + deplacement;

    const enVisio = demande.is_remote === true;
    const dureeTxt = dureeHeures === 1 ? '1h' : `${dureeHeures}h`;
    const libelle = (enVisio ? 'Coaching visio' : 'Cours privé')
                  + ` ${dureeTxt} — ${slot.date}${slot.start ? ' à ' + slot.start : ''}`;
    const description = deplacement > 0
      ? `Séance avec Tiffany · ${prixCours} CHF (cours) + ${deplacement} CHF (déplacement).`
      : (enVisio
          ? 'Séance en visio avec Tiffany. Le lien te sera envoyé avant le rendez-vous.'
          : 'Séance avec Tiffany à ton domicile ou sur un lieu défini.');

    const session = await stripe.checkout.sessions.create({
      // Pas de payment_method_types : le fixer masquerait TWINT, qui est piloté
      // depuis le Dashboard Stripe.
      mode: 'payment',
      customer_email: demande.guest_email ?? undefined,
      line_items: [{
        price_data: {
          currency: 'chf',
          product_data: { name: libelle, description },
          unit_amount: Math.round(total * 100),
        },
        quantity: 1,
      }],
      success_url: `${SITE_BASE_URL}/?paiement=succes#prestations`,
      cancel_url: `${SITE_BASE_URL}/?paiement=annule#prestations`,
      metadata: {
        // Mêmes clés que pay-coaching-request : stripe-webhook sait déjà les
        // traiter, aucune branche à ajouter côté webhook.
        type: 'coaching_request',
        request_id: demande.id,
        is_remote: enVisio ? 'true' : 'false',
      },
      expires_at: Math.floor(Date.now() / 1000) + 24 * 3600,
    });

    // Le montant facturé devient le montant affiché partout ailleurs.
    await supabase
      .from('private_course_requests')
      .update({ price_chf: total, stripe_session_id: session.id })
      .eq('id', demande.id);

    if (!session.url) {
      return pageErreur('Paiement indisponible', 'Impossible d\'ouvrir la page de paiement. Réessaie dans un instant.');
    }
    return Response.redirect(session.url, 302);

  } catch (err) {
    console.error('public-pay-request error:', (err as any)?.message ?? err);
    return pageErreur(
      'Quelque chose a coincé',
      'La page de paiement n\'a pas pu s\'ouvrir. Réessaie dans quelques minutes, ou écris-nous.',
    );
  }
});
