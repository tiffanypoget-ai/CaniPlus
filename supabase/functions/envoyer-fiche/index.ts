// supabase/functions/envoyer-fiche/index.ts
// -----------------------------------------------------------------------------
// Envoie une fiche pratique (PDF en pièce jointe) par email. Lot 2, 14.11.2026.
//
// Deux chemins, une seule façon d'envoyer :
//
//   1. Abonné premium connecté (bouton « Demander le PDF » sur caniplus.ch) :
//        POST { product_slug }  + Authorization: Bearer <JWT du membre>
//      Vérifie en base que premium_until est dans le futur (ou rôle admin),
//      puis envoie à l'adresse du compte. Jamais à une adresse reçue dans le
//      corps : sinon n'importe quel abonné pouvait arroser des inconnus.
//
//   2. Achat à CHF 5 (appel serveur à serveur depuis stripe-webhook) :
//        POST { purchase_id }  + Authorization: Bearer <SERVICE_ROLE_KEY>
//      Relit l'achat : il doit être payé et porter sur une fiche. Envoie à
//      guest_email et date delivered_at. Un achat déjà livré n'est pas renvoyé.
//
// Le PDF vit dans le bucket privé fiches-pratiques (file_path du produit). Il
// part en pièce jointe : aucune adresse publique, aucun lien qui circule.
//
// Garde-fous du chemin 1 : 2 minutes entre deux envois de la même fiche au
// même membre, 30 envois au plus par membre et par 24 heures (table
// fiches_envois, lisible par le seul service_role).
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encode as base64 } from 'https://deno.land/std@0.177.0/encoding/base64.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const BUCKET = 'fiches-pratiques';
const DELAI_MEME_FICHE_MS = 2 * 60 * 1000;
const PLAFOND_24H = 30;

const repondre = (corps: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function emailHtml(titre: string, sousTitre: string | null, premium: boolean) {
  const intro = premium
    ? 'Voici la fiche que tu as demandée, en pièce jointe. Elle fait partie de ton abonnement premium.'
    : 'Merci pour ton achat ! Voici ta fiche, en pièce jointe.';
  const suite = premium
    ? `Toutes les autres fiches t'attendent sur <a href="https://caniplus.ch/espace" style="color:#176E94;">caniplus.ch/espace</a>.`
    : `Toutes les fiches sont aussi comprises dans le premium, à CHF 10 par mois, sans engagement : <a href="https://caniplus.ch/espace" style="color:#176E94;">caniplus.ch/espace</a>.`;
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F8F5F0;font-family:'Helvetica Neue',Arial,sans-serif;color:#1f1f20;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:32px 32px 8px;">
          <div style="font-family:'Brush Script MT',cursive;font-size:32px;color:#2BABE1;">CaniPlus</div>
        </td></tr>
        <tr><td style="padding:8px 32px 28px;">
          <h1 style="font-size:23px;margin:0 0 14px;color:#1f1f20;">${titre}</h1>
          ${sousTitre ? `<p style="font-size:15px;line-height:1.6;margin:0 0 16px;color:#3d3d3d;font-style:italic;">${sousTitre}</p>` : ''}
          <p style="font-size:15px;line-height:1.7;margin:0 0 16px;color:#3d3d3d;">${intro}</p>
          <p style="font-size:14px;line-height:1.7;margin:0 0 16px;color:#3d3d3d;">${suite}</p>
          <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0;">
            Une question sur l'exercice ? Réponds simplement à cet email.
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#F8F5F0;font-size:12px;color:#6b7280;text-align:center;">
          CaniPlus &middot; Tiffany Cotting &middot; Ballaigues &middot; caniplus.ch
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
    const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const corps = await req.json().catch(() => ({}));

    let produit: { id: string; slug: string; title: string; subtitle: string | null; file_path: string | null; category: string | null } | null = null;
    let destinataire = '';
    let premium = false;
    let achatId: string | null = null;
    let membreId: string | null = null;

    if (corps.purchase_id) {
      // ── Chemin 2 : achat, appelé par stripe-webhook ───────────────────────
      if (!serviceKey || jeton !== serviceKey) return repondre({ error: 'Accès refusé.' }, 401);
      const { data: achat } = await supabase
        .from('user_purchases')
        .select('id, status, guest_email, delivered_at, product:digital_products(id, slug, title, subtitle, file_path, category)')
        .eq('id', corps.purchase_id)
        .maybeSingle();
      if (!achat || achat.status !== 'paid') return repondre({ skipped: 'achat introuvable ou non payé' });
      if (achat.delivered_at) return repondre({ skipped: 'déjà livré' });
      produit = achat.product as typeof produit;
      destinataire = achat.guest_email ?? '';
      achatId = achat.id;
    } else {
      // ── Chemin 1 : abonné premium connecté ───────────────────────────────
      const { data: u, error: uErr } = await supabase.auth.getUser(jeton);
      if (uErr || !u?.user) return repondre({ error: 'Connecte-toi sur caniplus.ch/espace pour recevoir la fiche.' });
      const { data: profil } = await supabase
        .from('profiles').select('email, role, premium_until').eq('id', u.user.id).maybeSingle();
      const actif = profil?.role === 'admin'
        || (profil?.premium_until && new Date(profil.premium_until).getTime() > Date.now());
      if (!actif) return repondre({ error: 'Cette fiche est comprise dans le premium. Abonne-toi ou achète-la à CHF 5.' });
      if (!corps.product_slug) return repondre({ error: 'Fiche manquante.' });
      const { data: p } = await supabase
        .from('digital_products').select('id, slug, title, subtitle, file_path, category')
        .eq('slug', String(corps.product_slug)).eq('category', 'fiche').maybeSingle();
      produit = p;
      destinataire = u.user.email ?? profil?.email ?? '';
      premium = true;
      membreId = u.user.id;

      if (produit) {
        const depuis24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const { data: recents } = await supabase
          .from('fiches_envois').select('product_id, created_at')
          .eq('user_id', membreId).gte('created_at', depuis24h);
        const liste = recents ?? [];
        if (liste.length >= PLAFOND_24H) {
          return repondre({ error: 'Tu as déjà reçu beaucoup de fiches aujourd\'hui. Réessaie demain, ou lis-les sur caniplus.ch/espace.' });
        }
        const memeFiche = liste.find((r) => r.product_id === produit!.id
          && Date.now() - new Date(r.created_at).getTime() < DELAI_MEME_FICHE_MS);
        if (memeFiche) return repondre({ error: 'Cette fiche vient de partir. Regarde dans ta boîte mail, et dans les indésirables.' });
      }
    }

    if (!produit || produit.category !== 'fiche' || !produit.file_path) return repondre({ error: 'Fiche introuvable.' });
    if (!destinataire) return repondre({ error: 'Adresse email introuvable.' });

    // ── Le PDF, en pièce jointe ──────────────────────────────────────────────
    const { data: fichier, error: dlErr } = await supabase.storage.from(BUCKET).download(produit.file_path);
    if (dlErr || !fichier) {
      console.error('[envoyer-fiche] PDF illisible', produit.file_path, dlErr?.message);
      return repondre({ error: 'Le PDF est momentanément indisponible. Écris à info@caniplus.ch, on te l\'envoie.' });
    }
    const pdf = base64(new Uint8Array(await fichier.arrayBuffer()));

    const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
    if (!apiKey) return repondre({ error: 'Envoi impossible pour le moment.' });
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'CaniPlus', email: 'info@caniplus.ch' },
        replyTo: { name: 'CaniPlus', email: 'info@caniplus.ch' },
        to: [{ email: destinataire }],
        subject: `Ta fiche CaniPlus : ${produit.title}`,
        htmlContent: emailHtml(echapper(produit.title), produit.subtitle ? echapper(produit.subtitle) : null, premium),
        attachment: [{ name: `CaniPlus - ${produit.title}.pdf`, content: pdf }],
      }),
    });
    if (!r.ok) {
      console.error('[envoyer-fiche] Brevo', r.status, await r.text().catch(() => ''));
      return repondre({ error: 'L\'envoi a échoué. Réessaie dans un instant.' });
    }

    if (achatId) {
      await supabase.from('user_purchases').update({ delivered_at: new Date().toISOString() }).eq('id', achatId);
    } else if (membreId) {
      await supabase.from('fiches_envois').insert({ user_id: membreId, product_id: produit.id });
    }
    console.log(`[envoyer-fiche] ${produit.slug} envoyée (${premium ? 'premium' : 'achat'})`);
    return repondre({ sent: true });
  } catch (e) {
    console.error('[envoyer-fiche]', (e as Error).message);
    return repondre({ error: 'Une erreur est survenue. Réessaie dans un instant.' });
  }
});
