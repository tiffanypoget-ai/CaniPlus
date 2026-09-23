// supabase/functions/rallye-admin/index.ts
// Écran de suivi du Rallye canin (onglet « Rallye » de l'admin de l'app).
//
// Les tables rallye_* n'ont aucune policy : ni l'app ni un admin connecté ne
// les lisent en direct. Tout passe ici, en service role, après contrôle que
// l'appelant est bien un profil admin (même contrôle que soiree-emails).
//
// Actions :
//   list          → toutes les inscriptions de l'édition, avec leurs chiens
//   virement_recu → passe une inscription virement en payée et envoie la
//                   confirmation (idempotent, voir confirmerPaiement)
//
// Pas d'écriture compta ici : les virements arrivent par l'import PostFinance.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { RALLYE_EDITION, confirmerPaiement } from '../_shared/rallye.ts';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: userData } = await supabase.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: 'Non authentifié' }, 401);
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
    if (profile?.role !== 'admin') return json({ error: 'Accès réservé aux admins' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'list') {
      const { data, error } = await supabase
        .from('rallye_inscriptions')
        .select('id, numero, created_at, prenom, nom, email, telephone, npa, localite, parcours_prevu, nb_chiens, montant_chf, moyen_paiement, statut, reference_scor, paye_le, note_admin, consignes_version, rallye_chiens(nom, race, ruban)')
        .eq('edition', RALLYE_EDITION)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return json({ inscriptions: data ?? [] });
    }

    if (action === 'virement_recu') {
      const id = String(body?.id ?? '');
      if (!id) return json({ error: 'id manquant' }, 400);
      const { data: ins } = await supabase
        .from('rallye_inscriptions').select('moyen_paiement, statut').eq('id', id).maybeSingle();
      if (!ins) return json({ error: 'Inscription introuvable' }, 404);
      if (ins.moyen_paiement !== 'virement') return json({ error: 'Cette inscription n\'est pas payée par virement.' }, 400);
      if (ins.statut !== 'en_attente') return json({ error: 'Cette inscription n\'est plus en attente.' }, 400);
      const res = await confirmerPaiement(supabase, id);
      return json({ ok: true, confirme: res.confirme });
    }

    return json({ error: 'Action inconnue' }, 400);
  } catch (err) {
    console.error('[rallye-admin]', (err as Error)?.message ?? JSON.stringify(err));
    return json({ error: (err as Error)?.message ?? 'Erreur inconnue' }, 500);
  }
});
