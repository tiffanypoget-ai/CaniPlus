// src/components/BottomNav.js
// Barre de navigation mobile — 5 onglets grand public :
// Accueil · Apprendre (blog) · Fiches (ressources) · Mon chien · Profil.
// L'onglet Planning (cours du club) n'apparaît que si le flag club est actif
// (REACT_APP_CLUB_FEATURES=true) ET pour les membres/admins.
// Les icônes viennent du composant Icon partagé (src/components/Icons.js),
// comme pour la Sidebar desktop.
import { icons as iconLib } from './Icons';
import { CLUB_ENABLED } from '../lib/features';

const Icon = ({ name, size = 22, color }) => {
  const renderer = iconLib[name];
  if (!renderer) return null;
  return renderer({ size, color });
};

export default function BottomNav({ active, onNavigate, userType = 'member' }) {
  const allTabs = [
    { id: 'home',      label: 'Accueil',   icon: 'home',     roles: ['member', 'external', 'admin'], club: false },
    { id: 'apprendre', label: 'Apprendre', icon: 'book',     roles: ['member', 'external', 'admin'], club: false },
    { id: 'fiches',    label: 'Fiches',    icon: 'fileText', roles: ['member', 'external', 'admin'], club: false },
    { id: 'planning',  label: 'Planning',  icon: 'calendar', roles: ['member', 'admin'],             club: true },
    { id: 'monchien',  label: 'Mon chien', icon: 'dog',      roles: ['member', 'external', 'admin'], club: false },
    { id: 'profil',    label: 'Profil',    icon: 'user',     roles: ['member', 'external', 'admin'], club: false },
  ];
  const tabs = allTabs.filter(t => t.roles.includes(userType) && (!t.club || CLUB_ENABLED));

  return (
    <nav
      className="mobile-bottomnav"
      style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430,
      background: 'rgba(255,255,255,0.97)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderTop: '1px solid #f0f0f0',
      display: 'flex', justifyContent: 'space-around',
      padding: `8px 4px calc(8px + env(safe-area-inset-bottom, 0px))`,
      zIndex: 100,
      boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
    }}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 4, border: 'none', cursor: 'pointer',
              padding: '6px 10px', position: 'relative', borderRadius: 14,
              transition: 'background 0.2s',
              background: isActive ? '#e8f7fd' : 'transparent',
              minWidth: 52,
            }}
          >
            <Icon name={tab.icon} size={22} color={isActive ? '#2BABE1' : '#9ca3af'} />
            <span style={{
              fontSize: 10, fontWeight: isActive ? 700 : 500,
              color: isActive ? '#2BABE1' : '#9ca3af',
              fontFamily: 'Inter, sans-serif',
              letterSpacing: 0.2,
            }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
