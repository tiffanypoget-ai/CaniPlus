# Plan de restructuration de la PWA CaniPlus

> Document de référence — 13 juillet 2026.
> L'app membre du club canin devient une **app grand public d'éducation canine**.
> Le club sort de l'app (géré via WhatsApp) ; les revenus reposent sur le contenu
> (premium, guides, soirées) et les cours privés/coaching — prestations de la
> raison individuelle.

## Vue d'ensemble

| Phase | Contenu | Branche / PR | État |
|---|---|---|---|
| 1 | Feature flag club + navigation 5 onglets | `app-grand-public` — [PR #1](https://github.com/tiffanypoget-ai/CaniPlus/pull/1) | ✅ prête, à merger |
| 2 | « Les soirées CaniPlus » (webinaires payants) | `soirees-caniplus` — [PR #2](https://github.com/tiffanypoget-ai/CaniPlus/pull/2), empilée sur la #1 | ✅ prête, à merger après la #1 |
| 3 | Mise en service (fonctions edge, Stripe) | — | ⬜ après merge (voir bas de page) |

---

## Phase 1 — Feature flag club & navigation grand public (PR #1)

### Le flag `REACT_APP_CLUB_FEATURES`

- `src/lib/features.js` exporte `CLUB_ENABLED`, piloté par la variable
  d'environnement `REACT_APP_CLUB_FEATURES` (préfixe activé dans `vite.config.js`).
- **Défaut : `false`** → toutes les fonctions club sont masquées.
- **Aucun code supprimé.** Pour réactiver le club : définir
  `REACT_APP_CLUB_FEATURES=true` dans Vercel → Settings → Environment Variables,
  puis redéployer.

### Masqué quand le flag est à `false` (écran par écran)

| Écran | Éléments masqués |
|---|---|
| Navigation (BottomNav + Sidebar) | Onglet **Planning** |
| Accueil | Carte « Cette semaine » (cours collectifs, « Je viens », paiements de cours), bannière « Cotisation à régler », raccourci « Mes paiements » |
| Planning | Écran entier hors navigation : planning club, inscriptions, cours théoriques, **absences hebdomadaires**, checkout des cours |
| Profil | Bloc **Cotisation annuelle** (Stripe + QR-facture + non-renouvellement), « Type de cours », lignes cotisation de l'historique, « Documents » du club, mention « Ballaigues » |
| Onboarding | Étape « type de cours » → tout le monde suit le parcours grand public (accueil + chien facultatif) |
| Inscription | Choix « élève du club / externe » supprimé → tous les comptes créés en `external` |
| Notifications | Textes « du club » reformulés ; notifs de cours redirigées vers l'Accueil |
| Modal push | Bénéfice « Rappels de cours » masqué, texte « au club » reformulé |
| Landing desktop | Cartes Cours collectifs/théoriques (remplacées par « Contenus & coaching »), FAQ cotisation/lieu, témoignages club, section Rallye canin |
| Admin | Sous-onglet **Adhésions** + tuile « Adhésions à valider » |

### Nouvelle navigation — 5 onglets

1. **Accueil** — contenu du moment (dernier article), carte cours privés/coaching, carte boutique, bannière Premium, notifications, accès rapide.
2. **Apprendre** — articles du blog + entrée « Les soirées CaniPlus » (phase 2 ; était l'emplacement « Formation »).
3. **Premium** — l'ancien onglet Ressources (fiches, vidéos, articles premium), renommé.
4. **Mon chien** — nouvel écran : profils des chiens, âge calculé, **carnet de vaccination détaillé** (statut par vaccin : à jour / rappel sous 30 j / expiré) et alertes.
5. **Profil** — compte, premium, « Mes achats », historique des paiements, notifications push, mot de passe.

La Boutique quitte la barre de navigation mais reste accessible (Accueil + Profil).
Les anciens identifiants d'onglets (`blog`, `ressources`, `news`, `planning`) sont
remappés dans `App.js` pour ne casser ni liens ni notifications push.

### Optimisations incluses

- **Code-splitting** : AdminScreen, PlanningScreen et EducatriceScreen chargés à la
  demande (`React.lazy`) → bundle principal 831 → 605 kB (gzip 213 → 163 kB).
- Liste d'onglets unifiée dans `src/lib/navTabs.js` (partagée BottomNav/Sidebar).
- **Fix service worker** : `scripts/stamp-sw.js` cherchait `dist/` au lieu de
  `build/` → le tampon de version ne s'appliquait jamais et la bannière
  « Mettre à jour » ne se déclenchait pas. Corrigé.

---

## Phase 2 — « Les soirées CaniPlus » (PR #2)

Webinaires payants en direct sur Zoom, avec PDF de support et replay Bunny.
Sous-titre de la série : *« Un thème, un soir, pour mieux comprendre ton chien. »*
Prestation de la **raison individuelle** : tunnel produit existant
(`create-product-checkout` → `stripe-webhook` → `user_purchases`), **aucun flux
club touché**, le webhook n'est pas modifié.

### Modèle de données (`supabase/migrations/add_soirees_webinaires_2026_07_13.sql`)

- Une soirée = une ligne `digital_products` avec `category='soiree'`
  + `event_date` (date/heure) + `event_duration_min`. `file_path` (PDF) optionnel.
- **`webinar_access`** : `zoom_url` + `bunny_video_id` par soirée, **sans lecture
  publique** (RLS admin + service role uniquement) — `digital_products` étant
  lisible publiquement, aucun secret n'y est stocké.
- `user_purchases.promo_code` : trace du code promo utilisé.
- ✅ **Migration déjà appliquée en production** (13 juillet 2026), purement
  additive. Une soirée d'exemple en brouillon existe (« Comprendre la réactivité »).

### Accès réservé aux acheteurs

- Fonction edge **`get-webinar-access`** : identité via **JWT** (non falsifiable),
  vérifie l'achat payé de cette soirée précise, renvoie lien Zoom + URL signée 1 h
  du PDF + URL d'embed du replay Bunny.
- Un achat = une soirée (contrainte `UNIQUE(user_id, product_id)` existante).
- Le checkout invité du site vitrine (`public-product-checkout`) **exclut** les
  soirées (pas de compte = pas d'accès Zoom).

### Code promo

- Champ « J'ai un code promo » dans la page de la soirée.
- `create-product-checkout` : refuse le code si le client l'a déjà utilisé sur un
  achat payé (**usage unique par personne**, vérifié en base), valide côté Stripe
  (actif, non expiré), applique la réduction à la session.
- Les codes se créent/régénèrent/expirent dans le **dashboard Stripe**
  (Produits → Coupons → Codes promotionnels), un par soirée.

### Écrans

- **Apprendre** : carte « Les soirées CaniPlus » (badge Nouveau) → liste À venir /
  Passées → détail. Avant achat : présentation, date, prix, code promo, bouton
  « Réserver ma place ». Après achat : lien Zoom, PDF, replay en lecteur intégré.
- Les **brouillons** sont visibles par l'admin directement dans l'app (badge
  « Brouillon — visible par toi seule ») pour valider le rendu avant publication.
- **Admin** (`/admin` → Contenu → **Soirées**) : création/édition (titre, date,
  prix, lien Zoom, upload PDF, identifiant Bunny, publication), badges d'état,
  **liste des inscrits** par soirée (nom, email, paiement, code promo).
- Bannière « Inscription confirmée ! » au retour de Stripe, redirection vers Apprendre.

---

## Périmètre non touché

`site-vitrine/` (hors garde-fou checkout invité), tables et fonctions edge du club,
profils chiens/vaccins (déplacés, pas modifiés), boutique de guides, premium,
cours privés/coaching, chat, notifications, admin (hors onglets Adhésions/Soirées).

---

## Mise en service (après merge des PR)

1. **Merger la PR #1**, puis la **PR #2** → Vercel redéploie app.caniplus.ch (~2 min).
   Grâce au fix du service worker, les utilisatrices verront la bannière
   « Mettre à jour » à leur prochaine ouverture.
2. ✅ ~~Migration SQL~~ — déjà appliquée.
3. **Déployer les fonctions edge** :
   `supabase functions deploy get-webinar-access create-product-checkout public-product-checkout`
   ⚠️ Ne pas redéployer `stripe-webhook` depuis le repo : le code déployé (v38)
   est plus récent que celui du repo.
4. Éditer/publier la soirée d'exemple depuis l'admin, créer le code promo dans
   Stripe si besoin.
5. Optionnel : variable Vercel `REACT_APP_CLUB_FEATURES=true` pour réactiver le
   club un jour.
