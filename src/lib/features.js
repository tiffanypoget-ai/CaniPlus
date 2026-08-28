// src/lib/features.js
// Feature flags de l'app.
//
// Deux notions distinctes, à ne pas confondre :
//
//  1. CLUB_ENABLED — le club existe.
//     Inscription au club depuis l'app (choix du type de compte, coordonnées +
//     fiche chien complète), liste clients et son export, cotisation, mentions
//     « Ballaigues », sections club du site vitrine.
//     Actif par défaut : mettre REACT_APP_CLUB_FEATURES=false pour tout couper.
//
//  2. CLUB_PLANNING_ENABLED — la GESTION DES COURS se fait dans l'app.
//     Planning hebdomadaire, inscriptions aux cours, « Je viens », absences,
//     rappels de cours, accueil « club » (par opposition à l'accueil grand
//     public).
//     Désactivé : les inscriptions aux cours passent par WhatsApp, l'app ne
//     tient pas le planning. On garde donc l'inscription AU club sans afficher
//     un planning que personne ne remplit.
//
// Aucun code n'est supprimé : tout est masqué par ces flags, pour pouvoir
// réactiver en repassant la constante à true.
export const CLUB_ENABLED = import.meta.env.REACT_APP_CLUB_FEATURES !== 'false';

export const CLUB_PLANNING_ENABLED = false;

//  3. MESSAGERIE_ENABLED — le chat membre ↔ admin dans l'app.
//     Bouton flottant (ChatFab), fil de discussion, composeur, compteur de
//     non lus. Désactivé : le contact passe par WhatsApp. Le bouton flottant
//     devient un lien WhatsApp (WhatsAppFab), l'onglet Messagerie de l'admin
//     reste consultable en lecture seule, l'historique en base est conservé.
export const MESSAGERIE_ENABLED = false;
