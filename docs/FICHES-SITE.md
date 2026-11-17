# Fiches pratiques : ce qui va sur le site

Tri décidé par Tiffany le 13 novembre 2026, complété le 14 novembre 2026.
Fait foi pour le lot 2 (fiches premium ou CHF 5 la fiche).

Source des PDF : dossier Drive des fiches au nouveau format
(`1KTs6h-VbZwZN6R7z9vwnB2EBJHR2eu0Q`). Le dossier contient 49 PDF (et non
50 comme écrit ailleurs) : 37 sur le site, 12 hors site. Vérifié le
14.11.2026, chaque fichier est dans une des deux listes.

Les PDF ne vont jamais dans ce dépôt (il est public) : stockage privé
Supabase uniquement.

## Sur le site : 37 fiches

**Bases** : Comment ton chien apprend ; Le renforcement positif ; Le mot
marqueur ; La règle des 3D ; Les zones de travail ; Les erreurs courantes en
éducation ; Les 10 réflexes du quotidien.

**Exercices courants** : Le rappel ; La marche en laisse ; L'exercice du
regard ; La touche prolongée de la main ; Les autocontrôles - le principe ;
L'autocontrôle - la main ; L'autocontrôle - la gamelle ; L'autocontrôle - la
porte ; La gestion de la frustration ; La sonnette.

**Chiot et quotidien** : La socialisation du chiot ; La propreté du chiot ;
Rester seul sereinement ; Le jeu, un outil éducatif ; Le jeu des 3 gobelets ;
Les signaux d'apaisement.

**Santé et sécurité** : Les plantes toxiques ; Les dangers à la maison ; La
chaleur et le coup de chaleur. (Pas relues pour ce tri.)

**Pratique** : Les transports publics en Suisse ; Vers qui se diriger.

**Vulgarisées et validées le 13.11.2026** : Le tapis de relaxation ;
L'habituation à la muselière ; La réactivité en laisse.

**Sorties de secours, ajoutées le 14.11.2026** : L'en face d'urgence ; On y
va - le demi-tour ; Vite, vite ; Respire ; Entre les jambes ; Derrière.

## Hors site : 12 fiches

Rééducation à faire avec une éducatrice : LATTE - les postes d'apaisement ;
LAT - regarde ça ; Le RAT - le bouton start ; Click to calm ; Le Whiplash
turn ; Up and Down ; Les Superbowls ; Le 1, 2, 3 ; Le ping-pong de
friandises ; La marche parallèle.

Exclues le 14.11.2026 : Les croisements (il faut un binôme avec un chien
calme et savoir lire la distance) ; La protection de ressource (la fiche
elle-même demande un accompagnement en cas de morsure ou d'enfants).

Jamais sur le site non plus : la série F00 à F15 des éducatrices.

## Format et vocabulaire (vérifié le 14.11.2026)

Les 37 fiches du site sont au gabarit 2026 (même en-tête, « L'idée à
retenir », même pied de page). Décision de Tiffany du 14.11.2026 : le
vocabulaire de métier restant dans les autres fiches (« payer », « zone
orange », « marquer ») est gardé tel quel.

Petits écarts relevés, non bloquants :
- Les dangers à la maison : phrase copiée de la fiche plantes (« Garde
  l'emballage ou un morceau de la plante »).
- La réactivité en laisse : pas de « C'est acquis quand » ni de progression
  (bloc « Si ça déborde quand même » à la place).
- Entre les jambes : pas de bloc « En situation », contrairement aux autres
  sorties de secours.

## Mise en vente (lot 2), mardi 17.11.2026

Préparé le 14.11.2026, branche `fiches-site` :
- 37 produits `digital_products` (catégorie `fiche`, CHF 5, slug `fiche-…`,
  PDF `fiches/….pdf` du bucket privé `fiches-pratiques`), **non publiés**.
- Fonction `envoyer-fiche` (en ligne) : PDF en pièce jointe, premium gratuit
  (JWT vérifié) ou achat payé (appel serveur du webhook).
- Page `/fiches`, encart Boutique de l'accueil (le guide à CHF 25 disparaît),
  sitemap.

À faire le 17.11, dans l'ordre :
1. Comparer `stripe-webhook` et `public-product-checkout` en ligne avec le
   dépôt avant de déployer (dérive possible), puis déployer.
2. `update digital_products set is_published = true where category = 'fiche';`
   et `update digital_products set is_published = false where slug = 'accueillir-2e-chien';`
3. Fusionner la branche, vérifier en production.
4. Achat test réel à CHF 5 (Tiffany) : mail reçu, PDF joint, montant sur le
   compte Stripe RI.
