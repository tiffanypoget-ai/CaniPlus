# Les soirées CaniPlus — inscriptions et paiement dans l'app

Chantier livré le 18.08.2026. Section prête à coller dans `CONTEXTE-CANIPLUS-COMPLET.md`,
suivie du pas-à-pas de mise en production.

---

## 1. Ce qui existait déjà

Le chantier de juillet 2026 (`add_soirees_webinaires_2026_07_13.sql`) avait posé
le modèle, qui a été **conservé tel quel** plutôt que remplacé par des tables
`soirees` / `soiree_inscriptions` : le tunnel de paiement existant marchait déjà
et sa réécriture n'aurait rien apporté.

| Besoin du brief | Ce qui le porte |
|---|---|
| Table des soirées | `digital_products` avec `category='soiree'` (infos publiques) |
| Inscriptions | `user_purchases` (`UNIQUE(user_id, product_id)` = pas de double achat) |
| Lien Zoom, replay | `webinar_access`, table **sans lecture publique** |
| Checkout Stripe RI | `create-product-checkout` (`STRIPE_SECRET_KEY` = compte RI) |
| Passage en payé | `stripe-webhook` (compte RI) |
| Accès acheteur | `get-webinar-access` (vérifie l'achat payé avant de servir le lien) |
| Page cliente | `SoireesView.jsx`, ouverte depuis l'onglet Apprendre |
| Admin | `SoireesAdminTab.jsx`, onglet Contenu → Soirées |

**Entité** : rien ne change de ce côté. `create-product-checkout` et
`stripe-webhook` tournent sur `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`,
c'est-à-dire le compte de la raison individuelle. Le club a ses propres secrets
(`STRIPE_SECRET_KEY_CLUB`) et son propre webhook (`stripe-webhook-club`), jamais
sollicités ici.

## 2. Ce qui a été ajouté

### Base de données

`add_soirees_saison_2026_2027_2026_08_18.sql`

- `webinar_access` : `zoom_meeting_id`, `replay_url`, `replay_code`,
  `replay_expires_at`. Le replay saison 1 est le **lien de partage cloud Zoom
  protégé par un code**, pas Bunny Stream. La colonne `bunny_video_id` reste en
  place pour le jour où Bunny sera sécurisé ; le lien Zoom est prioritaire quand
  les deux sont renseignés.
- `digital_products.event_cancelled` (booléen). « À venir » et « passée » se
  déduisent de `event_date` ; seule l'annulation demande une donnée stockée.
- `soiree_emails_sent` : journal anti-doublon, `UNIQUE(product_id, email, kind)`
  avec `kind ∈ confirmation | rappel_j1 | rappel_jour_j | replay`.
- **Seed des 10 soirées** de la saison, avec leurs liens Zoom, **en brouillon**
  (`is_published = false`).

`add_soiree_reminders_cron_2026_08_18.sql` : cron horaire vers `soiree-emails`.

### Edge functions

**`soiree-emails`** (nouvelle) — trois actions, un seul gabarit d'email :

| Action | Déclencheur | Effet |
|---|---|---|
| `confirmation` | `stripe-webhook`, à la confirmation du paiement | Email avec le lien Zoom |
| `reminders` | pg_cron, toutes les heures | Rappel J-1 puis rappel du jour J |
| `replay` | Bouton admin | Lien + code + date d'expiration à tous les inscrits payés |

Les fenêtres de rappel se calculent depuis `event_date` :
J-1 = `[event − 26h, event − 1h)` (donc 18h00 la veille pour une soirée à 20h00),
jour J = `[event − 1h, event + 15min)`. Elles se touchent sans se recouvrir, et
sont larges pour qu'une exécution manquée soit rattrapée à l'heure suivante.
Comme tout se calcule en millisecondes depuis `event_date`, le passage heure
d'été / heure d'hiver n'a aucun effet sur l'horaire des rappels.

**`stripe-webhook`** (modifiée, compte RI) :
- déclenche l'email de confirmation quand le produit payé est une soirée ;
- nouveau handler **`charge.refunded`** : remonte de la charge au payment_intent
  puis à la session Checkout, passe `user_purchases` en `refunded`, ce qui coupe
  aussitôt l'accès au lien et au replay. Un remboursement **partiel** ne coupe
  rien. Notification admin dans les deux cas.

**`get-webinar-access`** (modifiée) : sert le replay Zoom (lien + code + date),
ne renvoie plus rien passé `replay_expires_at`, et masque le lien Zoom d'une
soirée annulée.

**`create-product-checkout`** (modifiée) : refuse de vendre une soirée annulée ou
déjà passée. L'app grisait déjà ces boutons, mais l'edge function est appelable
directement — la règle devait tenir côté serveur.

### Application

`SoireesView.jsx` : créneau complet (« 20:00 – 21:30 · salle ouverte dès
19:45 »), bandeau d'annulation, soirées passées en retrait, replay Zoom avec son
code et sa date d'expiration, consignes pratiques (salle d'attente, sous-titres,
pas de compte Zoom nécessaire).

`SoireesAdminTab.jsx` : champs replay (lien, code, expiration pré-remplie à J+7),
identifiant de réunion Zoom, case « soirée annulée », compteur d'inscrits payés
par soirée, bouton **« Envoyer le replay aux N inscrits »**, et sur la liste des
inscrits deux boutons **Copier** (presse-papier, pour pointer la salle d'attente
Zoom) et **Exporter en CSV**.

## 3. Étanchéité du lien Zoom

Le lien ne doit apparaître nulle part avant paiement confirmé. Les chemins
possibles ont été passés en revue :

- `webinar_access` a **RLS activée sans aucune policy de lecture publique** —
  seuls les admins et le `service_role` y accèdent. L'onglet admin lit la table
  en direct, mais un non-admin reçoit zéro ligne.
- `digital_products`, lisible publiquement quand `is_published = true`, ne
  contient **aucun** champ sensible.
- `get-webinar-access` identifie l'appelant par son JWT (pas par le body) et
  exige un achat `status='paid'` **de cette soirée précise**.
- `public-product-checkout` (achat invité depuis le site vitrine) exclut déjà
  `category='soiree'` : pas d'inscription sans compte.
- `admin-query` n'expose qu'une liste fermée d'actions, aucune lecture de table
  arbitraire, et ne touche pas `webinar_access`.
- Un remboursement bascule l'achat en `refunded`, et tous les chemins d'accès
  filtrent sur `status='paid'` — lien, replay, rappels et email de replay se
  coupent ensemble.

## 4. Décisions prises en cours de route

- **Modèle de données** : `digital_products` + `webinar_access` conservés au lieu
  des tables `soirees` / `soiree_inscriptions` du brief. Le brief demandait
  d'adapter aux conventions existantes ; c'est ce qui a été fait.
- **Seed en brouillon** : les 10 soirées sont insérées non publiées. Rien ne
  s'affiche pour les clientes tant que Tiffany n'a pas cliqué sur « Publier ».
- **PDF de support** : il n'est plus annoncé quand il n'existe pas. Il ne fait
  pas partie de l'offre décrite dans le brief, et le message « le PDF arrivera
  ici » était une promesse de trop.
- **Textes** : ils sont proposés à partir du brief. `caniplus-soirees-communication.md`
  (Drive) n'était pas accessible depuis la session — **à relire avant publication**.

---

## 5. Mise en production — pas-à-pas

Rien n'a été appliqué sur la prod : le code est poussé sur la branche, la base et
les fonctions sont inchangées. `stripe-webhook` encaisse aussi les cotisations,
le premium et le coaching, donc son déploiement mérite d'être fait en étant
devant l'écran.

### a. Migrations (Supabase → SQL Editor, dans cet ordre)

1. `supabase/migrations/add_soirees_saison_2026_2027_2026_08_18.sql`
2. `supabase/migrations/add_soiree_reminders_cron_2026_08_18.sql`

Pré-requis de la seconde : extensions `pg_cron` + `pg_net` activées, et le secret
côté base, comme pour `cash-payment-reminder` :

```sql
ALTER DATABASE postgres SET app.settings.cron_secret = '<valeur du secret CRON_SECRET>';
```

Vérification du seed :

```sql
SELECT p.display_order, p.title, p.event_date, p.is_published, w.zoom_meeting_id
FROM digital_products p
LEFT JOIN webinar_access w ON w.product_id = p.id
WHERE p.category = 'soiree'
ORDER BY p.display_order;
```

Les 10 lignes doivent afficher un lundi 20:00 heure suisse et `is_published = false`.

### b. Edge functions

```bash
# --no-verify-jwt : pg_cron n'envoie pas de JWT, seulement son X-Cron-Secret.
# La fonction contrôle elle-même l'appelant (service role / secret cron / admin).
supabase functions deploy soiree-emails --no-verify-jwt --project-ref oncbeqnznrqummxmqxbx
supabase functions deploy get-webinar-access     --project-ref oncbeqnznrqummxmqxbx
supabase functions deploy create-product-checkout --project-ref oncbeqnznrqummxmqxbx
supabase functions deploy stripe-webhook         --project-ref oncbeqnznrqummxmqxbx   # en dernier
```

Aucun nouveau secret : `BREVO_API_KEY`, `CRON_SECRET`, `APP_URL`,
`STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` sont déjà en place.

### c. Stripe (compte RI)

Ajouter **`charge.refunded`** aux événements écoutés par l'endpoint webhook RI.
`checkout.session.completed` y est déjà.

### d. Test bout en bout (mode test Stripe)

1. Publier la soirée 1 depuis l'admin.
2. Créer un compte neuf (vérifie le parcours non-membre) et s'inscrire.
3. Payer avec `4242 4242 4242 4242` → l'email de confirmation doit arriver avec
   le lien Zoom, l'horaire, la ligne sous-titres et la mention du replay.
4. Relancer l'achat de la même soirée → « Tu es déjà inscrit·e à cette soirée. »
5. Sans être inscrit, appeler `get-webinar-access` avec l'id de la soirée →
   doit refuser.
6. Forcer un rappel : `curl -X POST .../soiree-emails -H 'X-Cron-Secret: …' -d '{"action":"reminders"}'`
   après avoir avancé `event_date` à ~20h plus tard, pour voir partir le J-1.
7. Saisir un replay + code, cliquer « Envoyer le replay » → email reçu.
   Recliquer → « tous les inscrits ont déjà reçu le replay ».
8. Passer `replay_expires_at` dans le passé → le replay disparaît de l'app.

### e. Test en production

Un paiement réel de CHF 20 par Tiffany pour valider le webhook, puis
remboursement depuis le dashboard Stripe RI pour valider `charge.refunded` :
l'inscription doit passer en `refunded` et l'accès au lien disparaître.

### f. Avant d'ouvrir la communication

- Relire les textes des 10 soirées et des emails avec `caniplus-soirees-communication.md`.
- Publier les soirées depuis l'admin (elles sont en brouillon).
- Vérifier une dernière fois sur téléphone : c'est là que la majorité des
  clientes s'inscriront.
