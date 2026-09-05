# Studio de montage CaniPlus — instructions permanentes

Ce dossier est le studio de montage vidéo de Tiffany (CaniPlus, éducation canine
positive, Ballaigues VD). Objectif : vidéos courtes TikTok/YouTube de 60 à 90 s,
tips canins contre-intuitifs, filmées brut au DJI Mic Mini. Montage automatisé
local avec HyperFrames (`npx hyperframes ...`), aucun outil payant.

Les skills HyperFrames s'installent dans `.claude/skills/` (liens vers
`.agents/skills/`, non versionnés — si absents, lancer
`npx skills add heygen-com/hyperframes`). Lire `/hyperframes` avant tout
travail vidéo, puis
`/hyperframes-core` avant d'écrire ou modifier une composition HTML.

## Charte graphique CaniPlus

- Titres : **Playfair Display**
- Texte courant et sous-titres : **Inter**
- Couleur principale : bleu `#2babe1` ; fond blanc ou vidéo ; texte foncé lisible (`#1a2b33`)
- Ton : chaleureux, tutoiement, jamais pompeux. Emojis très rares.
- Référence complète : `charte-graphique/charte.md`
- Compositions réutilisables : `charte-graphique/animations/` (sous-compositions
  1080×1920 à monter via `data-composition-src`)

## Règles de montage (chaque vidéo)

- **Coupes serrées** : couper selon le niveau sonore réel (détection de silence,
  ex. `ffmpeg -af silencedetect`), pas selon les mots. Maximum ~0,2 s de blanc
  entre les phrases.
- **Prises répétées** : quand une phrase est dite plusieurs fois, garder
  uniquement la **dernière** prise (c'est généralement la bonne).
- **Sous-titres animés synchronisés** : transcription via
  `npx hyperframes transcribe` (ou Whisper), style karaoké sobre, Inter,
  mots clés surlignés en `#2babe1`. Base :
  `charte-graphique/animations/sous-titres-karaoke.html`.
- **Hook visuel dans les 3 premières secondes** : titre animé Playfair Display
  reprenant le tip (`charte-graphique/animations/titre-hook.html`).
- **Audio normalisé à −14 LUFS** (ex. `ffmpeg -af loudnorm=I=-14:TP=-1.5:LRA=11`).
- **Sortie : 1080×1920 (9:16), 30 fps, MP4.**
- **Toujours un draft d'abord** : `npx hyperframes render --quality draft` pour
  itérer vite ; rendu final pleine qualité seulement après validation de Tiffany.
- Zones sûres : textes dans le tiers supérieur, rien dans le bas de l'écran
  (interface TikTok) ni à l'extrême haut. Spec : `formats/tip-vertical.md`.

## Règles de contenu

- **Ne jamais inventer de propos** : le montage réorganise ce que Tiffany a dit.
  Aucun texte affirmatif à l'écran qui ne vient pas d'elle (les titres reprennent
  ses mots ou son tip, sans en changer le sens).
- **Illustrations** uniquement depuis `asset-library/` ou des sources libres de
  droits (Wikimedia Commons). En cas de doute sur un droit d'usage :
  placeholder + signalement explicite à Tiffany.
- **Jamais d'images de clients ou de chiens de clients** sans instruction
  explicite.

## Workflow par vidéo

1. Tiffany dépose son rush dans `video-projects/<nom-video>/rush/`
2. Transcription complète → `video-projects/<nom-video>/transcript.md` avec timecodes
3. Plan de montage proposé dans `video-projects/<nom-video>/plan-montage.md`
   (ce qui est coupé, où vont les animations) — puis rendu **V1 draft
   directement, sans attendre validation**
4. Tiffany fait ses retours avec timecodes (ex. « à 0:23, le cut est trop lent »)
5. V2, puis rendu final pleine qualité dans `video-projects/<nom-video>/renders/`

## Interdits

- Ne jamais travailler dans le dossier du site vitrine CaniPlus
  (`C:\Users\tiffa\Documents\GitHub\CaniPlus` en local). Tout se passe ici.
- Pas d'abonnement, pas d'outil payant, pas d'upload vers un service tiers sans
  demande explicite.
