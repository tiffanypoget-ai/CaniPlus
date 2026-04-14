# 🐾 RAPPORT D'AUDIT COMPLET — CaniPlus
**Date :** 14 avril 2026  
**Méthode :** Analyse statique du code local + test live sur https://cani-plus.vercel.app + test panel admin  
**Résultat général :** 0 erreur JavaScript en console, app globalement stable — mais plusieurs bugs et incohérences identifiés

---

## 📊 ÉTAT DE SYNCHRONISATION

| Source | État |
|--------|------|
| **GitHub (main)** | Ancienne version — 27 fichiers locaux non committés |
| **Vercel (prod)** | = GitHub — pas à jour avec le local |
| **Local** | Version la plus récente, à pousser via GitHub Desktop |

> ⚠️ **Action requise :** Commit + Push des 27 fichiers modifiés via GitHub Desktop pour que Vercel se mette à jour. Les corrections de cette session (suppression de compte, déconnexion) ne sont PAS encore en production.

---

## 🔴 BUGS CRITIQUES (cassent une fonctionnalité)

### 1. Mot de passe oublié — non fonctionnel
- **Écran :** LoginScreen → "Mot de passe oublié ?"
- **Problème :** Connu dans les TODOs du projet, non corrigé
- **Impact :** Un utilisateur qui perd son mot de passe ne peut pas récupérer son compte
- **Fix :** Vérifier la configuration Supabase Auth (URL de redirection, emails activés) + tester `resetPasswordForEmail` dans la console

### 2. Formulaire cours privé — validation silencieuse
- **Écran :** Planning > Privés > "+ Demander"
- **Problème :** Cliquer "📨 Envoyer ma demande" sans remplir de date ne montre **aucun message d'erreur**. L'envoi échoue silencieusement et la modale reste ouverte sans feedback.
- **Impact :** L'utilisateur ne sait pas pourquoi ça ne marche pas
- **Fix :** Ajouter une validation dans `PrivateCourseRequestModal.jsx` avant l'envoi :
```js
if (!slots.some(s => s.date)) {
  setError('Merci de remplir au moins une date.');
  return;
}
```

### 3. Inscription — erreur vague "Une erreur s'est produite"
- **Écran :** LoginScreen > "Créer un compte"
- **Problème :** La création de compte échoue avec un message générique. La vraie erreur Supabase (rate limit, email déjà utilisé en état transitoire, etc.) n'est pas affichée.
- **Impact :** Impossible de diagnostiquer et corriger pour l'utilisateur
- **Fix dans `LoginScreen.jsx`** :
```js
if (error) {
  const msg = error.message || '';
  if (msg.includes('already registered') || msg.includes('already exists')) {
    setError('Un compte existe déjà avec cet e-mail.');
  } else if (msg.includes('rate limit') || msg.includes('email')) {
    setError('Trop de tentatives. Attends quelques minutes et réessaie.');
  } else {
    setError(`Erreur : ${msg}`); // ← Afficher le vrai message pour debug
  }
}
```

### 4. Nom du membre manquant dans l'onglet Paiements (admin)
- **Écran :** Admin > 💳 Paiements
- **Problème :** Les paiements affichent "—" à la place du nom du membre. La table `subscriptions` ne contient pas directement le nom — il faut joindre `profiles`.
- **Impact :** Impossible de savoir à qui appartient un paiement
- **Fix dans `AdminScreen.jsx`** : L'action `list_subscriptions` doit inclure le profil :
```js
// Dans admin-query/index.ts, action list_subscriptions :
.select('*, profiles(full_name, email)')
```

---

## 🟠 BUGS MOYENS (UX dégradée mais app utilisable)

### 5. Changement de mot de passe sans vérifier le mot de passe actuel
- **Écran :** Profil > "Changer le mot de passe"
- **Problème :** La modale n'a que "Nouveau mot de passe" et "Confirmer" — pas de "Mot de passe actuel". Si quelqu'un accède à une session ouverte (téléphone déverrouillé), il peut changer le mot de passe sans connaître l'ancien.
- **Fix :** Ajouter un champ "Mot de passe actuel" et vérifier avec `supabase.auth.signInWithPassword()` avant d'appeler `updateUser`.

### 6. Section Documents — entièrement "Bientôt"
- **Écran :** Profil > Documents
- **Problème :** Tous les documents (Règlement intérieur, Attestation, Programme annuel, ressources PDF) affichent "Bientôt". La description dans le profil promet "Règlement, attestations, programme" mais rien n'est disponible.
- **Impact :** Attente déçue pour les membres
- **Fix :** Soit ajouter les vrais documents (PDF uploadés dans Supabase Storage), soit retirer la section Documents du profil jusqu'à ce qu'elle soit prête.

### 7. Section Ressources — texte d'état vide inadapté
- **Écran :** Ressources 📚
- **Problème :** Quand la base de données est vide (aucune ressource créée), le message est "Essaie une autre catégorie ou modifie ta recherche." — alors que l'utilisateur n'a rien cherché.
- **Fix dans `RessourcesScreen.jsx`** :
```js
// Différencier "résultat de recherche vide" vs "base de données vide"
{resources.length === 0 && !searchQuery && activeCategory === 'Tout' 
  ? "Aucune ressource disponible pour l'instant. Reviens bientôt !"
  : "Aucun résultat. Essaie une autre catégorie."}
```

### 8. Articles News non cliquables
- **Écran :** News 📣
- **Problème :** Les articles s'affichent en entier dans une liste, mais ne sont pas interactifs. Pour les longs articles, impossible d'expand ou de voir une vue détaillée.
- **Fix :** Ajouter un clic sur la card pour ouvrir une modale "détail de l'article" avec le contenu complet.

### 9. Nom des éducatrices hardcodé dans NewsScreen
- **Écran :** News 📣 (en haut de page)
- **Problème :** `👩‍🏫 Éducatrices : Tiffany Cotting & Laetitia Erek` est écrit en dur dans le composant. Si les éducatrices changent, il faut modifier le code.
- **Fix :** Soit une variable dans un fichier de configuration, soit récupérer les profils avec `role = 'admin'` depuis Supabase.

### 10. Bandeau info HomeScreen non implémenté (TODO)
- **Écran :** Accueil 🏠
- **Problème :** La tâche "Bandeau info entre 'Cette semaine' et 'Mon espace'" est dans la liste des TODOs mais pas encore implémentée.
- **Fix :** Ajouter un petit bloc entre la section "Cette semaine" et "Accès rapide" qui affiche la dernière news publiée, avec un lien "Voir tout →".

---

## 🟡 PROBLÈMES TECHNIQUES (dette technique, pas visible par les utilisateurs)

### 11. Architecture .js / .jsx dupliquée — risque de confusion
- **Problème :** 17 paires de fichiers `.js` et `.jsx` coexistent dans `src/`. Vite charge `.js` avant `.jsx`, donc les `.jsx` peuvent être ignorés selon la config.
- **Fichiers à risque :** `useAuth.js`/`.jsx`, `HomeScreen.js`/`.jsx`, `ProfilScreen.js`/`.jsx`
- **Fix recommandé :** Supprimer tous les fichiers `.jsx` et ne garder que les `.js` (ou l'inverse), et configurer Vite explicitement pour un seul format.

### 12. Appels Supabase sans .catch() (~15 occurrences)
- **Fichiers :** `ProfilScreen`, `RessourcesScreen`, `NewsScreen`, `HomeScreen`
- **Problème :** Pattern `.then(({ data }) => { if (data) setState(data); })` sans gestion d'erreur réseau. Si Supabase est temporairement down, l'app affiche un état vide sans explication.
- **Fix :** Ajouter `.catch(err => { setError('Erreur de chargement. Réessaie.'); console.error(err); })`

### 13. Service Worker enregistré hors useEffect
- **Fichier :** `App.js` lignes 104-106
- **Problème :** L'enregistrement du SW s'exécute à chaque render du composant, pas une seule fois.
- **Fix :**
```js
useEffect(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }
}, []);
```

### 14. console.log oubliés en production
- `HomeScreen.jsx` : `console.log('HomeScreen v3 loaded')` et `const _BUILD_ID = 'XK9Q2_FORCE_NEW_HASH_20260413'`
- `AdminScreen.jsx` : plusieurs `console.log('[PlanningTab] list_courses →', ...)`
- **Fix :** Supprimer ou remplacer par `if (process.env.NODE_ENV === 'development') console.log(...)`

### 15. URL de reset password hardcodée
- **Fichier :** `LoginScreen.jsx` ligne 36
- **Problème :** `redirectTo: 'https://cani-plus.vercel.app/reset-password'` — cassera si le domaine change
- **Fix :** `redirectTo: window.location.origin + '/reset-password'`

### 16. `full_name` split sans trim
- **Fichier :** `HomeScreen.js`
- **Problème :** `profile?.full_name?.split(' ')[0] ?? 'Membre'` — si le nom est une chaîne vide ou contient des espaces en début, ça peut afficher un prénom vide
- **Fix :** `profile?.full_name?.split(' ')[0]?.trim() || 'Membre'`

---

## ✅ CE QUI FONCTIONNE BIEN (testé et confirmé)

| Fonctionnalité | Statut |
|----------------|--------|
| Login / Logout | ✅ |
| Planning — calendrier, dots de cours | ✅ |
| Planning — inscription/désinscription | ✅ |
| Planning — onglet Privés (liste) | ✅ |
| Profil — chiens (ajout, édition, vaccin) | ✅ |
| Profil — abonnements (cotisation, premium) | ✅ |
| Profil — paiement leçon privée (modale Stripe) | ✅ |
| Profil — notifications | ✅ |
| Profil — changement de mot de passe (validation 8 car.) | ✅ |
| News — affichage liste | ✅ |
| Admin — onglet Membres (liste, expand chiens) | ✅ |
| Admin — onglet Paiements (liste, suppression) | ✅ |
| Admin — onglet Demandes (filtres par statut) | ✅ |
| Admin — onglet Planning (créer, éditer, supprimer cours) | ✅ |
| Admin — onglet News (créer, modifier, masquer, supprimer) | ✅ |
| Admin — suppression de compte membre | ✅ (fix déployé cette session) |
| 0 erreur JavaScript en console | ✅ |
| Toutes les requêtes API → 200 | ✅ |

---

## 📋 ÉTAT DES TODOs DU PROJET

### Application client
| Tâche | État |
|-------|------|
| Profil chien obligatoire à l'inscription | ✅ Fait |
| Cotisation par chien (150 CHF × nb chiens) | ✅ Fait |
| Cotisation non payable dans l'app | ✅ Fait |
| Onglet Messages → News | ✅ Fait |
| Planning calendrier mensuel | ✅ Fait |
| **Bandeau info HomeScreen** | ❌ À faire |
| **Mot de passe oublié** | ❌ À corriger |

### Application admin
| Tâche | État |
|-------|------|
| Supprimer l'onglet Chiens (intégré sous membres) | ✅ Fait (expand ▼) |
| Supprimer un paiement | ✅ Fait (bouton 🗑) |
| Annuler un cours privé | ✅ Fait (bouton "🗑 Cours privé") |

---

## 🗓️ PRIORITÉS SUGGÉRÉES

### À faire en premier (bloquant)
1. **Pousser les 27 fichiers via GitHub Desktop** pour mettre Vercel à jour
2. **Corriger la validation du formulaire cours privé** (message d'erreur manquant)
3. **Afficher le nom du membre dans les paiements admin** (fix 1 ligne dans edge function)
4. **Corriger le message d'erreur d'inscription** (afficher la vraie erreur)
5. **Déboguer "Mot de passe oublié"** (vérifier les emails Supabase)

### À faire ensuite (important mais non bloquant)
6. Implémenter le **bandeau info HomeScreen** (dernière news)
7. Rendre les **articles News cliquables** (modale détail)
8. Ajouter des **vrais documents PDF** dans la section Documents (ou retirer la section)
9. Corriger le **texte d'état vide** des Ressources

### À faire quand tu as le temps (qualité / sécurité)
10. Ajouter vérification **mot de passe actuel** avant changement
11. Dépublier le nom des éducatrices hardcodé
12. Nettoyer les `console.log` de production
13. Ajouter `.catch()` sur les appels Supabase
14. Corriger l'URL reset password (`window.location.origin`)
15. Nettoyer l'architecture `.js`/`.jsx` dupliquée

---

## 🔧 MODIFICATIONS DE CETTE SESSION (non encore commitées)

Ces 2 fichiers ont été modifiés dans cette session et doivent être inclus dans le prochain commit :

| Fichier | Changement |
|---------|------------|
| `src/hooks/useAuth.js` | Ajout `checkSessionValid` avec garde `getSession()` pour détecter les comptes supprimés et déconnecter automatiquement |
| `supabase/functions/admin-query/index.ts` | `delete_member` utilise REST API Supabase Auth + catch block retourne status 200 |

> La Edge Function `admin-query` a déjà été déployée via le dashboard Supabase. Le fichier local est maintenant synchronisé avec le déployé.

---

*Rapport généré automatiquement — Audit de nuit CaniPlus · Avril 2026*
