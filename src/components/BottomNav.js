// src/components/BottomNav.js
const icons = {
  home: (active) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#2BABE1' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  ),
  planning: (active) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#2BABE1' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
    </svg>
  ),
  ressources: (active) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#2BABE1' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  ),
  news: (active) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#2BABE1' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
      <path d="M6 1v3M10 1v3M14 1v3"/>
    </svg>
  ),
  profil: (active) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#2BABE1' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  ),
};

export default function BottomNav({ active, onNavigate, userType = 'member' }) {
  // Tabs dépendent du type d'utilisateur :
  //  - member/admin : accès complet (Accueil, Planning, Ressources, News, Profil)
  //  - external     : pas de Planning/News (pas de cours au club, pas de news réservées)
  const allTabs = [
    { id: 'home',       label: 'Accueil',    roles: ['member', 'external', 'admin'] },
    { id: 'planning',   label: 'Planning',   roles: ['member', 'admin'] },
    { id: 'ressources', label: 'Ressources', roles: ['member', 'external', 'admin'] },
    { id: 'news',       label: 'News',       roles: ['member', 'admin'] },
    { id: 'profil',     label: 'Profil',     roles: ['member', 'external', 'admin'] },
  ];
  const tabs = allTabs.filter(t => t.roles.includes(userType));

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
              padding: '6px 14px', position: 'relative', borderRadius: 14,
              transition: 'background 0.2s',
              background: isActive ? '#e8f7fd' : 'transparent',
              minWidth: 56,
            }}
          >
            {icons[tab.id]?.(isActive)}
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
