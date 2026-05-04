# play-store/ — ABANDONNÉ (3 mai 2026)

Le projet de publication Google Play Store via Bubblewrap/TWA a été abandonné.

## Pourquoi

Une cliente a vu le pop-up Google Play Protect "Appli non sécurisée bloquée"
parce que l'APK ciblait un Android trop ancien (`minSdkVersion: 19`, pas de
`targetSdkVersion` à jour). Depuis novembre 2024, Google exige que toute
appli installée vise au moins Android 14 (API 34).

Plutôt que de maintenir un APK à jour, on garde **uniquement la PWA** installable
depuis Chrome via `https://app.caniplus.ch?install=1`. Avantages :

- Pas de Google Play Protect qui bloque
- Pas de cycle de release Play Store à maintenir
- Mise à jour instantanée (pas besoin de republier)
- Pas de commission Google sur les achats
- Pas de keystore à conserver

## État des fichiers

Les fichiers de ce dossier (twa-manifest.json, assetlinks.json, store-listing.md,
ROADMAP_PLAY_STORE.md) ne sont plus utilisés et ont été vidés. Le fichier
`public/.well-known/assetlinks.json` a été remplacé par `[]` pour invalider
toute association TWA résiduelle.

## Si on veut un jour refaire un APK

Reprendre le travail à zéro avec une cible récente :

1. Bubblewrap CLI à jour (`npm i -g @bubblewrap/cli`)
2. `bubblewrap init --manifest=https://app.caniplus.ch/manifest.json`
3. Forcer `--target-sdk-version=34` (ou la dernière API stable)
4. Régénérer une keystore propre
5. Republier `assetlinks.json` avec le bon SHA-256
