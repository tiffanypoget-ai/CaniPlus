// supabase/functions/publish-article-to-github/index.ts
// -----------------------------------------------------------------------------
// Génère le HTML statique d'un article publié dans Supabase et le pousse sur
// GitHub, dans le dossier du site vitrine (`site-vitrine/blog/`).
// Vercel redéploie automatiquement caniplus.ch après chaque push.
//
// Flow :
//   1. Auth admin par mot de passe (même mécanique que admin-query).
//   2. Fetch l'article demandé + tous les articles publiés (pour l'index).
//   3. Rend deux fichiers HTML : `{slug}.html` + `index.html` (liste mise à jour).
//   4. Push des deux fichiers via l'API GitHub Contents (create or update).
//   4bis. Met à jour `sitemap.xml` (ajout/retrait de l'entrée de l'article).
//   5. Met à jour `pushed_to_site = true` et `pushed_at = now()` dans Supabase.
//
// Variables d'environnement attendues (Supabase Dashboard → Edge Functions → Secrets) :
//   - ADMIN_PASSWORD              : même valeur que admin-query
//   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY : auto-injectés par Supabase
//   - GITHUB_TOKEN                : Personal Access Token (scope `repo`)
//   - GITHUB_OWNER                : ex. `tiffanypoget-ai`
//   - GITHUB_REPO                 : ex. `CaniPlus`
//   - GITHUB_BRANCH               : ex. `main`
//   - GITHUB_SITE_PATH (optionnel): préfixe du dossier site-vitrine dans le repo.
//                                   Défaut : `site-vitrine`
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Convention d'URL publique ─────────────────────────────────────────────
// `site-vitrine/vercel.json` déclare `cleanUrls: true` et `trailingSlash: false`.
// Conséquence, vérifiée en production le 17.08.2026 :
//   /blog/mon-article.html → 308 → /blog/mon-article
//   /blog/                 → 308 → /blog
// Toute URL publique générée ici (canonique, og:url, JSON-LD, fil d'Ariane,
// liens internes) doit donc être sans extension et sans slash final. Les pages
// statiques corrigées à la main suivent déjà cette convention.
const SITE_URL = 'https://caniplus.ch';
const BLOG_URL = `${SITE_URL}/blog`;

// ── Helpers ────────────────────────────────────────────────────────────────
function ok(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

// ── Nettoyage défensif : marqueurs de conflit Git ─────────────────────────
// Si un article publié contient encore des marqueurs `<<<<<<< HEAD`, `=======`
// ou `>>>>>>> sha`, on les retire avant de générer le HTML statique. Ces
// marqueurs ne devraient JAMAIS arriver jusqu'ici, mais ça s'est déjà produit
// (cf. incident 28 avril 2026 sur "Allergies saisonnières") : on garde la
// version HEAD et on jette la version distante par défaut.
function stripGitConflictMarkers(s: string | null | undefined): string {
  if (!s) return s ?? '';
  // Si pas de marqueur, court-circuit (95 % des cas).
  if (!/<{7}\s*HEAD/.test(s) && !/={7}/.test(s) && !/>{7}\s/.test(s)) return s;
  // Pour chaque bloc de conflit, garde uniquement la partie HEAD (entre
  // `<<<<<<<` et `=======`) et jette le reste jusqu'à `>>>>>>>`.
  return s
    .replace(/<{7}\s*HEAD\s*\n([\s\S]*?)\n={7}\s*\n[\s\S]*?\n>{7}[^\n]*/g, '$1')
    // Ceinture + bretelles : on retire aussi les marqueurs orphelins qui
    // pourraient subsister (ligne `<<<<<<< HEAD`, `=======`, `>>>>>>> abc123`
    // sans bloc complet à matcher).
    .replace(/^<{7}[^\n]*\n?/gm, '')
    .replace(/^={7}[^\n]*\n?/gm, '')
    .replace(/^>{7}[^\n]*\n?/gm, '');
}

// Encodage base64 UTF-8-safe pour l'API GitHub (qui attend du base64).
function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Formate une date ISO vers "DD mois YYYY" (ex. "19 avril 2026").
function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDateIso(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

// Libellés affichés pour les catégories. Doit rester aligné sur
// `categoryConfig` de `src/lib/theme.js`, qui fait référence côté app : c'est
// le même vocabulaire qui apparaît sur les cartes du blog et dans l'app.
// `bien-etre` et `sociabilisation` manquaient ici alors que l'agent éditorial
// les produit depuis mai : cinq articles s'affichaient en « Éducation » sur
// l'index, dans leur bandeau et dans leur `article:section`.
// `conseils` et `actualites` n'existent pas côté app mais sont conservés : de
// vieux articles peuvent encore les porter en base.
function labelForCategory(cat: string): string {
  const map: Record<string, string> = {
    education: 'Éducation',
    comportement: 'Comportement',
    sante: 'Santé',
    securite: 'Sécurité',
    quotidien: 'Quotidien',
    sociabilisation: 'Sociabilisation',
    'bien-etre': 'Bien-être',
    conseils: 'Conseils',
    actualites: 'Actualités',
  };
  // Chaîne vide, et surtout PAS 'Éducation', quand la catégorie est absente.
  // Depuis le retrait des catégories éditoriales (27 août 2026), les nouveaux
  // articles n'en portent plus : retomber sur 'Éducation' les étiquetterait
  // tous faussement, ce qui est précisément l'incident décrit ci-dessus.
  // Les appelants omettent le libellé quand il est vide.
  return map[cat] ?? '';
}

// ── Template d'un article (cohérent avec les 4 articles existants) ────────
type Article = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string; // HTML
  cover_image_url: string | null;
  cover_image_alt: string | null;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  category: string;
  tags: string[] | null;
  read_time_min: number | null;
  author_name: string | null;
  author_role: string | null;
  published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function renderArticleHtml(a: Article, others: Article[]): string {
  // Nettoyage défensif : on jette tout marqueur de conflit Git éventuel
  // avant d'utiliser excerpt/content (cf. incident 28 avril 2026).
  const cleanExcerpt = stripGitConflictMarkers(a.excerpt ?? '');
  const cleanContent = stripGitConflictMarkers(a.content ?? '');
  const title       = a.title;
  const metaTitle   = a.meta_title   || `${title} — CaniPlus`;
  const metaDesc    = a.meta_description || cleanExcerpt || '';
  const kwCat       = labelForCategory(a.category);
  const metaKw      = a.meta_keywords
    || `éducation canine, ${kwCat ? kwCat.toLowerCase() + ', ' : ''}CaniPlus, Ballaigues`;
  // URL publique SANS extension .html : c'est la convention d'indexation du
  // site (cleanUrls + trailingSlash:false dans site-vitrine/vercel.json).
  // `/blog/{slug}.html` redirige en 308 vers `/blog/{slug}` : une canonique en
  // .html se contredirait elle-même. Les CHEMINS de fichiers dans le repo,
  // eux, restent en .html (voir articlePath / indexPath plus bas).
  const url         = `${SITE_URL}/blog/${a.slug}`;
  const ogImg       = a.cover_image_url || 'https://caniplus.ch/images/og-image.jpg';
  const publishedAt = a.published_at ?? a.created_at;
  const dateFr      = formatDateFr(publishedAt);
  const dateIso     = formatDateIso(publishedAt);
  const updatedIso  = formatDateIso(a.updated_at);
  const readMin     = a.read_time_min ?? 5;
  const categoryLbl = labelForCategory(a.category);
  const authorName  = a.author_name || 'Tiffany Cotting';
  const authorRole  = a.author_role || 'Éducatrice canine diplômée';

  // Articles "à lire aussi" : max 3 autres articles publiés, triés par date.
  const related = others
    .filter(x => x.id !== a.id && x.published)
    .sort((x, y) => (y.published_at ?? y.created_at).localeCompare(x.published_at ?? x.created_at))
    .slice(0, 3);

  const relatedHtml = related.length
    ? `
    <h3>À lire aussi</h3>
    <ul>
${related.map(r => `      <li><a href="/blog/${escapeAttr(r.slug)}">${escapeHtml(r.title)}</a></li>`).join('\n')}
    </ul>`
    : '';

  const coverHtml = a.cover_image_url
    ? `
  <div class="container" style="margin:0 auto;max-width:860px;padding:20px;">
    <img src="${escapeAttr(a.cover_image_url)}" alt="${escapeAttr(a.cover_image_alt ?? a.title)}" style="width:100%;height:auto;border-radius:16px;" />
  </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr-CH">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />

<title>${escapeHtml(metaTitle)}</title>
<meta name="description" content="${escapeAttr(metaDesc)}" />
<meta name="keywords" content="${escapeAttr(metaKw)}" />
<meta name="author" content="${escapeAttr(authorName)} — CaniPlus" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${url}" />

<meta property="og:type" content="article" />
<meta property="og:locale" content="fr_CH" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${escapeAttr(metaTitle)}" />
<meta property="og:description" content="${escapeAttr(metaDesc)}" />
<meta property="og:image" content="${escapeAttr(ogImg)}" />
<meta property="og:site_name" content="CaniPlus" />
<meta property="article:author" content="${escapeAttr(authorName)}" />
<meta property="article:published_time" content="${dateIso}T10:00:00+02:00" />${categoryLbl ? `
<meta property="article:section" content="${escapeAttr(categoryLbl)}" />` : ''}

<link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/images/favicon-16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/images/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="#2babe1" />

<!-- JSON-LD Article -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": ${JSON.stringify(title)},
  "description": ${JSON.stringify(metaDesc)},
  "image": ${JSON.stringify(ogImg)},
  "datePublished": "${dateIso}",
  "dateModified": "${updatedIso}",
  "author": {
    "@type": "Person",
    "name": ${JSON.stringify(authorName)},
    "url": "https://caniplus.ch/#tiffany",
    "jobTitle": ${JSON.stringify(authorRole)}
  },
  "publisher": {
    "@type": "Organization",
    "name": "CaniPlus",
    "logo": { "@type": "ImageObject", "url": "https://caniplus.ch/images/logo-caniplus.png" }
  },
  "mainEntityOfPage": { "@type": "WebPage", "@id": "${url}" },
  "inLanguage": "fr-CH"${categoryLbl ? `,
  "articleSection": ${JSON.stringify(categoryLbl)}` : ''}
}
</script>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Accueil", "item": "https://caniplus.ch/" },
    { "@type": "ListItem", "position": 2, "name": "Blog", "item": "${BLOG_URL}" },
    { "@type": "ListItem", "position": 3, "name": ${JSON.stringify(title)}, "item": "${url}" }
  ]
}
</script>

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Great+Vibes&family=Playfair+Display:wght@500;600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/assets/style.css" />
</head>
<body>

<header class="nav">
  <div class="nav-inner">
    <a href="/"><img src="/images/logo-caniplus.png" alt="CaniPlus" class="logo-img" /></a>
    <nav aria-label="Navigation principale">
      <ul>
        <li><a href="/">Accueil</a></li>
        <li><a href="/#approche">Approche</a></li>
        <li><a href="/#prestations">Prestations</a></li>
        <li><a href="/#boutique">Boutique</a></li>
        <li><a href="/#apropos">À propos</a></li>
        <li><a href="/blog">Blog</a></li>
        <li><a href="/#evenements">Événements</a></li>
        <li><a href="/#contact">Contact</a></li>
      </ul>
    </nav>
    <a href="https://app.caniplus.ch" class="btn btn-primary">Mon espace</a>
  </div>
</header>

<nav class="breadcrumb" aria-label="Fil d'Ariane">
  <ol>
    <li><a href="/">Accueil</a></li>
    <li><a href="/blog">Blog</a></li>
    <li>${escapeHtml(title)}</li>
  </ol>
</nav>

<section class="hero-local">
  <div class="container">
    <span class="eyebrow">${categoryLbl ? escapeHtml(categoryLbl) + ' · ' : ''}lecture ${readMin} min · ${escapeHtml(dateFr)}</span>
    <h1>${escapeHtml(title)}</h1>
    ${cleanExcerpt ? `<p class="lead">${escapeHtml(cleanExcerpt)}</p>` : ''}
  </div>
</section>
${coverHtml}
<article class="content">
  <div class="narrow">

${cleanContent}

    <div class="author-bio">
      <img src="/images/photo-tiffany.jpg" alt="${escapeAttr(authorName)}, éducatrice canine CaniPlus" />
      <div>
        <h4>${escapeHtml(authorName)}</h4>
        <p>${escapeHtml(authorRole)}. Diplômée Union Canine Suisse (profil 1+) et CANISCIENTA (profil 2).</p>
      </div>
    </div>
${relatedHtml}
  </div>
</article>

<section class="cta-band">
  <div class="container">
    <h2>Besoin d'un œil extérieur sur votre chien ?</h2>
    <p>Un cours privé peut faire gagner des mois. Parlez-nous de votre situation.</p>
    <a href="/#contact" class="btn btn-primary">Nous contacter</a>
  </div>
</section>

<footer class="site-footer">
  <div class="container">
    <div>
      <img src="/images/logo-caniplus.png" alt="CaniPlus" class="footer-logo" />
      <p>CaniPlus — Éducation canine bienveillante à Ballaigues (Vaud).</p>
    </div>
    <div>
      <h4>Nos prestations</h4>
      <ul>
        <li><a href="/pages/cours-prive-comportement-chien">Cours privés</a></li>
        <li><a href="/pages/cours-collectif-education-canine">Cours collectifs</a></li>
        <li><a href="/pages/reeducation-chien-reactif">Rééducation</a></li>
        <li><a href="/pages/cours-theorique-education-canine">Cours théoriques</a></li>
        <li><a href="/pages/mantrailing-yverdon">Mantrailing (partenariat)</a></li>
      </ul>
    </div>
    <div>
      <h4>Zones desservies</h4>
      <ul>
        <li><a href="/pages/educateur-canin-yverdon">Yverdon</a></li>
        <li><a href="/pages/educateur-canin-vallorbe">Vallorbe</a></li>
        <li><a href="/pages/educateur-canin-orbe">Orbe</a></li>
        <li><a href="/pages/educateur-canin-la-sarraz">La Sarraz</a></li>
        <li><a href="/pages/educateur-canin-lausanne">Lausanne</a></li>
      </ul>
    </div>
    <div>
      <h4>Infos</h4>
      <ul>
        <li><a href="/">Accueil</a></li>
        <li><a href="/blog">Blog</a></li>
        <li><a href="/legal/mentions-legales">Mentions légales</a></li>
        <li><a href="/legal/politique-confidentialite">Confidentialité</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">© 2026 CaniPlus · Ballaigues · Vaud · Suisse</div>
</footer>

</body>
</html>
`;
}

// ── Template de l'index blog (liste des articles publiés) ─────────────────
function renderIndexHtml(allPublished: Article[]): string {
  // Triés par date de publication desc
  const sorted = [...allPublished].sort((a, b) =>
    (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at),
  );

  const blogPostJsonLd = sorted.map(a => ({
    '@type': 'BlogPosting',
    headline: a.title,
    url: `${BLOG_URL}/${a.slug}`,
    datePublished: formatDateIso(a.published_at ?? a.created_at),
  }));

  const cards = sorted.map(a => `
      <article class="blog-card">${labelForCategory(a.category) ? `
        <span class="tag">${escapeHtml(labelForCategory(a.category))}</span>` : ''}
        <h3><a href="/blog/${escapeAttr(a.slug)}">${escapeHtml(a.title)}</a></h3>
        <p>${escapeHtml(stripGitConflictMarkers(a.excerpt ?? ''))}</p>
        <p class="meta">${a.read_time_min ?? 5} min de lecture · ${escapeHtml(formatDateFr(a.published_at ?? a.created_at))}</p>
      </article>`).join('\n');

  return `<!DOCTYPE html>
<html lang="fr-CH">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />

<title>Blog CaniPlus — Articles sur l'éducation canine bienveillante</title>
<meta name="description" content="Articles pratiques sur l'éducation canine : tirage en laisse, socialisation, anxiété de séparation, chien réactif. Écrits par Tiffany Cotting, éducatrice canine à Ballaigues (Vaud)." />
<meta name="keywords" content="blog éducation canine, articles comportement chien, conseils dressage chien, éducateur canin Vaud, CaniPlus" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${BLOG_URL}" />

<meta property="og:type" content="website" />
<meta property="og:locale" content="fr_CH" />
<meta property="og:url" content="${BLOG_URL}" />
<meta property="og:title" content="Blog CaniPlus — Articles sur l'éducation canine" />
<meta property="og:description" content="Articles pratiques, méthodes bienveillantes, conseils testés sur le terrain." />
<meta property="og:image" content="https://caniplus.ch/images/og-image.jpg" />
<meta property="og:site_name" content="CaniPlus" />

<link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/images/favicon-16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/images/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="#2babe1" />

<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: 'Blog CaniPlus',
  description: "Blog d'éducation canine bienveillante à Ballaigues (VD). Articles écrits par Tiffany Cotting, éducatrice diplômée.",
  url: BLOG_URL,
  publisher: {
    '@type': 'Organization',
    name: 'CaniPlus',
    logo: { '@type': 'ImageObject', url: 'https://caniplus.ch/images/logo-caniplus.png' },
  },
  blogPost: blogPostJsonLd,
}, null, 2)}
</script>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Accueil", "item": "https://caniplus.ch/" },
    { "@type": "ListItem", "position": 2, "name": "Blog", "item": "${BLOG_URL}" }
  ]
}
</script>

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Great+Vibes&family=Playfair+Display:wght@500;600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/assets/style.css" />
</head>
<body>

<header class="nav">
  <div class="nav-inner">
    <a href="/"><img src="/images/logo-caniplus.png" alt="CaniPlus" class="logo-img" /></a>
    <nav aria-label="Navigation principale">
      <ul>
        <li><a href="/">Accueil</a></li>
        <li><a href="/#approche">Approche</a></li>
        <li><a href="/#prestations">Prestations</a></li>
        <li><a href="/#boutique">Boutique</a></li>
        <li><a href="/#apropos">À propos</a></li>
        <li><a href="/blog" aria-current="page">Blog</a></li>
        <li><a href="/#evenements">Événements</a></li>
        <li><a href="/#contact">Contact</a></li>
      </ul>
    </nav>
    <a href="https://app.caniplus.ch" class="btn btn-primary">Mon espace</a>
  </div>
</header>

<nav class="breadcrumb" aria-label="Fil d'Ariane">
  <ol>
    <li><a href="/">Accueil</a></li>
    <li>Blog</li>
  </ol>
</nav>

<section class="hero-local">
  <div class="container">
    <span class="eyebrow">Blog · Éducation canine bienveillante</span>
    <h1>Articles sur l'éducation de votre <em>chien</em></h1>
    <p class="lead">Des articles concrets, testés sur le terrain, sans promesse miraculeuse. Écrits par Tiffany Cotting, éducatrice canine à Ballaigues (VD). Notre but : vous donner la bonne clé pour chaque situation, et vous permettre de comprendre <em>pourquoi</em> ça marche.</p>
  </div>
</section>

<article class="content">
  <div class="narrow">
    <h2>Derniers articles</h2>

    <div class="blog-list">${cards}
    </div>

    <h2>Thématiques</h2>
    <p>Le blog couvre principalement :</p>
    <ul>
      <li><strong>Comportement canin</strong> : réactivité, peurs, agressivité, communication</li>
      <li><strong>Chiot</strong> : socialisation, propreté, mordillement, apprentissage</li>
      <li><strong>Marche en laisse</strong> : techniques, matériel, gestion de l'excitation</li>
      <li><strong>Rappel</strong> : construire, renforcer, maintenir</li>
      <li><strong>Vie quotidienne</strong> : anxiété de séparation, voiture, vétérinaire, arrivée d'un bébé</li>
      <li><strong>Santé et éducation</strong> : lien entre douleur et comportement, vieillissement, etc.</li>
    </ul>

    <h2>Besoin d'un accompagnement personnalisé ?</h2>
    <p>Les articles sont là pour comprendre. Pour un travail concret avec votre chien, le <a href="/pages/cours-prive-comportement-chien">cours privé</a> reste le format le plus efficace. Pour les bases et la socialisation régulière, rejoignez-nous en <a href="/pages/cours-collectif-education-canine">cours collectif</a>.</p>
  </div>
</article>

<section class="cta-band">
  <div class="container">
    <h2>Une question qui mériterait un article ?</h2>
    <p>Dites-nous ce qui vous bloque avec votre chien. Vos questions nourrissent le blog.</p>
    <a href="/#contact" class="btn btn-primary">Proposer un sujet</a>
  </div>
</section>

<footer class="site-footer">
  <div class="container">
    <div>
      <img src="/images/logo-caniplus.png" alt="CaniPlus" class="footer-logo" />
      <p>CaniPlus — Éducation canine bienveillante à Ballaigues (Vaud).</p>
    </div>
    <div>
      <h4>Nos prestations</h4>
      <ul>
        <li><a href="/pages/cours-prive-comportement-chien">Cours privés</a></li>
        <li><a href="/pages/cours-collectif-education-canine">Cours collectifs</a></li>
        <li><a href="/pages/reeducation-chien-reactif">Rééducation</a></li>
        <li><a href="/pages/cours-theorique-education-canine">Cours théoriques</a></li>
        <li><a href="/pages/mantrailing-yverdon">Mantrailing (partenariat)</a></li>
      </ul>
    </div>
    <div>
      <h4>Zones desservies</h4>
      <ul>
        <li><a href="/pages/educateur-canin-yverdon">Yverdon</a></li>
        <li><a href="/pages/educateur-canin-vallorbe">Vallorbe</a></li>
        <li><a href="/pages/educateur-canin-orbe">Orbe</a></li>
        <li><a href="/pages/educateur-canin-la-sarraz">La Sarraz</a></li>
        <li><a href="/pages/educateur-canin-lausanne">Lausanne</a></li>
      </ul>
    </div>
    <div>
      <h4>Infos</h4>
      <ul>
        <li><a href="/">Accueil</a></li>
        <li><a href="/blog">Blog</a></li>
        <li><a href="/legal/mentions-legales">Mentions légales</a></li>
        <li><a href="/legal/politique-confidentialite">Confidentialité</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">© 2026 CaniPlus · Ballaigues · Vaud · Suisse</div>
</footer>

</body>
</html>
`;
}

// ── API GitHub (create or update contents) ────────────────────────────────
type GhConfig = { owner: string; repo: string; branch: string; token: string; basePath: string };

// Réessai sur panne transitoire de GitHub.
// Le 17.08.2026, un `503 No server is currently available to service your
// request` a fait échouer la publication : l'article est resté hors ligne
// 4 h 30 pendant que Facebook, Instagram et Google Business pointaient déjà
// dessus. Une seule tentative ne suffit pas. On réessaie sur 5xx, sur 429
// (quota) et sur erreur réseau, avec une attente croissante. Les 4xx (401,
// 403, 404, 422) ne sont pas réessayés : ils ne se répareront pas d'eux-mêmes.
const GH_RETRY_DELAYS_MS = [500, 1500, 4000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ghFetch(url: string, init: RequestInit, label: string): Promise<Response> {
  let lastError = '';
  for (let attempt = 0; attempt <= GH_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const wait = GH_RETRY_DELAYS_MS[attempt - 1];
      console.warn(`[github] ${label} : ${lastError} — nouvelle tentative ${attempt}/${GH_RETRY_DELAYS_MS.length} dans ${wait} ms`);
      await sleep(wait);
    }
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (e) {
      // Erreur réseau : DNS, TLS, connexion coupée. Même traitement qu'un 5xx.
      lastError = (e as Error).message;
      if (attempt === GH_RETRY_DELAYS_MS.length) {
        throw new Error(`GitHub ${label} injoignable après ${attempt + 1} tentatives : ${lastError}`);
      }
      continue;
    }
    if (res.status < 500 && res.status !== 429) return res;
    // On lit le corps pour le message d'erreur et pour libérer la connexion.
    const body = await res.text().catch(() => '');
    lastError = `HTTP ${res.status} ${body.slice(0, 200)}`;
    if (attempt === GH_RETRY_DELAYS_MS.length) {
      throw new Error(`GitHub ${label} ${res.status} après ${attempt + 1} tentatives : ${body}`);
    }
  }
  // Inatteignable : la boucle sort par `return` ou par `throw`.
  throw new Error(`GitHub ${label} : ${lastError}`);
}

async function ghGetFileSha(cfg: GhConfig, path: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await ghFetch(url, {
    headers: {
      'Authorization': `Bearer ${cfg.token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'caniplus-publish-bot',
    },
  }, `GET ${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path} ${res.status} : ${await res.text()}`);
  const body = await res.json();
  return body.sha ?? null;
}

async function ghPutFile(
  cfg: GhConfig,
  path: string,
  contentUtf8: string,
  message: string,
): Promise<void> {
  const sha = await ghGetFileSha(cfg, path);
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
  const body: Record<string, unknown> = {
    message,
    content: toBase64Utf8(contentUtf8),
    branch: cfg.branch,
    committer: { name: 'CaniPlus Bot', email: 'tiffany.poget@gmail.com' },
  };
  if (sha) body.sha = sha;
  const res = await ghFetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${cfg.token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'caniplus-publish-bot',
    },
    body: JSON.stringify(body),
  }, `PUT ${path}`);
  if (!res.ok) throw new Error(`GitHub PUT ${path} ${res.status} : ${await res.text()}`);
}

// ── Sitemap : maintien automatique de sitemap.xml ─────────────────────────
// L'agent éditorial publiait les articles sans mettre à jour le sitemap
// (trou constaté à chaque check SEO hebdo depuis juillet 2026). Correctif :
// à chaque publish/unpublish, l'entrée de l'article est ajoutée/retirée dans
// `site-vitrine/sitemap.xml`, poussée sur GitHub comme les fichiers HTML.
// Les URLs du sitemap sont SANS extension .html (cleanUrls Vercel).

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ghGetFile(cfg: GhConfig, path: string): Promise<{ text: string; sha: string } | null> {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await ghFetch(url, {
    headers: {
      'Authorization': `Bearer ${cfg.token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'caniplus-publish-bot',
    },
  }, `GET ${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path} ${res.status} : ${await res.text()}`);
  const body = await res.json();
  const bin = atob(String(body.content ?? '').replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return { text: new TextDecoder().decode(bytes), sha: body.sha ?? '' };
}

// Met à jour le <lastmod> d'un bloc <url> existant, repéré par son <loc>.
// Retourne null si le bloc n'existe pas dans le XML.
function bumpLastmod(xml: string, loc: string, dateIso: string): string | null {
  const re = new RegExp(`(<loc>${escapeRegex(loc)}</loc>[\\s\\S]*?<lastmod>)[^<]*(</lastmod>)`);
  if (!re.test(xml)) return null;
  return xml.replace(re, `$1${dateIso}$2`);
}

// Transformation pure du XML : ajoute/rafraîchit ou retire l'entrée d'un
// article, normalise les anciennes formes d'URL, rafraîchit le lastmod de
// l'index. Séparée de l'accès réseau pour être vérifiable hors ligne.
function applySitemapChange(
  xmlIn: string,
  slug: string,
  dateIso: string,
  mode: 'add' | 'remove',
): string {
  // Normalisation des anciennes formes d'URL, une fois pour toutes : le
  // sitemap contenait `<loc>https://caniplus.ch/blog/</loc>` (slash final) et,
  // avant juillet 2026, des `<loc>.../blog/{slug}.html</loc>`. Les deux
  // redirigent en 308 : un sitemap qui les déclare envoie Google sur des
  // redirections au lieu des URLs finales. On les corrige ici, ce qui fait que
  // le sitemap se répare tout seul à la prochaine publication.
  let xml = xmlIn
    .replace(/<loc>https:\/\/caniplus\.ch\/blog\/<\/loc>/g, `<loc>${BLOG_URL}</loc>`)
    .replace(/(<loc>https:\/\/caniplus\.ch\/blog\/[a-z0-9-]+)\.html(<\/loc>)/g, '$1$2');

  const loc = `${BLOG_URL}/${slug}`;

  if (mode === 'add') {
    const bumped = bumpLastmod(xml, loc, dateIso);
    if (bumped) {
      // Republication : l'entrée existe déjà, on rafraîchit juste la date.
      xml = bumped;
    } else {
      const entry = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${dateIso}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
      // Insertion en fin de section blog (avant les pages légales),
      // sinon juste avant </urlset> en secours.
      if (/\n*(  <!-- Pages légales -->)/.test(xml)) {
        xml = xml.replace(/\n*(  <!-- Pages légales -->)/, `\n${entry}\n$1`);
      } else {
        xml = xml.replace('</urlset>', `${entry}</urlset>`);
      }
    }
  } else {
    // remove : on retire le bloc <url> complet de cet article.
    const re = new RegExp(`\\s*<url>\\s*<loc>${escapeRegex(loc)}</loc>[\\s\\S]*?</url>`);
    xml = xml.replace(re, '');
  }

  // Le contenu de l'index du blog change aussi : on rafraîchit son lastmod.
  return bumpLastmod(xml, BLOG_URL, dateIso) ?? xml;
}

// Ajoute (ou met à jour) l'entrée d'un article dans le sitemap, ou la retire,
// et rafraîchit le lastmod de l'index du blog. Ne jette JAMAIS : si le sitemap
// ne peut pas être mis à jour, la publication reste valide et on renvoie false
// (le check SEO hebdo rattrapera).
async function updateSitemapForArticle(
  cfg: GhConfig,
  slug: string,
  dateIso: string,
  mode: 'add' | 'remove',
): Promise<boolean> {
  try {
    const path = `${cfg.basePath}/sitemap.xml`;
    const file = await ghGetFile(cfg, path);
    if (!file) {
      console.error(`Sitemap introuvable : ${path}`);
      return false;
    }
    const xml = applySitemapChange(file.text, slug, dateIso, mode);
    if (xml === file.text) return true; // rien à pousser
    const sign = mode === 'add' ? '+' : '-';
    await ghPutFile(cfg, path, xml, `seo: sitemap ${sign} blog/${slug}`);
    return true;
  } catch (e) {
    console.error('Sitemap non mis à jour :', e);
    return false;
  }
}

// ── Handler principal ─────────────────────────────────────────────────────

// ─── Auth duale : JWT d'un compte admin (nouveau) OU mot de passe legacy ───
async function isAdminAuthorized(req, supabase, admin_password) {
  const expected = Deno.env.get('ADMIN_PASSWORD') ?? '';
  if (admin_password && expected && admin_password === expected) return true;
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return false;
    const { data } = await supabase.auth.getUser(jwt);
    const uid = data?.user?.id;
    if (!uid) return false;
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
    return prof?.role === 'admin';
  } catch (_e) { return false; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, admin_password, payload } = body ?? {};

    // Auth admin (JWT compte admin OU mot de passe legacy)
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    if (!(await isAdminAuthorized(req, authClient, admin_password))) {
      return new Response(
        JSON.stringify({ error: 'Accès refusé : connecte-toi avec un compte admin' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Vérification config GitHub
    const token  = Deno.env.get('GITHUB_TOKEN')  ?? '';
    const owner  = Deno.env.get('GITHUB_OWNER')  ?? 'tiffanypoget-ai';
    const repo   = Deno.env.get('GITHUB_REPO')   ?? 'CaniPlus';
    const branch = Deno.env.get('GITHUB_BRANCH') ?? 'main';
    const base   = Deno.env.get('GITHUB_SITE_PATH') ?? 'site-vitrine';
    if (!token) throw new Error('GITHUB_TOKEN manquant — ajoute-le dans les Secrets Supabase.');
    const cfg: GhConfig = { owner, repo, branch, token, basePath: base };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── Action : publier un article vers caniplus.ch ─────────────────────
    if (action === 'publish') {
      const { article_id } = payload ?? {};
      if (!article_id) throw new Error('article_id manquant');

      // 1. Charger l'article à publier
      const { data: article, error: errArt } = await supabase
        .from('articles')
        .select('*')
        .eq('id', article_id)
        .single();
      if (errArt) throw errArt;
      if (!article) throw new Error('Article introuvable');
      if (!article.published) {
        throw new Error("L'article doit d'abord être marqué comme 'publié' avant d'être poussé sur caniplus.ch.");
      }

      // 2. Charger tous les articles publiés (pour l'index + related)
      const { data: allPub, error: errAll } = await supabase
        .from('articles')
        .select('*')
        .eq('published', true)
        .order('published_at', { ascending: false });
      if (errAll) throw errAll;
      const published: Article[] = allPub ?? [];

      // 3. Générer les HTML
      const articleHtml = renderArticleHtml(article as Article, published);
      const indexHtml   = renderIndexHtml(published);

      // 4. Push sur GitHub
      const articlePath = `${base}/blog/${article.slug}.html`;
      const indexPath   = `${base}/blog/index.html`;
      await ghPutFile(cfg, articlePath, articleHtml, `blog: publish ${article.slug}`);
      await ghPutFile(cfg, indexPath,   indexHtml,   `blog: rebuild index after ${article.slug}`);

      // 4bis. Mettre à jour le sitemap (n'échoue jamais le publish)
      const sitemapOk = await updateSitemapForArticle(
        cfg,
        article.slug,
        formatDateIso(article.published_at ?? article.created_at),
        'add',
      );

      // 5. Marquer l'article comme publié sur le site
      const now = new Date().toISOString();
      const { error: errUpd } = await supabase
        .from('articles')
        .update({ pushed_to_site: true, pushed_at: now })
        .eq('id', article_id);
      if (errUpd) throw errUpd;

      return ok({
        success: true,
        url: `${BLOG_URL}/${article.slug}`,
        pushed_at: now,
        sitemap_updated: sitemapOk,
      });
    }

    // ── Action : retirer un article de caniplus.ch ───────────────────────
    if (action === 'unpublish') {
      const { article_id } = payload ?? {};
      if (!article_id) throw new Error('article_id manquant');

      const { data: article, error: errArt } = await supabase
        .from('articles')
        .select('*')
        .eq('id', article_id)
        .single();
      if (errArt) throw errArt;
      if (!article) throw new Error('Article introuvable');

      // Supprimer le fichier sur GitHub (DELETE /contents/)
      const path = `${base}/blog/${article.slug}.html`;
      const sha = await ghGetFileSha(cfg, path);
      if (sha) {
        const delRes = await ghFetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github+json',
              'Content-Type': 'application/json',
              'User-Agent': 'caniplus-publish-bot',
            },
            body: JSON.stringify({
              message: `blog: unpublish ${article.slug}`,
              sha,
              branch,
              committer: { name: 'CaniPlus Bot', email: 'tiffany.poget@gmail.com' },
            }),
          },
          `DELETE ${path}`,
        );
        if (!delRes.ok) throw new Error(`GitHub DELETE ${path} ${delRes.status} : ${await delRes.text()}`);
      }

      // Régénérer l'index sans cet article
      const { data: allPub } = await supabase
        .from('articles')
        .select('*')
        .eq('published', true)
        .neq('id', article_id)
        .order('published_at', { ascending: false });
      const indexHtml = renderIndexHtml((allPub ?? []) as Article[]);
      await ghPutFile(cfg, `${base}/blog/index.html`, indexHtml, `blog: rebuild index after unpublish ${article.slug}`);

      // Retirer l'article du sitemap (n'échoue jamais l'unpublish)
      const sitemapOk = await updateSitemapForArticle(
        cfg,
        article.slug,
        new Date().toISOString().slice(0, 10),
        'remove',
      );

      // Marquer en base
      await supabase
        .from('articles')
        .update({ pushed_to_site: false, pushed_at: null })
        .eq('id', article_id);

      return ok({ success: true, sitemap_updated: sitemapOk });
    }

    // ── Action : régénérer uniquement l'index (utile si on modifie des articles sans republier) ──
    if (action === 'rebuild_index') {
      const { data: allPub, error } = await supabase
        .from('articles')
        .select('*')
        .eq('published', true)
        .order('published_at', { ascending: false });
      if (error) throw error;
      const indexHtml = renderIndexHtml((allPub ?? []) as Article[]);
      await ghPutFile(cfg, `${base}/blog/index.html`, indexHtml, 'blog: rebuild index');
      return ok({ success: true });
    }

    throw new Error(`Action inconnue : ${action}`);

  } catch (err: unknown) {
    let message = 'Erreur inconnue';
    if (err instanceof Error) message = err.message;
    else if (typeof err === 'string') message = err;
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
