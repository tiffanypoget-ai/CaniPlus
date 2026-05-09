"""Pipeline principal podcast-cleaner.

Orchestre toutes les etapes du nettoyage podcast :
1. Lecture config + fichier audio
2. Separation stereo en 2 pistes mono
3. Reduction de bruit sur chaque piste
4. Transcription Whisper
5. Detection des "euh" + raccourcissement des silences
6. Coupe des intervalles indesirables
7. Mix final + normalisation -16 LUFS
8. Export WAV + MP3
"""
from pathlib import Path
import sys
import shutil
import time
import traceback

# Ajouter le dossier src au path pour les imports
sys.path.insert(0, str(Path(__file__).resolve().parent))

from utils import charger_config, log, racine_projet, s_assurer_dossier
from splitter import separer_stereo
from denoiser import reduire_bruit
from transcriber import transcrire
from filler_detector import detecter_mots_remplissage
from silence_cutter import (
    detecter_silences_a_raccourcir,
    construire_intervalles_a_couper_pour_silences,
    couper_intervalles_dans_audio,
)
from normalizer import normaliser_loudness, melanger_pistes_mono, exporter_mp3


EXTENSIONS_AUDIO = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac"}


def traiter_fichier(chemin_audio: Path, config: dict, racine: Path) -> Path:
    """Traite un fichier audio et retourne le chemin du fichier final.
    Continue meme si une etape echoue (mode degrade)."""
    log("=" * 60, "info")
    log(f"DEBUT TRAITEMENT : {chemin_audio.name}", "etape")
    log("=" * 60, "info")
    debut = time.time()

    # Dossiers
    dossier_voix = s_assurer_dossier(racine / "output" / "voix-separees")
    dossier_trans = s_assurer_dossier(racine / "output" / "transcriptions")
    dossier_temp = s_assurer_dossier(racine / "output" / "_temp")
    dossier_final = s_assurer_dossier(racine / "output")
    cache = s_assurer_dossier(racine / "cache")

    nom_base = chemin_audio.stem

    # ETAPE 1 : Separation stereo -> 2 mono
    noms_pistes = config["voix"]["noms_pistes"]
    chemin_g, chemin_d, sr = separer_stereo(chemin_audio, dossier_voix, noms_pistes)
    pistes = [chemin_g, chemin_d] if chemin_g != chemin_d else [chemin_g]

    pistes_finales = []

    for i, piste_brute in enumerate(pistes):
        nom_piste = noms_pistes[i] if i < len(noms_pistes) else f"voix{i+1}"
        log("", "info")
        log(f"--- Traitement piste : {nom_piste} ---", "etape")

        piste_courante = piste_brute

        # ETAPE 2 : Reduction bruit
        if config["reduction_bruit"]["active"]:
            try:
                piste_courante = reduire_bruit(
                    piste_courante, dossier_temp,
                    agressivite=config["reduction_bruit"]["agressivite"]
                )
            except Exception as e:
                log(f"Echec reduction bruit : {e}. Passe.", "warn")

        # ETAPE 3 : Transcription
        intervalles_remplissage = []
        if config["mots_remplissage"]["active"]:
            try:
                segments = transcrire(
                    piste_courante, dossier_trans,
                    modele=config["whisper"]["modele"],
                    langue=config["whisper"]["langue"],
                    device=config["whisper"]["device"],
                    cache_dir=cache,
                )
                # ETAPE 4 : Detection mots remplissage
                intervalles_remplissage = detecter_mots_remplissage(
                    segments,
                    config["mots_remplissage"]["liste_a_couper"],
                    marge_avant_ms=config["mots_remplissage"]["marge_avant_ms"],
                    marge_apres_ms=config["mots_remplissage"]["marge_apres_ms"],
                    confiance_min=config["mots_remplissage"].get("confiance_min", 0.65),
                    duree_min_ms=config["mots_remplissage"].get("duree_min_ms", 150),
                )
            except Exception as e:
                log(f"Echec transcription/detection : {e}. On continue sans.", "warn")
                traceback.print_exc()

        # ETAPE 5 : Detection silences a raccourcir
        intervalles_silences = []
        if config["silences"]["active"]:
            try:
                silences = detecter_silences_a_raccourcir(
                    piste_courante,
                    duree_min_silence_ms=config["silences"]["duree_min_silence_ms"],
                    seuil_db=config["silences"].get("seuil_db", -45.0),
                )
                intervalles_silences = construire_intervalles_a_couper_pour_silences(
                    silences,
                    duree_max_apres_coupe_ms=config["silences"]["duree_max_silence_apres_coupe_ms"],
                )
                log(f"{len(intervalles_silences)} silence(s) trop long(s) detectes.", "info")
            except Exception as e:
                log(f"Echec detection silences : {e}. Passe.", "warn")

        # ETAPE 6 : Coupe combinee
        tous_intervalles = intervalles_remplissage + intervalles_silences
        if tous_intervalles:
            piste_coupee = dossier_temp / f"{nom_base}_{nom_piste}_coupe.wav"
            crossfade_ms = config.get("silences", {}).get("crossfade_ms", 50)
            piste_courante = couper_intervalles_dans_audio(
                piste_courante, tous_intervalles, piste_coupee,
                crossfade_ms=crossfade_ms
            )

        # Sauvegarde piste mono nettoyee dans output (utile si Tiffany veut editer apres)
        nom_propre = f"{nom_base}_{nom_piste}_nettoyee.wav"
        piste_propre_finale = dossier_voix / nom_propre
        shutil.copy(str(piste_courante), str(piste_propre_finale))
        pistes_finales.append(piste_propre_finale)

    # ETAPE 7 : Mix final stereo + normalisation
    log("", "info")
    log("--- Finalisation ---", "etape")
    mix_brut = dossier_temp / f"{nom_base}_mix.wav"
    melanger_pistes_mono(pistes_finales, mix_brut, panoramique_centre=True)

    mix_norm_wav = dossier_final / f"{nom_base}_FINAL.wav"
    normaliser_loudness(mix_brut, mix_norm_wav,
                          cible_lufs=config["audio"]["loudness_cible_lufs"])

    # ETAPE 8 : Export MP3
    if config["audio"]["exporter_aussi_mp3"]:
        try:
            mix_mp3 = dossier_final / f"{nom_base}_FINAL.mp3"
            exporter_mp3(mix_norm_wav, mix_mp3,
                         bitrate=config["audio"]["bitrate_mp3"])
        except Exception as e:
            log(f"Echec export MP3 : {e}. Le WAV est dispo.", "warn")

    # Nettoyage des fichiers temp
    try:
        shutil.rmtree(dossier_temp)
    except Exception:
        pass

    duree = time.time() - debut
    log("", "info")
    log("=" * 60, "info")
    log(f"TERMINE en {duree:.0f}s ({duree/60:.1f} min)", "ok")
    log(f"Resultat : {mix_norm_wav.name}", "ok")
    log("=" * 60, "info")

    return mix_norm_wav


def main():
    racine = racine_projet()
    config = charger_config(racine / "config.json")

    # Mode 1 : un fichier passe en argument
    if len(sys.argv) > 1:
        fichiers = [Path(sys.argv[1])]
    else:
        # Mode 2 : tous les fichiers du dossier input/
        dossier_input = racine / "input"
        fichiers = [f for f in dossier_input.iterdir()
                    if f.is_file() and f.suffix.lower() in EXTENSIONS_AUDIO]

    if not fichiers:
        log("Aucun fichier audio a traiter.", "warn")
        log(f"Glisse tes fichiers dans : {racine / 'input'}", "info")
        return

    log(f"{len(fichiers)} fichier(s) a traiter.", "info")

    for f in fichiers:
        try:
            traiter_fichier(f, config, racine)
        except Exception as e:
            log(f"Erreur fatale sur {f.name} : {e}", "err")
            traceback.print_exc()


if __name__ == "__main__":
    main()
