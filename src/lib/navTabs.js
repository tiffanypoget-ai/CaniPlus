// src/lib/navTabs.js
// Liste des onglets de la navigation principale, partagée entre BottomNav
// (mobile) et Sidebar (desktop) pour éviter que les deux listes divergent.
//
// 4 onglets grand public : Accueil · Apprendre · Premium · Profil.
// L'onglet Premium (id historique 'fiches') pointe vers RessourcesScreen :
// fiches pratiques, vidéos et articles réservés aux abonnés premium.
// L'écran Mon chien (profils + vaccins) reste accessible depuis le Profil.
// Un onglet peut dépendre d'un drapeau de features.js via sa clé `enabled` :
// il n'apparaît que si le drapeau vaut true. Aujourd'hui :
//  - Planning (cours du club) : CLUB_PLANNING_ENABLED, et membres/admins
//    seulement, les inscriptions aux cours passant par WhatsApp.
//  - Défis : DEFIS_ENABLED, fermé faute d'usage.
// La Boutique reste accessible depuis l'Accueil et le Profil (hors nav).
import { CLUB_PLANNING_ENABLED, DEFIS_ENABLED } from './features';

const ALL_TABS = [
  { id: 'home',      label: 'Accueil',   icon: 'home',     roles: ['member', 'external', 'admin'] },
  { id: 'apprendre', label: 'Apprendre', icon: 'book',     roles: ['member', 'external', 'admin'] },
  { id: 'fiches',    label: 'Premium',   icon: 'sparkle',  roles: ['member', 'external', 'admin'] },
  { id: 'planning',  label: 'Planning',  icon: 'calendar', roles: ['member', 'admin'],             enabled: CLUB_PLANNING_ENABLED },
  { id: 'defis',     label: 'Défis',     icon: 'trophy',   roles: ['member', 'external', 'admin'], enabled: DEFIS_ENABLED },
  { id: 'profil',    label: 'Profil',    icon: 'user',     roles: ['member', 'external', 'admin'] },
];

export function visibleTabs(userType = 'member') {
  return ALL_TABS.filter(t => t.roles.includes(userType) && t.enabled !== false);
}
