// src/hooks/useCloseOnBack.js
// -----------------------------------------------------------------------------
// Ferme les vues plein écran (soirées, détail d'un défi, jour de défi, article…)
// avec le bouton retour du téléphone, au lieu de changer d'onglet.
//
// Fonctionnement : chaque vue ouverte s'enregistre dans une pile globale.
// useBackNavigation (qui écoute déjà popstate pour les onglets) consulte cette
// pile en premier : si une vue est ouverte, le retour la ferme et l'entrée
// d'historique consommée est ré-injectée — la navigation par onglets reste
// intacte. Si la vue est fermée par son bouton UI, elle se désinscrit
// simplement, sans toucher à l'historique.
// -----------------------------------------------------------------------------

import { useEffect, useRef } from 'react';

const stack = [];

// Consommé par useBackNavigation : ferme la vue du dessus s'il y en a une.
export function popOverlay() {
  const close = stack.pop();
  if (close) {
    close();
    return true;
  }
  return false;
}

export function useCloseOnBack(open, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const closer = () => closeRef.current?.();
    stack.push(closer);
    return () => {
      const i = stack.lastIndexOf(closer);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [open]);
}
