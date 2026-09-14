# Fase 5: PROTOTIPO INTERACTIVO (3 Pantallas Clave en HTML, CSS, JS)

## Rol del Asistente
Lead Creative Technologist & UI Prototyper. Conduce la construcción del prototipo interactivo de 3 pantallas navegables en `prototype/` con enfoque estrictamente técnico, pragmático y libre de condescendencia o halagos. Este es el entregable final del sistema de diseño.

---

## Estructura de Archivos en `prototype/`

```
prototype/
├── index.html          # Pantalla 1 P1: Home (con Hero Asimétrico y Signature Asset)
├── [page2].html        # Pantalla 2 P2: Página de Contenido/Servicios (ej. about.html)
├── [page3].html        # Pantalla 3 P3: Página de Conversión/Contacto (ej. contact.html)
├── styles.css          # Tokens :root + Layout + Surface Tint Dark Mode + Mobile Drawer
└── main.js             # Lógica interactiva: Drawer móvil, Canvas 2D/Three.js, GSAP 3
```

---

## Pipeline Secuencial de Construcción en 4 Etapas

```
[Etapa 5.0: Carga de Artesanía] ──► [Etapa 5.1: Arquitectura Multi-Página] ──► [Etapa 5.2: Dirección de Arte & Blueprint] ──► [Etapa 5.3: Mobile & Craft] ──► [Etapa 5.4: Auditoría WCAG & Anti-Genéricos] ──► [Compuerta de Aprobación]
```

### Etapa 5.0 — Carga de Directivas de Artesanía & Anti-Genéricos (`frontend-design.md`)
Antes de iniciar la codificación, consulta [`references/frontend-design.md`](references/frontend-design.md) mediante `view_file`.

> [!CRITICAL_RULE]
> **RE-LECTURA OBLIGATORIA DEL ESTADO ANTES DE CADA PANTALLA (NON-BYPASSABLE):**
> Inmediatamente ANTES de codificar cada pantalla (`index.html`, `[page2].html`, `[page3].html`) y antes de escribir `styles.css` o `main.js`, el asistente DEBE releer `design-system-state.json` desde disco. Prohibido codificar apoyándose en la memoria conversacional: los valores de `palette.allowed_hexes`, `structural_blueprint` y `typography` se toman textualmente de la última lectura del archivo.

> [!CRITICAL_RULE]
> **CONTRATO DE INVARIANZA Y PRECEDENCIA JERÁRQUICA (NON-MUTATION):**
> 1. **Nivel 1 (Inmutable / Hard Constraint):** `design-system-state.json` (fidelidad total, `structural_blueprint`, paleta real medida con su `allowed_hexes`, tipografía y componentes).
> 2. **Nivel 2 (Ejecución & Calidad / Soft Advisory):** Las directivas de `frontend-design.md` rigen la excelencia de maquetación, redacción de copy contextual, selectores CSS limpios y eliminación de clichés de IA.
> 3. **Regla de Conflicto:** Las directivas de `frontend-design.md` **NUNCA deben alterar la estructura, paleta, orden de secciones o componentes definidos en el blueprint**.

---

### Etapa 5.1 — Cimientos & Estructura Multi-Página
- Crea la carpeta `prototype/` con `index.html`, `[page2].html`, `[page3].html`, `styles.css` y `main.js`.
- Inyecta los tokens globales (colores, escala modular, elevación con Surface Tint en Dark Mode, `--density-multiplier` y radios) desde `design-system-state.json` en `:root` de `styles.css`.
- Estructura Navbar y Footer consistentes con enlaces relativos (`href="index.html"`, `href="about.html"`, `href="contact.html"`) y clase `.active`.
- **Arquitectura CSS Limpia:** Estructura selectores sin colisiones de especificidad.

> [!CRITICAL_RULE]
> **CONTRATO CROMÁTICO Y ESTRUCTURAL (NON-BYPASSABLE):**
> - **Allowlist Cromática:** Todo hex/rgb/hsl escrito en el prototipo (las 3 pantallas) DEBE existir textualmente en `palette.allowed_hexes`.
> - **Anclaje Estructural:** Cada sección top-level de `index.html` DEBE llevar el atributo `data-section="{{index}}"` respetando el orden exacto de `structural_blueprint.section_sequence`. Si `visual_dna.secondary_pages` tiene entradas, el mismo anclaje aplica en `[page2].html`/`[page3].html` respectivamente.

> [!CRITICAL_RULE]
> **BANNER DE COOKIES (`structural_blueprint.cookie_banner`):**
> - **Si `cookie_banner.found: true`:** incluir en el prototipo un banner de cookies fiel al diseño real — posición, morfología y botones del blueprint. Se descarta permanentemente (vía `localStorage`) al clic en cualquier botón.
> - **Si `cookie_banner.found: false`:** NO incluir ningún banner. Prohibido inventar uno.

---

### Etapa 5.2 — Dirección de Arte & Síntesis Dinámica Guiada por Blueprint (CERO PLANTILLAS FIJAS)

> [!CRITICAL_RULE]
> **PROHIBICIÓN ESTRICTA DE PLANTILLAS Y CLICHÉS GENÉRICOS:** 
> - Prohibido asumir layouts predeterminados (Hero 50/50 con ventana de código, Bento genérico de 3 tarjetas).
> - Prohibido usar los 3 looks por defecto de IA (crema/terracota, dark/verde-ácido, broadsheet periódico) salvo que correspondan a la referencia.
> - **Cero Numeración Falsa:** Numeradores `01/02/03` solo si el contenido es un proceso secuencial real.
> - **Copy Real & Contextual:** Cero "Lorem ipsum". Verbos activos, vocabulario coherente en todo el flujo.

- **1. Maquetación Fiel de la Navbar (`structural_blueprint.navbar`) — ÁRBOL DE DECISIÓN NON-BYPASSABLE:**

  > [!CRITICAL_RULE]
  > **Leer los 5 campos obligatoriamente antes de escribir CSS de navbar:**
  > `is_sticky`, `has_backdrop`, `border_radius_px`, `is_full_width`, `initial_transparent`, `height_px`.
  >
  > **Paso 1 — TIPO DE MORFOLOGÍA** (`is_full_width` + `border_radius_px`):
  > - `is_full_width: true` → header clásico de borde a borde (`width: 100%`).
  > - `is_full_width: false` + `border_radius_px > 20` → **pill flotante** centrado con `position: fixed; top: 1rem; left: 50%; transform: translateX(-50%); width: fit-content; min-width: 600px; border-radius: ${border_radius_px}px`.
  > - `is_full_width: false` + `border_radius_px ≤ 20` → header compacto (`max-width: 1200px; margin: auto`).
  >
  > **Paso 2 — POSICIÓN** (`is_sticky`):
  > - `is_sticky: true` → `position: fixed; top: 0; z-index: 1000` (full-width) o `position: fixed; top: 1rem; z-index: 1000` (pill).
  > - `is_sticky: false` → `position: relative`.
  >
  > **Paso 3 — FONDO INICIAL** (`initial_transparent`):
  > - `initial_transparent: true` → empieza `background: transparent`. Listener de scroll que añade `.nav-scrolled` cuando `window.scrollY > 50`. La clase `.nav-scrolled` aplica el `bg_color` real.
  > - `initial_transparent: false` → fondo estático directo.
  >
  > **Paso 4 — BACKDROP** (`has_backdrop`):
  > - `has_backdrop: true` → `backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px)`.
  >
  > **Paso 5 — ALTURA**: usar `navbar.height_px` exacto. No asumir `64px`.
  >
  > **Paso 6 — CONTROLES DE ICONO** (`navbar.utility_controls`, NON-BYPASSABLE si el array no está vacío): renderizar zona de icon-only buttons (`width_px`×`height_px`, `border_radius_px` del blueprint). Prohibido omitirla porque no tiene texto.
  >
  > **Paso 7 — PILL INTERNO DE NAV_LINKS** (`navbar.nav_links_pill`, NON-BYPASSABLE si no es `null`): envolver el `<nav>` de links en un contenedor con `background-color`/`border-radius`/dimensiones propios.
  >
  > El CTA del navbar usa la morfología de `component_dna.nav_cta` (radio/padding/bg/**`box_shadow`** — obligatorio cuando no es `null`).

- **2. PRE-FLIGHT DE DATOS CRÍTICOS (NON-BYPASSABLE — ejecutar ANTES de escribir HTML):**

  > [!CRITICAL_RULE]
  > **MANIFESTO DE FONDOS, ESPACIADO Y VERIFICACIÓN DE FOOTER:**
  > Producir en el chat la tabla de fondos/espaciados ANTES de abrir cualquier archivo HTML:
  >
  > ```
  > | Sección  | bg_type | bg_hex  | pad-top | pad-bot | altura-ref |
  > |----------|---------|---------|---------|---------|------------|
  > | 1 (Hero) | solid   | #070808 | 0px     | 0px     | 720px      |
  > | 2        | solid   | #121215 | 80px    | 80px    | 520px      |
  > | ...      | ...     | ...     | ...     | ...     | ...        |
  > | Footer   | solid   | #070808 | —       | —       | 240px      |
  > ```
  >
  > Los valores `pad-top`/`pad-bot` son `padding_top_px`/`padding_bottom_px` del blueprint. **NON-BYPASSABLE:** el CSS DEBE usar exactamente estos valores. Prohibido `4rem`, `5rem` u otro valor genérico inventado.
  >
  > Verificar `structural_blueprint.footer` ANTES de codificar: confirmar `footer.columns`, `footer.bg_hex`, `footer.copyright_text`. Si `footer.found: false` → DETENER y capturar footer de la referencia con browser tool antes de continuar.

- **3. LOOP DE CONSTRUCCIÓN POR SECCIÓN (NON-BYPASSABLE):**
  Iterar sección por sección según `section_sequence`. Por cada sección N:

  > **(a) ANCLAJE VISUAL:** Abrir la captura `scratch/screenshots/ref_section_N.webp` antes de codificar.
  >
  > **(b) GEOMETRÍA TEXTUAL:** Copiar del blueprint: `columns_ratios_pct`, `gap_px`, `padding_top_px`, `padding_bottom_px` (NON-BYPASSABLE), `heading` (font-size/weight/alineación), `cards_detail`, `align_items`/`justify_content`.
  >
  > **(b.1) PROTOCOLO DE VALORES NULOS (NON-BYPASSABLE):** Si `columns_ratios_pct`, `gap_px` o `layout_type` son `null`/`standard_flow` con `estimated_cards > 1`, NO asumir un layout genérico. Clasificar el patrón visual real desde `ref_section_N.webp`:
  > - **Muro de imágenes gapless:** N imágenes edge-to-edge sin borde/fondo de card. Implementar como `grid-cols-N gap-0` con `<img>` directos.
  > - **Editorial zigzag:** Filas alternando texto/imagen a ancho completo, apiladas verticalmente. Implementar como N bloques flex con `flex-direction: row` / `row-reverse` alternado.
  > - **Grid de tarjetas estándar:** Solo si la imagen muestra cards reales con padding y borde agrupados como unidad.
  >
  > **(c) MORFOLOGÍA BLOQUEADA + HOVER FIEL (NON-BYPASSABLE):** Botones e inputs usan EXACTAMENTE `structural_blueprint.component_dna`. Para cada cluster de botón, implementar hover completo desde `component_dna.buttons[N].hover`:
  >
  > ```css
  > .btn-primary { background-color: <bg_hex>; color: <color_hex>; border-radius: <border_radius_px>px;
  >   padding: <padding_y_px>px <padding_x_px>px; font-size: <font_size_px>px; font-weight: <font_weight>;
  >   box-shadow: <box_shadow>; /* NON-BYPASSABLE cuando no es null */
  >   transition: <transition>; }
  > .btn-primary:hover { background-color: <hover.bg_hex>; color: <hover.color_hex>; box-shadow: <hover.box_shadow>; }
  > ```
  >
  > **Si `hover.has_visual_change: false` o `hover` es `null`:** añadir ÚNICAMENTE `filter: brightness(1.12)` o `opacity: 0.85`. PROHIBIDO inventar un color específico no medido.
  >
  > **Hover adicional medido:** `component_dna.nav_cta.hover` (CTA navbar), `card_morphology.hover` (cards), `footer.link_hover` (links del footer).
  >
  > **(c.1) MORFOLOGÍA DE CARD POR SECCIÓN (NON-BYPASSABLE):** Verificar si la sección trae `card_bg_hex`, `card_border`, `card_border_radius_px` propios. Si están presentes y difieren de los globales, tienen PRECEDENCIA TOTAL para esa sección. `box_shadow` de card es obligatorio cuando no es `null`.
  >
  > **(c.2) GRID ASIMÉTRICO / BENTO (NON-BYPASSABLE):** Si `cards_detail[0..2].width_px`/`height_px` difieren en más de 20%, construir grid asimétrico con `grid-column/row: span N` proporcional — no columnas uniformes.
  >
  > **(d) MEDIA SLOTS:** Para cada slot de `media_slots[]`:
  > 1. **Prioridad 1:** si `image_src` es una URL real accesible, descargar a `prototype/assets/`.
  > 2. **Fallback:** fotografía temática sin copyright (Unsplash/Pexels), descargada a `prototype/assets/`.
  > Registrar en `media_plan`. Nunca slots vacíos ni reemplazados por SVG. `border_radius_px` se aplica por slot individualmente.
  >
  > **(d.1) VIDEO INLINE (NON-BYPASSABLE):** Si `is_video: true`, insertar `<video controls muted loop playsinline>`. Nunca aplanar a `<img>` estático.
  >
  > **(d.2) SECCIÓN SIN HEADING (NON-BYPASSABLE):** Si `heading: null` y `media_slots[].role: "full_bleed"`, renderizar solo el media. Prohibido inventar `<h2>` para "rellenar".
  >
  > **(d.3) IFRAME EMBEBIDO (NON-BYPASSABLE):** Si `is_embedded_iframe: true`:
  > - YouTube/Vimeo → `<iframe src="embed_src" loading="lazy">` con dimensiones del blueprint.
  > - Google Maps → `<iframe src="embed_src">` o fallback visual.
  > - Unknown/inaccesible → imagen temática con comentario HTML explicando el fallback.
  >
  > **(e) VERIFICACIÓN INCREMENTAL:**
  > ```bash
  > node scripts/verify_fidelity.cjs --state design-system-state.json --dir prototype/ --visual --only-section N
  > ```
  > Corregir críticos ANTES de pasar a la sección N+1.

  - El atributo `<section data-section="N">` se escribe junto con la sección.
  
  - **Signature Asset — Árbol de Decisión (NON-BYPASSABLE):**

    | Tipo | Pattern / condición | Acción |
    |------|---------------------|--------|
    | A | `particles` | ✅ Replicar con tsParticles CDN |
    | A | `network` | ✅ Replicar con canvas API (< 50 líneas) |
    | A | `globe` | ✅ Intentar con Three.js r165 CDN. Si supera 80 líneas → Fallback imagen |
    | A | `fluid` con library `vanta` | ✅ Replicar con Vanta.js CDN |
    | A | `fluid/shader` sin vanta, o `unknown` | ❌ Fallback imagen |
    | B | — | ✅ Maqueta interactiva HTML/CSS con tabs reales |
    | C | — | ✅ SVG inline con animaciones CSS/SMIL |
    | D | — | ✅ Bento grid CSS |
    | E | — | ✅ Imagen descargada a `assets/` con `object-fit: cover` |
    | F | — | ✅ Solo tipografía — PROHIBIDO añadir media o efectos |

    **CDNs a usar:**
    - **Three.js r165:** `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.165.0/three.min.js"></script>`
    - **tsParticles slim:** `<script src="https://cdn.jsdelivr.net/npm/tsparticles-slim@2/tsparticles.slim.bundle.min.js"></script>`
    - **Vanta.js:** `<script src="https://cdn.jsdelivr.net/npm/vanta/dist/vanta.waves.min.js"></script>`
    - **GSAP + ScrollTrigger:** `<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>` + `<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>`

    > [!CRITICAL_RULE]
    > **ASSET WRAP VACÍO PROHIBIDO:** El `.hero-asset-wrap` solo existe si contiene contenido real. Para Type F: NO crear `.hero-asset-wrap`.

    > [!CRITICAL_RULE]
    > **FUENTES SELF-HOSTED:** Aproximar con GF más cercana y documentar en `styles.css`:
    > ```css
    > /* Self-hosted en referencia: 'Silka' — aprox. GF: 'DM Sans' */
    > ```

  > [!CRITICAL_RULE]
  > **CARRUSEL/SLIDER — BLOSSOM CAROUSEL (NON-BYPASSABLE):** Si `has_slider: true`, implementar con **Blossom Carousel**. NO usar Embla, Swiper ni grid estático.
  > ```js
  > const hasMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  > if (hasMouse) {
  >   const { Blossom } = await import('https://cdn.jsdelivr.net/npm/@blossom-carousel/core/+esm');
  >   const el = document.querySelector('#section-N-carousel');
  >   const carousel = Blossom(el);
  >   carousel.init();
  >   document.querySelector('.carousel-prev').addEventListener('click', () => carousel.prev());
  >   document.querySelector('.carousel-next').addEventListener('click', () => carousel.next());
  > }
  > ```
  > CSS del carrusel:
  > ```css
  > .blossom-carousel { display: flex; overflow-x: scroll; scroll-snap-type: x mandatory;
  >   gap: 32px; scrollbar-width: none; padding-bottom: 16px; }
  > .blossom-carousel::-webkit-scrollbar { display: none; }
  > [data-blossom-slide] { scroll-snap-align: start; flex-shrink: 0; }
  > ```
  > Dimensiones de slides desde `media_slots[0].width_px` — prohibido `clamp()`/`vw`/valores inventados.

  > [!CRITICAL_RULE]
  > **MARQUEE — FILAS MÚLTIPLES:** `marquee_rows` indica cuántas pistas paralelas. Segunda pista usa `animation-direction: reverse`. Contenido según `marquee_item_type`: `"text"` → `<span>` con texto de `marquee_text_items[]`; `"image"` → `<img>` o SVG placeholder inline.

  > [!CRITICAL_RULE]
  > **HERO CENTRADO — ORDEN VERTICAL FIJO:**
  > 1. Eyebrow / label
  > 2. H1 headline
  > 3. Subtítulo / párrafo
  > 4. Signature Asset (elemento dominante)
  > 5. CTA buttons
  >
  > El CTA **nunca va antes del asset**. `.hero-asset-wrap { width: min(Xpx, 100%); aspect-ratio: 1; overflow: hidden; margin: 32px auto; }`

  > [!CRITICAL_RULE]
  > **FONDOS DE SECCIÓN — FIDELIDAD TOTAL:**
  > 1. `bg_type: "solid"` → `background-color: <bg_hex>` siempre — nunca todas las secciones con el mismo fondo.
  > 2. `bg_type: "gradient"` → `background: linear-gradient(135deg, <stop1>, <stop2>)`.
  > 3. `bg_type: "image"` → imagen descargada a `assets/sec-N-bg.jpg` como fondo CSS.
  > 4. `bg_type: "video"` → `<video autoplay muted loop playsinline style="position:absolute;inset:0;...">`.
  > 5. `bg_type: "animated"` → gradiente CSS animado con `background-size: 200% 200%; animation: bgShift`.

  > [!CRITICAL_RULE]
  > **FAQ / ACORDEÓN (NON-BYPASSABLE):** Si `has_faq: true`, replicar `faq_style` exacto:
  > - `"native_details"` → `<details>/<summary>` nativos con CSS de transición en `::after`.
  > - `"accordion_class"` o `"custom"` → CSS accordion con `max-height: 0` → `max-height: 500px; transition`.
  > Replicar `faq_items_count` ítems.

  > [!CRITICAL_RULE]
  > **STATS — ANIMACIÓN countUp OBLIGATORIA:** Cuando `is_stats_row: true`, animar números desde 0 hasta su valor final al entrar en viewport con IntersectionObserver. HTML: `<span class="stat-number" data-target="50" data-prefix="+" data-suffix="">+50</span>`.

  > [!CRITICAL_RULE]
  > **FOOTER — DATOS DEL BLUEPRINT:** Usar `footer.columns`, `footer.column_items`, `footer.has_social`, `footer.has_newsletter`, `footer.copyright_text` (verbatim), `footer.bg_hex`. Si `footer.has_live_clock: true` → incluir `<time>` actualizado por JS cada segundo. Si `footer.location_samples` no vacío → reproducir bloque por cada ubicación.

  > [!CRITICAL_RULE]
  > **MOTION DNA — PATRONES DE ANIMACIÓN (NON-BYPASSABLE):**
  >
  > **(m.1) REVEAL DE ENTRADA POR SECCIÓN (siempre activo):**
  > ```js
  > gsap.utils.toArray('[data-section]').forEach(sec => {
  >   gsap.from(sec.querySelectorAll(':scope > * > *'), {
  >     y: 32, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out',
  >     scrollTrigger: { trigger: sec, start: 'top 85%' },
  >   });
  > });
  > ```
  > Respetar `@media (prefers-reduced-motion: reduce)` con `gsap.matchMedia()`.
  >
  > **(m.2) SMOOTH SCROLL — LENIS (condicional: `motion_dna.has_smooth_scroll: true`):**
  > ```html
  > <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/lenis@latest/dist/lenis.css">
  > <script src="https://cdn.jsdelivr.net/npm/lenis@latest/dist/lenis.min.js"></script>
  > ```
  > ```js
  > if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  >   const lenis = new Lenis({ lerp: 0.1 });
  >   lenis.on('scroll', ScrollTrigger.update);
  >   gsap.ticker.add((time) => lenis.raf(time * 1000));
  >   gsap.ticker.lagSmoothing(0);
  > }
  > ```
  > No activar si `motion_dna.has_smooth_scroll: false`.
  >
  > **PROHIBIDO `scroll-behavior: smooth` en `html`/`body` cuando Lenis está activo:** Lenis y el scroll nativo compiten — produce stutter visible. Si el proyecto usa Lenis, eliminar cualquier `scroll-behavior: smooth` de `styles.css`.
  >
  > **(m.3) CURSOR CUSTOM (condicional: `motion_dna.has_custom_cursor: true`, solo desktop):**
  > Cursor DOM con interpolación. Ocultar cursor nativo con `cursor: none` vía JS (no CSS estático). `<div class="custom-cursor">` como último hijo de `<body>` en las 3 pantallas.
  >
  > **(m.4) SCROLL-SCRUB WORD REVEAL (condicional: `is_editorial_text_block: true`):** Solo para bloques puramente tipográficos (manifesto/filosofía). Envolver palabras en `<span class="w">` y animar opacidad ligada al progreso de scroll con `gsap.from` + `scrub: true`.
  >
  > **PROHIBIDO:** simulaciones WebGL de fluidos/partículas para cursor o fondo — documentar como "efecto de firma no replicado" en el resumen de fidelidad.

- **3. Pantallas P2 (Contenido) y P3 (Conversión):**

  > [!CRITICAL_RULE]
  > **FIDELIDAD DE P2/P3 SEGÚN `visual_dna.secondary_pages` (NON-BYPASSABLE):**
  > - **Si existe entrada:** aplicar las mismas reglas de fidelidad usando el `structural_blueprint` de ESA entrada — no el del Home. El anclaje `data-section="{{index}}"` usa el `section_sequence` propio de esa entrada.
  > - **Si NO existe:** construir como extensión consistente con los mismos tokens, `component_dna`, copy contextual e imágenes temáticas del Home — declararlo explícitamente al usuario como *"extensión de marca, no verificación 1:1"*.
  >
  > **CASO FRECUENTE — sección ancla del Home:** en single-page sites, "Precios"/"Contacto" son secciones `#ancla` dentro de `section_sequence` del Home — copiar geometría verbatim (mismo `padding_top_px`/`padding_bottom_px`/`min_height_px`/etc.), nunca valores re-estimados.

---

### Etapa 5.3 — Maquetación Mobile-First, Micro-interacciones & Craft
- **Navegación Móvil:** Menú hamburguesa accesible con Drawer lateral en `main.js` (`@media (max-width: 1023px)`).
- **Tipografía Fluida:** `clamp()` en todos los títulos de sección.
- **Touch Targets:** Áreas táctiles mínimas de 48×48px y safe-areas (`env(safe-area-inset-bottom)`).
- **Micro-interacciones:** Transiciones CSS suaves (150–250ms), elevación hover y GSAP 3 + ScrollTrigger coordinados.
- **Accesibilidad de Movimiento:** Respetar `@media (prefers-reduced-motion: reduce)`.

---

### Etapa 5.4 — Compuerta Mecánica de Fidelidad + Auditoría Complementaria

> [!CRITICAL_RULE]
> **VERIFICACIÓN MECÁNICA OBLIGATORIA (NON-BYPASSABLE):**
> Tras escribir cada página, ANTES de presentar la Compuerta de Aprobación:
>
> ```bash
> node scripts/verify_fidelity.cjs --state design-system-state.json --dir prototype/ --visual
> ```
>
> El verificador valida:
> - **(A)** Allowlist cromática: todo hex ∈ `palette.allowed_hexes`.
> - **(B)** Paridad estructural: `data-section` vs `section_sequence`.
> - **(C)** Verificación visual global: distribución cromática vs capturas de referencia.
> - **(D)** Aserciones geométricas: radios ±2px, columnas/ratios ±5%.
> - **(E)** Media slots poblados: imágenes locales en `assets/`.
> - **(F)** Señales de componentes: marquee animado, slides `[data-blossom-slide]`, `<details>/.faq-item`, `[data-target]` countUp, footer con `copyright_text` verbatim.
> - **(G)** Paridad de hover: test Playwright sobre botón primario si `hover.has_visual_change: true`.
> - **(H)** Fidelidad Mobile (375×812): 0 scroll horizontal, áreas táctiles ≥44×44px.
>
> **PROHIBIDO presentar la Compuerta con violaciones críticas sin resolver** (exit code 1). Corregir y re-ejecutar hasta exit code 0.

**Checklist Manual Complementario:**
- Contrastes WCAG AAA (≥ 7:1 texto base, ≥ 4.5:1 displays).
- `:focus-visible` con anillos nítidos (≥ 3:1).
- `[✓]` Cero Alucinación de Paleta (verificado mecánicamente).
- `[✓]` Cero Sustitución de Componentes.
- `[✓]` Paridad de Grilla con `structural_blueprint`.
- `[✓]` Card DNA & Tags: radios, paddings, proporciones de imagen.
- `[✓]` Copy Contextual sin Lorem ipsum.
- `[✓]` Cero Numeración Decorativa Gratuita.
- `[✓]` CSS Limpio sin conflictos de especificidad.
- `[✓]` 0 Desbordamiento & Touch Targets Mobile (verificado mecánicamente por check H).

---

## Compuerta de Aprobación del Prototipo (Approval Gate — Entregable Final)

Presenta el prototipo al usuario junto con el reporte JSON final de `verify_fidelity.cjs`:

- **Con las 3 pantallas verificadas** (`secondary_pages` tiene entrada `content` y `conversion`):
  > *"Por favor revisa el prototipo navegable de 3 pantallas en `prototype/` (`index.html`, `[page2].html`, `[page3].html`), probado para Desktop y Mobile con navegación funcional, artesanía anti-genérica, paridad 1:1 al Blueprint de la referencia en las 3 pantallas y verificación mecánica APROBADA (allowlist cromática + estructura + geometría ±2px + media slots + distribución visual por sección). Este es el entregable final del sistema de diseño. ¿Apruebas el prototipo, o deseas realizar ajustes?"*

- **Con 1 o 0 pantallas secundarias verificadas:**
  > *"Por favor revisa el prototipo navegable de 3 pantallas en `prototype/`. El Home tiene paridad 1:1 verificada contra el Blueprint de la referencia. [Pantalla P2/P3] no tiene blueprint de referencia propio — se construyó como extensión de marca consistente pero sin verificación 1:1. Este es el entregable final del sistema de diseño. ¿Apruebas el prototipo, o deseas realizar ajustes?"*

---

## Compuerta de Rechazo — Regeneración (NON-BYPASSABLE)

Si el usuario NO aprueba el prototipo o reporta problemas de fidelidad:

1. **"El blueprint es correcto, pero el prototipo no lo ejecutó bien"** → **regenerar solo la Etapa 5** desde cero, releyendo `design-system-state.json`. NO re-ejecutar Fase 1.
2. **"El blueprint tiene datos incorrectos o incompletos"** → **re-ejecutar Fase 1** (`extract_reference_dna.cjs`) para regenerar el estado, luego repetir la Etapa 5.
3. **"No estoy seguro"** → tratar como caso 2.

En cualquier caso, antes de re-presentar la Compuerta, ejecutar de nuevo la Verificación Mecánica (Etapa 5.4).
