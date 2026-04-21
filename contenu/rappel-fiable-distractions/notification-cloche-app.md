# Notification push — App CaniPlus

**Objectif** : annoncer aux membres premium la mise en ligne de la nouvelle ressource "Le rappel qui marche vraiment" dans la section Ressources.

**Cible** : tous les membres de l'app (premium + non premium, afin d'inciter les non premium à s'abonner).

**Déclenchement** : lundi en fin d'après-midi (entre 17h et 18h), moment où les maîtres rentrent du travail et pensent à la balade du soir.

---

## Version courte (affichée sur écran verrouillé)

**Titre**
Nouvelle ressource premium

**Corps**
Le protocole complet pour un rappel qui tient, même en pleine forêt. À lire avant la balade de ce soir.

---

## Version longue (ouverte dans l'app, bandeau "nouveautés")

**Titre**
🔔 Nouveau guide : Le rappel qui marche vraiment

**Corps**
Tu appelles, il ne revient pas ? Ce n'est pas une question d'obéissance. C'est une question de méthode.

Le nouveau protocole est en ligne dans Ressources > Obéissance & balades.

Au programme :
• 5 étapes progressives, de la maison au parc public
• La règle d'or qui empêche le rappel de se casser
• Une grille de progression pour suivre ton chien
• Un carnet de séance à imprimer ou à suivre dans l'app

Membres premium : accès immédiat.
Non premium : aperçu gratuit + abonnement 10 CHF/mois sans engagement.

**CTA**
Lire la ressource

---

## Variante SMS / e-mail de relance (J+3 pour les non-premium)

**Objet**
Le rappel, c'est technique. Et ça s'apprend.

**Corps**
Bonjour,

Lundi j'ai mis en ligne dans l'app CaniPlus un nouveau guide complet sur le rappel. En 5 étapes, avec les distances, les distractions à introduire dans l'ordre et une grille de progression pour savoir quand passer à l'étape suivante.

C'est le genre de protocole qui aurait pu te faire gagner plusieurs mois si tu l'avais eu quand ton chien était chiot. Et qui peut encore tout changer si ton rappel est "grillé".

Pour y accéder : abonnement premium à 10 CHF/mois, sans engagement, résiliable en un clic depuis ton profil.

[Ouvrir l'app](https://app.caniplus.ch) → Ressources → "Le rappel qui marche vraiment"

À bientôt,
Tiffany

---

## Paramètres techniques

• Type : notification push native PWA (Supabase + service worker)
• Envoi segmenté : premium / non premium (messages légèrement différents si souhaité)
• Action : ouvrir directement sur la fiche ressource dans l'onglet Ressources
• Badge : +1 sur l'onglet Ressources jusqu'à lecture
• À archiver dans l'historique des notifications du profil utilisateur
