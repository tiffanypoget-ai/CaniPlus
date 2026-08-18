// src/lib/navTabs.js
// Liste des onglets de la navigation principale, partagée entre BottomNav
// (mobile) et Sidebar (desktop) pour éviter que les deux listes divergent.
//
// 5 onglets grand public : Accueil · Apprendre · Premium · Défis · Profil.
// L'onglet Premium (id historique 'fiches') pointe vers RessourcesScreen :
// fiches pratiques, vidéos et articles réservés aux abonnés premium.
// L'écran Mon chien (profils + vaccins) reste accessible depuis le Profil.
// L'onglet Planning (cours du club) n'apparaît que si la gestion des cours se
// fait dans l'app (CLUB_PLANNING_ENABLED) ET pour les membres/admins — les
// inscriptions aux cours passant par WhatsApp, il est masqué.
// La Boutique reste accessible depuis l'Accueil et le Profil (hors nav).
import { CLUB_PLANNING_ENABLED } from './features';

const ALL_TABS = [
  { id: 'home',      label: 'Accueil',   icon: 'home',     roles: ['member', 'external', 'admin'], club: false },
  { id: 'apprendre', label: 'Apprendre', icon: 'book',     roles: ['member', 'external', 'admin'], club: false },
  { id: 'fiches',    label: 'Premium',   icon: 'sparkle',  roles: ['member', 'external', 'admin'], club: false },
  { id: 'planning',  label: 'Planning',  icon: 'calendar', roles: ['member', 'admin'],             club: true },
  { id: 'defis',     label: 'Défis',     icon: 'trophy',   roles: ['member', 'external', 'admin'], club: false },
  { id: 'profil',    label: 'Profil',    icon: 'user',     roles: ['member', 'external', 'admin'], club: false },
];

export function visibleTabs(userType = 'member') {
  return ALL_TABS.filter(t => t.roles.includes(userType) && (!t.club || CLUB_PLANNING_ENABLED));
}
