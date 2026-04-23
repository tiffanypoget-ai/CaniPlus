# Play Store — Roadmap CaniPlus

Guide pas-à-pas pour publier l'app CaniPlus sur Google Play Store en utilisant Bubblewrap (TWA — Trusted Web Activity).

Durée totale estimée : **4 à 6 heures de travail actif** + 2 à 7 jours de validation par Google.

---

## Vue d'ensemble — à quoi ça ressemble

Un TWA, c'est l'app CaniPlus (PWA en ligne sur cani-plus.vercel.app) encapsulée dans un conteneur Android. L'utilisateur voit "une vraie app" dans le Play Store, mais ce qui s'affiche c'est la PWA elle-même, en plein écran, sans barre Chrome.

**Avantages** :
- Un seul codebase à maintenir (le web)
- Les mises à jour sont instantanées (pas besoin de resoumettre un APK pour chaque correction)
- Les notifications push fonctionnent
- L'app apparaît dans le tiroir Android comme une vraie app

**Limites** :
- Il faut une PWA installable (OK, déjà en place)
- Les paiements Stripe doivent être validés par Google (voir `store-listing.md` section "Note importante")
- Nécessite un compte développeur Google Play (25 USD, unique)

---

## Étape 1 — Prérequis (1h)

### 1.1 Créer le compte Google Play Developer

1. Aller sur https://play.google.com/console
2. Créer un compte (25 USD de frais uniques)
3. Remplir profil : nom "CaniPlus — Tiffany Cotting", site caniplus.ch, email info@caniplus.ch
4. Vérifier l'identité (passeport ou pièce d'identité suisse)
5. Attendre validation (24 à 48h)

### 1.2 Installer les outils locaux

Sur l'ordinateur (Windows / Mac / Linux) :

```bash
# Node.js 18+ déjà installé (requis pour Vite)
npm install -g @bubblewrap/cli

# Vérifier
bubblewrap --version

# Android Studio (pour générer la keystore et l'AAB final)
# Télécharger : https://developer.android.com/studio
```

Bubblewrap va demander d'installer Java et Android SDK — dire oui à tout, il gère l'installation.

### 1.3 Vérifier la PWA

Ouvrir https://cani-plus.vercel.app dans Chrome desktop.
1. DevTools → Lighthouse → "Progressive Web App"
2. Score attendu ≥ 90 avec "Installable" ✓
3. Vérifier que `manifest.json` contient bien les champs `name`, `short_name`, `start_url`, `display: standalone`, icônes 192 et 512

---

## Étape 2 — Générer le projet TWA avec Bubblewrap (30 min)

```bash
# Dans un dossier à part (PAS dans le repo CaniPlus)
mkdir -p ~/caniplus-twa && cd ~/caniplus-twa

# Initialiser depuis le manifest en ligne
bubblewrap init --manifest https://cani-plus.vercel.app/manifest.json
```

Bubblewrap pose ~20 questions. Réponses recommandées :

| Question | Réponse |
|---|---|
| Domain | `cani-plus.vercel.app` |
| URL path | `/` |
| Application name | `CaniPlus` |
| Short name | `CaniPlus` |
| Application ID (package name) | `ch.caniplus.app` |
| Starting version code | `1` |
| Display mode | `standalone` |
| Status bar color | `#1F1F20` |
| Splash background color | `#1F1F20` |
| Icon URL | `https://cani-plus.vercel.app/icons/icon-512.png` |
| Maskable icon URL | `https://cani-plus.vercel.app/icons/icon-512.png` |
| Include monochrome icon | Non |
| Signing key path | `./android.keystore` |
| Key alias | `caniplus` |
| Keystore password | **À conserver précieusement** (mot de passe fort, type gestionnaire de mots de passe) |
| Key password | Idem |
| First and last name | Tiffany Cotting |
| Organization | CaniPlus |
| Country | CH |

⚠️ **Ne perds jamais ces deux mots de passe**. Sans eux, tu ne pourras plus publier de mise à jour. Sauvegarde la keystore ET les mots de passe dans un gestionnaire (Bitwarden, 1Password).

À l'issue, tu as :
- `twa-manifest.json` (configuration)
- `android.keystore` (clé de signature, binaire)
- un projet Android complet

---

## Étape 3 — Générer l'AAB (Android App Bundle) (20 min)

```bash
cd ~/caniplus-twa
bubblewrap build
```

Bubblewrap demande les mots de passe (keystore + key). Il produit :
- `app-release-signed.aab` — le fichier à envoyer à Google Play
- `app-release-signed.apk` — pour tester localement sur un téléphone Android

**Tester sur un téléphone** (optionnel mais recommandé) :
```bash
# Copier l'APK sur le téléphone, l'installer manuellement
adb install app-release-signed.apk
```

---

## Étape 4 — Récupérer le SHA256 de la clé de signature (10 min)

```bash
# Dans ~/caniplus-twa
keytool -list -v -keystore android.keystore -alias caniplus
```

Saisir les mots de passe. Copier la valeur `SHA256:` (format `AA:BB:CC:DD:...`).

⚠️ **Important** : Si tu utilises **Play App Signing** (recommandé, activé par défaut), Google va re-signer l'AAB avec SA propre clé. C'est cette clé-là qu'il faudra mettre dans assetlinks.json, pas la tienne.

Après avoir uploadé le premier AAB dans la Play Console :
1. Aller dans **Version de l'application → Paramètres → Intégrité de l'app → Signature**
2. Copier le SHA-256 de la "clé de signature d'application" (pas "clé de téléchargement")
3. Le coller dans `public/.well-known/assetlinks.json` à la place de `REMPLACER_PAR_LE_SHA256_DE_LA_CLE_PLAY_APP_SIGNING`
4. Redéployer le site Vercel
5. Vérifier : https://cani-plus.vercel.app/.well-known/assetlinks.json doit retourner le fichier JSON

### Tester que Digital Asset Links fonctionne

https://developers.google.com/digital-asset-links/tools/generator

Renseigner : `cani-plus.vercel.app`, package `ch.caniplus.app`, SHA256. Cliquer Test. Le statut doit être `Verified`.

---

## Étape 5 — Créer la fiche Play Store (1 à 2h)

Aller sur https://play.google.com/console → Créer une application.

Champ par champ, utiliser le contenu de `store-listing.md`.

### Ressources graphiques à fournir (À PRÉPARER AU CALME)

| Élément | Dimensions | Format | Notes |
|---|---|---|---|
| Icône Play Store | 512 × 512 | PNG 32 bits | Utiliser `/public/icons/icon-512.png` si cadrage OK, sinon recadrer |
| Bandeau (feature graphic) | 1024 × 500 | JPG/PNG | À créer (photo chien + logo CaniPlus + slogan) |
| Captures téléphone | 1080 × 1920 (ou 1080 × 2340) | PNG | 2 à 8 captures. Tester sur émulateur Pixel 7 ou téléphone réel |
| Captures tablette 7" | 1200 × 1920 | PNG | Optionnel |
| Captures tablette 10" | 1920 × 1200 | PNG | Optionnel |

**Astuce captures** : Chrome DevTools → Toggle Device Toolbar → choisir "Pixel 7" → naviguer dans les écrans clés → capture d'écran "full size". Résultat direct en 1080 × 2340, accepté par Play.

---

## Étape 6 — Upload de l'AAB et test interne (30 min)

1. Play Console → **Version de l'application** → **Tests internes** → Créer une version
2. Uploader `app-release-signed.aab`
3. Ajouter notes de version : "Première version publique"
4. Ajouter 2-3 testeurs (email Gmail) — dont toi
5. Publier sur le canal interne
6. Suivre le lien envoyé par email pour installer depuis le Play Store (testing)

Test à faire sur le téléphone :
- [ ] L'app s'ouvre sans barre Chrome
- [ ] Le login Supabase fonctionne
- [ ] Les images chargent
- [ ] Les notifications push fonctionnent (optionnel à l'étape 1)
- [ ] Le paiement Stripe s'ouvre correctement (Custom Tab)
- [ ] La navigation vers la boutique fonctionne
- [ ] Le bouton retour Android ne sort pas de l'app abruptement

Si un problème : corriger la PWA (pas l'app), redéployer Vercel, retester directement dans l'app — pas besoin de renvoyer un nouvel AAB tant que tu n'as pas changé la config TWA.

---

## Étape 7 — Déclarations obligatoires Play Store (30 min)

Dans la Play Console, remplir obligatoirement :

1. **Public cible et contenu** → 13+ (pas conçu pour enfants), aucun contenu violent
2. **Publicités** → Non, l'app ne contient pas de publicité
3. **Accès à l'app** → Tout est accessible sans identifiants → Sélectionner "L'accès à l'app est restreint" et fournir un compte de test (email + mot de passe créés exprès)
4. **Données utilisateur** (formulaire très long, ~25 min) :
   - Données collectées : Email, Nom, Données de paiement (mais "traité par un tiers : Stripe"), Historique d'achats, Interactions avec l'app
   - Chiffrement en transit : OUI (HTTPS partout)
   - Suppression des données : lien vers info@caniplus.ch ou une page dédiée
5. **Politique de confidentialité** → URL https://caniplus.ch/confidentialite (⚠️ doit exister en ligne avant soumission)
6. **Classification du contenu** → Remplir le questionnaire IARC (5 min, résultat attendu : "Tout public")
7. **Conformité Play** → Achats in-app = oui, nature "services physiques" (cours réels) + "guides numériques accessoires"

---

## Étape 8 — Beta ouverte puis production (2 semaines + 1 jour)

**Recommandé** : ne pas passer directement en production. Phase beta ouverte pendant 2 semaines pour attraper les bugs sur différents modèles Android.

1. Play Console → **Tests ouverts** → Publier l'AAB déjà uploadé
2. Générer un lien d'invitation à partager via le site caniplus.ch et par email aux membres existants
3. Recueillir les retours — surveiller les crashes dans Play Console → Qualité → Android vitals
4. Corriger ce qui doit l'être (côté PWA, pas besoin de re-build l'AAB sauf changement de package ou de scope)
5. Après 2 semaines sans crash bloquant → promouvoir en production
6. Examen Google : 2 à 7 jours (parfois plus pour une première publication)

---

## Étape 9 — Mises à jour futures

Pour les mises à jour **PWA uniquement** (99 % des cas) :
- Commit + push sur la branche `main`
- Vercel déploie automatiquement
- Les utilisateurs reçoivent les changements au prochain lancement de l'app

Pour une mise à jour **du conteneur TWA** (rare : changement de package name, de scope, de nouvelle permission Android, nouvelle version du webview, etc.) :
```bash
cd ~/caniplus-twa
bubblewrap update             # met à jour la dépendance webview
bubblewrap build              # reconstruit l'AAB
# Incrémenter appVersionCode dans twa-manifest.json avant le build
```
Puis uploader le nouvel AAB sur la Play Console → nouvelle version.

---

## Ressources et liens utiles

- Bubblewrap : https://github.com/GoogleChromeLabs/bubblewrap
- Android Studio : https://developer.android.com/studio
- Digital Asset Links Tool : https://developers.google.com/digital-asset-links/tools/generator
- PWA Builder (alternative à Bubblewrap) : https://www.pwabuilder.com/
- Politique Google Play (paiements) : https://support.google.com/googleplay/android-developer/answer/10281818
- Play Console : https://play.google.com/console

---

## Si ça coince

**L'app s'ouvre dans Chrome (barre d'URL visible)** → assetlinks.json pas encore indexé ou SHA256 incorrect. Attendre 24h ou re-vérifier l'Asset Links Tool.

**Plantage au démarrage** → probablement un problème de manifest.json. Vérifier qu'il est accessible en HTTPS, avec `start_url: /` et icônes valides.

**Notifications ne fonctionnent pas** → activer `enableNotifications: true` dans twa-manifest.json, rebuild, re-déployer. Vérifier la permission dans les paramètres Android.

**Paiements Stripe bloqués par Google** → ajouter une déclaration explicite "les paiements concernent un service physique" dans la fiche Play, et migrer les guides PDF vers un achat via navigateur si nécessaire.

**Compte développeur refusé** → vérifier l'identité fournie et la cohérence avec les documents. Appuyer au service client Play Support.

---

## Budget total

- Compte développeur : **25 USD** (unique)
- Hébergement et domaine : déjà en place (Vercel + one.com)
- Temps humain : environ **5h actives**, échelonnées sur 3 semaines (beta incluse)
- Coût par mise à jour : **0 €** (juste un commit + push)

Tout le reste (Bubblewrap, Android Studio, keytool) est gratuit.
