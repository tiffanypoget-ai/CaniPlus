@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ============================================
echo  Installation Podcast Cleaner pour CaniPlus
echo ============================================
echo.

REM Verifier Python
where python >nul 2>nul
if errorlevel 1 (
    echo [X] Python n'est pas installe sur ton PC.
    echo.
    echo Telecharge Python ici : https://www.python.org/downloads/
    echo IMPORTANT : pendant l'installation, coche "Add Python to PATH" !
    echo.
    pause
    exit /b 1
)

for /f "tokens=2" %%V in ('python --version 2^>^&1') do set PYVER=%%V
echo [OK] Python !PYVER! detecte.
echo.

REM Verifier ffmpeg
where ffmpeg >nul 2>nul
if errorlevel 1 (
    echo [!] ffmpeg n'est pas installe.
    echo.
    echo Je vais essayer de l'installer via winget...
    winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
    if errorlevel 1 (
        echo.
        echo [X] Installation auto echouee. Telecharge ffmpeg manuellement :
        echo https://www.gyan.dev/ffmpeg/builds/
        echo Choisis "release essentials build" puis ajoute le dossier bin au PATH.
        pause
        exit /b 1
    )
    echo.
    echo [!] ffmpeg installe. Ferme et rouvre cette fenetre puis relance install.bat.
    pause
    exit /b 0
)
echo [OK] ffmpeg detecte.
echo.

REM Creer environnement virtuel
if not exist "venv" (
    echo Creation de l'environnement Python isole...
    python -m venv venv
    if errorlevel 1 (
        echo [X] Impossible de creer le venv.
        pause
        exit /b 1
    )
    echo [OK] venv cree.
    echo.
)

REM Activer venv
call venv\Scripts\activate.bat

REM Mettre a jour pip
echo Mise a jour de pip...
python -m pip install --upgrade pip --quiet
echo [OK] pip a jour.
echo.

REM Installer dependances
echo Installation des dependances Python (peut prendre 5-10 min)...
echo Patiente, ne ferme pas cette fenetre.
echo.
pip install -r requirements.txt
if errorlevel 1 (
    echo [X] Erreur lors de l'installation des dependances.
    pause
    exit /b 1
)
echo.
echo [OK] Toutes les dependances installees.
echo.

REM Telecharger le modele Whisper en avance pour eviter l'attente au premier usage
echo Pre-telechargement du modele Whisper (peut prendre quelques minutes)...
python -c "from faster_whisper import WhisperModel; m = WhisperModel('medium', device='cpu', download_root='./cache')"
if errorlevel 1 (
    echo [!] Pre-telechargement Whisper rate, mais ce n'est pas grave : il sera telecharge au premier usage.
)
echo.

echo ============================================
echo  Installation terminee !
echo ============================================
echo.
echo Pour utiliser le programme :
echo  1. Glisse ton fichier audio dans le dossier "input/"
echo  2. Double-clique sur "clean.bat"
echo  3. Recupere le resultat dans "output/"
echo.
pause
