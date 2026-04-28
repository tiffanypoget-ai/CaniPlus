// src/lib/trackEvent.js
// Helper fire-and-forget pour appeler l'edge function track-event.
// Ne renvoie rien et n'attend rien : si ca echoue, ca echoue silencieusement.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://oncbeqnznrqummxmqxbx.supabase.co';
const TRACK_URL = `${SUPABASE_URL}/functions/v1/track-event`;

/**
 * Track an editorial event (article view, resource view, push click, etc.)
 *
 * @param {Object} opts
 * @param {'article_view'|'resource_view'|'push_click'|'push_received'} opts.kind
 * @param {string} [opts.article_id]
 * @param {string} [opts.resource_id]
 * @param {string} [opts.bundle_id]
 * @param {string} [opts.user_id]
 */
export function trackEvent(opts) {
  if (!opts || !opts.kind) return;
  // Fire-and-forget : on ne bloque jamais l'UI, on ignore les erreurs reseau
  try {
    fetch(TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
      keepalive: true, // permet la requete de continuer si l'utilisateur navigue
    }).catch(() => {});
  } catch (_e) {
    // ignore
  }
}
