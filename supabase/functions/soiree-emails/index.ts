// supabase/functions/soiree-emails/index.ts
// Emails des « soirées CaniPlus » (webinaires payants, prestation RI).
//
// Trois actions, une seule fonction pour ne maintenir qu'un gabarit d'email :
//   - action 'confirmation'  : appelée par stripe-webhook dès qu'une inscription
//                              passe en payée. Envoie le lien Zoom.
//   - action 'reminders'     : appelée toutes les heures par pg_cron. Envoie le
//                              rappel J-1 (18h) puis le rappel du jour J (1h
//                              avant), avec le lien Zoom.
//   - action 'replay'        : appelée par l'admin après la soirée, une fois le
//                              lien de replay et son code saisis.
//
// Anti-doublon : chaque envoi est journalisé dans soiree_emails_sent
// (product_id, email, kind) UNIQUE. On insère AVANT d'envoyer : si la ligne
// existe déjà, l'insert échoue et on n'envoie rien. Deux exécutions
// simultanées du cron ne peuvent donc pas doubler un rappel.
//
// Auth : Bearer service role (webhook), X-Cron-Secret (pg_cron) ou JWT d'un
// profil admin (bouton « Envoyer le replay » dans l'app).
//
// À DÉPLOYER AVEC --no-verify-jwt, comme cash-payment-reminder : pg_cron
// n'envoie pas de JWT, seulement son header X-Cron-Secret. La porte reste
// fermée — le contrôle des trois identités ci-dessous est fait dans le code, et
// tout appel qui n'en présente aucune repart en 401.
//
// Le lien Zoom n'est jamais renvoyé dans la réponse HTTP : il ne sort d'ici que
// dans le corps des emails, vers l'adresse d'un inscrit payé.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.caniplus.ch';
const CONTACT_EMAIL = 'info@caniplus.ch';

// La salle Zoom ouvre 15 minutes avant le début, le temps que tout le monde
// s'installe. Le rappel du jour J part 1h avant ; celui de la veille, 26h avant
// (= 18h00 la veille pour une soirée à 20h00).
const DOORS_OPEN_MIN = 15;
const REMINDER_J1_BEFORE_MS = 26 * 3600 * 1000;
const REMINDER_J0_BEFORE_MS = 1 * 3600 * 1000;
// Un rappel du jour J reste utile tant que la salle vient d'ouvrir.
const J0_LATE_TOLERANCE_MS = 15 * 60 * 1000;

type Kind = 'confirmation' | 'rappel_j1' | 'rappel_jour_j' | 'replay';

function ok(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Dates en français, heure suisse ────────────────────────────────────────
function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-CH', {
    timeZone: 'Europe/Zurich',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function fmtHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-CH', {
    timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit',
  });
}
function fmtDateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-CH', {
    timeZone: 'Europe/Zurich', day: 'numeric', month: 'long',
  });
}

// ─── Gabarit d'email CaniPlus (repris de cash-payment-reminder) ─────────────
function wrapEmail(bodyHtml: string): string {
  return `<!doctype html>
<html lang="fr"><body style="margin:0;padding:0;background:#F8F5F0;font-family:'Helvetica Neue',Arial,sans-serif;color:#1f1f20;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.05);max-width:600px;width:100%;">
        <tr><td style="padding:28px 32px 8px;">
          <div style="font-family:'Brush Script MT',cursive;font-size:30px;color:#2BABE1;">CaniPlus</div>
        </td></tr>
        <tr><td style="padding:4px 32px 24px;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 32px;background:#F8F5F0;font-size:12px;color:#6b7280;text-align:center;">
          CaniPlus &middot; Tiffany Cotting &middot; Ballaigues<br/>
          Une question ? Réponds à cet email ou écris à <a href="mailto:${CONTACT_EMAIL}" style="color:#1e8db8;">${CONTACT_EMAIL}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendEmail(to: string, name: string | null, subject: string, bodyHtml: string): Promise<boolean> {
  const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
  if (!apiKey) {
    console.error('[soiree-emails] BREVO_API_KEY manquante');
    return false;
  }
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'CaniPlus', email: CONTACT_EMAIL },
        replyTo: { name: 'CaniPlus', email: CONTACT_EMAIL },
        to: [{ email: to, name: name || undefined }],
        subject,
        htmlContent: wrapEmail(bodyHtml),
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('[soiree-emails] Brevo error:', r.status, t);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[soiree-emails] Brevo exception:', (e as Error).message);
    return false;
  }
}

// ─── Blocs réutilisés ───────────────────────────────────────────────────────
const btn = (href: string, label: string, color = '#2BABE1') =>
  `<div style="text-align:center;margin:26px 0;">
     <a href="${href}" style="display:inline-block;background:${color};color:#FFFFFF;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">${label}</a>
   </div>`;

// Rappelé dans chaque email portant le lien Zoom : une cliente sourde est
// attendue aux soirées, l'information sur les sous-titres ne doit pas se
// perdre entre la confirmation et le soir même.
const BLOC_PRATIQUE = `
  <div style="background:#F8F5F0;border-radius:12px;padding:16px 18px;margin:22px 0;">
    <div style="font-size:13px;font-weight:700;color:#1f1f20;margin-bottom:8px;">Trois choses à savoir</div>
    <div style="font-size:13px;line-height:1.7;color:#3d3d3d;">
      · Rejoins la soirée avec ton prénom et ton nom : une salle d'attente filtre les entrées.<br/>
      · Des sous-titres automatiques en français sont disponibles pendant la soirée (bouton <strong>Sous-titres</strong> dans Zoom).<br/>
      · Tu n'as pas besoin de compte Zoom : le lien suffit, depuis un ordinateur, une tablette ou un téléphone.
    </div>
  </div>`;

const DEFAULT_DURATION_MIN = 90;

function blocHoraire(eventDate: string, durationMin?: number | null): string {
  const debut = new Date(eventDate);
  const fin = new Date(debut.getTime() + (Number(durationMin) || DEFAULT_DURATION_MIN) * 60000);
  const ouverture = new Date(debut.getTime() - DOORS_OPEN_MIN * 60000);
  return `
  <div style="background:#e8f7fd;border-radius:12px;padding:16px 18px;margin:20px 0;">
    <div style="font-size:14px;font-weight:700;color:#1a8bbf;text-transform:capitalize;">${fmtDateLong(eventDate)}</div>
    <div style="font-size:14px;color:#1a8bbf;margin-top:4px;">
      ${fmtHeure(eventDate)} – ${fmtHeure(fin.toISOString())} · salle ouverte dès ${fmtHeure(ouverture.toISOString())}
    </div>
  </div>`;
}

// ─── Corps des quatre emails ────────────────────────────────────────────────
function emailConfirmation(titre: string, eventDate: string, zoomUrl: string, prenom: string | null, dureeMin?: number | null) {
  return {
    subject: `C'est réservé : « ${titre} » le ${fmtDateCourte(eventDate)}`,
    body: `
      <h1 style="font-size:23px;margin:0 0 14px;color:#1f1f20;">${prenom ? `Merci ${prenom} !` : 'Merci !'}</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 4px;color:#3d3d3d;">
        Ta place est réservée pour la soirée <strong>« ${titre} »</strong>. On se retrouve en visio avec Tiffany.
      </p>
      ${blocHoraire(eventDate, dureeMin)}
      ${btn(zoomUrl, 'Rejoindre la soirée sur Zoom')}
      <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0 0 4px;text-align:center;">
        Garde cet email : c'est ton lien d'accès. Tu le retrouves aussi dans l'app, dans <em>Les soirées CaniPlus</em>.
      </p>
      ${BLOC_PRATIQUE}
      <p style="font-size:14px;line-height:1.7;color:#3d3d3d;margin:0;">
        <strong>Tu ne peux pas être là en direct ?</strong> Pas de souci : la soirée est enregistrée et le replay
        t'est envoyé après, à regarder pendant 7 jours. C'est compris dans ton inscription.
      </p>`,
  };
}

function emailRappelJ1(titre: string, eventDate: string, zoomUrl: string, prenom: string | null, dureeMin?: number | null) {
  return {
    subject: `Demain soir : « ${titre} »`,
    body: `
      <h1 style="font-size:23px;margin:0 0 14px;color:#1f1f20;">${prenom ? `${prenom}, c'est demain !` : "C'est demain !"}</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 4px;color:#3d3d3d;">
        Petit rappel : la soirée <strong>« ${titre} »</strong> a lieu demain soir. Voici ton lien.
      </p>
      ${blocHoraire(eventDate, dureeMin)}
      ${btn(zoomUrl, 'Rejoindre la soirée sur Zoom')}
      ${BLOC_PRATIQUE}
      <p style="font-size:14px;line-height:1.7;color:#3d3d3d;margin:0;">
        Un empêchement de dernière minute ? Le replay t'arrive après la soirée, à regarder pendant 7 jours.
      </p>`,
  };
}

function emailRappelJourJ(titre: string, eventDate: string, zoomUrl: string, prenom: string | null) {
  const ouverture = new Date(new Date(eventDate).getTime() - DOORS_OPEN_MIN * 60000).toISOString();
  return {
    subject: `Ce soir à ${fmtHeure(eventDate)} : « ${titre} »`,
    body: `
      <h1 style="font-size:23px;margin:0 0 14px;color:#1f1f20;">${prenom ? `À tout à l'heure ${prenom} !` : 'À tout à l\'heure !'}</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 4px;color:#3d3d3d;">
        La soirée <strong>« ${titre} »</strong> commence à ${fmtHeure(eventDate)}.
        La salle Zoom ouvre dès ${fmtHeure(ouverture)}, tu peux entrer tranquillement.
      </p>
      ${btn(zoomUrl, 'Rejoindre la soirée maintenant')}
      ${BLOC_PRATIQUE}`,
  };
}

function emailReplay(
  titre: string, eventDate: string, replayUrl: string,
  replayCode: string | null, expiresAt: string | null, prenom: string | null,
) {
  const codeBloc = replayCode
    ? `<div style="background:#F8F5F0;border-radius:12px;padding:16px 18px;margin:20px 0;text-align:center;">
         <div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Code d'accès</div>
         <div style="font-size:24px;font-weight:800;color:#1f1f20;letter-spacing:2px;margin-top:6px;font-family:monospace;">${replayCode}</div>
         <div style="font-size:12px;color:#6b7280;margin-top:8px;">Zoom te le demandera à l'ouverture du lien.</div>
       </div>`
    : '';
  const expireBloc = expiresAt
    ? `<p style="font-size:14px;line-height:1.7;color:#3d3d3d;margin:0;">
         Le replay reste disponible jusqu'au <strong>${fmtDateLong(expiresAt)}</strong>. Après cette date, le lien ne fonctionne plus.
       </p>`
    : `<p style="font-size:14px;line-height:1.7;color:#3d3d3d;margin:0;">Le replay reste disponible 7 jours.</p>`;

  return {
    subject: `Le replay de « ${titre} » est disponible`,
    body: `
      <h1 style="font-size:23px;margin:0 0 14px;color:#1f1f20;">Le replay est en ligne${prenom ? `, ${prenom}` : ''} !</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 4px;color:#3d3d3d;">
        Voici l'enregistrement de la soirée <strong>« ${titre} »</strong> du ${fmtDateCourte(eventDate)}.
        Que tu aies suivi le direct ou non, il est compris dans ton inscription.
      </p>
      ${btn(replayUrl, 'Regarder le replay')}
      ${codeBloc}
      ${expireBloc}
      <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:18px 0 0;">
        Tu retrouves aussi le replay dans l'app, dans <em>Les soirées CaniPlus</em> :
        <a href="${APP_URL}" style="color:#1e8db8;">app.caniplus.ch</a>
      </p>`,
  };
}

// ─── Destinataires payés d'une soirée ───────────────────────────────────────
// Les remboursés (status='refunded') sont exclus par le filtre status='paid' :
// un remboursement coupe donc aussi les rappels et l'email de replay.
async function inscritsPayes(supabase: any, productId: string) {
  const { data, error } = await supabase
    .from('user_purchases')
    .select('id, user_id, guest_email, profiles(full_name, email)')
    .eq('product_id', productId)
    .eq('status', 'paid');
  if (error) throw error;

  return (data ?? []).flatMap((p: any) => {
    const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
    const email = profile?.email ?? p.guest_email;
    if (!email) return [];
    const fullName: string | null = profile?.full_name ?? null;
    return [{
      purchaseId: p.id as string,
      email: email as string,
      fullName,
      prenom: fullName ? fullName.trim().split(/\s+/)[0] : null,
    }];
  });
}

// Journalise AVANT d'envoyer : le conflit d'unicité sert de verrou anti-doublon.
async function claimSend(
  supabase: any, productId: string, purchaseId: string | null, email: string, kind: Kind,
): Promise<boolean> {
  const { error } = await supabase
    .from('soiree_emails_sent')
    .insert({ product_id: productId, purchase_id: purchaseId, email, kind });
  if (error) {
    // 23505 = unique_violation : déjà envoyé, rien à faire.
    if ((error as any).code !== '23505') {
      console.error(`[soiree-emails] claim ${kind} error:`, error.message);
    }
    return false;
  }
  return true;
}

// Un envoi raté libère le verrou, pour que la tentative suivante repasse.
async function releaseSend(supabase: any, productId: string, email: string, kind: Kind) {
  await supabase.from('soiree_emails_sent')
    .delete()
    .eq('product_id', productId).eq('email', email).eq('kind', kind);
}

async function envoyerLot(
  supabase: any, productId: string, kind: Kind,
  destinataires: Array<{ purchaseId: string; email: string; fullName: string | null; prenom: string | null }>,
  build: (prenom: string | null) => { subject: string; body: string },
): Promise<number> {
  let sent = 0;
  for (const d of destinataires) {
    if (!(await claimSend(supabase, productId, d.purchaseId, d.email, kind))) continue;
    const { subject, body } = build(d.prenom);
    if (await sendEmail(d.email, d.fullName, subject, body)) sent++;
    else await releaseSend(supabase, productId, d.email, kind);
  }
  return sent;
}

// ─── Chargement d'une soirée + ses secrets ──────────────────────────────────
async function chargerSoiree(supabase: any, productId: string) {
  const { data: product } = await supabase
    .from('digital_products')
    .select('id, title, event_date, event_duration_min, event_cancelled')
    .eq('id', productId)
    .eq('category', 'soiree')
    .maybeSingle();
  if (!product) throw new Error('Soirée introuvable');

  const { data: access } = await supabase
    .from('webinar_access')
    .select('zoom_url, replay_url, replay_code, replay_expires_at')
    .eq('product_id', productId)
    .maybeSingle();

  return { product, access: access ?? {} };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    // ── Auth : service role, cron, ou admin connecté ─────────────────────────
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';
    const xCron = req.headers.get('X-Cron-Secret') ?? '';

    let authorized = authHeader === `Bearer ${serviceKey}` || (!!cronSecret && xCron === cronSecret);
    if (!authorized) {
      const jwt = authHeader.replace(/^Bearer\s+/i, '');
      const { data: userData } = await supabase.auth.getUser(jwt);
      if (userData?.user) {
        const { data: profile } = await supabase
          .from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
        authorized = profile?.role === 'admin';
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'reminders';

    // ══ CONFIRMATION ════════════════════════════════════════════════════════
    // Appelée par stripe-webhook juste après le passage en payé.
    if (action === 'confirmation') {
      const { product_id, purchase_id, email: emailArg, full_name } = body;
      if (!product_id) throw new Error('product_id requis');

      const { product, access } = await chargerSoiree(supabase, product_id);
      if (!access.zoom_url) {
        console.error(`[soiree-emails] pas de lien Zoom pour ${product_id} — confirmation non envoyée`);
        return ok({ sent: 0, reason: 'zoom_url manquant' });
      }
      if (!product.event_date) {
        console.error(`[soiree-emails] pas de date pour ${product_id} — confirmation non envoyée`);
        return ok({ sent: 0, reason: 'event_date manquante' });
      }

      // On repart des inscrits payés plutôt que des seuls arguments : la
      // confirmation ne peut ainsi partir que vers un paiement réellement
      // enregistré en base.
      const tous = await inscritsPayes(supabase, product_id);

      // On vise d'abord la ligne d'achat annoncée par le webhook, puis l'email
      // du payeur si elle est introuvable — le webhook a lui-même plusieurs
      // chemins pour marquer un achat payé, et l'id qu'il transmet peut ne pas
      // correspondre à la ligne finale.
      let cible = purchase_id ? tous.filter((d) => d.purchaseId === purchase_id) : [];
      if (cible.length === 0 && emailArg) {
        const cherche = String(emailArg).toLowerCase();
        cible = tous.filter((d) => d.email.toLowerCase() === cherche);
      }
      if (cible.length === 0) {
        console.warn(`[soiree-emails] confirmation : aucun achat payé trouvé (product=${product_id} purchase=${purchase_id} email=${emailArg})`);
        return ok({ sent: 0, reason: 'achat payé introuvable' });
      }
      if (full_name && !cible[0].fullName) {
        cible[0].fullName = String(full_name);
        cible[0].prenom = String(full_name).trim().split(/\s+/)[0];
      }

      const sent = await envoyerLot(supabase, product_id, 'confirmation', cible, (prenom) =>
        emailConfirmation(product.title, product.event_date, access.zoom_url, prenom, product.event_duration_min),
      );
      console.log(`[soiree-emails] confirmation · ${product.title} · ${sent} envoi(s)`);
      return ok({ sent });
    }

    // ══ REPLAY ══════════════════════════════════════════════════════════════
    // Déclenchée par Tiffany depuis l'admin, une fois le lien de replay saisi.
    if (action === 'replay') {
      const { product_id } = body;
      if (!product_id) throw new Error('product_id requis');

      const { product, access } = await chargerSoiree(supabase, product_id);
      if (!access.replay_url) throw new Error("Renseigne d'abord le lien du replay.");

      const destinataires = await inscritsPayes(supabase, product_id);
      const sent = await envoyerLot(supabase, product_id, 'replay', destinataires, (prenom) =>
        emailReplay(
          product.title, product.event_date, access.replay_url,
          access.replay_code ?? null, access.replay_expires_at ?? null, prenom,
        ),
      );
      console.log(`[soiree-emails] replay · ${product.title} · ${sent}/${destinataires.length} envoi(s)`);
      return ok({ sent, total: destinataires.length });
    }

    // ══ RAPPELS (cron horaire) ══════════════════════════════════════════════
    // Fenêtres calculées depuis event_date, donc justes quelle que soit l'heure
    // de la soirée et sans arithmétique de fuseau :
    //   rappel J-1     : [event − 26h, event − 1h)   → 18h00 la veille pour 20h00
    //   rappel jour J  : [event − 1h,  event + 15min)
    // Elles se touchent sans se recouvrir : aucune soirée ne peut recevoir les
    // deux rappels dans la même exécution.
    if (action === 'reminders') {
      const now = Date.now();
      const { data: soirees, error } = await supabase
        .from('digital_products')
        .select('id, title, event_date, event_duration_min, event_cancelled, is_published')
        .eq('category', 'soiree')
        .eq('event_cancelled', false)
        .not('event_date', 'is', null)
        .gte('event_date', new Date(now - 2 * 3600 * 1000).toISOString())
        .lte('event_date', new Date(now + 30 * 3600 * 1000).toISOString());
      if (error) throw error;

      const resultats: Array<{ soiree: string; kind: Kind; sent: number }> = [];

      for (const s of soirees ?? []) {
        const start = new Date(s.event_date).getTime();
        let kind: Kind | null = null;
        if (now >= start - REMINDER_J1_BEFORE_MS && now < start - REMINDER_J0_BEFORE_MS) kind = 'rappel_j1';
        else if (now >= start - REMINDER_J0_BEFORE_MS && now < start + J0_LATE_TOLERANCE_MS) kind = 'rappel_jour_j';
        if (!kind) continue;

        const { data: access } = await supabase
          .from('webinar_access').select('zoom_url').eq('product_id', s.id).maybeSingle();
        if (!access?.zoom_url) {
          console.error(`[soiree-emails] rappel impossible, lien Zoom manquant · ${s.title}`);
          continue;
        }

        const destinataires = await inscritsPayes(supabase, s.id);
        if (destinataires.length === 0) continue;

        const build = kind === 'rappel_j1'
          ? (prenom: string | null) => emailRappelJ1(s.title, s.event_date, access.zoom_url, prenom, s.event_duration_min)
          : (prenom: string | null) => emailRappelJourJ(s.title, s.event_date, access.zoom_url, prenom);

        const sent = await envoyerLot(supabase, s.id, kind, destinataires, build);
        if (sent > 0) console.log(`[soiree-emails] ${kind} · ${s.title} · ${sent} envoi(s)`);
        resultats.push({ soiree: s.title, kind, sent });
      }

      return ok({ checked: soirees?.length ?? 0, resultats });
    }

    throw new Error(`Action inconnue : ${action}`);

  } catch (err) {
    const message = (err as any)?.message ?? String(err) ?? 'Erreur inconnue';
    console.error('soiree-emails error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
