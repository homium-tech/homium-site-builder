<!-- Plan pendiente de implementar (sesión del 2026-10-01). Copia del plan aprobado en ~/.claude/plans/a-ade-que-quiero-que-adaptive-clarke.md. Para continuar: pedirle a Claude "implementa PLAN_FIDELITY_REPORT.md". Al terminar, borrar este archivo. -->

# Plan: informe de limitaciones de fidelidad + arreglos del extractor y verificador

## Context

En la prueba con https://www.thinkcompany.com/ (modo Fidelidad Arquitectónica Total) el prototipo no se parece a la referencia y el sistema no lo dijo: el verificador aprobó con 0 críticos y la tarjeta del gate 2 solo mostró advertencias de paleta/accesibilidad. Causas medidas (informe previo):

- El extractor capturó el 18 % de la página (2 secciones de 14 396 px): `extract_reference_dna.cjs` líneas ~1109-1111 elige las `<section>` de `<main>` si hay ≥ 2, sin comprobar cobertura; se perdieron `featured-work`, `how-we-help`, `mixtape-cards`, `text-cta` y el footer.
- No se capturó el overlay de menú (solo "Skip Navigation"), posiciones de elementos flotantes, color por palabra del titular, los 2 `<canvas>` (grano) ni el aviso de cookies `aside#think-notice`.
- El verificador compara contra el blueprint (ya recortado) y solo mira el hero para el umbral global; el gate 2 del servidor (`lib/audits/index.js`) solo corre la paleta de `verify_fidelity`.
- Fuentes propietarias (Bagoss, ABC Diatype) se sustituyeron por Syne/Inter sin que el usuario lo vea.

Pedido del usuario: mostrar **qué no se pudo hacer y por qué** ("no se usó X porque es propietaria, en su lugar se usa Y", "no se transmitieron las animaciones", "no se replicó el hero por tal motivo"), más corregir lo que causó la baja fidelidad.

Decisiones del usuario: informe en la **tarjeta del gate 2**; contenido **híbrido** (script calcula lo comprobable + el agente añade motivos en el estado); alcance **informe + arreglos** de extractor/verificador; fuentes propietarias **solo informar** (sin preguntar al usuario).

## Parte A: informe de limitaciones (gate 2)

1. **Nuevo `scripts/fidelity_report.cjs`** (Node puro, sin navegador: el gate corre con timeout de 15 s, `SCRIPT_TIMEOUT_MS` en `lib/audits/index.js`). Entradas: `design-system-state.json` + `prototype/` (+ opcional `scratch/fidelity_verify.json`, ver B6). Salida JSON `{ items: [{ kind, title, reason, instead? }], coverage, verify }`. `kind`: `sustituido` | `no_replicado` | `parcial` | `no_capturado` | `nota_agente`. Items calculados mecánicamente:
   - **Fuentes**: cada familia de `visual_dna.typography.self_hosted_fonts` / `font_display` / `font_ui` que no se carga en el prototipo (no aparece en `font-family` ni `@font-face` de `styles.css`) → "No se usó *Bagoss*: es una fuente propietaria autoalojada por la referencia, sin archivo ni licencia disponible. En su lugar: *Syne*" (el sustituto sale de `font_*_fallback` o de la 2.ª familia de la pila CSS).
   - **Movimiento**: `motion_dna` (smooth scroll, cursor custom, canvas/WebGL, Vimeo/video embebido, librerías GSAP/Lottie/Three detectadas) vs lo que carga el prototipo (Lenis, GSAP, transiciones CSS). Texto tipo "Las animaciones de scroll/reveal y el grano WebGL de la referencia no se transmiten; el prototipo usa …".
   - **Hero / signature asset**: si `signature_asset_type` ∈ {A, B, E} y el prototipo no lo reproduce (canvas ausente, iframe/video sustituido por imagen) → qué falta y por qué (WebGL no copiable, video de tercero, etc.).
   - **Cobertura**: `coverage_pct` del blueprint (ver B1) y secciones sin construir; si el estado es anterior y no trae el dato, "no disponible".
   - **Páginas secundarias** sin blueprint propio → "construidas como extensión de marca, sin verificación 1:1".
   - **Verificación**: similitud hero / página completa del último `--visual`, con fecha.
   - **Notas del agente**: `state.fidelity_notes: [{ topic, reason, substitute }]` se añaden tal cual como `nota_agente` (híbrido).
2. **`lib/audits/index.js`**: en la rama `gate-2` añadir `fidelity` al resultado (`runScript('fidelity_report.cjs', …)` + parseo JSON, mismo patrón que `fidelityAudit`). Informativo: nunca marca `fail` ni oculta el gate. Como `withGateAudit` ya adjunta `audit` al gate y se recalcula en `/api/chat/history`, no hay que tocar `server.js`.
3. **`public/app.js` + `public/styles.css`**: `renderFidelityReport(audit.fidelity)` junto a `renderGateAudit` (línea ~2527, dentro de `renderApprovalGate`): bloque "Qué no se pudo replicar y por qué", un `<details>` por tipo con ítems "no se usó / en su lugar / motivo", todo con `escapeHtml`. Reutilizar clases `gate-audit-*`.
4. **Prompt y guías**: 
   - `core/prompts/system-rules.js` `STATE_CONTRACT`: añadir `fidelity_notes` (array de `{topic, reason, substitute}`) que el agente registra cada vez que sustituye u omite algo de la referencia (fuente, animación, elemento del hero, página).
   - `references/phases/phase-5-prototype.md` (reglas de entrega + texto de la compuerta): obligar a registrar esas notas y a mencionar que la tarjeta las muestra.

## Parte B: arreglos de extractor y verificador

1. **Cobertura de secciones** (`scripts/extract_reference_dna.cjs` ~1057-1114): tras elegir `chosen`, calcular `captured_height / altura de <main>` (o del documento). Si < 70 %, descender a los bloques hijos del contenedor dominante (reutilizar `pickBlocks`, ya existe) y fusionar con las `<section>` encontradas. Guardar `structural_blueprint.global.coverage_pct`, `captured_height_px`, `document_height_px`. Mostrar la cobertura en la ficha 1.5.3 (`references/phases/phase-1-discovery.md`).
2. **Menú**: si `nav_links` solo trae enlaces tipo "skip", buscar `nav` dentro de `[id*="menu" i]`, `[role="dialog"]`, `[class*="menu" i]` y el botón disparador (`button[aria-label*="menu" i]`); guardar `navbar.menu_overlay: { links, trigger }` y el botón en `utility_controls` aunque el `nav` elegido (línea ~823, `qsVisible('nav, header[class]…')`) no lo contenga.
3. **Hero**: `media_slots` con `left_px/top_px/position`; `heading.color_runs` (color por palabra/`span`); `has_canvas` por canvases visibles de tamaño de sección en cualquier parte de la página (hoy línea ~1035 solo mira dentro del hero).
4. **Cookies**: ampliar el detector (líneas ~73-101) a `aside`/elementos `position: fixed` cuyo texto coincida con cookies/analytics/privacy.
5. **Capturas**: una `ref_section_N.webp` por cada sección del blueprint (hoy solo `ref_section_1`).
6. **Verificador** (`scripts/verify_fidelity.cjs` ~1302-1330): puntuar también `full_page` (advertencia < 0.80, crítico < 0.65 en modo estricto); con `--visual`, escribir `scratch/fidelity_verify.json` (resumen + timestamp) para que el informe lo lea; el informe lo marca "desactualizado" si el prototipo es posterior.

Fuera de alcance (se mencionaron en el informe previo y no se eligieron): extraer páginas internas de la referencia, elegir fuentes análogas por métricas, pregunta al usuario sobre fuentes.

## Archivos a modificar
- Nuevos: `scripts/fidelity_report.cjs`
- `scripts/extract_reference_dna.cjs`, `scripts/verify_fidelity.cjs`
- `lib/audits/index.js`
- `public/app.js`, `public/styles.css`
- `core/prompts/system-rules.js`, `references/phases/phase-1-discovery.md`, `references/phases/phase-5-prototype.md`
- Tests: `test/scripts.test.js` (fidelity_report con estado/prototipo de fixture: fuente sustituida, animación no replicada, notas del agente, estado antiguo sin cobertura), `test/client-render.test.js` (render + escape), `test/server-gates.test.js` (el gate 2 trae `audit.fidelity`), `test/prompt-contract.test.js` (`fidelity_notes` en el contrato). Si hay Chromium, un fixture HTML local (2 `<section>` + un `div` de 70 % de altura) para probar la cobertura del extractor.

## Verificación
1. `pnpm test` completo.
2. `node scripts/fidelity_report.cjs` sobre `~/Downloads/homium_projects/devsolutions`: debe listar Bagoss→Syne y ABC Diatype→Inter como sustituidas, Lenis/GSAP vs animaciones no transmitidas, canvas/Vimeo del hero, y "cobertura no disponible" (estado previo).
3. Re-ejecutar `extract_reference_dna.cjs https://www.thinkcompany.com/` en un directorio temporal: debe devolver ≥ 6 secciones, `coverage_pct` ≥ 70, links del menú overlay, botón toggle y banner de cookies.
4. Abrir la app (puerto 8080) con un proyecto en gate 2 y comprobar visualmente la tarjeta nueva (y tras F5, que persiste).
5. Revisar que el informe del gate sigue siendo solo informativo (el botón Aprobar no se bloquea) y que tarda < 15 s.
