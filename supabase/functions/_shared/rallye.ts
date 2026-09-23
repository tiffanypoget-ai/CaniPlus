// supabase/functions/_shared/rallye.ts
// Rallye canin de Ballaigues : constantes, référence de virement et emails.
// Utilisé par rallye-inscription, stripe-webhook-club et rallye-admin.
//
// Organisateur et encaisseur : l'association Club canin de Ballaigues, CaniPlus.
// TWINT → compte Stripe CLUB ; virement → compte PostFinance du club.
//
// Ce module n'importe rien de lourd (pas de PDF) : le webhook Stripe le charge
// à chaque paiement et doit rester rapide.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Interrupteur d'ouverture ────────────────────────────────────────────────
// Même constante que dans la page (site-vitrine/pages/rallye-canin-ballaigues.html).
// Fermé : rallye-inscription refuse tout, la page affiche « Les inscriptions
// ouvrent bientôt ». Les deux sont à basculer ensemble.
export const RALLYE_INSCRIPTIONS_OUVERTES = false;

export const RALLYE_EDITION = 2027;
export const PRIX_PAR_CHIEN_CHF = 20;
export const MAX_CHIENS = 6;

// Si le texte des consignes change sur la page, incrémenter (2027-v2, …) :
// chaque inscription garde la version qu'elle a acceptée.
export const CONSIGNES_VERSION = '2027-v1';

// Heure suisse. Le passage à l'heure d'été 2027 tombe le dimanche 28 mars :
// toutes les dates ci-dessous sont en heure d'hiver (+01:00).
// Virement accepté jusqu'au 12 mars 2027 inclus, TWINT seul ensuite.
export const FIN_VIREMENT = new Date('2027-03-13T00:00:00+01:00');
// Plus d'inscription en ligne une fois le rallye terminé.
export const FIN_INSCRIPTIONS = new Date('2027-03-21T15:00:00+01:00');

export const SITE_URL = 'https://caniplus.ch';
export const PAGE_URL = `${SITE_URL}/pages/rallye-canin-ballaigues`;
export const CONTACT_EMAIL = 'info@caniplus.ch';

// Compte PostFinance du club. IBAN ordinaire, pas un QR-IBAN : la référence
// doit donc être une référence créancier ISO 11649 (SCOR, « RF… »). Une
// référence QR (QRR) serait refusée avec cet IBAN.
// Adresse structurée (type S) : rue et numéro séparés.
export const CREANCIER = {
  account: 'CH7809000000169218637',
  name: 'Club canin de Ballaigues, CaniPlus',
  address: 'Chez Thouny',
  buildingNumber: '6',
  zip: 1338,
  city: 'Ballaigues',
  country: 'CH',
} as const;
export const IBAN_AFFICHE = 'CH78 0900 0000 1692 1863 7';

export const PARCOURS: Record<string, string> = {
  '1km': '1 km (chiots et seniors)',
  '3.7km': '3,7 km',
  '5.4km': '5,4 km',
  indecis: 'Je ne sais pas encore',
};

export function virementPossible(now = new Date()): boolean {
  return now < FIN_VIREMENT;
}

// ─── Référence créancier ISO 11649 (SCOR) ────────────────────────────────────
// RF + 2 chiffres de contrôle + corps (1 à 21 caractères alphanumériques).
// Contrôle modulo 97-10 : corps + « RF00 », lettres converties (A=10 … Z=35),
// clé = 98 − (nombre mod 97).
function mod97(digits: string): number {
  let r = 0;
  for (const ch of digits) r = (r * 10 + (ch.charCodeAt(0) - 48)) % 97;
  return r;
}
function lettresEnChiffres(s: string): string {
  return s.toUpperCase().split('').map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join('');
}
export function referenceScor(corps: string): string {
  const c = corps.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!c || c.length > 21) throw new Error('Corps de référence SCOR invalide');
  const cle = 98 - mod97(lettresEnChiffres(c + 'RF00'));
  return `RF${String(cle).padStart(2, '0')}${c}`;
}
export function scorValide(ref: string): boolean {
  const r = ref.replace(/\s/g, '').toUpperCase();
  if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(r)) return false;
  return mod97(lettresEnChiffres(r.slice(4) + r.slice(0, 4))) === 1;
}
// « R27 » + numéro d'inscription sur 4 chiffres : RFxxR270001.
export function referencePourNumero(numero: number): string {
  return referenceScor(`R${String(RALLYE_EDITION).slice(2)}${String(numero).padStart(4, '0')}`);
}
// Affichage par groupes de 4, comme sur la section paiement d'une QR-facture.
export function formatReference(ref: string): string {
  return ref.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
}

export function messageVirement(prenom: string, nom: string): string {
  return `Rallye canin ${RALLYE_EDITION} - ${prenom} ${nom}`.slice(0, 140);
}

// ─── Emails ──────────────────────────────────────────────────────────────────
export type Inscription = {
  id: string;
  numero: number;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  npa: string;
  localite: string;
  parcours_prevu: string | null;
  nb_chiens: number;
  montant_chf: number;
  moyen_paiement: 'twint' | 'virement';
  statut: string;
  reference_scor: string | null;
};
export type Chien = { nom: string; race: string | null; ruban: 'jaune' | 'bleu' };

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const chf = (n: number) => `${Number(n).toFixed(0)} CHF`;

// Gabarit repris de soiree-emails (lui-même repris de cash-payment-reminder),
// pied de page au nom du club : c'est lui qui organise et encaisse.
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
          Club canin de Ballaigues, CaniPlus &middot; Chez Thouny 6 &middot; 1338 Ballaigues<br/>
          Une question ? Réponds à cet email ou écris à <a href="mailto:${CONTACT_EMAIL}" style="color:#1e8db8;">${CONTACT_EMAIL}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export type PieceJointe = { name: string; content: string }; // content en base64

export async function sendEmail(
  to: string, name: string | null, subject: string, bodyHtml: string, attachments: PieceJointe[] = [],
): Promise<boolean> {
  const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
  if (!apiKey) {
    console.error('[rallye] BREVO_API_KEY manquante');
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
        ...(attachments.length ? { attachment: attachments } : {}),
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('[rallye] Brevo error:', r.status, t);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[rallye] Brevo exception:', (e as Error).message);
    return false;
  }
}

const P = (html: string) => `<p style="font-size:15px;line-height:1.65;margin:0 0 14px;">${html}</p>`;
const H = (txt: string) => `<h2 style="font-family:Georgia,serif;font-size:22px;margin:8px 0 16px;color:#1f1f20;">${txt}</h2>`;

const BLOC_EVENEMENT = `
  <div style="background:#e8f6fc;border-radius:12px;padding:16px 18px;margin:20px 0;font-size:14px;line-height:1.7;">
    <strong>Dimanche 21 mars 2027, de 8h30 à 15h</strong><br/>
    Terrain de sport de la Combette, Chemin de la Combette, 1338 Ballaigues<br/>
    Parking du terrain
  </div>`;

// Les neuf consignes, en version courte. La laisse d'abord, les rubans ensuite.
const BLOC_CONSIGNES = `
  <div style="background:#F8F5F0;border-radius:12px;padding:16px 18px;margin:20px 0;">
    <div style="font-size:14px;font-weight:700;margin-bottom:8px;">Les consignes de sécurité</div>
    <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.7;color:#3d3d3d;">
      <li><strong>Ton chien reste en laisse en permanence</strong>, sur tout le site et sur tous les parcours.</li>
      <li>Près des autres chiens, laisse courte. Demande toujours avant de laisser les chiens se saluer.</li>
      <li>Reste sur les chemins balisés, on ne laisse aucune trace en forêt.</li>
      <li>Ramasse les crottes de ton chien, sur le site comme sur les parcours.</li>
      <li>Aux postes ludiques, ton chien participe s'il en a envie. On ne force jamais un chien.</li>
      <li>Un chien malade ou blessé reste à la maison.</li>
      <li><strong>Ruban jaune</strong> : ce chien a besoin d'espace, garde tes distances. <strong>Ruban bleu</strong> : ce chien est à l'aise avec les autres chiens. On te remet le ruban de ton chien à l'accueil.</li>
      <li>Les femelles en chaleur sont acceptées, sous la responsabilité de leur propriétaire.</li>
      <li>Tu restes responsable de ton chien pendant toute la journée.</li>
    </ol>
    <div style="font-size:13px;margin-top:8px;"><a href="${PAGE_URL}#consignes" style="color:#1e8db8;">Les consignes complètes sur la page du rallye</a></div>
  </div>`;

function blocRecap(ins: Inscription, chiens: Chien[]): string {
  const lignes = chiens.map((c) =>
    `<li>${esc(c.nom)}${c.race ? ` (${esc(c.race)})` : ''} · ruban ${c.ruban === 'jaune' ? 'jaune' : 'bleu'}</li>`).join('');
  const parcours = ins.parcours_prevu ? PARCOURS[ins.parcours_prevu] ?? '' : '';
  return `
  <div style="border:1px solid #e6e9ec;border-radius:12px;padding:16px 18px;margin:20px 0;font-size:14px;line-height:1.7;">
    <div style="font-weight:700;margin-bottom:6px;">Ton inscription n° ${ins.numero}</div>
    <ul style="margin:0 0 8px;padding-left:20px;">${lignes}</ul>
    ${parcours ? `Parcours prévu : ${esc(parcours)}<br/>` : ''}
    Montant : <strong>${chf(ins.montant_chf)}</strong> (${ins.nb_chiens} × ${PRIX_PAR_CHIEN_CHF} CHF)
  </div>`;
}

// TWINT payé, ou virement reçu : même contenu.
export function emailConfirmation(ins: Inscription, chiens: Chien[]): { subject: string; html: string } {
  const html = [
    H('Ton inscription au rallye est confirmée'),
    P(`Bonjour ${esc(ins.prenom)},`),
    P(`Ton paiement est bien arrivé, merci ! ${ins.nb_chiens > 1 ? 'Tes chiens sont inscrits' : 'Ton chien est inscrit'} au Rallye canin de Ballaigues.`),
    blocRecap(ins, chiens),
    BLOC_EVENEMENT,
    P(`<strong>N'oublie pas le carnet de vaccination</strong> de ${ins.nb_chiens > 1 ? 'chacun de tes chiens' : 'ton chien'} : on te le demande à l'accueil.`),
    P('Le rallye a lieu par tous les temps. Prévois des habits adaptés, pour toi comme pour ton chien.'),
    BLOC_CONSIGNES,
    P('À bientôt sur les chemins,<br/>Tiffany'),
  ].join('');
  return { subject: 'Rallye canin de Ballaigues : ton inscription est confirmée', html };
}

export function emailVirementDemande(ins: Inscription, chiens: Chien[], pdfJoint: boolean): { subject: string; html: string } {
  const ref = formatReference(ins.reference_scor ?? '');
  const html = [
    H('Ton inscription au rallye est enregistrée'),
    P(`Bonjour ${esc(ins.prenom)},`),
    P(`Merci pour ton inscription au Rallye canin de Ballaigues. Il reste à payer par virement.${pdfJoint ? ' Ta QR-facture est jointe à cet email : scanne-la avec ton app bancaire.' : ''}`),
    blocRecap(ins, chiens),
    `<div style="background:#fdf3e3;border-left:4px solid #9a5b00;border-radius:12px;padding:16px 18px;margin:20px 0;font-size:14px;line-height:1.8;">
       <strong>Coordonnées du virement</strong><br/>
       Bénéficiaire : ${esc(CREANCIER.name)}, Chez Thouny 6, 1338 Ballaigues<br/>
       IBAN : <strong>${IBAN_AFFICHE}</strong><br/>
       Référence : <strong>${esc(ref)}</strong><br/>
       Montant : <strong>${chf(ins.montant_chf)}</strong><br/>
       Communication : ${esc(messageVirement(ins.prenom, ins.nom))}
     </div>`,
    P('<strong>Paiement à effectuer au plus tard le 12 mars 2027.</strong> Ton inscription est confirmée dès réception du paiement.'),
    P('Indique bien la référence : c\'est elle qui nous permet de relier ton paiement à ton inscription.'),
    BLOC_EVENEMENT,
    P('Aucun remboursement n\'est possible après l\'inscription, sauf si le rallye est annulé par le club ou sur décision des autorités.'),
    P('À bientôt,<br/>Tiffany'),
  ].join('');
  return { subject: 'Rallye canin de Ballaigues : ta QR-facture', html };
}

export function emailCopieAdmin(ins: Inscription, chiens: Chien[], contexte: string): { subject: string; html: string } {
  const lignes = chiens.map((c) => `<li>${esc(c.nom)}${c.race ? ` (${esc(c.race)})` : ''} · ${c.ruban}</li>`).join('');
  const html = [
    H(`Rallye : nouvelle inscription n° ${ins.numero}`),
    P(esc(contexte)),
    `<div style="font-size:14px;line-height:1.8;">
       ${esc(ins.prenom)} ${esc(ins.nom)}<br/>
       ${esc(ins.email)} · ${esc(ins.telephone)}<br/>
       ${esc(ins.npa)} ${esc(ins.localite)}<br/>
       Parcours : ${esc(ins.parcours_prevu ? PARCOURS[ins.parcours_prevu] : 'non indiqué')}<br/>
       Paiement : ${ins.moyen_paiement === 'twint' ? 'TWINT' : 'virement'} · ${chf(ins.montant_chf)}
       ${ins.reference_scor ? `<br/>Référence : ${esc(formatReference(ins.reference_scor))}` : ''}
       <ul style="padding-left:20px;">${lignes}</ul>
     </div>`,
  ].join('');
  return { subject: `Rallye 2027 · inscription n° ${ins.numero} · ${ins.nb_chiens} chien(s)`, html };
}

// Charge une inscription et ses chiens (service role).
export async function chargerInscription(
  supabase: SupabaseClient, id: string,
): Promise<{ ins: Inscription; chiens: Chien[] } | null> {
  const { data: ins } = await supabase.from('rallye_inscriptions').select('*').eq('id', id).maybeSingle();
  if (!ins) return null;
  const { data: chiens } = await supabase.from('rallye_chiens').select('nom, race, ruban').eq('inscription_id', id);
  return { ins: ins as Inscription, chiens: (chiens ?? []) as Chien[] };
}

// Passe une inscription en payée et envoie la confirmation. Idempotent : la
// mise à jour ne touche que les inscriptions encore en attente, et l'email ne
// part que si une ligne a effectivement changé. Un même événement Stripe reçu
// deux fois, ou un double clic sur « Virement reçu », n'envoie qu'un email.
export async function confirmerPaiement(
  supabase: SupabaseClient, id: string, champs: Record<string, unknown> = {},
): Promise<{ confirme: boolean; ins?: Inscription; chiens?: Chien[] }> {
  const { data: maj, error } = await supabase
    .from('rallye_inscriptions')
    .update({ statut: 'paye', paye_le: new Date().toISOString(), ...champs })
    .eq('id', id)
    .eq('statut', 'en_attente')
    .select('id');
  if (error) throw error;
  if (!maj || maj.length === 0) return { confirme: false };

  const charge = await chargerInscription(supabase, id);
  if (!charge) return { confirme: true };
  const { ins, chiens } = charge;
  const mail = emailConfirmation(ins, chiens);
  await sendEmail(ins.email, `${ins.prenom} ${ins.nom}`, mail.subject, mail.html);
  return { confirme: true, ins, chiens };
}
