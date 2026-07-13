// src/components/BottomNav.js
// Barre de navigation mobile. La liste des onglets est partagée avec la
// Sidebar desktop (src/lib/navTabs.js), les icônes viennent du composant
// Icon partagé (src/components/Icons.js).
import { icons as iconLib } from './Icons';
import { visibleTabs } from '../lib/navTabs';

const Icon = ({ name, size = 22, color }) => {
  const renderer = iconLib[name];
  if (!renderer) return null;
  return renderer({ size, color });
};

export default function BottomNav({ active, onNavigate, userType = 'member' }) {
  const tabs = visibleTabs(userType);

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
              padding: '6px 2px', position: 'relative', borderRadius: 14,
              transition: 'background 0.2s',
              background: isActive ? '#e8f7fd' : 'transparent',
              // Tous les onglets font exactement la même largeur, quel que
              // soit leur libellé (flex égal, pas de largeur au contenu).
              flex: '1 1 0', minWidth: 0, maxWidth: 86,
            }}
          >
            <Icon name={tab.icon} size={22} color={isActive ? '#2BABE1' : '#9ca3af'} />
            <span style={{
              fontSize: 10, fontWeight: isActive ? 700 : 500,
              color: isActive ? '#2BABE1' : '#9ca3af',
              fontFamily: 'Inter, sans-serif',
              letterSpacing: 0.2,
              whiteSpace: 'nowrap',
            }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
