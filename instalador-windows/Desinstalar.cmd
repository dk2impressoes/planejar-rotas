@echo off
rem (c) 2026 Grupo DK2 - Planejar Rotas com Checklist. DK2 forjada para programar o futuro.
chcp 65001 >nul
title Planejar Rotas - remover
echo Isto remove o Planejar Rotas deste computador.
echo As viagens salvas ficam no navegador (veja o LEIA-ME).
choice /m "Deseja continuar"
if errorlevel 2 exit /b
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0desinstalar.ps1"
pause
