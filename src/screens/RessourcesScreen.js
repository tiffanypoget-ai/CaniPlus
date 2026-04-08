// src/screens/RessourcesScreen.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { categoryConfig } from '../lib/theme';
import { usePremium } from '../hooks/usePremium';
import PaywallScreen from '../components/PaywallScreen';

const CATS = [
  { key: 'tous', label: 'Tout' },
  { key: 'education', label: 'Éducation' },
  { key: 'sante', label: 'Santé' },
  { key: 'comportement', label: 'Comportement' },
  { key: 'securite', label: 'Sécurité' },
  { key: 'quotidien', label: 'Quotidien' },
];

const typeConfig = {
  pdf:     { label: 'PDF',     color: '#dc2626', bg: '#fee2e2' },
  video:   { label: 'Vidéo',  color: '#7c3aed', bg: '#ede9fe' },
  article: { label: 'Article', color: '#2BABE1', bg: '#e8f7fd' },
};

export default function RessourcesScreen() {
  const { isPremium, loading: premiumLoading } = usePremium();
  const [resources, setResources] = useState([]);
  const [category, setCategory] = useState('tous');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isPremium) return;
    supabase.from('resources').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setResources(data); });
  }, [isPremium]);

  // Attendre la vérification du statut premium
  if (premiumLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ width: 28, height: 28, border: '3px solid rgba(43,171,225,0.2)', borderTopColor: '#2BABE1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  // Pas premium → mur de paiement
  if (!isPremium) {
    return <PaywallScreen title="Ressources" icon="📚" />;
  }

  const filtered = resources.filter(r => {
    const matchCat = category === 'tous' || r.category === category;
    const matchSearch = r.title.toLowerCase().includes(search.toLowerCase()) || (r.description ?? '').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const openResource = (r) => {
    const url = r.file_url || r.video_url;
    if (url) window.open(url, '_blank');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1F1F20, #2a3a4a)', padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>Ressources 📚</div>
          <div style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 8, letterSpacing: 0.5 }}>
            ✨ PREMIUM
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: '10px 14px', marginBottom: 12 }}>
          <span>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." style={{ flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: 14, outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {CATS.map(c => (
            <button key={c.key} onClick={() => setCategory(c.key)} style={{
              padding: '6px 14px', borderRadius: 999, flexShrink: 0, border: 'none', cursor: 'pointer',
              background: category === c.key ? '#fff' : 'rgba(255,255,255,0.15)',
              color: category === c.key ? '#1F1F20' : 'rgba(255,255,255,0.7)',
              fontSize: 12, fontWeight: 700, transition: 'background 0.2s',
            }}>{c.label}</button>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="screen-content">
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📖</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#6b7280' }}>Aucune ressource trouvée</div>
          </div>
        ) : filtered.map(r => {
          const cfg = categoryConfig[r.category] ?? {};
          const tCfg = typeConfig[r.type] ?? {};
          return (
            <div key={r.id} onClick={() => openResource(r)} style={{
              background: '#fff', borderRadius: 18, padding: 14, marginBottom: 10,
              display: 'flex', alignItems: 'center', gap: 14,
              boxShadow: '0 2px 16px rgba(43,171,225,0.08)', cursor: 'pointer',
            }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: cfg.bg ?? '#f4f6f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                {cfg.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1F1F20', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                {r.description && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.description}</div>}
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(r.created_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              </div>
              {tCfg.label && (
                <div style={{ background: tCfg.bg, color: tCfg.color, fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 8, flexShrink: 0 }}>{tCfg.label}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
