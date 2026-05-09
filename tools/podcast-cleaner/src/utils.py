"""Utilitaires communs au pipeline."""
from pathlib import Path
import json
import sys


def charger_config(chemin_config: Path) -> dict:
    """Lit le config.json a la racine du projet."""
    with open(chemin_config, "r", encoding="utf-8") as f:
        return json.load(f)


def log(message: str, niveau: str = "info"):
    """Log avec emoji pour repere visuel.
    Niveaux : info, ok, warn, err, etape."""
    prefixes = {
        "info": "  ",
        "ok":   "[OK] ",
        "warn": "[!]  ",
        "err":  "[X]  ",
        "etape": "==> ",
    }
    print(f"{prefixes.get(niveau, '  ')}{message}", flush=True)


def racine_projet() -> Path:
    """Retourne le dossier racine du projet (parent de src/)."""
    return Path(__file__).resolve().parent.parent


def s_assurer_dossier(chemin: Path) -> Path:
    """Cree le dossier s'il n'existe pas. Retourne le chemin."""
    chemin = Path(chemin)
    chemin.mkdir(parents=True, exist_ok=True)
    return chemin
