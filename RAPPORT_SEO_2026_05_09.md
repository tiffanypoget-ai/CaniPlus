# Rapport SEO — Travail autonome du 9 mai 2026

Tiffany, voici tout ce que j'ai fait pendant que tu étais partie chercher ton fils.

## 🎯 Cause racine identifiée

**Vercel a `cleanUrls: true`** → toutes les URLs `.html` redirigent (308) vers les versions sans `.html`. Mais le sitemap et tous les liens internes du site référençaient les `.html` → Google voyait toutes ces URLs comme "Page avec redirection" et indexait moins bien.

Les **3 motifs problématiques** détectés sur Google Search Console venaient tous de ce même problème.

## ✅ Corrections appliquées

### 1. Sitemap.xml refait à neuf
- 15 URLs en clean URLs (sans `.html`)
- Ajout de `/blog/chien-tire-laisse-autre-chien` qui était oubliée
- `lastmod` mis à jour au 2026-05-09

### 2. Tous les liens internes corrigés (224 remplacements)
- 15 fichiers HTML modifiés
- Toutes les URLs `/pages/x.html`, `/blog/x.html`, `/legal/x.html` → clean URLs
- Les `<link rel="canonical">` mis à jour
- Les balises `og:url` mises à jour

### 3. Schemas JSON-LD corrigés (20 remplacements)
- `"url"`, `"@id"`, `"item"` dans les BreadcrumbList et autres schemas
- Cohérence totale avec les URLs canoniques servies

### 4. Liens cassés réparés (4 corrections)
- `/legal/confidentialite` → `/legal/politique-confidentialite` (404 fixé sur la home)
- `/blog/chien-tire-laisse` → `/blog/chien-tire-laisse-autre-chien` (cours privé)
- 2 liens vers articles inexistants retirés (chien réactif, anxiété de séparation)

### 5. Meta tags optimisés (12 fichiers)
| Page | Avant | Après |
|---|---|---|
| index.html title | 88c (tronqué Google) | 47c ✓ |
| index.html desc | 244c (tronquée) | 153c ✓ |
| blog/index desc | 181c | 143c ✓ |
| mentions légales title | 27c (trop court) | 52c ✓ |
| politique confidentialité desc | 167c | 124c ✓ |
| cours privé desc | 194c | 127c ✓ |
| rééducation desc | 178c | 132c ✓ |
| educateur-canin-* (5 pages) | titles 69-86c, descs 171-193c | tous dans 47-53c et 124-137c ✓ |

Plus de doublons title/description.

### 6. Maquette mise en noindex
`maquette-accueil-caniplus.html` n'est pas une vraie page → balise `<meta name="robots" content="noindex, nofollow">` ajoutée pour éviter le contenu dupliqué avec la home.

### 7. IndexNow configuré pour Bing
- Clé générée : `12c64ed67bc7da9cd418df36f87b4e01`
- Fichier validation : `site-vitrine/12c64ed67bc7da9cd418df36f87b4e01.txt`
- Script de ping : `site-vitrine/indexnow-ping.js`

## 📋 Ce qu'il faut que tu fasses maintenant

### Étape 1 — Pousser sur GitHub
1. Ouvrir GitHub Desktop
2. Tu verras ~17 fichiers modifiés dans `site-vitrine/`
3. Commit message suggéré : `SEO : sitemap clean URLs + liens internes + meta tags + IndexNow`
4. Commit to main → Push origin
5. Vercel redéploie tout seul (~1 min)

### Étape 2 — Pinger IndexNow (après déploiement)
Dans le dossier `site-vitrine/` :
```
node indexnow-ping.js
```
Ça va notifier Bing + tous les moteurs IndexNow que les URLs ont changé. Bing devrait lire la clé dans le fichier .txt déployé et accepter le ping.

### Étape 3 — Re-soumettre le sitemap dans GSC
1. Aller sur [Google Search Console > Sitemaps](https://search.google.com/search-console/sitemaps?resource_id=sc-domain:caniplus.ch)
2. Supprimer l'ancien `sitemap.xml`
3. Re-soumettre `sitemap.xml`
4. Google va relancer le crawl avec les nouvelles clean URLs

### Étape 4 — Répondre à dan cotting (1 min)
[Avis Google Business](https://business.google.com/reviews) → un simple "Merci dan !" suffit.

## 📈 Impact attendu

D'ici 1-2 semaines, sur Google Search Console :
- Les 3 motifs problématiques (Page avec redirection ÉCHEC, Erreur liée à des redirections, Exclue par noindex) doivent disparaître
- Le nombre de pages indexées doit passer de **10 → 14-15** (sur 15 du sitemap)
- Les "Détectée, actuellement non indexée" (10 pages) doivent baisser car Google va revoir le site avec les bonnes URLs

D'ici 1 mois :
- CTR encore meilleur grâce aux meta descriptions optimisées
- Bing devrait commencer à indexer plus vite grâce à IndexNow

## 🔍 Détail technique

Backup complet du site avant modifications dans le sandbox temporaire au cas où.

15 fichiers modifiés au total dans `site-vitrine/` :
- `sitemap.xml` (refait)
- `index.html`
- `blog/index.html`, `blog/allergies-saisonnieres-chien-signes-soulager.html`, `blog/chien-tire-laisse-autre-chien.html`
- `legal/mentions-legales.html`, `legal/politique-confidentialite.html`
- `pages/cours-prive-comportement-chien.html`, `pages/cours-collectif-obeissance.html`, `pages/cours-theorique-education-canine.html`, `pages/reeducation-chien-agressif.html`
- `pages/educateur-canin-yverdon.html`, `pages/educateur-canin-vallorbe.html`, `pages/educateur-canin-orbe.html`, `pages/educateur-canin-la-sarraz.html`, `pages/educateur-canin-lausanne.html`
- `maquette-accueil-caniplus.html` (noindex)
- 2 nouveaux fichiers : `12c64ed67bc7da9cd418df36f87b4e01.txt`, `indexnow-ping.js`

À tout' !
