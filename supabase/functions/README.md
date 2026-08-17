# Fonctions edge Supabase

## Ce dossier ne déploie rien

Contrairement à `src/` (poussé sur GitHub, déployé automatiquement par Vercel),
ce dossier **n'est relié à aucun déploiement automatique**. Une fonction edge
part en production quand quelqu'un l'envoie explicitement à Supabase, depuis :

- l'éditeur du dashboard Supabase,
- le CLI (`supabase functions deploy <nom>`),
- l'API de gestion (ce qu'utilise un agent).

Rien ne lit ce dossier au passage. Il n'est qu'une **copie**, qu'il faut penser
à mettre à jour à la main.

## La conséquence, et la règle qui en découle

Entre mai et août 2026, plusieurs fonctions ont été corrigées directement dans
le dashboard. La production a avancé, le repo est resté en arrière. Au
16.08.2026, `editorial-bundle-actions` avait trois versions de retard ici :
le fichier local ne contenait ni la publication Instagram ni la publication
Google Business. La dérive allait dans les deux sens, `generate-editorial-bundle`
ayant de son côté une gestion de catégorie committée le 27.05 qui n'avait
jamais été déployée.

**Règle : avant de modifier une fonction, récupère d'abord la source
réellement déployée et compare-la au fichier d'ici.** Redéployer depuis le repo
sans cette vérification écrase silencieusement du code de production.

```
# récupérer la source déployée (CLI)
supabase functions download <nom> --project-ref oncbeqnznrqummxmqxbx
```

## Inventaire au 17.08.2026

46 fonctions en production, 45 fichiers ici. L'écart tient à une seule entrée :

- **`smooth-responder`** : non reprise ici volontairement. C'est un doublon
  accidentel de `public-product-checkout` (même code, en-tête compris) créé
  sous un nom généré automatiquement par Supabase. Elle n'est appelée par rien.
  À supprimer depuis le dashboard, après vérification qu'aucun appel ne la vise.

Rapatriées dans le repo le 17.08.2026, elles n'existaient jusque-là qu'en
production, sans aucune sauvegarde : `publish-to-instagram`, `generate-qr-bill`,
`stripe-webhook-club`.

Corrigé le même jour : `public-product-checkout/index.ts` traînait 47 octets
nuls en fin de fichier depuis mai, ce qui le faisait passer pour un binaire aux
yeux de `grep` et des outils de diff.

## La règle a servi dès le lendemain

17.08.2026, en préparant une modification de `generate-editorial-bundle` : la
comparaison avec la source déployée a révélé que le fichier d'ici était en
retard de deux lignes du prompt utilisateur, celles qui rendent
`facebook.message` obligatoire et qui listent Facebook dans la tâche. Redéployer
depuis le repo aurait fait taire la consigne Facebook sans que rien ne le
signale : les bundles suivants seraient repartis sur le texte Google Business.
Écart comblé, puis redéploiement.

`publish-article-to-github` et `editorial-bundle-actions` ont été vérifiés de la
même façon le même jour : identiques à la production, modification appliquée
sans risque. Vérifier prend deux minutes, la dérive coûte une semaine.

## Correctif de fond envisagé

Une action GitHub qui déploie les fonctions à chaque push sur `main` ferait de
Git la source de vérité et rendrait la dérive impossible. Elle suppose un secret
`SUPABASE_ACCESS_TOKEN` dans le dépôt, et surtout de ne plus jamais éditer une
fonction depuis le dashboard. Décision non prise à ce jour.
