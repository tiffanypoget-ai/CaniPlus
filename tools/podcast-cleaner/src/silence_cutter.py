"""Detection des silences trop longs et raccourcissement automatique.

Mode doux : on garde 800ms de respiration naturelle apres coupe (au lieu de 500ms),
et on applique un crossfade de 50ms aux jonctions pour eviter tout clic audible.
"""
from pathlib import Path
import numpy as np
import soundfile as sf
from pydub import AudioSegment, silence

from utils import log


def detecter_silences_a_raccourcir(chemin_audio: Path,
                                     duree_min_silence_ms: int = 1500,
                                     seuil_db: float = -45.0) -> list[tuple[int, int]]:
    """Detecte les silences plus longs que duree_min dans un audio.

    Args:
        chemin_audio: fichier WAV mono.
        duree_min_silence_ms: silence minimal a considerer (ms). Defaut 1500ms (mode doux).
        seuil_db: en-dessous de ce niveau, c'est du silence. Defaut -45 dB (plus strict).

    Returns:
        Liste de tuples (debut_ms, fin_ms) des silences detectes.
    """
    audio = AudioSegment.from_file(str(chemin_audio))
    silences = silence.detect_silence(
        audio,
        min_silence_len=duree_min_silence_ms,
        silence_thresh=seuil_db,
    )
    return silences


def construire_intervalles_a_couper_pour_silences(
    silences: list[tuple[int, int]],
    duree_max_apres_coupe_ms: int = 800,
) -> list[tuple[float, float]]:
    """Pour chaque silence detecte, calcule la portion a couper.

    On garde duree_max_apres_coupe_ms au debut du silence (respiration naturelle)
    et on coupe le reste.

    Returns:
        Liste de (debut_s, fin_s) en secondes.
    """
    a_couper = []
    for debut_ms, fin_ms in silences:
        duree_silence = fin_ms - debut_ms
        if duree_silence <= duree_max_apres_coupe_ms:
            continue
        debut_coupe = debut_ms + duree_max_apres_coupe_ms
        fin_coupe = fin_ms
        a_couper.append((debut_coupe / 1000.0, fin_coupe / 1000.0))
    return a_couper


def couper_intervalles_dans_audio(chemin_audio: Path,
                                    intervalles_a_couper: list[tuple[float, float]],
                                    chemin_sortie: Path,
                                    crossfade_ms: int = 50) -> Path:
    """Supprime les intervalles specifies de l'audio avec crossfade aux jonctions.

    Args:
        chemin_audio: fichier WAV en entree.
        intervalles_a_couper: liste de (debut_s, fin_s) a supprimer.
        chemin_sortie: ou ecrire le resultat.
        crossfade_ms: duree du fondu enchaine aux jonctions. Defaut 50ms (mode doux).

    Returns:
        chemin_sortie.
    """
    audio, sr = sf.read(str(chemin_audio))

    if not intervalles_a_couper:
        sf.write(str(chemin_sortie), audio, sr, subtype="PCM_24")
        return chemin_sortie

    # Trier et fusionner les intervalles
    intervalles = sorted(intervalles_a_couper)
    fusionnes = []
    for d, f in intervalles:
        if fusionnes and d <= fusionnes[-1][1]:
            fusionnes[-1] = (fusionnes[-1][0], max(fusionnes[-1][1], f))
        else:
            fusionnes.append((d, f))

    duree_totale_s = len(audio) / sr
    portions_garder = []
    curseur = 0.0
    for d, f in fusionnes:
        d = max(0.0, min(d, duree_totale_s))
        f = max(0.0, min(f, duree_totale_s))
        if d > curseur:
            portions_garder.append((curseur, d))
        curseur = max(curseur, f)
    if curseur < duree_totale_s:
        portions_garder.append((curseur, duree_totale_s))

    # Crossfade en cosinus pour eviter les clics et adoucir les transitions
    cf_samples = int((crossfade_ms / 1000.0) * sr)

    morceaux = []
    for d, f in portions_garder:
        i_d = int(d * sr)
        i_f = int(f * sr)
        morceau = audio[i_d:i_f].copy().astype(np.float64)

        if len(morceau) > 2 * cf_samples and cf_samples > 0:
            # Fenetre cosinus (plus douce que linear) sur le crossfade
            fade = 0.5 * (1 - np.cos(np.linspace(0, np.pi, cf_samples)))

            if morceau.ndim == 1:
                morceau[:cf_samples] *= fade
                morceau[-cf_samples:] *= fade[::-1]
            else:
                morceau[:cf_samples] *= fade[:, None]
                morceau[-cf_samples:] *= fade[::-1][:, None]

        morceaux.append(morceau.astype(audio.dtype))

    if morceaux:
        resultat = np.concatenate(morceaux)
    else:
        resultat = np.zeros(1, dtype=audio.dtype)

    sf.write(str(chemin_sortie), resultat, sr, subtype="PCM_24")

    duree_apres = len(resultat) / sr
    log(f"Apres coupes : {duree_totale_s:.1f}s -> {duree_apres:.1f}s "
        f"(-{duree_totale_s - duree_apres:.1f}s, crossfade {crossfade_ms}ms)", "ok")

    return chemin_sortie


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage : python silence_cutter.py <fichier_mono.wav>")
        sys.exit(1)
    fichier = Path(sys.argv[1])
    silences = detecter_silences_a_raccourcir(fichier, 1500)
    intervalles = construire_intervalles_a_couper_pour_silences(silences, 800)
    sortie = fichier.parent / (fichier.stem + "_no_silence.wav")
    couper_intervalles_dans_audio(fichier, intervalles, sortie, crossfade_ms=50)
