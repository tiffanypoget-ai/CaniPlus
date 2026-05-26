# Session 26 mai 2026 — Agent éditorial : sources scientifiques + programmation

## Ce qui change pour toi

L'agent éditorial dans l'admin gagne deux capacités.

**1. Source scientifique (Semantic Scholar + PubMed, gratuit).**
Avant de proposer ou de générer un bundle, l'agent récupère 5 à 8 publications
scientifiques récentes (10 dernières années) sur des bases peer-reviewed. Claude
les voit, et il les cite **uniquement si elles apportent une vraie plus-value**.
Pour les sujets légers ("préparer ton chien à l'été"), il les ignore. Pour les
sujets comportement/apprentissage/santé, il les cite naturellement dans
l'article blog et dans la ressource premium, avec une section "Sources" et un
lien DOI cliquable.

J'ai vérifié l'API Consensus.app : payante, par formulaire de demande, ~$0.10
par requête. Semantic Scholar + PubMed interrogent les mêmes bases en backend
et sont 100 % gratuits. On reste sur cette piste, c'est en place dans le code.

**2. Programmer une publication dans le futur.**
Sur un bundle au statut "Brouillon" ou "Validé", tu vois un petit panneau gris
avec un sélecteur date+heure et un bouton "Programmer". Tu choisis quand le
bundle doit être publié (article blog + ressource premium + push + HTML
statique), et c'est mis en file d'attente.

Une nouvelle section "Publications à venir" en haut de l'onglet éditorial liste
tous les bundles programmés, dans l'ordre de leur date. Bouton "Déprogrammer"
pour annuler à tout moment. Un job toutes les heures pile vérifie ce qui est
dû et déclenche la publication automatiquement.

Horizon : 1 à 3 mois d'avance comme tu voulais (pas de limite technique en
fait, mais c'est ce qui est confortable).

---

## Fichiers modifiés / créés

### Nouveaux

- `supabase/migrations/add_scheduled_and_sources_2026_05_26.sql` — colonnes
  `scheduled_for`, `scientific_sources`, statut `'scheduled'`, vue
  `editorial_scheduled_upcoming`, cron pg_cron horaire.
- `supabase/functions/fetch-scientific-sources/index.ts` — appelle Semantic
  Scholar et PubMed en parallèle, fusionne, dédoublonne.
- `supabase/functions/publish-scheduled-bundles/index.ts` — cron horaire qui
  publie les bundles dont la date est dépassée.

### Modifiés

- `supabase/functions/propose-editorial-themes/index.ts` — récupère 8 publis
  récentes et les passe à Claude comme inspiration pour ses 3 thèmes.
- `supabase/functions/generate-editorial-bundle/index.ts` — fetch les sources
  pour le thème, les donne à Claude (cite si pertinent, ignore sinon),
  enregistre celles effectivement citées dans `bundle.scientific_sources`.
- `supabase/functions/editorial-bundle-actions/index.ts` — 3 nouvelles actions :
  `schedule_editorial_bundle`, `unschedule_editorial_bundle`,
  `list_scheduled_bundles`.
- `src/screens/AdminScreen.jsx` — sélecteur date+heure sur drafted/validated,
  section "Publications à venir", badge "Programmé".

---

## Ordre de déploiement

**1. Migration SQL.** Va dans le SQL Editor Supabase et exécute le contenu de
`supabase/migrations/add_scheduled_and_sources_2026_05_26.sql`. Le bloc final
configure aussi le cron pg_cron — pour que ça marche vraiment il faut juste
que les paramètres `app.supabase_url` et `app.cron_secret` soient set au niveau
base (si pas déjà). Vérifie avec :

```sql
SELECT name, setting FROM pg_settings WHERE name LIKE 'app.%';
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'publish-scheduled-bundles';
```

Si `app.cron_secret` est vide, set-le :

```sql
ALTER DATABASE postgres SET app.cron_secret = 'TON_CRON_SECRET';
ALTER DATABASE postgres SET app.supabase_url = 'https://oncbeqnznrqummxmqxbx.supabase.co';
```

Puis relance le bloc DO de la section 5 de la migration pour réinjecter le
secret dans le `cron.schedule`.

**2. Déployer les 5 edge functions** dans cet ordre (les dépendances entre
elles imposent l'ordre) :

1. `fetch-scientific-sources` — nouveau, indépendant
2. `publish-scheduled-bundles` — nouveau, dépend d'editorial-bundle-actions
3. `editorial-bundle-actions` — modifié, dépend de fetch-scientific-sources indirectement
4. `propose-editorial-themes` — modifié, appelle fetch-scientific-sources
5. `generate-editorial-bundle` — modifié, appelle fetch-scientific-sources

(On peut tout déployer en une fois, l'ordre n'a d'impact que pour les premiers
appels.)

**3. Pousser le code via GitHub Desktop** comme d'habitude (Commit + Push). Le
front Vercel se redéploie tout seul.

**4. Test recommandé** : génère un thème "test programmation" via le bouton
"Générer maintenant", choisis-le, génère le contenu, programme-le pour dans
5-10 minutes, attends, et vérifie qu'il passe en "Publié" dans l'heure.

---

## Notes techniques

- `app.cron_secret` doit être le **même** secret que celui dans
  l'env Supabase Functions `CRON_SECRET`. Si tu l'avais déjà set pour
  `auto-cancel-unpaid-private` ou autres crons, réutilise celui-là.

- Le job pg_cron passe `cron_secret` dans le body JSON, pas en header. C'est
  cohérent avec les autres jobs CaniPlus.

- Les sources scientifiques sont en anglais (toutes les bases scientifiques le
  sont). La fonction `buildEnglishQuery` traduit les thèmes FR en mots-clés EN
  via un dictionnaire ciblé pour le comportement canin. Pour les thèmes pas
  couverts par le dictionnaire, fallback générique "[mots clés] dog behavior".

- Si Semantic Scholar ou PubMed sont down, l'agent continue sans sources (best
  effort). Aucune génération n'est bloquée par une panne d'API externe.

- Le sélecteur "Programmer" exige au minimum +30 min dans le futur. C'est pour
  éviter une publication immédiate accidentelle alors que le cron tourne à
  l'heure pile.

- Quand tu déprogrammes un bundle, il revient à `validated` (si validé avant)
  ou `drafted`. Aucune perte de contenu.
