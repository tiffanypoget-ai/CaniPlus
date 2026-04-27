// api/cron/propose-themes.js
// -----------------------------------------------------------------------------
// Vercel Cron : déclenché chaque lundi à 5h UTC (= 6h-7h Suisse selon DST).
// Authentifie l'appel Vercel via CRON_SECRET, puis appelle l'edge function
// Supabase `propose-editorial-themes` qui génère 3 thèmes éditoriaux et les
// enregistre dans editorial_bundles (status='proposed').
//
// Variables d'environnement attendues sur Vercel :
//   - SUPABASE_URL          (= https://oncbeqnznrqummxmqxbx.supabase.co)
//   - SUPABASE_ANON_KEY     (anon key publique du projet — pour invoke)
//   - CRON_SECRET           (secret partagé avec les edge functions Supabase)
//
// Référencé dans vercel.json :
//   { "path": "/api/cron/propose-themes", "schedule": "0 5 * * 1" }
// -----------------------------------------------------------------------------

export default async function handler(req, res) {
  // 1. Authentification Vercel Cron
  // Vercel envoie automatiquement `Authorization: Bearer <CRON_SECRET>` quand
  // CRON_SECRET est défini dans les env vars du projet.
  const authHeader = req.headers['authorization'] ?? '';
  const expected   = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 2. Appel de l'edge function Supabase
  const supaUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supaUrl || !anonKey) {
    return res.status(500).json({ error: 'SUPABASE_URL ou SUPABASE_ANON_KEY manquant' });
  }

  try {
    const response = await fetch(`${supaUrl}/functions/v1/propose-editorial-themes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cron_secret: process.env.CRON_SECRET }),
    });

    const data = await response.json();
    if (!response.ok || data?.error) {
      console.error('[cron/propose-themes] Edge function error:', data);
      return res.status(500).json({ error: data?.error ?? `HTTP ${response.status}` });
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      ...data,
    });
  } catch (err) {
    console.error('[cron/propose-themes] Fetch error:', err);
    return res.status(500).json({ error: err.message ?? String(err) });
  }
}
