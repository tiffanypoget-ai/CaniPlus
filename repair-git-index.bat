@echo off
REM =====================================================================
REM repair-git-index.bat
REM
REM Répare un index Git corrompu et nettoie le bruit de line endings
REM Suite au crash de `git add --renormalize` du 30 avril 2026.
REM
REM AVANT DE LANCER : ferme GitHub Desktop + ton IDE (VS Code, Cursor, etc.)
REM sinon le verrou .git/index.lock ne pourra pas être supprimé.
REM
REM Quand le script est fini, regarde la sortie. `git status` doit montrer :
REM   - .gitattributes (untracked, le nouveau fichier)
REM   - .gitignore (modified, mes nouveaux patterns d'ignore)
REM   - PEUT-ÊTRE quelques fichiers "modified" qui seront automatiquement
REM     normalisés en LF au prochain commit grâce au .gitattributes
REM
REM Aucune des modifications "fantômes" CRLF ne reviendra.
REM =====================================================================

cd /d "%~dp0"
echo.
echo === Etape 1 : suppression du verrou Git ===
if exist .git\index.lock (
    del /f /q .git\index.lock
    echo Verrou supprime.
) else (
    echo Pas de verrou (deja propre).
)

echo.
echo === Etape 2 : suppression de l'index corrompu ===
if exist .git\index (
    del /f /q .git\index
    echo Index supprime.
) else (
    echo Pas d'index trouve.
)

echo.
echo === Etape 3 : reconstruction de l'index depuis HEAD ===
git reset
if errorlevel 1 (
    echo.
    echo *** ERREUR pendant git reset ***
    echo Verifie que GitHub Desktop et ton IDE sont bien fermes.
    pause
    exit /b 1
)

echo.
echo === Etape 4 : application du .gitattributes (normalisation LF) ===
git add --renormalize . 2>nul
if errorlevel 1 (
    echo.
    echo Note : git add --renormalize a renvoye un avertissement.
    echo Pas grave, on continue.
)

echo.
echo === Etat final ===
git status --short
echo.
echo === Termine ===
echo.
echo Tu peux maintenant ouvrir GitHub Desktop pour committer/pusher
echo .gitattributes et .gitignore.
echo.
pause
