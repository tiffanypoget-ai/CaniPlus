// src/lib/a11y.js
// Rendre utilisable au clavier une zone cliquable qui ne peut pas être un
// <button> natif, parce qu'elle contient déjà un bouton (l'imbrication est
// interdite en HTML).
//
// Partout ailleurs, préférer <button type="button"> : c'est focalisable,
// annoncé comme interactif par les lecteurs d'écran et déclenché par Entrée
// et Espace sans une ligne de code. Ici on rejoue ce comportement à la main.

/**
 * Fabrique un gestionnaire onKeyDown qui déclenche `handler` sur Entrée et
 * Espace, comme un bouton natif, et laisse passer toutes les autres touches.
 * @param {(e: KeyboardEvent) => void} [handler] - l'action du onClick.
 * @returns {((e: KeyboardEvent) => void) | undefined} undefined si pas d'action,
 *   pour que la zone reste inerte au clavier comme elle l'est à la souris.
 */
export function activateOnKey(handler) {
  if (!handler) return undefined;
  return (e) => {
    // 'Spacebar' : ancien nom de la touche Espace sur les vieux Edge/IE.
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    // Espace fait défiler la page par défaut, Entrée peut soumettre un
    // formulaire : on veut l'action de la zone, rien d'autre.
    e.preventDefault();
    handler(e);
  };
}
