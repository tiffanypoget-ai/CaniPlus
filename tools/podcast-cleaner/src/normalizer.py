"""Normalisation loudness EBU R128 et export final WAV + MP3.

Les hebergeurs podcast (Spotify, Apple Podcasts, Ausha) recommandent une
loudness integree de -16 LUFS. pyloudnorm calcule la loudness reelle d'un
fichier (selon le standard EBU R128) et applique le gain necessaire pour
atteindre la cible.
"""
from pathlib import Path
import subprocess
import numpy as np
import soundfile as sf
import pyloudnorm as pyln

from utils import log


def normaliser_loudness(chemin_audio: Path, chemin_sortie: Path,
                        cible_lufs: float = -16.0) -> Path:
    """Normalise un fichier audio a la loudness cible (en LUFS).

    Args:
        chemin_audio: fichier WAV en entree.
        chemin_sortie: ou ecrire le WAV normalise.
        cible_lufs: loudness cible. -16 = standard podcast.

    Returns:
        chemin_sortie.
    """
    log(f"Normalisation a {cible_lufs} LUFS...", "etape")

    audio, sr = sf.read(str(chemin_audio))

    meter = pyln.Meter(sr)
    loudness_actuelle = meter.integrated_loudness(audio)
    log(f"Loudness actuelle : {loudness_actuelle:.1f} LUFS", "info")

    if np.isfinite(loudness_actuelle):
        audio_norm = pyln.normalize.loudness(audio, loudness_actuelle, cible_lufs)
    else:
        log("Impossible de calculer la loudness (audio trop silencieux ?). Pas de normalisation.", "warn")
        audio_norm = audio

    # Anti-clipping : si on depasse 1.0 (donc 0 dBFS), on rescale
    crete = float(np.max(np.abs(audio_norm))) if audio_norm.size else 0.0
    if crete > 0.99:
        log(f"Crete a {crete:.2f}, rescale leger pour eviter le clipping.", "warn")
        audio_norm = audio_norm * (0.99 / crete)

    sf.write(str(chemin_sortie), audio_norm, sr, subtype="PCM_16")
    log(f"Normalise -> {chemin_sortie.name}", "ok")
    return chemin_sortie


def melanger_pistes_mono(pistes: list[Path], chemin_sortie: Path,
                          panoramique_centre: bool = True) -> Path:
    """Melange plusieurs pistes mono en une piste stereo finale.

    Si panoramique_centre=True, chaque piste est mise au centre (auditeur
    entend toutes les voix au milieu de ses ecouteurs). C'est ce qu'on veut
    pour un podcast de discussion.

    Args:
        pistes: liste de fichiers mono a melanger.
        chemin_sortie: WAV de sortie (stereo).
        panoramique_centre: True = toutes voix au centre, False = pano L/R.

    Returns:
        chemin_sortie.
    """
    log(f"Melange de {len(pistes)} piste(s) en mix final...", "etape")

    pistes_audio = []
    sr_ref = None
    longueur_max = 0

    for p in pistes:
        audio, sr = sf.read(str(p))
        if audio.ndim > 1:
            audio = audio.mean(axis=1)  # force mono
        if sr_ref is None:
            sr_ref = sr
        elif sr != sr_ref:
            log(f"Frequence differente ({sr} vs {sr_ref}), resampling...", "warn")
            import librosa
            audio = librosa.resample(audio.astype(np.float32),
                                      orig_sr=sr, target_sr=sr_ref)
        pistes_audio.append(audio)
        longueur_max = max(longueur_max, len(audio))

    # Pad chaque piste pour avoir la meme longueur
    pistes_audio = [np.pad(p, (0, longueur_max - len(p))) for p in pistes_audio]

    if panoramique_centre or len(pistes_audio) == 1:
        # Somme simple, divisee pour eviter clipping
        mix = np.sum(pistes_audio, axis=0) / max(1, len(pistes_audio))
        # Stereo = mono dupliquee
        stereo = np.column_stack([mix, mix])
    else:
        # Repartition L/R selon nombre de pistes
        if len(pistes_audio) == 2:
            stereo = np.column_stack([pistes_audio[0], pistes_audio[1]])
        else:
            # Plus de 2 pistes : on fait un mix centre par defaut
            mix = np.sum(pistes_audio, axis=0) / len(pistes_audio)
            stereo = np.column_stack([mix, mix])

    sf.write(str(chemin_sortie), stereo, sr_ref, subtype="PCM_24")
    log(f"Mix final -> {chemin_sortie.name}", "ok")
    return chemin_sortie


def exporter_mp3(chemin_wav: Path, chemin_mp3: Path,
                 bitrate: str = "192k") -> Path:
    """Convertit un WAV en MP3 via ffmpeg.

    Args:
        chemin_wav: fichier WAV en entree.
        chemin_mp3: fichier MP3 de sortie.
        bitrate: "128k", "192k", "256k", "320k". Defaut "192k" (qualite podcast).

    Returns:
        chemin_mp3.
    """
    log(f"Export MP3 ({bitrate})...", "etape")
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(chemin_wav),
        "-c:a", "libmp3lame", "-b:a", bitrate,
        str(chemin_mp3),
    ]
    subprocess.run(cmd, check=True)
    log(f"MP3 -> {chemin_mp3.name}", "ok")
    return chemin_mp3


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage : python normalizer.py <fichier.wav>")
        sys.exit(1)
    fichier = Path(sys.argv[1])
    sortie_norm = fichier.parent / (fichier.stem + "_norm.wav")
    normaliser_loudness(fichier, sortie_norm, -16.0)
    sortie_mp3 = sortie_norm.with_suffix(".mp3")
    exporter_mp3(sortie_norm, sortie_mp3)
