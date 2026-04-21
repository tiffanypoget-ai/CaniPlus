// src/screens/RessourcesScreen.js
import { useEffect, useMemo, useState } from 'react';
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
  pdf:     { label: 'PDF',     color: '#dc2626', bg: '#fee2e2', icon: 'file' },
  video:   { label: 'Vidéo',   color: '#7c3aed', bg: '#ede9fe', icon: 'play' },
  article: { label: 'Article', color: '#2BABE1', bg: '#e8f7fd', icon: 'book' },
};

// ── Parseur de contenu d'article ─────────────────────────────────────
// Transforme un texte brut en blocs visuels : heading, subheading,
// paragraph, bullets, steps, arrow-items, tip, warning, separator.
function parseContent(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const blocks = [];
  let i = 0;

  // Saute la première ligne si c'est le titre en MAJUSCULES (doublon du header)
  if (lines[0] && lines[0].trim() === lines[0].trim().toUpperCase() && lines[0].trim().length > 3) {
    i = 1;
  }

  // Un "heading all caps" : on ignore ce qui est entre parenthèses,
  // ce qui permet à "EXERCICE 2 — LE PING-PONG (à deux personnes)" d'être détecté.
  const isAllCaps = (s) => {
    if (!s || s.length < 5) return false;
    const stripped = s.replace(/\([^)]*\)/g, '').trim();
    if (!stripped || stripped.length < 4) return false;
    // Il faut au moins une vraie lettre, et toutes les lettres doivent être en majuscules
    if (!/[A-ZÉÈÊÀÂÎÏÔÛÙÇ]/.test(stripped)) return false;
    return stripped === stripped.toUpperCase();
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) { i++; continue; }

    // ASTUCE / TIP
    if (/^ASTUCE/i.test(line)) {
      // Le texte de l'astuce peut continuer sur les lignes suivantes
      const parts = [line.replace(/^ASTUCE\s*(PRO|CANIPLUS)?\s*[:—\-]?\s*/i, '')];
      i++;
      while (i < lines.length) {
        const next = lines[i].trim();
        if (!next) break;
        if (isAllCaps(next) || next.startsWith('•') || next.startsWith('→') || /^\d+\.\s/.test(next)) break;
        parts.push(next);
        i++;
      }
      blocks.push({ type: 'tip', text: parts.filter(Boolean).join(' ') });
      continue;
    }

    // ATTENTION / WARNING
    if (/^ATTENTION\b/i.test(line) || /^ERREURS?\s+(À|FRÉQUENTES?|COURANTES?)/i.test(line) || /^CE QUI NE MARCHE PAS/i.test(line)) {
      const title = line.replace(/[:—\-]$/, '').trim();
      blocks.push({ type: 'warning-heading', text: title });
      i++;
      // Collecter les lignes jusqu'à prochaine section
      const items = [];
      const paragraphs = [];
      while (i < lines.length) {
        const next = lines[i].trim();
        if (!next) { i++; continue; }
        if (isAllCaps(next)) break;
        if (next.startsWith('•')) {
          items.push(next.replace(/^•\s*/, ''));
          i++;
        } else if (next.startsWith('→')) {
          items.push(next.replace(/^→\s*/, ''));
          i++;
        } else {
          paragraphs.push(next);
          i++;
        }
      }
      if (paragraphs.length) blocks.push({ type: 'warning-text', text: paragraphs.join(' ') });
      if (items.length) blocks.push({ type: 'warning-list', items });
      continue;
    }

    // Heading (ALL CAPS, éventuellement numéroté "N. …")
    // On fusionne l'ancienne branche "heading numéroté" et "ALL CAPS" pour
    // garantir que TOUS les titres numérotés reçoivent la même mise en forme
    // (carré coloré avec le numéro), peu importe s'ils contiennent un tiret,
    // un guillemet ou une apostrophe.
    if (isAllCaps(line) && !line.startsWith('•')) {
      const numMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (numMatch) {
        blocks.push({ type: 'heading', number: numMatch[1], text: numMatch[2] });
      } else {
        blocks.push({ type: 'heading', text: line });
      }
      i++;
      continue;
    }

    // Sous-titre : ligne se terminant par ":" (et courte, < 80 char)
    if (/:$/.test(line) && line.length < 80 && !line.startsWith('•') && !line.startsWith('→') && !/^\d+\.\s/.test(line)) {
      blocks.push({ type: 'subheading', text: line.replace(/:$/, '') });
      i++;
      continue;
    }

    // Heuristique : ligne courte suivie de flèches "→" → sous-titre
    // (Cas typique : "Marcher lentement / se figer" suivi d'explications en flèches.)
    if (
      line.length < 80 &&
      !line.startsWith('•') &&
      !line.startsWith('→') &&
      !/^\d+\.\s/.test(line) &&
      i + 1 < lines.length &&
      lines[i + 1].trim().startsWith('→')
    ) {
      blocks.push({ type: 'subheading', text: line });
      i++;
      continue;
    }

    // Liste d'étapes numérotées (1. ..., 2. ...)
    if (/^\d+\.\s/.test(line)) {
      const steps = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        steps.push(lines[i].trim().replace(/^\d+\.\s*/, ''));
        i++;
      }
      blocks.push({ type: 'steps', items: steps });
      continue;
    }

    // Bullets avec sous-flèches imbriquées
    if (line.startsWith('•')) {
      const items = [];
      while (i < lines.length) {
        const cur = lines[i].trim();
        if (cur.startsWith('•')) {
          items.push({ text: cur.replace(/^•\s*/, ''), subs: [] });
          i++;
        } else if (cur.startsWith('→') && items.length) {
          items[items.length - 1].subs.push(cur.replace(/^→\s*/, ''));
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: 'bullets', items });
      continue;
    }

    // Ligne "→ ..." seule → sous-note italique du bloc précédent
    if (line.startsWith('→')) {
      blocks.push({ type: 'arrow', text: line.replace(/^→\s*/, '') });
      i++;
      continue;
    }

    // Paragraphe classique (éventuellement multi-lignes regroupées)
    const paragraphLines = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next) break;
      if (isAllCaps(next)) break;
      if (next.startsWith('•') || next.startsWith('→') || /^\d+\.\s/.test(next)) break;
      if (/:$/.test(next) && next.length < 80) break;
      paragraphLines.push(next);
      i++;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') });
  }
  return blocks;
}

// Estimation temps de lecture : ~220 mots/minute
function estimateReadingTime(text) {
  if (!text) return 1;
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

// Sentence Case pour les headings qui arrivent en MAJUSCULES.
// En français on ne capitalise QUE le premier mot — pas chaque mot comme en
// anglais. "POURQUOI LE RAPPEL EST SI DIFFICILE ?" devient "Pourquoi le
// rappel est si difficile ?" (et pas "Pourquoi Le Rappel Est Si Difficile").
// Si le texte contient déjà des minuscules (mixed case), on ne touche à rien.
function toSentenceCase(s) {
  if (!s) return '';
  if (s !== s.toUpperCase()) return s;
  const lower = s.toLowerCase();
  // Capitaliser la première vraie lettre (ignorer chiffres et ponctuation).
  return lower.replace(/\p{L}/u, ch => ch.toUpperCase());
}

export default function RessourcesScreen() {
  const { isPremium, loading: premiumLoading } = usePremium();
  const [resources, setResources] = useState([]);
  const [category, setCategory] = useState('tous');
  const [typeFilter, setTypeFilter] = useState('tous');
  const [search, setSearch] = useState('');
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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

  if (premiumLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ width: 28, height: 28, border: '3px solid rgba(43,171,225,0.2)', borderTopColor: '#2BABE1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (!isPremium) {
    return <PaywallScreen title="Ressources" icon={<Icon name="book" size={24} color="#fff" />} />;
  }

  const openResource = (r) => {
    if (r.content) { setSelectedArticle(r); return; }
    const url = r.file_url || r.video_url;
    if (url) window.open(url, '_blank');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Header ─────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #1F1F20, #2a3a4a)',
        padding: isDesktop ? '28px 32px 22px' : 'calc(env(safe-area-inset-top,0px) + 20px) 24px 20px',
        flexShrink: 0,
        ...(isDesktop ? { borderRadius: '0 0 20px 20px', maxWidth: 1060, margin: '0 auto', width: '100%' } : {}),
      }}>
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
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une fiche, un conseil..."
            style={{ flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: 14, outline: 'none' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
              <Icon name="close" size={14} color="rgba(255,255,255,0.6)" />
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
                background: category === c.key ? '#fff' : 'rgba(255,255,255,0.15)',
                color: category === c.key ? '#1F1F20' : 'rgba(255,255,255,0.7)',
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
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, maxWidth: isDesktop ? 1060 : 'none', margin: isDesktop ? '0 auto 12px' : undefined }}>
            <Icon name="warning" size={18} color="#dc2626" />
            {loadError}
          </div>
        )}

        {/* Compteur résultats */}
        {!loadError && filtered.length > 0 && (
          <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, marginBottom: 12, paddingLeft: 4 }}>
            {filtered.length} {filtered.length > 1 ? 'ressources' : 'ressource'}
            {category !== 'tous' && ` · ${CATS.find(c => c.key === category)?.label}`}
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
            <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
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
                <div
                  key={r.id}
                  onClick={() => hasUrl && openResource(r)}
                  className="resource-card-large"
                  style={{
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
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#1F1F20', marginBottom: 6, lineHeight: 1.3 }}>
                      {r.title}
                    </div>
                    {r.description && (
                      <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, marginBottom: 12, flex: 1 }}>
                        {r.description}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>
                        <Icon name="clock" size={12} color="#9ca3af" />
                        {r.content ? `${estimateReadingTime(r.content)} min` : 'À consulter'}
                      </div>
                      {hasUrl ? (
                        <div style={{ fontSize: 11, fontWeight: 800, color: cfg.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                          Lire <span style={{ fontSize: 14 }}>›</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', background: '#f3f4f6', padding: '3px 8px', borderRadius: 6 }}>Bientôt</div>
                      )}
                    </div>
                  </div>
                </div>
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
                <div
                  key={r.id}
                  onClick={() => hasUrl && openResource(r)}
                  style={{
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
                        <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}>
                          · <Icon name="clock" size={10} color="#9ca3af" /> {estimateReadingTime(r.content)} min
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1F1F20', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.title}
                    </div>
                    {r.description && (
                      <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }}>
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
                    <div style={{ background: '#f3f4f6', color: '#9ca3af', fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 8, flexShrink: 0 }}>Bientôt</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modale lecture article ────────────────────── */}
      {selectedArticle && (() => {
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
                  padding: isDesktop ? '28px 40px 40px' : '22px 22px 36px',
                  background: '#fff',
                }}
              >
                <div style={{ maxWidth: 620, margin: '0 auto' }}>
                  {blocks.map((block, idx) => {
                    const prev = blocks[idx - 1];
                    const topMargin = (block.type === 'heading' || block.type === 'warning-heading')
                      ? (idx === 0 ? 0 : 28)
                      : block.type === 'subheading' ? 16
                      : 0;

                    if (block.type === 'heading') {
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: topMargin, marginBottom: 14 }}>
                          {block.number ? (
                            <div style={{ width: 30, height: 30, borderRadius: 10, background: accentBg, color: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                              {block.number}
                            </div>
                          ) : (
                            <div style={{ width: 5, height: 22, borderRadius: 3, background: accentColor, flexShrink: 0 }} />
                          )}
                          <div style={{ fontSize: 17, fontWeight: 800, color: '#1F1F20', lineHeight: 1.3 }}>
                            {toSentenceCase(block.text)}
                          </div>
                        </div>
                      );
                    }

                    if (block.type === 'subheading') {
                      return (
                        <div key={idx} style={{ fontSize: 14, fontWeight: 800, color: accentColor, marginTop: topMargin, marginBottom: 8, letterSpacing: 0.2 }}>
                          {block.text}
                        </div>
                      );
                    }

                    if (block.type === 'tip') {
                      return (
                        <div key={idx} style={{ background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', border: '1px solid #bbf7d0', borderRadius: 16, padding: '14px 16px', marginTop: 18, marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          <div style={{ width: 32, height: 32, borderRadius: 10, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Icon name="sparkle" size={16} color="#16a34a" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                              Astuce CaniPlus
                            </div>
                            <div style={{ fontSize: 14, color: '#166534', lineHeight: 1.65 }}>
                              {block.text}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (block.type === 'warning-heading') {
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 10, padding: '10px 14px', background: '#fff7ed', borderLeft: '4px solid #f59e0b', borderRadius: '0 10px 10px 0' }}>
                          <Icon name="warning" size={16} color="#d97706" />
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#b45309', letterSpacing: 0.3 }}>
                            {toSentenceCase(block.text)}
                          </div>
                        </div>
                      );
                    }

                    if (block.type === 'warning-text') {
                      return (
                        <p key={idx} style={{ fontSize: 14.5, lineHeight: 1.75, color: '#78350f', margin: '0 0 10px', paddingLeft: 4 }}>
                          {block.text}
                        </p>
                      );
                    }

                    if (block.type === 'warning-list') {
                      return (
                        <div key={idx} style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {block.items.map((item, ii) => (
                            <div key={ii} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingLeft: 4 }}>
                              <div style={{ color: '#d97706', fontWeight: 800, flexShrink: 0, marginTop: 1 }}>✕</div>
                              <div style={{ fontSize: 14, color: '#78350f', lineHeight: 1.6 }}>{item}</div>
                            </div>
                          ))}
                        </div>
                      );
                    }

                    if (block.type === 'steps') {
                      return (
                        <div key={idx} style={{ marginTop: 12, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {block.items.map((step, si) => (
                            <div key={si} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: '#fafafa', borderRadius: 12, padding: '12px 14px' }}>
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: accentColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 800, boxShadow: `0 2px 6px ${accentColor}44` }}>
                                {si + 1}
                              </div>
                              <div style={{ fontSize: 14.5, color: '#334155', lineHeight: 1.65, paddingTop: 4 }}>
                                {step}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    }

                    if (block.type === 'bullets') {
                      return (
                        <div key={idx} style={{ marginTop: 10, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 2 }}>
                          {block.items.map((item, bi) => (
                            <div key={bi}>
                              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                <div style={{ width: 7, height: 7, borderRadius: '50%', background: accentColor, flexShrink: 0, marginTop: 9 }} />
                                <div style={{ fontSize: 14.5, color: '#334155', lineHeight: 1.7, flex: 1 }}>
                                  {item.text}
                                </div>
                              </div>
                              {item.subs && item.subs.length > 0 && (
                                <div style={{ marginLeft: 19, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  {item.subs.map((s, si) => (
                                    <div key={si} style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.6, fontStyle: 'italic', paddingLeft: 10, borderLeft: `2px solid ${accentBg}` }}>
                                      {s}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    }

                    if (block.type === 'arrow') {
                      return (
                        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 4, marginBottom: 8, paddingLeft: 4 }}>
                          <div style={{ color: accentColor, fontWeight: 800, fontSize: 14, flexShrink: 0, lineHeight: 1.6 }}>→</div>
                          <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65, fontStyle: 'italic' }}>
                            {block.text}
                          </div>
                        </div>
                      );
                    }

                    // Paragraph
                    return (
                      <p key={idx} style={{ fontSize: 15, lineHeight: 1.75, color: '#374151', margin: prev && prev.type === 'paragraph' ? '0 0 14px' : '8px 0 14px' }}>
                        {block.text}
                      </p>
                    );
                  })}

                  {/* Footer article */}
                  <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: accentBg, borderRadius: 999 }}>
                      <Icon name="paw" size={14} color={accentColor} />
                      <span style={{ fontSize: 12, fontWeight: 800, color: accentColor, letterSpacing: 0.3 }}>CaniPlus</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 10 }}>
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
      })()}
    </div>
  );
}
