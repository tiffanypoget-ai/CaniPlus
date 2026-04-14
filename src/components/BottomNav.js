// src/components/BottomNav.js
export default function BottomNav({ active, onNavigate }) {
  const tabs = [
    { id: 'home',       emoji: '🏠', label: 'Accueil' },
    { id: 'planning',   emoji: '📅', label: 'Planning' },
    { id: 'ressources', emoji: '📚', label: 'Ressources' },
    { id: 'news',       emoji: '📣', label: 'News' },
    { id: 'profil',     emoji: '👤', label: 'Profil' },
  ];

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430,
      background: '#fff',
      borderTop: '1px solid #f0f0f0',
      display: 'flex', justifyContent: 'space-around',
      padding: `10px 0 calc(10px + env(safe-area-inset-bottom, 0px))`,
      zIndex: 100,
      boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
    }}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 3, background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 12px', position: 'relative',
            }}
          >
            <span style={{ fontSize: 22 }}>{tab.emoji}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? '#2BABE1' : '#6b7280' }}>
              {tab.label}
            </span>
            {isActive && (
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#2BABE1' }} />
            )}
          </button>
        );
      })}
    </nav>
  );
}
