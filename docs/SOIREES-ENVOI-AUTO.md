# Soirées CaniPlus — envoi automatique de la fiche récap et du replay

Branche `soirees-envoi-auto`, écrite le 06.10.2026. **Rien n'est en production :
ni la migration, ni les fonctions edge.** Objectif de mise en service : avant la
soirée du **lundi 16 novembre 2026** (`soiree-2026-11-langage`, 19h00 UTC =
20h00 suisse).

---

## 1. Le problème

Le lendemain d'une soirée, rien ne partait tout seul.

- L'email de replay attendait que Tiffany saisisse le lien et le code, puis
  clique « Envoyer le replay ».
- La fiche récap PDF n'était envoyée **par rien du tout** : l'email de replay
  n'a pas de pièce jointe, et le « PDF de support » déposé dans l'onglet Soirées
  n'était téléchargeable que depuis l'app, par `get-product-download`.
- Conséquence : les 5 participantes de la soirée du 14 septembre n'ont jamais
  reçu leur fiche.

Ce que Tiffany veut : que tout parte tout seul, le lendemain matin, sans action
de sa part le jour même. Et que les participantes reçoivent tout **par email**,
jamais via l'application.

## 2. Ce qui change

### Un nouvel email : celui du lendemain

Un cinquième `kind` dans `soiree_emails_sent` : `lendemain`. Il part dans la
fenêtre **08h00 → 20h00, heure suisse, le jour civil qui suit la soirée**,
porté par le cron horaire `soiree-reminders-hourly` qui existait déjà. Il
contient :

- un remerciement court ;
- **la fiche récap en pièce jointe** (PDF, lu dans un bucket privé avec le
  service role, encodé en base64, passé à Brevo dans `attachment`) ;
- **le replay s'il est prêt** : même bouton, même bloc code, même date
  d'expiration que l'email de replay — les deux partagent désormais les
  fonctions `blocCodeReplay` et `blocExpirationReplay`, pour qu'ils ne puissent
  pas dire deux choses différentes du même lien.

Quand le replay voyage dans cet email, l'envoi est aussi journalisé en `replay`.
Le bouton « Envoyer le replay » de l'admin et le webhook Zoom ne peuvent donc
pas le renvoyer une seconde fois à quelqu'un qui l'a déjà reçu.

### Trois états du replay, pas deux

| État | Condition | Ce que dit l'email |
|---|---|---|
| `pret` | `replay_url` rempli, pas expiré | le bouton, le code, la date limite |
| `bientot` | pas de `replay_url`, soirée récente | « Le replay suit dans un prochain mail. » |
| `expire` | lien expiré, ou soirée de plus de 7 jours sans lien | **rien du tout** |

L'état `expire` existe pour le rattrapage : envoyer la fiche de la soirée du
14 septembre ne doit pas promettre un replay qui n'arrivera jamais. Son lien a
expiré le 23.09.

### La fenêtre est large exprès

08h00 → 20h00, soit douze ticks de cron. Si la fiche n'est pas déposée à 08h00,
l'email ne part pas, mais il partira **dans l'heure qui suit le dépôt**, sans
attendre le lendemain. Tiffany reçoit une alerte `soiree_fiche_manquante` sur
les trois canaux de `notify-admin` (cloche, push, email), **une seule fois par
soirée et par journée** — sans ce garde-fou elle en recevrait douze.

### D'où vient la fiche

Deux emplacements, essayés dans cet ordre :

1. `webinar_access.fiche_path` → bucket privé **`soiree-fiches`**, le champ
   « Fiche récap PDF » ajouté dans l'onglet Soirées ;
2. `digital_products.file_path` → bucket `digital-products`, le « PDF de
   support » que l'onglet Soirées sait déposer depuis août.

**Pourquoi ce repli, qui n'était pas au brief.** L'onglet Soirées avait déjà un
champ d'upload PDF, et les deux soirées passées ont déjà un fichier déposé
(`soirees/soiree-2026-09-rappel-support-…pdf` et son équivalent d'octobre). Sans
ce repli, deux champs PDF coexisteraient sur le même formulaire et Tiffany
devrait téléverser deux fois le même document — avec le risque de se tromper de
champ un lundi soir. Avec le repli, le rattrapage des deux soirées passées
fonctionne sans rien re-téléverser.

**Point à trancher** : si les deux documents sont en réalité le même, on peut
supprimer le champ « PDF de support » et ne garder que « Fiche récap ». Si ce
sont bien deux documents distincts (une fiche à envoyer, un support à
télécharger), les deux champs restent justifiés tels quels. C'est une décision
de Tiffany, pas une décision technique ; rien dans le code ne dépend de la
réponse.

### Le replay sans saisie manuelle

Nouvelle fonction `zoom-recording-webhook`, abonnée à l'événement Zoom
`recording.completed`. Zoom publie l'enregistrement cloud environ une
demi-heure après la fin de la soirée, soit vers 22h00 un lundi — donc **avant**
les 08h00 du lendemain. Dans le cas normal, l'email du lendemain porte donc la
fiche et le replay en un seul envoi, et Tiffany ne touche à rien.

La fonction vérifie la signature HMAC de Zoom (`x-zm-signature`, fenêtre de
5 minutes contre le rejeu), répond au défi `endpoint.url_validation`, retrouve
la soirée par `webinar_access.zoom_meeting_id` (comparaison sur les chiffres
seuls, pour que « 881 2345 6789 » trouve « 88123456789 »), puis écrit
`replay_url`, `replay_code` si Zoom le fournit, et `replay_expires_at` s'il
était vide (soirée + 7 jours, 23h59'59" suisse). Une expiration déjà saisie à
la main n'est jamais écrasée.

Si l'email du lendemain est **déjà** parti, la fonction déclenche l'action
`replay`. Sinon elle ne fait rien : le mail de 08h00 s'en chargera.

#### Ce que la doc Zoom dit du code de lecture — à lire avant de promettre

Le brief demandait de vérifier les champs exacts. Résultat :

- **`share_url`** est fiable : c'est le lien de partage de l'enregistrement
  cloud, présent dans le payload.
- **le code de lecture ne l'est pas.** `recording_play_passcode` n'est servi que
  si Zoom Support l'a activé sur le compte — ce n'est pas le comportement par
  défaut — et le `password` du payload n'est pas toujours présent selon les
  réglages. De plus, le passcode renvoyé par l'API ne correspond pas toujours à
  celui que l'organisateur reçoit par email.

Le code n'est donc **pas** garanti automatiquement. Deux sorties possibles, à
choisir côté Zoom :

1. **Désactiver le code de lecture** des enregistrements (réglages Zoom →
   Enregistrement). Le lien seul suffit alors. La protection repose sur le fait
   que le lien n'est envoyé qu'aux inscrites payées et qu'il expire après
   7 jours. C'est la voie recommandée : elle supprime la saisie manuelle pour
   de bon.
2. **Garder le code** et demander à Zoom Support d'activer
   `recording_play_passcode` sur le compte. Tant que ce n'est pas fait, la
   fonction écrit le lien, laisse `replay_code` vide, et log un avertissement ;
   Tiffany colle le code à la main dans l'onglet Soirées.

Dans les deux cas l'email s'adapte : sans code, le bloc « Code d'accès »
n'apparaît pas. Rien n'est inventé.

**Expiration à 7 jours** : elle se règle une fois pour toutes dans les réglages
du compte Zoom, pas par appel API à chaque enregistrement. `replay_expires_at`
est calculé de notre côté (soirée + 7 jours) et ne sert qu'au texte de l'email
et à l'affichage dans l'app.

---

## 3. Ordre de mise en production

1. **Migration** `supabase/migrations/soirees_fiche_recap_envoi_auto_2026_10_06.sql`
   — crée le bucket `soiree-fiches` (privé, 10 Mo, PDF uniquement) et ses quatre
   policies admin, ajoute `webinar_access.fiche_path`, étend les deux contraintes
   `CHECK` (`soiree_emails_sent.kind` et `admin_notifications.kind`).
   Les contrôles à passer après application sont en bas du fichier.

2. **`notify-admin`** — redéployer. Seul changement : le kind
   `soiree_fiche_manquante` ajouté dans `validKinds` et `userEventKinds`. Le
   fichier du repo était **conforme à la version 23 déployée** avant
   modification (vérifié le 06.10), donc pas de risque d'écraser du code de
   production.

3. **`soiree-emails`** — redéployer, `verify_jwt=false`. Le fichier du repo était
   lui aussi conforme à la version 1 déployée. Les trois actions existantes ne
   changent pas de comportement ; `reminders` gagne la fenêtre du lendemain et
   une borne basse élargie à −48h, pour que la soirée de la veille entre encore
   dans le lot.

4. **`zoom-recording-webhook`** — déployer, `verify_jwt=false` (Zoom n'envoie
   pas de JWT Supabase ; la porte est tenue par la vérification HMAC).

Les points 1 à 3 suffisent pour que la fiche part automatiquement. Le
point 4 ne fait que supprimer la saisie du lien de replay : s'il prend du
temps, on peut livrer sans lui et le replay reste à un clic.

### L'ordre compte, à cause de Vercel

`src/` est déployé **automatiquement par Vercel à chaque push sur `main`**,
contrairement aux fonctions edge. Or le formulaire de l'onglet Soirées écrit
désormais `webinar_access.fiche_path` : si la branche est fusionnée avant que
la migration soit passée, l'enregistrement d'une soirée échouerait sur
« column fiche_path does not exist ».

Donc : **appliquer la migration (point 1) avant de fusionner la branche**. Les
fonctions edge peuvent suivre dans l'heure — entre les deux, l'admin fonctionne
normalement, c'est seulement l'email du lendemain qui n'est pas encore
automatique.

### Secrets à ajouter dans Supabase

| Secret | Où le trouver | Nécessaire à |
|---|---|---|
| `ZOOM_WEBHOOK_SECRET_TOKEN` | app Zoom → Feature → « Secret Token » | signature du webhook |
| `ZOOM_ACCOUNT_ID` | app Zoom → App Credentials | repli API |
| `ZOOM_CLIENT_ID` | app Zoom → App Credentials | repli API |
| `ZOOM_CLIENT_SECRET` | app Zoom → App Credentials | repli API |

`BREVO_API_KEY`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` et `APP_URL` sont
déjà en place et ne changent pas. Rien en dur dans le code.

### Créer l'app Zoom (à faire par Tiffany, sur son compte)

1. marketplace.zoom.us → Develop → Build App → **Server-to-Server OAuth**.
2. Scopes : lecture des enregistrements cloud
   (`cloud_recording:read:list_recording_files:admin` ou l'équivalent
   « View all user recordings » selon l'interface).
3. Onglet **Feature** → Event Subscriptions → Add Event Subscription :
   - URL : `https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/zoom-recording-webhook`
   - événement : **Recording → All Recordings have completed**
     (`recording.completed`)
   - cliquer **Validate** : Zoom envoie le défi `endpoint.url_validation`, la
     fonction y répond. La validation doit passer au vert **avant** d'activer
     l'app.
4. Activer l'app.

---

## 4. Tests avant d'ouvrir aux clientes

À faire dans cet ordre, sur une soirée de test non publiée dont Tiffany est la
seule inscrite payée.

1. **Le chemin normal.** `event_date` fixée à la veille, fiche déposée. Au tick
   de 08h00, l'email arrive avec le PDF en pièce jointe. **Ouvrir le PDF reçu
   sur téléphone et sur ordinateur** — une pièce jointe mal encodée se voit là,
   pas dans les logs.
2. **Sans fiche.** Même soirée, `fiche_path` et `file_path` vides : aucun email,
   et l'alerte « Fiche récap manquante » arrive sur les trois canaux. Déposer la
   fiche, attendre le tick suivant : l'email part.
3. **Double passage.** Rejouer le cron deux fois dans la même heure
   (`SELECT cron.schedule` n'est pas nécessaire : appeler la fonction deux fois
   à la main suffit) : un seul email, grâce au verrou `soiree_emails_sent`.
4. **Avec replay.** Remplir `replay_url` et `replay_code` avant 08h00 : l'email
   du lendemain porte la fiche **et** le replay, et une ligne `replay` apparaît
   dans `soiree_emails_sent` pour chaque destinataire. Cliquer ensuite « Envoyer
   le replay » : zéro envoi.
5. **Webhook Zoom.** Depuis l'app Zoom, bouton de test de l'abonnement, ou plus
   sûr : faire une courte réunion enregistrée sur le `zoom_meeting_id` de la
   soirée de test et vérifier que `replay_url` se remplit tout seul.

## 5. Rattrapage des deux premières soirées

Une fois en production, bouton « Envoyer la fiche récap » dans l'onglet Soirées
(visible pour toute soirée passée dont une fiche existe) :

| Soirée | Date | Inscrites | Ce que l'email contiendra |
|---|---|---|---|
| Le rappel qui marche vraiment | 14.09 | 5 | la fiche seule — le replay a expiré le 23.09, et les 5 l'avaient reçu le 16.09 |
| La marche en laisse sans tirer | 05.10 | 4 | la fiche **et** le replay, si l'envoi a lieu avant le 12.10 |

Les deux ont déjà un PDF déposé : rien à téléverser. Le bouton passe par
l'action `lendemain`, qui ignore la fenêtre horaire.

Le cas d'octobre mérite une seconde de calendrier. Au 06.10, son lien de replay
et son code sont enregistrés mais **l'email de replay n'est pas parti**
(`soiree_emails_sent` ne compte aucune ligne `replay` pour cette soirée). Donc :

- rattrapage **avant le 12.10** → un seul email porte la fiche et le replay, et
  il n'y a plus rien à cliquer ;
- rattrapage **après le 12.10** → le lien a expiré, l'état passe en `expire`, et
  l'email ne contient que la fiche. Les 4 inscrites n'auront jamais eu le
  replay. Si on passe cette date, mieux vaut que Tiffany clique « Envoyer le
  replay » d'ici là, indépendamment de ce chantier.

---

## 6. Limites de ce qui a été vérifié

- **Aucun test d'exécution.** Ni `deno` ni le CLI Supabase ne sont installés
  dans l'environnement où ce code a été écrit, et la migration n'a pas été
  appliquée. Le code est relu, pas exécuté. Les cinq tests de la section 4 sont
  à passer avant d'ouvrir aux clientes — en particulier le premier : la pièce
  jointe Brevo est la seule partie dont le comportement réel ne peut pas être
  déduit du code.
- **Les champs du payload Zoom** viennent de la documentation et du forum
  développeurs Zoom, pas d'un appel réel sur le compte de Tiffany. `share_url`
  est sûr ; le code de lecture est le point à confirmer au premier
  enregistrement (section 2).
- **L'heure d'été** est gérée par `Intl` plutôt que par un décalage codé en dur,
  donc le 25 octobre et le 29 mars se comportent correctement. Non vérifié par
  un test, mais la fenêtre 08h00–20h00 ne touche jamais l'heure de bascule
  (02h→03h).
