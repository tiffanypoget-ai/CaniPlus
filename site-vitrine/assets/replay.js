// site-vitrine/assets/replay.js : caniplus.ch/replay?t=<jeton> (lot 3).
// Demande le replay à replay-soiree ; tout ce qui vient du serveur est inséré
// en texte ou en attribut, jamais en HTML.

const SUPABASE_URL = 'https://oncbeqnznrqummxmqxbx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uY2JlcW56bnJxdW1teG1xeGJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTY1NDAsImV4cCI6MjA5MTIzMjU0MH0.Z9A88Zv1vlmYAd18Ll2ofAZLrnqoqPkhNJ8pDzceKpk';
const $ = (id) => document.getElementById(id);
const montrer = (id, oui) => { $(id).hidden = !oui; };

function dateLongue(iso) {
  return new Date(iso).toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Zurich' });
}

async function charger() {
  const jeton = new URLSearchParams(window.location.search).get('t');
  let r = { erreur: 'lien' };
  if (jeton) {
    try {
      const rep = await fetch(`${SUPABASE_URL}/functions/v1/replay-soiree`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ t: jeton }),
      });
      r = await rep.json();
    } catch (_e) { r = { erreur: 'reseau' }; }
  }
  montrer('replayChargement', false);

  if (r.erreur) {
    if (r.erreur !== 'lien') $('replayErreur').querySelector('p').textContent = 'Le replay ne répond pas pour le moment. Réessaie dans quelques minutes.';
    montrer('replayErreur', true);
    return;
  }
  $('replayTitre').textContent = r.titre;
  document.title = `Replay : ${r.titre} | CaniPlus`;
  if (r.date) $('replayDate').textContent = `Soirée du ${dateLongue(r.date)}`;

  if (r.etat === 'bientot') { montrer('replayBientot', true); return; }
  if (r.etat === 'termine') {
    if (r.fin) $('replayTermineTexte').textContent = `Les 7 jours de replay compris dans ton inscription se sont terminés le ${dateLongue(r.fin)}.`;
    montrer('replayTermine', true);
    return;
  }

  montrer('replayPret', true);
  if (r.youtube) {
    // youtube-nocookie : pas de cookie YouTube tant que la vidéo n'est pas lancée.
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(r.youtube)}?rel=0&modestbranding=1`;
    f.title = `Replay : ${r.titre}`;
    f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    $('replayVideo').append(f);
  } else if (r.lien && /^https:\/\//.test(r.lien)) {
    montrer('replayVideo', false);
    montrer('replayZoom', true);
    $('replayLien').href = r.lien;
    if (r.code) { $('replayCode').textContent = r.code; montrer('replayCodeBloc', true); }
  }
  if (r.fin) $('replayFin').textContent = `Replay disponible jusqu'au ${dateLongue(r.fin)}. Ce lien est personnel : garde-le pour toi.`;
}

charger();
