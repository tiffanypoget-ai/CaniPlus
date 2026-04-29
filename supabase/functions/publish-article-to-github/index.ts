// supabase/functions/publish-article-to-github/index.ts
// -----------------------------------------------------------------------------
// Génère le HTML statique d'un article publié dans Supabase et le pousse sur
// GitHub, dans le dossier du site vitrine (`caniplus-pwa/site-vitrine/blog/`).
// Vercel redéploie automatiquement caniplus.ch après chaque push.
//
// Flow :
//   1. Auth admin par mot de passe (même mécanique que admin-query).
//   2. Fetch l'article demandé + tous les articles publiés (pour l'index).
//   3. Rend deux fichiers HTML : `{slug}.html` + `index.html` (liste mise à jour).
//   4. Push des deux fichiers via l'API GitHub Contents (create or update).
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
//                                   Défaut : `caniplus-pwa/site-vitrine`
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

function labelForCategory(cat: string): string {
  const map: Record<string, string> = {
    education: 'Éducation',
    comportement: 'Comportement',
    sante: 'Santé',
    conseils: 'Conseils',
    actualites: 'Actualités',
  };
  return map[cat] ?? 'Éducation';
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
  const metaKw      = a.meta_keywords || `éducation canine, ${labelForCategory(a.category).toLowerCase()}, CaniPlus, Ballaigues`;
  const url         = `https://caniplus.ch/blog/${a.slug}.html`;
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
${related.map(r => `      <li><a href="/blog/${escapeAttr(r.slug)}.html">${escapeHtml(r.title)}</a></li>`).join('\n')}
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
<meta property="article:published_time" content="${dateIso}T10:00:00+02:00" />
<meta property="article:section" content="${escapeAttr(categoryLbl)}" />

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
  "inLanguage": "fr-CH",
  "articleSection": ${JSON.stringify(categoryLbl)}
}
</script>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Accueil", "item": "https://caniplus.ch/" },
    { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://caniplus.ch/blog/" },
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
        <li><a href="/blog/">Blog</a></li>
        <li><a href="/#evenements">Événements</a></li>
        <li><a href="/#contact">Contact</a></li>
      </ul>
    </nav>
    <a href="https://app.caniplus.ch" class="btn btn-primary">Espace membre</a>
  </div>
</header>

<nav class="breadcrumb" aria-label="Fil d'Ariane">
  <ol>
    <li><a href="/">Accueil</a></li>
    <li><a href="/blog/">Blog</a></li>
    <li>${escapeHtml(title)}</li>
  </ol>
</nav>

<section class="hero-local">
  <div class="container">
    <span class="eyebrow">${escapeHtml(categoryLbl)} · lecture ${readMin} min · ${escapeHtml(dateFr)}</span>
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
        <li><a href="/pages/cours-prive-comportement-chien.html">Cours privés</a></li>
        <li><a href="/pages/cours-collectif-obeissance.html">Cours collectifs</a></li>
        <li><a href="/pages/reeducation-chien-agressif.html">Rééducation</a></li>
        <li><a href="/pages/cours-theorique-education-canine.html">Cours théoriques</a></li>
      </ul>
    </div>
    <div>
      <h4>Zones desservies</h4>
      <ul>
        <li><a href="/pages/educateur-canin-yverdon.html">Yverdon</a></li>
        <li><a href="/pages/educateur-canin-vallorbe.html">Vallorbe</a></li>
        <li><a href="/pages/educateur-canin-orbe.html">Orbe</a></li>
        <li><a href="/pages/educateur-canin-la-sarraz.html">La Sarraz</a></li>
        <li><a href="/pages/educateur-canin-lausanne.html">Lausanne</a></li>
      </ul>
    </div>
    <div>
      <h4>Infos</h4>
      <ul>
        <li><a href="/">Accueil</a></li>
        <li><a href="/blog/">Blog</a></li>
        <li><a href="/legal/mentions-legales.html">Mentions légales</a></li>
        <li><a href="/legal/politique-confidentialite.html">Confidentialité</a></li>
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
    url: `https://caniplus.ch/blog/${a.slug}.html`,
    datePublished: formatDateIso(a.published_at ?? a.created_at),
  }));

  const cards = sorted.map(a => `
      <article class="blog-card">
        <span class="tag">${escapeHtml(labelForCategory(a.category))}</span>
        <h3><a href="/blog/${escapeAttr(a.slug)}.html">${escapeHtml(a.title)}</a></h3>
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
<link rel="canonical" href="https://caniplus.ch/blog/" />

<meta property="og:type" content="website" />
<meta property="og:locale" content="fr_CH" />
<meta property="og:url" content="https://caniplus.ch/blog/" />
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
  url: 'https://caniplus.ch/blog/',
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
    { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://caniplus.ch/blog/" }
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
        <li><a href="/blog/" aria-current="page">Blog</a></li>
        <li><a href="/#evenements">Événements</a></li>
        <li><a href="/#contact">Contact</a></li>
      </ul>
    </nav>
    <a href="https://app.caniplus.ch" class="btn btn-primary">Espace membre</a>
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
    <p>Les articles sont là pour comprendre. Pour un travail concret avec votre chien, le <a href="/pages/cours-prive-comportement-chien.html">cours privé</a> reste le format le plus efficace. Pour les bases et la socialisation régulière, rejoignez-nous en <a href="/pages/cours-collectif-obeissance.html">cours collectif</a>.</p>
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
        <li><a href="/pages/cours-prive-comportement-chien.html">Cours privés</a></li>
        <li><a href="/pages/cours-collectif-obeissance.html">Cours collectifs</a></li>
        <li><a href="/pages/reeducation-chien-agressif.html">Rééducation</a></li>
        <li><a href="/pages/cours-theorique-education-canine.html">Cours théoriques</a></li>
      </ul>
    </div>
    <div>
      <h4>Zones desservies</h4>
      <ul>
        <li><a href="/pages/educateur-canin-yverdon.html">Yverdon</a></li>
        <li><a href="/pages/educateur-canin-vallorbe.html">Vallorbe</a></li>
        <li><a href="/pages/educateur-canin-orbe.html">Orbe</a></li>
        <li><a href="/pages/educateur-canin-la-sarraz.html">La Sarraz</a></li>
        <li><a href="/pages/educateur-canin-lausanne.html">Lausanne</a></li>
      </ul>
    </div>
    <div>
      <h4>Infos</h4>
      <ul>
        <li><a href="/">Accueil</a></li>
        <li><a href="/blog/">Blog</a></li>
        <li><a href="/legal/mentions-legales.html">Mentions légales</a></li>
        <li><a href="/legal/politique-confidentialite.html">Confidentialité</a></li>
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

async function ghGetFileSha(cfg: GhConfig, path: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${cfg.token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'caniplus-publish-bot',
    },
  });
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
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${cfg.token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'caniplus-publish-bot',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub PUT ${path} ${res.status} : ${await res.text()}`);
}

// ── Handler principal ─────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, admin_password, payload } = body ?? {};

    // Auth admin
    const expected = Deno.env.get('ADMIN_PASSWORD') ?? '';
    if (!admin_password || admin_password !== expected) {
      return new Response(
        JSON.stringify({ error: 'Mot de passe incorrect' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Vérification config GitHub
    const token  = Deno.env.get('GITHUB_TOKEN')  ?? '';
    const owner  = Deno.env.get('GITHUB_OWNER')  ?? 'tiffanypoget-ai';
    const repo   = Deno.env.get('GITHUB_REPO')   ?? 'CaniPlus';
    const branch = Deno.env.get('GITHUB_BRANCH') ?? 'main';
    const base   = Deno.env.get('GITHUB_SITE_PATH') ?? 'caniplus-pwa/site-vitrine';
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

      // 5. Marquer l'article comme publié sur le site
      const now = new Date().toISOString();
      const { error: errUpd } = await supabase
        .from('articles')
        .update({ pushed_to_site: true, pushed_at: now })
        .eq('id', article_id);
      if (errUpd) throw errUpd;

      return ok({
        success: true,
        url: `https://caniplus.ch/blog/${article.slug}.html`,
        pushed_at: now,
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
        const delRes = await fetch(
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
        );
        if (!delRes.ok) throw new Error(`GitHub DELETE ${path} ${delRes.status} : ${await delRes.text()}`);
      }

      // Régénérer l'