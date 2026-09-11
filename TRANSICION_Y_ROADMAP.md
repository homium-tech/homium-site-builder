# HOMIUM SITE BUILDER — DOCUMENTO MAESTRO DE TRANSICIÓN Y ROADMAP ARQUITECTÓNICO

> **Propósito de este documento:**  
> Servir como referencia técnica completa, diagnóstico y guía de continuidad para retomar el desarrollo en cualquier máquina o sistema operativo. Este documento detalla los ajustes pendientes inmediatos para estabilizar la versión actual, el diagnóstico de los problemas detectados, la visión de arquitectura para convertir Homium en una aplicación autónoma 100% instalable por consola y el stack tecnológico requerido.

---

## ÍNDICE
1. [Ficha Técnica del Proyecto & Estado Actual](#1-ficha-técnica-del-proyecto--estado-actual)
2. [Diagnóstico de Comportamientos Problemáticos](#2-diagnóstico-de-comportamientos-problemáticos)
   - 2.1 Desincronización ante F5 / Refresco de Página
   - 2.2 Anomalía en el Paso 1.5.b (Pregunta de Fidelidad sin Referencias)
   - 2.3 Fragilidad del almacenamiento actual (LocalStorage y Archivos Planos)
   - 2.4 Límites del Frontend Actual en Vanilla JS e Imperatividad en el DOM
3. [Ajustes Inmediatos Pendientes (Versión Actual)](#3-ajustes-inmediatos-pendientes-versión-actual)
   - Ajuste 1: Regla de Bypass del Paso 1.5.b
   - Ajuste 2: Rehidratación de Sesión y Estado tras Refresco
   - Ajuste 3: Persistencia del Motor/Modelo Predeterminado
   - Ajuste 4: Blueprint Activo y Reactivo por Defecto
4. [Visión Objetivo: Aplicación 100% Nativa / CLI Universal](#4-visión-objetivo-aplicación-100-nativa--cli-universal)
   - 4.1 ¿Por qué superar el modelo de Web App con LocalStorage?
   - 4.2 Modelo de Distribución Universal (`npx` y binario standalone)
   - 4.3 Base de Datos Embebida: SQLite como Núcleo de Persistencia
   - 4.4 Evolución de los Entregables: W3C DTCG Tokens vs Archivos Planos
5. [Arquitectura del Frontend: Migración a Astro + TypeScript + Tailwind](#5-arquitectura-del-frontend-migración-a-astro--typescript--tailwind)
   - 5.1 Justificación del Stack Seleccionado
   - 5.2 Estructura Modular de Componentes `.astro`
   - 5.3 Módulos de Cliente TypeScript (`src/scripts/`)
   - 5.4 Estrategia de Compilación y Distribución Zero-Config
6. [Stack Tecnológico Consolidado](#6-stack-tecnológico-consolidado)
7. [Esquema de Base de Datos Propuesto (SQLite)](#7-esquema-de-base-de-datos-propuesto-sqlite)
8. [Guía de Handoff: Puesta en Marcha en Otra Máquina](#8-guía-de-handoff-puesta-en-marcha-en-otra-máquina)

---

## 1. FICHA TÉCNICA DEL PROYECTO & ESTADO ACTUAL

- **Nombre:** Homium Site Builder
- **Versión:** `1.1.0`
- **Repositorio Base:** `homium_site_builder`
- **Misión:** Constructor autónomo de Sistemas de Diseño y Prototipos Web Vanilla (HTML/CSS/JS) con ejecución agéntica multi-motor (Claude Code, AGY, Codex, OpenCode, llama.cpp, Ollama) y diseño visual de alta fidelidad basado en tokens Homium.
- **Pipeline Canónico:** Estrictamente 5 fases delimitadas:
  1. **Fase 1: Discovery** (Identidad, modelo comercial, ADN de marca, referencias visuales).
  2. **Fase 2: Foundations** (Tokens HCT, paleta armónica, escala tipográfica Rubik, radios, espaciados, dark mode).
  3. **Fase 3: Components** (Catálogo atómico de componentes interactivos y estados).
  4. **Fase 4: Validation** (Generación de especificación técnica y Showcase HTML interactivo).
  5. **Fase 5: Prototype** (Compilación en disco del prototipo navegable de 3 pantallas en Vanilla HTML/CSS/JS).
- **Entregables Físicos en Disco:** Ubicados en `~/Downloads/homium_projects/<marca>/`:
  - `design-system-state.json` (Tokens y ADN en JSON).
  - `[Brand]_Design_System.html` (Showcase interactivo de validación).
  - `[Brand]_Design_System.md` (Documento maestro de especificación).
  - `prototype/` (Carpeta con `index.html`, `styles.css`, `app.js` de las 3 pantallas).
- **Suite de Pruebas Automatizadas:** 57/57 tests unitarios pasando al 100% (`pnpm test`).

---

## 2. DIAGNÓSTICO DE COMPORTAMIENTOS PROBLEMÁTICOS

### 2.1 Desincronización ante F5 / Refresco de Página
- **Síntoma:** Si el usuario está avanzando en una marca (ej. en Fase 1 o 2) y presiona F5 o recarga la pestaña, la interfaz vuelve a mostrar el mensaje de bienvenida inicial pidiendo el nombre de la marca. Si el usuario reingresa el nombre o responde, el agente se confunde, se reinicia el flujo o se producen incoherencias numéricas de pasos.
- **Causa Raíz:**
  1. `public/index.html` contiene el primer mensaje del bot quemado de forma estática en el HTML.
  2. `public/app.js` guarda únicamente un identificador plano en `localStorage.getItem('homium_site_builder_session_id')`, pero **no persiste ni restaura el historial de mensajes de la conversación**.
  3. En el backend, `lib/agent-engine/session-store.js` almacena las sesiones en un `Map` en la memoria RAM del proceso de Node.js.
  4. En el disco, `lib/workspace` ya ha creado la carpeta `~/Downloads/homium_projects/<marca>` y guardado el marcador `.active_project`.
  5. Al recargar, el cliente está en "blanco" pidiendo marca, pero el backend ya tiene el proyecto inicializado en disco. Esa asimetría causa la desincronización con el LLM.

### 2.2 Anomalía en el Paso 1.5.b (Pregunta de Fidelidad sin Referencias)
- **Síntoma:** En la Fase 1, tras seleccionar la opción *"3. Sin referencias específicas (diseño desde cero)"*, el asistente formula la pregunta del Paso 1.5.b: *"¿Qué nivel de fidelidad deseas aplicar respecto a la(s) referencia(s) proporcionada(s)?"*.
- **Causa Raíz:** En `references/phases/phase-1-discovery.md` (líneas 41-43), existe una regla rígida:
  > *"SECUENCIA OBLIGATORIA DE SUB-PASOS: Este paso se ejecuta SIEMPRE en orden estricto 1.5.a ➔ 1.5.b ➔ 1.5.c, anunciando cada número al usuario. Prohibido saltar u omitir el anuncio del Paso 1.5.b..."*
  El motor de IA priorizó la prohibición absoluta sobre el sentido común de la respuesta del usuario.
- **Solución Requerida:** La opción 3 ("Sin referencias") debe activar explícitamente el **Bypass del Paso 1.5.b**, asignar la **Ruta B (Creación Original)** y avanzar de inmediato al resumen de la Fase 1 / inicio de la Fase 2.

### 2.3 Fragilidad del almacenamiento actual (LocalStorage y Archivos Planos)
- **Limitaciones de `localStorage`:**
  - Capacidad máxima de ~5 MB.
  - Inaccesible para el backend de Node.js (el servidor no puede consultar `localStorage` directamente).
  - Volátil: si el usuario abre una ventana incógnito, cambia de navegador o borra cookies, pierde todo el avance.
- **Limitaciones de depender de archivos planos (`.md` / `.html` sueltos):**
  - Si un proceso de IA se interrumpe a mitad de la escritura de un `.html` o `.json`, el archivo puede quedar corrupto (JSON inválido o HTML truncado).
  - No existe control de transacciones (rollback o commit).
  - La consulta de estado requiere lecturas sincrónicas continuas de disco (`fs.readFileSync`), lo que penaliza la concurrencia y velocidad.

### 2.4 Límites del Frontend Actual en Vanilla JS e Imperatividad en el DOM
- **El Problema:** La interfaz del builder no es una simple web informativa; es una aplicación agéntica de alta interactividad (streaming de texto de IA en tiempo real vía SSE, telemetría de tokens, vista activa de Blueprint con chips cromáticos, previsualizadores con reescalado de viewport desktop/tablet/mobile, tarjetas de acción de 1 clic).
- **La Deuda Técnica:** Actualmente todo este comportamiento está contenido en un archivo imperativo `public/app.js` de **1,250 líneas** que manipula el DOM directamente con `innerHTML += ...` y `document.getElementById`. Esto genera:
  - Riesgo de inconsistencias visuales y parpadeos durante el streaming.
  - Ausencia de modularidad: cualquier cambio en el chat puede desestabilizar el canvas o el drawer de telemetría.
  - Gran dificultad para tipar los datos y para gestionar la rehidratación del estado tras una recarga (F5).

---

## 3. AJUSTES INMEDIATOS PENDIENTES (VERSIÓN ACTUAL)

Estos cambios deben implementarse para dejar la versión actual completamente operativa y estable antes de la migración:

### Ajuste 1: Regla de Bypass del Paso 1.5.b en `phase-1-discovery.md`
- **Archivo:** `references/phases/phase-1-discovery.md`
- **Acción:** Modificar la sección del Paso 1.5 para estipular que:
  - Si en el Paso 1.5.a el usuario elige **Opción 1 o 2 (Tiene URLs o Imágenes)**: Ejecutar obligatoriamente el Paso 1.5.b (pregunta de fidelidad: *Fidelidad Arquitectónica Total* vs *Inspiración Vibe*).
  - Si en el Paso 1.5.a el usuario elige **Opción 3 (Sin referencias / Diseño original desde cero)**: Bypassear inmediatamente el Paso 1.5.b y 1.5.c, activar la **Ruta B (Creación Original)** y presentar la síntesis final de la Fase 1 para avanzar a la Fase 2.

### Ajuste 2: Rehidratación y Persistencia de Sesión al Refrescar (F5)
- **Backend (`server.js` y `lib/workspace` / `lib/agent-engine`):**
  - Crear el endpoint `GET /api/session/state`:
    - Devuelve: `{ hasActiveProject: boolean, projectName: string, currentPhase: number, messages: Array, state: Object }`.
  - Crear un respaldo en disco del historial conversacional dentro del proyecto (`~/Downloads/homium_projects/<marca>/chat-history.json`).
- **Frontend (`public/app.js`):**
  - Al iniciar `DOMContentLoaded`:
    - Consultar `GET /api/session/state`.
    - Si existe un proyecto activo y con historial:
      - Ocultar el saludo inicial en blanco.
      - Renderizar los mensajes del historial previo en el chat.
      - Ubicar el badge de fase y el Blueprint en el punto exacto donde se quedó.
      - Mostrar una tarjeta contextual de continuidad: *"Reanudando sesión de [Marca] — Fase X. Puedes continuar directamente."*

### Ajuste 3: Persistencia del Motor / Modelo Predeterminado
- **Archivo:** `public/app.js` y `server.js`
- **Acción:** Guardar en configuración persistente el último motor seleccionado en el selector (`engineSelect`), evitando que vuelva siempre a `Claude` al recargar o iniciar una nueva sesión.

### Ajuste 4: Blueprint Activo y Reactivo por Defecto
- **Archivo:** `public/app.js` y `public/index.html`
- **Acción:** Garantizar que la pestaña activa durante todo el flujo de descubrimiento y diseño sea la de **Blueprint**, actualizando en vivo los chips de colores, escalas tipográficas y radios según el asistente los va registrando, sin requerir clics manuales del usuario.

---

## 4. VISIÓN OBJETIVO: APLICACIÓN 100% NATIVA / CLI UNIVERSAL

### 4.1 ¿Por qué superar el modelo de Web App con LocalStorage?
Las herramientas modernas para desarrolladores (Claude Code, GitHub Copilot CLI, v0 CLI, Astro Dev) no operan como simples páginas web alojadas en navegadores. Operan como **aplicaciones de consola de primer nivel** que:
1. Tienen acceso directo al sistema operativo y al sistema de archivos local.
2. Poseen un backend local embebido autosuficiente.
3. Garantizan que los datos persistan de manera atómica, transaccional y permanente en el equipo del usuario.
4. Funcionan exactamente igual en **Linux, macOS y Windows**.

### 4.2 Modelo de Distribución Universal
- **Instalación y Ejecución con un solo comando:**
  ```bash
  # Ejecución instantánea sin instalación previa:
  npx homium-site-builder

  # O instalación global:
  npm install -g homium-site-builder
  homium
  ```
- **Flujo de Arranque Universal:**
  1. El usuario ejecuta `homium` en cualquier consola.
  2. El CLI detecta el sistema operativo, verifica la presencia de Node.js runtime y abre automáticamente la interfaz local optimizada en modo ventana app (`--app=http://localhost:3000`).
  3. Se inicia un servidor local en un puerto dinámico disponible (ej. `http://localhost:3000` o fallback a `3001+`).
  4. Todos los proyectos y configuraciones se administran bajo una carpeta raíz confiable (`~/.homium/` para metadatos y `~/Downloads/homium_projects/` para entregables compilados).

### 4.3 Base de Datos Embebida: SQLite como Núcleo de Persistencia
Para eliminar la fragilidad de `localStorage` y de archivos JSON concurrentes, el backend incorporará **SQLite embebido**:
- **Cero Configuración (Zero-Config):** No requiere instalar bases de datos externas (ni PostgreSQL, ni MySQL, ni Docker).
- **Soporte Nativo en Node.js 22:** Utiliza el módulo estándar `node:sqlite` (o `better-sqlite3` para Node 18/20), compilado sin dependencias nativas complejas.
- **Modo WAL (Write-Ahead Logging):** Permite lecturas ultrarrápidas y escrituras atómicas seguras, resistentes a cierres inesperados de consola o apagones de máquina.
- **Persistencia Unificada:** Cada proyecto puede tener su propio archivo de base de datos (`~/Downloads/homium_projects/<marca>/project.db`) o coexistir en una base de datos centralizada del usuario (`~/.homium/homium.sqlite`).

### 4.4 Evolución de los Entregables: W3C DTCG Tokens vs Archivos Planos
- **El Problema Actual:** La aplicación genera y lee archivos `.md` y `.html` mediante expresiones regulares y manipulación de texto crudo, lo que puede provocar fallas si el LLM altera la estructura de un encabezado.
- **La Solución Estructurada:**
  - **La Fuente de la Verdad:** El modelo de datos de diseño se almacena en la base de datos siguiendo la especificación formal del **W3C Design Tokens Community Group (DTCG)**.
    - Ejemplo: `{ "color": { "brand": { "primary": { "$value": "#290640", "$type": "color" } } } }`.
  - **Los Archivos son Compilados (Build Targets):**
    - `[Brand]_Design_System.html` y `[Brand]_Design_System.md` dejan de ser documentos editados a mano por el LLM; pasan a ser **compilados determinísticamente** por un generador interno a partir de los tokens validados en SQLite.
    - El prototipo de 3 pantallas en Vanilla HTML/CSS/JS se compila directamente desde el árbol de tokens y el catálogo de componentes.

---

## 5. ARQUITECTURA DEL FRONTEND: MIGRACIÓN A ASTRO + TYPESCRIPT + TAILWIND

### 5.1 Justificación del Stack Seleccionado
Para garantizar un desarrollo ágil, libre de curvas de aprendizaje innecesarias y 100% alineado con el perfil del desarrollador (**Astro + TypeScript + Tailwind + PHP**), el frontend de Homium Site Builder se migrará a **Astro**:

1. **Cero Curva de Aprendizaje:** No requiere aprender frameworks externos como React, Vue ni Svelte. Toda la lógica de componentes se expresa en la sintaxis natural `.astro` y TypeScript.
2. **Componentes Aislados y Reutilizables:** Reemplaza el HTML estático de 750 líneas por bloques modulares legibles con propiedades tipadas (`interface Props`).
3. **Tipado Estricto de Extremo a Extremo:** TypeScript valida los tokens de diseño, las fases del pipeline (1 a 5), los eventos de streaming SSE y las respuestas de la base de datos.
4. **Tailwind CSS Nativo:** Integración directa con `@astrojs/tailwind`, permitiendo maquetar a máxima velocidad utilizando la paleta oficial de Homium (`#290640`, `#00ffff`, `#5aeaa2`, fuentes Rubik).

### 5.2 Estructura Modular de Componentes `.astro`
```
frontend/
├── src/
│   ├── layouts/
│   │   └── AppLayout.astro         # Shell principal con meta-tags, fuentes Rubik y grid base
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.astro        # Barra superior con logo, selector de motor y botón reset
│   │   │   ├── ViewportBar.astro   # Controles Desktop (100%), Tablet (768px), Mobile (375px)
│   │   │   └── TabNavigation.astro # Pestañas: Prototipo, Showcase, Blueprint, Consola
│   │   ├── chat/
│   │   │   ├── ChatPanel.astro     # Contenedor de conversación con scroll automático
│   │   │   ├── MessageBubble.astro # Mensajes de usuario y asistente con renderizado markdown
│   │   │   ├── ActionChips.astro   # Chips interactivos de opciones (Paso 1.3, 1.4, 1.5, etc.)
│   │   │   ├── ActionCard.astro    # Tarjetas de selección (Fast-Track vs Inspiración / Gates)
│   │   │   └── ChatInput.astro     # Textarea auto-ajustable con shortcuts de teclado (Enter/Shift+Enter)
│   │   ├── preview/
│   │   │   ├── BlueprintView.astro # Visualizador reactivo de tokens cromáticos, tipografía y radios
│   │   │   ├── PrototypeFrame.astro# Iframe navegable de la Fase 5 con fallback de espera
│   │   │   └── ShowcaseFrame.astro # Iframe del Showcase HTML de la Fase 4
│   │   └── telemetry/
│   │       └── TelemetryPanel.astro# Métricas por turno: tokens in/out/thinking, duración y caché
│   ├── scripts/                    # Lógica cliente modularizada en TypeScript
│   │   ├── sse-client.ts           # Gestor de Server-Sent Events y decodificador de chunks
│   │   ├── session-store.ts        # Rehidratación de sesión y estado desde SQLite
│   │   └── blueprint-sync.ts       # Actualización en vivo del Blueprint al recibir tokens
│   └── types/                      # Definiciones de tipos TypeScript
│       ├── pipeline.ts             # Tipos de fases, pasos y acciones
│       ├── tokens.ts               # Estructuras de tokens cromáticos, tipográficos y radios
│       └── session.ts              # Modelo de sesión, mensajes y telemetría
├── astro.config.mjs                # Configuración de Astro (modo estático o node adapter)
├── tailwind.config.mjs             # Tokens de diseño de Homium integrados en Tailwind
└── tsconfig.json                   # Configuración estricta de TypeScript
```

### 5.3 Módulos de Cliente TypeScript (`src/scripts/`)
En lugar del código monolítico de `app.js`, la lógica en el navegador se distribuye en módulos limpios:
- **`sse-client.ts`:** Se suscribe al endpoint `/api/chat` mediante SSE, decodifica los eventos tipados (`text_delta`, `tool_activity`, `done`) y actualiza la burbuja del mensaje activo en tiempo real.
- **`session-store.ts`:** Al iniciar la página (`DOMContentLoaded`), consulta `/api/session/state`. Si SQLite devuelve un proyecto activo, renderiza el historial previo y activa la fase correspondiente, eliminando la pantalla en blanco tras refrescar (F5).
- **`blueprint-sync.ts`:** Escucha los eventos SSE o el canal reactivo `/api/deliverables/stream` y actualiza directamente las muestras de color CSS y la tipografía Rubik en el componente `<BlueprintView />`.

### 5.4 Estrategia de Compilación y Distribución Zero-Config
Para mantener la aplicación 100% instalable vía consola en cualquier equipo sin que el usuario tenga que compilar nada:
1. **En Desarrollo:** El comando `pnpm dev` compila los componentes Astro con recarga rápida (HMR).
2. **Para Distribución:** El comando `pnpm build` compila el frontend de Astro en la carpeta estática `dist/` (HTML, CSS optimizado y JS minificado).
3. **En Ejecución (`npx homium-site-builder`):** El servidor local de Node.js sirve directamente los archivos de `dist/`. El usuario final ejecuta la aplicación en 2 segundos en cualquier sistema operativo sin instalar Astro ni herramientas de compilación.

---

## 6. STACK TECNOLÓGICO CONSOLIDADO

| Capa / Módulo | Tecnología | Justificación Técnica |
|---|---|---|
| **Frontend UI** | **Astro (.astro)** | Arquitectura de componentes limpia, modular y sin sobrecarga de Virtual DOM; ideal para dashboards y herramientas agénticas. |
| **Lógica del Cliente** | **TypeScript** | Tipado estricto de las 5 fases, tokens W3C y payloads de sesión; elimina errores en tiempo de ejecución. |
| **Estilos y Tokens** | **Tailwind CSS** | Totalmente integrado con Astro; desarrollo rápido con las utilidades de color, tipografía y sombras de Homium. |
| **Persistencia** | **SQLite 3 (WAL mode)** | Base de datos embebida en un solo archivo transaccional. Cero servidores externos, cero configuración y recuperación inmediata tras F5. |
| **Runtime y Backend** | **Node.js 22 LTS** | Soporte nativo de `node:sqlite`, APIs web estándar, fetch nativo y compatibilidad multiplataforma garantizada. |
| **Servidor Local** | **Express o Fastify** | Manejo de APIs REST, canal SSE para streaming agéntico y servicio de la carpeta precompilada `dist/`. |
| **CLI & Launcher** | **Commander.js + @clack/prompts** | Comandos de terminal interactivos y apertura automática de la UI en modo ventana (`--app`). |
| **Especificación de Tokens** | **W3C Design Tokens (DTCG)** | La fuente de verdad reside en SQLite; el Showcase y el Prototipo son compilados determinísticos de salida. |

---

## 7. ESQUEMA DE BASE DE DATOS PROPUESTO (SQLITE)

```sql
-- Tabla de Proyectos
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'in_progress', -- in_progress, validated, completed
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    metadata_json TEXT
);

-- Tabla de Sesiones Conversacionales
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    engine TEXT NOT NULL,          -- claude, agy, codex, opencode, ollama, llama
    model TEXT,
    current_phase INTEGER DEFAULT 1,
    current_step TEXT DEFAULT '1.1',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Historial Transaccional de Mensajes
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,            -- user, assistant, system
    content TEXT NOT NULL,
    action_detected TEXT,          -- step_completed, gate_reached, none
    tokens_usage_json TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Grafo de Tokens de Diseño (W3C DTCG)
CREATE TABLE IF NOT EXISTS design_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    category TEXT NOT NULL,        -- color, typography, spacing, radius, elevation
    token_name TEXT NOT NULL,
    token_value TEXT NOT NULL,
    token_type TEXT NOT NULL,       -- color, dimension, fontFamily, fontWeight
    raw_dtcg_json TEXT,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, token_name)
);

-- Registro de Artefactos y Entregables Generados
CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    type TEXT NOT NULL,            -- spec_markdown, showcase_html, prototype_bundle
    file_path TEXT NOT NULL,
    content_hash TEXT,
    version INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

---

## 8. GUÍA DE HANDOFF: PUESTA EN MARCHA EN OTRA MÁQUINA

Para continuar el trabajo en otro equipo (Linux, macOS o Windows):

### 8.1 Requisitos del Sistema
- **Node.js:** Versión `>= 18.18.0` (Recomendado: `Node.js 22 LTS`).
- **Gestor de Paquetes:** `pnpm` (recomendado) o `npm`.
- **Git:** Instalado y configurado.

### 8.2 Pasos de Instalación
1. **Copiar o Clonar el Repositorio:**
   ```bash
   git clone <url-del-repositorio> homium_site_builder
   cd homium_site_builder
   ```
2. **Instalar Dependencias:**
   ```bash
   pnpm install
   # o: npm install
   ```
3. **Verificar el Estado de la Suite de Pruebas:**
   ```bash
   pnpm test
   # Debe responder: 57 passing tests (0 failures)
   ```
4. **Verificar Integridad del Entorno:**
   ```bash
   pnpm doctor
   ```
5. **Iniciar el Servidor:**
   ```bash
   # En Linux / macOS:
   ./start.sh
   # o: pnpm start

   # En Windows:
   start.bat
   # o: npm start
   ```
6. **Acceder a la Aplicación:**
   Abrir en el navegador: `http://localhost:3000`

### 8.3 Directorio de Trabajo de Proyectos
- Por defecto, los proyectos generados por el builder se crean en:
  - **Linux / macOS:** `~/Downloads/homium_projects/`
  - **Windows:** `%USERPROFILE%\Downloads\homium_projects\`
- Si deseas cambiar esta ubicación, puedes definir la variable de entorno:
  ```bash
  export WORKSPACE_ROOT_DIR=/ruta/a/tus/proyectos
  ```

### 8.4 Mapa de Archivos Clave del Repositorio
- `server.js`: Servidor Express, API REST, SSE y endpoints del pipeline y entregables.
- `core/pipeline/index.js`: Máquina de estados de las 5 fases canónicas y detectores de acciones/compuertas.
- `core/prompts/system-rules.js`: Reglas maestras del sistema y restricciones de ejecución para los motores.
- `references/phases/`: Especificación formal de cada fase (de `phase-1-discovery.md` a `phase-5-prototype.md`).
- `lib/agent-engine/`: Motor agéntico multi-adaptador (Claude, AGY, Codex, etc.).
- `lib/workspace/`: Módulo de confinamiento físico y sandbox en disco.
- `lib/deliverable-store/`: Almacén reactivo de entregables con soporte SSE.
- `public/`: UI local actual (HTML, CSS y JavaScript del cliente, objetivo de migración a Astro).

---
*Documento generado y validado en Homium Site Builder v1.1.0 — Listo para migración y continuidad.*
