# Podcast Cleaner — CaniPlus

Outil local pour nettoyer automatiquement tes enregistrements podcast :

- Sépare les voix du DJI Mic Mini (TX1 sur canal G, TX2 sur canal D) en deux pistes mono
- Réduit le bruit de fond (souffle, ventilation, ambiance)
- Transcrit ce qui est dit (Whisper, en français, 100 % en local)
- Détecte et supprime les "euh", "ben", "bah", "alors voilà", etc.
- Raccourcit les silences trop longs (3 sec → 0,5 sec)
- Normalise à -16 LUFS (standard Spotify / Apple Podcasts)
- Exporte le résultat en WAV + MP3 prêt à publier

Tout tourne **sur ton PC**, sans envoi cloud. Gratuit et illimité.

---

## Installation (à faire une seule fois)

### 1. Vérifier que Python est installé

Ouvre une fenêtre PowerShell ou CMD et tape :

```
python --version
```

Si tu vois quelque chose comme `Python 3.11.x`, c'est bon. Sinon télécharge Python ici : https://www.python.org/downloads/ — **important** : pendant l'installation, coche la case "Add Python to PATH".

### 2. Lancer install.bat

Double-clique sur `install.bat`. Ça va :
- Vérifier ffmpeg (et l'installer via winget si besoin)
- Créer un environnement Python isolé (dossier `venv/`)
- Installer toutes les dépendances (numpy, faster-whisper, noisereduce, etc.)
- Pré-télécharger le modèle Whisper "medium" français (~1,5 Go, à faire une fois)

Compte 5 à 10 minutes la première fois (selon ta connexion).

---

## Utilisation au quotidien

### Méthode 1 : drag & drop

1. Glisse ton fichier audio (WAV, MP3, M4A, FLAC) directement sur `clean.bat`
2. Le traitement démarre, attend la fin
3. Récupère le résultat dans `output/`

### Méthode 2 : par lot (plusieurs fichiers)

1. Mets tous tes fichiers à traiter dans le dossier `input/`
2. Double-clique sur `clean.bat`
3. Tous les fichiers sont traités à la suite

---

## Ce que tu trouves dans `output/` après traitement

Pour un fichier d'entrée `episode01.wav`, tu obtiens :

- `output/episode01_FINAL.wav` — **le fichier final stéréo mixé et normalisé**
- `output/episode01_FINAL.mp3` — version MP3 prête à publier
- `output/voix-separees/episode01_Tiffany_nettoyee.wav` — ta voix isolée et nettoyée
- `output/voix-separees/episode01_Invite_nettoyee.wav` — voix de l'invité isolée et nettoyée
- `output/transcriptions/episode01__Tiffany.txt` — transcription texte de ta voix
- `output/transcriptions/episode01__Invite.txt` — transcription texte de l'invité

Les transcriptions sont pratiques pour faire un résumé d'épisode, des shownotes, ou un article de blog à partir du podcast.

---

## Personnalisation : `config.json`

Ouvre `config.json` avec un éditeur de texte (Bloc-notes, VS Code) pour modifier :

- **Noms des pistes** (`voix.noms_pistes`) : remplace `["Tiffany", "Invite"]` par les vrais prénoms
- **Agressivité débruitage** (`reduction_bruit.agressivite`) : entre 0.0 (rien) et 1.0 (max). Défaut 0.8.
- **Loudness cible** (`audio.loudness_cible_lufs`) : -16 pour podcast standard, -14 pour streaming musical
- **Liste des mots à couper** (`mots_remplissage.liste_a_couper`) : ajoute tes propres tics de langage
- **Modèle Whisper** (`whisper.modele`) : `tiny` (rapide), `base`, `small`, `medium` (recommandé), `large` (qualité max mais lent)

---

## Performance

Sur ton HP Pavilion x360, compte environ :
- **5 minutes de traitement par 30 minutes d'audio** avec le modèle Whisper "medium"
- **2 minutes** avec "small" si tu veux gagner du temps en sacrifiant un peu la précision

Tu peux laisser tourner en arrière-plan pendant que tu fais autre chose.

---

## Si quelque chose ne marche pas

### "Python n'est pas reconnu"
Réinstalle Python en cochant bien "Add Python to PATH" pendant l'install.

### "ffmpeg n'est pas reconnu"
Installe ffmpeg via PowerShell admin :
```
winget install -e --id Gyan.FFmpeg
```
Puis redémarre la fenêtre.

### "Erreur de mémoire" ou "le PC rame"
Passe le modèle Whisper de `medium` à `small` ou `base` dans `config.json`.

### "Les 2 voix sont identiques sur la sortie"
Vérifie dans Windows : Paramètres → Système → Son → DJI Mic Mini → Améliorations audio = **Désactivé**.

### "Le programme coupe trop de mots"
Réduis la liste dans `config.json` → `mots_remplissage.liste_a_couper`. Ou désactive complètement avec `"active": false`.

---

## Architecture du projet

```
podcast-cleaner/
├── README.md            (ce fichier)
├── install.bat          (installation Windows)
├── clean.bat            (lancement traitement)
├── config.json          (paramètres modifiables)
├── requirements.txt     (dépendances Python)
├── input/               (déposer les audio bruts ici)
├── output/              (résultats finaux)
│   ├── voix-separees/   (chaque voix isolée nettoyée)
│   └── transcriptions/  (transcriptions texte)
├── cache/               (modèles Whisper téléchargés)
└── src/
    ├── main.py             (orchestre le pipeline)
    ├── splitter.py         (étape 1 : sépare stéréo en mono)
    ├── denoiser.py         (étape 2 : réduit le bruit)
    ├── transcriber.py      (étape 3 : transcrit avec Whisper)
    ├── filler_detector.py  (étape 4 : repère les "euh")
    ├── silence_cutter.py   (étape 5 : raccourcit les silences)
    ├── normalizer.py       (étape 6 : normalise + exporte MP3)
    └── utils.py            (helpers communs)
```

---

## Tester un module isolé

Si tu veux tester un seul module sans lancer tout le pipeline :

```
venv\Scripts\activate
python src\splitter.py mon_audio.wav
python src\denoiser.py mon_audio_mono.wav
python src\transcriber.py mon_audio_mono.wav
python src\silence_cutter.py mon_audio_mono.wav
python src\normalizer.py mon_audio.wav
```
