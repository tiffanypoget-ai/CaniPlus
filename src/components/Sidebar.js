// src/components/Sidebar.js
// Navigation latérale pour la version desktop (>= 1024px).
// Réutilise la même API que BottomNav : { active, onNavigate }.
// Les 5 onglets sont identiques — seul le layout change.
import { icons as iconLib } from './Icons';

const Icon = ({ name, size = 22, color }) => {
  const renderer = iconLib[name];
  if (!renderer) return null;
  return renderer({ size, color });
};

export default function Sidebar({ active, onNavigate, userType = 'member' }) {
  // Les onglets affichés dépendent du user_type (cf. BottomNav). L'onglet News a
  // été retiré : les actualités du club apparaissent sur HomeScreen et les
  // notifications individuelles sont accessibles via la cloche en haut.
  const allTabs = [
    { id: 'home',       label: 'Accueil',    icon: 'home',        roles: ['member', 'external', 'admin'] },
    { id: 'planning',   label: 'Planning',   icon: 'calendar',    roles: ['member', 'admin'] },
    { id: 'boutique',   label: 'Boutique',   icon: 'shoppingBag', roles: ['member', 'external', 'admin'] },
    { id: 'ressources', label: 'Ressources', icon: 'folder',      roles: ['member', 'external', 'admin'] },
    { id: 'blog',       label: 'Blog',       icon: 'book',        roles: ['member', 'external', 'admin'] },
    { id: 'profil',     label: 'Profil',     icon: 'user',        roles: ['member', 'external', 'admin'] },
  ];
  const tabs = allTabs.filter(t => t.roles.includes(userType));
  const subtitle = 'Mon espace';

  return (
    <nav
      aria-label="Navigation principale"
      className="desktop-sidebar"
      style={{
        width: 240,
        minWidth: 240,
        height: '100dvh',
        background: '#ffffff',
        borderRight: '1px solid #e5e7eb',
        flexDirection: 'column',
        padding: '32px 16px 24px',
        position: 'sticky',
        top: 0,
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '0 12px 28px', textAlign: 'left' }}>
        <div
          style={{
            fontFamily: 'Great Vibes, cursive',
            fontSize: 40,
            lineHeight: 1,
            color: '#1F1F20',
          }}
        >
          CaniPlus
        </div>
        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: '#2BABE1',
            marginTop: 4,
          }}
        >
          {subtitle}
        </div>
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 14px',
                borderRadius: 12,
                background: isActive ? '#e8f7fd' : 'transparent',
                border: 'none',
                cursor: isActive ? 'default' : 'pointer',
                transition: 'background 0.2s',
                fontFamily: 'Inter, sans-serif',
                width: '100%',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = '#f4f6f8';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              {/* Barre active à gauche */}
              {isActive && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 8,
                    bottom: 8,
                    width: 3,
                    background: '#2BABE1',
                    borderRadius: '0 3px 3px 0',
                  }}
                />
              )}
              <Icon name={tab.icon} size={22} color={isActive ? '#2BABE1' : '#9ca3af'} />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#2BABE1' : '#4b5563',
                  letterSpacing: 0.2,
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ flex: 1 }} />
      <div
        style={{
          fontSize: 11,
          color: '#9ca3af',
          fontFamily: 'Inter, sans-serif',
          padding: '0 12px',
          letterSpacing: 0.3,
        }}
      >
        CaniPlus · Ballaigues
      </div>
    </nav>
  );
}
