# Design System Documentación Maestra: {{BRAND_NAME}}

**Versión:** 1.0.0  
**Arquitecto / Lead Engineer:** Lead Design Systems Engineer & UI Architect  
**Estándar de Accesibilidad:** WCAG 2.2 AAA (Triple AAA)  
**Plataforma Objetivo:** {{PLATFORM}}  

---

## ÍNDICE
1. [§1 Discovery y Estrategia de Marca](#sección-1-discovery-y-estrategia-de-marca)
   - §1.1 Contexto del Producto
   - §1.2 Ecualizador de Marca (si aplica)
   - §1.3 Ficha Técnica de Deconstrucción Arquitectónica & ADN
2. [§2 Cimientos Visuales (Foundations)](#sección-2-cimientos-visuales-foundations)
3. [§3 Componentes Interactivos y Motion (Atomic Design)](#sección-3-componentes-interactivos-y-motion-atomic-design)
4. [§4 Auditoría de Accesibilidad y Validación Visual](#sección-4-auditoría-de-accesibilidad-y-validación-visual)
5. [§5 Handoff de Código y Exportación de Tokens](#sección-5-handoff-de-código-y-exportación-de-tokens)

---

## SECCIÓN 1: DISCOVERY Y ESTRATEGIA DE MARCA

### 1.1. Contexto del Producto y Propósito
* **Marca:** {{BRAND_NAME}}.
* **Propósito:** {{BRAND_PURPOSE}}.
* **Modelo de Negocio:** {{BUSINESS_MODEL}}.
* **Orientación del Producto:** {{PRODUCT_ORIENTATION}}.
* **Referencias Visuales / Inspiración:** {{VISUAL_REFERENCES}}.

### 1.2. Ecualizador de Marca (Opcional)

<!-- 
  INSTRUCCIÓN PARA EL AGENTE:
  Si el cliente activó el ecualizador de marca, generar la tabla completa con las 14 puntuaciones
  y su traducción a parámetros de UI. Si no lo activó, eliminar esta sección y añadir una nota
  indicando que se usaron valores predeterminados para el tipo de sitio.
-->

{{#IF EQUALIZER_ENABLED}}

* **Origen de la Calibración:** `{{EQUALIZER_SOURCE}}` (Arquetipo Calibrado desde la Referencia Visual / Preset Seleccionado / Calibración Manual)

Calibración estratégica de los 14 ejes de marca para derivar parámetros geométricos y cromáticos:

| Eje de Marca | Puntuación (1 a 5) | Traducción a Arquitectura UI |
| :--- | :--- | :--- |
| Sofisticada ↔ Sencilla y cercana | **{{EQ_1}}** | {{EQ_1_TRANSLATION}} |
| Audaz ↔ Discreta | **{{EQ_2}}** | {{EQ_2_TRANSLATION}} |
| Extrovertida ↔ Reservada | **{{EQ_3}}** | {{EQ_3_TRANSLATION}} |
| Rebelde ↔ Establecida | **{{EQ_4}}** | {{EQ_4_TRANSLATION}} |
| Vibrante ↔ Sobria | **{{EQ_5}}** | {{EQ_5_TRANSLATION}} |
| Minimalista ↔ Maximalista | **{{EQ_6}}** | {{EQ_6_TRANSLATION}} |
| Cruda ↔ Pulida | **{{EQ_7}}** | {{EQ_7_TRANSLATION}} |
| Vintage ↔ Contemporánea | **{{EQ_8}}** | {{EQ_8_TRANSLATION}} |
| Innovadora ↔ Tradicional | **{{EQ_9}}** | {{EQ_9_TRANSLATION}} |
| Orgánica ↔ Sintética | **{{EQ_10}}** | {{EQ_10_TRANSLATION}} |
| Artesanal ↔ Tecnológica | **{{EQ_11}}** | {{EQ_11_TRANSLATION}} |
| Natural ↔ Artificial | **{{EQ_12}}** | {{EQ_12_TRANSLATION}} |
| Robusta ↔ Delicada | **{{EQ_13}}** | {{EQ_13_TRANSLATION}} |
| Local ↔ Global | **{{EQ_14}}** | {{EQ_14_TRANSLATION}} |

{{/IF}}

{{#IF EQUALIZER_DISABLED}}
> **Nota:** No se aplicó el ecualizador de marca. Se usaron valores predeterminados optimizados para el tipo de sitio "{{SITE_TYPE}}".
{{/IF}}

### 1.3. Ficha Técnica de Deconstrucción Arquitectónica & ADN de Referencia

<!-- 
  INSTRUCCIÓN PARA EL AGENTE:
  Documentar la Ficha Técnica exhaustiva de las referencias visuales (URLs o imágenes)
  analizadas bajo las 6 dimensiones técnicas y el nivel de fidelidad pactado.
-->

* **Nivel de Fidelidad Pactado:** `{{FIDELITY_LEVEL}}` (Fidelidad Arquitectónica Total / Inspiración Conceptual / Personalizada Quirúrgica)
* **Referencias Analizadas:** {{VISUAL_REFERENCES_LIST}}

#### Matriz de Deconstrucción en 6 Dimensiones Técnicas:
| Dimensión Técnica | Parámetros Detectados en la Referencia | Implementación en {{BRAND_NAME}} |
| :--- | :--- | :--- |
| **1. Estructura & Grilla Global** | {{REF_GRID_ANALYSIS}} | {{REF_GRID_APPLICATION}} |
| **2. Wireflow & Secuencia de Módulos** | {{REF_MODULES_ANALYSIS}} | {{REF_MODULES_APPLICATION}} |
| **3. Morfología de Componentes** | {{REF_CARDS_ANALYSIS}} | {{REF_CARDS_APPLICATION}} |
| **4. Experiencia, UX & Motion** | {{REF_MOTION_ANALYSIS}} | {{REF_MOTION_APPLICATION}} |
| **5. Atmósfera Cromática & Superficies** | {{REF_ATMOSPHERE_ANALYSIS}} | {{REF_ATMOSPHERE_APPLICATION}} |
| **6. Tratamiento Tipográfico & Craft** | {{REF_TYPOGRAPHY_ANALYSIS}} | {{REF_TYPOGRAPHY_APPLICATION}} |

---

## SECCIÓN 2: CIMIENTOS VISUALES (FOUNDATIONS)

### 2.1. Arquitectura de Grilla, Espaciado y Densidad Dual ({{SPACING_BASE}}px Base)

* **Modo de Densidad Base:** `{{DENSITY_MODE_LABEL}}` (Base {{SPACING_BASE}}px | Multiplicador: `{{DENSITY_MULTIPLIER}}`).
* **Múltiplos oficiales:** {{SPACING_SCALE}}.
* **Área táctil mínima:** 48 × 48px para todos los elementos interactivos móviles (WCAG AAA).

### 2.2. Sistema Responsivo (5 Breakpoints Fluidos)

| Breakpoint | Rango | Columnas | Margen | Gutter | Contexto |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Fluid XS** | 320px - 599px | 4 | 16px | 16px | Mobile Portrait |
| **Fluid SM** | 600px - 839px | 8 | 32px | 16px | Tablet Vertical / Plegables |
| **Fluid MD** | 840px - 1023px | 8 | 45px | 16px | Tablet Horizontal / Laptop pequeña |
| **Fluid LG** | ≥ 1024px | 12 | 48px | 24px | Desktop |
| **Fluid TV** | ≥ 1920px | 12 | 24px | 24px | Pantallas Ultra-Wide |

### 2.3. Design Tokens: Color & Rampas Tonales HCT (Material Design 3)

#### Primitivos Globales (W3C DTCG Layer 1)

* `color-primary-500`: `{{PRIMARY_COLOR}}` ({{PRIMARY_NAME}} Base)
* `color-secondary-{{SECONDARY_NAME}}-500`: `{{SECONDARY_COLOR}}` ({{SECONDARY_LABEL}} Base)
{{#EACH ACCENT_COLORS}}
* `color-accent-{{name}}-500`: `{{value}}` ({{label}} Base)
{{/EACH}}
* `color-neutral-100`: `{{NEUTRAL_100}}` (Superficie Base tintada {{TINT_PERCENT}}%)
* `color-neutral-200`: `{{NEUTRAL_200}}` (Superficie Secundaria / Card BG)
* `color-neutral-800`: `{{NEUTRAL_800}}` (Texto secundario / Muted)
* `color-neutral-900`: `{{NEUTRAL_900}}` (Texto principal / Headings)

#### Rampas Tonales Perceptuales HCT (13 Pasos)
| Tono HCT | Valor Hex | Rol Semántico |
| :--- | :--- | :--- |
| **Tone 10 / 20** | `{{HCT_TONE_10}}` / `{{HCT_TONE_20}}` | Fondos Dark Canvas / Superficie de tarjetas Dark |
| **Tone 40** | `{{HCT_TONE_40}}` | Acción Principal / Botones en Light Mode (Contraste AAA) |
| **Tone 70 / 80** | `{{HCT_TONE_70}}` / `{{HCT_TONE_80}}` | Acción Principal / Acento luminoso en Dark Mode |
| **Tone 90 / 95** | `{{HCT_TONE_90}}` / `{{HCT_TONE_95}}` | Superficie de contenedor / Paneles Light |
| **Tone 99 / 100** | `{{HCT_TONE_99}}` / `{{HCT_TONE_100}}` | Fondo general Light / Texto blanco puro |

#### Tokens Semánticos y Cumplimiento WCAG AAA
| Token Semántico | Valor / Referencia | Inline | Contraste | Función |
| :--- | :--- | :--- | :--- | :--- |
| `color-bg-default` | `var(--color-neutral-100)` | `{{NEUTRAL_100}}` | N/A | Fondo general del sitio |
| `color-bg-surface` | `var(--color-neutral-200)` | `{{NEUTRAL_200}}` | N/A | Fondo de cards y secciones |
| `color-text-primary` | `var(--color-neutral-900)` | `{{NEUTRAL_900}}` | {{CONTRAST_TEXT_PRIMARY}} | Texto principal |
| `color-text-secondary` | `var(--color-neutral-800)` | `{{NEUTRAL_800}}` | {{CONTRAST_TEXT_SECONDARY}} | Texto secundario |
| `color-interactive-primary` | `var(--color-primary-500)` | `{{PRIMARY_COLOR}}` | N/A | CTA principal |
| `color-on-primary` | — | `{{ON_PRIMARY}}` | **{{CONTRAST_ON_PRIMARY}} [PASS AAA]** | Texto sobre primario |
| `color-interactive-secondary` | `var(--color-secondary-{{SECONDARY_NAME}}-500)` | `{{SECONDARY_COLOR}}` | N/A | Acciones secundarias |
| `color-on-secondary` | — | `{{ON_SECONDARY}}` | **{{CONTRAST_ON_SECONDARY}} [PASS AAA]** | Texto sobre secundario |
| `color-status-error` | — | `{{STATUS_ERROR}}` | {{CONTRAST_ERROR}} | Mensajes de error |
| `color-status-warning` | — | `{{STATUS_WARNING}}` | {{CONTRAST_WARNING}} | Alertas |
| `color-status-success` | — | `{{STATUS_SUCCESS}}` | {{CONTRAST_SUCCESS}} | Confirmaciones |

---

### 2.4. Sistema Tipográfico & Escala Modular ({{TYPOGRAPHY_MODULAR_SCALE_NAME}} — Ratio {{TYPOGRAPHY_MODULAR_SCALE_RATIO}})

* **Escala Modular:** `{{TYPOGRAPHY_MODULAR_SCALE_NAME}}` (Ratio {{TYPOGRAPHY_MODULAR_SCALE_RATIO}} derivado para {{SITE_TYPE_LABEL}}).
* **Font Display:** `{{FONT_DISPLAY}}`, sans-serif (Encabezados / Branding).
* **Font UI:** `{{FONT_UI}}`, sans-serif (Cuerpo / Controles / Precios).
* **Font Mono:** `{{FONT_MONO}}`, monospace (Datos / Métricas / Tokens).

{{#IF ACCENT_ITALIC_ENABLED}}
* **Font Accent Italic:** `{{FONT_ACCENT_ITALIC}}` *(Palabras clave de alto impacto / cursivas editoriales)*.
{{/IF}}

<!-- INSTRUCCIÓN PARA EL AGENTE:
     Genera {{TYPOGRAPHY_SCALE_ROWS}} = una fila `| token | familia | weight | size (rem/px) | line-height | letter-spacing |`
     por cada rol tipográfico. Los valores de `display-hero` / `heading-1..4` y sus pesos/LH/tracking
     se toman VERBATIM de `state.typography` (h1_size_px, h1_weight, h1_line_height, h1_letter_spacing,
     h2_*, body_line_height, nav_letter_spacing). NUNCA una escala fija.
     Roles mínimos: display-hero, heading-1..4, body-large, body-base, body-small, label-cta, caption,
     overline, mono. Incluir la fila `typography-accent-italic` SOLO si ACCENT_ITALIC_ENABLED. -->

| Token Semántico | Familia | Weight | Size (REM/px) | Line Height | Letter Spacing |
| :--- | :--- | :--- | :--- | :--- | :--- |
{{TYPOGRAPHY_SCALE_ROWS}}

---

### 2.5. Elevación y Profundidad Dual (Light Shadows vs Dark Surface Tint)

* **Modo Claro (Light Mode):** Sombras tintadas con el matiz secundario/primario para evitar sombras negras sucias.
* **Modo Oscuro (Dark Mode — Surface Tint de Material 3):** Elevación mediante aclarado progresivo de superficie con el tono primario (4% a 12%).

| Token | Modo Claro (`box-shadow`) | Modo Oscuro (`Surface Tint`) | Función |
| :--- | :--- | :--- | :--- |
| `elevation-0` | `none` | `none` | Fondo plano base |
| `elevation-1` | `0px 4px 16px rgba({{SHADOW_RGB}}, 0.08)` | `color-mix(in srgb, var(--color-primary-500) 4%, var(--bg-surface))` | Cards, elevación leve |
| `elevation-2` | `0px 8px 32px rgba({{SHADOW_RGB}}, 0.12)` | `color-mix(in srgb, var(--color-primary-500) 8%, var(--bg-surface))` | Dropdowns, tooltips |
| `elevation-3` | `0px 16px 48px rgba({{SHADOW_RGB}}, 0.16)` | `color-mix(in srgb, var(--color-primary-500) 12%, var(--bg-surface))` | Modales, drawers |
| `focus-ring` | `0 0 0 4px rgba({{FOCUS_RGB}}, 0.4)` | `0 0 0 4px rgba({{FOCUS_RGB}}, 0.6)` | Indicador de Foco obligatorio WCAG AAA |

---

### 2.6. Sistema de Iconografía y Sizing

* **Librería Oficial:** `{{ICON_LIBRARY}}` (ej: Lucide Icons, Font Awesome 6, Tabler Icons)
* **Estilo de Ícono:** `{{ICON_STYLE}}` (ej: Lineal 2px stroke / Sólido / Duotono)

#### Tokens de Escala de Íconos
* `icon-size-sm`: `16px` (Inline badges, helper text, inputs pequeños)
* `icon-size-md`: `20px` (Botones de control, items de menú, inputs estándar - Default)
* `icon-size-lg`: `24px` (Botones prominentes, headers de tarjetas, acciones flotantes)
* `icon-size-xl`: `32px` (Banners, estados vacíos, características destacadas)
* `icon-size-hero`: `48px` (Iconos en secciones hero o modales de confirmación)

#### Reglas de Accesibilidad para Iconografía
* Íconos decorativos (acompañados de texto explicativo): deben incluir `aria-hidden="true"`.
* Íconos de acción sin texto (ej: botón cerrar modal, botón eliminar): deben incluir `aria-label="[Acción]"` e indicador de foco.

---

## SECCIÓN 3: COMPONENTES INTERACTIVOS Y MOTION (ATOMIC DESIGN)

### 3.0. Tokens de Movimiento (Motion Tokens)

#### Transiciones CSS Base
* `motion-duration-fast`: `150ms` (Hover, Active, Checkbox)
* `motion-duration-medium`: `300ms` (Dropdowns, Modales, Transitions)
* `motion-duration-slow`: `500ms` (Drawers, Carrito Lateral)
* `motion-easing-standard`: `cubic-bezier(0.2, 0.0, 0.0, 1.0)`
* `motion-easing-decelerate`: `cubic-bezier(0.0, 0.0, 0.2, 1.0)`
* `motion-easing-accelerate`: `cubic-bezier(0.4, 0.0, 1.0, 1.0)`

<!-- [BETA: GSAP MOTION SPECIFICATION] -->
{{#IF GSAP_ENABLED}}
#### [BETA] Motor de Animación GSAP 3 & ScrollTrigger
* **Engine:** GSAP 3 Core (`gsap.to`, `gsap.from`, `gsap.timeline`) + ScrollTrigger Plugin
* **Easing Tokens:**
  * `gsap-ease-default`: `"power2.out"` (Cards & Grids)
  * `gsap-ease-smooth`: `"power3.out"` (Hero Choreography)
  * `gsap-ease-expressive`: `"expo.out"` (Popups & High-impact CTAs)
  * `gsap-ease-spring`: `"elastic.out(1, 0.75)"` (Interactive micro-bounces)
* **Coreografía & Staggers:**
  * `gsap-duration-hero`: `0.85s`
  * `gsap-duration-reveal`: `0.60s`
  * `gsap-stagger-base`: `0.10s`
* **Políticas de Desempeño y a11y:**
  * Aceleración GPU exclusiva: manipulación de `transform` (`x`, `y`, `scale`) y `autoAlpha` (0 CLS layout shift).
  * `prefers-reduced-motion`: Gestión automática vía `gsap.matchMedia()` suprimiendo movimiento si está activo.
{{/IF}}
<!-- [/BETA: GSAP MOTION SPECIFICATION] -->

{{#IF CAROUSEL_ENABLED}}
#### Motor de Sliders & Carruseles
* **Engine:** `{{CAROUSEL_ENGINE}}` (e.g. Blossom Carousel Native-First / Embla Carousel)
* **Arquitectura de Scroll:** `scroll-snap-type: x mandatory` con momentum nativo en touch (0 KB JS móvil) y pointer drag en desktop.
* **Tokens de Carrusel:**
  * `carousel-gap`: `var(--spacing-4) (16px)`
  * `carousel-slide-width`: `clamp(280px, 80vw, 420px)`
  * `carousel-indicator-size`: `8px` (Activo: `24px` pill)
* **Accesibilidad:** Soporte ARIA `role="region"`, `aria-roledescription="carousel"`, botones prev/next accesibles y navegación por teclado.
{{/IF}}

---

### 3.1. ÁTOMOS

<!-- 
  INSTRUCCIÓN PARA EL AGENTE:
  Generar TODOS los átomos universales (12) + los átomos específicos del tipo de sitio.
  Cada átomo debe documentar sus 6 estados interactivos (si aplican) con formato dual:
  var(--token-semantico) (#valor-inline)
  
  Consultar references/component-catalog.md para la lista completa.
  Consultar references/interactive-states.md para la tabla de estados por categoría.
-->

{{#EACH ATOMS}}
#### Átomo: {{name}} (`.{{class}}`)
* **Anatomía:** {{anatomy}}
* **Variantes (para el Component Block del Showcase):** {{variants}}
* **Props de demostración:** {{sample_props}}
* **Estados Interactivos ({{state_count}} Estados):**
  1. `default`: {{default_state}}
  2. `hover`: {{hover_state}}
  3. `focus-visible`: {{focus_state}}
  4. `active`: {{active_state}}
  5. `disabled`: {{disabled_state}}
  6. `loading`: {{loading_state}}

{{/EACH}}

---

### 3.2. MOLÉCULAS

<!-- 
  INSTRUCCIÓN PARA EL AGENTE:
  Generar TODAS las moléculas universales (4) + las moléculas específicas del tipo de sitio.
-->

{{#EACH MOLECULES}}
#### Molécula: {{name}} (`.{{class}}`)
* **Anatomía:** {{anatomy}}
* **Variantes (para el Component Block del Showcase):** {{variants}}
* **Props de demostración:** {{sample_props}}
* **Estados Interactivos:**
{{#EACH states}}
  * `{{state_name}}`: {{state_description}}
{{/EACH}}

{{/EACH}}

---

### 3.3. ORGANISMOS

<!-- 
  INSTRUCCIÓN PARA EL AGENTE:
  Generar TODOS los organismos universales (4) + los organismos específicos del tipo de sitio.
  Los organismos incluyen requisitos de accesibilidad ARIA específicos.
-->

{{#EACH ORGANISMS}}
#### Organismo: {{name}} (`.{{class}}`)
* **Anatomía:** {{anatomy}}
* **Variantes (para el Component Block del Showcase):** {{variants}}
* **Props de demostración:** {{sample_props}}
* **Accesibilidad ARIA:** {{aria_requirements}}
* **Estados Interactivos:**
{{#EACH states}}
  * `{{state_name}}`: {{state_description}}
{{/EACH}}

{{/EACH}}

---

## SECCIÓN 4: AUDITORÍA DE ACCESIBILIDAD Y VALIDACIÓN VISUAL

**Nivel de conformidad:** WCAG 2.2 AAA (Triple AAA — Contraste mínimo ≥ 7:1 en texto base y ≥ 4.5:1 en displays)

### Contraste de Color

| Par | Foreground | Background | Contraste | Cumple |
| :--- | :--- | :--- | :--- | :--- |
{{#EACH CONTRAST_PAIRS}}
| {{pair_name}} | var(--{{fg_token}}) ({{fg_inline}}) | var(--{{bg_token}}) ({{bg_inline}}) | {{contrast_ratio}} | {{pass_level}} |
{{/EACH}}

### Checklist

<!-- 
  INSTRUCCIÓN PARA EL AGENTE:
  Verificar cada ítem del checklist contra los tokens y componentes generados.
  Marcar como [x] solo si efectivamente se cumple.
  Consultar references/accessibility-checklist.md para los criterios detallados.
-->

* [x] **Contraste de Texto:** Cumple > {{MIN_CONTRAST_NORMAL}} en textos base (≥ 7:1) y > {{MIN_CONTRAST_LARGE}} en displays (≥ 4.5:1) (WCAG 2.2 AAA).
* [x] **Touch Targets:** Todos los botones e inputs cumplen el estándar de 48 × 48px.
* [x] **No solo color:** La comunicación de errores incluye íconos y texto explicativo.
* [x] **Motion Reduced:** `prefers-reduced-motion` integrado reseteando animaciones a 0ms.
* [x] **Navegación por Teclado:** Anillos de foco explícitos (`focus-ring`) en todos los controles interactivos.
* [x] **Semántica ARIA:** Roles y atributos documentados para componentes interactivos.

---

## SECCIÓN 5: HANDOFF DE CÓDIGO Y EXPORTACIÓN DE TOKENS

### 5.1. Variables CSS Pure (`:root`)

<!-- 
  INSTRUCCIÓN PARA EL AGENTE:
  Generar el bloque CSS :root completo con TODOS los tokens definidos en las fases anteriores.
  Incluir: colors, typography, shape, elevation, motion.
  Incluir el media query de prefers-reduced-motion.
-->

```css
:root {
  /* Design Tokens: Colors (Global Primitives) */
  --color-primary-500: {{PRIMARY_COLOR}};
  --color-secondary-{{SECONDARY_NAME}}-500: {{SECONDARY_COLOR}};
  {{#EACH ACCENT_COLORS}}
  --color-accent-{{name}}-500: {{value}};
  {{/EACH}}
  --color-neutral-100: {{NEUTRAL_100}};
  --color-neutral-200: {{NEUTRAL_200}};
  --color-neutral-800: {{NEUTRAL_800}};
  --color-neutral-900: {{NEUTRAL_900}};

  /* Semantic Tokens */
  --color-bg-default: var(--color-neutral-100);
  --color-bg-surface: var(--color-neutral-200);
  --color-interactive-primary: var(--color-primary-500);
  --color-on-primary: {{ON_PRIMARY}};
  --color-interactive-secondary: var(--color-secondary-{{SECONDARY_NAME}}-500);
  --color-on-secondary: {{ON_SECONDARY}};

  /* Status Colors */
  --color-status-error: {{STATUS_ERROR}};
  --color-status-warning: {{STATUS_WARNING}};
  --color-status-success: {{STATUS_SUCCESS}};

  /* Typography — {{FONT_*}} = SOLO el nombre de familia primaria (sin fallbacks); el fallback lo añade la plantilla */
  --font-display: '{{FONT_DISPLAY}}', sans-serif;
  --font-ui: '{{FONT_UI}}', sans-serif;
  --font-mono: '{{FONT_MONO}}', ui-monospace, monospace;

  /* Shape & Radius */
  --radius-sm: {{RADIUS_SM}};
  --radius-md: {{RADIUS_MD}};
  --radius-lg: {{RADIUS_LG}};
  --radius-full: 9999px;

  /* Elevation */
  --elevation-1: 0px 4px 16px rgba({{SHADOW_RGB}}, 0.08);
  --elevation-2: 0px 8px 32px rgba({{SHADOW_RGB}}, 0.12);
  --elevation-3: 0px 16px 48px rgba({{SHADOW_RGB}}, 0.16);
  --focus-ring: 0 0 0 4px rgba({{FOCUS_RGB}}, 0.4);

  /* Motion */
  --motion-fast: 150ms cubic-bezier(0.2, 0.0, 0.0, 1.0);
  --motion-medium: 300ms cubic-bezier(0.2, 0.0, 0.0, 1.0);
  --motion-slow: 500ms cubic-bezier(0.2, 0.0, 0.0, 1.0);
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 5.2. Configuración de Tailwind CSS v4 (Opcional)

<!-- 
  INSTRUCCIÓN PARA EL AGENTE:
  Solo generar esta sección si el cliente eligió Tailwind como framework CSS.
  Si eligió solo vanilla CSS, omitir esta sección.
-->

```css
/* src/styles/app.css */
@import "tailwindcss";

@theme {
  --color-{{BRAND_SLUG}}-primary: {{PRIMARY_COLOR}};
  --color-{{BRAND_SLUG}}-secondary: {{SECONDARY_COLOR}};
  {{#EACH ACCENT_COLORS}}
  --color-{{BRAND_SLUG}}-{{name}}: {{value}};
  {{/EACH}}
  --color-{{BRAND_SLUG}}-bg: {{NEUTRAL_100}};
  --color-{{BRAND_SLUG}}-surface: {{NEUTRAL_200}};
  --color-{{BRAND_SLUG}}-dark: {{NEUTRAL_900}};
  --color-{{BRAND_SLUG}}-on-primary: {{ON_PRIMARY}};
  --font-{{BRAND_SLUG}}-display: "{{FONT_DISPLAY}}", sans-serif;
  --font-{{BRAND_SLUG}}-ui: "{{FONT_UI}}", sans-serif;
  --radius-{{BRAND_SLUG}}-sm: {{RADIUS_SM}};
  --radius-{{BRAND_SLUG}}-md: {{RADIUS_MD}};
  --radius-{{BRAND_SLUG}}-lg: {{RADIUS_LG}};
  --shadow-{{BRAND_SLUG}}-sm: 0 4px 16px rgb({{SHADOW_RGB}} / 0.08);
  --shadow-{{BRAND_SLUG}}-md: 0 8px 32px rgb({{SHADOW_RGB}} / 0.12);
}

/* Variables de runtime que no necesitan utilidades Tailwind */
:root {
  --density-multiplier: {{DENSITY_MULTIPLIER}};
}
```

Las variables `@theme` generan utilidades como `bg-{{BRAND_SLUG}}-primary`, `font-{{BRAND_SLUG}}-ui`, `rounded-{{BRAND_SLUG}}-md` y `shadow-{{BRAND_SLUG}}-sm`. Si el proyecto usa Vite/Astro, instalar `tailwindcss` y `@tailwindcss/vite`; si usa Next.js/PostCSS, instalar `tailwindcss` y `@tailwindcss/postcss`. No generar `tailwind.config.js` ni una lista `content` para un proyecto nuevo.

---
*Documento generado bajo los estándares del W3C Design Tokens Community Group y especificación WCAG 2.2 AAA (Triple AAA).*
