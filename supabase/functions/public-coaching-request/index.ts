// supabase/functions/public-coaching-request/index.ts
// -----------------------------------------------------------------------------
// Demande de cours privé ou de coaching depuis le site vitrine — SANS compte.
//
// Le visiteur propose des créneaux, laisse ses coordonnées, et ne paie RIEN.
// Tiffany le contacte sur WhatsApp, fixe le créneau, et c'est seulement à ce
// moment-là qu'un lien de paiement part (public-pay-request).
//
// Flux :
//   1. Le site poste { type, slots, name, email, phone, postal_code, notes }
//   2. On valide, et pour un cours à domicile on recalcule les kilomètres et
//      les frais NOUS-MÊMES (le navigateur peut mentir, voir plus bas)
//   3. Insertion dans private_course_requests, user_id = NULL
//   4. Notification à Tiffany (in-app, push, email) avec un lien WhatsApp
//      pré-ouvert sur le numéro du demandeur
//   5. Accusé de réception au demandeur, via Brevo
//
// Le membre connecté continue de passer par CoachingRequestModal dans l'app :
// cette fonction ne sert que le chemin public.
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Tarifs ──────────────────────────────────────────────────────────────────
// ⚠️ Cinquième copie de ces constantes. Les autres vivent dans src/lib/tarifs.js
// (référence côté app), create-checkout et pay-coaching-request. Le jour où le
// tarif bouge, il faut les cinq. Le commentaire en tête de tarifs.js tient à
// jour la liste.
const PRIX_HEURE_CHF = 60;
const PRIX_KM_CHF = 0.75;
const FRANCHISE_KM = 15;
const PLAFOND_KM = 50;

const BALLAIGUES = { lat: 46.7329, lon: 6.3922 };
const MAX_SLOTS = 4;

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Frais de déplacement aller simple. 0 dans la franchise, null au-delà du plafond. */
function fraisDeplacement(roadKm: number): number | null {
  if (!roadKm || roadKm <= FRANCHISE_KM) return 0;
  if (roadKm > PLAFOND_KM) return null;
  return Math.round((roadKm - FRANCHISE_KM) * PRIX_KM_CHF);
}

/**
 * Numéro au format wa.me : chiffres seuls, indicatif pays inclus.
 *
 * Les trois écritures courantes en Suisse mènent au même numéro :
 *   079 123 89 39 · +41 79 123 89 39 · 0041 79 123 89 39
 * Le 00 se retire avant tout le reste, sinon « 0041… » devenait « 41041… » et
 * le lien WhatsApp ne s'ouvrait sur personne. Un numéro étranger écrit en
 * 00 (0033…) garde son propre indicatif.
 */
function numeroWhatsApp(brut: string): string | null {
  const chiffres = (brut || '')
    .replace(/[^\d+]/g, '')
    .replace(/^\+/, '')
    .replace(/^00/, '');
  if (!chiffres) return null;
  if (chiffres.startsWith('41')) return chiffres;
  if (chiffres.startsWith('0')) return '41' + chiffres.slice(1);
  return chiffres;
}

/**
 * Kilomètres routiers depuis Ballaigues jusqu'à un NPA suisse.
 *
 * Recalculé ici et pas repris du navigateur : la page affiche les frais avant
 * la réservation, donc le montant transite par le client, qui peut le réécrire.
 * Sans ce recalcul, n'importe qui pouvait annoncer 0 km depuis Genève. Tiffany
 * confirme de toute façon le prix final avant le paiement, mais autant que le
 * chiffre qu'elle voit dans sa notification soit le bon.
 *
 * Renvoie null si le NPA est introuvable ou si le routage échoue : la demande
 * part quand même, Tiffany calculera de son côté.
 */
async function kmDepuisBallaigues(npa: string): Promise<{ km: number; ville: string } | null> {
  try {
    const geo = await fetch(
      'https://nominatim.openstreetmap.org/search?format=json&country=switzerland'
      + '&postalcode=' + encodeURIComponent(npa) + '&limit=1&addressdetails=1',
      { headers: { 'Accept': 'application/json', 'User-Agent': 'CaniPlus/1.0 (info@caniplus.ch)' } },
    );
    const lieux = await geo.json();
    if (!Array.isArray(lieux) || !lieux.length) return null;

    const hit = lieux[0];
    const lat = parseFloat(hit.lat);
    const lon = parseFloat(hit.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

    const a = hit.address ?? {};
    const ville = (a.village || a.town || a.city || a.municipality || a.hamlet || a.suburb || npa)
      .replace(/\s*\([^)]*\)\s*$/, '').trim();

    const route = await fetch(
      'https://router.project-osrm.org/route/v1/driving/'
      + BALLAIGUES.lon + ',' + BALLAIGUES.lat + ';' + lon + ',' + lat
      + '?overview=false&alternatives=false&steps=false',
    );
    const osrm = await route.json();
    const premiere = osrm?.code === 'Ok' ? osrm.routes?.[0] : null;
    if (!premiere) return null;

    return { km: Math.round((premiere.distance / 1000) * 10) / 10, ville };
  } catch (e) {
    console.error('[public-coaching-request] calcul km impossible:', (e as Error).message);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { type, slots, name, email, phone, postal_code, notes } = await req.json();

    // ── 1. Validation ────────────────────────────────────────────────────────
    const estVisio = type === 'visio';
    if (type !== 'visio' && type !== 'domicile') {
      throw new Error('Type de séance inconnu.');
    }
    if (!email || !isValidEmail(String(email).trim())) {
      throw new Error('Adresse email invalide.');
    }
    if (!phone || String(phone).replace(/\D/g, '').length < 9) {
      throw new Error('Numéro de téléphone invalide.');
    }
    if (!name || String(name).trim().length < 2) {
      throw new Error('Merci d\'indiquer ton nom.');
    }

    // Créneaux : date + heure de début + heure de fin, dans le futur.
    // On accepte de 1 à 4 propositions ; la page en demande 3.
    const bruts = Array.isArray(slots) ? slots : [];
    const propositions = bruts
      .filter((s: any) => s && s.date && s.start && s.end)
      .slice(0, MAX_SLOTS)
      .map((s: any) => ({ date: String(s.date), start: String(s.start), end: String(s.end) }));

    if (!propositions.length) {
      throw new Error('Propose au moins un créneau.');
    }
    const aujourdHui = new Date().toISOString().slice(0, 10);
    if (propositions.some((s) => s.date < aujourdHui)) {
      throw new Error('Un des créneaux proposés est déjà passé.');
    }
    if (propositions.some((s) => s.end <= s.start)) {
      throw new Error('Un créneau se termine avant de commencer.');
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPhone = String(phone).trim();
    const cleanName = String(name).trim();

    // ── 1bis. Garde anti-abus ────────────────────────────────────────────────
    // Cette fonction est ouverte et envoie un email à l'adresse qu'on lui
    // donne, signé CaniPlus. Sans plafond, elle sert de relais pour arroser
    // n'importe qui — la réputation d'expéditeur du domaine y passe — et le
    // téléphone de Tiffany sonne à chaque envoi. Trois demandes par jour et par
    // adresse suffisent largement à quelqu'un de sincère qui se trompe ou
    // hésite.
    const depuis24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: dejaEnvoyees } = await supabase
      .from('private_course_requests')
      .select('id', { count: 'exact', head: true })
      .eq('guest_email', cleanEmail)
      .gte('created_at', depuis24h);

    if ((dejaEnvoyees ?? 0) >= 3) {
      throw new Error(
        'Tu as déjà envoyé plusieurs demandes aujourd\'hui. '
        + 'Tiffany les a bien reçues et te répond au plus vite. '
        + 'Pour un besoin urgent, écris directement à info@caniplus.ch.',
      );
    }

    // ── 2. Frais de déplacement, recalculés ici ──────────────────────────────
    let npa: string | null = null;
    let ville: string | null = null;
    let roadKm: number | null = null;
    let fraisChf: number | null = null;
    let surDevis = false;

    if (!estVisio) {
      npa = String(postal_code ?? '').trim();
      if (!/^\d{4}$/.test(npa)) {
        throw new Error('Indique un code postal suisse à 4 chiffres.');
      }
      const trajet = await kmDepuisBallaigues(npa);
      if (trajet) {
        roadKm = trajet.km;
        ville = trajet.ville;
        fraisChf = fraisDeplacement(trajet.km);
        surDevis = fraisChf === null;
      }
    }

    const totalChf = estVisio
      ? PRIX_HEURE_CHF
      : (fraisChf === null ? null : PRIX_HEURE_CHF + (fraisChf ?? 0));

    // ── 3. Enregistrement ────────────────────────────────────────────────────
    // price_chf reste le prix de la séance seule, travel_extra_chf porte le
    // déplacement : c'est la répartition qu'attend déjà pay-coaching-request.
    const { data: demande, error: insertErr } = await supabase
      .from('private_course_requests')
      .insert({
        user_id: null,
        guest_email: cleanEmail,
        guest_phone: cleanPhone,
        guest_name: cleanName,
        availability_slots: propositions,
        is_remote: estVisio,
        postal_code: npa,
        city: ville,
        road_km: roadKm,
        travel_extra_chf: fraisChf,
        price_chf: PRIX_HEURE_CHF,
        admin_notes: notes ? String(notes).slice(0, 2000) : null,
        status: 'pending',
        payment_status: 'pending',
      })
      .select('id')
      .single();

    if (insertErr || !demande) {
      console.error('[public-coaching-request] insert error:', insertErr);
      throw new Error('Impossible d\'enregistrer la demande. Réessaie dans un instant.');
    }

    // ── 4. Notification à Tiffany ────────────────────────────────────────────
    // Envoi best-effort : une notification qui échoue ne doit pas faire échouer
    // la demande, sinon le visiteur voit une erreur alors que tout est en base.
    const wa = numeroWhatsApp(cleanPhone);
    const lignesCreneaux = propositions
      .map((s) => `• ${s.date} de ${s.start} à ${s.end}`)
      .join('\n');
    const lieu = estVisio
      ? 'En visio'
      : `À domicile · ${npa}${ville ? ' ' + ville : ''}`
        + (roadKm !== null ? ` · ${roadKm} km` : ' · distance non calculée')
        + (surDevis ? ' · au-delà de 50 km, sur devis' : fraisChf ? ` · +${fraisChf} CHF de déplacement` : ' · déplacement offert');

    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-admin`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // 'private_request' et pas un kind à nous : notify-admin rejette les
          // kinds hors liste, et celui-ci est en plus dans la whitelist des
          // événements utilisateur, donc il passe même si l'auth Bearer
          // service_role échoue (voir le commentaire dans notify-admin).
          kind: 'private_request',
          title: `${estVisio ? 'Coaching visio' : 'Cours privé'} à confirmer : ${cleanName}`,
          body: `${cleanName} · ${cleanPhone} · ${cleanEmail}\n${lieu}\n`
              + `Total ${totalChf === null ? 'sur devis' : totalChf + ' CHF'}\n\n`
              + `Créneaux proposés :\n${lignesCreneaux}\n\n`
              + (notes ? `Sa demande : ${String(notes).slice(0, 500)}\n\n` : '')
              + (wa ? `Répondre sur WhatsApp : https://wa.me/${wa}` : ''),
          metadata: {
            request_id: demande.id,
            guest_email: cleanEmail,
            guest_phone: cleanPhone,
            whatsapp_url: wa ? `https://wa.me/${wa}` : null,
            is_remote: estVisio,
            postal_code: npa,
            road_km: roadKm,
            travel_extra_chf: fraisChf,
            total_chf: totalChf,
          },
          channels: ['in_app', 'push', 'email'],
        }),
      }).catch(() => {});
    } catch (_) { /* best-effort */ }

    // ── 5. Accusé de réception au demandeur ──────────────────────────────────
    try {
      const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
      if (!apiKey) {
        console.error('[public-coaching-request] BREVO_API_KEY manquante');
      } else {
        const listeHtml = propositions
          .map((s) => `<li>${s.date} de ${s.start} à ${s.end}</li>`)
          .join('');
        const ligneFrais = estVisio
          ? 'La séance se fait en visio, sans frais de déplacement.'
          : surDevis
            ? 'Ton adresse est au-delà de 50 km par la route : Tiffany te fera un devis pour le déplacement.'
            : fraisChf === null
              ? 'Tiffany calculera les frais de déplacement depuis ton adresse.'
              : fraisChf > 0
                ? `Frais de déplacement estimés : ${fraisChf} CHF (${roadKm} km par la route, les 15 premiers sont offerts).`
                : 'Tu es dans la zone des 15 km : le déplacement est offert.';

        const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#F8F5F0;font-family:'Helvetica Neue',Arial,sans-serif;color:#1f1f20;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.05);">
        <tr><td style="padding:32px 32px 8px;">
          <div style="font-family:'Brush Script MT',cursive;font-size:32px;color:#2BABE1;">CaniPlus</div>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <h1 style="font-size:24px;margin:0 0 14px;color:#1f1f20;">Ta demande est bien arrivée</h1>
          <p style="font-size:15px;line-height:1.7;margin:0 0 18px;color:#3d3d3d;">
            Bonjour ${cleanName},<br/>
            Tiffany te contacte sur WhatsApp au <strong>${cleanPhone}</strong> pour fixer le créneau,
            en général sous 48 heures.
          </p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 8px;color:#3d3d3d;">
            <strong>Les moments que tu as proposés :</strong>
          </p>
          <ul style="font-size:15px;line-height:1.8;margin:0 0 18px 20px;color:#3d3d3d;padding:0;">${listeHtml}</ul>
          <p style="font-size:15px;line-height:1.7;margin:0 0 18px;color:#3d3d3d;">
            ${estVisio ? 'Coaching en visio' : 'Cours privé à domicile'} · une heure · ${PRIX_HEURE_CHF} CHF.<br/>
            ${ligneFrais}
          </p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 18px;color:#3d3d3d;">
            <strong>Tu n'as rien à payer pour l'instant.</strong> Le lien de paiement
            t'arrivera une fois le créneau confirmé ensemble.
          </p>
          <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:18px 0 0;">
            Une question d'ici là ? Réponds à cet email ou écris à
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
            to: [{ email: cleanEmail, name: cleanName }],
            replyTo: { name: 'CaniPlus', email: 'info@caniplus.ch' },
            subject: estVisio ? 'Ta demande de coaching CaniPlus' : 'Ta demande de cours privé CaniPlus',
            htmlContent: html,
          }),
        });
        if (!r.ok) {
          const t = await r.text().catch(() => '');
          console.error('[public-coaching-request] Brevo error:', r.status, t);
        }
      }
    } catch (e) {
      console.error('[public-coaching-request] accusé de réception impossible:', (e as any)?.message ?? e);
    }

    return new Response(
      JSON.stringify({
        request_id: demande.id,
        road_km: roadKm,
        travel_extra_chf: fraisChf,
        total_chf: totalChf,
        sur_devis: surDevis,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const message = (err as any)?.message ?? String(err) ?? 'Erreur inconnue';
    console.error('public-coaching-request error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
