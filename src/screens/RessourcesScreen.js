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
  const [selectedArticle, setSelectedArticle] = useState(null);

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
    if (!r.file_url && !r.video_url && !r.content) return false; // masquer les "Bientôt"
    const matchCat = category === 'tous' || r.category === category;
    const matchSearch = r.title.toLowerCase().includes(search.toLowerCase()) || (r.description ?? '').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const openResource = (r) => {
    if (r.content) {
      setSelectedArticle(r);
      return;
    }
    const url = r.file_url;
    if (url) window.open(url, '_blank');
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
      <div style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', padding: isDesktop ? '24px 32px' : 16 }} className="screen-content">
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
              const hasUrl = !!r.file_url || !!r.content;
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

      {/* Modale lecture article */}
      {selectedArticle && (() => {
        const cat = categoryConfig[selectedArticle.category] ?? {};
        const accentColor = cat.color || '#2BABE1';
        const accentBg = cat.bg || '#e8f7fd';
        const iconName = cat.icon || 'book';

        // Parser le contenu texte en blocs visuels
        const parseContent = (text) => {
          if (!text) return [];
          const lines = text.split('\n');
          const blocks = [];
          let i = 0;
          // Skip la première ligne si c'est le titre en majuscules (doublon du header)
          if (lines[0] && lines[0] === lines[0].toUpperCase() && lines[0].length > 3) i = 1;
          while (i < lines.length) {
            const line = lines[i].trim();
            if (!line) { i++; continue; }
            // Astuce / tip block
            if (/^ASTUCE/i.test(line)) {
              blocks.push({ type: 'tip', text: line.replace(/^ASTUCE\s*(PRO|CANIPLUS)?\s*[:—\-]?\s*/i, '') });
              i++; continue;
            }
            // Section header (ALL CAPS, > 5 chars, not a bullet)
            if (line === line.toUpperCase() && line.length > 5 && !line.startsWith('•') && !/^\d+\./.test(line)) {
              blocks.push({ type: 'heading', text: line });
              i++; continue;
            }
            // Numbered step line (e.g. "1. Choisis...")
            if (/^\d+\.\s/.test(line)) {
              const steps = [];
              while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
                steps.push(lines[i].trim().replace(/^\d+\.\s*/, ''));
                i++;
              }
              blocks.push({ type: 'steps', items: steps });
              continue;
            }
            // Bullet list
            if (line.startsWith('•')) {
              const items = [];
              while (i < lines.length && lines[i].trim().startsWith('•')) {
                items.push(lines[i].trim().replace(/^•\s*/, ''));
                i++;
              }
              blocks.push({ type: 'bullets', items });
              continue;
            }
            // Normal paragraph
            blocks.push({ type: 'paragraph', text: line });
            i++;
          }
          return blocks;
        };

        const blocks = parseContent(selectedArticle.content);

        return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: isDesktop ? 'center' : 'flex-end', justifyContent: 'center' }} onClick={() => setSelectedArticle(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', width: '100%', maxWidth: isDesktop ? 680 : '100%',
            maxHeight: isDesktop ? '85vh' : '92vh',
            borderRadius: isDesktop ? 20 : '20px 20px 0 0',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            animation: 'slideUp 0.3s ease-out',
          }}>
            {/* Header visuel avec gradient */}
            <div style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`, padding: '24px 20px 20px', flexShrink: 0, position: 'relative' }}>
              <button onClick={() => setSelectedArticle(null)} style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
                <Icon name="close" size={16} color="#fff" />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={iconName} size={20} color="#fff" />
                </div>
                <div style={{ background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>
                  {cat.label || 'Article'}
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>{selectedArticle.title}</div>
              {selectedArticle.description && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 6, lineHeight: 1.4 }}>{selectedArticle.description}</div>}
            </div>

            {/* Contenu article parsé */}
            <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '20px 20px 40px' }}>
              {blocks.map((block, idx) => {
                if (block.type === 'heading') return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: idx === 0 ? 0 : 22, marginBottom: 10 }}>
                    <div style={{ width: 4, height: 22, borderRadius: 2, background: accentColor, flexShrink: 0 }} />
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#1F1F20', textTransform: 'capitalize' }}>
                      {block.text.toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase())}
                    </div>
                  </div>
                );
                if (block.type === 'tip') return (
                  <div key={idx} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: '12px 14px', marginTop: 14, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <Icon name="sparkle" size={14} color="#16a34a" />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', marginBottom: 4, letterSpacing: 0.3 }}>ASTUCE CANIPLUS</div>
                      <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.6 }}>{block.text}</div>
                    </div>
                  </div>
                );
                if (block.type === 'steps') return (
                  <div key={idx} style={{ marginTop: 10, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {block.items.map((step, si) => (
                      <div key={si} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{ width: 26, height: 26, borderRadius: 8, background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 800, color: accentColor }}>
                          {si + 1}
                        </div>
                        <div style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.6, paddingTop: 3 }}>{step}</div>
                      </div>
                    ))}
                  </div>
                );
                if (block.type === 'bullets') return (
                  <div key={idx} style={{ marginTop: 8, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 4 }}>
                    {block.items.map((item, bi) => (
                      <div key={bi} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{ width: 6, height: 6, borderRadius: 3, background: accentColor, flexShrink: 0, marginTop: 7 }} />
                        <div style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.6 }}>{item}</div>
                      </div>
                    ))}
                  </div>
                );
                // paragraph
                return (
                  <p key={idx} style={{ fontSize: 14, lineHeight: 1.8, color: '#374151', margin: '0 0 12px', userSelect: 'none' }}>
                    {block.text}
                  </p>
                );
              })}

              {/* Footer article */}
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f3f4f6', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
                  <Icon name="paw" size={14} color={accentColor} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: accentColor }}>CaniPlus</span>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Contenu réservé aux membres premium</div>
              </div>
            </div>
          </div>
          <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        </div>
        );
      })()}
    </div>
  );
}
