// src/screens/BlogScreen.js
// Écran Blog — affiche les articles publiés (accessible aux membres ET externes).
// Phase 2 de l'ouverture grand public : contenu gratuit pour attirer du trafic SEO
// et offrir un premier point de contact aux visiteurs non-membres.

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { trackEvent } from '../lib/trackEvent';
import Icon from '../components/Icons';
import SoireesView from '../components/SoireesView';
import { useCloseOnBack } from '../hooks/useCloseOnBack';

const CATEGORIES = [
  { id: 'all',          label: 'Tous',        icon: 'book' },
  { id: 'education',    label: 'Éducation',   icon: 'users' },
  { id: 'comportement', label: 'Comportement', icon: 'message' },
  { id: 'sante',        label: 'Santé',       icon: 'heart' },
  { id: 'conseils',     label: 'Conseils',    icon: 'check' },
  { id: 'actualites',   label: 'Actualités',  icon: 'bell' },
];

export default function BlogScreen() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [showSoirees, setShowSoirees] = useState(false); // vue « Les soirées CaniPlus »

  // Bouton retour du téléphone : ferme la vue plein écran au lieu de changer d'onglet
  useCloseOnBack(showSoirees, () => setShowSoirees(false));
  useCloseOnBack(!!selectedArticle, () => setSelectedArticle(null));

  useEffect(() => {
    setLoadError(null);
    supabase
      .from('articles')
      .select('*')
      .eq('published', true)
      .order('published_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setLoadError('Erreur de chargement. Réessaie plus tard.');
        else if (data) setArticles(data);
        setLoading(false);
      });
  }, []);

  // Incrémenter le compteur de vues quand un article est ouvert (via edge function track-event)
  const openArticle = (article) => {
    setSelectedArticle(article);
    trackEvent({ kind: 'article_view', article_id: article.id });
  };

  const filteredArticles = selectedCategory === 'all'
    ? articles
    : articles.filter(a => a.category === selectedCategory);

  const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  // ─── Vue « Les soirées CaniPlus » (webinaires payants) ──────────────────
  if (showSoirees) {
    return <SoireesView onBack={() => setShowSoirees(false)} />;
  }

  // ─── Vue détail d'un article ───────────────────────────────────────────
  if (selectedArticle) {
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', background: '#fff' }} className="screen-content">
        {/* Header avec image de couverture */}
        {selectedArticle.cover_image_url && (
          <div style={{ position: 'relative', width: '100%', height: 220, overflow: 'hidden' }}>
            <img
              src={selectedArticle.cover_image_url}
              alt={selectedArticle.cover_image_alt ?? selectedArticle.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <button
              onClick={() => setSelectedArticle(null)}
              style={{
                position: 'absolute', top: 'calc(env(safe-area-inset-top,0px) + 12px)', left: 12,
                background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: 20,
                padding: '8px 12px', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                backdropFilter: 'blur(8px)',
              }}
            >
              <Icon name="arrowLeft" size={14} /> Retour
            </button>
          </div>
        )}
        {!selectedArticle.cover_image_url && (
          <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 12px) 16px 0' }}>
            <button
              onClick={() => setSelectedArticle(null)}
              style={{
                background: 'var(--gray-bg-alt)', border: 'none', borderRadius: 10, padding: '8px 12px',
                color: 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <Icon name="arrowLeft" size={14} /> Retour
            </button>
          </div>
        )}

        {/* Contenu de l'article */}
        <article style={{ padding: '20px 20px 80px', maxWidth: 720, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cyan)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            {CATEGORIES.find(c => c.id === selectedArticle.category)?.label ?? selectedArticle.category}
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.25, marginTop: 0, marginBottom: 12 }}>
            {selectedArticle.title}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--gray)', marginBottom: 24 }}>
            <span><Icon name="user" size={12} /> {selectedArticle.author_name}</span>
            <span>·</span>
            <span>{fmtDate(selectedArticle.published_at ?? selectedArticle.created_at)}</span>
            <span>·</span>
            <span><Icon name="clock" size={12} /> {selectedArticle.read_time_min} min</span>
          </div>

          {selectedArticle.excerpt && (
            <div style={{ fontSize: 16, color: '#4b5563', lineHeight: 1.5, marginBottom: 20, fontStyle: 'italic', paddingLeft: 14, borderLeft: '3px solid var(--cyan)' }}>
              {selectedArticle.excerpt}
            </div>
          )}

          <div
            className="article-content"
            style={{ fontSize: 15, color: '#1f2937', lineHeight: 1.7 }}
            dangerouslySetInnerHTML={{ __html: selectedArticle.content }}
          />

          {/* Signature auteur */}
          <div style={{ marginTop: 32, padding: 16, background: '#f9fafb', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--cyan)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800 }}>
              {(selectedArticle.author_name ?? 'T').charAt(0)}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{selectedArticle.author_name}</div>
              <div style={{ fontSize: 12, color: 'var(--gray)' }}>{selectedArticle.author_role}</div>
            </div>
          </div>

          {/* Tags */}
          {Array.isArray(selectedArticle.tags) && selectedArticle.tags.length > 0 && (
            <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedArticle.tags.map(tag => (
                <span key={tag} style={{ fontSize: 11, color: 'var(--gray)', background: 'var(--gray-bg-alt)', padding: '4px 10px', borderRadius: 12 }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </article>

        {/* CSS pour le rendu du HTML */}
        <style>{`
          .article-content h2 { font-size: 20px; font-weight: 800; color: #1F1F20; margin: 28px 0 12px; }
          .article-content h3 { font-size: 17px; font-weight: 700; color: #1F1F20; margin: 22px 0 10px; }
          .article-content p  { margin: 0 0 14px; }
          .article-content ul, .article-content ol { margin: 0 0 14px; padding-left: 22px; }
          .article-content li { margin-bottom: 6px; }
          .article-content a  { color: #2BABE1; text-decoration: underline; }
          .article-content strong { color: #1F1F20; font-weight: 700; }
          .article-content img { max-width: 100%; height: auto; border-radius: 10px; margin: 14px 0; }
          .article-content blockquote {
            border-left: 3px solid #2BABE1; padding: 4px 0 4px 14px;
            margin: 16px 0; color: #4b5563; font-style: italic;
          }
        `}</style>
      </div>
    );
  }

  // ─── Liste des articles ────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch' }} className="screen-content">
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, var(--ink) 0%, #2a3a4a 100%)',
        padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 28px',
      }}>
        <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 28, color: '#fff', marginBottom: 4 }}>CaniPlus</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 800, color: '#fff' }}>
          <Icon name="book" size={24} color="#fff" />
          Apprendre
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
          Conseils, articles et guides d'éducation canine
        </div>
      </div>

      {/* Formation → « Les soirées CaniPlus » : webinaires payants en direct + replay */}
      <div style={{ padding: '12px 16px 0' }}>
        <button type="button"
          onClick={() => setShowSoirees(true)}
          style={{ border: 0, font: 'inherit', color: 'inherit', textAlign: 'left', width: '100%', 
            background: 'linear-gradient(135deg, var(--cyan) 0%, #1d8fc0 100%)',
            borderRadius: 16, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(43,171,225,0.28)',
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="star" size={18} color="#ffffff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Les soirées CaniPlus</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 1 }}>Un thème, un soir, pour mieux comprendre ton chien.</div>
          </div>
          <span style={{ background: '#fff', color: 'var(--cyan-dark)', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>Nouveau</span>
        </button>
      </div>

      {/* Filtres par catégorie */}
      <div style={{ background: '#fff', padding: '12px 0', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ display: 'flex', gap: 8, padding: '0 16px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {CATEGORIES.map(cat => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  flex: '0 0 auto',
                  padding: '7px 14px',
                  borderRadius: 20,
                  border: 'none',
                  background: isActive ? 'var(--cyan)' : 'var(--gray-bg-alt)',
                  color: isActive ? '#fff' : 'var(--gray)',
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Icon name={cat.icon} size={12} color={isActive ? '#fff' : '#6b7280'} />
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '16px 16px 80px' }}>
        {loading && (
          <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 40 }}>Chargement…</div>
        )}
        {loadError && (
          <div style={{ textAlign: 'center', color: 'var(--red)', padding: 40 }}>{loadError}</div>
        )}
        {!loading && !loadError && filteredArticles.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 40 }}>
            <Icon name="book" size={36} color="#d1d5db" />
            <div style={{ marginTop: 12, fontSize: 14 }}>
              {selectedCategory === 'all'
                ? 'Aucun article publié pour l\'instant.'
                : 'Aucun article dans cette catégorie.'}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--gray-mid)' }}>
              Revenez bientôt, Tiffany prépare de nouveaux contenus !
            </div>
          </div>
        )}

        {filteredArticles.map((article, idx) => {
          // Premier article : format "hero"
          const isHero = idx === 0 && selectedCategory === 'all';
          if (isHero) {
            return (
              <button
                key={article.id}
                onClick={() => openArticle(article)}
                style={{
                  width: '100%',
                  background: '#fff',
                  borderRadius: 16,
                  padding: 0,
                  marginBottom: 16,
                  border: 'none',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                  textAlign: 'left',
                }}
              >
                {article.cover_image_url && (
                  <img
                    src={article.cover_image_url}
                    alt={article.cover_image_alt ?? article.title}
                    style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }}
                  />
                )}
                <div style={{ padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cyan)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                    {CATEGORIES.find(c => c.id === article.category)?.label ?? article.category}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.3, marginBottom: 8 }}>
                    {article.title}
                  </div>
                  {article.excerpt && (
                    <div style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.5, marginBottom: 10 }}>
                      {article.excerpt}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--gray-mid)' }}>
                    <span>{fmtDate(article.published_at ?? article.created_at)}</span>
                    <span>·</span>
                    <span><Icon name="clock" size={10} /> {article.read_time_min} min</span>
                  </div>
                </div>
              </button>
            );
          }
          // Articles suivants : format compact
          return (
            <button
              key={article.id}
              onClick={() => openArticle(article)}
              style={{
                width: '100%',
                background: '#fff',
                borderRadius: 14,
                padding: 12,
                marginBottom: 10,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
                display: 'flex',
                gap: 12,
                textAlign: 'left',
              }}
            >
              {article.cover_image_url && (
                <img
                  src={article.cover_image_url}
                  alt={article.cover_image_alt ?? article.title}
                  style={{ width: 80, height: 80, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--cyan)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                  {CATEGORIES.find(c => c.id === article.category)?.label ?? article.category}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3, marginBottom: 4 }}>
                  {article.title}
                </div>
                {article.excerpt && (
                  <div style={{ fontSize: 12, color: 'var(--gray)', lineHeight: 1.4, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {article.excerpt}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--gray-mid)' }}>
                  <span>{fmtDate(article.published_at ?? article.created_at)}</span>
                  <span>·</span>
                  <span><Icon name="clock" size={9} /> {article.read_time_min} min</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
