# Format « tip-vertical » — spec

Le format principal CaniPlus : un tip canin contre-intuitif, face caméra,
vertical, pour TikTok et YouTube Shorts.

## Cadre

- Durée cible : **60–90 s** (jamais plus de 3 min)
- Sortie : 1080×1920 (9:16), 30 fps, MP4
- Audio : mono ou stéréo, normalisé à −14 LUFS

## Structure

| Timing | Séquence | Composition |
|---|---|---|
| 0–3 s | **Hook** : titre animé qui reprend le tip, par-dessus le début du rush | `titre-hook.html` |
| 3 s → fin − ~4 s | **Contenu** : Tiffany face caméra, coupes serrées, sous-titres karaoké | `sous-titres-karaoke.html` |
| dernière phrase | **Message clé** en pleine frame (fond bleu, texte blanc) sur la phrase de conclusion | `message-cle.html` |
| 1,5 s finales | **Outro** : logo CaniPlus + « caniplus.ch » | `outro-logo.html` |

## Cadrage et zones

- Tiffany cadrée **plein écran** (le rush remplit la frame, recadrer en 9:16 si
  filmé autrement)
- Textes animés dans le **tiers supérieur** : zone libre au-dessus de sa tête,
  environ y = 150 → 640 px
- Sous-titres karaoké : juste au-dessus du tiers inférieur, centrés,
  environ y = 1150 → 1400 px
- **Zones interdites** : bas de l'écran (y > 1550 px, interface TikTok :
  légende, boutons) et extrême haut (y < 150 px, barre système et pseudo)

## Règles de coupe

- Couper au niveau sonore réel (silence sous le seuil), pas aux mots
- Max ~0,2 s de blanc entre les phrases
- Phrase répétée = garder uniquement la dernière prise

## Rendu

1. `npx hyperframes render --quality draft` → V1 pour retours
2. Rendu final pleine qualité après validation, dans `renders/`
