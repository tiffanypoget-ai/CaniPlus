"""Detection des mots de remplissage avec mode doux.

Mode doux par rapport a la version precedente :
- Marges 150ms avant / 200ms apres (au lieu de 50/50) pour ne pas tronquer les mots voisins
- Filtre par confiance Whisper > 0.65 pour eviter les faux positifs
- Ignore les fillers plus courts que 150ms (ce sont souvent des respirations)
- Liste plus restrictive : seulement les vrais "euh" indubitables
"""
from pathlib import Path
import re
import unicodedata

from utils import log


def normaliser_mot(mot: str) -> str:
    """Met en minuscule et retire les accents/ponctuation pour comparaison."""
    mot = mot.lower().strip()
    mot = "".join(c for c in unicodedata.normalize("NFD", mot)
                  if unicodedata.category(c) != "Mn")
    mot = re.sub(r"[^\w]", "", mot)
    return mot


def detecter_mots_remplissage(segments: list, mots_a_couper: list[str],
                                marge_avant_ms: int = 150,
                                marge_apres_ms: int = 200,
                                confiance_min: float = 0.65,
                                duree_min_ms: int = 150) -> list[tuple[float, float]]:
    """Identifie les mots de remplissage et retourne les intervalles a couper.

    Mode doux : on est plus prudent pour eviter de couper de vrais mots.

    Args:
        segments: liste de Segment retournes par transcribe().
        mots_a_couper: liste des mots/expressions consideres comme remplissage.
        marge_avant_ms: marge avant chaque coupe. Defaut 150ms (mode doux).
        marge_apres_ms: marge apres chaque coupe. Defaut 200ms (mode doux).
        confiance_min: confiance Whisper minimale pour considerer la detection. Defaut 0.65.
        duree_min_ms: ignorer les fillers plus courts que ca (respirations). Defaut 150ms.

    Returns:
        Liste de tuples (debut_seconde, fin_seconde) a supprimer.
    """
    log("Detection des mots de remplissage (mode doux)...", "etape")

    mots_simples = set()
    expressions = []
    for m in mots_a_couper:
        normalise = normaliser_mot(m)
        if " " in m.strip():
            expressions.append([normaliser_mot(w) for w in m.split()])
        else:
            mots_simples.add(normalise)

    intervalles_a_couper = []
    nb_detections = 0
    nb_ignores_confiance = 0
    nb_ignores_courts = 0

    for seg in segments:
        mots = seg.mots if hasattr(seg, "mots") else seg.get("mots", [])

        for i, mot in enumerate(mots):
            mot_texte = mot.texte if hasattr(mot, "texte") else mot["texte"]
            mot_debut = mot.debut_s if hasattr(mot, "debut_s") else mot["debut_s"]
            mot_fin = mot.fin_s if hasattr(mot, "fin_s") else mot["fin_s"]
            mot_conf = mot.confiance if hasattr(mot, "confiance") else mot.get("confiance", 1.0)

            mot_norm = normaliser_mot(mot_texte)
            duree_mot_ms = (mot_fin - mot_debut) * 1000

            # Verif mot simple
            if mot_norm in mots_simples:
                # Filtre par confiance
                if mot_conf < confiance_min:
                    nb_ignores_confiance += 1
                    continue
                # Filtre par duree min
                if duree_mot_ms < duree_min_ms:
                    nb_ignores_courts += 1
                    continue

                debut = max(0, mot_debut - marge_avant_ms / 1000)
                fin = mot_fin + marge_apres_ms / 1000
                intervalles_a_couper.append((debut, fin))
                nb_detections += 1
                continue

            # Verif expressions (plusieurs mots consecutifs)
            for expr in expressions:
                if i + len(expr) <= len(mots):
                    suite_norm = [normaliser_mot(
                        m.texte if hasattr(m, "texte") else m["texte"]
                    ) for m in mots[i:i + len(expr)]]
                    if suite_norm == expr:
                        # Confiance moyenne sur l'expression
                        confs = [
                            (m.confiance if hasattr(m, "confiance") else m.get("confiance", 1.0))
                            for m in mots[i:i + len(expr)]
                        ]
                        conf_moy = sum(confs) / len(confs)
                        if conf_moy < confiance_min:
                            nb_ignores_confiance += 1
                            break

                        last_mot = mots[i + len(expr) - 1]
                        last_fin = (last_mot.fin_s if hasattr(last_mot, "fin_s")
                                    else last_mot["fin_s"])
                        debut = max(0, mot_debut - marge_avant_ms / 1000)
                        fin = last_fin + marge_apres_ms / 1000
                        intervalles_a_couper.append((debut, fin))
                        nb_detections += 1
                        break

    # Fusion des intervalles qui se chevauchent ou sont tres proches (<300ms)
    intervalles_a_couper.sort()
    fusionnes = []
    for debut, fin in intervalles_a_couper:
        if fusionnes and debut <= fusionnes[-1][1] + 0.3:
            fusionnes[-1] = (fusionnes[-1][0], max(fusionnes[-1][1], fin))
        else:
            fusionnes.append((debut, fin))

    duree_coupee = sum(fin - debut for debut, fin in fusionnes)
    log(f"{nb_detections} mots remplissage coupes, "
        f"{nb_ignores_confiance} ignores (faible confiance), "
        f"{nb_ignores_courts} ignores (trop courts).", "ok")
    log(f"-> {len(fusionnes)} intervalles, {duree_coupee:.1f}s a supprimer.", "info")

    return fusionnes


if __name__ == "__main__":
    import sys, json
    if len(sys.argv) < 2:
        print("Usage : python filler_detector.py <transcription.json>")
        sys.exit(1)
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        segs = json.load(f)
    mots = ["euh", "euhm", "heu", "hum"]
    intervalles = detecter_mots_remplissage(segs, mots)
    for d, f in intervalles[:10]:
        print(f"  Couper {d:.2f}s -> {f:.2f}s")
