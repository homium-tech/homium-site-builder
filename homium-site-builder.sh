#!/usr/bin/env bash
# =============================================================================
# homium-site-builder — CLI wrapper
# =============================================================================

INSTALL_DIR="${HOME}/.homium-site-builder"
PID_FILE="${INSTALL_DIR}/.server.pid"
PORT="${PORT:-8080}"
VERSION="1.1.0"

GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}✓${RESET} $*"; }
info() { echo -e "${CYAN}→${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
err()  { echo -e "${RED}✗${RESET} $*" >&2; }

_is_running() {
  [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

_start() {
  if _is_running; then
    warn "El servidor ya está corriendo (PID $(cat "$PID_FILE")) en http://localhost:${PORT}"
    return 0
  fi

  if [[ ! -f "${INSTALL_DIR}/server.js" ]]; then
    err "Instalación no encontrada en ${INSTALL_DIR}"
    echo -e "  Reinstala con: ${CYAN}curl -sSL https://raw.githubusercontent.com/homium-tech/homium-site-builder/main/install.sh | bash${RESET}"
    exit 1
  fi

  info "Iniciando homium-site-builder en http://localhost:${PORT} ..."
  cd "$INSTALL_DIR" || exit 1

  nohup node server.js > "${INSTALL_DIR}/server.log" 2>&1 &
  echo $! > "$PID_FILE"

  # Esperar hasta 5 segundos a que el servidor responda
  for i in {1..10}; do
    sleep 0.5
    if curl -sf "http://localhost:${PORT}" -o /dev/null 2>/dev/null; then
      ok "Servidor activo en http://localhost:${PORT}"
      echo -e "  Logs: ${CYAN}${INSTALL_DIR}/server.log${RESET}"
      echo -e "  Para detener: ${CYAN}homium-site-builder stop${RESET}"
      return 0
    fi
  done

  if _is_running; then
    ok "Servidor iniciado (PID $(cat "$PID_FILE")) en http://localhost:${PORT}"
    echo -e "  Logs: ${CYAN}${INSTALL_DIR}/server.log${RESET}"
  else
    err "El servidor no pudo iniciar. Revisa los logs:"
    echo -e "  ${CYAN}cat ${INSTALL_DIR}/server.log${RESET}"
    rm -f "$PID_FILE"
    exit 1
  fi
}

_stop() {
  if ! _is_running; then
    warn "El servidor no está corriendo."
    rm -f "$PID_FILE"
    return 0
  fi
  local pid
  pid=$(cat "$PID_FILE")
  kill "$pid" 2>/dev/null
  rm -f "$PID_FILE"
  ok "Servidor detenido (PID ${pid})"
}

_status() {
  if _is_running; then
    local pid
    pid=$(cat "$PID_FILE")
    ok "Servidor corriendo — PID ${pid} — http://localhost:${PORT}"
    echo -e "  Logs: ${CYAN}${INSTALL_DIR}/server.log${RESET}"
  else
    info "Servidor detenido"
    rm -f "$PID_FILE" 2>/dev/null
  fi
}

_open() {
  local url="http://localhost:${PORT}"
  if ! _is_running; then
    warn "El servidor no está corriendo. Iniciando primero..."
    _start
  fi
  case "$(uname -s)" in
    Darwin) open "$url" ;;
    Linux)  xdg-open "$url" 2>/dev/null || info "Abre en tu navegador: ${url}" ;;
    *)      info "Abre en tu navegador: ${url}" ;;
  esac
}

_logs() {
  if [[ -f "${INSTALL_DIR}/server.log" ]]; then
    tail -f "${INSTALL_DIR}/server.log"
  else
    warn "No hay logs aún. Inicia el servidor primero con: homium-site-builder start"
  fi
}

_update() {
  info "Actualizando homium-site-builder..."

  local was_running=false
  _is_running && was_running=true && _stop

  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    git -C "$INSTALL_DIR" pull --quiet 2>/dev/null && ok "Código actualizado" || warn "No se pudo actualizar el repo"
  else
    err "No se encontró repositorio git en ${INSTALL_DIR}"
    echo -e "  Reinstala con: ${CYAN}curl -sSL https://raw.githubusercontent.com/homium-tech/homium-site-builder/main/install.sh | bash${RESET}"
    exit 1
  fi

  cd "$INSTALL_DIR" || exit 1
  if command -v pnpm &>/dev/null; then
    pnpm install --prod --silent 2>/dev/null && ok "Dependencias actualizadas"
  else
    npm install --omit=dev --silent 2>/dev/null && ok "Dependencias actualizadas"
  fi

  local new_ver
  new_ver=$(node -e "try{const p=require('${INSTALL_DIR}/package.json');process.stdout.write(p.version)}catch(e){}" 2>/dev/null)
  ok "homium-site-builder ${new_ver:-actualizado}"

  [[ "$was_running" == true ]] && _start
}

_version() {
  local ver
  ver=$(node -e "try{const p=require('${INSTALL_DIR}/package.json');process.stdout.write(p.version)}catch(e){process.stdout.write('${VERSION}')}" 2>/dev/null || echo "$VERSION")
  echo "homium-site-builder v${ver}"
}

_help() {
  echo ""
  echo -e "${BOLD}${CYAN}homium-site-builder${RESET} — Constructor autónomo de sitios web con IA"
  echo ""
  echo -e "  ${BOLD}Uso:${RESET}"
  echo -e "    ${CYAN}homium-site-builder${RESET} [comando]"
  echo ""
  echo -e "  ${BOLD}Comandos:${RESET}"
  echo -e "    ${CYAN}start${RESET}      Inicia el servidor en http://localhost:${PORT}"
  echo -e "    ${CYAN}stop${RESET}       Detiene el servidor"
  echo -e "    ${CYAN}status${RESET}     Estado del servidor"
  echo -e "    ${CYAN}open${RESET}       Abre en el navegador (inicia si está detenido)"
  echo -e "    ${CYAN}logs${RESET}       Sigue los logs en tiempo real"
  echo -e "    ${CYAN}--update${RESET}   Actualiza a la última versión"
  echo -e "    ${CYAN}--version${RESET}  Muestra la versión instalada"
  echo -e "    ${CYAN}--help${RESET}     Muestra esta ayuda"
  echo ""
  echo -e "  ${BOLD}Variables de entorno:${RESET}"
  echo -e "    ${CYAN}PORT${RESET}           Puerto HTTP (default: 3000)"
  echo -e "    ${CYAN}WORKSPACE_DIR${RESET}  Directorio de proyectos (default: ~/Downloads/homium_projects)"
  echo ""
}

# ─── Dispatch ─────────────────────────────────────────────────────────────────
case "${1:-start}" in
  start)     _start ;;
  stop)      _stop ;;
  status)    _status ;;
  open)      _open ;;
  logs)      _logs ;;
  --update)  _update ;;
  --version) _version ;;
  --help|-h) _help ;;
  *)
    err "Comando no reconocido: $1"
    _help
    exit 1
    ;;
esac
