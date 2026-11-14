// site-vitrine/assets/fiches.js : caniplus.ch/fiches (lot 2). Voir fiches.html.
//
// La page ne contient aucun PDF. Un abonné connecté (session de /espace, même
// site) reçoit la fiche par envoyer-fiche, qui revérifie son premium en base.
// Les autres paient CHF 5 par public-product-checkout ; le webhook Stripe
// envoie ensuite la fiche.

const SUPABASE_URL = 'https://oncbeqnznrqummxmqxbx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uY2JlcW56bnJxdW1teG1xeGJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTY1NDAsImV4cCI6MjA5MTIzMjU0MH0.Z9A88Zv1vlmYAd18Ll2ofAZLrnqoqPkhNJ8pDzceKpk';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
const $ = (id) => document.getElementById(id);
const dlg = $('ficheDialogue');
const etat = { fiche: null, email: null, premium: false };

function message(texte, genre) {
  const m = $('fichesMessage');
  if (!texte) { m.hidden = true; return; }
  m.textContent = texte;
  m.className = `fiches-message fiches-message-${genre || 'info'}`;
  m.hidden = false;
}
function erreur(id, texte) { const e = $(id); e.textContent = texte || ''; e.hidden = !texte; }
function occupe(b, oui, libelle) {
  if (oui) { b.dataset.l = b.textContent; b.textContent = libelle; b.disabled = true; }
  else { if (b.dataset.l) b.textContent = b.dataset.l; b.disabled = false; }
}

// Abonné connecté ? On lit le profil : la base ne renvoie que le sien.
async function lireCompte() {
  try {
    const { data } = await sb.auth.getSession();
    const user = data && data.session ? data.session.user : null;
    if (!user) return;
    etat.email = user.email || null;
    const { data: p } = await sb.from('profiles').select('premium_until, role').eq('id', user.id).maybeSingle();
    etat.premium = !!p && (p.role === 'admin' || (p.premium_until && new Date(p.premium_until) > new Date()));
  } catch (_e) { /* visiteur sans compte : parcours d'achat */ }
}

function ouvrir(bouton) {
  etat.fiche = bouton.dataset.fiche;
  $('dlgTitre').textContent = bouton.dataset.titre;
  erreur('dlgPremiumErreur', '');
  erreur('dlgAchatErreur', '');
  $('dlgPremium').hidden = !etat.premium;
  $('dlgAchat').hidden = etat.premium;
  if (etat.premium) $('dlgEmail').textContent = etat.email || '';
  else if (etat.email && !$('dlgAdresse').value) $('dlgAdresse').value = etat.email;
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  (etat.premium ? $('dlgEnvoyer') : $('dlgAdresse')).focus();
}

document.querySelectorAll('.fiche-demander').forEach((b) => b.addEventListener('click', () => ouvrir(b)));

$('dlgEnvoyer').addEventListener('click', async () => {
  const b = $('dlgEnvoyer');
  erreur('dlgPremiumErreur', '');
  occupe(b, true, 'Envoi…');
  try {
    const { data, error } = await sb.functions.invoke('envoyer-fiche', { body: { product_slug: etat.fiche } });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    dlg.close();
    message(`C'est parti : « ${$('dlgTitre').textContent} » arrive dans ta boîte mail. Pense à regarder dans les indésirables.`, 'ok');
  } catch (e) {
    erreur('dlgPremiumErreur', e.message || 'L\'envoi a échoué. Réessaie dans un instant.');
  } finally {
    occupe(b, false);
  }
});

$('dlgAchat').addEventListener('submit', async (e) => {
  e.preventDefault();
  erreur('dlgAchatErreur', '');
  const email = $('dlgAdresse').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { erreur('dlgAchatErreur', 'Indique une adresse email valide.'); return; }
  const b = $('dlgPayer');
  occupe(b, true, 'Redirection vers le paiement…');
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/public-product-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ email, product_slug: etat.fiche }),
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    if (!data.url) throw new Error('Le paiement ne répond pas. Réessaie dans un instant.');
    window.location.href = data.url;
  } catch (err) {
    const m = /introuvable ou non publi/i.test(err.message)
      ? 'Cette fiche n\'est pas encore en vente. Réessaie bientôt.'
      : (err.message || 'Le paiement ne répond pas. Réessaie dans un instant.');
    erreur('dlgAchatErreur', m);
    occupe(b, false);
  }
});

// Filtres par thème
document.querySelectorAll('.fiche-filtre').forEach((b) => b.addEventListener('click', () => {
  const t = b.dataset.theme;
  document.querySelectorAll('.fiche-filtre').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  document.querySelectorAll('.fiche-carte').forEach((c) => { c.hidden = !!t && c.dataset.theme !== t; });
}));

// Retour de Stripe
(() => {
  const p = new URLSearchParams(window.location.search);
  const achat = p.get('achat');
  if (!achat) return;
  if (achat === 'ok') message('Merci ! Ton paiement est validé. La fiche arrive par email dans quelques minutes. Pense à regarder dans les indésirables.', 'ok');
  if (achat === 'annule') message('Paiement annulé. Rien n\'a été prélevé.', 'info');
  history.replaceState(null, '', window.location.pathname);
})();

// Arrivée depuis /espace (« CHF 5 » sur une fiche) : on ouvre directement
// la fenêtre de cette fiche.
lireCompte().then(() => {
  const slug = new URLSearchParams(window.location.search).get('fiche');
  if (!slug) return;
  const b = document.querySelector(`.fiche-demander[data-fiche="${CSS.escape(slug)}"]`);
  if (!b) return;
  b.closest('.fiche-carte').scrollIntoView({ block: 'center' });
  ouvrir(b);
});
