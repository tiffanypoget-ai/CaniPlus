# Récap session — 11 mai 2026

Trois gros chantiers terminés côté code en autonomie. Pour passer en prod, il y a quelques étapes à faire (push GitHub + migration SQL + déploiement edge functions). Je détaille tout en bas.

---

## Chantier A — Achat des guides depuis le site (livraison par email)

Quand un visiteur clique sur « Acheter » sur caniplus.ch, un mini formulaire s'ouvre et demande son adresse email. Il paie via Stripe (carte ou TWINT), puis reçoit automatiquement le PDF du guide par email dans la minute qui suit. Plus besoin de créer un compte ni de passer par l'app.

**Ce qui se passe techniquement**

- Le bouton « Acheter — livraison par email » sur la carte du guide ouvre un modal avec champ email + bouton paiement
- Le front appelle la nouvelle edge function `public-product-checkout` (sans authentification)
- Stripe Checkout s'ouvre, le visiteur paie
- Le webhook `stripe-webhook` détecte le paiement guest, génère une URL signée du PDF valable 7 jours, et envoie l'email via Brevo
- Tu reçois aussi une notification admin (cloche + push + email)
- Au retour sur le site, une bannière verte confirme l'achat à l'utilisateur

**Fichiers modifiés / créés**

- `supabase/functions/public-product-checkout/index.ts` (nouveau)
- `supabase/functions/stripe-webhook/index.ts` (bloc `product_purchase_guest` ajouté)
- `site-vitrine/index.html` (modal d'achat + bannière succès + bouton sur la carte produit)
- `site-vitrine/images/boutique/cover-accueillir-2e-chien.jpg` (copié depuis l'app)
- Migration SQL : colonnes `guest_email` et `delivered_at` sur `user_purchases`, contrainte « soit user_id soit guest_email »

---

## Chantier B — Prix cours privé selon code postal du client

Dans l'app, quand un membre clique sur « Coaching personnalisé » et choisit « À domicile », un champ NPA est demandé. Au fur et à mesure qu'il tape, on calcule sa distance routière depuis chez toi (Chez Thouny 6) via OSRM, et on affiche le détail :

- 0-15 km : déplacement offert (60 CHF total)
- 15-50 km : 60 CHF + ((km routiers − 15) × 0.75 CHF) — aller simple
- > 50 km : « tarif sur demande »

Le NPA est sauvegardé dans le profil du membre, donc la fois suivante il est pré-rempli. La demande de cours privé enregistre le NPA, la ville, les km et les frais de déplacement calculés (visible côté admin).

**Fichiers modifiés**

- `src/components/CoachingRequestModal.jsx` (champ NPA + Nominatim + OSRM + affichage prix total)
- Migration SQL : colonnes `postal_code`, `city` sur `profiles` ; `postal_code`, `city`, `road_km`, `travel_extra_chf` sur `private_course_requests`

---

## Chantier C — Paiement sur place

Quand un membre veut payer une leçon privée ou un cours théorique, il a maintenant le choix « En ligne » (Stripe comme avant) ou « Sur place » (cash/TWINT à la séance). L'option est configurable par toi dans l'admin, par type de prestation (table `payment_options`). Par défaut :

- Leçon privée : cash autorisé
- Cours théorique : cash autorisé
- Cours spécial : cash autorisé
- Cotisation annuelle : cash désactivé (toujours admin only)
- Premium et guides : cash désactivé (paiement Stripe obligatoire)

Quand un membre choisit « Sur place », sa souscription passe en `status='pending_payment'` avec `payment_mode='cash'`. Tu reçois une notification, et tu vois sa réservation dans le nouvel onglet admin **« À encaisser »** avec un bouton « Marquer payé » à cliquer une fois l'argent reçu.

**Fichiers modifiés / créés**

- `src/components/PaiementModal.js` (sélecteur en ligne / sur place + logique cash)
- `src/components/CashPaymentsList.jsx` (composant admin pour la liste à encaisser, nouveau)
- `src/screens/AdminScreen.jsx` (nouvel onglet « À encaisser » entre Paiements et Demandes)
- `supabase/functions/admin-query/index.ts` (nouvelles actions : `mark_cash_paid`, `list_cash_pending`, `list_payment_options`, `set_payment_option`)
- Migration SQL : colonne `payment_mode` sur `subscriptions` et `private_course_requests`, nouvelle table `payment_options` avec les valeurs par défaut

---

## Étapes pour mettre en prod

À ton retour, voici dans l'ordre ce qu'il faut faire :

**1. Push GitHub Desktop**

Ouvre GitHub Desktop, tu verras tous les fichiers modifiés. Commit + push. Vercel redéploiera l'app et le site vitrine tout seul.

**2. Appliquer la migration SQL**

- Va sur https://supabase.com/dashboard/project/oncbeqnznrqummxmqxbx
- SQL Editor → New query
- Colle le contenu de `supabase/migrations/add_guest_purchases_and_postal_code_2026_05_11.sql`
- Run

**3. Déployer 3 edge functions**

Dans Supabase Dashboard → Edge Functions :

- `public-product-checkout` (créer la nouvelle fonction et coller le code de `supabase/functions/public-product-checkout/index.ts`)
- `stripe-webhook` (mettre à jour avec le contenu de `supabase/functions/stripe-webhook/index.ts`)
- `admin-query` (mettre à jour avec le contenu de `supabase/functions/admin-query/index.ts`)

Si tu préfères, tu peux me demander à ton retour de les déployer via Chrome MCP comme on a fait pour les autres.

**4. Vérifier la variable BREVO_API_KEY**

Dans Supabase Dashboard → Project Settings → Edge Functions → Secrets, vérifier que `BREVO_API_KEY` est bien défini (sinon les emails d'achat de guide ne partiront pas). Elle devrait déjà l'être puisque les autres fonctions Brevo l'utilisent.

---

## Tests à faire après mise en prod

**Chantier A — Achat sur site**

- Ouvrir caniplus.ch en navigation privée
- Aller dans la section Boutique
- Cliquer sur « Acheter — livraison par email »
- Mettre une adresse mail à toi, payer avec une carte test Stripe (4242 4242 4242 4242, n'importe quelle date future, n'importe quel CVC)
- Vérifier que tu reçois le PDF par email
- Vérifier dans Supabase → user_purchases qu'il y a une ligne avec guest_email + status='paid' + delivered_at

**Chantier B — NPA dans coaching**

- Connecte-toi à app.caniplus.ch avec un compte membre
- Ouvre la modal de demande de coaching, mode « À domicile »
- Tape un NPA (par ex 1010) → tu dois voir la ville s'afficher et le calcul des frais
- Envoie la demande
- Vérifie dans le panel admin que la demande a bien le NPA, la ville, les km et le supplément

**Chantier C — Paiement sur place**

- Connecte-toi avec un compte membre
- Clique pour acheter une leçon privée
- Tu dois voir le choix « En ligne / Sur place »
- Choisis « Sur place » → la réservation est créée
- Va dans l'admin → onglet « À encaisser » → tu dois voir la réservation
- Clique « Marquer payé » → elle disparaît de la liste, passe en status='paid'

---

## Détails techniques utiles

**Tarif déplacement (cohérent avec le site vitrine)**

- Base : Chez Thouny 6, 1338 Ballaigues (46.7329, 6.3922)
- Routage : OSRM public (`router.project-osrm.org`), gratuit, sans clé
- Formule : `Math.max(0, road_km − 15) × 0.75` (aller simple)
- Au-delà de 50 km : tarif sur demande

**Sécurité achat invité**

- `user_purchases.user_id` est devenu nullable, mais une contrainte garantit qu'on a au moins `user_id` OU `guest_email`
- La fonction `public-product-checkout` n'a pas besoin d'auth (CSRF non-problématique car le paiement Stripe authentifie l'acheteur via son adresse email)

**Notifications admin**

- Chaque achat guest → notification `payment_received` (in_app + push + email)
- Chaque réservation cash → notification `payment_received` (in_app + push)

---

## Ce qui n'est pas fait

- Pas d'UI admin pour activer/désactiver le cash par type de prestation (les actions `list_payment_options` et `set_payment_option` existent côté backend, mais pas encore d'écran admin). Pour l'instant les valeurs par défaut sont OK. Si tu veux modifier ça depuis Supabase Dashboard direct, c'est dans la table `payment_options`.
- Pas de gestion du paiement sur place pour les coaching requests (`private_course_requests`) — uniquement pour les `subscriptions` standard. Si tu veux étendre, on pourra le faire en session suivante.
- L'image de couverture du guide a été copiée du dossier `public/images/boutique/` vers `site-vitrine/images/boutique/`. Si tu ajoutes d'autres guides, il faudra copier leurs covers aussi.

---

Bon retour. Tout est testable à blanc dans Supabase / Stripe en mode test avant de pousser en prod si tu veux.
