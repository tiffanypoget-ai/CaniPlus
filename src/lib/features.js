// src/lib/features.js
// Feature flags de l'app.
//
// CLUB_ENABLED — fonctionnalités "club canin" (adhésion, cotisation,
// cours collectifs/théoriques, absences hebdomadaires, planning club).
// Piloté par la variable d'environnement REACT_APP_CLUB_FEATURES
// (à définir dans Vercel → Settings → Environment Variables).
// Par défaut : false — l'app est grand public, le club est géré via WhatsApp.
// Aucun code club n'est supprimé : tout est simplement masqué quand le flag
// est à false, pour pouvoir réactiver en remettant la variable à "true".
export const CLUB_ENABLED = import.meta.env.REACT_APP_CLUB_FEATURES === 'true';
