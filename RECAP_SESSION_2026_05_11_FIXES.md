# Récap session 11 mai 2026 — fixes & nouvelles features

## Nouveautés livrées (session du soir)

### 1. Cours collectifs / théoriques payables sur place
- **Admin** : nouvelle checkbox « Autoriser le paiement sur place (cash, carte, TWINT) » dans le formulaire de cours (visible uniquement si le prix > 0, juste avant la case « Prévenir les membres »).
- **Client** : si la case est cochée, quand le membre clique sur le tarif d'un cours payant, un bottom-sheet lui propose **Payer en ligne · carte** ou **Sur place · cash, carte (SumUp) ou TWINT**.
- En « sur place » : inscription immédiate dans `course_attendance` + création d'une subscription `cours_collectif` en `cash_pending`. Le cours apparaît automatiquement dans l'onglet admin « À encaisser » jusqu'à ce que tu marques comme payé.

### 2. Onglet admin « À encaisser » étendu
- Affiche maintenant aussi les **demandes de cours privé en cash** (`private_course_requests` en `payment_status='cash_pending'`), pas seulement les subscriptions.
- Pour chaque ligne, on voit le membre, la prestation, le NPA, le déplacement, le prix et la date de la séance.
- Bouton « Marquer payé » : appelle `mark_cash_paid` (subscription) ou `mark_pcr_cash_paid` (cours privé). Côté cours privé, ça synchronise aussi la subscription `lecon_privee` liée.

### 3. UI admin pour modifier la durée d'une leçon privée
- Dans l'onglet Demandes, sur chaque cours privé **confirmé non encore payé**, un sélecteur **1 h / 1 h 30 / 2 h** apparaît.
- Cliquer recalcule automatiquement : `chosen_slot.end`, `price_chf` (durée × 60 + déplacement), et `subscriptions.duration_hours` de la sub liée.
- Plus besoin de toucher au dashboard Supabase pour ajuster un créneau.

### 4. Rappel 48h avant séance (cron pg_cron)
- Migration `add_cash_reminder_2026_05_11.sql` rendue idempotente (unschedule + schedule).
- Documente les pré-requis : extensions `pg_cron` + `pg_net` + secret `app.settings.cron_secret`.
- Edge function `cash-payment-reminder` envoie push web + email Brevo aux membres avec un paiement sur place prévu dans ~48h.

## Fichiers modifiés / créés

```
src/screens/AdminScreen.jsx                            (checkbox allow_cash + sélecteur durée)
src/screens/PlanningScreen.js                          (bottom-sheet online/cash cours collectif)
src/components/CashPaymentsList.jsx                    (intègre les coaching requests cash)
supabase/functions/admin-query/index.ts                (mark_pcr_cash_paid + update_request_duration + allow_cash)
supabase/migrations/add_group_courses_allow_cash_2026_05_11.sql   (nouveau, colonne allow_cash sur group_courses)
supabase/migrations/add_cash_reminder_2026_05_11.sql   (idempotent + doc pré-requis cron)
```

## Étapes à faire côté toi (Tiffany)

1. **Push GitHub** : ouvre GitHub Desktop → Commit to main → Push origin. Vercel reprendra automatiquement le frontend.
2. **Déployer l'edge function admin-query** : la nouvelle action `update_request_duration` et l'extension `mark_pcr_cash_paid` ne marcheront que si l'edge function est redéployée. Tu peux le faire depuis https://supabase.com/dashboard/project/oncbeqnznrqummxmqxbx/functions/admin-query/details (bouton « Deploy ») ou via le CLI. Le fichier source à coller est `supabase/functions/admin-query/index.ts`.
3. **Appliquer la migration `add_group_courses_allow_cash_2026_05_11.sql`** : exécute son contenu dans le SQL editor Supabase (1 ALTER TABLE).
4. **(Optionnel) Activer le cron rappel 48h** :
   - Confirme que pg_cron + pg_net sont activées (Database → Extensions).
   - Définis le secret côté DB : `ALTER DATABASE postgres SET app.settings.cron_secret = '...';` (même valeur que le secret edge function `CRON_SECRET`).
   - Exécute la migration `add_cash_reminder_2026_05_11.sql`.

## Vérifications compilation
- ✅ `src/screens/AdminScreen.jsx` → esbuild OK
- ✅ `src/screens/PlanningScreen.js` → esbuild OK
- ✅ `src/components/CashPaymentsList.jsx` → esbuild OK
- ✅ `supabase/functions/admin-query/index.ts` → esbuild OK
