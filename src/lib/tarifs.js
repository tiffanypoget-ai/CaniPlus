// src/lib/tarifs.js
// Tarifs CaniPlus centralisés.
//
// Cotisation cours de groupe :
//   - Jusqu'au 29 juin 2026 : 150 CHF / an / chien (tarif unique)
//   - Dès le 30 juin 2026 : 75 CHF / chien, pour les nouvelles inscriptions
//     en cours d'année (demi-année, tarif unique)
//
// Dès 2027 (acté au PV constitutif, annonce aux membres prévue automne 2026) :
//   barème dégressif selon le nombre de chiens du même foyer (= même adresse)
//   inscrits au club — 1er chien 200 CHF · 2e 150 CHF · 3e et suivants 100 CHF.
//   ⚠️ La bascule technique vers ce barème N'EST PAS programmée : Tiffany
//   décidera de ses modalités le moment venu. Les constantes ci-dessous ne
//   servent qu'à l'affichage informatif.
//
// Pour changer les montants ou la date, modifier uniquement les constantes.

export const COTISATION_BASCULE = new Date('2026-06-30T00:00:00+02:00');
export const COTISATION_PRIX_AVANT = 150; // CHF / an / chien
export const COTISATION_PRIX_APRES = 75;  // CHF / chien, nouvelles inscriptions dès le 30 juin 2026

// Barème 2027 — INFORMATIF uniquement (pas de bascule automatique programmée)
export const COTISATION_BAREME_2027 = [200, 150, 100]; // 1er, 2e, 3e chien et suivants du même foyer

/**
 * Prix de la cotisation (CHF / chien) à une date donnée.
 * @param {Date|string|number} [date] - date de référence (par défaut : maintenant).
 *   Pour un paiement passé (admin), passer sa date de paiement pour garder le bon montant.
 * @returns {number} 150 avant la bascule, 75 à partir du 30 juin 2026.
 */
export function cotisationPrix(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return COTISATION_PRIX_AVANT;
  return d >= COTISATION_BASCULE ? COTISATION_PRIX_APRES : COTISATION_PRIX_AVANT;
}

/**
 * Total de la cotisation pour nbChiens chiens (tarif unique par chien en 2026).
 * @param {number} nbChiens
 * @param {Date|string|number} [date]
 * @returns {number} CHF.
 */
export function cotisationTotal(nbChiens, date = new Date()) {
  const n = Math.max(Number(nbChiens) || 0, 0);
  return cotisationPrix(date) * n;
}

/**
 * Phrase prête à afficher décrivant la cotisation à une date donnée
 * (avec mention informative du barème 2027).
 * @param {Date|string|number} [date]
 * @returns {string}
 */
export function cotisationDescription(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const when = isNaN(d.getTime()) ? new Date() : d;
  if (when < COTISATION_BASCULE) {
    return '150 CHF par an et par chien (dès 2027 : 200 CHF pour le 1er chien du foyer, 150 CHF pour le 2e, 100 CHF dès le 3e)';
  }
  return '75 CHF par chien pour une inscription en cours d\'année (dès 2027 : 200 CHF pour le 1er chien du foyer, 150 CHF pour le 2e, 100 CHF dès le 3e)';
}
