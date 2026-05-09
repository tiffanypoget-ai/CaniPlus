"""Transcription audio en texte via faster-whisper.

faster-whisper est une reimplementation de Whisper d'OpenAI 4x plus rapide,
qui tourne en local et en francais. On recupere chaque mot avec son timestamp
de debut et de fin, ce qui permet ensuite de couper precisement les "euh".
"""
from pathlib import Path
from dataclasses import dataclass, asdict
import json

from utils import log


@dataclass
class Mot:
    """Un mot transcrit avec son timing."""
    texte: str
    debut_s: float
    fin_s: float
    confiance: float


@dataclass
class Segment:
    """Un segment (phrase) transcrit, contient plusieurs mots."""
    texte: str
    debut_s: float
    fin_s: float
    mots: list[Mot]


def transcrire(chemin_audio: Path, dossier_sortie: Path,
               modele: str = "medium", langue: str = "fr",
               device: str = "auto",
               cache_dir: Path | None = None) -> list[Segment]:
    """Transcrit un fichier audio mono en segments + mots avec timestamps.

    Args:
        chemin_audio: fichier WAV mono a transcrire.
        dossier_sortie: ou ecrire la transcription JSON+TXT.
        modele: tiny/base/small/medium/large. Defaut medium.
        langue: code langue ISO. Defaut "fr".
        device: auto/cpu/cuda. Defaut auto.
        cache_dir: dossier pour stocker les modeles telecharges.

    Returns:
        Liste des segments transcrits.
    """
    from faster_whisper import WhisperModel

    log(f"Chargement modele Whisper '{modele}' (1ere fois = telechargement)...", "etape")

    # Choix du device
    if device == "auto":
        try:
            import torch
            device_choisi = "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            device_choisi = "cpu"
    else:
        device_choisi = device

    compute_type = "float16" if device_choisi == "cuda" else "int8"

    cache_str = str(cache_dir) if cache_dir else None
    model = WhisperModel(modele, device=device_choisi,
                          compute_type=compute_type,
                          download_root=cache_str)

    log(f"Transcription en {langue} sur {device_choisi}...", "etape")

    segments_iter, info = model.transcribe(
        str(chemin_audio),
        language=langue,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
    )

    segments_resultats = []
    for seg in segments_iter:
        mots = [Mot(texte=w.word.strip(), debut_s=w.start,
                    fin_s=w.end, confiance=w.probability)
                for w in (seg.words or [])]
        segments_resultats.append(Segment(
            texte=seg.text.strip(),
            debut_s=seg.start,
            fin_s=seg.end,
            mots=mots,
        ))

    log(f"{len(segments_resultats)} segments transcrits.", "ok")

    # Sauvegarde texte simple lisible humain
    nom_base = chemin_audio.stem
    chemin_txt = dossier_sortie / f"{nom_base}.txt"
    with open(chemin_txt, "w", encoding="utf-8") as f:
        for seg in segments_resultats:
            f.write(f"[{seg.debut_s:.1f}s] {seg.texte}\n")
    log(f"Transcription texte -> {chemin_txt.name}", "ok")

    # Sauvegarde JSON pour usage par les modules suivants
    chemin_json = dossier_sortie / f"{nom_base}.json"
    with open(chemin_json, "w", encoding="utf-8") as f:
        json.dump([asdict(s) for s in segments_resultats],
                  f, ensure_ascii=False, indent=2)

    return segments_resultats


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage : python transcriber.py <fichier_mono.wav>")
        sys.exit(1)
    fichier = Path(sys.argv[1])
    transcrire(fichier, fichier.parent, modele="base")
