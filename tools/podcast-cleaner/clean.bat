@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "venv\Scripts\activate.bat" (
    echo [X] Le programme n'est pas installe. Lance d'abord install.bat.
    pause
    exit /b 1
)

call venv\Scripts\activate.bat

REM Si un fichier a ete glisse sur le .bat, on le traite directement
if not "%~1"=="" (
    python src\main.py "%~1"
    pause
    exit /b 0
)

REM Sinon on traite tous les fichiers du dossier input/
python src\main.py
pause
