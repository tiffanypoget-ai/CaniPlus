"""Separation d'un fichier audio stereo en deux pistes mono.

Le DJI Mic Mini en mode stereo envoie TX1 sur le canal gauche et TX2
sur le canal droit. Ce module separe ces deux canaux en deux fichiers
mono distincts pour pouvoir editer chaque voix independamment.
"""
from pathlib import Path
import numpy as np
import soundfile as sf

from utils import log


def separer_stereo(chemin_audio: Path, dossier_sortie: Path,
                   noms_pistes: list[str]) -> tuple[Path, Path, int]:
    """Separe un fichier audio stereo en 2 fichiers mono.

    Args:
        chemin_audio: chemin vers le fichier WAV/MP3 stereo en entree.
        dossier_sortie: dossier ou ecrire les 2 fichiers mono.
        noms_pistes: [nom_canal_gauche, nom_canal_droit].

    Returns:
        (chemin_voix_gauche, chemin_voix_droite, frequence_echantillonnage)
    """
    log(f"Lecture de {chemin_audio.name}...", "etape")
    audio, sr = sf.read(str(chemin_audio), always_2d=True)
    duree_sec = len(audio) / sr
    log(f"Duree : {duree_sec:.1f}s, {audio.shape[1]} canaux, {sr} Hz", "info")

    # Cas 1 : mono — on duplique pour pas casser le pipeline mais on previent
    if audio.shape[1] == 1:
        log("Audio mono detecte (1 canal). Separation impossible.", "warn")
        log("Le pipeline va traiter une seule voix.", "info")
        nom_base = chemin_audio.stem
        chemin_unique = dossier_sortie / f"{nom_base}__{noms_pistes[0]}.wav"
        sf.write(str(chemin_unique), audio[:, 0], sr, subtype="PCM_24")
        return chemin_unique, chemin_unique, sr

    # Cas 2 : stereo (cas standard DJI Mic Mini)
    canal_gauche = audio[:, 0]
    canal_droit = audio[:, 1]

    # Verification : si les 2 canaux sont identiques, on previent (mono mixe)
    if np.allclose(canal_gauche, canal_droit, atol=1e-4):
        log("Les 2 canaux sont identiques (mono mixe).", "warn")
        log("Verifie que les Ameliorations audio Windows sont desactivees.", "warn")

    nom_base = chemin_audio.stem
    chemin_g = dossier_sortie / f"{nom_base}__{noms_pistes[0]}.wav"
    chemin_d = dossier_sortie / f"{nom_base}__{noms_pistes[1]}.wav"

    sf.write(str(chemin_g), canal_gauche, sr, subtype="PCM_24")
    sf.write(str(chemin_d), canal_droit, sr, subtype="PCM_24")

    log(f"{noms_pistes[0]} (canal G) -> {chemin_g.name}", "ok")
    log(f"{noms_pistes[1]} (canal D) -> {chemin_d.name}", "ok")

    return chemin_g, chemin_d, sr


if __name__ == "__main__":
    # Test rapide
    import sys
    if len(sys.argv) < 2:
        print("Usage : python splitter.py <fichier_audio>")
        sys.exit(1)
    fichier = Path(sys.argv[1])
    sortie = fichier.parent / "test_split"
    sortie.mkdir(exist_ok=True)
    separer_stereo(fichier, sortie, ["voix_g", "voix_d"])
