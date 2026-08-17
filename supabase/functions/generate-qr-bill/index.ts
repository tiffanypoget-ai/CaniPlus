// supabase/functions/generate-qr-bill/index.ts
// Génère une QR-facture suisse (SVG) pour le paiement d'une cotisation au club.
// Le membre scanne le QR depuis son app bancaire → virement direct sur le compte
// PostFinance du club, sans frais. Aucun encaissement Stripe.
//
// Compte bénéficiaire : Club canin de Ballaigues, CaniPlus (PostFinance).
// Référence : message « Cotisation <année> — <nom> » pour le rapprochement.
// Le débiteur est volontairement omis (facultatif sur une QR-facture).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SwissQRBill } from 'https://esm.sh/swissqrbill@4.2.0/svg';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CREDITOR = {
  account: 'CH7809000000169218637',
  creditor: {
    name: 'Club canin de Ballaigues, CaniPlus',
    address: 'Chez Thouny 6',
    zip: 1338,
    city: 'Ballaigues',
    country: 'CH',
  },
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Non authentifié' }, 401);
    const { data: userData } = await supabase.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: 'Session invalide' }, 401);

    const reqBody = await req.json().catch(() => ({}));
    const { subscription_id, amount: bodyAmount } = reqBody;
    if (!subscription_id) return json({ error: 'subscription_id manquant' }, 400);

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id, user_id, type, year, status')
      .eq('id', subscription_id)
      .maybeSingle();
    if (!sub) return json({ error: 'Cotisation introuvable' }, 404);
    if (sub.user_id !== uid) return json({ error: 'Accès refusé' }, 403);

    const { data: prof } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', uid)
      .maybeSingle();

    const amount = Number(bodyAmount) > 0 ? Number(bodyAmount) : 150;
    const annee = sub.year ?? new Date().getFullYear();
    const nom = prof?.full_name ?? prof?.email ?? 'Membre';

    const data = {
      currency: 'CHF' as const,
      amount,
      ...CREDITOR,
      message: `Cotisation ${annee} - ${nom}`.slice(0, 140),
    };

    const qrBill = new SwissQRBill(data);
    const svg = qrBill.toString();

    return json({
      svg,
      amount,
      reference: `Cotisation ${annee} - ${nom}`,
      account: CREDITOR.account,
      creditor_name: CREDITOR.creditor.name,
    });
  } catch (err) {
    console.error('[generate-qr-bill]', (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
