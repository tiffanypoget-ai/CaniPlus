# Fiche Play Store — CaniPlus

À copier-coller directement dans la console Google Play lors de la création de la fiche.

---

## Informations principales

**Nom de l'application (max 30 car.)**
CaniPlus — Club canin

**Description courte (max 80 car.)**
Ton club canin à portée de main : cours, ressources, coaching, guides.

**Catégorie**
Mode de vie (secondaire : Éducation)

**Classification**
Tout public

**Langue principale**
Français (France) — fr-FR
Langues secondaires : Français (Suisse) fr-CH, Allemand de-CH (optionnel), Italien it-CH (optionnel)

---

## Description complète (max 4000 caractères)

CaniPlus — l'application officielle du club canin CaniPlus à Ballaigues (Suisse).

Conçue avec les familles que j'accompagne depuis plus de dix ans, CaniPlus réunit au même endroit tout ce dont tu as besoin pour éduquer, comprendre et faire grandir ton chien avec sérénité.

**Ce que tu trouves dans l'application**

— **Ton planning de cours.** Retrouve tous tes cours collectifs du mois dans un calendrier clair. Tu sais qui est ton moniteur, à quelle heure, où ça se passe, avec qui tu partages la séance. Plus jamais d'hésitation.

— **Tes cours privés et coaching.** Réserve une séance privée à domicile (60 CHF) ou un coaching à distance en visio (50 CHF). Tu proposes tes créneaux, tu règles directement dans l'app, Tiffany confirme sous 24h.

— **Tes ressources premium.** Articles, fiches pratiques et guides exclusifs pour comprendre ton chien : langage corporel, apprentissages, sorties, santé, quotidien. Mis à jour régulièrement (abonnement premium, 10 CHF/mois, résiliable à tout moment).

— **La boutique CaniPlus.** Des guides complets à télécharger : accueillir un deuxième chien, adopter un chien de refuge, randonner en Suisse avec ton chien. Chaque guide = une méthode éprouvée, sans mythe, sans méthode punitive.

— **Le suivi santé de ton chien.** Carnet de vaccination, rappels automatiques, fiche complète (race, âge, particularités). Ton vétérinaire peut même numériser le carnet pour toi.

— **Les nouvelles du club.** Annonces, événements, photos, rappels — rien ne se perd, tout est dans l'app.

**Pour qui ?**
Pour toutes les familles de Suisse romande (et d'ailleurs) qui veulent un chien équilibré, sans cris, sans dominance, sans pression.

**Ma méthode**
Positive, cohérente, respectueuse du chien comme de la famille. Pas de miracle en 3 jours : du concret, du temps, des étapes adaptées à chaque binôme.

**À propos de CaniPlus**
CaniPlus est un club canin basé à Ballaigues (canton de Vaud), fondé et dirigé par Tiffany Cotting, éducatrice canine.
Site : caniplus.ch — Contact : info@caniplus.ch

L'application est gratuite à l'installation. Les fonctionnalités premium (abonnement, guides, coaching) sont des achats optionnels payés via Stripe (Visa, Mastercard, TWINT).

---

## Mots-clés / tags (pour la recherche)

chien, éducation canine, club canin, coaching chien, dressage, chiot, comportement chien, Ballaigues, Suisse romande, vétérinaire, carnet de vaccination, cours canin, refuge, adoption

---

## Captures d'écran nécessaires

**Téléphone (obligatoire, 2 à 8 captures)** — 1080 × 1920 portrait (ou proche)
1. Écran d'accueil avec "Prochain cours" mis en avant
2. Planning calendrier mensuel
3. Fiche d'un cours (détail, participants, moniteur)
4. Écran Ressources premium (grille de fiches)
5. Détail d'un article ressource
6. Boutique (les 3 guides)
7. Modal de coaching (à domicile / à distance avec prix)
8. Profil + chien + carnet de vaccination

**Tablette 7" (optionnel)** — 1200 × 1920
**Tablette 10" (optionnel)** — 1920 × 1200

**Icône Play Store** — 512 × 512 PNG 32 bits (transparent OK)
**Image de bandeau** — 1024 × 500 JPG/PNG

---

## Coordonnées développeur / éditeur

- **Nom de l'éditeur** : CaniPlus — Tiffany Cotting
- **Site web** : https://caniplus.ch
- **Email de contact** : info@caniplus.ch
- **Adresse physique** (obligatoire pour paiements intégrés) : à renseigner (Ballaigues, VD, Suisse)
- **Politique de confidentialité** : https://caniplus.ch/confidentialite (à créer si pas déjà en ligne)
- **Conditions d'utilisation** : https://caniplus.ch/cgu (à créer si pas déjà en ligne)

---

## Paramètres Play Console

- **Type d'application** : Application (pas un jeu)
- **Gratuite ou payante** : Gratuite
- **Achats in-app** : OUI (via Stripe Web, pas Google Play Billing — voir note ci-dessous)
- **Publicités** : Non

### Note importante — achats in-app et règlement Google Play

Google Play impose l'usage de **Play Billing** pour les biens et services numériques consommés dans l'app. Pour CaniPlus, le premium et les guides sont payés via Stripe.

Deux options :
1. **Marquer les paiements comme "service externe"** : CaniPlus est un service physique (cours en vrai, coaching en vrai) — les paiements in-app concernent des services réels, donc Stripe reste autorisé. Les guides PDF sont téléchargés mais accessoires à un service physique.
2. **Passer les paiements via le navigateur** : au moment de payer, ouvrir Chrome (Custom Tab) plutôt que de rester dans la WebView. Le TWA le fait déjà par défaut pour les URLs hors scope.

⚠️ **À valider avec la politique Google Play avant publication** — si Google refuse, il faudra soit migrer vers Play Billing, soit retirer les paiements premium de l'app Android (rester sur Stripe via navigateur hors app).

---

## Contenu sensible — déclarations obligatoires

- **Âge minimum** : 3 ans (aucune violence, aucun contenu adulte)
- **Autorisations Android** : Internet, Notifications, Caméra (scan carnet de vaccination optionnel)
- **Collecte de données** : email, nom, historique d'achats, données d'utilisation anonymes (Supabase + Stripe)
- **Chiffrement en transit** : OUI (HTTPS partout)
- **Ciblage familial** : NON (l'app n'est pas conçue pour les enfants)

---

## Checklist avant soumission

- [ ] Manifest PWA validé (déjà OK)
- [ ] Icônes 192×192 et 512×512 présentes (OK)
- [ ] AAB généré par Bubblewrap
- [ ] assetlinks.json en ligne sur https://cani-plus.vercel.app/.well-known/assetlinks.json
- [ ] Privacy policy + CGU en ligne
- [ ] Captures d'écran générées (8 téléphone minimum)
- [ ] Icône 512×512 Play Store + bandeau 1024×500
- [ ] Fiche remplie dans la console
- [ ] Test interne (release track "internal testing") avec 2-3 testeurs
- [ ] Publication en "open testing" (beta) pendant 2 semaines
- [ ] Passage en production
