# CaniPlus — Roadmap d'évolution : ouverture au grand public + Google Play Store

> Document de référence créé le 21 avril 2026.
> Vision : transformer CaniPlus d'une app réservée aux membres du club en plateforme accessible à tous les propriétaires de chiens, disponible sur Google Play Store, avec données synchronisées en temps réel entre web et Android.

---

## 1. Vision et objectifs

### Avant aujourd'hui
- App réservée aux membres inscrits au club de Ballaigues
- Cotisation annuelle 150 CHF/chien obligatoire
- Distribution : PWA installable depuis le navigateur uniquement

### Après cette évolution
- **Deux audiences** cohabitent dans la même app :
  - **Membres du club** (comme aujourd'hui) — cours collectifs à Ballaigues, cotisation annuelle
  - **Utilisateurs externes** (nouveau) — partout en Suisse francophone, pas de cotisation
- **Nouvelles sources de revenus pour les externes** :
  - Abonnement premium ressources **10 CHF/mois**
  - Guides/ebooks à l'unité (~15-25 CHF pièce)
  - Coaching privé à distance en visio **60 CHF/séance**
  - Contenu gratuit (blog) pour attirer et fidéliser
- **Distribution** : Web (cani-plus.vercel.app) + Google Play Store (Android)
- **Synchro automatique** entre tous les supports grâce au backend unique Supabase

### Pourquoi ce choix technique (TWA)
La TWA (Trusted Web Activity) emballe ta PWA existante dans une app Android. Concrètement :
- **Une seule codebase** React/Vite à maintenir
- **Synchro native** — la TWA charge la PWA déployée sur Vercel, donc même auth, même DB, même comptes utilisateurs
- **Mise à jour instantanée** — pas besoin de republier sur le Play Store pour chaque changement de code (seulement pour les changements d'icône/nom/permissions)
- **Coût minime** — 25 USD one-shot (compte développeur Google), 0 CHF récurrent
- **Délai rapide** — ~1 semaine de travail pour publier la première version

---

## 2. Architecture cible

### 2.1 Modèle utilisateur (évolution DB)

Ajout d'un champ `user_type` dans la table `profiles` :

```sql
ALTER TABLE profiles 
  ADD COLUMN user_type TEXT DEFAULT 'external' 
  CHECK (user_type IN ('member', 'external', 'admin'));

-- Migration : tous les profils existants sont des membres
UPDATE profiles SET user_type = 'member' WHERE role = 'member';
UPDATE profiles SET user_type = 'admin'  WHERE role = 'admin';
```

| user_type | Description | Accès |
|-----------|-------------|-------|
| `member`  | Membre inscrit au club Ballaigues | Cours collectifs, planning, ressources premium, cours privé physique, messages admin, news club |
| `external` | Utilisateur grand public | Blog, boutique guides, ressources premium (si abonné), coaching à distance |
| `admin`   | Tiffany | Tout + panel admin |

### 2.2 Flow d'inscription (nouveau)

```
┌──────────────────────────┐
│   Écran d'accueil signup │
│                          │
│ "Bienvenue sur CaniPlus" │
│                          │
│ [Je suis membre du club] │
│ [Je découvre CaniPlus]   │
└──────────────────────────┘
         │         │
         ▼         ▼
   Flow membre   Flow externe
   (actuel)      (nouveau)
```

**Flow membre** (inchangé) : email + password → infos perso → chien(s) obligatoire → accueil membre.

**Flow externe** (nouveau) : email + password → prénom + localisation (optionnel) → chien optionnel → accueil externe avec découverte.

### 2.3 Navigation dynamique

La `BottomNav` s'adapte selon `user_type` :

**Membre** : Accueil · Planning · News · Ressources · Profil (inchangé)

**Externe** : Accueil · Blog · Boutique · Ressources · Profil

**Admin** : identique membre + accès `/admin`

### 2.4 Nouvelles tables Supabase

```sql
-- Articles de blog (contenu gratuit public)
CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,          -- Markdown
  cover_image_url TEXT,
  category TEXT,                  -- éducation, santé, comportement, etc.
  tags TEXT[],
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  author_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS : lecture publique pour les articles publiés
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public peut lire articles publiés" ON blog_posts
  FOR SELECT USING (is_published = true);
CREATE POLICY "Admin peut tout faire" ON blog_posts
  FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE user_type = 'admin'));

-- Produits numériques (guides, ebooks, checklists)
CREATE TABLE digital_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  long_description TEXT,          -- Markdown
  price_chf NUMERIC(10,2) NOT NULL,
  cover_image_url TEXT,
  file_url TEXT NOT NULL,         -- Supabase Storage privé
  preview_url TEXT,               -- Extrait gratuit
  pages_count INT,
  category TEXT,
  stripe_price_id TEXT,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Achats des utilisateurs (lien acheteur ↔ produit)
CREATE TABLE user_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  product_id UUID REFERENCES digital_products(id) NOT NULL,
  stripe_session_id TEXT UNIQUE,
  amount_chf NUMERIC(10,2),
  paid_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- Adaptation de private_course_requests pour le coaching à distance
ALTER TABLE private_course_requests 
  ADD COLUMN is_remote BOOLEAN DEFAULT false,
  ADD COLUMN price_chf NUMERIC(10,2) DEFAULT 60,
  ADD COLUMN meeting_url TEXT,       -- lien Zoom/Meet généré après paiement
  ADD COLUMN stripe_session_id TEXT; -- pour les externes qui paient avant
```

### 2.5 Stockage des PDF (guides payants)

Les PDF des guides vivent dans un bucket Supabase Storage **privé**. L'accès se fait via URL signée générée par une Edge Function, avec vérification préalable de l'achat :

```
User clique "Télécharger" → Edge Function /get-product-download
  → Vérifie user_purchases.user_id = auth.uid() AND product_id = X
  → Si OK : createSignedUrl(file_url, expiresIn: 3600)
  → Retourne l'URL temporaire
```

---

## 3. Roadmap par phases

### Phase 1 — Fondations non-membres (1-2 semaines)
**Objectif** : préparer la base technique sans casser l'existant.

- [ ] Migration SQL : ajouter `user_type` dans `profiles`
- [ ] Backfill des utilisateurs existants en `member`
- [ ] Adapter `useAuth.js` pour exposer `userType`
- [ ] Créer `<RoleGate>` wrapper pour routes conditionnelles
- [ ] Nouveau `SignupChoiceScreen.js` (membre vs externe)
- [ ] Adapter `SignupScreen.js` en 2 variantes (chien optionnel pour externe)
- [ ] Rendre `BottomNav` dynamique selon `userType`
- [ ] Adapter `HomeScreen.js` : contenu différent pour `external`
- [ ] Masquer la cotisation 150 CHF/chien aux externes dans `ProfilScreen.js`
- [ ] Tests de régression : login/signup membres existants OK

**Livrable** : un utilisateur externe peut créer un compte et voir une interface adaptée, sans cotisation imposée.

---

### Phase 2 — Blog public (1-2 semaines)
**Objectif** : créer du contenu gratuit pour attirer du trafic et fidéliser.

- [ ] Migration SQL : table `blog_posts` + RLS
- [ ] `BlogScreen.js` : liste paginée des articles publiés
- [ ] `BlogPostScreen.js` : lecture d'un article (markdown rendu avec `react-markdown`)
- [ ] Panel admin : CRUD articles avec éditeur markdown
- [ ] Rendu côté site vitrine `caniplus.ch/blog/:slug` pour le SEO (build statique ou SSR)
- [ ] Partage social : OpenGraph meta tags dynamiques
- [ ] Fil RSS `caniplus.ch/blog/rss.xml`

**Livrable** : Tiffany publie des articles depuis l'admin, visibles publiquement (SEO), accessibles dans l'app.

---

### Phase 3 — Boutique guides/ebooks (2 semaines)
**Objectif** : revenu one-shot sans engagement, ticket moyen ~20 CHF.

- [ ] Migration SQL : tables `digital_products` + `user_purchases`
- [ ] Bucket Supabase Storage `digital-products` (privé)
- [ ] `BoutiqueScreen.js` : grille des guides
- [ ] `ProduitDetailScreen.js` : titre, description, sommaire, extrait gratuit, bouton acheter
- [ ] Edge Function `create-product-checkout` : crée une session Stripe one-shot
- [ ] Edge Function `stripe-webhook` : étend le handler existant pour `checkout.session.completed` type `product`
- [ ] Edge Function `get-product-download` : vérifie achat et génère URL signée
- [ ] `MesAchatsScreen.js` : bibliothèque des produits achetés
- [ ] Panel admin : gestion des produits (upload PDF, prix, publication)
- [ ] Emails de confirmation d'achat avec lien de téléchargement

**Livrable** : un externe peut acheter un guide, le recevoir par email, le retrouver dans l'app.

**Idées de guides pour démarrer** (tu as déjà des fiches PDF prêtes !) :
- Pack chiot : 3 premiers mois (PDF existant `premiers-mois-chiot.pdf`)
- Le langage canin (PDF existant `langage-canin.pdf`)
- Pack complet 10 fiches éducation (les fiche-01 à fiche-10 déjà créées)

---

### Phase 4 — Coaching à distance (1 semaine)
**Objectif** : proposer ton expertise en visio aux propriétaires hors Ballaigues.

- [ ] Migration SQL : `is_remote` + `price_chf` + `meeting_url` sur `private_course_requests`
- [ ] `CoachingScreen.js` : présentation du coaching à distance, formulaire
- [ ] Formulaire : motif de la demande, créneaux souhaités, infos chien, paiement Stripe 60 CHF
- [ ] Edge Function `create-coaching-checkout` : session Stripe one-shot
- [ ] Après paiement : notification admin + status `pending`
- [ ] Panel admin : tu acceptes un créneau → email au client avec lien Zoom/Meet
- [ ] Rappel 24h avant via email

**Livrable** : un externe peut réserver et payer un coaching visio depuis l'app.

**Stratégie Zoom/Meet** : pour démarrer, créer manuellement le lien après confirmation (5 min de travail). Automatiser plus tard via Zoom API si volume le justifie.

---

### Phase 5 — Publication Google Play Store (1 semaine)
**Objectif** : app téléchargeable depuis le Play Store, synchronisée avec le web.

#### 5.1 Préparation de la PWA (½ jour)
- [ ] Vérifier le manifest.json (✅ déjà conforme, icônes 192/512 maskable OK)
- [ ] Générer une icône Play Store 512×512 haute résolution
- [ ] Ajouter `screenshot` desktop et mobile dans le manifest (optionnel)
- [ ] Tester avec Lighthouse PWA audit : score ≥ 90

#### 5.2 Compte et outillage (½ jour)
- [ ] Créer le compte **Google Play Console** (25 USD one-shot)
- [ ] Installer **Bubblewrap** : `npm i -g @bubblewrap/cli`
- [ ] Vérifier Java JDK 17+ installé

#### 5.3 Génération du AAB (½ jour)
- [ ] `bubblewrap init --manifest=https://cani-plus.vercel.app/manifest.json`
- [ ] Répondre au questionnaire (package name `ch.caniplus.app`, nom d'app, etc.)
- [ ] `bubblewrap build` → génère `app-release-signed.aab` + `signing-key.keystore`
- [ ] **Sauvegarder la keystore** dans un endroit sécurisé (sans elle, impossible de publier des mises à jour)

#### 5.4 Digital Asset Links (½ jour)
- [ ] Récupérer le SHA-256 du certificat : `bubblewrap fingerprint`
- [ ] Créer `caniplus.ch/.well-known/assetlinks.json` :
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "ch.caniplus.app",
    "sha256_cert_fingerprints": ["<FINGERPRINT>"]
  }
}]
```
- [ ] Tester via `https://developers.google.com/digital-asset-links/tools/generator`

#### 5.5 Fiche Play Store (1 jour)
- [ ] Titre (30 car max) : `CaniPlus - Éducation canine`
- [ ] Description courte (80 car) : `Ressources, coaching et guides pour propriétaires de chiens en Suisse`
- [ ] Description longue (4000 car) — à rédiger, mettre en avant : blog gratuit, ressources premium, guides PDF, coaching visio, club Ballaigues
- [ ] Screenshots (min 2, recommandé 8) : exportés depuis l'app en mode mobile
- [ ] Icône 512×512 (réutiliser celle du manifest)
- [ ] Feature graphic 1024×500 (visuel promotionnel)
- [ ] Catégorie : **Lifestyle** (ou Sports/Éducation)
- [ ] Classification de contenu : questionnaire à remplir (PEGI 3)
- [ ] Politique de confidentialité : URL obligatoire `caniplus.ch/politique-confidentialite` → à créer

#### 5.6 Stratégie paiements in-app (⚠️ point critique)
Google impose **Google Play Billing** pour les "biens numériques" (abonnements premium, guides PDF). Commission 15-30%.

**Options recommandées** :

1. **Option A (recommandée pour démarrer)** : Dans la TWA Android, **cacher les boutons d'achat** (abonnement premium + guides). L'utilisateur est invité à aller sur le site web pour acheter. Simple, conforme, 0% de commission Google.
   - Détection TWA via `document.referrer === 'android-app://ch.caniplus.app'` ou user-agent
   - Message : « Pour gérer votre abonnement, rendez-vous sur caniplus.ch »

2. **Option B (long terme)** : Intégrer Google Play Billing via la Digital Goods API. Plus complexe, commission 15%, mais expérience fluide.

**Pour le coaching privé et la cotisation club** : Stripe reste autorisé (ce sont des "services réels", pas des biens numériques).

#### 5.7 Soumission (½ jour + 1-3 jours de review)
- [ ] Upload du AAB signé sur la Play Console
- [ ] Remplir toutes les sections obligatoires
- [ ] Soumettre pour review
- [ ] Attendre validation Google (~1-3 jours la première fois)
- [ ] Publication !

**Livrable** : CaniPlus téléchargeable depuis Google Play, même compte / mêmes données que la version web.

---

### Phase 6 — Marketing & acquisition (continu)
**Objectif** : convertir les visiteurs en utilisateurs payants.

- [ ] Calendrier éditorial blog (déjà dans les TODOs)
- [ ] Automatisation Instagram/Facebook → partage des articles
- [ ] Google Business Profile → posts hebdomadaires
- [ ] Newsletter (Brevo ou Mailchimp gratuit) → capter les visiteurs du blog
- [ ] Landing pages dédiées : « Offrez à votre chiot le meilleur départ » → vente guide chiot
- [ ] Témoignages clients sur le site + l'app
- [ ] Pack « découverte » : 1er guide offert contre inscription newsletter

---

## 4. Synchronisation entre supports

### Comment ça marche techniquement

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  Web Chrome  │   │  PWA iPhone  │   │  Android TWA │
│ (caniplus…)  │   │  (installée) │   │ (Play Store) │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   Supabase (unique)   │
              │  Auth + DB + Storage  │
              └───────────────────────┘
```

Tous les clients tapent sur la **même base Supabase**. Quand Tiffany publie un article depuis l'admin web, il apparaît instantanément dans l'app Android de chaque utilisateur.

### Ce qui est synchronisé automatiquement
- Connexion / session utilisateur
- Profil, chiens, abonnements
- Messages, planning, réservations
- Blog, boutique, achats, ressources

### Ce qui reste local à chaque appareil
- Cache du service worker (pour fonctionnement offline)
- Préférences d'affichage (mode sombre, etc.)
- Notifications push (Android seulement, si activées plus tard)

---

## 5. Chiffrage et priorités

| Phase | Durée | Valeur business | ROI |
|-------|-------|-----------------|-----|
| 1 — Fondations non-membres | 1-2 sem | Aucune seule, mais débloque tout | Indispensable |
| 2 — Blog public | 1-2 sem | Trafic SEO + email capture | Élevé (long terme) |
| 3 — Boutique guides | 2 sem | Revenu direct (20 CHF × N ventes) | Très élevé |
| 4 — Coaching à distance | 1 sem | Revenu direct (60 CHF × séances) | Élevé |
| 5 — Play Store | 1 sem | Visibilité + crédibilité | Moyen-élevé |
| 6 — Marketing | continu | Multiplier les revenus phases 2-5 | Continu |

**Total estimé : 6-8 semaines de dev actif.**

### Ordre recommandé
1. **Phase 1** d'abord — base technique sine qua non
2. **Phase 3** (boutique) — impact immédiat, tu as déjà 10+ PDF de fiches éducatives
3. **Phase 4** (coaching) — ton expertise monétisée
4. **Phase 2** (blog) — alimente le SEO et capture les emails
5. **Phase 5** (Play Store) — quand le contenu vaut la peine d'être téléchargé
6. **Phase 6** — en parallèle dès phase 2

---

## 6. Risques et points de vigilance

### Techniques
- **Règle « éditer .js pas .jsx »** : toujours respecter (Vite charge .js en priorité)
- **useAuth.js** : le hook est critique. Toute modification doit être testée sur membres existants avant déploiement
- **Migration DB** : tester sur une copie avant d'appliquer en prod
- **Keystore Android** : sauvegarder dans deux endroits sécurisés (perte = impossibilité de mettre à jour l'app)

### Commerciaux
- **Paiements in-app Android** : Google peut rejeter l'app si Stripe est utilisé pour biens numériques. Stratégie « pas d'achat dans la TWA » élimine le risque
- **Concurrence** : beaucoup d'apps d'éducation canine existent. Différenciation = expertise locale + coaching humain + qualité des contenus
- **RGPD/nLPD** : la politique de confidentialité doit être solide avant publication Play Store

### Organisationnels
- **Volume de coaching à distance** : si succès rapide, prévoir un calendrier strict (max N séances/semaine) pour pas te cramer
- **Support utilisateur** : les externes ne sont pas des membres connus → prévoir des FAQ solides

---

## 7. Prochaines étapes concrètes

La prochaine session de travail devrait commencer par :

1. **Migration SQL Phase 1** : ajouter `user_type`, adapter les policies RLS
2. **Adaptation `useAuth.js`** pour exposer `userType`
3. **Création `SignupChoiceScreen`** avec les deux parcours
4. **Tests exhaustifs** sur les comptes membres existants

Une fois la Phase 1 stabilisée, on attaque la boutique (Phase 3) pour générer du revenu vite.

---

*Document vivant — à mettre à jour au fil des sessions.*
