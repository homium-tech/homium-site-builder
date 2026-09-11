#!/usr/bin/env bash
# =============================================================
# Homium Site Builder — Launcher para Linux & macOS
# =============================================================

cd "$(dirname "$0")"

echo "========================================================="
echo "  Iniciando Homium Site Builder..."
echo "========================================================="

if command -v pnpm >/dev/null 2>&1; then
  pnpm start
elif command -v npx >/dev/null 2>&1; then
  npx pnpm start
else
  node server.js
fi
