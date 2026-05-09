@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Suppression des fichiers de test laisses par Claude pendant le dev...
del /f /q "input\test_*" 2>nul
del /f /q "output\test_*" 2>nul
del /f /q "output\voix-separees\test_*" 2>nul
del /f /q "output\transcriptions\test_*" 2>nul
rmdir /s /q "input\test_split" 2>nul
rmdir /s /q "output\_temp" 2>nul
echo Nettoyage termine.
pause
