# Homium Site Builder ⚡

Sistema autónomo de construcción web y diseño de interfaces impulsado por IA, con soporte multi-motor nativo, supervisión reactiva de entregables y fidelidad arquitectónica absoluta basada en **Homium Design System**.

---

## 🌟 Características Principales

- **Arquitectura 100% Desacoplada:** Funciona de forma autónoma sin ataduras a rutas fijas ni skills externas.
- **Soporte Multi-Motor Universal (7 Motores):**
  - **Claude Code CLI** (`claude -p [prompt]`)
  - **Antigravity CLI** (`agy`)
  - **OpenAI Codex CLI** (`codex exec [prompt]`)
  - **OpenCode CLI** (`opencode run --auto [prompt]`)
  - **llama.cpp Server** (`http://127.0.0.1:8080/v1/chat/completions` con SSE streaming)
  - **Ollama Server** (`http://127.0.0.1:11434/api/chat` con JSON streaming)
  - **Simulador Mock:** Pruebas interactivas en memoria sin consumo de cuotas ni conexión.
- **Controles Visuales Interactivos:**
  - *Action Chips:* Respuestas predefinidas en 1 clic sobre el input.
  - *Selection Cards:* Elección técnica entre *Fidelidad Total (Fast-Track)* y *Modo Inspiración*.
  - *Compuertas Formales (Gates):* Aprobación canónica antes de avanzar a la siguiente fase.
- **Pipeline Canónico Confinado:**
  - 5 fases de diseño canónicas activas (*Discovery, Foundations, Componentes, Validación, Prototipo*).
  - Entregable final estricto de 3 pantallas en HTML/CSS/JS en `prototype/` (cero dependencias ni frameworks externos).
- **Supervisión Reactiva O(1) vía SSE:**
  - Observador en tiempo real (`DeliverableStore`) que empuja cambios de disco al navegador instantáneamente sin sondeo (*cero polling*).
- **Telemetría de Contexto en Tiempo Real:**
  - Panel en la pestaña **Consola** con métricas exactas por turno: tokens de entrada (contexto usado), tokens generados, tokens de razonamiento (*thinking*), caché y tiempo de inferencia.
- **Espacio de Trabajo Universal y Confinado:**
  - Los entregables y carpetas de proyecto se guardan fuera del repositorio en la carpeta accesible: `~/Downloads/homium_projects` (en todos los sistemas operativos: Windows, macOS y Linux).
  - Directiva canónica estricta que prohíbe escribir en `~/.gemini/` o carpetas ocultas.

---

## 📁 Estructura del Proyecto

```
homium_site_builder/
├── core/
│   ├── pipeline/
│   │   └── phase-registry.js      # Registro canónico y ampliable de fases (5 a 11)
│   └── prompts/
│       ├── phase-descriptors.js   # Mapeo de opciones a chips, tarjetas y compuertas UI
│       └── system-rules.js        # Directivas canónicas inmutables (Single-Question Rule)
├── lib/
│   ├── agent-engine/
│   │   ├── adapters/              # Adaptadores para los 7 motores de ejecución
│   │   ├── stream-parser.js       # Parser ANSI y clasificador semántico de chunks
│   │   ├── session-store.js       # Almacén de turnos y memoria de sesión
│   │   └── index.js               # Orquestador principal AgentEngine
│   └── deliverable-store/
│       └── index.js               # Almacén reactivo de entregables y canal SSE
├── public/
│   ├── index.html                 # UI moderna con selector de motor y canvas interactivo
│   ├── styles.css                 # Sistema de diseño con tokens Homium y dark mode
│   ├── app.js                     # Lógica cliente, SSE, telemetría y acciones dinámicas
│   └── homium/                    # Assets empaquetados (tokens, CSS, fuentes Rubik, logos SVG)
├── scripts/
│   ├── setup.cjs                  # Asistente de instalación y diagnóstico (Doctor)
│   ├── extract_reference_dna.cjs  # Extractor forense de URLs (Playwright)
│   └── verify_fidelity.cjs        # Validador de fidelidad y WCAG 2.2 AAA
├── templates/                     # Plantillas maestras de entregables
├── references/                    # Base de conocimiento y catálogo de componentes
├── test/                          # Suite automatizada de pruebas unitarias (33 tests)
├── server.js                      # Servidor Express y API REST/SSE
├── start.sh                       # Lanzador directo para Linux & macOS
├── start.bat                      # Lanzador directo para Windows
└── package.json                   # Dependencias y scripts de ejecución
```

---

## 🚀 Instalación y Despliegue en Cualquier Equipo (Windows, macOS, Linux)

### Instalación directa (Recomendado)

```bash
curl -sSL https://raw.githubusercontent.com/homium-tech/homium-site-builder/main/install.sh | bash
```

El instalador detecta automáticamente el sistema operativo, instala Node.js ≥18 si no está presente, y configura el comando `homium-site-builder` en tu PATH.

**Uso tras la instalación:**
```bash
homium-site-builder start    # Inicia el servidor en http://localhost:3000
homium-site-builder stop     # Detiene el servidor
homium-site-builder status   # Estado del servidor
homium-site-builder open     # Abre en el navegador
homium-site-builder --update # Actualiza a la última versión
```

---

### Instalación manual (desde el repo)

### 1. Instalación asistida y diagnóstico
Ejecuta el asistente interactivo en la consola:
```bash
pnpm run setup
```
O realiza una verificación de diagnóstico sin instalar paquetes:
```bash
pnpm run doctor
```

El asistente comprobará:
- Versión de Node.js (>= 18) y `pnpm`
- Detección automática de motores CLI en tu sistema (`claude`, `agy`, `codex`, `opencode`)
- Conexión a servidores locales (`llama.cpp` en `:8080` y `Ollama` en `:11434`)
- Estado del espacio de trabajo en `~/Downloads/homium_projects`

### 2. Extracción Forense de URLs con Playwright (Opcional Bajo Demanda)
Si deseas utilizar la extracción técnica forense para clonar el DNA visual de sitios web existentes:
```bash
pnpm run install:playwright
```
*(Este paso es completamente opcional y bajo demanda; no bloquea el uso general del constructor).*

### 3. Iniciar el Servidor
Puedes iniciarlo desde consola:
```bash
pnpm start
# o en modo desarrollo:
pnpm run dev
```
O hacer doble clic en los lanzadores integrados:
- En **Windows**: doble clic en `start.bat`
- En **Linux / macOS**: ejecutar `./start.sh`

La aplicación estará disponible en: **http://localhost:3000**

---

## ⚙️ Variables de Entorno Opcionales

| Variable | Descripción | Valor por Defecto |
| :--- | :--- | :--- |
| `PORT` | Puerto HTTP del servidor | `3000` |
| `WORKSPACE_DIR` | Directorio donde el agente construye los sitios | `~/Downloads/homium_projects` |
| `LLAMACPP_HOST` | URL base del servidor llama.cpp local | `http://127.0.0.1:8080` |
| `OLLAMA_HOST` | URL base del servidor Ollama local | `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | Modelo por defecto para Ollama | `llama3.2` |

---

## 🧪 Pruebas Automatizadas

El proyecto cuenta con una suite completa de 33 pruebas unitarias e integración:

```bash
pnpm test
```

Incluye validación de:
- Sesión y turnos de `AgentEngine`
- Streaming parser, filtros ANSI y captura de telemetría
- Adaptadores de los 7 motores (`agy`, `claude`, `codex`, `opencode`, `llamacpp`, `ollama`, `mock`)
- Reactividad, debounce y tolerancia de `DeliverableStore`
- Pipeline canónico y extensible de `PhaseRegistry`
- Descriptores de compuertas y acciones interactivas en `PhaseDescriptors`
