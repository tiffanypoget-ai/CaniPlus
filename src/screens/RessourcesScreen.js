// src/screens/RessourcesScreen.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { categoryConfig } from '../lib/theme';
import { usePremium } from '../hooks/usePremium';
import Icon from '../components/Icons';
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
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const [loadError, setLoadError] = useState(null);
  useEffect(() => {
    if (!isPremium) return;
    setLoadError(null);
    supabase.from('resources').select('*').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { setLoadError('Erreur de chargement. Réessaie plus tard.'); return; }
        if (data) setResources(data);
      });
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
    return <PaywallScreen title="Ressources" icon={<Icon name="book" size={24} color="#fff" />} />;
  }

  const filtered = resources.filter(r => {
    if (!r.file_url && !r.video_url) return false; // masquer les "Bientôt"
    const matchCat = category === 'tous' || r.category === category;
    const matchSearch = r.title.toLowerCase().includes(search.toLowerCase()) || (r.description ?? '').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const openResource = (r) => {
    const url = r.file_url;
    if (url) window.open(url, '_blank');
    // else: resource not yet available, no action
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1F1F20, #2a3a4a)', padding: isDesktop ? '28px 32px 20px' : 'calc(env(safe-area-inset-top,0px) + 20px) 24px 20px', flexShrink: 0, ...(isDesktop ? { borderRadius: '0 0 20px 20px', maxWidth: 1060, margin: '0 auto', width: '100%' } : {}) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 800, color: '#fff' }}>
            Ressources
            <Icon name="book" size={24} color="#fff" />
          </div>
          <div style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 8, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="sparkle" size={10} color="#fff" />
            PREMIUM
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: '10px 14px', marginBottom: 12 }}>
          <Icon name="search" size={18} color="rgba(255,255,255,0.6)" />
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
      <div style={{ flex: 1, height: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: isDesktop ? '24px 32px' : 16 }} className="screen-content">
        {loadError && (
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, maxWidth: isDesktop ? 1060 : 'none', margin: isDesktop ? '0 auto 12px' : undefined }}>
            <Icon name="warning" size={18} color="#dc2626" />
            {loadError}
          </div>
        )}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 52, marginBottom: 14, display: 'flex', justifyContent: 'center' }}>
              <Icon name="book" size={52} color="#d1d5db" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1F1F20', marginBottom: 6 }}>
              {resources.length === 0 ? 'Ressources bientôt disponibles' : 'Aucune ressource trouvée'}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, maxWidth: 260, margin: '0 auto' }}>
              {resources.length === 0
                ? 'Tiffany prépare des fiches, vidéos et guides pour vous accompagner. Revenez bientôt !'
                : 'Essaie une autre catégorie ou modifie ta recherche.'}
            </div>
          </div>
        ) : (
          <div className={isDesktop ? 'resources-grid' : ''}>
            {filtered.map(r => {
              const cfg = categoryConfig[r.category] ?? {};
              const tCfg = typeConfig[r.type] ?? {};
              const hasUrl = !!r.file_url;
              return (
                <div key={r.id} onClick={() => openResource(r)} style={{
                  background: '#fff', borderRadius: 18, padding: 14, marginBottom: isDesktop ? 0 : 10,
                  display: 'flex', alignItems: 'center', gap: 14,
                  boxShadow: '0 2px 16px rgba(43,171,225,0.08)', cursor: hasUrl ? 'pointer' : 'default',
                  opacity: hasUrl ? 1 : 0.7,
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={e => { if (isDesktop && hasUrl) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(43,171,225,0.16)'; }}}
                onMouseLeave={e => { if (isDesktop) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(43,171,225,0.08)'; }}}
                >
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: cfg.bg ?? '#f4f6f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                    {cfg.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1F1F20', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                    {r.description && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.description}</div>}
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(r.created_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  </div>
                  {hasUrl ? (
                    tCfg.label && <div style={{ background: tCfg.bg, color: tCfg.color, fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 8, flexShrink: 0 }}>{tCfg.label}</div>
                  ) : (
                    <div style={{ background: '#f3f4f6', color: '#9ca3af', fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 8, flexShrink: 0 }}>Bientôt</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
