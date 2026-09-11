@echo off
REM =============================================================
REM Homium Site Builder — Launcher para Windows
REM =============================================================

title Homium Site Builder
cd /d "%~dp0"

echo =========================================================
echo   Iniciando Homium Site Builder en Windows...
echo =========================================================

where pnpm >nul 2>nul
if %errorlevel% equ 0 (
  call pnpm start
) else (
  where npx >nul 2>nul
  if %errorlevel% equ 0 (
    call npx pnpm start
  ) else (
    node server.js
  )
)

pause
