# Les soirées CaniPlus — inscriptions et paiement dans l'app

Chantier livré le 18.08.2026, **déployé en production le 19.08.2026**. Section
prête à coller dans `CONTEXTE-CANIPLUS-COMPLET.md`, suivie de ce qui reste à faire.

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

## 5. Ce qui tourne en production

Appliqué et vérifié le 19.08.2026.

### Base de données

| Migration | État |
|---|---|
| `add_soirees_saison_2026_2027_2026_08_18.sql` | appliquée |
| `fix_soirees_doublons_2026_08_19.sql` | appliquée |

**Incident rencontré et corrigé.** Les 10 soirées existaient déjà en base depuis
le 3 août, sous les slugs `soiree-2026-09-rappel` et suivants, avec descriptions,
bullet points et images de couverture. Le seed les a recréées sous d'autres slugs :
20 soirées en base, 10 vides avec les liens Zoom et 10 complètes sans lien.
Corrigé le soir même — les liens Zoom ont été reportés sur les soirées d'origine
et les doublons supprimés. Aucune inscription n'était concernée (0 achat).
Résultat : 10 soirées, textes du 3 août, liens Zoom attachés, CHF 20, 90 min,
**toutes en brouillon**.

### Edge functions

| Fonction | Version | verify_jwt |
|---|---|---|
| `soiree-emails` | v1 (nouvelle) | false |
| `get-webinar-access` | v9 | false |
| `create-product-checkout` | v23 | false |
| `stripe-webhook` | v50 | false |

### Cron

`soiree-reminders-hourly`, toutes les heures à `0 * * * *`.

**Attention pour les prochains crons.** `current_setting('app.settings.cron_secret')`
n'est **pas défini** sur cette base. Le job `premium-trial-reminder-daily`, qui
l'utilise, récolte un **401 à chaque exécution** — les rappels de fin d'essai
premium ne partent donc pas. Bug antérieur à ce chantier, à traiter séparément.
Le cron des soirées utilise la convention qui fonctionne :
`Authorization: Bearer <CRON_SECRET>`, comme `auto-cancel-unpaid-private` et
`publish-scheduled-bundles`.

À noter aussi : `cash-payment-reminder-hourly` n'existe pas dans `cron.job`.
Sa migration n'a jamais été appliquée, les rappels de paiement cash ne partent pas.

### Vérifications passées

- `soiree-emails` avec le jeton cron → **200**, `{"checked":0}` (aucune soirée
  dans la fenêtre de rappel, la première est le 14 septembre).
- `soiree-emails` sans jeton → **401**.
- `stripe-webhook` sans signature → **400 « Signature manquante »** : la fonction
  démarre et exécute son code, les autres flux de paiement sont intacts.
- Lecture de `webinar_access` et `soiree_emails_sent` en rôle `anon` → **0 ligne**.
  En rôle `authenticated` → **0 ligne**. Les liens Zoom ne sortent que par
  `get-webinar-access` après vérification d'un achat payé.
- Advisors sécurité Supabase : aucun avertissement nouveau.
- `npm run build` : passe.

---

## 6. Ce qui reste à faire

### Toi seule

1. **Ajouter `charge.refunded`** aux événements écoutés par l'endpoint webhook du
   compte Stripe RI (dashboard Stripe). `checkout.session.completed` y est déjà.
   Sans ça, le handler de remboursement déployé ne sera jamais appelé.

2. **Test bout en bout en mode test Stripe** :
   - publier la soirée 1 depuis l'admin ;
   - créer un compte neuf (vérifie le parcours non-membre) et s'inscrire ;
   - payer avec `4242 4242 4242 4242` → l'email de confirmation doit arriver avec
     le lien Zoom, l'horaire, la ligne sous-titres et la mention du replay ;
   - relancer l'achat de la même soirée → « Tu es déjà inscrit·e à cette soirée. » ;
   - saisir un lien de replay + code, cliquer « Envoyer le replay » → email reçu ;
     recliquer → « tous les inscrits ont déjà reçu le replay » ;
   - passer `replay_expires_at` dans le passé → le replay disparaît de l'app.

3. **Paiement réel de CHF 20**, puis remboursement depuis le dashboard Stripe RI :
   l'inscription doit passer en `refunded` et l'accès au lien disparaître.

4. **Publier les soirées** depuis l'admin. Elles sont en brouillon : c'est ce clic
   qui les rend visibles.

5. **Vérifier sur téléphone** — c'est là que la majorité des clientes s'inscriront.

### À caler ensemble

- Relire les textes des emails avec `caniplus-soirees-communication.md`. Le
  document n'a pas été retrouvé sur le Drive (recherche par titre et par
  contenu) : les textes actuels sont écrits à partir du brief.
- Les deux crons cassés signalés plus haut (`premium-trial-reminder-daily`,
  `cash-payment-reminder-hourly`), hors périmètre de ce chantier.
