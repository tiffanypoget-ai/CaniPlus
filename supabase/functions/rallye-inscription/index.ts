// supabase/functions/rallye-inscription/index.ts
// Inscription au Rallye canin de Ballaigues depuis le site vitrine, sans compte.
//
// Organisateur et encaisseur : Club canin de Ballaigues, CaniPlus. TWINT passe
// par le compte Stripe CLUB (routage partagé _shared/stripe-accounts.ts), le
// virement par le compte PostFinance du club. Rien sur le compte RI.
//
// Flux :
//   1. Valide tout (mêmes règles que le formulaire, plus strictes au besoin).
//   2. Enregistre l'inscription en 'en_attente' et ses chiens.
//   3a. TWINT : session Stripe Checkout (compte CLUB), renvoie son URL. Le
//       webhook stripe-webhook-club passe l'inscription en payée et envoie la
//       confirmation.
//   3b. Virement : référence SCOR, QR-facture (SVG pour la page, PDF joint à
//       l'email), email à la personne et copie à info@caniplus.ch.
//
// Appelée depuis le site public avec la clé anon (un JWT valide) : la
// fonction peut donc rester déployée avec verify_jwt=true.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SwissQRBill as SwissQRBillSvg } from 'npm:swissqrbill@4.2.0/svg';
import { SwissQRBill as SwissQRBillPdf } from 'npm:swissqrbill@4.2.0/pdf';
import PDFDocument from 'npm:pdfkit@0.17.1';
import { Buffer } from 'node:buffer';
import { stripeFor } from '../_shared/stripe-accounts.ts';
import {
  CONSIGNES_VERSION, CONTACT_EMAIL, CREANCIER, FIN_INSCRIPTIONS, IBAN_AFFICHE,
  MAX_CHIENS, PAGE_URL, PARCOURS, PRIX_PAR_CHIEN_CHF, RALLYE_EDITION,
  RALLYE_INSCRIPTIONS_OUVERTES, chargerInscription, emailCopieAdmin,
  emailVirementDemande, formatReference, messageVirement, referencePourNumero,
  sendEmail, virementPossible, type Chien, type Inscription,
} from '../_shared/rallye.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

class Refus extends Error {}

const txt = (v: unknown, max: number): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function valider(body: Record<string, any>) {
  // Honeypot : champ invisible pour un humain. Rempli = robot.
  if (txt(body.site_web, 200)) throw new Refus('Inscription refusée.');

  const prenom = txt(body.prenom, 80);
  const nom = txt(body.nom, 80);
  const email = txt(body.email, 254).toLowerCase();
  const telephone = txt(body.telephone, 30);
  const npa = txt(body.npa, 4);
  const localite = txt(body.localite, 80);
  if (!prenom || !nom) throw new Refus('Indique ton prénom et ton nom.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Refus('Vérifie ton adresse email.');
  const telChiffres = telephone.replace(/[^\d]/g, '');
  if (!/^[+\d][\d\s./-]*$/.test(telephone) || telChiffres.length < 9 || telChiffres.length > 15) {
    throw new Refus('Vérifie ton numéro de téléphone.');
  }
  if (!/^\d{4}$/.test(String(body.npa ?? '').trim())) throw new Refus('Le NPA doit compter 4 chiffres.');
  if (!localite) throw new Refus('Indique ta localité.');

  const chiensBruts = Array.isArray(body.chiens) ? body.chiens : [];
  if (chiensBruts.length < 1) throw new Refus('Ajoute au moins un chien.');
  if (chiensBruts.length > MAX_CHIENS) throw new Refus(`${MAX_CHIENS} chiens au maximum par inscription.`);
  const chiens: Chien[] = chiensBruts.map((c: any, i: number) => {
    const n = txt(c?.nom, 60);
    if (!n) throw new Refus(`Indique le nom du chien ${i + 1}.`);
    if (c?.ruban !== 'jaune' && c?.ruban !== 'bleu') throw new Refus(`Choisis le ruban de ${n}.`);
    return { nom: n, race: txt(c?.race, 80) || null, ruban: c.ruban };
  });

  const parcours = body.parcours_prevu ? String(body.parcours_prevu) : null;
  if (parcours && !(parcours in PARCOURS)) throw new Refus('Parcours inconnu.');

  // Les cinq cases. Le serveur refuse si une seule manque, quoi que dise le navigateur.
  const cases = ['vaccination', 'vit_en_suisse', 'consignes', 'non_remboursable', 'confidentialite'];
  const accept = body.acceptations ?? {};
  if (!cases.every((k) => accept[k] === true)) {
    throw new Refus('Toutes les cases de confirmation doivent être cochées.');
  }

  const moyen = body.moyen_paiement;
  if (moyen !== 'twint' && moyen !== 'virement') throw new Refus('Choisis un moyen de paiement.');
  if (moyen === 'virement' && !virementPossible()) {
    throw new Refus('Le virement n\'est plus possible depuis le 13 mars 2027. Paie avec TWINT.');
  }

  return { prenom, nom, email, telephone, npa, localite, parcours, chiens, moyen: moyen as 'twint' | 'virement' };
}

async function qrFacturePdf(data: Record<string, unknown>, ins: Inscription): Promise<string> {
  const pdf = new PDFDocument({ size: 'A4', margin: 50 });
  const morceaux: Uint8Array[] = [];
  pdf.on('data', (c: Uint8Array) => morceaux.push(c));
  const fini = new Promise((r) => pdf.on('end', r));
  pdf.font('Helvetica-Bold').fontSize(18).text(`Rallye canin de Ballaigues ${RALLYE_EDITION}`);
  pdf.moveDown(0.5).font('Helvetica').fontSize(11)
    .text(`Inscription n° ${ins.numero} · ${ins.prenom} ${ins.nom}`)
    .text(`${ins.nb_chiens} chien(s) × ${PRIX_PAR_CHIEN_CHF} CHF = ${Number(ins.montant_chf).toFixed(2)} CHF`)
    .moveDown(0.5)
    .text('Paiement à effectuer au plus tard le 12 mars 2027.')
    .text('Ton inscription est confirmée dès réception du paiement.')
    .moveDown(0.5)
    .text(`Dimanche 21 mars 2027, de 8h30 à 15h, Terrain de la Combette, 1338 Ballaigues.`);
  new SwissQRBillPdf(data as any, { language: 'FR' }).attachTo(pdf);
  pdf.end();
  await fini;
  return Buffer.concat(morceaux).toString('base64');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  try {
    if (!RALLYE_INSCRIPTIONS_OUVERTES) throw new Refus('Les inscriptions ouvrent bientôt.');
    if (new Date() >= FIN_INSCRIPTIONS) throw new Refus('Les inscriptions en ligne sont closes.');

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new Refus('Requête invalide.');
    const v = valider(body);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const nb = v.chiens.length;
    const { data: ins, error: insErr } = await supabase
      .from('rallye_inscriptions')
      .insert({
        edition: RALLYE_EDITION,
        prenom: v.prenom, nom: v.nom, email: v.email, telephone: v.telephone,
        npa: v.npa, localite: v.localite, parcours_prevu: v.parcours,
        nb_chiens: nb,
        consignes_acceptees_le: new Date().toISOString(),
        consignes_version: CONSIGNES_VERSION,
        montant_chf: nb * PRIX_PAR_CHIEN_CHF,
        moyen_paiement: v.moyen,
        statut: 'en_attente',
      })
      .select('id, numero')
      .single();
    if (insErr || !ins) throw insErr ?? new Error('Insertion impossible');

    const { error: chErr } = await supabase
      .from('rallye_chiens')
      .insert(v.chiens.map((c) => ({ inscription_id: ins.id, ...c })));
    if (chErr) {
      await supabase.from('rallye_inscriptions').delete().eq('id', ins.id);
      throw chErr;
    }

    // ── TWINT : Stripe Checkout sur le compte CLUB ─────────────────────────
    if (v.moyen === 'twint') {
      // Si Stripe refuse (TWINT pas activé sur le compte club, clé absente…),
      // on retire l'inscription : elle n'a aucune chance d'être payée et
      // fausserait la liste d'accueil.
      let session;
      try {
        const stripe = stripeFor('rallye');
        session = await stripe.checkout.sessions.create({
          mode: 'payment',
          currency: 'chf',
          payment_method_types: ['twint'] as any,
          line_items: [{
            price_data: {
              currency: 'chf',
              product_data: { name: `Rallye canin ${RALLYE_EDITION}, inscription chien` },
              unit_amount: PRIX_PAR_CHIEN_CHF * 100,
            },
            quantity: nb,
          }],
          customer_email: v.email,
          success_url: `${PAGE_URL}?inscription=merci`,
          cancel_url: `${PAGE_URL}?inscription=annulee`,
          metadata: { type: 'rallye', inscription_id: ins.id, edition: String(RALLYE_EDITION) },
          payment_intent_data: { metadata: { type: 'rallye', inscription_id: ins.id } },
        });
      } catch (e) {
        console.error('[rallye-inscription] Stripe:', (e as Error).message);
        await supabase.from('rallye_inscriptions').delete().eq('id', ins.id);
        throw new Refus(virementPossible()
          ? 'Le paiement TWINT n\'a pas pu démarrer. Réessaie dans quelques instants ou choisis le virement.'
          : 'Le paiement TWINT n\'a pas pu démarrer. Réessaie dans quelques instants.');
      }
      await supabase.from('rallye_inscriptions').update({ stripe_session_id: session.id }).eq('id', ins.id);
      return json({ url: session.url });
    }

    // ── Virement : référence SCOR + QR-facture ─────────────────────────────
    const reference = referencePourNumero(ins.numero);
    await supabase.from('rallye_inscriptions').update({ reference_scor: reference }).eq('id', ins.id);

    const charge = await chargerInscription(supabase, ins.id);
    if (!charge) throw new Error('Inscription introuvable après création');
    const { ins: inscription, chiens } = charge;

    const qrData = {
      currency: 'CHF' as const,
      amount: Number(inscription.montant_chf),
      reference,
      creditor: { ...CREANCIER },
      message: messageVirement(v.prenom, v.nom),
    };
    const svg = new SwissQRBillSvg(qrData as any, { language: 'FR' }).toString();

    // PDF joint si possible ; sinon l'email porte quand même toutes les coordonnées.
    let pdfBase64: string | null = null;
    try { pdfBase64 = await qrFacturePdf(qrData, inscription); }
    catch (e) { console.error('[rallye-inscription] PDF impossible:', (e as Error).message); }

    const mail = emailVirementDemande(inscription, chiens, !!pdfBase64);
    await sendEmail(v.email, `${v.prenom} ${v.nom}`, mail.subject, mail.html,
      pdfBase64 ? [{ name: `qr-facture-rallye-${RALLYE_EDITION}-${inscription.numero}.pdf`, content: pdfBase64 }] : []);
    const copie = emailCopieAdmin(inscription, chiens, 'Paiement par virement, en attente de réception.');
    await sendEmail(CONTACT_EMAIL, 'CaniPlus', copie.subject, copie.html);

    return json({
      virement: {
        numero: inscription.numero,
        svg,
        iban: IBAN_AFFICHE,
        beneficiaire: `${CREANCIER.name}, Chez Thouny 6, 1338 Ballaigues`,
        reference: formatReference(reference),
        montant: Number(inscription.montant_chf),
        message: qrData.message,
        email: v.email,
      },
    });
  } catch (err) {
    if (err instanceof Refus) return json({ error: err.message }, 400);
    console.error('[rallye-inscription]', (err as any)?.message ?? JSON.stringify(err));
    return json({ error: 'L\'inscription n\'a pas pu être enregistrée. Réessaie dans quelques instants ou écris à info@caniplus.ch.' }, 500);
  }
});
