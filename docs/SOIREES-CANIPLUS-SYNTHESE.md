# Les soirées CaniPlus — inscriptions et paiement dans l'app

Chantier livré le 18.08.2026, **déployé en production le 19.08.2026**, complété le
**21.08.2026** (inscription sans compte et limite de places — voir section 8). Section
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
- `public-product-checkout` (achat invité depuis le site vitrine) accepte les
  soirées **depuis le 21.08.2026** : on s'inscrit avec une adresse email, sans
  compte. Cela ne change rien à l'étanchéité — la fonction ne fait que créer une
  session Stripe, elle ne lit jamais `webinar_access`. Le lien Zoom part
  uniquement par email, envoyé par `soiree-emails`, qui revérifie de son côté
  que l'achat est bien `paid`.
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

En le mettant en place, quatre autres tâches planifiées se sont révélées cassées
depuis des mois. Elles ont été réparées le même jour
(`fix_crons_casses_2026_08_19.sql`) — voir la section 6.

**Deux règles à retenir pour tout futur cron sur ce projet :**

1. **Ne jamais utiliser `current_setting('app.settings.cron_secret')`.** Le
   paramètre n'est pas défini et ne peut pas l'être : `ALTER DATABASE` est
   refusé sur Supabase managé. Passer le jeton en clair dans la commande, comme
   `auto-cancel-unpaid-private`.
2. **Ne jamais coder une clé `service_role` en dur.** Supabase est passé aux
   nouvelles secret keys : les JWT `eyJ...` inscrits dans les anciens jobs ne
   correspondent plus à la clé injectée dans les fonctions. Utiliser
   `CRON_SECRET`, qui ne tourne pas.

**Et une règle de diagnostic :** `cron.job_run_details.status = 'succeeded'`
signifie seulement que `net.http_post` a été mis en file, **pas** que l'appel a
abouti. C'est ce qui a masqué les quatre pannes. Le vrai verdict est dans
`net._http_response` (`status_code`, `error_msg`).

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

### Fait entre le 19 et le 21.08.2026

- `charge.refunded` : l'événement était **déjà** configuré sur l'endpoint Stripe RI.
- Test bout en bout réel le 19.08 : paiement CHF 20 à 11h36 → `paid` à 11h37:05 →
  email de confirmation à 11h37:08 → second achat refusé → remboursement
  `re_3U67nmGx8vsECJHX0OrCOSHt` → `refunded`, accès coupé. Il n'y a pas eu de test
  en mode test Stripe : l'app tourne sur les clés live, la carte `4242` y est
  refusée par une garde volontaire de Stripe. Le vrai paiement **est** le test.
- Les 10 soirées sont publiées.
- Upload du PDF de support réparé (policies `storage.objects` manquantes).

### Toi seule

1. **Tester le nouveau parcours sans compte** depuis un téléphone, une fois la
   PR #9 fusionnée : caniplus.ch/soirees → « S'inscrire » → email → CHF 20.
   L'email avec le lien Zoom doit arriver dans la foulée. C'est le parcours que
   suivront la plupart des clientes, et il n'a pas encore été payé pour de vrai.

2. **Vérifier sur téléphone** l'affichage de la page et de la fenêtre de paiement.

3. **Relire les textes** de la page et des emails avant la communication.

### À caler ensemble

- Relire les textes des soirées et des emails. Le document
  `caniplus-soirees-communication.md` mentionné au brief n'existe pas : les
  textes sont écrits à partir du brief lui-même.

---

## 7. Tâches planifiées réparées le 19.08.2026

Découvertes en installant le cron des soirées, toutes antérieures à ce chantier.
Migration : `fix_crons_casses_2026_08_19.sql`. Fonction : `weekly-newsletter` v23.

| Tâche | Panne | Correctif | Vérifié |
|---|---|---|---|
| `premium-trial-reminder-daily` | 401 chaque jour — header vide, le job lisait un paramètre de base jamais défini | jeton `CRON_SECRET` en clair | 200, `{"checked":0,"sent":0}` |
| `weekly-newsletter-wednesday` | 401 chaque mercredi — clé `service_role` en dur devenue caduque. **La newsletter ne partait plus.** | fonction v23 accepte `CRON_SECRET`, job basculé dessus | 200 en `dry_run`, sujet et HTML corrects |
| `cash-payment-reminder-hourly` | le job n'existait pas, sa migration n'avait jamais été appliquée | job créé | 200, `{"reminded":0}` |
| `admin-publish-reminder-tuesday` | erreur SQL (guillemet non fermé), aucun appel HTTP depuis toujours | commande réécrite | 200, notification reçue |

Ajouté à ces quatre jobs plus à celui des soirées : un `timeout_milliseconds`
explicite. `net.http_post` coupe à 5 s par défaut, or la newsletter appelle
Claude et dépasse ce délai — sa réponse n'était jamais enregistrée.

Aucun email client n'est parti pendant ces tests : les fonctions étaient toutes
en fenêtre vide. Seule la notification admin `publish_reminder` a été émise.

---

## 8. Inscription sans compte et limite de places — 21.08.2026

Deux frictions relevées par Tiffany après la mise en ligne de la page publique.

### Le mur de connexion

S'inscrire renvoyait vers `app.caniplus.ch`, donc vers un écran de connexion :
il fallait créer un compte avant même de voir un formulaire de paiement. Les
soirées passent maintenant par le tunnel invité déjà utilisé par les guides de
la boutique.

- `public-product-checkout` n'exclut plus `category='soiree'`. Il refuse en
  revanche une soirée annulée, passée (tolérance de 3h) ou complète, et un
  second achat de la même soirée par la même adresse.
- `stripe-webhook`, dans le chemin `product_purchase_guest`, détecte
  `category='soiree'` et appelle `soiree-emails` au lieu d'envoyer le PDF. Le
  PDF de support reste bloqué jusqu'au début de la soirée, comme pour un membre.
- `soiree-emails` savait déjà lire `guest_email` : rappels J-1, jour J et replay
  fonctionnent sans compte, sans modification.
- Trigger `claim_guest_purchases_on_profile` : un compte créé plus tard avec la
  même adresse récupère ses inscriptions. Il saute les cas où la personne
  possède déjà un achat du même produit — `user_purchases` porte une contrainte
  `UNIQUE (user_id, product_id)`, et faire échouer la création du profil serait
  pire que de laisser l'achat invité en place.

Sur la page publique, chacune des dix dates du calendrier porte son propre
bouton. Les identifiants (`data-buy="soiree-2026-09-rappel"` et les neuf autres)
viennent de `digital_products.slug` : **stables, à ne pas inventer**.

### Les 20 places

La page annonçait « entre 8 et 20 personnes » sans que rien ne l'applique.
Tiffany a tranché le 21.08 : le plafond de 20 est réel, il n'y a **pas de
minimum**. Une soirée se tient quel que soit le nombre d'inscrits.

- `digital_products.capacity`, à 20 sur les dix soirées, nullable ailleurs
  (`NULL` = illimité, cas des guides PDF).
- `soiree_places(slug)` et `soirees_places()`, `SECURITY DEFINER`, exécutables
  par `anon` et `authenticated`. Elles ne renvoient que des nombres : capacité,
  inscrits, places restantes, complet. Jamais l'identité de qui que ce soit.
- Les deux fonctions de checkout refusent la 21e inscription. Seuls les achats
  `paid` occupent une place : une session Stripe abandonnée ne bloque rien, et
  deux paiements simultanés sur la dernière place passeront tous les deux —
  c'est délibéré, il vaut mieux une personne de trop qu'une place gelée par un
  panier mort.
- `SoireesView` affiche « Complet » et le nombre de places restantes en dessous
  de 5. `SoireesAdminTab` affiche X / 20 et permet de changer le plafond.

Aucun seuil bas nulle part : ni en base, ni dans l'app, ni dans les textes
publics. Ne pas en réintroduire.

### Page d'accueil

La carte « Soirées CaniPlus » remplace « Cours théoriques » dans la section
prestations. Les cours théoriques gardent leur page dédiée, leur entrée au
sitemap, et un lien depuis le pied de page.

### Limite de vérification

Les vérifications réseau (rendu de caniplus.ch, appel réel à
`public-product-checkout`) n'ont pas pu être faites : le proxy de l'environnement
d'exécution refuse la connexion vers ces domaines. Tout ce qui est affirmé plus
haut a été vérifié en base, dans le dépôt, ou par les versions déployées des
edge functions — pas par une requête HTTP en production.

---

## 9. Ménage sur la page d'accueil — 21.08.2026

Trois blocs retirés à la demande de Tiffany : « Mon espace » (le bouton d'accès
reste dans l'en-tête et le pied de page), le bloc newsletter, et « Plus de
guides à venir ». Le CSS correspondant part avec eux, media queries comprises.

Trouvé en faisant le ménage : les Soirées apparaissaient deux fois (Prestations
et Événements), le pied de page déclarait cinq colonnes pour quatre blocs, et
le lien « S'inscrire à la newsletter » du pied de page ne menait plus nulle
part. Corrigé.

**Newsletter hebdomadaire désactivée.** La tâche `weekly-newsletter-wednesday`
était active et aurait envoyé une campagne Brevo le mercredi 26.08 à 09h00.
Elle n'avait encore jamais tourné depuis sa réparation du 19.08, donc rien
n'est parti. Désactivée, pas supprimée — voir
`desactive_newsletter_hebdo_2026_08_21.sql` pour la relancer.

**Pas de minimum de participants.** Un seuil bas de 8 avait été introduit le
matin du 21.08 sur la foi d'un « c'est bien entre 8 et 20 personnes », puis
retiré le même jour : Tiffany a précisé qu'il n'y a pas de minimum. Une soirée
se tient quel que soit le nombre d'inscrits. Seul le plafond de 20 est réel.

### Un incident de cron à connaître

Le 21.08 à 13h00, `soiree-reminders-hourly` a échoué avec
`{"error":"JWT issued at future"}` — un décalage d'horloge sur le jeton, pas un
bug du code. L'exécution de 12h00 et celle de 14h00 sont passées normalement.
C'est sans conséquence ici : les fenêtres de rappel couvrent plusieurs heures
(J-1 va de 26h à 1h avant la soirée), donc une exécution manquée est rattrapée
à l'heure suivante. À surveiller seulement si ça devient régulier.
