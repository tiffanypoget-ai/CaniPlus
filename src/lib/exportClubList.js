// src/lib/exportClubList.js
// Génère la liste clients du club au format tableur, à partir des données déjà
// chargées par l'onglet Membres de l'admin (profils + chiens + abonnements).
//
// Les colonnes reprennent exactement le fichier Excel tenu à la main jusqu'ici,
// plus les deux informations demandées en plus : assurance RC privée et état
// des vaccins.
//
// Une ligne par chien. Contrairement au fichier manuel, le propriétaire est
// répété sur chaque ligne plutôt que laissé vide : c'est ce qui permet de trier
// et filtrer dans Excel sans casser l'association propriétaire ↔ chien.
// Un propriétaire sans chien apparaît quand même, avec les colonnes chien vides.

const SEXE_LABELS = { M: 'Mâle', F: 'Femelle' };

// Format suisse jj.mm.aaaa — les dates ISO sont mal interprétées par Excel FR.
function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtAdresse(profile) {
  const ville = [profile?.postal_code, profile?.city].filter(Boolean).join(' ');
  return [profile?.street_address, ville].filter(Boolean).join(', ');
}

function fmtBool(value, ouiLabel = 'Oui', nonLabel = 'Non') {
  if (value === null || value === undefined) return '';
  return value ? ouiLabel : nonLabel;
}

/**
 * État des vaccins d'un chien à partir de dogs.vaccines
 * ([{ name, last_date, next_due_date }]).
 *
 * Retourne { statut, retards } :
 *   statut  = 'Oui' | 'Non' | 'Non renseigné'
 *   retards = liste lisible des rappels dépassés (vide si tout est bon)
 */
export function etatVaccins(dog, today = new Date()) {
  const vaccines = Array.isArray(dog?.vaccines) ? dog.vaccines : [];
  const renseignes = vaccines.filter(v => v?.last_date || v?.next_due_date);
  if (renseignes.length === 0) return { statut: 'Non renseigné', retards: '' };

  const enRetard = renseignes.filter(v => {
    if (!v.next_due_date) return false;
    const due = new Date(v.next_due_date);
    return !Number.isNaN(due.getTime()) && due < today;
  });

  if (enRetard.length === 0) return { statut: 'Oui', retards: '' };
  return {
    statut: 'Non',
    retards: enRetard.map(v => `${v.name} (échu le ${fmtDate(v.next_due_date)})`).join(' · '),
  };
}

/**
 * Construit les lignes de la liste clients.
 *
 * @param members       profils (action admin list_members)
 * @param dogs          chiens (action admin list_dogs)
 * @param subscriptions abonnements (action admin list_subscriptions)
 * @param year          année de cotisation à afficher
 */
export function buildClubRows(members, dogs, subscriptions, year = new Date().getFullYear()) {
  // Cotisation de l'année : un membre est "Fait" dès qu'il a une cotisation payée.
  const cotisations = new Map();
  for (const sub of subscriptions ?? []) {
    if (sub?.type !== 'cotisation_annuelle' || sub?.year !== year) continue;
    const actuel = cotisations.get(sub.user_id);
    // 'paid' l'emporte sur un éventuel 'pending' ou 'cancelled' de la même année.
    if (sub.status === 'paid' || !actuel) cotisations.set(sub.user_id, sub.status);
  }

  const dogsByOwner = new Map();
  for (const dog of dogs ?? []) {
    if (!dog?.owner_id) continue;
    if (!dogsByOwner.has(dog.owner_id)) dogsByOwner.set(dog.owner_id, []);
    dogsByOwner.get(dog.owner_id).push(dog);
  }

  // Seuls les inscrits au club : les comptes grand public ne remplissent pas
  // ces champs et n'ont rien à faire dans la liste clients.
  const clubMembers = (members ?? [])
    .filter(m => m?.user_type === 'member')
    .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'fr'));

  const rows = [];
  for (const m of clubMembers) {
    const cotisation = cotisations.get(m.id);
    const base = {
      'Nom et prénom du propriétaire': m.full_name ?? '',
      'Adresse': fmtAdresse(m),
      'Téléphone': m.phone ?? '',
      'Email': m.email ?? '',
    };
    const fin = {
      'Droit à l\'image': fmtBool(m.image_rights, 'Autorise', 'Refuse'),
      'Facture': m.invoice_method === 'papier' ? 'Papier' : m.invoice_method === 'mail' ? 'Mail' : '',
      [`Cotisation ${year}`]: cotisation === 'paid' ? 'Fait' : cotisation ? 'En attente' : '',
      'Présent l\'année prochaine': fmtBool(m.renewal_next_year, 'ok', 'non'),
      'Assurance RC privée': fmtBool(m.has_rc_insurance),
    };

    const sesChiens = dogsByOwner.get(m.id) ?? [];
    if (sesChiens.length === 0) {
      rows.push({
        ...base,
        'Nom du chien': '', 'Race': '', 'Sexe': '', 'Etat': '', 'Numéro de puce': '',
        'Date d\'acquisition': '', 'Date de naissance': '', 'Provenance': '',
        ...fin,
        'Vaccins à jour': '', 'Vaccins en retard': '',
      });
      continue;
    }

    for (const d of sesChiens) {
      const vaccins = etatVaccins(d);
      rows.push({
        ...base,
        'Nom du chien': d.name ?? '',
        'Race': d.breed ?? '',
        'Sexe': SEXE_LABELS[d.sex] ?? d.sex ?? '',
        'Etat': d.reproductive_status ?? '',
        'Numéro de puce': d.chip_number ?? '',
        'Date d\'acquisition': fmtDate(d.acquisition_date),
        'Date de naissance': fmtDate(d.birth_date),
        'Provenance': d.origin_country ?? '',
        ...fin,
        'Vaccins à jour': vaccins.statut,
        'Vaccins en retard': vaccins.retards,
      });
    }
  }
  return rows;
}

// CSV séparé par points-virgules + BOM UTF-8 : c'est le format qu'Excel en
// français ouvre directement en colonnes, sans passer par l'assistant d'import.
function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Le point-virgule est le séparateur : toute cellule qui en contient (ou qui
    // contient un guillemet ou un saut de ligne) doit être échappée.
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lignes = [headers.join(';'), ...rows.map(r => headers.map(h => cell(r[h])).join(';'))];
  return '﻿' + lignes.join('\r\n');
}

/** Déclenche le téléchargement de la liste clients. Retourne le nb de lignes. */
export function downloadClubList(members, dogs, subscriptions, year = new Date().getFullYear()) {
  const rows = buildClubRows(members, dogs, subscriptions, year);
  const csv = toCsv(rows);
  if (!csv) return 0;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const jour = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `liste-clients-caniplus-${jour}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return rows.length;
}
