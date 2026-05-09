"""Reduction du bruit de fond via noisereduce (algo spectral).

noisereduce identifie le profil du bruit (souffle, climatiseur, bruit ambiant
constant) et l'attenue tout en preservant la voix. C'est une des bibliotheques
les plus efficaces pour la voix humaine, sans modele IA lourd.
"""
from pathlib import Path
import numpy as np
import soundfile as sf
import noisereduce as nr

from utils import log


def reduire_bruit(chemin_audio: Path, dossier_sortie: Path,
                  agressivite: float = 0.8) -> Path:
    """Applique une reduction de bruit non-stationnaire sur un fichier mono.

    Args:
        chemin_audio: chemin vers le fichier WAV mono.
        dossier_sortie: ou ecrire le resultat.
        agressivite: 0.0 (rien) a 1.0 (max). Defaut 0.8.

    Returns:
        chemin du fichier debruitee.
    """
    log(f"Debruitage de {chemin_audio.name}...", "etape")

    audio, sr = sf.read(str(chemin_audio))

    # noisereduce attend du float32 mono
    if audio.dtype != np.float32:
        audio = audio.astype(np.float32)

    # Mode non-stationnaire : detecte les bruits qui evoluent dans le temps
    # (parfait pour podcast a la maison ou les conditions changent)
    audio_propre = nr.reduce_noise(
        y=audio,
        sr=sr,
        stationary=False,
        prop_decrease=agressivite,
    )

    nom_sortie = chemin_audio.stem + "_propre.wav"
    chemin_sortie = dossier_sortie / nom_sortie
    sf.write(str(chemin_sortie), audio_propre, sr, subtype="PCM_24")

    log(f"Debruite -> {chemin_sortie.name}", "ok")
    return chemin_sortie


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage : python denoiser.py <fichier_mono.wav>")
        sys.exit(1)
    fichier = Path(sys.argv[1])
    reduire_bruit(fichier, fichier.parent, 0.8)
