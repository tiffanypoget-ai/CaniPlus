// site-vitrine/assets/admin.js
// Admin de caniplus.ch/admin (lot 5). Voir l'en-tête de admin.html.
//
// Sécurité : rien n'est décidé ici. La page masque ce qui ne concerne pas un
// admin, mais les droits réels sont vérifiés par Supabase (règles d'accès et
// fonctions qui relisent profiles.role). Ce qui vient de la base est inséré
// en texte, jamais en HTML.

const SUPABASE_URL = 'https://oncbeqnznrqummxmqxbx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uY2JlcW56bnJxdW1teG1xeGJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTY1NDAsImV4cCI6MjA5MTIzMjU0MH0.Z9A88Zv1vlmYAd18Ll2ofAZLrnqoqPkhNJ8pDzceKpk';
const BUCKET_FICHES = 'fiches-pratiques';
const DOSSIER_FICHES = 'fiches';

// Liste qui fait foi : docs/FICHES-SITE.md (décision de Tiffany, 14.11.2026).
const FICHES_SITE = [
  'Comment ton chien apprend', 'Le renforcement positif', 'Le mot marqueur', 'La règle des 3D',
  'Les zones de travail', 'Les erreurs courantes en éducation', 'Les 10 réflexes du quotidien',
  'Le rappel', 'La marche en laisse', "L'exercice du regard", 'La touche prolongée de la main',
  'Les autocontrôles - le principe', "L'autocontrôle - la main", "L'autocontrôle - la gamelle",
  "L'autocontrôle - la porte", 'La gestion de la frustration', 'La sonnette',
  'La socialisation du chiot', 'La propreté du chiot', 'Rester seul sereinement',
  'Le jeu, un outil éducatif', 'Le jeu des 3 gobelets', "Les signaux d'apaisement",
  'Les plantes toxiques', 'Les dangers à la maison', 'La chaleur et le coup de chaleur',
  'Les transports publics en Suisse', 'Vers qui se diriger',
  'Le tapis de relaxation', "L'habituation à la muselière", 'La réactivité en laisse',
  "L'en face d'urgence", 'On y va - le demi-tour', 'Vite, vite', 'Respire', 'Entre les jambes', 'Derrière',
];

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

const $ = (id) => document.getElementById(id);
const montrer = (id, oui) => { $(id).hidden = !oui; };

function el(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte != null) e.textContent = texte;
  return e;
}

function message(texte, genre = 'info') {
  const m = $('admMessage');
  if (!texte) { m.hidden = true; return; }
  m.textContent = texte;
  m.className = `adm-message adm-message-${genre}`;
  m.hidden = false;
}

function cle(s) {
  return (s || '').replace(/\.pdf$/i, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}
function slug(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const fmtDate = (iso) => (iso
  ? new Date(iso).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich' })
  : '');
const chf = (n) => `${Number(n || 0).toFixed(0)} CHF`;

// ── Connexion ─────────────────────────────────────────────────────────
async function verifier() {
  montrer('vueChargement', true);
  ['vueConnexion', 'vueRefus', 'vueAdmin'].forEach((v) => montrer(v, false));
  const { data } = await sb.auth.getSession();
  const user = data && data.session ? data.session.user : null;
  montrer('admCompte', !!user);
  if (!user) {
    montrer('vueChargement', false);
    montrer('vueConnexion', true);
    return;
  }
  $('admEmail').textContent = user.email || '';
  const { data: profil } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  montrer('vueChargement', false);
  if (!profil || profil.role !== 'admin') {
    montrer('vueRefus', true);
    return;
  }
  montrer('vueAdmin', true);
  ouvrirOnglet(lireOnglet());
}

$('formConnexion').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('cxErreur');
  err.hidden = true;
  const bouton = e.submitter || e.target.querySelector('button');
  bouton.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email: $('cxEmail').value.trim(), password: $('cxMdp').value });
  bouton.disabled = false;
  if (error) {
    err.textContent = /invalid login/i.test(error.message) ? 'Adresse ou mot de passe incorrect.' : error.message;
    err.hidden = false;
    return;
  }
  $('cxMdp').value = '';
  verifier();
});
async function deconnecter() { await sb.auth.signOut(); message(''); verifier(); }
$('admDeconnexion').addEventListener('click', deconnecter);
$('btnChangerCompte').addEventListener('click', deconnecter);

// ── Onglets ───────────────────────────────────────────────────────────
const ONGLETS = { soirees: 'ongletSoirees', adhesions: 'ongletAdhesions', rallye: 'ongletRallye', fiches: 'ongletFiches', bientot: 'ongletBientot' };
function lireOnglet() {
  const h = window.location.hash.replace('#', '');
  return ONGLETS[h] ? h : 'soirees';
}
function ouvrirOnglet(nom) {
  Object.entries(ONGLETS).forEach(([k, id]) => montrer(id, k === nom));
  document.querySelectorAll('.adm-onglet').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.onglet === nom)));
  if (window.location.hash !== `#${nom}`) history.replaceState(null, '', `#${nom}`);
  message('');
  if (nom === 'fiches') chargerFiches();
  if (nom === 'rallye') chargerRallye();
  if (nom === 'soirees') chargerSoirees();
  if (nom === 'adhesions') chargerAdhesions();
}
document.querySelectorAll('.adm-onglet').forEach((b) => b.addEventListener('click', () => ouvrirOnglet(b.dataset.onglet)));

// ── Fiches : import des PDF ───────────────────────────────────────────
const FICHES_PAR_CLE = new Map(FICHES_SITE.map((t) => [cle(t), t]));

async function chargerFiches() {
  const ul = $('fichesListe');
  ul.replaceChildren(el('li', 'adm-aide', 'Chargement…'));
  const { data, error } = await sb.storage.from(BUCKET_FICHES).list(DOSSIER_FICHES, { limit: 200 });
  if (error) {
    ul.replaceChildren(el('li', 'adm-erreur', `Lecture impossible : ${error.message}`));
    return;
  }
  const deposes = new Map((data || []).map((f) => [f.name, f]));
  ul.replaceChildren();
  let n = 0;
  [...FICHES_SITE].sort((a, b) => a.localeCompare(b, 'fr')).forEach((titre) => {
    const f = deposes.get(`${slug(titre)}.pdf`);
    if (f) n++;
    const li = el('li', f ? 'adm-fiche adm-fiche-ok' : 'adm-fiche');
    li.append(el('span', 'adm-fiche-titre', titre));
    li.append(el('span', 'adm-fiche-etat', f ? `Déposée${f.updated_at ? ` le ${fmtDate(f.updated_at)}` : ''}` : 'Manquante'));
    ul.appendChild(li);
  });
  $('fichesCompteur').textContent = `${n} sur ${FICHES_SITE.length} déposées`;
}

$('fichesFichiers').addEventListener('change', async (e) => {
  const fichiers = Array.from(e.target.files || []);
  e.target.value = '';
  if (!fichiers.length) return;
  $('fichesChoix').textContent = `${fichiers.length} fichier${fichiers.length > 1 ? 's' : ''} en cours d'envoi…`;
  const res = $('fichesResultat');
  res.hidden = false;
  res.replaceChildren();

  // Fiches déjà lisibles dans l'espace : on y rattache le PDF (bouton
  // « Télécharger le PDF » de caniplus.ch/espace).
  const { data: catalogue } = await sb.rpc('catalogue_bibliotheque');
  const ressourceParCle = new Map((catalogue || []).filter((r) => r.type === 'fiche').map((r) => [cle(r.title), r]));

  let ok = 0;
  for (const f of fichiers) {
    const ligne = el('p', 'adm-ligne');
    res.appendChild(ligne);
    const titre = FICHES_PAR_CLE.get(cle(f.name));
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
      ligne.textContent = `${f.name} : refusé, ce n'est pas un PDF.`;
      ligne.classList.add('adm-ko');
      continue;
    }
    if (!titre) {
      ligne.textContent = `${f.name} : refusé, ce nom ne correspond à aucune des 37 fiches du site.`;
      ligne.classList.add('adm-ko');
      continue;
    }
    const chemin = `${DOSSIER_FICHES}/${slug(titre)}.pdf`;
    // Lecture complète avant l'envoi. Sur Android, un fichier choisi
    // directement dans Google Drive n'est qu'un raccourci : l'envoyer tel
    // quel échouait avec « Failed to fetch » sans rien transmettre (constaté
    // le 14.11.2026, seules les requêtes OPTIONS arrivaient au serveur).
    let contenu;
    try {
      contenu = new Blob([await f.arrayBuffer()], { type: 'application/pdf' });
    } catch (_e) {
      ligne.textContent = `${f.name} : le téléphone n'a pas pu lire ce fichier. Télécharge-le d'abord sur le téléphone (Drive, puis « Télécharger »), puis choisis-le dans « Téléchargements ».`;
      ligne.classList.add('adm-ko');
      continue;
    }
    if (!contenu.size) {
      ligne.textContent = `${f.name} : fichier vide, rien n'a été envoyé.`;
      ligne.classList.add('adm-ko');
      continue;
    }
    const { error } = await sb.storage.from(BUCKET_FICHES).upload(chemin, contenu, { upsert: true, contentType: 'application/pdf' });
    if (error) {
      ligne.textContent = /failed to fetch|network/i.test(error.message)
        ? `${f.name} : l'envoi a été coupé (connexion ou fichier illisible). Réessaie avec ce fichier seul, après l'avoir téléchargé sur le téléphone.`
        : `${f.name} : échec de l'envoi (${error.message}).`;
      ligne.classList.add('adm-ko');
      continue;
    }
    const ressource = ressourceParCle.get(cle(titre));
    if (ressource) await sb.from('resources').update({ storage_path: chemin }).eq('id', ressource.id);
    ligne.textContent = `${titre} : déposée${ressource ? ', et reliée à la fiche de l\'espace' : ''}.`;
    ligne.classList.add('adm-ok');
    ok++;
  }
  $('fichesChoix').textContent = `${ok} sur ${fichiers.length} déposé${ok > 1 ? 's' : ''}.`;
  chargerFiches();
});

// ── Rallye ────────────────────────────────────────────────────────────
const FIN_VIREMENT = new Date('2027-03-13T00:00:00+01:00');
const STATUTS = { en_attente: 'En attente', paye: 'Payé', annule: 'Annulé' };
const PARCOURS = { '1km': '1 km', '3.7km': '3,7 km', '5.4km': '5,4 km', indecis: 'Pas décidé' };
const rallye = { inscriptions: [], filtre: 'tous' };

async function appelerRallye(body) {
  const { data, error } = await sb.functions.invoke('rallye-admin', { body });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch (_e) { /* corps illisible */ }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

async function chargerRallye() {
  $('rallyeListe').replaceChildren(el('p', 'adm-aide', 'Chargement…'));
  try {
    const data = await appelerRallye({ action: 'list' });
    rallye.inscriptions = data.inscriptions || [];
    afficherRallye();
  } catch (e) {
    $('rallyeListe').replaceChildren(el('p', 'adm-erreur', e.message));
  }
}

function stat(label, valeur, sous) {
  const d = el('div', 'adm-stat');
  d.append(el('span', 'adm-stat-label', label), el('strong', 'adm-stat-valeur', String(valeur)));
  if (sous) d.append(el('span', 'adm-aide', sous));
  return d;
}

function afficherRallye() {
  const ins = rallye.inscriptions;
  const payees = ins.filter((i) => i.statut === 'paye');
  const attente = ins.filter((i) => i.statut === 'en_attente');
  const actives = ins.filter((i) => i.statut !== 'annule');
  const chiensPayes = payees.reduce((n, i) => n + (i.nb_chiens || 0), 0);
  const encaisse = payees.reduce((n, i) => n + Number(i.montant_chf || 0), 0);
  const aRecevoir = attente.reduce((n, i) => n + Number(i.montant_chf || 0), 0);
  const rubans = actives.flatMap((i) => i.rallye_chiens || []).reduce((a, c) => { a[c.ruban] = (a[c.ruban] || 0) + 1; return a; }, {});
  const apresEcheance = new Date() >= FIN_VIREMENT;
  const aControler = (i) => apresEcheance && i.moyen_paiement === 'virement' && i.statut === 'en_attente';

  $('rallyeStats').replaceChildren(
    stat('Inscriptions payées', payees.length),
    stat('Chiens payés', chiensPayes),
    stat('Encaissé', chf(encaisse)),
    stat('En attente', attente.length, attente.length ? `${chf(aRecevoir)} à recevoir` : null),
  );

  const r = $('rallyeRubans');
  r.replaceChildren(el('strong', null, 'Rubans demandés'));
  [['jaune', 'Jaune'], ['bleu', 'Bleu']].forEach(([k, l]) => {
    const s = el('span', 'adm-ruban');
    s.append(el('span', `adm-point adm-point-${k}`), document.createTextNode(`${l} : ${rubans[k] || 0}`));
    r.append(s);
  });
  r.append(el('span', 'adm-aide', 'Payées et en attente, hors annulées. Le ruban peut encore changer sur place.'));

  const nbCtrl = ins.filter(aControler).length;
  montrer('rallyeAlerte', nbCtrl > 0);
  if (nbCtrl) $('rallyeAlerte').textContent = `${nbCtrl} virement${nbCtrl > 1 ? 's' : ''} toujours en attente alors que l'échéance du 12 mars est passée. Contrôle le compte PostFinance avant le rallye.`;

  document.querySelectorAll('.adm-filtre').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filtre === rallye.filtre)));
  const visibles = rallye.filtre === 'tous' ? ins : ins.filter((i) => i.statut === rallye.filtre);
  const liste = $('rallyeListe');
  liste.replaceChildren();
  if (!visibles.length) {
    liste.append(el('p', 'adm-carte adm-aide', `Aucune inscription${rallye.filtre !== 'tous' ? ' avec ce statut' : ''}.`));
    return;
  }
  visibles.forEach((i) => {
    const c = el('div', `adm-carte adm-inscription${aControler(i) ? ' adm-rouge' : ''}`);
    const tete = el('div', 'adm-tete');
    const qui = el('div');
    const nom = el('strong', null, `${i.prenom} ${i.nom}`);
    qui.append(nom, el('span', 'adm-aide', ` n° ${i.numero}`), el('div', 'adm-aide', [i.telephone, i.email, `${i.npa || ''} ${i.localite || ''}`.trim()].filter(Boolean).join(' · ')));
    const etat = el('div', 'adm-droite');
    etat.append(el('span', `adm-statut adm-statut-${i.statut}`, STATUTS[i.statut] || i.statut), el('div', 'adm-aide', `Inscrit le ${fmtDate(i.created_at)}`));
    tete.append(qui, etat);
    c.append(tete);

    const infos = [`${i.nb_chiens} chien${i.nb_chiens > 1 ? 's' : ''}`, chf(i.montant_chf), i.moyen_paiement === 'twint' ? 'TWINT' : 'Virement'];
    if (i.reference_scor) infos.push(`Réf. ${i.reference_scor}`);
    if (i.paye_le) infos.push(`Payé le ${fmtDate(i.paye_le)}`);
    if (i.parcours_prevu) infos.push(`Parcours : ${PARCOURS[i.parcours_prevu] || i.parcours_prevu}`);
    c.append(el('p', 'adm-infos', infos.join(' · ')));

    const chiens = el('div', 'adm-chiens');
    (i.rallye_chiens || []).forEach((ch) => {
      const s = el('span', 'adm-chien');
      s.append(el('span', `adm-point adm-point-${ch.ruban}`), document.createTextNode(`${ch.nom}${ch.race ? ` (${ch.race})` : ''} · ${ch.ruban}`));
      chiens.append(s);
    });
    c.append(chiens);
    if (i.note_admin) c.append(el('p', 'adm-aide', i.note_admin));

    if (i.moyen_paiement === 'virement' && i.statut === 'en_attente') {
      const b = el('button', 'adm-btn adm-btn-vert', 'Virement reçu');
      b.type = 'button';
      b.addEventListener('click', async () => {
        const ok = window.confirm(`Confirmer la réception du virement de ${i.prenom} ${i.nom} (${chf(i.montant_chf)}, réf. ${i.reference_scor || 'sans'}) ?\n\nL'inscription passe en payée et un email de confirmation part tout de suite.`);
        if (!ok) return;
        b.disabled = true;
        b.textContent = 'Envoi…';
        try {
          await appelerRallye({ action: 'virement_recu', id: i.id });
          message(`Virement de ${i.prenom} ${i.nom} enregistré, confirmation envoyée.`, 'ok');
          await chargerRallye();
        } catch (e) {
          message(e.message, 'erreur');
          b.disabled = false;
          b.textContent = 'Virement reçu';
        }
      });
      c.append(b);
    }
    liste.append(c);
  });
}

document.querySelectorAll('.adm-filtre').forEach((b) => b.addEventListener('click', () => { rallye.filtre = b.dataset.filtre; afficherRallye(); }));
$('rallyeActualiser').addEventListener('click', chargerRallye);

function toCsv(rows) {
  if (!rows.length) return '';
  const entetes = Object.keys(rows[0]);
  const cellule = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // pas de formule dans le tableur
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [entetes.join(';'), ...rows.map((r) => entetes.map((h) => cellule(r[h])).join(';'))].join('\r\n');
}

$('rallyeCsv').addEventListener('click', () => {
  const actives = rallye.inscriptions.filter((i) => i.statut !== 'annule');
  const rows = [...actives]
    .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))
    .flatMap((i) => (i.rallye_chiens || []).map((c) => ({
      'N°': i.numero, Nom: i.nom, Prénom: i.prenom, Téléphone: i.telephone,
      Chien: c.nom, Race: c.race || '', Ruban: c.ruban === 'jaune' ? 'Jaune' : 'Bleu',
      Statut: STATUTS[i.statut] || i.statut, Paiement: i.moyen_paiement === 'twint' ? 'TWINT' : 'Virement',
      'Montant inscription': Number(i.montant_chf), Parcours: PARCOURS[i.parcours_prevu] || '',
    })));
  const csv = toCsv(rows);
  if (!csv) { message('Aucune inscription à exporter.', 'info'); return; }
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = el('a');
  a.href = url;
  a.download = `rallye-2027-liste-accueil-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ── Soirées ───────────────────────────────────────────────────────────
// Lecture et écriture directes (règles d'accès admin sur digital_products,
// webinar_access, user_purchases et le bucket digital-products), envois par
// soiree-emails. Même fonctionnement que l'onglet Soirées de l'app.
const soirees = { liste: [], acces: {}, inscrites: {}, ouverte: null };

const fmtDateHeure = (iso) => (iso ? new Date(iso).toLocaleString('fr-CH', {
  weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich',
}) : 'sans date');
const pad = (n) => String(n).padStart(2, '0');
function versChampDateHeure(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function versChampDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// Fin du replay : fin de journée, la cliente garde tout le dernier jour.
const finDeJournee = (v) => (v ? new Date(`${v}T23:59:59`).toISOString() : null);
const jPlus7 = (iso) => { if (!iso) return ''; const d = new Date(iso); d.setDate(d.getDate() + 7); return versChampDate(d.toISOString()); };

async function chargerSoirees() {
  const zone = $('soireesListe');
  zone.replaceChildren(el('p', 'adm-aide', 'Chargement…'));
  const { data, error } = await sb.from('digital_products').select('*').eq('category', 'soiree')
    .order('event_date', { ascending: true, nullsFirst: true });
  if (error) { zone.replaceChildren(el('p', 'adm-erreur', error.message)); return; }
  soirees.liste = data || [];
  const ids = soirees.liste.map((x) => x.id);
  soirees.acces = {}; soirees.inscrites = {};
  if (ids.length) {
    const [{ data: acc }, { data: achats }] = await Promise.all([
      sb.from('webinar_access').select('*').in('product_id', ids),
      sb.from('user_purchases').select('product_id').eq('status', 'paid').in('product_id', ids),
    ]);
    (acc || []).forEach((a) => { soirees.acces[a.product_id] = a; });
    (achats || []).forEach((a) => { soirees.inscrites[a.product_id] = (soirees.inscrites[a.product_id] || 0) + 1; });
  }
  afficherSoirees();
}

function puce(texte, genre) { return el('span', `adm-statut adm-puce-${genre}`, texte); }

function afficherSoirees() {
  const zone = $('soireesListe');
  zone.replaceChildren();
  // À venir d'abord (la plus proche en tête), puis les passées, la plus récente en tête.
  const maintenant = Date.now();
  const avenir = soirees.liste.filter((x) => !x.event_date || new Date(x.event_date).getTime() > maintenant - 12 * 3600 * 1000);
  const passees = soirees.liste.filter((x) => !avenir.includes(x)).reverse();
  [['À venir', avenir], ['Passées', passees]].forEach(([titre, liste]) => {
    if (!liste.length) return;
    zone.append(el('h2', 'adm-sous-titre', titre));
    liste.forEach((x) => zone.append(carteSoiree(x)));
  });
}

function carteSoiree(x) {
  const a = soirees.acces[x.id] || {};
  const n = soirees.inscrites[x.id] || 0;
  const c = el('div', 'adm-carte adm-soiree');
  const tete = el('div', 'adm-tete');
  const qui = el('div');
  qui.append(el('strong', 'adm-soiree-titre', x.title), el('div', 'adm-aide', fmtDateHeure(x.event_date)));
  const puces = el('div', 'adm-puces');
  puces.append(puce(`${n} inscrite${n > 1 ? 's' : ''}`, 'neutre'));
  if (x.event_cancelled) puces.append(puce('Annulée', 'rouge'));
  else puces.append(puce(x.is_published ? 'Publiée' : 'Brouillon', x.is_published ? 'vert' : 'ambre'));
  puces.append(puce(a.zoom_url ? 'Zoom ✓' : 'Zoom manquant', a.zoom_url ? 'vert' : 'rouge'));
  puces.append(puce(x.file_path ? 'Fiche récap ✓' : 'Fiche récap manquante', x.file_path ? 'vert' : 'ambre'));
  if (a.replay_url) {
    const fin = a.replay_expires_at && new Date(a.replay_expires_at);
    puces.append(puce(fin && fin < new Date() ? 'Replay terminé' : `Replay ✓${fin ? ` jusqu'au ${fin.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })}` : ''}`, fin && fin < new Date() ? 'neutre' : 'vert'));
  }
  tete.append(qui);
  c.append(tete, puces);

  const actions = el('div', 'adm-actions adm-actions-soiree');
  const bModif = el('button', 'adm-btn', soirees.ouverte === x.id ? 'Fermer' : 'Modifier'); bModif.type = 'button';
  bModif.addEventListener('click', () => { soirees.ouverte = soirees.ouverte === x.id ? null : x.id; afficherSoirees(); });
  const bInscr = el('button', 'adm-btn adm-btn-clair', 'Inscrites'); bInscr.type = 'button';
  const bFiche = el('button', 'adm-btn adm-btn-clair', 'Envoyer la fiche récap'); bFiche.type = 'button';
  const bReplay = el('button', 'adm-btn adm-btn-clair', 'Envoyer le replay'); bReplay.type = 'button';
  actions.append(bModif, bInscr, bFiche, bReplay);
  c.append(actions);
  const retour = el('p', 'adm-ligne'); retour.hidden = true; c.append(retour);
  const dire = (texte, ok) => { retour.textContent = texte; retour.className = `adm-ligne ${ok ? 'adm-ok' : 'adm-ko'}`; retour.hidden = false; };

  bFiche.addEventListener('click', () => envoyerSoiree(x, 'lendemain', bFiche, dire));
  bReplay.addEventListener('click', () => {
    if (!a.replay_url) { dire('Renseigne d\'abord le lien du replay dans « Modifier ».', false); return; }
    envoyerSoiree(x, 'replay', bReplay, dire);
  });
  const zoneInscr = el('div', 'adm-inscrites'); zoneInscr.hidden = true; c.append(zoneInscr);
  bInscr.addEventListener('click', () => basculerInscrites(x, zoneInscr));

  if (soirees.ouverte === x.id) c.append(formulaireSoiree(x, a));
  return c;
}

async function envoyerSoiree(x, action, bouton, dire) {
  const n = soirees.inscrites[x.id] || 0;
  const quoi = action === 'replay' ? 'le lien personnel du replay' : 'la fiche récap (et le replay s\'il est prêt)';
  if (!window.confirm(`Envoyer ${quoi} de « ${x.title} » aux ${n} inscrite(s) ?\n\nCelles qui l'ont déjà reçu ne le recevront pas deux fois.`)) return;
  bouton.disabled = true;
  try {
    const { data, error } = await sb.functions.invoke('soiree-emails', { body: { action, product_id: x.id } });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    if (data.sent > 0) dire(`Envoyé à ${data.sent} inscrite(s)${action === 'lendemain' && data.replay === 'pret' ? ', avec le replay' : ''}.`, true);
    else if (action === 'replay' || data.dejaTous) dire('Personne de nouveau à prévenir : toutes l\'ont déjà reçu.', true);
    else dire(`Rien envoyé : ${data.raison || 'raison inconnue'}.`, false);
  } catch (e) {
    dire(`Envoi impossible : ${e.message}`, false);
  } finally {
    bouton.disabled = false;
  }
}

async function basculerInscrites(x, zone) {
  if (!zone.hidden) { zone.hidden = true; return; }
  zone.hidden = false;
  zone.replaceChildren(el('p', 'adm-aide', 'Chargement…'));
  const { data, error } = await sb.from('user_purchases')
    .select('paid_at, amount_chf, guest_email, profile:profiles(full_name, email)')
    .eq('product_id', x.id).eq('status', 'paid').order('paid_at', { ascending: true });
  if (error) { zone.replaceChildren(el('p', 'adm-erreur', error.message)); return; }
  const lignes = (data || []).map((p) => ({
    Nom: (p.profile && p.profile.full_name) || '',
    Email: (p.profile && p.profile.email) || p.guest_email || '',
    'Payé le': p.paid_at ? new Date(p.paid_at).toLocaleDateString('fr-CH') : '',
    'Montant CHF': p.amount_chf != null ? Number(p.amount_chf).toFixed(2) : '',
  }));
  zone.replaceChildren();
  if (!lignes.length) { zone.append(el('p', 'adm-aide', 'Aucune inscrite payée.')); return; }
  const ul = el('ul', 'adm-liste-inscrites');
  lignes.forEach((l) => ul.append(el('li', null, `${l.Nom ? `${l.Nom} · ` : ''}${l.Email} · ${l['Payé le']}`)));
  const b = el('button', 'adm-btn adm-btn-clair', 'Télécharger la liste (CSV)'); b.type = 'button';
  b.addEventListener('click', () => telechargerCsv(lignes, `inscrites-${x.slug}-${new Date().toISOString().slice(0, 10)}.csv`));
  zone.append(ul, b);
}

function telechargerCsv(rows, nom) {
  const csv = toCsv(rows);
  if (!csv) return;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = el('a'); a.href = url; a.download = nom;
  document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function champ(etiquette, input, aide) {
  const l = el('label', 'adm-champ');
  l.append(el('span', 'adm-champ-nom', etiquette), input);
  if (aide) l.append(el('span', 'adm-aide', aide));
  return l;
}
function entree(type, valeur, attrs = {}) {
  const i = document.createElement('input');
  i.type = type; i.value = valeur || '';
  Object.entries(attrs).forEach(([k, v]) => i.setAttribute(k, v));
  return i;
}

function formulaireSoiree(x, a) {
  const f = el('form', 'adm-form');
  const date = entree('datetime-local', versChampDateHeure(x.event_date));
  const zoom = entree('url', a.zoom_url, { placeholder: 'https://us06web.zoom.us/j/…' });
  const replay = entree('url', a.replay_url, { placeholder: 'https://youtu.be/… (vidéo non répertoriée)' });
  const code = entree('text', a.replay_code, { placeholder: 'seulement pour un replay Zoom' });
  const fin = entree('date', versChampDate(a.replay_expires_at) || jPlus7(x.event_date));
  const publiee = entree('checkbox'); publiee.checked = !!x.is_published;
  const annulee = entree('checkbox'); annulee.checked = !!x.event_cancelled;
  const pdf = entree('file', '', { accept: 'application/pdf,.pdf' });
  let cheminPdf = x.file_path || null;
  const etatPdf = el('span', 'adm-aide', cheminPdf ? 'Une fiche récap est déposée. En choisir une autre la remplace.' : 'Aucune fiche récap déposée.');
  pdf.addEventListener('change', async () => {
    const fichier = pdf.files && pdf.files[0];
    if (!fichier) return;
    etatPdf.textContent = 'Envoi du PDF…';
    try {
      const contenu = new Blob([await fichier.arrayBuffer()], { type: 'application/pdf' });
      const chemin = `soirees/${x.slug}-support-${Date.now()}.pdf`;
      const { error } = await sb.storage.from('digital-products').upload(chemin, contenu, { upsert: true, contentType: 'application/pdf' });
      if (error) throw error;
      cheminPdf = chemin;
      etatPdf.textContent = 'PDF déposé. Pense à enregistrer.';
    } catch (e) {
      etatPdf.textContent = `Envoi impossible : ${e.message}. Si le fichier vient de Drive, télécharge-le d'abord sur le téléphone.`;
    }
  });

  const cases = el('div', 'adm-cases');
  const c1 = el('label', 'adm-case'); c1.append(publiee, document.createTextNode(' Publiée (en vente sur le site)'));
  const c2 = el('label', 'adm-case'); c2.append(annulee, document.createTextNode(' Annulée'));
  cases.append(c1, c2);

  const err = el('p', 'adm-erreur'); err.hidden = true;
  const ok = el('button', 'adm-btn', 'Enregistrer'); ok.type = 'submit';
  f.append(
    champ('Date et heure', date),
    champ('Lien Zoom de la soirée', zoom),
    champ('Lien du replay', replay, 'Colle le lien YouTube de la vidéo non répertoriée. Les inscrites reçoivent un lien personnel vers caniplus.ch/replay.'),
    champ('Code d\'accès du replay', code, 'Uniquement si le replay est un lien Zoom protégé.'),
    champ('Fin du replay', fin, 'Le replay reste visible jusqu\'à ce jour inclus. Par défaut : 7 jours après la soirée.'),
    champ('Fiche récap (PDF)', pdf, null), etatPdf, cases, err, ok,
  );
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    ok.disabled = true; ok.textContent = 'Enregistrement…';
    try {
      const { error: e1 } = await sb.from('digital_products').update({
        event_date: date.value ? new Date(date.value).toISOString() : null,
        is_published: publiee.checked,
        event_cancelled: annulee.checked,
        file_path: cheminPdf,
      }).eq('id', x.id);
      if (e1) throw e1;
      const { error: e2 } = await sb.from('webinar_access').upsert({
        product_id: x.id,
        zoom_url: zoom.value.trim() || null,
        replay_url: replay.value.trim() || null,
        replay_code: code.value.trim() || null,
        replay_expires_at: finDeJournee(fin.value),
      });
      if (e2) throw e2;
      soirees.ouverte = null;
      message(`« ${x.title} » enregistrée.`, 'ok');
      await chargerSoirees();
    } catch (e3) {
      err.textContent = `Enregistrement impossible : ${e3.message}`;
      err.hidden = false;
      ok.disabled = false; ok.textContent = 'Enregistrer';
    }
  });
  return f;
}

// ── Adhésions ─────────────────────────────────────────────────────────
// Passent par validate-adhesion (via admin-auth-proxy, comme l'app) : la
// validation crée le compte et envoie le lien d'activation.
const STATUTS_ADH = { en_attente: 'En attente', validee: 'Validée', refusee: 'Refusée' };

async function appelerAdhesion(action, payload = null) {
  const { data, error } = await sb.functions.invoke('admin-auth-proxy', { body: { target: 'validate-adhesion', action, payload } });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch (_e) { /* corps illisible */ }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

async function chargerAdhesions() {
  const zone = $('adhesionsListe');
  zone.replaceChildren(el('p', 'adm-aide', 'Chargement…'));
  try {
    const data = await appelerAdhesion('list');
    const liste = (data.adhesions || []).sort((a, b) => (a.statut === 'en_attente' ? 0 : 1) - (b.statut === 'en_attente' ? 0 : 1));
    zone.replaceChildren();
    if (!liste.length) { zone.append(el('p', 'adm-carte adm-aide', 'Aucune demande d\'adhésion.')); return; }
    liste.forEach((a) => zone.append(carteAdhesion(a)));
  } catch (e) {
    zone.replaceChildren(el('p', 'adm-erreur', e.message));
  }
}

function carteAdhesion(a) {
  const c = el('div', `adm-carte adm-adhesion${a.statut === 'en_attente' ? ' adm-a-traiter' : ''}`);
  const tete = el('div', 'adm-tete');
  const qui = el('div');
  qui.append(el('strong', null, `${a.prenom} ${a.nom}`),
    el('div', 'adm-aide', [a.email, a.telephone, a.npa_localite].filter(Boolean).join(' · ')));
  const etat = el('div', 'adm-droite');
  etat.append(puce(STATUTS_ADH[a.statut] || a.statut, a.statut === 'en_attente' ? 'ambre' : a.statut === 'validee' ? 'vert' : 'neutre'),
    el('div', 'adm-aide', `Reçue le ${fmtDate(a.created_at)}`));
  tete.append(qui, etat);
  c.append(tete);
  const chiens = el('div', 'adm-chiens');
  (a.adhesion_chiens || []).forEach((ch) => chiens.append(el('span', 'adm-chien',
    `${ch.nom}${ch.race ? ` (${ch.race})` : ''}${ch.vaccins_a_jour === false ? ' · vaccins pas à jour' : ''}`)));
  c.append(chiens);
  if (a.motif_refus) c.append(el('p', 'adm-aide', `Motif du refus : ${a.motif_refus}`));

  const actions = el('div', 'adm-actions adm-actions-soiree');
  const retour = el('p', 'adm-ligne'); retour.hidden = true;
  const dire = (t, ok) => { retour.textContent = t; retour.className = `adm-ligne ${ok ? 'adm-ok' : 'adm-ko'}`; retour.hidden = false; };
  if (a.attestation_rc_path) {
    const b = el('button', 'adm-btn adm-btn-clair', 'Voir l\'attestation RC'); b.type = 'button';
    b.addEventListener('click', async () => {
      const fenetre = window.open('', '_blank');
      try {
        const d = await appelerAdhesion('detail', { adhesion_id: a.id });
        if (d.attestation_url && fenetre) fenetre.location = d.attestation_url;
        else { if (fenetre) fenetre.close(); dire('Attestation introuvable.', false); }
      } catch (e) { if (fenetre) fenetre.close(); dire(e.message, false); }
    });
    actions.append(b);
  }
  if (a.statut === 'en_attente') {
    const v = el('button', 'adm-btn adm-btn-vert', 'Valider'); v.type = 'button';
    const r = el('button', 'adm-btn adm-btn-clair', 'Refuser'); r.type = 'button';
    v.addEventListener('click', async () => {
      if (!window.confirm(`Valider l'adhésion de ${a.prenom} ${a.nom} ?\n\nSon compte est créé et un email de bienvenue part avec son lien d'activation.`)) return;
      v.disabled = true;
      try {
        await appelerAdhesion('validate', { adhesion_id: a.id, valide_par: 'Tiffany' });
        message(`Adhésion de ${a.prenom} ${a.nom} validée, email envoyé.`, 'ok');
        chargerAdhesions();
      } catch (e) { dire(e.message, false); v.disabled = false; }
    });
    r.addEventListener('click', async () => {
      const motif = window.prompt(`Refuser l'adhésion de ${a.prenom} ${a.nom}.\n\nMotif (facultatif, il figure dans l'email envoyé) :`, '');
      if (motif === null) return;
      r.disabled = true;
      try {
        await appelerAdhesion('refuse', { adhesion_id: a.id, motif: motif.trim() || null, valide_par: 'Tiffany' });
        message(`Adhésion de ${a.prenom} ${a.nom} refusée, email envoyé.`, 'ok');
        chargerAdhesions();
      } catch (e) { dire(e.message, false); r.disabled = false; }
    });
    actions.append(v, r);
  }
  c.append(actions, retour);
  return c;
}

verifier();
