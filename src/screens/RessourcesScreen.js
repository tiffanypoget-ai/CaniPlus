// src/screens/RessourcesScreen.js
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { categoryConfig } from '../lib/theme';
import { usePremium } from '../hooks/usePremium';
import { useAuth } from '../hooks/useAuth';
import { trackEvent } from '../lib/trackEvent';
import Icon from '../components/Icons';
import PaywallScreen from '../components/PaywallScreen';
import PremiumBlocks from '../components/PremiumBlocks';
import { parseContent, estimateReadingTime } from '../lib/premiumContent';

const CATS = [
  { key: 'tous', label: 'Tout' },
  { key: 'education', label: 'Éducation' },
  { key: 'sante', label: 'Santé' },
  { key: 'comportement', label: 'Comportement' },
  { key: 'securite', label: 'Sécurité' },
  { key: 'quotidien', label: 'Quotidien' },
  { key: 'sociabilisation', label: 'Sociabilisation' },
  { key: 'bien-etre', label: 'Bien-être' },
];

const typeConfig = {
  pdf:     { label: 'PDF',     color: '#dc2626', bg: '#fee2e2', icon: 'file' },
  video:   { label: 'Vidéo',   color: '#7c3aed', bg: '#ede9fe', icon: 'play' },
  article: { label: 'Article', color: '#2BABE1', bg: '#e8f7fd', icon: 'book' },
};


export default function RessourcesScreen() {
  const { isPremium, loading: premiumLoading } = usePremium();
  const { profile } = useAuth();
  const [resources, setResources] = useState([]);
  // Fiches attribuees nominativement (table member_resources) : « ce que
  // Tiffany m'a donne, a moi ». Distinctes du catalogue premium, et lisibles
  // meme sans abonnement premium (policy resources_select_assigned).
  const [myFiches, setMyFiches] = useState([]);
  const [category, setCategory] = useState('tous');
  const [typeFilter, setTypeFilter] = useState('tous');
  const [search, setSearch] = useState('');
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    supabase.from('member_resources')
      .select('id, note, assigned_at, read_at, resource:resource_id (id, title, description, type, category, file_url, content, created_at)')
      .eq('user_id', profile.id)
      .order('assigned_at', { ascending: false })
      .then(({ data }) => { if (data) setMyFiches(data); });
  }, [profile?.id]);

  useEffect(() => {
    if (!isPremium) return;
    setLoadError(null);
    supabase.from('resources').select('*').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { setLoadError('Erreur de chargement. Réessaie plus tard.'); return; }
        if (data) setResources(data);
      });
  }, [isPremium]);

  // Bloquer le scroll du body quand la modale est ouverte
  useEffect(() => {
    if (selectedArticle) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [selectedArticle]);

  const filtered = useMemo(() => resources.filter(r => {
    if (!r.file_url && !r.video_url && !r.content) return false;
    const matchCat = category === 'tous' || r.category === category;
    const matchType = typeFilter === 'tous' || r.type === typeFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || r.title.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q);
    return matchCat && matchType && matchSearch;
  }), [resources, category, typeFilter, search]);

  const openResource = (r) => {
    trackEvent({ kind: 'resource_view', resource_id: r.id });
    if (r.content) { setSelectedArticle(r); return; }
    const url = r.file_url || r.video_url;
    if (url) window.open(url, '_blank');
  };

  // Ouvre une fiche attribuee et note la premiere lecture (read_at).
  const openFiche = (f) => {
    if (!f.read_at) {
      const now = new Date().toISOString();
      supabase.from('member_resources').update({ read_at: now }).eq('id', f.id).then(() => {});
      setMyFiches(fs => fs.map(x => (x.id === f.id ? { ...x, read_at: now } : x)));
    }
    if (f.resource) openResource(f.resource);
  };

  // Modale de lecture d'article, partagee entre la vue premium et la vue
  // « Mes fiches » d'un membre sans premium.
  const articleModal = selectedArticle ? (() => {
        const cat = categoryConfig[selectedArticle.category] ?? { color: '#2BABE1', bg: '#e8f7fd', icon: 'book', label: 'Article' };
        const accentColor = cat.color;
        const accentBg = cat.bg;
        const iconName = cat.icon || 'book';
        const readingMinutes = estimateReadingTime(selectedArticle.content);
        const blocks = parseContent(selectedArticle.content);

        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: isDesktop ? 'center' : 'flex-end', justifyContent: 'center' }}
            onClick={() => setSelectedArticle(null)}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#fff', width: '100%', maxWidth: isDesktop ? 720 : '100%',
                maxHeight: isDesktop ? '88vh' : '94vh',
                borderRadius: isDesktop ? 24 : '24px 24px 0 0',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                animation: 'slideUp 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '0 30px 90px rgba(0,0,0,0.25)',
              }}
            >
              {/* ── Header article ──────────────────────── */}
              <div style={{ background: `linear-gradient(140deg, ${accentColor}, ${accentColor}dd)`, padding: isDesktop ? '28px 32px 26px' : '26px 22px 22px', flexShrink: 0, position: 'relative', color: '#fff' }}>
                <button
                  onClick={() => setSelectedArticle(null)}
                  aria-label="Fermer"
                  style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.22)', border: 'none', borderRadius: 12, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(4px)' }}
                >
                  <Icon name="close" size={18} color="#fff" />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                    <Icon name={iconName} size={22} color="#fff" />
                  </div>
                  <div>
                    <div style={{ background: 'rgba(255,255,255,0.22)', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: 0.5, display: 'inline-block', textTransform: 'uppercase' }}>
                      {cat.label}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: isDesktop ? 24 : 21, fontWeight: 800, color: '#fff', lineHeight: 1.25, marginBottom: 8, paddingRight: 40 }}>
                  {selectedArticle.title}
                </div>
                {selectedArticle.description && (
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.92)', lineHeight: 1.5, marginBottom: 12 }}>
                    {selectedArticle.description}
                  </div>
                )}
                {/* Méta : temps de lecture + date */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="clock" size={13} color="rgba(255,255,255,0.85)" />
                    {readingMinutes} min de lecture
                  </span>
                  {selectedArticle.created_at && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.6)' }} />
                      {new Date(selectedArticle.created_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>

              {/* ── Contenu article ──────────────────────── */}
              <div
                style={{
                  flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
                  // Sur mobile, on ajoute ≈ 100 px de padding bas pour que la
                  // dernière ligne reste lisible même si la BottomNav repasse
                  // par-dessus le bas de la modale (problème de stacking
                  // observé sur certains appareils).
                  padding: isDesktop
                    ? '28px 40px 40px'
                    : '22px 22px calc(100px + env(safe-area-inset-bottom, 0px))',
                  background: '#fff',
                }}
              >
                <div style={{ maxWidth: 620, margin: '0 auto' }}>
                  <PremiumBlocks blocks={blocks} accentColor={accentColor} accentBg={accentBg} />

                  {/* Footer article */}
                  <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: accentBg, borderRadius: 999 }}>
                      <Icon name="paw" size={14} color={accentColor} />
                      <span style={{ fontSize: 12, fontWeight: 800, color: accentColor, letterSpacing: 0.3 }}>CaniPlus</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--gray-mid)', marginTop: 10 }}>
                      Contenu réservé aux membres premium · Éducation canine bienveillante
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <style>{`
              @keyframes slideUp {
                from { transform: translateY(40px); opacity: 0; }
                to   { transform: translateY(0);     opacity: 1; }
              }
            `}</style>
          </div>
        );
      })() : null;

  const fichesSection = myFiches.length > 0 ? (
    <div style={{ marginBottom: 20, maxWidth: isDesktop ? 1060 : 'none', margin: isDesktop ? '0 auto 20px' : '0 0 20px' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="heart" size={14} color="var(--cyan)" />
        Mes fiches
        <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--gray)' }}>· données par Tiffany</span>
      </div>
      {myFiches.map(f => {
        const r = f.resource;
        if (!r) return null;
        const tCfg = typeConfig[r.type] ?? typeConfig.article;
        return (
          <button type="button" key={f.id} onClick={() => openFiche(f)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', border: 0, font: 'inherit', cursor: 'pointer',
              background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 10,
              boxShadow: '0 2px 12px rgba(43,171,225,0.10)', borderLeft: '4px solid var(--cyan)',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: tCfg.bg, color: tCfg.color, fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999 }}>{tCfg.label.toUpperCase()}</span>
              {!f.read_at && <span title="Pas encore ouverte" style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--cyan)' }} />}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--gray-mid)' }}>
                {new Date(f.assigned_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 6 }}>{r.title}</div>
            {f.note && (
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic', marginTop: 4, lineHeight: 1.5 }}>« {f.note} »</div>
            )}
          </button>
        );
      })}
    </div>
  ) : null;

  if (premiumLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ width: 28, height: 28, border: '3px solid rgba(43,171,225,0.2)', borderTopColor: 'var(--cyan)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (!isPremium) {
    // Sans fiche attribuée, l'écran reste la porte d'entrée premium habituelle.
    if (myFiches.length === 0) {
      return <PaywallScreen title="Premium" icon={<Icon name="sparkle" size={24} color="var(--bleu-texte)" />} />;
    }
    // Avec des fiches attribuées : elles s'affichent même sans premium,
    // c'est ce que Tiffany a donné à cette personne.
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 16px', flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>Mes fiches</div>
          <div style={{ fontSize: 13, color: 'var(--gray)', marginTop: 2 }}>Ce que Tiffany t'a donné, à toi.</div>
        </div>
        <div className="screen-content" style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', padding: '16px 16px calc(96px + env(safe-area-inset-bottom, 0px))' }}>
          {fichesSection}
          <div style={{ background: 'var(--cyan-light)', borderRadius: 16, padding: '14px 16px', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
            Le catalogue premium complet (fiches, vidéos, articles) est un abonnement séparé, CHF 10 par mois, résiliable à tout moment.
          </div>
        </div>
        {articleModal}
      </div>
    );
=======
    return <PaywallScreen title="Premium" icon={<Icon name="sparkle" size={24} color="var(--bleu-texte)" />} />;
>>>>>>> origin/main
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Header ─────────────────────────────────────── */}
      <div style={{
        background: 'var(--header-grad)',
        borderBottom: '1px solid var(--border)',
        padding: isDesktop ? '28px 32px 22px' : 'calc(env(safe-area-inset-top,0px) + 20px) 24px 20px',
        flexShrink: 0,
        ...(isDesktop ? { borderRadius: '0 0 20px 20px', maxWidth: 1060, margin: '0 auto', width: '100%' } : {}),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-title)', color: 'var(--ink)' }}>
            Premium
            <Icon name="sparkle" size={24} color="var(--bleu-texte)" />
          </div>
          <div style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 8, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="sparkle" size={10} color="#fff" />
            PREMIUM
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#ffffff', border: '1px solid var(--border)', borderRadius: 14, padding: '10px 14px', marginBottom: 12 }}>
          <Icon name="search" size={18} color="var(--gray)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une fiche, un conseil..."
            style={{ flex: 1, background: 'none', border: 'none', color: 'var(--ink)', fontSize: 14, outline: 'none' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
              <Icon name="close" size={14} color="var(--gray)" />
            </button>
          )}
        </div>
        {/* Filtres catégorie */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 8 }}>
          {CATS.map(c => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              style={{
                padding: '6px 14px', borderRadius: 999, flexShrink: 0, border: 'none', cursor: 'pointer',
                background: category === c.key ? 'var(--bleu-texte)' : '#ffffff',
                color: category === c.key ? '#ffffff' : 'var(--ink-soft)',
                boxShadow: category === c.key ? 'none' : 'var(--sh-pill)',
                fontSize: 12, fontWeight: 700, transition: 'background 0.2s',
              }}
            >{c.label}</button>
          ))}
        </div>
        {/* Filtres type (mini pills) */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'tous', label: 'Tous les formats' },
            { key: 'article', label: 'Articles' },
            { key: 'pdf', label: 'PDF' },
            { key: 'video', label: 'Vidéos' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              style={{
                padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
                background: typeFilter === t.key ? 'rgba(255,255,255,0.95)' : 'transparent',
                color: typeFilter === t.key ? '#1F1F20' : 'rgba(255,255,255,0.6)',
                fontSize: 11, fontWeight: 700, transition: 'all 0.2s',
              }}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── Liste ──────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'scroll',
          WebkitOverflowScrolling: 'touch',
          padding: isDesktop
            ? '24px 32px 40px'
            : '16px 16px calc(96px + env(safe-area-inset-bottom, 0px))',
        }}
        className="screen-content"
      >
        {loadError && (
          <div style={{ background: 'var(--red-light)', color: 'var(--red-dark)', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, maxWidth: isDesktop ? 1060 : 'none', margin: isDesktop ? '0 auto 12px' : undefined }}>
            <Icon name="warning" size={18} color="#dc2626" />
            {loadError}
          </div>
        )}

        {fichesSection}

        {/* Compteur résultats */}
        {!loadError && filtered.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--gray-mid)', fontWeight: 600, marginBottom: 12, paddingLeft: 4 }}>
            {filtered.length} {filtered.length > 1 ? 'ressources' : 'ressource'}
            {category !== 'tous' && ` · ${CATS.find(c => c.key === category)?.label}`}
          </div>
        )}

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 52, marginBottom: 14, display: 'flex', justifyContent: 'center' }}>
              <Icon name="book" size={52} color="#d1d5db" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', marginBottom: 6 }}>
              {resources.length === 0 ? 'Ressources bientôt disponibles' : 'Aucune ressource trouvée'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
              {resources.length === 0
                ? 'Tiffany prépare des fiches, vidéos et guides pour vous accompagner. Revenez bientôt !'
                : 'Essaie une autre catégorie ou modifie ta recherche.'}
            </div>
          </div>
        ) : isDesktop ? (
          /* Desktop : grille de grandes cartes avec bandeau coloré */
          <div className="resources-grid-large">
            {filtered.map(r => {
              const cfg = categoryConfig[r.category] ?? { color: '#2BABE1', bg: '#e8f7fd', icon: 'book', label: 'Ressource' };
              const tCfg = typeConfig[r.type] ?? typeConfig.article;
              const hasUrl = !!r.file_url || !!r.video_url || !!r.content;
              return (
                <button type="button"
                  key={r.id}
                  onClick={() => hasUrl && openResource(r)}
                  className="resource-card-large"
                  style={{ border: 0, padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left', width: '100%', 
                    background: '#fff', borderRadius: 20, overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                    boxShadow: '0 2px 16px rgba(43,171,225,0.08)',
                    cursor: hasUrl ? 'pointer' : 'default',
                    opacity: hasUrl ? 1 : 0.7,
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  }}
                >
                  {/* Bandeau coloré en haut */}
                  <div style={{
                    background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)`,
                    padding: '22px 20px 18px', position: 'relative', minHeight: 110,
                    display: 'flex', alignItems: 'flex-end',
                  }}>
                    <div style={{ position: 'absolute', top: 14, left: 16, width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                      <Icon name={cfg.icon || 'book'} size={22} color="#fff" />
                    </div>
                    <div style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.9)', color: tCfg.color, fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 999, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {tCfg.label.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                      {cfg.label}
                    </div>
                  </div>
                  {/* Corps */}
                  <div style={{ padding: '16px 18px 18px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', marginBottom: 6, lineHeight: 1.3 }}>
                      {r.title}
                    </div>
                    {r.description && (
                      <div style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.5, marginBottom: 12, flex: 1 }}>
                        {r.description}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--gray-bg-alt)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--gray-mid)', fontWeight: 600 }}>
                        <Icon name="clock" size={12} color="#9ca3af" />
                        {r.content ? `${estimateReadingTime(r.content)} min` : 'À consulter'}
                      </div>
                      {hasUrl ? (
                        <div style={{ fontSize: 11, fontWeight: 800, color: cfg.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                          Lire <span style={{ fontSize: 14 }}>›</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-mid)', background: 'var(--gray-bg-alt)', padding: '3px 8px', borderRadius: 6 }}>Bientôt</div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* Mobile : liste compacte */
          <div>
            {filtered.map(r => {
              const cfg = categoryConfig[r.category] ?? { color: '#2BABE1', bg: '#e8f7fd', icon: 'book' };
              const tCfg = typeConfig[r.type] ?? typeConfig.article;
              const hasUrl = !!r.file_url || !!r.video_url || !!r.content;
              return (
                <button type="button"
                  key={r.id}
                  onClick={() => hasUrl && openResource(r)}
                  style={{ border: 0, font: 'inherit', color: 'inherit', textAlign: 'left', width: '100%', 
                    background: '#fff', borderRadius: 18, padding: 14, marginBottom: 10,
                    display: 'flex', alignItems: 'center', gap: 12,
                    boxShadow: '0 2px 12px rgba(43,171,225,0.07)',
                    cursor: hasUrl ? 'pointer' : 'default',
                    opacity: hasUrl ? 1 : 0.65,
                    transition: 'transform 0.1s',
                  }}
                >
                  {/* Icône catégorie colorée */}
                  <div style={{
                    width: 50, height: 50, borderRadius: 14,
                    background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    boxShadow: `0 4px 12px ${cfg.color}33`,
                  }}>
                    <Icon name={cfg.icon || 'book'} size={22} color="#fff" />
                  </div>
                  {/* Texte */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: cfg.color, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                        {cfg.label}
                      </div>
                      {r.content && (
                        <div style={{ fontSize: 10, color: 'var(--gray-mid)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}>
                          · <Icon name="clock" size={10} color="#9ca3af" /> {estimateReadingTime(r.content)} min
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.title}
                    </div>
                    {r.description && (
                      <div style={{ fontSize: 12, color: 'var(--gray)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }}>
                        {r.description}
                      </div>
                    )}
                  </div>
                  {/* Badge type */}
                  {hasUrl ? (
                    <div style={{ background: tCfg.bg, color: tCfg.color, fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 8, flexShrink: 0 }}>
                      {tCfg.label}
                    </div>
                  ) : (
                    <div style={{ background: 'var(--gray-bg-alt)', color: 'var(--gray-mid)', fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 8, flexShrink: 0 }}>Bientôt</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modale lecture article ────────────────────── */}
      {articleModal}
    </div>
  );
}
