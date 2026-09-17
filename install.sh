#!/usr/bin/env bash
# =============================================================================
# homium-site-builder — Instalador
# Repo: hccore25/homium-site-builder
# Uso: curl -sSL https://raw.githubusercontent.com/hccore25/homium-site-builder/main/install.sh | bash
# =============================================================================

# ─── Detectar entorno ────────────────────────────────────────────────────────
OS_TYPE="linux"
[[ "$OSTYPE" == "darwin"* ]] && OS_TYPE="macos"
[[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]] && OS_TYPE="windows"

REPO="hccore25/homium-site-builder"
VERSION="1.1.0"
INSTALL_DIR="${HOME}/.homium-site-builder"
BIN_DIR="${HOME}/.local/bin"
BRANCH="main"
BASE_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
REPO_URL="https://github.com/${REPO}.git"

# ─── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}✓${RESET} $*"; }
info() { echo -e "${CYAN}→${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
err()  { echo -e "${RED}✗${RESET} $*" >&2; }
step() { echo -e "\n${BOLD}${CYAN}── $* ──────────────────────────────${RESET}"; }

# ─── Header ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}╔════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║  homium-site-builder v${VERSION} — Instalador     ║${RESET}"
echo -e "${BOLD}${CYAN}║  github.com/${REPO}  ║${RESET}"
echo -e "${BOLD}${CYAN}╚════════════════════════════════════════════════╝${RESET}"
echo ""

# ─── Guardia contra ejecución completa con sudo ──────────────────────────────
if [[ "$EUID" -eq 0 ]] && [[ -n "${SUDO_USER:-}" ]]; then
  err "No ejecutes este instalador completo con sudo."
  err "El script pide sudo internamente solo cuando lo necesita (apt-get, etc.)."
  echo -e "  ${YELLOW}Ejecuta en su lugar:${RESET} bash install.sh"
  exit 1
fi

# ─── Info de entorno ─────────────────────────────────────────────────────────
case "$OS_TYPE" in
  macos)   info "Sistema: macOS" ;;
  windows) info "Sistema: Windows (Git Bash / MSYS2)" ;;
  linux)   info "Sistema: Linux" ;;
esac

# ─── Helpers de instalación ───────────────────────────────────────────────────
LINUX_PKG=""
if [[ "$OS_TYPE" == "linux" ]]; then
  command -v apt-get &>/dev/null && LINUX_PKG="apt"
  command -v dnf     &>/dev/null && LINUX_PKG="dnf"
  command -v yum     &>/dev/null && LINUX_PKG="yum"
  command -v pacman  &>/dev/null && LINUX_PKG="pacman"
fi

_install_pkg() {
  local name="$1" brew_pkg="${2:-$1}" apt_pkg="${3:-$1}" dnf_pkg="${4:-$1}"
  info "Instalando ${name}..."
  case "$OS_TYPE" in
    macos)
      brew install "$brew_pkg" --quiet 2>/dev/null && ok "$name" && return 0 ;;
    linux)
      case "$LINUX_PKG" in
        apt)    sudo apt-get install -y "$apt_pkg" -qq 2>/dev/null && ok "$name" && return 0 ;;
        dnf|yum) sudo "$LINUX_PKG" install -y "$dnf_pkg" 2>/dev/null && ok "$name" && return 0 ;;
        pacman) sudo pacman -S --noconfirm "$apt_pkg" 2>/dev/null  && ok "$name" && return 0 ;;
      esac ;;
  esac
  warn "$name — no se pudo instalar automáticamente"
  return 1
}

# ─── Node.js ≥18 ─────────────────────────────────────────────────────────────
step "Verificando Node.js"

NODE_OK=false
if command -v node &>/dev/null; then
  NODE_VER=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))" 2>/dev/null)
  if [[ "$NODE_VER" -ge 18 ]] 2>/dev/null; then
    ok "node $(node --version)"
    NODE_OK=true
  else
    warn "Node.js $(node --version) detectado — se requiere ≥18. Actualizando..."
  fi
fi

if [[ "$NODE_OK" == false ]]; then
  if [[ "$OS_TYPE" == "linux" && "$LINUX_PKG" == "apt" ]]; then
    info "Instalando Node.js LTS vía NodeSource..."
    if curl -fsSL https://deb.nodesource.com/setup_lts.x 2>/dev/null | sudo -E bash - &>/dev/null \
        && sudo apt-get install -y nodejs -qq 2>/dev/null; then
      ok "node $(node --version)"
      NODE_OK=true
    else
      err "No se pudo instalar Node.js automáticamente."
      echo -e "  Instala manualmente:"
      echo -e "  ${CYAN}curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs${RESET}"
      exit 1
    fi
  elif [[ "$OS_TYPE" == "macos" ]]; then
    command -v brew &>/dev/null && brew install node --quiet 2>/dev/null && ok "node $(node --version)" && NODE_OK=true
    if [[ "$NODE_OK" == false ]]; then
      err "Instala Node.js desde https://nodejs.org (v18 LTS o superior)"; exit 1
    fi
  elif [[ "$OS_TYPE" == "windows" ]]; then
    err "Instala Node.js desde https://nodejs.org (v18 LTS o superior) y vuelve a ejecutar el instalador."
    exit 1
  else
    err "No se pudo instalar Node.js. Instala manualmente v18+ desde https://nodejs.org"; exit 1
  fi
fi

# ─── pnpm ─────────────────────────────────────────────────────────────────────
step "Verificando pnpm"

if command -v pnpm &>/dev/null; then
  ok "pnpm $(pnpm --version)"
else
  info "Instalando pnpm..."
  npm install -g pnpm --quiet 2>/dev/null
  if command -v pnpm &>/dev/null; then
    ok "pnpm $(pnpm --version)"
  else
    warn "pnpm no disponible — se usará npm como fallback"
  fi
fi

# ─── git ─────────────────────────────────────────────────────────────────────
step "Verificando git"

if command -v git &>/dev/null; then
  ok "git $(git --version | awk '{print $3}')"
else
  _install_pkg "git" "git" "git" "git" || { err "git es requerido"; exit 1; }
fi

# ─── Clonar / Actualizar repo ─────────────────────────────────────────────────
step "Instalando homium-site-builder"

if [[ -d "${INSTALL_DIR}/.git" ]]; then
  info "Actualizando instalación existente en ${INSTALL_DIR}..."
  git -C "$INSTALL_DIR" pull --quiet 2>/dev/null && ok "Repositorio actualizado" || warn "No se pudo actualizar el repo"
else
  info "Clonando repositorio en ${INSTALL_DIR}..."
  git clone --quiet "$REPO_URL" "$INSTALL_DIR" 2>/dev/null
  if [[ $? -ne 0 ]]; then
    err "No se pudo clonar el repositorio desde ${REPO_URL}"
    echo -e "  Verifica que el repo sea público o que tengas acceso."
    exit 1
  fi
  ok "Repositorio clonado"
fi

# ─── Instalar dependencias ───────────────────────────────────────────────────
step "Instalando dependencias"

cd "$INSTALL_DIR" || exit 1

if command -v pnpm &>/dev/null; then
  pnpm install --prod --silent 2>/dev/null && ok "Dependencias instaladas con pnpm"
else
  npm install --omit=dev --silent 2>/dev/null && ok "Dependencias instaladas con npm"
fi

# ─── Wrapper CLI ─────────────────────────────────────────────────────────────
step "Configurando comando homium-site-builder"

# El wrapper está en el repo — solo necesitamos hacerlo ejecutable
if [[ -f "${INSTALL_DIR}/homium-site-builder.sh" ]]; then
  chmod +x "${INSTALL_DIR}/homium-site-builder.sh"
  ok "homium-site-builder.sh listo"
else
  err "homium-site-builder.sh no encontrado en ${INSTALL_DIR}"
  exit 1
fi

# ─── Configurar PATH según OS ─────────────────────────────────────────────────
step "Configurando acceso al comando"

case "$OS_TYPE" in
  windows)
    BIN_DIR="${HOME}/bin"
    mkdir -p "$BIN_DIR"
    cp "${INSTALL_DIR}/homium-site-builder.sh" "${BIN_DIR}/homium-site-builder"
    chmod +x "${BIN_DIR}/homium-site-builder"
    ok "Copiado en ${BIN_DIR}/homium-site-builder"
    if ! grep -q 'HOME/bin' "${HOME}/.bashrc" 2>/dev/null; then
      echo '' >> "${HOME}/.bashrc"
      echo '# homium-site-builder' >> "${HOME}/.bashrc"
      echo 'export PATH="$HOME/bin:$PATH"' >> "${HOME}/.bashrc"
      ok "PATH actualizado en ~/.bashrc"
    fi
    ;;
  macos|linux)
    mkdir -p "$BIN_DIR"
    ln -sf "${INSTALL_DIR}/homium-site-builder.sh" "${BIN_DIR}/homium-site-builder"
    ok "Symlink creado: ${BIN_DIR}/homium-site-builder"
    if ! echo "$PATH" | grep -q ".local/bin"; then
      for rc in "${HOME}/.bashrc" "${HOME}/.zshrc" "${HOME}/.profile"; do
        touch "$rc" 2>/dev/null
        if ! grep -q ".local/bin" "$rc" 2>/dev/null; then
          echo '' >> "$rc"
          echo '# homium-site-builder' >> "$rc"
          echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$rc"
          ok "PATH añadido a $rc"
        fi
      done
    else
      ok "PATH ya contiene ~/.local/bin"
    fi
    ;;
esac

# ─── Integración con Claude Code ─────────────────────────────────────────────
step "Integrando con Claude Code"

CLAUDE_COMMANDS_DIR="${HOME}/.claude/commands"
if [[ -d "${HOME}/.claude" ]] || [[ -d "${HOME}/.config/claude" ]]; then
  mkdir -p "$CLAUDE_COMMANDS_DIR"
  if [[ -f "${INSTALL_DIR}/commands/homium-site-builder.md" ]]; then
    cp "${INSTALL_DIR}/commands/homium-site-builder.md" \
       "${CLAUDE_COMMANDS_DIR}/homium-site-builder.md" 2>/dev/null && \
      ok "Comando /homium-site-builder instalado en Claude Code"
  fi
else
  warn "Claude Code no detectado — instala el comando manualmente:"
  echo "    mkdir -p ~/.claude/commands"
  echo "    cp ${INSTALL_DIR}/commands/homium-site-builder.md ~/.claude/commands/"
fi

# ─── Directorio de proyectos ──────────────────────────────────────────────────
mkdir -p "${HOME}/Downloads/homium_projects" 2>/dev/null
ok "Directorio de proyectos: ~/Downloads/homium_projects"

# ─── Listo ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║  ✓ homium-site-builder v${VERSION} instalado correctamente    ║${RESET}"
echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Iniciar el servidor:${RESET}"
echo -e "    ${CYAN}homium-site-builder start${RESET}"
echo ""
echo -e "  ${BOLD}Otros comandos:${RESET}"
echo -e "    ${CYAN}homium-site-builder stop${RESET}       — Detiene el servidor"
echo -e "    ${CYAN}homium-site-builder status${RESET}     — Estado del servidor"
echo -e "    ${CYAN}homium-site-builder open${RESET}       — Abre en el navegador"
echo -e "    ${CYAN}homium-site-builder --update${RESET}   — Actualiza a la última versión"
echo -e "    ${CYAN}homium-site-builder --version${RESET}  — Muestra la versión instalada"
echo ""
echo -e "  ${BOLD}Uso en Claude Code:${RESET}"
echo -e "    ${CYAN}/homium-site-builder${RESET}"
echo ""
echo -e "  ${BOLD}Proyectos guardados en:${RESET} ${CYAN}~/Downloads/homium_projects/${RESET}"
echo ""

case "$OS_TYPE" in
  windows)
    echo -e "  ${YELLOW}Reinicia Git Bash para que el comando esté disponible.${RESET}"
    ;;
  macos|linux)
    if ! command -v homium-site-builder &>/dev/null 2>&1; then
      echo -e "  ${YELLOW}Ejecuta: source ~/.bashrc  (o abre una nueva terminal)${RESET}"
    fi
    ;;
esac
echo ""
