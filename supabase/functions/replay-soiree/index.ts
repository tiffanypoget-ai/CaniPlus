// supabase/functions/replay-soiree/index.ts
// -----------------------------------------------------------------------------
// Sert le replay d'une soirée à partir du lien personnel envoyé par email
// (caniplus.ch/replay?t=<jeton>). Lot 3, 17.11.2026. Aucun compte requis.
//
//   POST { t: <replay_token> }
//
// Règles :
//   - le jeton désigne UN achat ; il doit être payé (un remboursement coupe
//     l'accès) et porter sur une soirée ;
//   - le replay n'est servi que jusqu'à replay_expires_at (7 jours, fixés
//     dans l'admin) ; ensuite la page annonce la fin du replay ;
//   - le lien vidéo n'est jamais dans la page ni dans l'email : il vit dans
//     webinar_access, lu ici avec la clé de service.
//
// Limite assumée : YouTube (non répertorié) et Zoom ne coupent pas l'accès
// d'eux-mêmes. Quelqu'un qui recopie l'adresse de la vidéo peut la revoir
// tant que Tiffany ne l'a pas retirée ; soiree-emails lui envoie un rappel le
// lendemain de l'expiration.
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const repondre = (corps: Record<string, unknown>) =>
  new Response(JSON.stringify(corps), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Identifiant d'une vidéo YouTube, quelle que soit la forme du lien collé
// dans l'admin (youtu.be, watch?v=, embed, live, shorts).
function idYoutube(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const hote = u.hostname.replace(/^www\.|^m\./, '');
    if (hote === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (hote === 'youtube.com' || hote === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(?:embed|live|shorts|v)\/([A-Za-z0-9_-]{6,})/);
      if (m) return m[1];
    }
  } catch (_e) { /* pas une URL */ }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { t } = await req.json().catch(() => ({}));
    if (!t || !UUID.test(String(t))) return repondre({ erreur: 'lien' });

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: achat } = await supabase
      .from('user_purchases')
      .select('status, product:digital_products(id, title, event_date, category)')
      .eq('replay_token', String(t))
      .maybeSingle();
    const produit = achat?.product as { id: string; title: string; event_date: string | null; category: string } | null;
    if (!achat || !produit || produit.category !== 'soiree') return repondre({ erreur: 'lien' });
    if (achat.status !== 'paid') return repondre({ erreur: 'lien' });

    const { data: acces } = await supabase
      .from('webinar_access')
      .select('replay_url, replay_code, replay_expires_at')
      .eq('product_id', produit.id)
      .maybeSingle();

    const base = { titre: produit.title, date: produit.event_date };
    if (!acces?.replay_url) return repondre({ ...base, etat: 'bientot' });
    const fin = acces.replay_expires_at
      ?? (produit.event_date ? new Date(new Date(produit.event_date).getTime() + 7 * 24 * 3600 * 1000).toISOString() : null);
    if (fin && new Date(fin).getTime() <= Date.now()) return repondre({ ...base, etat: 'termine', fin });

    const youtube = idYoutube(acces.replay_url);
    return repondre(youtube
      ? { ...base, etat: 'pret', youtube, fin }
      : { ...base, etat: 'pret', lien: acces.replay_url, code: acces.replay_code ?? null, fin });
  } catch (e) {
    console.error('[replay-soiree]', (e as Error).message);
    return repondre({ erreur: 'serveur' });
  }
});
