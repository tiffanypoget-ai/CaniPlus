# Récap de la nuit — 20 au 21 avril 2026

Salut Tiffany. Voici ce qui a été fait pendant la nuit, dans l'ordre chronologique, avec la liste des actions à enchaîner de ton côté pour finaliser.

> **Ajout 22 avril matin** — Le Guide #1 Canva "Accueillir un 2e chien" a été complètement varié en contenu. Voir la section "6. Canva Guide #1 — variations de contenu" à la fin de ce document.

---

## 1. Ce qui est fait (code, contenu, préparation)

### Phase 3 — Boutique (3 guides payants)

Les 3 guides sont prêts en Markdown **et** en PDF, la banque d'images a été étoffée (~300 photos Pexels, tous thèmes), la fiche produit boutique et la migration SQL sont prêtes.

- `digital-products/guide-accueillir-2e-chien/` — Guide #1 (24 CHF, ~100 pages)
- `digital-products/guide-adopter-chien-refuge/` — Guide #2 (19 CHF, ~70 pages)
- `digital-products/guide-randonnee-chien-suisse/` — Guide #3 (29 CHF, ~60 pages)
- `supabase/migrations/` — SQL de remplacement des 3 anciens produits par les 3 nouveaux

### Phase 4 — Coaching à distance (code)

Un nouveau parcours de réservation dans l'app gère à la fois le **présentiel (60 CHF)** et le **distance (50 CHF)**, avec paiement Stripe intégré.

- `supabase/functions/create-coaching-checkout/index.ts` — nouvelle Edge Function qui crée la session Stripe et insère la demande dans `private_course_requests`
- `supabase/functions/stripe-webhook/index.ts` — handler `coaching_request` ajouté (mise à jour `payment_status='paid'` au paiement)
- `src/components/CoachingRequestModal.jsx` — nouvelle modale avec toggle présentiel / distance, créneaux de disponibilité, récap prix
- `src/screens/PlanningScreen.jsx` — remplacement de l'ancien `PrivateCourseRequestModal` par `CoachingRequestModal`

Note : la table `private_course_requests` est réutilisée (avec les nouvelles colonnes `is_remote`, `price_chf`, `payment_status`, `paid_at`, `stripe_session_id`). L'admin voit tout dans une seule liste, avec le flag remote/présentiel.

### Phase 5 — Google Play Store (préparation TWA)

Tout le dossier de publication est prêt, il te reste la partie manuelle (compte développeur + génération AAB).

- `play-store/ROADMAP_PLAY_STORE.md` — guide pas-à-pas complet, 9 étapes, troubleshooting, budget
- `play-store/twa-manifest.json` — config Bubblewrap (`packageId: ch.caniplus.app`, host `cani-plus.vercel.app`)
- `play-store/assetlinks.json` + `public/.well-known/assetlinks.json` — Digital Asset Links (template, à remplir avec le SHA256 Play App Signing)
- `play-store/store-listing.md` — fiche produit Play Store complète (titre, descriptions, mots-clés, spec captures, notes sur Stripe vs Play Billing)
- `play-store/README.md` — vue d'ensemble du dossier et ordre recommandé

### Phase 6 — Pack marketing initial

Quatre livrables, prêts à être exécutés cette semaine.

- `marketing/PLAN_3_MOIS.md` — stratégie mai / juin / juillet 2026 (lancement boutique, SEO, saison rando + Play Store), cibles, KPIs, budget
- `marketing/CALENDRIER_RESEAUX_2_SEMAINES.md` — 10 posts Instagram/Facebook (S1 = lancement boutique, S2 = coaching distance + premium) avec captions complètes, sans emojis
- `marketing/GOOGLE_BUSINESS_POSTS.md` — 4 posts Google Business Profile + routine hebdo 15 min
- `marketing/BLOG_ARTICLES_A_ECRIRE.md` — 4 articles détaillés (plan + intros + CTA), 700-900 mots chacun, calendrier de publication

---

## 2. Ce qu'il te reste à faire (par priorité)

### Ce matin (1h30 environ)

1. **Déployer la migration SQL de la Phase 3** (remplacement des produits boutique)
   - Ouvrir `supabase/migrations/` et identifier la dernière migration ajoutée
   - La jouer depuis le dashboard Supabase → SQL Editor
2. **Uploader les 3 PDFs de guide** dans le bucket `digital-products`
   - Fichiers : `guide-accueillir-2e-chien.pdf`, `guide-adopter-chien-refuge.pdf`, `guide-randonnee-chien-suisse.pdf`
   - À déposer à la racine du bucket (les URLs référencées par la migration pointent dessus)
3. **Déployer la nouvelle Edge Function `create-coaching-checkout`**
   - Depuis le dashboard Supabase → Edge Functions → nouveau ou via CLI
   - Ne pas zipper le TypeScript — envoyer le `.ts` raw (règle que tu connais)
4. **Redéployer `stripe-webhook`** (handler coaching_request ajouté)
5. **Commiter et pousser le tout sur GitHub** (via GitHub Desktop, comme d'habitude)
   - Vercel redéploie automatiquement
   - `public/.well-known/assetlinks.json` sera servi à `https://cani-plus.vercel.app/.well-known/assetlinks.json`

### Cette semaine (Play Store)

6. **Créer le compte développeur Google Play** (25 USD, étape 1 de la roadmap)
7. **Installer Bubblewrap + Android Studio** (étape 2)
8. **Générer l'AAB + test interne + récupérer le SHA256** (étapes 3 à 6)
9. **Mettre à jour les deux `assetlinks.json`** avec le SHA256 Play App Signing (étape 7)
10. **Publier en beta ouverte** (étape 8)

Durée active : ~5h étalées sur 2-3 jours. Validation Google : 2 à 7 jours.

### Cette semaine (marketing)

11. **Lancer le post Instagram "trois nouveaux guides"** (lundi matin, caption dans `CALENDRIER_RESEAUX_2_SEMAINES.md`)
12. **Publier le premier post Google Business** (boutique — Post 1 dans `GOOGLE_BUSINESS_POSTS.md`)
13. **Rédiger le premier article de blog** (suggestion : commencer par "Accueillir un deuxième chien — les 5 signaux qui disent pas maintenant" — plan complet dans `BLOG_ARTICLES_A_ECRIRE.md`)

---

## 3. À tester une fois déployé

### Flow coaching

1. Ouvrir l'app → Planning → bouton "Demander un coaching"
2. Tester le toggle présentiel / distance (le prix doit passer de 60 à 50 CHF)
3. Saisir 2-3 créneaux de disponibilité
4. Cliquer "Réserver et payer" → redirection Stripe
5. Après paiement test, vérifier dans Supabase que la row dans `private_course_requests` a bien `payment_status='paid'` et `is_remote=true/false`

### Flow boutique

1. Ouvrir l'app → Boutique
2. Vérifier que les 3 nouveaux guides s'affichent avec les bons prix (19 / 24 / 29 CHF)
3. Acheter un guide en test → vérifier que le PDF est téléchargeable après paiement

---

## 4. Points d'attention

- **Paiement Play Store** : la politique Google est que les services numériques passent par Play Billing (commission 15-30 %). Tes cours et coachings sont des **services physiques/externes** — c'est une exception qui permet de garder Stripe. Deux options documentées dans `play-store/store-listing.md`, à trancher avant soumission.
- **L'ancien `PrivateCourseRequestModal.jsx` est conservé** dans `src/components/` mais n'est plus importé nulle part. Tu peux le supprimer si tu veux, ou le garder en archive.
- **Les guides PDF ont été générés avec les images Pexels** de la banque — vérifier que toutes les attributions sont bien présentes en fin de chaque guide (normalement oui, mais à survoler).
- **Google Business** : pense à uploader une image 1080×1080 par post, c'est le seul format qui ne se fait pas couper.

---

## 5. Fichiers clés (raccourcis)

- Roadmap Play Store : `play-store/ROADMAP_PLAY_STORE.md`
- Plan marketing 3 mois : `marketing/PLAN_3_MOIS.md`
- Premier post à publier lundi : `marketing/CALENDRIER_RESEAUX_2_SEMAINES.md` (Semaine 1, Lundi)
- Premier article blog à écrire : `marketing/BLOG_ARTICLES_A_ECRIRE.md` (article 1)

---

Bonne journée. Si un truc ne fonctionne pas après déploiement, commence par regarder les logs Edge Function dans le dashboard Supabase — c'est presque toujours là que ça coince.

---

## 6. Canva Guide #1 — variations de contenu (22 avril matin)

**Design :** `DAHHjWE_-Vo` — 42 pages
**URL édition :** https://www.canva.com/d/sI19THMnXAdVCqz

Les pages dupliquées que tu avais laissées avec le même contenu "Préparer son arrivée" ont toutes été variées en piochant dans le markdown source (`guides-payants/accueillir-2e-chien/guide-complet.md`). Chaque étape a maintenant son propre contenu au lieu de répéter celui de l'Étape 01.

### 5 chapitres ouvrants (déjà corrigés en amont)
- P5 : ÉTAPE 01 — Préparer son arrivée
- P11 : ÉTAPE 02 — Les 48 premières heures fondatrices
- P18 : ÉTAPE 03 — Les premières rencontres
- P24 : ÉTAPE 04 — Construire l'entente au quotidien
- P35 : ÉTAPE 05 — Faire tribu sur la durée

### 13 pages texte variées (ce matin)
| Page | Étape | Contenu nouveau |
|------|-------|-----------------|
| P15 | 02 | "Les 48 premières heures" — arrivée maison, courbe émotionnelle, première nuit |
| P20 | 03 pivot | Protéger les premiers repères / Accompagner les premières sorties |
| P21 | 03 | "Observer les premières sorties en 5 points" : Terrain neutre / Laisses détendues / Rythmes respectés / Croisements dosés / Retour au calme |
| P22 | 03 | "Les premières sorties" — marcher 2 chiens |
| P25 | 03 | "Traverser les deux premières semaines" — règle des 3 temps |
| P26 | 04 | "Les ressources, clé de la paix" — abondance / distance / contexte |
| P27 | 04 | "Équilibrer le quotidien en 4 piliers" : Ressources dosées / Attention partagée / Rituels ancrés / Repos protégé |
| P29 | 04 | "Ajuste ton quotidien mois après mois" — Observer sans juger / Ajuster sans brusquer |
| P30 | 04 | "Observer ton duo en action, semaine après semaine" |
| P31 | 05 pivot | Protéger l'équilibre durable / Faire grandir la tribu ensemble |
| P32 | 05 | "Le vrai rôle du maître" — justice pas égalité, rôle d'organisateur |
| P33 | 05 | "Observer pour continuer à grandir ensemble" |
| P36 | 05 | "Garde le cap sur la durée" — Reste présent / Reste juste |

### À vérifier visuellement au retour
1. **Ouvrir chaque page dans Canva** et contrôler que rien ne déborde de son cadre (le texte a été collé en respectant les longueurs du contenu original, donc normalement ça passe — mais Canva peut agrandir les cartes responsives).
2. **Sommaire P2** : les titres des 5 étapes doivent correspondre à ce que tu as en page de chapitre.
3. **Citations** (P10, P23, P25, P28, P34) : pas retouchées ce matin — à parcourir pour éviter les répétitions d'ambiance.

### Règles respectées
- Tutoiement partout
- Pas d'emojis
- Aucune mention de cage/crate/parc
- Numérotation par ÉTAPE, pas par jour
- Textes originaux, aucun doublon avec blog ou premium

### Ce qu'il reste à faire sur Canva (tu valides toi-même)
- Guide #2 "Adopter un chien de refuge" : le markdown source n'est pas encore écrit → priorité 2
- Guide #3 "Randonnée & nature CH" : markdown OK, pas de design Canva encore créé
