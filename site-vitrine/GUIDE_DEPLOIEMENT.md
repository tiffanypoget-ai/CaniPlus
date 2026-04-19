# Guide de déploiement — Site CaniPlus

> Document préparé le 19 avril 2026 pendant ton absence.
> **Tiffany, lis-moi d'abord avant de pousser quoi que ce soit.** 🙏

---

## 1. Ce qui a été fait pendant ton absence (résumé)

J'ai créé l'intégralité du site vitrine SEO autour de `caniplus.ch` :

### Nouvelles pages créées

**5 pages SEO locales** (une par ville cible) :
- `pages/educateur-canin-yverdon.html`
- `pages/educateur-canin-vallorbe.html`
- `pages/educateur-canin-orbe.html`
- `pages/educateur-canin-la-sarraz.html`
- `pages/educateur-canin-lausanne.html`

**4 pages prestations dédiées** :
- `pages/cours-prive-comportement-chien.html`
- `pages/cours-collectif-obeissance.html`
- `pages/reeducation-chien-agressif.html`
- `pages/cours-theorique-education-canine.html`

**4 articles de blog** :
- `blog/chien-tire-laisse.html` (~1200 mots)
- `blog/socialisation-chiot-3-premiers-mois.html` (~1400 mots)
- `blog/chien-aboie-quand-je-pars-anxiete-separation.html` (~1500 mots)
- `blog/chien-reactif-comprendre-avant-corriger.html` (~1450 mots)
- `blog/index.html` (page liste des articles)

**2 pages légales obligatoires** :
- `legal/mentions-legales.html`
- `legal/politique-confidentialite.html` (conforme nLPD + RGPD)

**1 CSS partagé** : `assets/style.css` (190+ lignes) — tous les styles pour les pages ci-dessus.

**Sitemap mis à jour** : `sitemap.xml` inclut maintenant les 16 nouvelles URLs.

---

## 2. Avant de pousser en prod — À VÉRIFIER

### 2.1 Ouvrir les pages localement

Avant de commit, ouvre ces pages dans ton navigateur (double-clic sur les `.html`) pour vérifier :
- [ ] Le rendu visuel te plaît (couleurs, typo, mise en page)
- [ ] Les textes sont justes (pas d'erreur factuelle sur tes tarifs, tes horaires, ton approche)
- [ ] Les liens internes fonctionnent
- [ ] Le numéro de téléphone est correct (j'ai utilisé `+41 79 123 89 39` — **à vérifier/remplacer**)
- [ ] Le prénom "Tiffany Cotting (Poget)" dans les mentions légales est bien le nom que tu veux publier

### 2.2 Corrections probables à faire toi-même

**⚠️ Numéro de téléphone** : j'ai mis `+41 79 123 89 39` comme placeholder. **REMPLACE-LE** par ton vrai numéro dans :
- Tous les fichiers `pages/*.html`
- Le fichier `legal/mentions-legales.html`

Commande rapide (PowerShell, depuis le dossier `site-vitrine/`) :
```powershell
Get-ChildItem -Recurse -Filter *.html | ForEach-Object {
  (Get-Content $_.FullName -Raw) -replace '\+41 79 123 89 39', 'TON-VRAI-NUMERO' | Set-Content $_.FullName
}
```

**⚠️ Horaires de cours** : Les pages prestations parlent de "1 cours par semaine" mais ne donnent pas les jours/heures. Tu voudras peut-être ajouter un tableau d'horaires sur `cours-collectif-obeissance.html`.

**⚠️ Tarifs** : J'ai utilisé les tarifs que je connais (150 CHF cotisation, 60 CHF cours privé, 10 CHF/mois premium). Vérifie qu'ils sont à jour.

### 2.3 À remplacer par de vraies images

Les pages font référence à des images qui n'existent peut-être pas encore :
- `/images/og-image.jpg` (1200×630, partagé sur réseaux sociaux)
- `/images/favicon-32.png`, `/images/favicon-16.png`, `/images/apple-touch-icon.png`

Si tu n'as pas encore généré ces fichiers, il faut les créer sinon Google va afficher les pages sans image de prévisualisation. Tu peux utiliser Canva (1200×630 pour OG) avec ton logo + "CaniPlus, éducation canine Vaud".

---

## 3. Étapes pour déployer

### Étape 1 — Ouvrir GitHub Desktop
GitHub Desktop va voir une LONGUE liste de nouveaux fichiers (16 nouveaux fichiers + 2 modifiés : sitemap.xml et style.css).

### Étape 2 — Relire la liste
Tu peux cocher/décocher chaque fichier si tu veux pousser par lots. Je te recommande de TOUT pousser d'un coup pour éviter les demi-déploiements.

### Étape 3 — Écrire un message de commit
Suggestion :
```
feat: site vitrine SEO complet — 5 pages locales, 4 prestations, 4 articles blog, légal RGPD
```

### Étape 4 — Commit to main → Push origin
Vercel va redéployer automatiquement en 1-2 minutes.

### Étape 5 — Vérifier en prod
- Ouvre https://caniplus.ch/ → doit fonctionner
- Ouvre https://caniplus.ch/pages/educateur-canin-yverdon.html → doit s'afficher
- Ouvre https://caniplus.ch/blog/ → doit afficher la liste
- Ouvre https://caniplus.ch/legal/politique-confidentialite.html → doit s'afficher

---

## 4. Après déploiement — SEO à configurer

### 4.1 Google Search Console (30 min)
Obligatoire pour suivre ton référencement.

1. Va sur https://search.google.com/search-console
2. Connecte-toi avec ton compte Google
3. Clique "Ajouter une propriété" → saisis `https://caniplus.ch`
4. Vérifie la propriété (via DNS one.com ou balise HTML)
5. **Soumets le sitemap** : `https://caniplus.ch/sitemap.xml`
6. **Demande une indexation** pour la page d'accueil (bouton "Inspection d'URL")

### 4.2 Google Business Profile (1h)
Plus important que tout pour le SEO local.

1. Va sur https://business.google.com
2. Crée une fiche "CaniPlus" à l'adresse de Ballaigues
3. Catégorie : "Dresseur de chiens" + "Club canin"
4. Ajoute photos du terrain, des chiens, de toi
5. Ajoute ton numéro, tes horaires
6. **Lien vers https://caniplus.ch**

### 4.3 Bing Webmaster Tools (15 min)
Bing prend une part non-négligeable en Suisse (~5-8%).

1. Va sur https://www.bing.com/webmasters
2. Importe directement depuis Google Search Console (option proposée) — 1 clic
3. Soumets le sitemap

### 4.4 Premiers avis clients (IMPORTANT)
Demande à 3-5 membres du club de laisser un avis Google. 5 avis Google 5★, c'est l'élément qui fait le plus monter ton référencement local. Utilise un message-type simple par mail ou WhatsApp.

---

## 5. Ce qu'il reste à faire plus tard (pas urgent)

### Contenus à écrire quand tu auras le temps
- Un 5ème article blog (idée : "Rappel du chien : comment le construire et le fiabiliser")
- Une page "histoires de chiens" avec 3-4 témoignages de membres (= contenu "social proof" très puissant)
- Un module vidéo (YouTube ou Vimeo) embarqué sur la page d'accueil

### Optimisations techniques
- Ajouter des images réelles sur chaque article (pas juste du texte)
- Compresser les images avec https://tinypng.com
- Ajouter un schema `ItemList` sur `blog/index.html` pour que Google affiche les articles en rich snippet
- Plus tard, ajouter un formulaire de contact au lieu d'un simple lien mailto

### Côté PWA / app.caniplus.ch
- Mettre à jour les liens du site vitrine pour pointer vers les bons écrans de l'app
- Ajouter une bannière "Devenir membre" sur la page d'accueil
- Corriger les 2 bugs restants dans ta todo-list : bandeau news page d'accueil + mot de passe oublié

---

## 6. Structure des dossiers après déploiement

```
site-vitrine/
├── index.html                              (page d'accueil)
├── robots.txt
├── sitemap.xml                             ← mis à jour
├── site.webmanifest
├── vercel.json
├── assets/
│   └── style.css                           ← créé (CSS partagé)
├── blog/
│   ├── index.html                          ← créé
│   ├── chien-tire-laisse.html              ← créé
│   ├── socialisation-chiot-3-premiers-mois.html  ← créé
│   ├── chien-aboie-quand-je-pars-anxiete-separation.html  ← créé
│   └── chien-reactif-comprendre-avant-corriger.html  ← créé
├── legal/
│   ├── mentions-legales.html               ← créé
│   └── politique-confidentialite.html      ← créé
├── pages/
│   ├── cours-prive-comportement-chien.html ← créé
│   ├── cours-collectif-obeissance.html     ← créé
│   ├── reeducation-chien-agressif.html     ← créé
│   ├── cours-theorique-education-canine.html ← créé
│   ├── educateur-canin-yverdon.html        ← créé
│   ├── educateur-canin-vallorbe.html       ← créé
│   ├── educateur-canin-orbe.html           ← créé
│   ├── educateur-canin-la-sarraz.html      ← créé
│   └── educateur-canin-lausanne.html       ← créé
└── images/                                 (inchangé)
```

---

## 7. En cas de souci

Si une page ne s'affiche pas en prod :
1. Vérifie dans Vercel si le déploiement s'est bien passé (dashboard)
2. Ouvre la console du navigateur (F12) pour voir les erreurs
3. Vérifie que les liens de navigation pointent bien vers `/pages/...` et `/blog/...` (slash au début)

Si le CSS ne se charge pas :
- Vérifie que `assets/style.css` est bien commité et déployé
- Dans le navigateur, fais un Ctrl+F5 pour forcer le rechargement (le CSS peut être en cache)

---

**Bon retour Tiffany ! ✨**

*Tout est en place. À toi de jouer avec GitHub Desktop.*
