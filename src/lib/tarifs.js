// src/lib/tarifs.js
// Tarifs CaniPlus centralisés.
//
// Cotisation cours de groupe :
//   - 150 CHF / an / chien jusqu'au 29 juin 2026
//   - 75 CHF / an / chien à partir du 30 juin 2026 (minuit, heure suisse)
//
// La cotisation reste annuelle et par chien (1 cours de groupe/semaine).
// C'est une vraie baisse de prix de 50 %.
//
// Pour décaler la bascule (ex. 1er juillet) ou changer les montants,
// modifier uniquement les trois constantes ci-dessous.

export const COTISATION_BASCULE = new Date('2026-06-30T00:00:00+02:00');
export const COTISATION_PRIX_AVANT = 150;
export const COTISATION_PRIX_APRES = 75;

/**
 * Prix de la cotisation cours de groupe (CHF / an / chien) à une date donnée.
 * @param {Date|string|number} [date] - date de référence (par défaut : maintenant).
 *   Pour un paiement à venir, laisser vide. Pour afficher le montant d'un
 *   paiement passé (admin), passer sa date de paiement pour garder le bon montant.
 * @returns {number} 150 avant la bascule, 75 à partir de la bascule.
 */
export function cotisationPrix(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return COTISATION_PRIX_AVANT;
  return d >= COTISATION_BASCULE ? COTISATION_PRIX_APRES : COTISATION_PRIX_AVANT;
}
