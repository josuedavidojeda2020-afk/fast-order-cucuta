@echo off
title Fast Order Cucuta - Servidor en Tiempo Real + WhatsApp QR
cd /d "%~dp0"
echo ====================================================================
echo   INICIANDO SERVIDOR DE FAST ORDER CUCUTA (PUERTO 3000)
echo ====================================================================
start "" "http://localhost:3000"
node server.js
pause
