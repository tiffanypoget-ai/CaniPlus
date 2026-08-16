// src/components/BundlePreview.jsx
// Aperçus « tels que le public les verra » des volets d'un bundle éditorial,
// pour la vue de relecture admin (16.08.2026).
//
// Chaque volet a son rendu :
//   - blog      : HTML rendu avec la typo du site (Playfair Display / Inter),
//                 couverture en tête, aucune balise visible
//   - premium   : format texte CaniPlus rendu comme dans l'app (PremiumBlocks)
//   - instagram : carrousel de slides + caption et hashtags dessous
//   - gbp/notif : texte simple mis en forme
//
// Le code source (HTML / texte brut) reste accessible via l'onglet « Éditer »
// de l'éditeur, mais l'aperçu est la vue par défaut.

import { useEffect, useState } from 'react';
import Icon from './Icons';
import PremiumBlocks from './PremiumBlocks';
import { parseContent } from '../lib/premiumContent';

const C = {
  cyan: '#2BABE1', bleuTexte: '#176E94', ink: '#1F1F20', inkSoft: '#3d3d3d',
  sand: '#f8f5f0', cyanLight: '#e8f6fc', border: '#e6e9ec', gray: '#6b7280',
  orange: '#d97706', orangeBg: '#fef3c7',
};

// Typo du site-vitrine (site-vitrine/assets/style.css) appliquée au HTML de
// l'article. Les polices sont déjà chargées par public/index.html.
const BLOG_CSS = `
.cp-blog-preview { font-family: 'Inter', sans-serif; color: ${C.ink}; line-height: 1.65; font-size: 15.5px; }
.cp-blog-preview h1, .cp-blog-preview h2, .cp-blog-preview h3 {
  font-family: 'Playfair Display', serif; font-weight: 600; line-height: 1.25; color: ${C.ink};
}
.cp-blog-preview h2 { font-size: 25px; margin: 30px 0 12px; }
.cp-blog-preview h3 { font-size: 19px; margin: 24px 0 10px; }
.cp-blog-preview p { margin: 0 0 16px; }
.cp-blog-preview ul, .cp-blog-preview ol { margin: 0 0 16px; padding-left: 22px; }
.cp-blog-preview li { margin-bottom: 7px; }
.cp-blog-preview strong { font-weight: 700; }
.cp-blog-preview a { color: ${C.bleuTexte}; text-decoration: underline; text-underline-offset: 3px; }
.cp-blog-preview blockquote {
  margin: 0 0 16px; padding: 10px 16px; border-left: 4px solid ${C.cyan};
  background: ${C.cyanLight}; border-radius: 0 10px 10px 0;
}
`;

function Empty({ children }) {
  return (
    <div style={{ padding: 28, textAlign: 'center', color: C.gray, fontSize: 13, background: '#fafafa', borderRadius: 12, border: `1px dashed ${C.border}` }}>
      {children}
    </div>
  );
}

// ─── Couverture ───────────────────────────────────────────────────────────────
export function CoverImage({ url, alt, rounded = 14 }) {
  if (!url) return null;
  return (
    <figure style={{ margin: '0 0 20px' }}>
      <img
        src={url}
        alt={alt || ''}
        style={{ width: '100%', borderRadius: rounded, display: 'block', background: C.sand }}
      />
      {alt && (
        <figcaption style={{ fontSize: 11.5, color: C.gray, marginTop: 7, fontStyle: 'italic', lineHeight: 1.5 }}>
          {alt}
        </figcaption>
      )}
    </figure>
  );
}

// ─── Blog ─────────────────────────────────────────────────────────────────────
export function BlogPreview({ blog }) {
  const b = blog ?? {};
  if (!b.title && !b.content_html) return <Empty>Pas encore de contenu blog.</Empty>;
  return (
    <div>
      <style>{BLOG_CSS}</style>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <CoverImage url={b.cover_image_url} alt={b.cover_image_alt} />
        {b.category && (
          <div style={{ display: 'inline-block', background: C.cyanLight, color: C.bleuTexte, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            {b.category}
          </div>
        )}
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 31, fontWeight: 700, lineHeight: 1.2, color: C.ink, margin: '0 0 12px' }}>
          {b.title}
        </h1>
        {b.excerpt && (
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 16.5, color: C.inkSoft, lineHeight: 1.6, margin: '0 0 8px' }}>
            {b.excerpt}
          </p>
        )}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 12, color: C.gray, paddingBottom: 18, marginBottom: 22, borderBottom: `1px solid ${C.border}` }}>
          <span>Tiffany Cotting</span>
          {b.read_time_min ? <span>· {b.read_time_min} min de lecture</span> : null}
          {b.slug ? <span style={{ fontFamily: 'monospace', fontSize: 11 }}>· /blog/{b.slug}</span> : null}
        </div>
        <div className="cp-blog-preview" dangerouslySetInnerHTML={{ __html: b.content_html ?? '' }} />
        {Array.isArray(b.tags) && b.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 26, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
            {b.tags.map((t, i) => (
              <span key={i} style={{ background: '#f3f4f6', color: C.gray, fontSize: 11, padding: '4px 9px', borderRadius: 7 }}>#{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Premium ──────────────────────────────────────────────────────────────────
export function PremiumPreview({ premium, category }) {
  const p = premium ?? {};
  const text = p.body_markdown ?? p.body ?? '';
  if (!p.title && !text) return <Empty>Pas encore de ressource premium.</Empty>;
  const accentColor = C.cyan;
  const accentBg = C.cyanLight;
  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* En-tête de la modale de lecture de l'app */}
      <div style={{ background: `linear-gradient(140deg, ${accentColor}, ${accentColor}dd)`, borderRadius: '18px 18px 0 0', padding: '24px 26px 22px', color: '#fff' }}>
        {category && (
          <div style={{ background: 'rgba(255,255,255,0.22)', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, display: 'inline-block', textTransform: 'uppercase', marginBottom: 12 }}>
            {category}
          </div>
        )}
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.25, marginBottom: p.description ? 8 : 0 }}>{p.title}</div>
        {p.description && (
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.92)', lineHeight: 1.5 }}>{p.description}</div>
        )}
      </div>
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 18px 18px', padding: '24px 26px 30px' }}>
        <PremiumBlocks blocks={parseContent(text)} accentColor={accentColor} accentBg={accentBg} />
      </div>
    </div>
  );
}

// ─── Instagram ────────────────────────────────────────────────────────────────
// Carrousel navigable : les PNG/JPEG rendus s'ils existent, sinon une carte
// texte reprenant la mise en page des slides pour relire quand même le contenu.
export function InstagramPreview({ insta }) {
  const ig = insta ?? {};
  const slides = Array.isArray(ig.slides) ? ig.slides : [];
  const urls = Array.isArray(ig.image_urls) ? ig.image_urls : [];
  const total = Math.max(slides.length, urls.length);
  const [idx, setIdx] = useState(0);

  useEffect(() => { setIdx(i => Math.min(i, Math.max(0, total - 1))); }, [total]);

  if (total === 0) return <Empty>Pas encore de slides Instagram.</Empty>;

  const slide = slides[idx] ?? {};
  const url = urls[idx];
  const go = (d) => setIdx(i => (i + d + total) % total);

  return (
    <div style={{ maxWidth: 470, margin: '0 auto' }}>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
        {/* Barre de compte, comme un vrai post */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: C.cyanLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="paw" size={15} color={C.cyan} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>caniplus_ch</div>
        </div>

        <div style={{ position: 'relative', background: C.sand }}>
          {url ? (
            <img src={url} alt={`Slide ${idx + 1}`} style={{ width: '100%', display: 'block', aspectRatio: '4 / 5', objectFit: 'cover' }} />
          ) : (
            // Aucune image rendue : on montre le texte dans un cadre au bon ratio
            <div style={{ aspectRatio: '4 / 5', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '34px 30px', borderLeft: `6px solid ${C.cyan}` }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, color: C.ink, lineHeight: 1.2 }}>
                {slide.title}
              </div>
              <div style={{ width: 44, height: 4, background: C.cyan, borderRadius: 2, margin: '16px 0' }} />
              <div style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.55 }}>{slide.body}</div>
              <div style={{ marginTop: 20, fontSize: 11, color: C.orange, fontWeight: 700 }}>
                Aperçu texte : cette slide n'a pas encore été rendue en image
              </div>
            </div>
          )}
          {total > 1 && (
            <>
              <button onClick={() => go(-1)} aria-label="Slide précédente"
                style={navBtn('left')}>‹</button>
              <button onClick={() => go(1)} aria-label="Slide suivante"
                style={navBtn('right')}>›</button>
              <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }}>
                {idx + 1}/{total}
              </div>
            </>
          )}
        </div>

        {/* Points de pagination */}
        {total > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 5, padding: '9px 0 4px' }}>
            {Array.from({ length: total }).map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} aria-label={`Slide ${i + 1}`}
                style={{ width: 6, height: 6, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer', background: i === idx ? C.cyan : '#d1d5db' }} />
            ))}
          </div>
        )}

        {/* Caption + hashtags, comme sous un vrai post */}
        <div style={{ padding: '10px 14px 16px' }}>
          {ig.caption && (
            <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              <strong style={{ fontWeight: 700 }}>caniplus_ch</strong> {ig.caption}
            </div>
          )}
          {Array.isArray(ig.hashtags) && ig.hashtags.length > 0 && (
            <div style={{ fontSize: 13, color: C.bleuTexte, lineHeight: 1.6, marginTop: 8 }}>
              {ig.hashtags.join(' ')}
            </div>
          )}
        </div>
      </div>

      {/* Texte de la slide courante, pour relire sans zoomer sur l'image */}
      {url && (slide.title || slide.body) && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: '#f9fafb', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 12.5, color: C.gray, lineHeight: 1.5 }}>
          <strong style={{ color: C.ink }}>{slide.title}</strong>
          {slide.body ? ` · ${slide.body}` : ''}
        </div>
      )}
    </div>
  );
}

function navBtn(side) {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    [side]: 8, width: 34, height: 34, borderRadius: '50%', border: 'none',
    background: 'rgba(255,255,255,0.9)', color: C.ink, fontSize: 21, lineHeight: '30px',
    cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', padding: 0,
  };
}

// ─── Google Business ──────────────────────────────────────────────────────────
export function GoogleBusinessPreview({ gbp, coverUrl, articleSlug }) {
  const g = gbp ?? {};
  if (!g.title && !g.body) return <Empty>Pas encore de post Google Business.</Empty>;
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
      {coverUrl && <img src={coverUrl} alt="" style={{ width: '100%', display: 'block', aspectRatio: '16 / 9', objectFit: 'cover' }} />}
      <div style={{ padding: '16px 18px 20px' }}>
        <div style={{ fontSize: 11, color: C.gray, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          CaniPlus · Ballaigues
        </div>
        {g.title && <div style={{ fontSize: 17, fontWeight: 800, color: C.ink, marginBottom: 9, lineHeight: 1.3 }}>{g.title}</div>}
        <div style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{g.body}</div>
        {g.cta && (
          <div style={{ marginTop: 16, display: 'inline-block', border: `1px solid ${C.cyan}`, color: C.bleuTexte, fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 999 }}>
            {g.cta}
          </div>
        )}
        {articleSlug && (
          <div style={{ fontSize: 11, color: C.gray, marginTop: 10, fontFamily: 'monospace' }}>
            caniplus.ch/blog/{articleSlug}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Facebook ─────────────────────────────────────────────────────────────────
// Il n'y a pas de contenu Facebook stocké : editorial-bundle-actions fabrique
// le post à la publication à partir de ce qui existe déjà. On reproduit ici la
// même dérivation, à l'identique, pour que l'aperçu dise la vérité.
//
//   texte    = google_business.body > instagram.caption > blog.excerpt > blog.title
//   lien     = caniplus.ch/blog/<slug>
//   vignette = og:image de la page article, posée par publish-article-to-github :
//              cover_image_url, sinon l'image générique du site
const OG_FALLBACK = 'https://caniplus.ch/images/og-image.jpg';

export function facebookPostFrom(bundle) {
  const blog = bundle?.content_blog ?? {};
  const gbp = bundle?.content_google_business ?? {};
  const insta = bundle?.content_instagram ?? {};
  const message = gbp.body || insta.caption || blog.excerpt || blog.title || '';
  const slug = blog.slug || null;
  return {
    message,
    slug,
    link: slug ? `https://caniplus.ch/blog/${slug}` : null,
    source: gbp.body ? 'Google Business' : insta.caption ? 'la caption Instagram' : blog.excerpt ? "l'excerpt de l'article" : 'le titre de l’article',
    ogTitle: blog.meta_title || (blog.title ? `${blog.title} — CaniPlus` : ''),
    ogDescription: blog.meta_description || blog.excerpt || '',
    ogImage: blog.cover_image_url || OG_FALLBACK,
    usesFallbackImage: !blog.cover_image_url,
  };
}

export function FacebookPreview({ bundle }) {
  const fb = facebookPostFrom(bundle);
  if (!fb.message && !fb.link) return <Empty>Pas encore de quoi composer le post Facebook.</Empty>;

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 13px' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: C.cyanLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="paw" size={16} color={C.cyan} />
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>CaniPlus</div>
            <div style={{ fontSize: 11, color: C.gray }}>maintenant</div>
          </div>
        </div>

        <div style={{ padding: '0 13px 12px', fontSize: 14, color: C.ink, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          {fb.message}
        </div>

        {/* Carte de lien : c'est Facebook qui la fabrique depuis les balises og: */}
        {fb.link && (
          <div style={{ borderTop: `1px solid ${C.border}`, background: '#f0f2f5' }}>
            <img src={fb.ogImage} alt="" style={{ width: '100%', display: 'block', aspectRatio: '1.91 / 1', objectFit: 'cover', background: C.sand }} />
            <div style={{ padding: '10px 13px 12px', borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.4 }}>caniplus.ch</div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink, margin: '3px 0 2px', lineHeight: 1.3 }}>{fb.ogTitle}</div>
              {fb.ogDescription && (
                <div style={{ fontSize: 12.5, color: C.gray, lineHeight: 1.45 }}>{fb.ogDescription}</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, background: '#f9fafb', border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 13px', fontSize: 12, color: C.gray, lineHeight: 1.6 }}>
        Ce volet n'est pas modifiable ici : le post est composé automatiquement à la publication.
        Le texte reprend <strong style={{ color: C.ink }}>{fb.source}</strong>, modifie-le dans cet onglet-là.
        La vignette est l'image de couverture, récupérée par Facebook sur la page de l'article.
      </div>

      {!fb.link && (
        <div style={{ marginTop: 10, background: C.orangeBg, color: C.orange, border: '1px solid #fcd34d', borderRadius: 9, padding: '9px 11px', fontSize: 12, lineHeight: 1.5 }}>
          <Icon name="warning" size={12} color={C.orange} /> Pas de slug d'article : sans lien, la publication Facebook sera sautée.
        </div>
      )}
      {fb.usesFallbackImage && (
        <div style={{ marginTop: 10, background: C.orangeBg, color: C.orange, border: '1px solid #fcd34d', borderRadius: 9, padding: '9px 11px', fontSize: 12, lineHeight: 1.5 }}>
          <Icon name="warning" size={12} color={C.orange} /> Pas de couverture : Facebook affichera l'image générique du site.
        </div>
      )}
    </div>
  );
}

// ─── Notification push ────────────────────────────────────────────────────────
export function NotificationPreview({ notif }) {
  const n = notif ?? {};
  if (!n.title && !n.body) return <Empty>Pas encore de notification.</Empty>;
  return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 16, padding: '14px 16px', display: 'flex', gap: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: C.cyanLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="paw" size={19} color={C.cyan} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 3 }}>CaniPlus · maintenant</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 3, lineHeight: 1.3 }}>{n.title}</div>
          <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.5 }}>{n.body}</div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.gray, textAlign: 'center', marginTop: 8 }}>
        Aperçu de la notification push envoyée aux membres.
      </div>
    </div>
  );
}

// ─── Bandeau images ───────────────────────────────────────────────────────────
// Couverture + état des slides + boutons de régénération, visibles quel que
// soit l'onglet ouvert.
export function ImagesBar({
  bundle, onRegenerateCover, onRerenderSlides,
  regeneratingCover, rerenderingSlides, readOnly,
}) {
  const blog = bundle?.content_blog ?? {};
  const insta = bundle?.content_instagram ?? {};
  const slideCount = Array.isArray(insta.image_urls) ? insta.image_urls.length : 0;
  const expected = Array.isArray(insta.slides) ? insta.slides.length : 0;
  const hasCover = !!blog.cover_image_url;
  const missing = !hasCover || slideCount === 0;

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ width: 148, flexShrink: 0 }}>
          {hasCover ? (
            <img src={blog.cover_image_url} alt={blog.cover_image_alt || ''}
              style={{ width: '100%', borderRadius: 9, display: 'block', aspectRatio: '16 / 9', objectFit: 'cover', background: C.sand }} />
          ) : (
            <div style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 9, background: '#f3f4f6', border: `1px dashed ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: C.gray }}>
              pas de couverture
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            Images
          </div>
          <div style={{ fontSize: 12.5, color: C.gray, lineHeight: 1.6 }}>
            <div>
              Couverture : {hasCover ? 'générée' : 'absente'}
              {bundle?.cover_breed ? ` · ${bundle.cover_breed}` : ''}
            </div>
            <div>
              Slides Instagram : {slideCount > 0 ? `${slideCount} rendue${slideCount > 1 ? 's' : ''}` : 'aucune'}
              {expected > 0 ? ` sur ${expected} prévue${expected > 1 ? 's' : ''}` : ''}
            </div>
            {blog.cover_image_alt && (
              <div style={{ marginTop: 4, fontStyle: 'italic' }}>Alt : {blog.cover_image_alt}</div>
            )}
          </div>

          {!readOnly && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 11 }}>
              <button
                onClick={onRegenerateCover}
                disabled={regeneratingCover || rerenderingSlides}
                style={smallBtn(regeneratingCover ? '#9ca3af' : C.cyan)}
              >
                {regeneratingCover ? 'Génération…' : hasCover ? 'Régénérer la couverture' : 'Générer la couverture'}
              </button>
              <button
                onClick={onRerenderSlides}
                disabled={rerenderingSlides || regeneratingCover || expected === 0}
                style={smallBtn(rerenderingSlides || expected === 0 ? '#9ca3af' : C.ink)}
              >
                {rerenderingSlides ? 'Rendu…' : 'Re-rendre les slides'}
              </button>
            </div>
          )}
        </div>
      </div>

      {missing && (
        <div style={{ marginTop: 12, background: C.orangeBg, color: C.orange, border: '1px solid #fcd34d', borderRadius: 9, padding: '9px 11px', fontSize: 12, lineHeight: 1.5 }}>
          <Icon name="warning" size={12} color={C.orange} />{' '}
          {!hasCover && slideCount === 0
            ? "Ce bundle n'a ni couverture ni slides. La publication reste possible : l'article partira avec l'image générique et Instagram sera sauté."
            : !hasCover
              ? "Pas de couverture : l'article partira avec l'image générique (og:image) sur Facebook et Google Business."
              : 'Pas de slides rendues : Instagram publiera une image unique (la couverture) au lieu du carrousel.'}
        </div>
      )}
    </div>
  );
}

function smallBtn(bg) {
  return {
    background: bg, color: '#fff', border: 'none', borderRadius: 8,
    padding: '8px 13px', fontSize: 12, fontWeight: 700,
    cursor: bg === '#9ca3af' ? 'not-allowed' : 'pointer',
  };
}
