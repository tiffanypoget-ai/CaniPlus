// supabase/functions/zoom-recording-webhook/index.ts
// Webhook Zoom « recording.completed » pour les soirées CaniPlus.
//
// Ce que ça règle : jusqu'ici, Tiffany recopiait à la main le lien de partage
// du replay et son code dans l'onglet Soirées. Zoom publie l'enregistrement
// cloud environ une demi-heure après la fin de la soirée, soit vers 22h00 un
// lundi. À ce moment-là, cette fonction remplit webinar_access toute seule, et
// l'email du lendemain (08h00) part donc avec la fiche récap ET le replay.
//
// Enchaînement :
//   1. Zoom POSTe ici dès que l'enregistrement cloud est prêt.
//   2. On vérifie la signature (x-zm-signature), puis on retrouve la soirée
//      par webinar_access.zoom_meeting_id.
//   3. On écrit replay_url, replay_code si Zoom le fournit, et
//      replay_expires_at s'il était vide (soirée + 7 jours, 23h59 suisse).
//   4. Si l'email du lendemain est DÉJÀ parti pour cette soirée, on déclenche
//      l'action 'replay' de soiree-emails. Sinon on ne fait rien : le mail de
//      08h00 portera le replay lui-même, en un seul envoi.
//
// Secrets attendus dans Supabase :
//   ZOOM_WEBHOOK_SECRET_TOKEN  → vérification de signature (onglet « Feature »
//                                de l'app Zoom, « Secret Token »)
//   ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET
//                              → app « Server-to-Server OAuth », utilisés
//                                seulement en repli, quand le payload n'a pas
//                                de share_url (cf. shareUrlDepuisApi).
//
// À DÉPLOYER AVEC verify_jwt=false : Zoom n'envoie pas de JWT Supabase. La
// porte reste fermée par la vérification HMAC ci-dessous, qui rejette en 401
// tout appel non signé par Zoom.
//
// Le lien de replay ne sort jamais d'ici dans la réponse HTTP : il est écrit en
// base, puis envoyé par email aux seules inscrites payées.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ZOOM_API = 'https://api.zoom.us/v2';

// Les liens de partage sont réglés sur 7 jours, comme le replay inclus dans le
// prix de la soirée.
const REPLAY_JOURS = 7;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

// ─── HMAC SHA-256, en hexadécimal ───────────────────────────────────────────
async function hmacHex(secret: string, message: string): Promise<string> {
  const cle = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((o) => o.toString(16).padStart(2, '0'))
    .join('');
}

// Comparaison à temps constant : une comparaison naïve laisserait fuir, par la
// durée, le préfixe correct d'une signature forgée.
function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── Heure murale suisse → instant UTC ──────────────────────────────────────
// Dupliqué depuis soiree-emails : les fonctions edge sont déployées une par
// une, sans module partagé dans ce projet. Garder les deux copies d'accord.
function decalageZurichMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const v = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const murEnUtc = Date.UTC(
    v('year'), v('month') - 1, v('day'), v('hour') % 24, v('minute'), v('second'),
  );
  return murEnUtc - instant.getTime();
}

function heureSuisseEnUtc(
  y: number, m: number, d: number, hh: number, mm: number, ss = 0,
): Date {
  const naif = Date.UTC(y, m - 1, d, hh, mm, ss);
  let t = naif - decalageZurichMs(new Date(naif));
  t = naif - decalageZurichMs(new Date(t));
  return new Date(t);
}

// Fin du 7e jour suivant la soirée, à 23h59'59" heure suisse.
function expirationReplay(eventDateIso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(eventDateIso));
  const v = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const jour = new Date(
    Date.UTC(v('year'), v('month') - 1, v('day')) + REPLAY_JOURS * 24 * 3600 * 1000,
  );
  return heureSuisseEnUtc(
    jour.getUTCFullYear(), jour.getUTCMonth() + 1, jour.getUTCDate(), 23, 59, 59,
  ).toISOString();
}

// ─── Repli : récupérer le lien de partage via l'API ─────────────────────────
// Le payload de recording.completed porte normalement share_url. Quand il
// manque, on le redemande à l'API avec un jeton Server-to-Server OAuth.
async function jetonZoom(): Promise<string | null> {
  const accountId = Deno.env.get('ZOOM_ACCOUNT_ID') ?? '';
  const clientId = Deno.env.get('ZOOM_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET') ?? '';
  if (!accountId || !clientId || !clientSecret) return null;
  try {
    const r = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
      { method: 'POST', headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` } },
    );
    if (!r.ok) {
      console.error('[zoom-recording-webhook] jeton OAuth refusé :', r.status, await r.text().catch(() => ''));
      return null;
    }
    const j = await r.json();
    return j?.access_token ?? null;
  } catch (e) {
    console.error('[zoom-recording-webhook] jeton OAuth impossible :', (e as Error).message);
    return null;
  }
}

async function shareUrlDepuisApi(
  meetingUuid: string,
): Promise<{ shareUrl: string | null; code: string | null }> {
  const jeton = await jetonZoom();
  if (!jeton) return { shareUrl: null, code: null };
  // Un UUID de réunion peut contenir « / » ou « // » : Zoom demande alors un
  // double encodage du segment d'URL.
  const idEncode = encodeURIComponent(encodeURIComponent(meetingUuid));
  try {
    const r = await fetch(`${ZOOM_API}/meetings/${idEncode}/recordings`, {
      headers: { Authorization: `Bearer ${jeton}` },
    });
    if (!r.ok) {
      console.error('[zoom-recording-webhook] API recordings :', r.status, await r.text().catch(() => ''));
      return { shareUrl: null, code: null };
    }
    const j = await r.json();
    return {
      shareUrl: j?.share_url ?? null,
      code: j?.recording_play_passcode ?? j?.password ?? null,
    };
  } catch (e) {
    console.error('[zoom-recording-webhook] API recordings impossible :', (e as Error).message);
    return { shareUrl: null, code: null };
  }
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST attendu' }, 405);

  const secret = Deno.env.get('ZOOM_WEBHOOK_SECRET_TOKEN') ?? '';
  if (!secret) {
    console.error('[zoom-recording-webhook] ZOOM_WEBHOOK_SECRET_TOKEN manquante');
    return json({ error: 'webhook non configuré' }, 500);
  }

  // On lit le corps brut : la signature porte sur les octets exacts envoyés
  // par Zoom, qu'un JSON.parse/stringify ne reproduirait pas.
  const brut = await req.text();

  let corps: any = {};
  try { corps = JSON.parse(brut); } catch { return json({ error: 'JSON invalide' }, 400); }

  // ── 1. Vérification de la signature ───────────────────────────────────────
  // Zoom signe ses appels : x-zm-signature = « v0= » + HMAC-SHA256 du secret
  // sur « v0:<timestamp>:<corps brut> ». On vérifie dès que les en-têtes sont
  // là, y compris sur l'appel de validation d'URL — voir le point 2 pour la
  // raison, qui n'est pas qu'une question de zèle.
  const signature = req.headers.get('x-zm-signature') ?? '';
  const timestamp = req.headers.get('x-zm-request-timestamp') ?? '';
  let signeParZoom = false;

  if (signature && timestamp) {
    // Fenêtre de 5 minutes : au-delà, un appel rejoué est refusé.
    const ageMs = Math.abs(Date.now() - Number(timestamp) * 1000);
    if (!Number.isFinite(ageMs) || ageMs > 5 * 60 * 1000) {
      return json({ error: 'horodatage hors fenêtre' }, 401);
    }
    const attendue = `v0=${await hmacHex(secret, `v0:${timestamp}:${brut}`)}`;
    if (!egalConstant(attendue, signature)) {
      console.error('[zoom-recording-webhook] signature invalide');
      return json({ error: 'signature invalide' }, 401);
    }
    signeParZoom = true;
  }

  // ── 2. Validation de l'URL par Zoom ───────────────────────────────────────
  // À l'enregistrement de l'abonnement, Zoom POSTe un plainToken et attend en
  // retour son HMAC : c'est ce qui prouve, dans l'autre sens, que nous
  // détenons le Secret Token.
  //
  // Attention, cette réponse est un oracle HMAC. Répondre à n'importe quel
  // plainToken laisserait quiconque demander le HMAC de la chaîne
  // « v0:<timestamp>:<corps de son choix> », puis s'en servir comme signature
  // d'un faux recording.completed. Deux verrous :
  //   - si Zoom a signé l'appel (cas réel), la signature a déjà été vérifiée ;
  //   - sinon, on n'accepte qu'un jeton de la forme que Zoom envoie vraiment
  //     (alphanumérique, tirets, 64 caractères au plus), ce qui exclut la
  //     chaîne « v0:… » puisqu'elle contient des deux-points.
  if (corps?.event === 'endpoint.url_validation') {
    const plainToken = String(corps?.payload?.plainToken ?? '');
    if (!signeParZoom && !/^[A-Za-z0-9_-]{1,64}$/.test(plainToken)) {
      console.error('[zoom-recording-webhook] plainToken refusé (appel non signé, format inattendu)');
      return json({ error: 'jeton de validation invalide' }, 401);
    }
    return json({ plainToken, encryptedToken: await hmacHex(secret, plainToken) });
  }

  // Au-delà de la validation d'URL, une signature valide est obligatoire.
  if (!signeParZoom) return json({ error: 'signature absente' }, 401);

  // ── 3. Seul recording.completed nous intéresse ────────────────────────────
  if (corps?.event !== 'recording.completed') {
    return json({ ignore: corps?.event ?? 'inconnu' });
  }

  const objet = corps?.payload?.object ?? {};
  const meetingId = objet.id != null ? String(objet.id) : '';
  const meetingUuid = objet.uuid ?? '';
  if (!meetingId && !meetingUuid) return json({ error: 'identifiant de réunion absent' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    // ── 4. Retrouver la soirée ──────────────────────────────────────────────
    // zoom_meeting_id est saisi à la main dans l'admin : on compare sur les
    // chiffres seuls, pour que « 881 2345 6789 » trouve bien « 88123456789 ».
    const chiffres = meetingId.replace(/\D/g, '');
    const { data: lignes, error: errAcc } = await supabase
      .from('webinar_access')
      .select('product_id, zoom_meeting_id, replay_url, replay_code, replay_expires_at');
    if (errAcc) throw errAcc;

    const ligne = (lignes ?? []).find((l: any) => {
      const stocke = String(l.zoom_meeting_id ?? '').replace(/\D/g, '');
      return stocke.length > 0 && stocke === chiffres;
    });
    if (!ligne) {
      console.warn(`[zoom-recording-webhook] aucune soirée pour la réunion ${meetingId}`);
      return json({ ignore: 'réunion inconnue', meeting_id: meetingId });
    }

    const { data: product } = await supabase
      .from('digital_products')
      .select('id, title, event_date, event_cancelled')
      .eq('id', ligne.product_id)
      .eq('category', 'soiree')
      .maybeSingle();
    if (!product) return json({ ignore: 'produit introuvable' });
    if (product.event_cancelled) return json({ ignore: 'soirée annulée' });

    // ── 5. Lien de partage et code ──────────────────────────────────────────
    // share_url est le lien de partage de l'enregistrement cloud.
    // Le code de lecture, lui, n'est pas garanti : recording_play_passcode
    // n'est servi que si Zoom Support l'a activé sur le compte, et password
    // n'est pas toujours présent selon les réglages. On écrit ce qu'on a ;
    // si rien ne vient, replay_code reste vide et l'email part sans bloc code
    // — c'est volontaire, plutôt que d'inventer un code.
    let shareUrl: string | null = objet.share_url ?? null;
    let code: string | null = objet.recording_play_passcode ?? objet.password ?? null;

    if (!shareUrl && meetingUuid) {
      const repli = await shareUrlDepuisApi(meetingUuid);
      shareUrl = repli.shareUrl;
      code = code ?? repli.code;
    }
    if (!shareUrl) {
      console.error(`[zoom-recording-webhook] pas de share_url pour « ${product.title} »`);
      return json({ error: 'share_url absent du payload et de l\'API' }, 200);
    }
    if (!code) {
      console.warn(
        `[zoom-recording-webhook] aucun code de lecture fourni par Zoom pour « ${product.title} » — `
        + "l'email partira sans code. Si l'enregistrement est protégé, désactive le code de lecture "
        + 'dans les réglages Zoom, ou saisis-le à la main dans l\'onglet Soirées.',
      );
    }

    const maj: Record<string, unknown> = { replay_url: shareUrl };
    if (code) maj.replay_code = code;
    // On ne touche pas à une expiration déjà fixée : Tiffany peut l'avoir
    // ajustée à la main dans l'admin.
    if (!ligne.replay_expires_at && product.event_date) {
      maj.replay_expires_at = expirationReplay(product.event_date);
    }

    const { error: errMaj } = await supabase
      .from('webinar_access')
      .update(maj)
      .eq('product_id', product.id);
    if (errMaj) throw errMaj;

    console.log(`[zoom-recording-webhook] replay enregistré · ${product.title} · code ${code ? 'oui' : 'non'}`);

    // ── 6. L'email du lendemain est-il déjà parti ? ──────────────────────────
    // S'il est parti, il ne contenait pas le replay : on déclenche l'envoi
    // séparé. S'il n'est pas encore parti (cas normal : l'enregistrement
    // arrive dans la nuit), on ne fait rien, le mail de 08h00 le portera.
    const { data: dejaLendemain } = await supabase
      .from('soiree_emails_sent')
      .select('id')
      .eq('product_id', product.id)
      .eq('kind', 'lendemain')
      .limit(1);

    if (!dejaLendemain || dejaLendemain.length === 0) {
      return json({ ok: true, replay: 'enregistré', email: 'suivra dans l\'email du lendemain' });
    }

    const r = await fetch(`${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/soiree-emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'replay', product_id: product.id }),
    });
    const resultat = await r.json().catch(() => ({}));
    console.log(`[zoom-recording-webhook] action replay déclenchée · ${product.title} ·`, JSON.stringify(resultat));
    return json({ ok: true, replay: 'enregistré', email: 'action replay déclenchée', resultat });

  } catch (e) {
    const message = (e as any)?.message ?? String(e);
    console.error('[zoom-recording-webhook] erreur :', message);
    // 200 volontaire : Zoom désactive un abonnement qui renvoie trop d'erreurs.
    // L'incident est dans les logs, et le lien reste saisissable à la main.
    return json({ error: message }, 200);
  }
});
