# play-store/ — Dossier de publication Google Play

Contient tout le nécessaire pour publier CaniPlus sur le Play Store via **Bubblewrap TWA**.

## Fichiers

- **ROADMAP_PLAY_STORE.md** — guide pas-à-pas complet (étapes 1 à 9, troubleshooting, budget)
- **twa-manifest.json** — configuration Bubblewrap (à utiliser lors de `bubblewrap init`)
- **assetlinks.json** — Digital Asset Links (template, à remplir avec le SHA256 Play App Signing)
- **store-listing.md** — textes et descriptions à copier-coller dans la Play Console

## Fichiers synchronisés dans `public/`

Pour que la TWA fonctionne, le même `assetlinks.json` doit être servi publiquement à :

> https://cani-plus.vercel.app/.well-known/assetlinks.json

Le fichier est donc également copié dans `public/.well-known/assetlinks.json`. **Toujours synchroniser les deux** lors d'une modification.

## Ordre recommandé

1. Lire **ROADMAP_PLAY_STORE.md** en entier (30 min)
2. Créer le compte développeur Google Play
3. Installer Bubblewrap + Android Studio
4. Lancer `bubblewrap init` depuis un dossier hors du repo
5. Générer l'AAB
6. Uploader en test interne
7. Récupérer le SHA256 Play App Signing et mettre à jour `assetlinks.json` (ici ET dans `public/.well-known/`)
8. Redéployer le site Vercel
9. Tester → beta ouverte → production

Durée active : ~5h. Validation Google : 2 à 7 jours.
