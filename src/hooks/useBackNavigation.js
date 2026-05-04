// src/hooks/useBackNavigation.js
// -----------------------------------------------------------------------------
// Synchronise l'onglet actif avec l'historique navigateur, pour que le bouton
// retour du téléphone (Android) ou du navigateur ramène à l'onglet précédent
// au lieu de fermer l'application.
//
// Comportement :
//   - Au montage : push une entrée sentinelle 'home' dans l'historique
//   - À chaque changement de tab via setActiveTab : push une nouvelle entrée
//   - Sur back (popstate) : restaure l'onglet précédent stocké dans state
//   - Sur 'home', un back supplémentaire ferme l'app (comportement Android natif)
//
// Pour éviter une boucle infinie : un flag interne ignore le push quand le
// changement de tab vient d'un popstate.
// -----------------------------------------------------------------------------

import { useEffect, useRef } from 'react';

export function useBackNavigation(activeTab, setActiveTab) {
  const fromPopRef = useRef(false);
  const initializedRef = useRef(false);

  // Initialisation : sentinelle dans l'historique au montage
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    // Remplace l'entrée actuelle par une sentinelle (pas push, pour ne pas
    // gonfler inutilement l'historique au tout premier render).
    try {
      window.history.replaceState({ tab: 'home' }, '');
    } catch { /* iframes ou contextes restreints : ignorer */ }
  }, []);

  // À chaque changement de tab : push une nouvelle entrée d'historique
  // sauf si le changement vient d'un popstate (sinon boucle infinie).
  useEffect(() => {
    if (fromPopRef.current) {
      fromPopRef.current = false;
      return;
    }
    if (!initializedRef.current) return;
    try {
      window.history.pushState({ tab: activeTab }, '');
    } catch { /* ignore */ }
  }, [activeTab]);

  // Écoute le retour utilisateur
  useEffect(() => {
    const onPopState = (e) => {
      const nextTab = e.state?.tab ?? 'home';
      fromPopRef.current = true; // empêche le re-push dans le useEffect ci-dessus
      setActiveTab(nextTab);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [setActiveTab]);
}
