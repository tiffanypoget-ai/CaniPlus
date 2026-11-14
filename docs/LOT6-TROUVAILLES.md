# Lot 6 : nettoyage du site, trouvailles

Branche `sans-app`, 14.11.2026. À fusionner en même temps que le lot 1
(`espace-site`), puisque les liens pointent vers `/espace`.

Recherche faite dans tout `site-vitrine/` (pages, blog, pages légales,
`llms.txt`, sitemap, données structurées) sur : app, application,
installer, app.caniplus.ch, espace membre, ton espace.

## Corrigé

| Où | Avant | Après |
|---|---|---|
| En-tête, 44 pages (fragment) | « Mon espace » vers app.caniplus.ch | vers `/espace` |
| Pied de page, 44 pages (fragment) | « Mon espace » vers l'app, « Installer l'app » | « Mon espace » vers `/espace`, « Installer l'app » retiré |
| Accueil | « Membre du club ? Installer l'app sur ton téléphone… » | bloc retiré |
| `llms.txt` | ligne « Application membres (inscriptions aux cours) : app.caniplus.ch » | ligne retirée |
| `llms.txt` | cours privés : « prise de rendez-vous via l'application CaniPlus » | « prise de rendez-vous par WhatsApp ou par email » (comme la page cours privés) |
| Blog, chien-leche-tout-signal-ou-message | « l'accès premium de l'app CaniPlus » | « l'accès premium de CaniPlus » |
| Adhésion, case photos | « supports CaniPlus (site, app, réseaux sociaux) » | « (site, réseaux sociaux) » |
| `publish-article-to-github` (générateur d'articles) | bouton « Mon espace » vers l'app dans le modèle | vers `/espace`, sinon chaque nouvel article remettait le lien |

Effet de bord voulu : la synchronisation des fragments remet aussi à jour
l'en-tête et le pied de page de 8 articles de blog publiés par le
générateur avec un ancien gabarit.

Sitemap et données structurées (JSON-LD) : aucune mention de l'app.

## Laissé tel quel, à trancher ou à faire plus tard

- **Pages légales** (mentions légales, politique de confidentialité) : elles
  citent « l'application app.caniplus.ch », ses cookies et son hébergement.
  L'app existe encore jusqu'au lot 7 : le texte reste juste jusque-là. À
  réécrire au lot 7, en ajoutant l'espace membre du site (session gardée
  dans le navigateur, pas de cookie publicitaire).
- **Page soirées, FAQ** : « L'enregistrement reste accessible pendant 7 jours
  dans ton espace. » Prévu au lot 3, après la soirée du 16 novembre (règle
  de calendrier : rien sur le parcours soirée avant le 17).
- **Page cours collectifs, carte « Ressources incluses »** : « Espace membre
  dans notre app : fiches pratiques et contenu premium. » Question posée à
  Tiffany : le premium est-il inclus pour les membres du club ? Aujourd'hui
  5 comptes ont le premium sur 38 membres, ce qui laisse penser que non.
- **Adhésion** : « ton espace membre s'ouvre tout seul ». Juste, l'espace est
  désormais sur le site. Le mail d'invitation (`validate-adhesion`) pointe
  encore vers l'app : lot 7.
- Faux positifs écartés : « app bancaire » (rallye), « s'y installer »,
  « installer la vie à deux », « appétit », adresses `*.vercel.app` dans le
  code.

## Mise en ligne

- `publish-article-to-github` à redéployer au moment de la fusion, après
  comparaison avec la version en ligne (v33).
- Captures avant et après de l'accueil (haut de page et pied de page) aux
  4 largeurs : `docs/captures/lot6-sans-app/`.
