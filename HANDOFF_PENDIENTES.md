# Traspaso: estado de la revisión y pendientes

Rama: `improvements/review-2026-09` (basada en `main`). Plan original aprobado: `C:\Users\User\.claude\plans\haz-una-revision-del-happy-boole.md`
(fuera del repositorio; este documento resume lo necesario).

`pnpm test` pasa completo (19 suites, incluida `e2e-ui` en Chromium real). Los tests **nunca lanzan un motor real**:
el arnés `test/helpers/server-harness.js` corre el servidor con PATH y HOME temporales.

## Hecho (4 commits en la rama, el último con la parte inicial de la Entrega 4)

- **Entrega 1, fiabilidad del motor**: tokens de Ollama/llama.cpp conservan espacios, un solo `done`/`error` por turno,
  turno fallido no cuenta ni se persiste, desconexión del cliente ya NO mata el turno (la respuesta se guarda y el cliente
  la recupera), `POST /api/chat/cancel`, latido SSE, historial atómico con cuarentena de archivo corrupto y tope de 500,
  kill de grupo de procesos en POSIX, `TURN_TIMEOUT_MS` opcional, validación de engine/sessionId/tamaño.
- **Entrega 2, seguridad**: escape de HTML en Blueprint/errores/tracker, validación de colores y fuentes, rechazo de `/api/*`
  con `Referer` de `/preview/*` (se mantiene `allow-same-origin` por la cookie SameSite=Strict), CORS sin 500, login que
  limpia contador, `TRUST_PROXY` opcional, aviso por secretos de `.env.example`, `formatText` sin `/\host` ni falsos swatches.
- **Entrega 3, flujo y prompts**: `detectAction` solo detecta las 2 compuertas (por la última pregunta de aprobación),
  estado de compuertas (`approved`/`adjusting`) en `chat_history.json`, prompt compacto con invariantes de formato,
  `APP_ROOT` absoluto para scripts/plantillas, digest del state, directivas 18 (revisiones) y 19 (contrato de estado),
  `POST /api/project/new`, `extractProjectName` y `isFlowMessage` más estrictos, Design System de 14 secciones,
  `verify_fidelity --check A --file`, guías de fase corregidas.
- **Entrega 4 (parcial), frontend**: opciones numeradas del agente como botones dentro de la burbuja (sin bandeja),
  botón Detener, sin doble envío, recuperación tras corte de conexión y reanudación tras F5 (`busy` en `/api/chat/history?sessionId=`),
  reinicio con modal accesible + "Nuevo proyecto", `store` seguro para localStorage, aviso multi-pestaña, reconexión del canal de
  entregables, login con mensajes del servidor, pestañas con ARIA, toggle chat/preview en móvil, `100dvh`, sin CDN de Tailwind.

## Pendiente (Entrega 4, resto)

1. **Verificar visualmente en la próxima sesión** (`node` + Chromium): el botón Detener (`.btn-send.is-stop`) en la captura
   se vio atenuado en vez de rojo (probable conflicto con `button:disabled`/estilos globales); comprobar el modal de reinicio
   ya abierto (la captura salió a mitad de animación) y la vista móvil (`Ver Preview` sin salto de línea).
2. **Docs**: `README.md` (puerto 8080, 5 fases, nº real de tests, variables `AUTH_*`, `SESSION_SECRET`, `HOST`, `ALLOWED_ORIGINS`,
   `TRUST_PROXY`, `TURN_TIMEOUT_MS`, `*_BIN`, cookie `secure` con `NODE_ENV=production`, subida/descarga), `TRANSICION_Y_ROADMAP.md`
   (marcar como hechos los ajustes 2-4), `.env.example` completo (añadir `WORKSPACE_DIR`, `LLAMACPP_HOST`, `OLLAMA_HOST`,
   `OLLAMA_MODEL`, `TRUST_PROXY`, `TURN_TIMEOUT_MS`), ayuda de `homium-site-builder.sh` (puerto por defecto 8080).
3. **DX**: `packageManager` y `private` en `package.json`; scripts `lint`/`check` (`node --check` sobre server, lib, core, public);
   `dev` con `node --watch`; `.gitignore` de `test/scratch_test_*`; workflow `.github/workflows/ci.yml` (ubuntu + windows,
   Node 18/20/22, `pnpm test`); `install.sh` con `set -e` y, solo si no existe `.env`, generarlo con `AUTH_PASS` y
   `SESSION_SECRET` aleatorios; `scripts/setup.cjs` (usar `@playwright/test`, comprobar `.env` y puerto, salir con error si falla la instalación).
4. **Limpieza**: `CLAUDE.md` ya está actualizado hasta la Entrega 3; añadir la parte de frontend (opciones inline, `sendMessage`,
   `resumeRunningTurn`, `store`) y mencionar `test/e2e-ui.test.js`. `/preview/blueprint` sigue mostrando siempre la pantalla de espera
   (lee `state.brand` del objeto envoltorio de `getState()`, que nunca lo tiene) y la página standalone no funcionaría con `app.js`
   completo: decidir si se arregla con un módulo de render reutilizable o se elimina la ruta.
5. **Opcional (plan original)**: dividir `app.js` en módulos; `--` antes del mensaje en el adapter de opencode (no se pudo probar);
   `compile_design_system.cjs` aún tiene contenido de muestra fijo (ecualizador, auditoría WCAG), por eso el prompt usa la plantilla.

## Decisiones tomadas con el usuario

- Servidor Linux en el puerto 8080 con túnel: no se cambia `HOST`, puerto ni `ALLOWED_ORIGINS`; todo lo nuevo de infraestructura es opt-in.
- Design System de 14 secciones; chips inline en la burbuja (bandeja eliminada); desconexión del cliente deja terminar el turno.
- Commits en inglés, concisos, **sin** `Co-Authored-By`.

## Cómo comprobar en la nueva sesión

```bash
git checkout improvements/review-2026-09
pnpm install
pnpm test                      # incluye el test en navegador (requiere Chromium de Playwright)
pnpm start                     # probar a mano con el motor "Simulador Mock" del selector
```

Puntos a revisar a mano con un motor real: que el agente responda con opciones numeradas y se vean como botones; Detener y
reintento; cortar la conexión a mitad de turno y recargar; compuertas 1 y 2 (aprobar, pedir ajustes, F5); que los scripts
(`extract_reference_dna`, `audit_design_system`, `verify_fidelity`) se ejecuten desde el workspace con la ruta absoluta de `APP_ROOT`.
