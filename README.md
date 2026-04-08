# 🐾 CaniPlus PWA — Guide de mise en ligne

Application web installable (PWA) pour les membres CaniPlus.
**Gratuit à 100%** · Fonctionne sur iPhone et Android · Pas besoin de l'App Store.
**Paiements en ligne inclus** · Cotisation & leçons privées · Carte bancaire + TWINT 🇨🇭

---

## 📁 Fichiers du projet

```
caniplus-pwa/
├── public/
│   ├── index.html          ← Page HTML de base
│   ├── manifest.json       ← Infos pour l'installation sur le téléphone
│   └── service-worker.js   ← Mode hors ligne
├── src/
│   ├── App.js              ← Navigation principale
│   ├── index.js            ← Point d'entrée
│   ├── index.css           ← Styles globaux
│   ├── hooks/useAuth.js    ← Gestion connexion
│   ├── lib/supabase.js     ← Base de données ← À CONFIGURER
│   ├── lib/theme.js        ← Couleurs CaniPlus
│   ├── components/BottomNav.js
│   └── screens/
│       ├── LoginScreen.js
│       ├── HomeScreen.js
│       ├── PlanningScreen.js
│       ├── RessourcesScreen.js
│       ├── MessagesScreen.js
│       └── ProfilScreen.js
├── vercel.json             ← Config déploiement
└── package.json
```

---

## 🚀 Mise en ligne en 4 étapes

### ÉTAPE 1 — Base de données Supabase
*(Déjà fait si tu as utilisé le projet React Native)*

Sinon : aller sur **https://supabase.com**, créer un projet "CaniPlus",
coller le fichier `supabase/schema.sql` dans l'éditeur SQL et cliquer Run.

Récupérer dans **Settings → API** :
- **Project URL** → `https://xxxxx.supabase.co`
- **anon public key**

---

### ÉTAPE 2 — Mettre tes clés dans l'app

Ouvrir `src/lib/supabase.js` et remplacer :
```js
const SUPABASE_URL = 'https://VOTRE_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'VOTRE_ANON_KEY';
```

---

### ÉTAPE 3 — Mettre le code sur GitHub

1. Créer un compte sur **https://github.com** (gratuit)
2. Cliquer **"New repository"** → nommer "caniplus-pwa" → **Create**
3. Sur ta page du repo, cliquer **"uploading an existing file"**
4. Glisser-déposer tous les fichiers du dossier `caniplus-pwa`
5. Cliquer **"Commit changes"**

---

### ÉTAPE 4 — Déployer sur Vercel (gratuit)

1. Aller sur **https://vercel.com** → créer un compte avec GitHub
2. Cliquer **"Add New Project"**
3. Choisir ton repo **caniplus-pwa**
4. Framework : **Create React App** (détecté automatiquement)
5. Cliquer **"Deploy"** → attendre 2 minutes

✅ Ton app est en ligne à : `https://caniplus-pwa.vercel.app`

---

## 📱 Comment tes clients installent l'app

### Sur iPhone (Safari obligatoire)
1. Ouvrir le lien dans **Safari**
2. Appuyer sur l'icône **Partager** (carré avec flèche en bas)
3. Défiler → **"Sur l'écran d'accueil"**
4. Nommer "CaniPlus" → **Ajouter**

### Sur Android (Chrome)
1. Ouvrir le lien dans **Chrome**
2. Menu **⋮** en haut à droite
3. **"Ajouter à l'écran d'accueil"**
4. Confirmer

---

## 👥 Ajouter tes clients

Dans Supabase → **Authentication → Users → Invite User**
- Entrer l'e-mail du client
- Il reçoit un mail pour créer son mot de passe

Puis ajouter ses données dans les tables :
- `dogs` → son chien
- `subscriptions` → sa cotisation
- `enrollments` → ses inscriptions aux cours

---

## 🔄 Mettre à jour l'app

Tu modifies un fichier → tu le re-dépose sur GitHub → Vercel redéploie automatiquement en 2 minutes.

---

## 💡 Domaine personnalisé (optionnel)

Si tu as un domaine (ex: app.caniplus.ch) :
- Vercel → ton projet → **Settings → Domains**
- Ajouter ton domaine → suivre les instructions DNS

---

## 💳 Activer les paiements en ligne (Stripe)

Les clients peuvent payer leur cotisation annuelle (CHF 80) et leurs leçons privées (CHF 60)
directement dans l'app. Le statut passe automatiquement à "Payé ✓" après le paiement.

---

### ÉTAPE 5 — Créer un compte Stripe (gratuit)

1. Aller sur **https://stripe.com** → créer un compte
2. Activer ton compte (entrer les infos de ton association/entreprise)
3. Dans le dashboard Stripe → **Développeurs → Clés API** :
   - Copier la **Clé secrète** (commence par `sk_live_...`)
   - Activer **TWINT** dans : Paramètres → Modes de paiement → Suisse 🇨🇭

---

### ÉTAPE 6 — Déployer les fonctions Supabase

Ces fonctions s'occupent de créer les sessions de paiement et de confirmer automatiquement.

Dans ton **terminal** (ou depuis GitHub Codespaces) :

```bash
# Installer la CLI Supabase
npm install -g supabase

# Se connecter
supabase login

# Lier ton projet
supabase link --project-ref TON_PROJECT_ID

# Ajouter les variables d'environnement
supabase secrets set STRIPE_SECRET_KEY=sk_live_XXXXXXXX
supabase secrets set APP_URL=https://caniplus-pwa.vercel.app
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_XXXXXXXX  ← (après étape 7)

# Déployer les fonctions
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook
```

---

### ÉTAPE 7 — Configurer le webhook Stripe

Le webhook permet à Stripe d'informer ton app qu'un paiement a réussi → statut mis à jour automatiquement.

1. Dans Stripe → **Développeurs → Webhooks → Ajouter un endpoint**
2. URL : `https://TON_PROJECT_ID.supabase.co/functions/v1/stripe-webhook`
3. Événements à écouter : `checkout.session.completed` et `checkout.session.expired`
4. Copier le **Signing secret** (commence par `whsec_...`)
5. Coller dans Supabase :
```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_XXXXXXXX
```

---

### ÉTAPE 8 — Mettre à jour la base de données

Dans **Supabase → SQL Editor**, coller le contenu du fichier `supabase/schema-payments.sql` et cliquer **Run**.

Cela ajoute les colonnes `paid_at`, `stripe_session_id` et la table `payments` pour l'historique.

---

### Ajuster les prix

Les prix sont définis dans deux endroits :
- `supabase/functions/create-checkout/index.ts` → ligne `PRICE_CONFIG` (montants en centimes, ex: `8000` = CHF 80.00)
- `src/components/PaiementModal.js` → ligne `PRICES` (montants en CHF pour l'affichage)

---

### Comment ça fonctionne pour un client ?

1. Le client voit **"Payer →"** à côté de sa cotisation ou leçon privée
2. Il clique → un écran de paiement s'ouvre (carte bancaire ou **TWINT**)
3. Il paie → Stripe confirme → **l'abonnement passe automatiquement à "Payée ✓"**
4. L'app affiche une bannière verte de confirmation

---

## ✅ Ce qui fonctionne

| Fonctionnalité | Statut |
|---|---|
| Login sécurisé par client | ✅ |
| Reste connecté entre visites | ✅ |
| Accueil personnalisé | ✅ |
| Planning des cours | ✅ |
| Ressources pédagogiques | ✅ |
| Messagerie temps réel | ✅ |
| Profil + chien + abonnement | ✅ |
| **Paiement cotisation en ligne** | ✅ |
| **Paiement leçons privées en ligne** | ✅ |
| **Confirmation automatique (webhook)** | ✅ |
| **TWINT (Suisse 🇨🇭)** | ✅ |
| Installable sur iPhone/Android | ✅ |
| Fonctionne hors ligne (base) | ✅ |
| **Coût total** | **0 CHF** |
