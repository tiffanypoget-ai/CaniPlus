// site-vitrine/assets/espace.js
// Espace membre de caniplus.ch/espace (lot 1, 14.11.2026). Voir l'en-tête
// de espace.html pour le périmètre.
//
// Règles tenues ici :
//  - Aucun contenu premium n'est écrit dans la page. Le texte d'une fiche ou
//    d'un article n'arrive que par la table resources, que la base ne
//    sert qu'aux abonnés (règle resources_select_premium). Un non abonné
//    reçoit le catalogue (titres, résumés) par catalogue_bibliotheque().
//  - Tout ce qui vient de la base est inséré en texte (textContent), jamais
//    en HTML.
//  - L'accès se décide par ce que la base renvoie, pas par un calcul de date
//    dans le navigateur : si resources renvoie du contenu, on l'affiche.

import { parseContent, stripInlineMarkdown, estimateReadingTime, toSentenceCase } from './premium-content.js';

const SUPABASE_URL = 'https://oncbeqnznrqummxmqxbx.supabase.co';
// Clé publique (anon), la même que l'app et que les autres pages du site.
// Elle ne donne que ce que les règles de la base autorisent.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uY2JlcW56bnJxdW1teG1xeGJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTY1NDAsImV4cCI6MjA5MTIzMjU0MH0.Z9A88Zv1vlmYAd18Ll2ofAZLrnqoqPkhNJ8pDzceKpk';
const PAGE_URL = 'https://caniplus.ch/espace';

const THEMES = {
  education: 'Éducation',
  comportement: 'Comportement',
  'bien-etre': 'Bien-être',
  sante: 'Santé',
  sociabilisation: 'Sociabilisation',
  quotidien: 'Quotidien',
};

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const $ = (id) => document.getElementById(id);

const etat = {
  user: null,
  profil: null,
  acces: false,         // la base sert le contenu complet à ce compte
  items: [],            // fiches et articles (complets ou catalogue)
  type: 'fiche',
  recherche: '',
  theme: '',
  recuperation: false,  // arrivée par le lien « mot de passe oublié »
};

// ── Affichage des vues ────────────────────────────────────────────────
const VUES_AUTH = ['vueConnexion', 'vueInscription', 'vueOubli', 'vueNouveauMdp'];
function montrer(id, visible) { $(id).hidden = !visible; }
function seulementAuth(id) {
  VUES_AUTH.forEach((v) => montrer(v, v === id));
}

function message(texte, genre = 'info') {
  const el = $('espaceMessage');
  if (!texte) { el.hidden = true; el.textContent = ''; return; }
  el.textContent = texte;
  el.className = `espace-message espace-message-${genre}`;
  el.hidden = false;
}

function erreur(id, texte) {
  const el = $(id);
  el.textContent = texte || '';
  el.hidden = !texte;
}

function occupe(bouton, oui, libelle) {
  if (oui) {
    bouton.dataset.libelle = bouton.textContent;
    bouton.textContent = libelle || 'Un instant…';
    bouton.disabled = true;
  } else {
    if (bouton.dataset.libelle) bouton.textContent = bouton.dataset.libelle;
    bouton.disabled = false;
  }
}

function dateLongue(iso) {
  return new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Messages d'erreur Supabase en français ───────────────────────────
function traduire(err) {
  const m = (err && (err.message || err.error_description || String(err))) || '';
  if (/invalid login credentials/i.test(m)) return 'Adresse ou mot de passe incorrect.';
  if (/email not confirmed/i.test(m)) return "Ton adresse n'est pas encore confirmée. Regarde dans ta boîte mail.";
  if (/rate limit|too many/i.test(m)) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  if (/password should be at least|weak password/i.test(m)) return 'Mot de passe trop court : au moins 8 caractères.';
  if (/already registered|already exists/i.test(m)) return 'Un compte existe déjà avec cette adresse. Connecte-toi, ou utilise « Mot de passe oublié ».';
  if (/invalid.*email|email.*invalid/i.test(m)) return "Cette adresse email n'est pas valide.";
  if (/signups? not allowed|signup is disabled/i.test(m)) return "La création de compte est momentanément fermée. Écris à info@caniplus.ch.";
  if (/same password|different from the old/i.test(m)) return "Choisis un mot de passe différent de l'ancien.";
  if (/failed to fetch|network/i.test(m)) return 'Connexion impossible. Vérifie ton réseau et réessaie.';
  return m || 'Une erreur est survenue. Réessaie dans un instant.';
}

// ── Chargement des données ────────────────────────────────────────────
async function chargerProfil() {
  const { data } = await sb.from('profiles')
    .select('id, email, full_name, premium_until, premium_cancel_at, stripe_subscription_id')
    .eq('id', etat.user.id)
    .maybeSingle();
  etat.profil = data || null;
}

async function chargerBibliotheque() {
  etat.acces = false;
  if (etat.user) {
    // Ce que la base accepte de servir à ce compte. Pour un non abonné, la
    // règle d'accès renvoie zéro ligne : on bascule alors sur le catalogue.
    const { data, error } = await sb.from('resources')
      .select('id, title, description, type, category, created_at, content, storage_path, personnelle')
      .in('type', ['fiche', 'article'])
      .order('created_at', { ascending: false });
    const complets = (!error && data ? data : [])
      .filter((r) => !r.personnelle && r.content && r.content.trim());
    if (complets.length) {
      etat.acces = true;
      etat.items = complets;
      return;
    }
  }
  const { data, error } = await sb.rpc('catalogue_bibliotheque');
  etat.items = error || !data ? [] : data;
}

// ── Compte et abonnement ─────────────────────────────────────────────
function afficherCompte() {
  montrer('vueCompte', true);
  $('compteEmail').textContent = etat.user.email || '';

  const p = etat.profil;
  const actif = p && p.premium_until && new Date(p.premium_until) > new Date();
  const resilie = actif && p.premium_cancel_at;

  montrer('aboActif', !!(actif && !resilie));
  montrer('aboResilie', !!resilie);
  montrer('aboOffre', !actif);
  montrer('confirmResiliation', false);

  if (actif && !resilie) {
    // Un accès offert n'a pas d'abonnement Stripe : rien à résilier.
    $('aboEcheance').textContent = p.stripe_subscription_id
      ? `Prochain renouvellement le ${dateLongue(p.premium_until)}.`
      : `Accès offert jusqu'au ${dateLongue(p.premium_until)}.`;
    montrer('btnResilier', !!p.stripe_subscription_id);
  }
  if (resilie) {
    $('aboFin').textContent = `Ton accès reste ouvert jusqu'au ${dateLongue(p.premium_until)}, puis l'abonnement s'arrête. Rien ne sera plus prélevé.`;
  }
}

async function sAbonner() {
  const bouton = $('btnAbonner');
  erreur('aboErreur', '');
  occupe(bouton, true, 'Redirection vers le paiement…');
  try {
    const { data, error } = await sb.functions.invoke('create-checkout', {
      body: { type: 'premium_mensuel', user_id: etat.user.id, user_email: etat.user.email, retour: 'site' },
    });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    if (!data || !data.url) throw new Error('Le paiement ne répond pas. Réessaie dans un instant.');
    window.location.href = data.url;
  } catch (e) {
    erreur('aboErreur', traduire(e));
    occupe(bouton, false);
  }
}

async function resilier() {
  const bouton = $('btnResilierConfirmer');
  occupe(bouton, true, 'Résiliation…');
  try {
    const { data, error } = await sb.functions.invoke('cancel-subscription', {
      body: { user_id: etat.user.id, type: 'premium_mensuel' },
    });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    await chargerProfil();
    afficherCompte();
    message('C\'est noté. Ton abonnement s\'arrête à la fin du mois déjà payé.', 'ok');
  } catch (e) {
    message(traduire(e), 'erreur');
  } finally {
    occupe(bouton, false);
  }
}

// ── Bibliothèque ──────────────────────────────────────────────────────
function remplirThemes() {
  const select = $('biblioTheme');
  const presents = [...new Set(etat.items.map((r) => r.category).filter(Boolean))];
  presents.sort((a, b) => (THEMES[a] || a).localeCompare(THEMES[b] || b, 'fr'));
  select.length = 1;
  presents.forEach((c) => {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = THEMES[c] || c;
    select.appendChild(o);
  });
}

function normaliser(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function afficherBibliotheque() {
  montrer('vueBiblio', true);
  $('biblioAide').textContent = etat.acces
    ? 'Touche une fiche ou un article pour le lire.'
    : etat.user
      ? 'Voici ce que contient le premium. Abonne-toi pour tout lire.'
      : 'Voici ce que contient le premium. Connecte-toi ou crée ton compte pour t\'abonner.';

  document.querySelectorAll('.espace-onglet').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.type === etat.type));
  });

  const q = normaliser(etat.recherche);
  let liste = etat.items.filter((r) => r.type === etat.type
    && (!etat.theme || r.category === etat.theme)
    && (!q || normaliser(r.title).includes(q) || normaliser(r.description).includes(q)));
  if (etat.type === 'fiche') liste = liste.sort((a, b) => a.title.localeCompare(b.title, 'fr'));

  const ul = $('biblioListe');
  ul.replaceChildren();
  $('biblioVide').hidden = liste.length > 0;

  liste.forEach((r) => {
    const li = document.createElement('li');
    const carte = document.createElement(etat.acces ? 'button' : 'div');
    carte.className = 'espace-item' + (etat.acces ? '' : ' espace-item-verrou');
    if (etat.acces) {
      carte.type = 'button';
      carte.addEventListener('click', () => ouvrir(r));
    }

    const meta = document.createElement('span');
    meta.className = 'espace-item-meta';
    meta.textContent = THEMES[r.category] || 'CaniPlus';
    if (!etat.acces) {
      const cadenas = document.createElement('span');
      cadenas.className = 'espace-cadenas';
      cadenas.setAttribute('aria-label', 'Réservé aux abonnés');
      cadenas.textContent = 'Premium';
      meta.appendChild(cadenas);
    }

    const titre = document.createElement('span');
    titre.className = 'espace-item-titre';
    titre.textContent = stripInlineMarkdown(r.title);

    const desc = document.createElement('span');
    desc.className = 'espace-item-desc';
    desc.textContent = r.description || '';

    carte.append(meta, titre, desc);
    li.appendChild(carte);
    ul.appendChild(li);
  });
}

// ── Lecture ───────────────────────────────────────────────────────────
function el(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte != null) e.textContent = stripInlineMarkdown(texte);
  return e;
}

// Pour comparer l'accroche et le début du texte sans tenir compte de la
// ponctuation, des espaces ni de la casse.
const comparable = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

function rendreBlocs(contenu, chapo) {
  const frag = document.createDocumentFragment();
  let listeAttention = null;
  let blocs = parseContent(contenu);
  // Les fiches commencent souvent par leur sous-titre, déjà affiché en chapô
  // sous le titre : on ne le répète pas (constaté le 14.11.2026).
  if (chapo && blocs[0] && blocs[0].type === 'paragraph' && comparable(blocs[0].text) === comparable(chapo)) {
    blocs = blocs.slice(1);
  }
  blocs.forEach((b) => {
    switch (b.type) {
      case 'heading': {
        const h = el('h3', 'lc-titre');
        if (b.number) h.appendChild(el('span', 'lc-num', b.number));
        h.appendChild(document.createTextNode(stripInlineMarkdown(toSentenceCase(b.text))));
        frag.appendChild(h);
        break;
      }
      case 'subheading':
        frag.appendChild(el('h4', 'lc-sous-titre', toSentenceCase(b.text)));
        break;
      case 'paragraph':
        frag.appendChild(el('p', 'lc-p', b.text));
        break;
      case 'arrow':
        frag.appendChild(el('p', 'lc-fleche', b.text));
        break;
      case 'steps': {
        const ol = el('ol', 'lc-etapes');
        b.items.forEach((t) => ol.appendChild(el('li', null, t)));
        frag.appendChild(ol);
        break;
      }
      case 'bullets': {
        const ul = el('ul', 'lc-puces');
        b.items.forEach((it) => {
          const li = el('li', null, typeof it === 'string' ? it : it.text);
          if (it && it.subs && it.subs.length) {
            const sous = el('ul', 'lc-sous-puces');
            it.subs.forEach((s) => sous.appendChild(el('li', null, s)));
            li.appendChild(sous);
          }
          ul.appendChild(li);
        });
        frag.appendChild(ul);
        break;
      }
      case 'tip': {
        const d = el('div', 'lc-astuce');
        d.appendChild(el('strong', null, 'Astuce'));
        d.appendChild(el('p', null, b.text));
        frag.appendChild(d);
        break;
      }
      case 'warning-heading':
        listeAttention = el('div', 'lc-attention');
        listeAttention.appendChild(el('strong', null, toSentenceCase(b.text)));
        frag.appendChild(listeAttention);
        break;
      case 'warning-text':
        (listeAttention || frag).appendChild(el('p', null, b.text));
        break;
      case 'warning-list': {
        const ul = el('ul', 'lc-puces');
        b.items.forEach((t) => ul.appendChild(el('li', null, t)));
        (listeAttention || frag).appendChild(ul);
        break;
      }
      case 'separator':
        frag.appendChild(document.createElement('hr'));
        break;
      default:
        if (b.text) frag.appendChild(el('p', 'lc-p', b.text));
    }
    if (b.type !== 'warning-heading' && b.type !== 'warning-text' && b.type !== 'warning-list') {
      listeAttention = null;
    }
  });
  return frag;
}

// Le bouton retour du téléphone doit ramener à la bibliothèque, pas au site :
// ouvrir une fiche ajoute une étape à l'historique du navigateur, et le retour
// (bouton du téléphone ou « Retour à la bibliothèque ») la défait.
let positionListe = 0;

function ouvrir(r) {
  positionListe = window.scrollY;
  history.pushState({ lecture: r.id }, '', `#lecture-${r.id}`);
  afficherLecture(r);
}

function afficherLecture(r) {
  montrer('vueBiblio', false);
  montrer('vueCompte', false);
  montrer('vueLecture', true);

  const minutes = estimateReadingTime(r.content);
  $('lectureMeta').textContent = `${r.type === 'fiche' ? 'Fiche pratique' : 'Article de fond'} · ${THEMES[r.category] || 'CaniPlus'} · ${minutes} min de lecture`;
  $('lectureTitre').textContent = stripInlineMarkdown(r.title);
  $('lectureChapo').textContent = r.description || '';

  const actions = $('lectureActions');
  actions.replaceChildren();
  if (r.storage_path) {
    const b = el('button', 'btn btn-outline', 'Télécharger le PDF');
    b.type = 'button';
    b.addEventListener('click', () => telechargerPdf(r, b));
    actions.appendChild(b);
  }

  $('lectureCorps').replaceChildren(rendreBlocs(r.content, r.description));
  window.scrollTo({ top: 0, behavior: 'auto' });
  $('btnRetour').focus({ preventScroll: true });
}

function fermerLecture() {
  montrer('vueLecture', false);
  montrer('vueCompte', true);
  montrer('vueBiblio', true);
  window.scrollTo({ top: positionListe, behavior: 'auto' });
}

window.addEventListener('popstate', (e) => {
  const id = e.state && e.state.lecture;
  if (id) {
    // Avancer à nouveau vers une fiche déjà ouverte
    const r = etat.items.find((x) => x.id === id);
    if (r && etat.acces) { positionListe = window.scrollY; afficherLecture(r); return; }
  }
  if (!$('vueLecture').hidden) fermerLecture();
});

async function telechargerPdf(r, bouton) {
  // Bucket privé : lien signé valable une heure, demandé au moment du clic.
  // La fenêtre s'ouvre tout de suite, sinon les bloqueurs de popups la
  // refusent après l'attente.
  const fenetre = window.open('', '_blank');
  occupe(bouton, true, 'Préparation du PDF…');
  const { data } = await sb.storage.from('fiches-pratiques').createSignedUrl(r.storage_path, 3600);
  occupe(bouton, false);
  if (data && data.signedUrl && fenetre) fenetre.location = data.signedUrl;
  else {
    if (fenetre) fenetre.close();
    message('Le PDF est indisponible pour le moment.', 'erreur');
  }
}

// ── Cycle de vie ──────────────────────────────────────────────────────
async function rafraichir() {
  const { data } = await sb.auth.getSession();
  etat.user = data && data.session ? data.session.user : null;

  montrer('vueChargement', true);
  if (etat.recuperation) {
    montrer('vueChargement', false);
    seulementAuth('vueNouveauMdp');
    montrer('vueCompte', false);
    montrer('vueBiblio', false);
    return;
  }

  if (etat.user) {
    seulementAuth(null);
    await Promise.all([chargerProfil(), chargerBibliotheque()]);
    afficherCompte();
  } else {
    seulementAuth('vueConnexion');
    montrer('vueCompte', false);
    await chargerBibliotheque();
  }
  montrer('vueLecture', false);
  remplirThemes();
  afficherBibliotheque();
  montrer('vueChargement', false);
}

// Retour de Stripe : le webhook active l'abonnement quelques secondes après
// le paiement. On recharge le profil jusqu'à le voir actif (30 s au plus).
async function attendreActivation() {
  for (let i = 0; i < 10; i++) {
    await new Promise((ok) => setTimeout(ok, 3000));
    if (!etat.user) return;
    await chargerProfil();
    const p = etat.profil;
    if (p && p.premium_until && new Date(p.premium_until) > new Date()) {
      await chargerBibliotheque();
      afficherCompte();
      remplirThemes();
      afficherBibliotheque();
      message('Ton abonnement est actif. Bonne lecture !', 'ok');
      return;
    }
  }
  message('Ton paiement est bien passé. L\'activation prend parfois une minute : recharge la page si la bibliothèque reste verrouillée.', 'info');
}

function lireRetourStripe() {
  const params = new URLSearchParams(window.location.search);
  const retour = params.get('abonnement');
  if (!retour) return null;
  params.delete('abonnement');
  const reste = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (reste ? `?${reste}` : '') + window.location.hash);
  return retour;
}

function brancher() {
  $('formConnexion').addEventListener('submit', async (e) => {
    e.preventDefault();
    erreur('cxErreur', '');
    const email = $('cxEmail').value.trim();
    const password = $('cxMdp').value;
    if (!email || !password) { erreur('cxErreur', 'Indique ton adresse et ton mot de passe.'); return; }
    const bouton = e.submitter || e.target.querySelector('button[type=submit]');
    occupe(bouton, true, 'Connexion…');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    occupe(bouton, false);
    if (error) { erreur('cxErreur', traduire(error)); return; }
    $('cxMdp').value = '';
    message('');
    await rafraichir();
  });

  $('lienInscription').addEventListener('click', () => {
    $('insEmail').value = $('cxEmail').value.trim();
    erreur('insErreur', '');
    seulementAuth('vueInscription');
    $('insNom').focus();
  });
  $('lienConnexion').addEventListener('click', () => { seulementAuth('vueConnexion'); $('cxEmail').focus(); });

  $('formInscription').addEventListener('submit', async (e) => {
    e.preventDefault();
    erreur('insErreur', '');
    const nom = $('insNom').value.trim();
    const email = $('insEmail').value.trim();
    const password = $('insMdp').value;
    if (!nom || !email) { erreur('insErreur', 'Indique ton nom et ton adresse email.'); return; }
    if (password.length < 8) { erreur('insErreur', 'Mot de passe trop court : au moins 8 caractères.'); return; }
    const bouton = e.submitter || e.target.querySelector('button[type=submit]');
    occupe(bouton, true, 'Création…');
    // user_type 'external' : quelqu'un qui ne vient pas aux cours du club.
    // Le déclencheur handle_new_user crée le profil avec ces valeurs.
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { full_name: nom, user_type: 'external' }, emailRedirectTo: PAGE_URL },
    });
    occupe(bouton, false);
    if (error) { erreur('insErreur', traduire(error)); return; }
    $('insMdp').value = '';
    if (data && data.session) {
      message('Ton compte est créé. Bienvenue !', 'ok');
      await rafraichir();
      return;
    }
    // Confirmation par email activée : pas de session tant que le lien
    // n'est pas cliqué. Message identique si l'adresse avait déjà un compte,
    // pour ne pas révéler qui est inscrit.
    seulementAuth('vueConnexion');
    message(`Presque fini : on t'a envoyé un lien à ${email}. Clique dessus pour activer ton compte, puis reviens ici. Pense à regarder dans les indésirables.`, 'ok');
  });

  $('lienOubli').addEventListener('click', () => {
    $('oubliEmail').value = $('cxEmail').value.trim();
    erreur('oubliErreur', '');
    seulementAuth('vueOubli');
    $('oubliEmail').focus();
  });
  $('retourConnexion').addEventListener('click', () => { seulementAuth('vueConnexion'); $('cxEmail').focus(); });

  $('formOubli').addEventListener('submit', async (e) => {
    e.preventDefault();
    erreur('oubliErreur', '');
    const email = $('oubliEmail').value.trim();
    if (!email) { erreur('oubliErreur', 'Indique ton adresse email.'); return; }
    const bouton = e.submitter || e.target.querySelector('button[type=submit]');
    occupe(bouton, true, 'Envoi…');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: PAGE_URL });
    occupe(bouton, false);
    if (error) { erreur('oubliErreur', traduire(error)); return; }
    // Même message que l'adresse existe ou non : on ne révèle pas qui a un compte.
    seulementAuth('vueConnexion');
    message('Si cette adresse a un compte CaniPlus, un lien vient de partir. Pense à regarder dans les indésirables.', 'ok');
  });

  $('formNouveauMdp').addEventListener('submit', async (e) => {
    e.preventDefault();
    erreur('nvErreur', '');
    const password = $('nvMdp').value;
    if (password.length < 8) { erreur('nvErreur', 'Au moins 8 caractères.'); return; }
    const bouton = e.submitter || e.target.querySelector('button[type=submit]');
    occupe(bouton, true, 'Enregistrement…');
    const { error } = await sb.auth.updateUser({ password });
    occupe(bouton, false);
    if (error) { erreur('nvErreur', traduire(error)); return; }
    $('nvMdp').value = '';
    etat.recuperation = false;
    window.history.replaceState(null, '', window.location.pathname);
    message('Ton nouveau mot de passe est enregistré.', 'ok');
    await rafraichir();
  });

  $('btnDeconnexion').addEventListener('click', async () => {
    await sb.auth.signOut();
    etat.profil = null;
    message('Tu es déconnecté·e.', 'info');
    await rafraichir();
  });

  $('btnAbonner').addEventListener('click', sAbonner);
  $('btnResilier').addEventListener('click', () => {
    montrer('confirmResiliation', true);
    $('btnResilierAnnuler').focus();
  });
  $('btnResilierAnnuler').addEventListener('click', () => montrer('confirmResiliation', false));
  $('btnResilierConfirmer').addEventListener('click', resilier);

  document.querySelectorAll('.espace-onglet').forEach((b) => {
    b.addEventListener('click', () => { etat.type = b.dataset.type; afficherBibliotheque(); });
  });
  $('biblioRecherche').addEventListener('input', (e) => { etat.recherche = e.target.value; afficherBibliotheque(); });
  $('biblioTheme').addEventListener('change', (e) => { etat.theme = e.target.value; afficherBibliotheque(); });
  $('btnRetour').addEventListener('click', () => {
    if (history.state && history.state.lecture) history.back();
    else fermerLecture();
  });
}

async function demarrer() {
  // Page rechargée pendant une lecture : on repart de la bibliothèque.
  if (/^#lecture-/.test(window.location.hash)) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  brancher();

  // Le lien « mot de passe oublié » arrive avec type=recovery dans l'adresse.
  // supabase-js ouvre alors une session et émet PASSWORD_RECOVERY.
  if (/type=recovery/.test(window.location.hash)) etat.recuperation = true;
  sb.auth.onAuthStateChange((evenement) => {
    if (evenement === 'PASSWORD_RECOVERY') {
      etat.recuperation = true;
      rafraichir();
    }
  });

  const retour = lireRetourStripe();
  try {
    await rafraichir();
  } catch (e) {
    montrer('vueChargement', false);
    message(traduire(e), 'erreur');
    return;
  }

  if (retour === 'ok') {
    message('Merci ! Ton paiement est validé, on active ton abonnement…', 'ok');
    attendreActivation();
  } else if (retour === 'annule') {
    message('Paiement annulé. Rien n\'a été prélevé.', 'info');
  }
}

demarrer();
