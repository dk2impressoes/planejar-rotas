@echo off
rem (c) 2026 Grupo DK2 - Planejar Rotas com Checklist. Forjada para programar o futuro.
chcp 65001 >nul
title Planejar Rotas - instalacao
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
echo.
pause
