# Charte graphique CaniPlus — vidéo

## Couleurs

| Usage | Couleur |
|---|---|
| Principale (accents, surlignage, fonds de message clé) | `#2babe1` |
| Fond | blanc `#ffffff` ou la vidéo elle-même |
| Texte foncé (sur fond clair) | `#1a2b33` |
| Texte sur fond bleu | blanc `#ffffff` |
| Texte bleu sur fond blanc | `#1e94c8` (variante foncée du bleu : le `#2babe1` pur ne donne que 2,62:1 de contraste, insuffisant en vidéo) |

Sur un fond plein `#2babe1` avec du texte blanc, ajouter un léger voile sombre
(`rgba(0,0,0,0.16)`) pour atteindre 3:1 de contraste (déjà fait dans
`animations/message-cle.html`).

Une seule couleur d'accent. Pas de dégradés criards, pas de néon.

## Typographies

| Usage | Police | Graisse |
|---|---|---|
| Titres, hooks, outro | Playfair Display | 700–800 |
| Sous-titres, texte courant | Inter | 500–700 (mots clés en 700) |

Chargement : Google Fonts. Toujours prévoir un fallback (`Georgia, serif` pour
Playfair, `system-ui, sans-serif` pour Inter).

## Ton

Chaleureux, tutoiement, direct, jamais pompeux. Emojis très rares (zéro par
défaut). Les textes à l'écran reprennent les mots de Tiffany, jamais des
formules inventées.

## Format vidéo

1080×1920 (9:16), 30 fps, MP4. Textes animés dans le tiers supérieur ; le bas de
l'écran et l'extrême haut restent libres (interface TikTok). Détail :
`../formats/tip-vertical.md`.

## Animations réutilisables (`animations/`)

Sous-compositions HyperFrames 1080×1920, à monter dans un projet vidéo via
`data-composition-src` :

- `titre-hook.html` — gros titre Playfair Display, apparition avec impact (hook 0–3 s)
- `sous-titres-karaoke.html` — sous-titres Inter mot à mot, mots clés surlignés en bleu
- `message-cle.html` — phrase clé pleine frame, fond `#2babe1`, texte blanc
- `outro-logo.html` — logo + « caniplus.ch », apparition douce (~1,5 s)

Chaque fichier documente en tête ses variables (texte, timings) à adapter par
vidéo. Le logo définitif se dépose dans `../asset-library/logo/` ; tant qu'il
n'y est pas, l'outro affiche un wordmark texte de remplacement.
