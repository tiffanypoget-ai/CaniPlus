# Fixes listes & conflit Git — 28 avril 2026

## Ce qui ne marchait pas

**1. Sur le site vitrine caniplus.ch/blog :** la card de l'article "Allergies saisonnières" affichait des marqueurs Git crus dans son extrait (`<<<<<<< HEAD`, `=======`, `>>>>>>> ce189ad...`).

**2. Dans l'app PWA, modale ressource "Allergies saisonnières : protocole complet" :** les listes d'instructions techniques étaient rendues comme un seul gros pavé (`Technique : - Fais X. - Pas de savon. - Sèche.`) au lieu d'une vraie liste à puces.

## Diagnostic

**Pour le bug Git :** la base Supabase est PROPRE (`position('<<<<<<<')` retourne 0 pour `excerpt` et `content` de l'article). Le marqueur était UNIQUEMENT dans le HTML statique du fichier `site-vitrine/blog/index.html` (la page de listing du blog). Origine probable : un `git pull` qui a importé une version distante du fichier où l'apostrophe était encodée différemment (`&#39;` vs `'`), Git a marqué un conflit, et le merge n'a pas été terminé avant le commit suivant.

**Pour les listes mal formatées :** le `content` de la ressource utilise des bullets `- ` au lieu de `•` (l'IA a désobéi à l'instruction du prompt). Le parser `parseContent` de `RessourcesScreen.js` ne reconnaissant que `•`, il classait ces lignes en simple paragraphe et les concaténait avec un espace, donnant le pavé visible.

## Ce qui a été corrigé (4 modifs)

### 1. `site-vitrine/blog/index.html`
Conflit Git résolu (gardé la version avec `&#39;` qui correspond à ce que `escapeHtml` produit dans l'edge function).

### 2. `src/screens/RessourcesScreen.js`
Ajout d'une fonction `normalizeBullets()` appelée au tout début de `parseContent` :
- Transforme les bullets `- ` et `* ` en début de ligne en `• ` (donc compatibles avec le parser).
- Détecte les listes inlinées (`Intro : - a - b - c`) et les éclate en plusieurs lignes avec `•`.

→ Cette modif corrige le rendu de TOUS les contenus existants ET futurs côté app, sans toucher à la base.

### 3. `supabase/functions/publish-article-to-github/index.ts`
Ajout d'une fonction `stripGitConflictMarkers()` appliquée sur `excerpt`, `content` et l'extrait de la card index avant insertion dans le HTML statique. Si un futur article remonte avec des marqueurs Git, ils seront retirés à la publication. Ceinture + bretelles.

### 4. `supabase/functions/generate-editorial-bundle/index.ts`
Trois ajouts dans le SYSTEM_PROMPT et le code :
- **Exemple anti-pattern** dans la section "BULLETS" du prompt : montre explicitement que `Technique : - a - b - c` sur une seule ligne est interdit, avec l'exemple correct.
- **`sanitizeBundle()`** appelée sur le bundle juste après `safeParseJson()` : strip des marqueurs Git partout + auto-fix des bullets dans `premium.body_markdown` (même logique que côté front, pour cohérence).
- **Validation post-génération** dans `validateBundle()` : si après sanitization il reste des marqueurs Git ou une liste inlinée non rattrapée, on rejette le bundle (force Claude à régénérer plutôt que publier de la merde).

## Ce qu'il te reste à faire

### A — Commit + push via GitHub Desktop
Les 4 modifs sont prêtes en local. Ouvre GitHub Desktop, écris un message genre "fix: bug listes app + conflit Git blog index + protections", commit, puis "Push origin".

→ Vercel redéploiera **automatiquement** le site vitrine ET l'app PWA dès que tu auras pushé. Plus de marqueur Git sur caniplus.ch/blog, et les listes de la ressource Allergies (et de toutes les autres ressources futures) seront bien rendues dans l'app.

### B — Redéployer les 2 edge functions Supabase
Les modifs sur `publish-article-to-github` et `generate-editorial-bundle` ne s'appliquent QUE quand tu redéploies les functions sur Supabase. Si tu as un script de déploiement habituel, lance-le pour ces deux. Sinon, dans le dashboard Supabase → Edge Functions → upload manuel.

→ Sans cette étape, les protections anti-Git et anti-listes-cassées ne s'activeront pas pour les futurs bundles.

### C — Vérifier le résultat
Une fois Vercel redéployé :
1. Ouvre **caniplus.ch/blog** en navigation privée (pour éviter le cache) → l'extrait de l'article "Allergies saisonnières" doit afficher le texte propre, sans marqueur Git.
2. Ouvre l'app PWA → Ressources → "Allergies saisonnières : protocole complet de gestion au quotidien" → la section "Technique" doit afficher de vraies puces sur des lignes séparées.

### D — Au prochain bundle généré, vérifier l'effet
Le prochain bundle que tu généreras devrait avoir des listes mieux formatées dans `content_premium.body_markdown` grâce à l'exemple anti-pattern ajouté au prompt. Si Claude désobéit malgré tout, le `sanitizeBundle` rattrapera. Et si même ça ne suffit pas, `validateBundle` rejettera et te demandera de régénérer.

## Aucune action SQL requise
Contrairement au plan initial, la base Supabase n'a pas besoin d'être nettoyée :
- L'article "Allergies saisonnières" a un `excerpt` et un `content` propres en DB (le bug était uniquement dans le HTML statique).
- Le `content` de la ressource Allergies utilise `- ` au lieu de `•`, mais c'est désormais géré par `normalizeBullets` côté front. Pas la peine de toucher à la DB.

Si tu veux quand même normaliser le `content` de la ressource en DB pour être 100 % conforme à la convention CaniPlus (bullets `•`), voici le SQL à lancer dans Supabase SQL Editor :

```sql
UPDATE resources
SET content = regexp_replace(content, '(^|\n)[ \t]*[-*][ \t]+', '\1• ', 'g')
WHERE id = '707e4574-d5d4-466e-a7a3-ed51da585f0c';
```

Mais c'est optionnel : avec le fix du parser, le rendu sera identique à du `•` même si la base garde des `-`.
