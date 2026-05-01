# Rapport QA — 1er mai 2026 (avant lancement midi)

Tests exécutés en autonomie pendant ton absence (~9h-11h). Voici la photo complète : ce qui marche, ce qui ne marche pas, et ce que tu dois faire à ton retour.

## 🟢 Ce qui marche

| Élément | Statut | Détail |
|---|---|---|
| Site vitrine caniplus.ch | ✅ | Nav, hero, CTA, SEO, footer — tout OK |
| Sous-domaine app.caniplus.ch | ✅ | **Déjà configuré et opérationnel** — bouton "Espace membre" du site vitrine fonctionne |
| Signup compte externe | ✅ | qa1 créé sans erreur |
| Signup compte membre | ✅ | qa2 créé sans erreur |
| Email confirmation | ✅ | Reçu depuis info@caniplus.ch en boîte de réception (plus en spam) — **bug 2 résolu** |
| Login member | ✅ | qa2 a pu se connecter après confirmation |
| Onboarding step 1 (type de cours) | ✅ | "Bienvenue !" + 3 options affichées correctement |
| Reset password | ✅ | Modale + bouton "Envoyer le lien" → "E-mail envoyé !" |
| PWA | ✅ | manifest.json présent, service worker actif |
| Console JS | ✅ | 0 erreur, 0 warning sur page publique |
| Trigger handle_new_user | ✅ | Crée bien le profil avec user_type='member' depuis metadata |

## 🔴 Bugs trouvés (avec fix prêt)

### Bug A — sex='Mâle'/'Femelle' rejeté par CHECK constraint dogs_sex_check

**Cause** : La table `dogs` accepte uniquement `'M'` ou `'F'` pour la colonne `sex`. Mais `OnboardingScreen.jsx` et `DogEditModal.jsx` envoyaient `'Mâle'`/`'Femelle'`.

**Symptôme** : L'utilisateur termine l'onboarding chien, voit l'erreur "new row for relation 'dogs' violates check constraint 'dogs_sex_check'" (visible grâce au check error que j'ai ajouté ce matin) — le chien n'est pas enregistré.

**Fix appliqué** (déjà dans tes fichiers locaux, à push) :
- `src/screens/OnboardingScreen.jsx` : SEX_OPTIONS, getReprodOptions, label castration → `'M'`/`'F'`
- `src/components/DogEditModal.jsx` : `<option value="Mâle">` → `<option value="M">`, idem pour F + cohérence reproductive_status

### Bug B — CHECK constraint notifications.type bloque toutes les nouvelles notifs

**Cause** : La table `notifications` a une CHECK constraint qui n'accepte que 5 types historiques (`'cours_confirme', 'cours_semaine', 'nouvelle_actualite', 'info', 'rappel'`). Mais :
- `admin-query` insère `'cours_cree'`, `'cours_modifie'`, `'cours_annule'`, `'admin_manuelle'`
- Mes triggers du matin inséraient `'cours_cree'` et `'private_confirmed'`

→ **Toutes ces notifs plantent silencieusement.** C'était la vraie cause cachée du bug 4 (pas seulement le filtre external que j'ai retiré ce matin).

**En plus** : ce matin j'ai écrasé les 2 triggers existants (`notify_new_group_course` et `notify_private_course_confirmed`) qui étaient bons côté types — j'ai introduit la régression. **Mon SQL du matin a en fait empiré le problème pour ces 2 cas.**

**Fix prêt** : `supabase/migrations/fix_notifications_types_2026_05_01_v2.sql` — fait 3 choses :
1. Élargit la CHECK constraint pour inclure tous les nouveaux types
2. Restaure `notify_new_group_course` avec `type='cours_semaine'` (compatible) + filtre `user_type='member'`
3. Restaure `notify_private_course_confirmed` avec `type='cours_confirme'` (compatible)

### Bug C — ADMIN_PASSWORD ne vaut pas Caniplus2026

**Cause** : La valeur du secret `ADMIN_PASSWORD` dans Supabase date du 13 avril 2026, hash SHA256 différent. Le mot de passe que tu m'as donné (`Caniplus2026`) ne passe pas → impossible de tester l'admin.

**Fix** : Update dans Supabase → Edge Functions → Secrets → `ADMIN_PASSWORD` = `Caniplus2026` (formulaire en haut).

## 🟡 Tests qui n'ont pas pu se finir

Ces tests étaient bloqués par les bugs ci-dessus. À refaire après application des fixes :

- **Tous les écrans côté client member** (Accueil, Planning, Boutique, Ressources, Blog, Profil, Notifications) — bloqué par bug A
- **Admin panel** (Membres, Paiements, Demandes, Notifications) — bloqué par bug C
- **Paiements Stripe** (Premium, leçon privée, achat boutique) — bloqué par bug A
- **Mode desktop avec sidebar** — bloqué par bug A (besoin d'être loggé)
- **Notifs auto création de cours** — bloqué par bug B
- **Notif RDV privé confirmé** — bloqué par bug B
- **Push web sur téléphone** — pas testable sans terminal physique

## 📋 À FAIRE à ton retour (ordre exact)

### Étape 1 — SQL dans Supabase SQL Editor

Copie-colle puis Run le contenu de :
```
supabase/migrations/fix_notifications_types_2026_05_01_v2.sql
```

(Élargit la CHECK constraint + restaure les 2 triggers correctement.)

### Étape 2 — Update ADMIN_PASSWORD

Supabase → Edge Functions → **Secrets** → formulaire "Add or replace secrets" :
- Name : `ADMIN_PASSWORD`
- Value : `Caniplus2026`
- Save

### Étape 3 — Push GitHub

GitHub Desktop → commit + push de :
- `src/screens/OnboardingScreen.jsx` (déjà modifié ce matin avec check error)
- `src/components/DogEditModal.jsx` (modifié pendant le QA)

Vercel redéploie automatiquement (~1-2 min).

### Étape 4 — SQL pour débloquer le compte qa2 (optionnel)

Si tu veux que le compte test qa2 soit utilisable directement sans repasser par l'onboarding :

```sql
INSERT INTO public.dogs (owner_id, name, breed, sex, birth_year, birth_date)
VALUES (
  (SELECT id FROM public.profiles WHERE email = 'tiffany.poget+qa2@gmail.com'),
  'Rex', 'Berger Allemand', 'M', 2020, '2020-06-15'
);

UPDATE public.profiles
   SET onboarding_done = true, course_type = 'both'
 WHERE email = 'tiffany.poget+qa2@gmail.com';
```

### Étape 5 — Test final

Une fois les 4 étapes faites :
1. Crée un compte `tiffany.poget+qa3@gmail.com` en "élève du club", complète l'onboarding chien jusqu'à "Commencer" → doit arriver sur l'app sans erreur, planning visible
2. Va sur `/admin`, mot de passe `Caniplus2026` → tu vois tous les onglets
3. Onglet **Notifs** → Un membre → tu vois qa1, qa2, qa3 dans le dropdown
4. Crée un cours collectif fictif → qa2 et qa3 doivent recevoir une notif

## 🧹 Nettoyage post-lancement (pas urgent)

Comptes test à supprimer quand tu seras sûre que tout marche :
- `tiffany.poget+test1@gmail.com` (créé ce matin pendant les debug)
- `tiffany.poget+qa1@gmail.com` (mon test signup external)
- `tiffany.poget+qa2@gmail.com` (mon test signup member, avec Rex)

Suppression depuis admin : Membres → trouver l'email → bouton supprimer.

## 🎯 Verdict pour le lancement

**Si tu fais les étapes 1-2-3 avant midi (~10 min de manip) → l'app est prête.**

Le bug A (chien) bloque l'onboarding member, donc c'est critique. Le bug B (notifs) ne casse rien de visible pour l'utilisateur lambda mais empêche tes notifs auto de partir. Le bug C (admin) ne te bloque que toi.

Tous les fix sont prêts dans tes fichiers locaux ou dans le repo.
