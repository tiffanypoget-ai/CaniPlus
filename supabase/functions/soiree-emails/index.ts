// supabase/functions/soiree-emails/index.ts
// Emails des « soirées CaniPlus » (webinaires payants, prestation RI).
//
// Quatre actions, une seule fonction pour ne maintenir qu'un gabarit d'email :
//   - action 'confirmation'  : appelée par stripe-webhook dès qu'une inscription
//                              passe en payée. Envoie le lien Zoom.
//   - action 'reminders'     : appelée toutes les heures par pg_cron. Envoie le
//                              rappel J-1 (18h), le rappel du jour J (1h
//                              avant), puis l'email du lendemain.
//   - action 'lendemain'     : le même email, déclenché à la main depuis l'admin
//                              en ignorant la fenêtre horaire (rattrapage).
//   - action 'replay'        : envoi du seul replay, quand il arrive après
//                              l'email du lendemain.
//
// L'email du lendemain part tout seul à 08h00 (heure suisse) le jour suivant la
// soirée. Il porte la fiche récap en pièce jointe, et le replay s'il est déjà
// prêt. Tiffany n'a donc rien à cliquer le soir même : elle dépose la fiche
// quand elle veut, même des jours à l'avance.
//
// La fiche, c'est le PDF de digital_products.file_path — le même fichier que
// l'onglet Soirées sait déposer depuis août, et que l'app sert en
// téléchargement aux inscrites. Un seul document, un seul endroit où le
// déposer : décision de Tiffany le 06.10, « c'est la même chose ».
//
// Anti-doublon : chaque envoi est journalisé dans soiree_emails_sent
// (product_id, email, kind) UNIQUE. On insère AVANT d'envoyer : si la ligne
// existe déjà, l'insert échoue et on n'envoie rien. Deux exécutions
// simultanées du cron ne peuvent donc pas doubler un rappel.
//
// Auth : Bearer service role (webhook), Bearer CRON_SECRET ou X-Cron-Secret
// (pg_cron), ou JWT d'un profil admin (boutons de l'onglet Soirées).
//
// DÉPLOYÉE AVEC verify_jwt=false, comme les autres fonctions appelées par
// pg_cron : le cron n'envoie pas de JWT. La porte reste fermée — le contrôle
// des identités ci-dessous est fait dans le code, et tout appel qui n'en
// présente aucune repart en 401.
//
// Le lien Zoom n'est jamais renvoyé dans la réponse HTTP : il ne sort d'ici que
// dans le corps des emails, vers l'adresse d'un inscrit payé. La fiche récap
// suit la même règle : elle part en pièce jointe, jamais par URL signée.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.caniplus.ch';
// Le calendrier des soirées vit sur le site vitrine, pas dans l'app : la
// plupart des inscrites achètent en invitée depuis caniplus.ch et n'ont aucun
// compte dans l'app. C'est donc là qu'on les renvoie pour la soirée suivante.
const SITE_SOIREES_URL = Deno.env.get('SITE_SOIREES_URL')
  ?? 'https://caniplus.ch/pages/soirees-caniplus';
const CONTACT_EMAIL = 'info@caniplus.ch';

// La salle Zoom ouvre 15 minutes avant le début, le temps que tout le monde
// s'installe. Le rappel du jour J part 1h avant ; celui de la veille, 26h avant
// (= 18h00 la veille pour une soirée à 20h00).
const DOORS_OPEN_MIN = 15;
const REMINDER_J1_BEFORE_MS = 26 * 3600 * 1000;
const REMINDER_J0_BEFORE_MS = 1 * 3600 * 1000;
// Un rappel du jour J reste utile tant que la salle vient d'ouvrir.
const J0_LATE_TOLERANCE_MS = 15 * 60 * 1000;

// Email du lendemain : fenêtre 08h00 → 20h00, heure suisse, le jour qui suit la
// soirée. Large volontairement : si la fiche n'est pas déposée à 08h00, le
// premier tick de cron qui la trouve envoie le mail, sans attendre le lendemain.
const LENDEMAIN_DEBUT_H = 8;
const LENDEMAIN_FIN_H = 20;

// Bucket privé d'où provient la fiche récap.
const BUCKET_PRODUITS = 'digital-products';

// Brevo plafonne la taille d'un appel ; on s'arrête bien avant, le corps HTML
// et le gonflement de 33 % dû au base64 comptant aussi. Le bucket
// digital-products ne borne pas les uploads (il sert aussi aux guides de la
// boutique), donc ce garde-fou est le seul.
const MAX_PIECE_JOINTE_OCTETS = 8 * 1024 * 1024;

// Sans date d'expiration connue, on considère qu'un replay de plus de 7 jours
// n'est plus en ligne : les liens de partage Zoom sont réglés sur 7 jours.
const REPLAY_DUREE_MS = 7 * 24 * 3600 * 1000;

type Kind = 'confirmation' | 'rappel_j1' | 'rappel_jour_j' | 'lendemain' | 'replay';

type Destinataire = {
  purchaseId: string;
  email: string;
  fullName: string | null;
  prenom: string | null;
};

type PieceJointe = { nom: string; contenuBase64: string };

// Trois états possibles du replay au moment de l'email du lendemain. L'état
// 'expire' existe pour le rattrapage des soirées déjà anciennes : on n'y
// promet pas un replay qui n'arrivera jamais.
type EtatReplay =
  | { etat: 'pret'; url: string; code: string | null; expiresAt: string | null }
  | { etat: 'bientot' }
  | { etat: 'expire' };

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

// ─── Heure murale suisse ↔ instant UTC ──────────────────────────────────────
// Les rappels se calculent en différences depuis event_date, donc sans fuseau.
// L'email du lendemain, lui, est fixé à une heure murale (« 08h00 chez
// Tiffany »), ce qui tombe à 06h00 ou 07h00 UTC selon l'heure d'été. On passe
// par Intl plutôt que par un offset codé en dur, pour que le 25 octobre et le
// 29 mars se comportent correctement.

// Décalage Europe/Zurich − UTC à un instant donné, en millisecondes.
function decalageZurichMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const v = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // hour12:false rend « 24 » pour minuit sur certaines versions d'ICU.
  const murEnUtc = Date.UTC(
    v('year'), v('month') - 1, v('day'), v('hour') % 24, v('minute'), v('second'),
  );
  return murEnUtc - instant.getTime();
}

// Instant UTC correspondant à une heure murale suisse donnée.
function heureSuisseEnUtc(y: number, m: number, d: number, hh: number, mm: number): number {
  const naif = Date.UTC(y, m - 1, d, hh, mm);
  // Deux passes : la première estime le décalage au point naïf, la seconde le
  // corrige si cette estimation tombait du mauvais côté d'un changement
  // d'heure. 08h00 et 20h00 ne tombent jamais dans l'heure de bascule
  // (02h→03h), donc la seconde passe suffit toujours ici.
  let t = naif - decalageZurichMs(new Date(naif));
  t = naif - decalageZurichMs(new Date(t));
  return t;
}

// Date civile suisse du jour suivant un instant donné.
function lendemainSuisse(iso: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso));
  const v = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const jour = new Date(Date.UTC(v('year'), v('month') - 1, v('day')) + 24 * 3600 * 1000);
  return { y: jour.getUTCFullYear(), m: jour.getUTCMonth() + 1, d: jour.getUTCDate() };
}

function fenetreLendemain(eventDate: string): { debut: number; fin: number } {
  const { y, m, d } = lendemainSuisse(eventDate);
  return {
    debut: heureSuisseEnUtc(y, m, d, LENDEMAIN_DEBUT_H, 0),
    fin: heureSuisseEnUtc(y, m, d, LENDEMAIN_FIN_H, 0),
  };
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

async function sendEmail(
  to: string, name: string | null, subject: string, bodyHtml: string,
  pieceJointe?: PieceJointe | null,
): Promise<boolean> {
  const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
  if (!apiKey) {
    console.error('[soiree-emails] BREVO_API_KEY manquante');
    return false;
  }
  try {
    const payload: Record<string, unknown> = {
      sender: { name: 'CaniPlus', email: CONTACT_EMAIL },
      replyTo: { name: 'CaniPlus', email: CONTACT_EMAIL },
      to: [{ email: to, name: name || undefined }],
      subject,
      htmlContent: wrapEmail(bodyHtml),
    };
    // Brevo accepte les pièces jointes en base64 : [{ content, name }].
    if (pieceJointe) {
      payload.attachment = [{ content: pieceJointe.contenuBase64, name: pieceJointe.nom }];
    }
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify(payload),
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

// Code d'accès et date d'expiration du replay : partagés entre l'email du
// lendemain et l'email de replay, pour que les deux disent exactement la même
// chose du même lien.
function blocCodeReplay(replayCode: string | null): string {
  if (!replayCode) return '';
  return `<div style="background:#F8F5F0;border-radius:12px;padding:16px 18px;margin:20px 0;text-align:center;">
         <div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Code d'accès</div>
         <div style="font-size:24px;font-weight:800;color:#1f1f20;letter-spacing:2px;margin-top:6px;font-family:monospace;">${replayCode}</div>
         <div style="font-size:12px;color:#6b7280;margin-top:8px;">Zoom te le demandera à l'ouverture du lien.</div>
       </div>`;
}

function blocExpirationReplay(expiresAt: string | null): string {
  return expiresAt
    ? `<p style="font-size:14px;line-height:1.7;color:#3d3d3d;margin:0;">
         Le replay reste disponible jusqu'au <strong>${fmtDateLong(expiresAt)}</strong>. Après cette date, le lien ne fonctionne plus.
       </p>`
    : `<p style="font-size:14px;line-height:1.7;color:#3d3d3d;margin:0;">Le replay reste disponible 7 jours.</p>`;
}

// ─── Corps des cinq emails ──────────────────────────────────────────────────
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

// L'email du lendemain. La fiche récap est toujours en pièce jointe — sans
// elle, rien ne part. Le replay n'y figure que s'il est réellement en ligne :
// quand il a expiré (rattrapage d'une vieille soirée), on n'en parle pas,
// plutôt que de promettre un envoi qui n'aura pas lieu.
function emailLendemain(
  titre: string, eventDate: string, prenom: string | null, replay: EtatReplay,
) {
  let blocReplay = '';
  if (replay.etat === 'pret') {
    blocReplay = `
      <p style="font-size:15px;line-height:1.7;margin:22px 0 0;color:#3d3d3d;">
        Et voici le <strong>replay</strong> de la soirée, si tu veux revoir un passage ou si tu n'as pas pu être là en direct.
      </p>
      ${btn(replay.url, 'Regarder le replay')}
      ${blocCodeReplay(replay.code)}
      ${blocExpirationReplay(replay.expiresAt)}`;
  } else if (replay.etat === 'bientot') {
    blocReplay = `
      <p style="font-size:14px;line-height:1.7;color:#3d3d3d;margin:22px 0 0;">
        Le replay suit dans un prochain mail.
      </p>`;
  }

  return {
    subject: `Ta fiche récap de « ${titre} »`,
    body: `
      <h1 style="font-size:23px;margin:0 0 14px;color:#1f1f20;">Merci d'être venue${prenom ? `, ${prenom}` : ''} !</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 4px;color:#3d3d3d;">
        La soirée <strong>« ${titre} »</strong> du ${fmtDateCourte(eventDate)} est derrière nous. Merci pour tes questions
        et pour le temps que tu prends avec ton chien.
      </p>
      <div style="background:#e8f7fd;border-radius:12px;padding:16px 18px;margin:22px 0;">
        <div style="font-size:14px;font-weight:700;color:#1a8bbf;margin-bottom:6px;">La fiche récap est en pièce jointe</div>
        <div style="font-size:13px;line-height:1.7;color:#1a8bbf;">
          Un PDF à relire tranquillement ou à imprimer, avec l'essentiel de la soirée. Il est à toi, garde-le.
        </div>
      </div>
      ${blocReplay}
      <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:22px 0 0;">
        La prochaine soirée est annoncée sur le site :
        <a href="${SITE_SOIREES_URL}" style="color:#1e8db8;">caniplus.ch/pages/soirees-caniplus</a>
      </p>`,
  };
}

function emailReplay(
  titre: string, eventDate: string, replayUrl: string,
  replayCode: string | null, expiresAt: string | null, prenom: string | null,
) {
  return {
    subject: `Le replay de « ${titre} » est disponible`,
    body: `
      <h1 style="font-size:23px;margin:0 0 14px;color:#1f1f20;">Le replay est en ligne${prenom ? `, ${prenom}` : ''} !</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 4px;color:#3d3d3d;">
        Voici l'enregistrement de la soirée <strong>« ${titre} »</strong> du ${fmtDateCourte(eventDate)}.
        Que tu aies suivi le direct ou non, il est compris dans ton inscription.
      </p>
      ${btn(replayUrl, 'Regarder le replay')}
      ${blocCodeReplay(replayCode)}
      ${blocExpirationReplay(expiresAt)}
      <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:18px 0 0;">
        Tu retrouves aussi le replay dans l'app, dans <em>Les soirées CaniPlus</em> :
        <a href="${APP_URL}" style="color:#1e8db8;">app.caniplus.ch</a>
      </p>`,
  };
}

// ─── Destinataires payés d'une soirée ───────────────────────────────────────
// Les remboursés (status='refunded') sont exclus par le filtre status='paid' :
// un remboursement coupe donc aussi les rappels et l'email de replay.
async function inscritsPayes(supabase: any, productId: string): Promise<Destinataire[]> {
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
  destinataires: Destinataire[],
  build: (prenom: string | null) => { subject: string; body: string },
  options?: { pieceJointe?: PieceJointe | null; apresEnvoi?: (d: Destinataire) => Promise<void> },
): Promise<number> {
  let sent = 0;
  for (const d of destinataires) {
    if (!(await claimSend(supabase, productId, d.purchaseId, d.email, kind))) continue;
    const { subject, body } = build(d.prenom);
    if (await sendEmail(d.email, d.fullName, subject, body, options?.pieceJointe)) {
      sent++;
      if (options?.apresEnvoi) await options.apresEnvoi(d);
    } else {
      await releaseSend(supabase, productId, d.email, kind);
    }
  }
  return sent;
}

// ─── Chargement d'une soirée + ses secrets ──────────────────────────────────
async function chargerSoiree(supabase: any, productId: string) {
  const { data: product } = await supabase
    .from('digital_products')
    .select('id, slug, title, event_date, event_duration_min, event_cancelled, file_path')
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

// ─── La fiche récap, lue depuis le Storage privé ────────────────────────────
// btoa ne prend qu'une chaîne : on découpe en tranches pour ne pas exploser la
// pile sur un PDF de plusieurs mégaoctets.
function versBase64(octets: Uint8Array): string {
  const TRANCHE = 0x8000;
  let binaire = '';
  for (let i = 0; i < octets.length; i += TRANCHE) {
    binaire += String.fromCharCode(...octets.subarray(i, i + TRANCHE));
  }
  return btoa(binaire);
}

async function chargerFiche(
  supabase: any, filePath: string | null, nomVoulu: string,
): Promise<{ fiche: PieceJointe | null; erreur: string | null }> {
  if (!filePath) return { fiche: null, erreur: 'aucune fiche récap déposée' };

  const { data, error } = await supabase.storage.from(BUCKET_PRODUITS).download(filePath);
  if (error || !data) {
    console.error(`[soiree-emails] fiche illisible ${BUCKET_PRODUITS}/${filePath} :`, error?.message ?? 'vide');
    return { fiche: null, erreur: 'fiche déposée mais illisible dans le Storage' };
  }

  const octets = new Uint8Array(await data.arrayBuffer());
  if (octets.byteLength === 0) {
    return { fiche: null, erreur: 'fiche vide dans le Storage' };
  }
  if (octets.byteLength > MAX_PIECE_JOINTE_OCTETS) {
    const mo = (octets.byteLength / 1048576).toFixed(1);
    return { fiche: null, erreur: `fiche trop lourde (${mo} Mo, maximum 8 Mo)` };
  }
  return { fiche: { nom: nomVoulu, contenuBase64: versBase64(octets) }, erreur: null };
}

// Nom du fichier tel que la destinataire le verra dans sa boîte mail, plutôt
// que le nom technique horodaté du Storage.
function nomFichePour(product: any): string {
  const base = String(product.slug || 'soiree').replace(/[^A-Za-z0-9._-]/g, '-');
  return `fiche-recap-${base}.pdf`;
}

// ─── Alerte admin : 08h00 sans fiche ────────────────────────────────────────
async function alerterFicheManquante(supabase: any, product: any, raison: string) {
  // La fenêtre du lendemain couvre douze ticks de cron. Sans ce garde-fou,
  // Tiffany recevrait douze fois la même alerte dans la journée : on n'en
  // envoie qu'une par soirée et par journée.
  const depuis = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  const { data: deja } = await supabase
    .from('admin_notifications')
    .select('id')
    .eq('kind', 'soiree_fiche_manquante')
    .eq('metadata->>product_id', product.id)
    .gte('created_at', depuis)
    .limit(1);
  if (deja && deja.length > 0) return;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const url = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/notify-admin`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'soiree_fiche_manquante',
        title: `Fiche récap manquante pour la soirée du ${fmtDateCourte(product.event_date)}`,
        body: `L'email du lendemain de « ${product.title} » attend sa fiche récap. `
          + `Dépose le PDF dans l'onglet Soirées : l'email partira tout seul dans l'heure, `
          + `sans rien d'autre à cliquer. Raison : ${raison}.`,
        metadata: { product_id: product.id, soiree: product.title, raison },
      }),
    });
  } catch (e) {
    console.error('[soiree-emails] alerte fiche manquante impossible :', (e as Error).message);
  }
}

// ─── L'email du lendemain ───────────────────────────────────────────────────
function etatReplay(access: any, eventDate: string): EtatReplay {
  const expire = access.replay_expires_at
    ? new Date(access.replay_expires_at).getTime() <= Date.now()
    : new Date(eventDate).getTime() + REPLAY_DUREE_MS <= Date.now();

  if (access.replay_url && !expire) {
    return {
      etat: 'pret',
      url: access.replay_url,
      code: access.replay_code ?? null,
      expiresAt: access.replay_expires_at ?? null,
    };
  }
  return { etat: expire ? 'expire' : 'bientot' };
}

// Appelée par le cron dans la fenêtre 08h00–20h00, et par l'admin sans
// condition d'heure (rattrapage). Le verrou soiree_emails_sent garantit qu'une
// inscrite ne reçoit cet email qu'une fois, quel que soit le chemin.
async function envoyerLendemain(supabase: any, product: any, access: any) {
  if (product.event_cancelled) return { sent: 0, total: 0, raison: 'soirée annulée' };
  if (!product.event_date) return { sent: 0, total: 0, raison: 'event_date manquante' };

  const tous = await inscritsPayes(supabase, product.id);
  if (tous.length === 0) return { sent: 0, total: 0, raison: 'aucun inscrit payé' };

  // Qui n'a pas encore reçu cet email ? La fenêtre couvre douze ticks de cron :
  // sans ce filtre, on retéléchargerait et réencoderait le PDF douze fois
  // pour rien, et surtout une fiche supprimée du Storage après coup
  // déclencherait une alerte « fiche manquante » alors que tout le monde l'a
  // déjà reçue. Le verrou soiree_emails_sent reste la garantie finale ; ce
  // filtre ne fait qu'éviter le travail inutile.
  const { data: dejaEnvoyes } = await supabase
    .from('soiree_emails_sent')
    .select('email')
    .eq('product_id', product.id)
    .eq('kind', 'lendemain');
  const vus = new Set((dejaEnvoyes ?? []).map((l: any) => String(l.email).toLowerCase()));
  const destinataires = tous.filter((d) => !vus.has(d.email.toLowerCase()));
  if (destinataires.length === 0) {
    return { sent: 0, total: tous.length, dejaTous: true, raison: 'déjà envoyé à tous les inscrits' };
  }

  const { fiche, erreur } = await chargerFiche(
    supabase, product.file_path ?? null, nomFichePour(product),
  );
  if (!fiche) {
    // Rien ne part sans la fiche : c'est l'objet même de cet email. Tiffany
    // est prévenue, et l'envoi se fera au tick suivant dès que le PDF sera là.
    console.error(`[soiree-emails] lendemain sans fiche · ${product.title} · ${erreur}`);
    await alerterFicheManquante(supabase, product, erreur ?? 'fiche introuvable');
    return { sent: 0, total: tous.length, raison: erreur ?? 'fiche manquante' };
  }

  const replay = etatReplay(access, product.event_date);
  const sent = await envoyerLot(
    supabase, product.id, 'lendemain', destinataires,
    (prenom) => emailLendemain(product.title, product.event_date, prenom, replay),
    {
      pieceJointe: fiche,
      // Le replay voyage dans cet email : on journalise aussi 'replay' pour
      // que le bouton « Envoyer le replay » de l'admin, ou le webhook Zoom,
      // ne le renvoient pas une seconde fois à quelqu'un qui l'a déjà reçu.
      apresEnvoi: replay.etat === 'pret'
        ? async (d: Destinataire) => {
            await claimSend(supabase, product.id, d.purchaseId, d.email, 'replay');
          }
        : undefined,
    },
  );
  return { sent, total: tous.length, replay: replay.etat };
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

    // Le jeton peut arriver de trois façons :
    //   Bearer <service role>  → appel depuis stripe-webhook
    //   Bearer <CRON_SECRET>   → pg_cron, convention des jobs déjà en place
    //                            (auto-cancel-unpaid-private, publish-scheduled-bundles)
    //   X-Cron-Secret          → variante utilisée par trial-reminder
    // Sinon on retombe sur le JWT d'un profil admin (bouton dans l'app).
    const bearer = authHeader.replace(/^Bearer\s+/i, '');
    let authorized =
      (!!serviceKey && bearer === serviceKey) ||
      (!!cronSecret && (bearer === cronSecret || xCron === cronSecret));
    if (!authorized) {
      const jwt = bearer;
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

    // ══ LENDEMAIN (déclenché à la main) ═════════════════════════════════════
    // Même email que celui du cron, mais sans condition d'heure : sert au
    // rattrapage des soirées déjà passées, et à repartir tout de suite après
    // avoir déposé une fiche en retard.
    if (action === 'lendemain') {
      const { product_id } = body;
      if (!product_id) throw new Error('product_id requis');

      const { product, access } = await chargerSoiree(supabase, product_id);
      const resultat = await envoyerLendemain(supabase, product, access);
      console.log(`[soiree-emails] lendemain (manuel) · ${product.title} · ${resultat.sent}/${resultat.total} envoi(s)`);
      return ok(resultat);
    }

    // ══ REPLAY ══════════════════════════════════════════════════════════════
    // Reste utile quand le replay arrive après l'email du lendemain : bouton de
    // l'admin, ou webhook Zoom. Les inscrits qui l'ont déjà reçu dans l'email
    // du lendemain sont filtrés par le verrou soiree_emails_sent.
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

    // ══ RAPPELS ET EMAIL DU LENDEMAIN (cron horaire) ════════════════════════
    // Fenêtres calculées depuis event_date, donc justes quelle que soit l'heure
    // de la soirée et sans arithmétique de fuseau :
    //   rappel J-1     : [event − 26h, event − 1h)   → 18h00 la veille pour 20h00
    //   rappel jour J  : [event − 1h,  event + 15min)
    // L'email du lendemain, lui, est accroché à une heure murale suisse :
    //   lendemain      : [08h00, 20h00) le jour civil suivant la soirée
    // Les trois fenêtres ne se recouvrent jamais : aucune soirée ne peut
    // recevoir deux de ces emails dans la même exécution.
    if (action === 'reminders') {
      const now = Date.now();
      const { data: soirees, error } = await supabase
        .from('digital_products')
        .select('id, slug, title, event_date, event_duration_min, event_cancelled, is_published, file_path')
        .eq('category', 'soiree')
        .eq('event_cancelled', false)
        .not('event_date', 'is', null)
        // Borne basse à −48h pour que les soirées de la veille entrent encore
        // dans le lot : leur fenêtre « lendemain » court jusqu'à 20h00, soit
        // jusqu'à 35h après une soirée de fin de matinée.
        .gte('event_date', new Date(now - 48 * 3600 * 1000).toISOString())
        .lte('event_date', new Date(now + 30 * 3600 * 1000).toISOString());
      if (error) throw error;

      const resultats: Array<Record<string, unknown>> = [];

      for (const s of soirees ?? []) {
        const start = new Date(s.event_date).getTime();
        const lendemain = fenetreLendemain(s.event_date);

        // ── Email du lendemain ────────────────────────────────────────────
        if (now >= lendemain.debut && now < lendemain.fin) {
          const { data: access } = await supabase
            .from('webinar_access')
            .select('zoom_url, replay_url, replay_code, replay_expires_at')
            .eq('product_id', s.id).maybeSingle();
          const r = await envoyerLendemain(supabase, s, access ?? {});
          if (r.sent > 0) console.log(`[soiree-emails] lendemain · ${s.title} · ${r.sent} envoi(s)`);
          resultats.push({ soiree: s.title, kind: 'lendemain', ...r });
          continue;
        }

        // ── Rappels avant la soirée ───────────────────────────────────────
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
