# Arquitectura de Tokens — Referencia de Homium Site Builder

## Propósito

Este documento define la estructura de tokens de diseño que Homium Site Builder genera. Los tokens siguen el estándar **W3C Design Tokens Community Group** y se organizan en **3 capas**. Cada token se documenta con **formato dual**: token semántico + valor CSS inline.

---

## Formato dual de documentación

> [!IMPORTANT]
> Todo token en el Design System generado se documenta así:
> ```
> var(--token-semantico) (#valor-css-inline)
> ```
> **Ejemplo**: `var(--color-interactive-primary) (#52D9D9)`
>
> Esto permite que el documento sea:
> - **Legible para diseñadores** (ven el color real)
> - **Técnico para desarrolladores** (ven la variable CSS)
> - **Parseable para la Skill 2** (puede extraer ambos valores)

---

## Las 3 capas de tokens

```
┌──────────────────────────────────────────────────────────┐
│  CAPA 3: TOKENS DE COMPONENTE (contexto específico)      │
│  btn-primary-bg: var(--color-interactive-primary)        │
│  card-shadow: var(--elevation-1)                         │
│  input-border-focus: var(--color-interactive-primary)    │
├──────────────────────────────────────────────────────────┤
│  CAPA 2: TOKENS SEMÁNTICOS (intención de uso)            │
│  color-interactive-primary: var(--color-primary-500)     │
│  color-bg-default: var(--color-neutral-100)              │
│  color-on-primary: #052020                               │
├──────────────────────────────────────────────────────────┤
│  CAPA 1: PRIMITIVOS GLOBALES (valores raw)               │
│  color-primary-500: #52D9D9                              │
│  color-neutral-100: #F2F9F9                              │
│  font-size-base: 1rem                                    │
└──────────────────────────────────────────────────────────┘
```

### Capa 1: Primitivos globales

Valores raw que representan la paleta completa. **No se usan directamente en componentes**, solo sirven como referencia para los tokens semánticos.

### Capa 2: Tokens semánticos

Asignan un **significado funcional** a los primitivos. Son los que se usan en las definiciones de componentes.

### Capa 3: Tokens de componente

Asignan tokens semánticos a **partes específicas** de un componente. Son opcionales en el Design System MD pero útiles para la Skill 2.

---

## Categorías de tokens

### 1. COLOR

#### Primitivos globales (Capa 1)

| Token | Descripción | Fuente |
|:---|:---|:---|
| `color-primary-500` | Color primario de la marca | Input del cliente |
| `color-secondary-{name}-500` | Color(es) secundario(s) | Input del cliente |
| `color-accent-{name}-500` | Color(es) de acento (hasta 3) | Input del cliente |
| `color-neutral-100` | Superficie / background (tintado 3% del primario) | Derivado |
| `color-neutral-200` | Superficie secundaria / card bg | Derivado |
| `color-neutral-300` | Bordes sutiles | Derivado |
| `color-neutral-400` | Bordes activos | Derivado |
| `color-neutral-500` | Texto placeholder | Derivado |
| `color-neutral-600` | Texto deshabilitado | Derivado |
| `color-neutral-700` | Texto terciario | Derivado |
| `color-neutral-800` | Texto secundario | Derivado |
| `color-neutral-900` | Texto principal / headings | Derivado |

##### Rampas Tonales Perceptuales HCT (Material Design 3 — 13 Pasos)
Para garantizar uniformidad perceptual y evitar tonos desaturados o sucios, se genera la rampa tonal HCT (Hue-Chroma-Tone) complementaria en 13 pasos estándar:

| Tono HCT | Rol en el Sistema | Uso Semántico Principal |
|:---|:---|:---|
| **Tone 0** | Negro Absoluto (`#000000`) | Límite inferior |
| **Tone 10** | Fondo Dark Extremo / Texto Light Máximo | Fondo Canvas Dark (`#08080C`) / Texto sobre fondo claro |
| **Tone 20** | Superficie Dark Elevada | Fondo de tarjetas Dark / Texto de alto énfasis |
| **Tone 30** | Superficie Dark Secundaria | Bordes y contenedores Dark |
| **Tone 40** | **Acción Principal (Light Mode)** | Botones primarios y CTAs en tema claro (Alto contraste) |
| **Tone 50** | Interacción Media | Estados hover / bordes activos |
| **Tone 60** | Acento Luminoso | Badges, indicadores y gráficos |
| **Tone 70** | **Acción Principal (Dark Mode)** | Botones y acentos luminosos en tema oscuro |
| **Tone 80** | Acento Suave / Foco | Focus rings, selecciones |
| **Tone 90** | Superficie Contenedor Suave | Fondo de badges y alertas suaves |
| **Tone 95** | Superficie Light Secundaria | Fondo de tarjetas y paneles en tema claro |
| **Tone 99** | Superficie Light Base | Fondo general de página en tema claro |
| **Tone 100** | Blanco Puro (`#FFFFFF`) | Texto sobre fondos oscuros (Ratio AAA) |

##### Regla de tintado de neutrales
Los neutrales NO son grises puros. Se tintan con un **3% a 5% del color primario** para crear cohesión visual:

```
neutral-100 base: hsl(H_primario, 10%, 97%)
neutral-200 base: hsl(H_primario, 6%, 92%)
...
neutral-900 base: hsl(H_primario, 15%, 10%)
```

#### Tokens semánticos (Capa 2)

| Token | Referencia | Función |
|:---|:---|:---|
| `color-bg-default` | `var(--color-neutral-100)` | Fondo general del sitio |
| `color-bg-surface` | `var(--color-neutral-200)` | Fondo de cards, secciones |
| `color-bg-elevated` | `#FFFFFF` | Fondo de elementos elevados (modales) |
| `color-text-primary` | `var(--color-neutral-900)` | Texto principal |
| `color-text-secondary` | `var(--color-neutral-800)` | Texto secundario |
| `color-text-disabled` | `var(--color-neutral-600)` | Texto deshabilitado |
| `color-interactive-primary` | `var(--color-primary-500)` | CTAs principales |
| `color-interactive-primary-hover` | Derivado (10% más oscuro) | Hover de CTAs |
| `color-interactive-primary-active` | Derivado (20% más oscuro) | Active de CTAs |
| `color-interactive-secondary` | `var(--color-secondary-{name}-500)` | Acciones secundarias |
| `color-on-primary` | Calculado para contraste WCAG | Texto sobre color primario |
| `color-on-secondary` | Calculado para contraste WCAG | Texto sobre color secundario |
| `color-border-default` | `var(--color-neutral-300)` | Bordes estándar |
| `color-border-focus` | `var(--color-primary-500)` | Bordes en focus |
| `color-status-error` | Rojo/coral accesible | Errores |
| `color-status-warning` | Amarillo accesible | Alertas |
| `color-status-success` | Verde accesible | Confirmaciones |
| `color-status-info` | Azul accesible | Información |

##### Regla de derivación de hover/active

```
hover  = ajustar luminosidad del color base -10%
active = ajustar luminosidad del color base -20%
```

##### Regla de color-on (texto sobre fondos de color)

```
Si luminancia del fondo > 0.5:
  color-on = color oscuro cercano al negro (ej: #052020 tintado con primario)
Si luminancia del fondo ≤ 0.5:
  color-on = #FFFFFF

Luego validar que el contraste cumple WCAG AAA (≥ 7:1 en texto base, ≥ 4.5:1 en displays).
```

---

### 2. TIPOGRAFÍA

#### Primitivos globales

| Token | Descripción | Fuente |
|:---|:---|:---|
| `font-family-display` | Fuente para headings/branding | Input del cliente (Google Font) |
| `font-family-accent-italic` | Fuente de acento para cursivas (Opcional) | Input del cliente (Google Font) |
| `font-family-ui` | Fuente para cuerpo/controles | Input del cliente (Google Font) |

#### Matriz de Escalas Modulares Tipográficas (13 Ratios Matemáticos)
La escala tipográfica no usa incrementos arbitrarios; se calcula aplicando un **ratio de escala modular matemático** derivado automáticamente del tipo de producto y densidad:

| Nombre de la Escala (Intervalo) | Ratio (Proporción) | Contraste Visual | Asignación Automática por Tipo de Sitio / Contexto |
| :--- | :---: | :---: | :--- |
| **Segunda Menor (Minor Second)** | `1.067` | Muy Bajo | Dashboards hiper-densos, terminales, tablas de trading financiero |
| **Segunda Mayor (Major Second)** | `1.125` | Bajo | Aplicaciones web SaaS B2B complejas, paneles de administración |
| **Tercera Menor (Minor Third)** | `1.200` | Bajo - Medio | Sitios corporativos densos, portales de noticias técnicos |
| **Tercera Mayor (Major Third)** | `1.250` | Medio | **E-Commerce, Negocio Local, Restaurante, Blogs** (Estándar versátil) |
| **Cuarta Perfecta (Perfect Fourth)** | `1.333` | Medio - Alto | **Landing Pages de Campaña, Portafolios estándar, Marketing digital** |
| **Cuarta Aumentada (Augmented Fourth)** | `1.414` | Alto | Revistas digitales, blogs de diseño con impacto visual |
| **Quinta Perfecta (Perfect Fifth)** | `1.500` | Alto | Sitios web creativos, agencias interactivas |
| **Sexta Menor (Minor Sixth)** | `1.600` | Muy Alto | Páginas de producto individual de alto impacto |
| **Proporción Áurea (Golden Ratio)** | `1.618` | Muy Alto | **Editorial de Lujo, Fotografía, Moda, Arte** (Titulares masivos) |
| **Sexta Mayor (Major Sixth)** | `1.667` | Extremo | Diseños tipo póster, estética brutalista |
| **Séptima Menor (Minor Seventh)** | `1.778` | Extremo | Títulos heroicos de impacto cinematográfico |
| **Séptima Mayor (Major Seventh)** | `1.875` | Extremo | Portadas mono-producto a pantalla completa |
| **Octava (Octave)** | `2.000` | Extremo | Tipografía de escala monumental (doble exacto) |

#### Tokens semánticos — Escala tipográfica calculada
Cada nivel es `tamaño_base (16px) × (ratio)^n`. Line-heights: `1.1–1.3` en displays; `1.4–1.6` en cuerpo:

| Token | Familia | Weight | Size (rem / px) | Line Height |
|:---|:---|:---|:---|:---|
| `typography-display-hero` | Display | 800 (ExtraBold) | 4.00rem (64px) | 1.1 (110%) |
| `typography-heading-1` | Display | 700 (Bold) | 3.00rem (48px) | 1.2 (120%) |
| `typography-heading-2` | Display | 700 (Bold) | 2.50rem (40px) | 1.2 (120%) |
| `typography-heading-3` | Display | 600 (SemiBold) | 2.00rem (32px) | 1.2 (120%) |
| `typography-heading-4` | Display | 600 (SemiBold) | 1.50rem (24px) | 1.3 (130%) |
| `typography-body-large` | UI | 400 (Regular) | 1.125rem (18px) | 1.5 (150%) |
| `typography-body-base` | UI | 400 (Regular) | 1.00rem (16px) | 1.5 (150%) |
| `typography-body-small` | UI | 400 (Regular) | 0.875rem (14px) | 1.5 (150%) |
| `typography-label-cta` | UI | 600 (SemiBold) | 1.00rem (16px) | 1.0 (100%) |
| `typography-caption` | UI | 500 (Medium) | 0.875rem (14px) | 1.4 (140%) |
| `typography-overline` | UI | 600 (SemiBold) | 0.75rem (12px) | 1.5 (150%) |

---

### 3. ESPACIADO Y DENSIDAD DUAL (Spacing & Density Modes)

El sistema soporta **Densidad Dual** mediante un multiplicador CSS `--density-multiplier`, asignando la escala base óptima según el tipo de producto:
* **Modo Comfortable (Base 8px):** Para sitios web de consumo, landings y e-commerce (`--density-multiplier: 1.0`).
* **Modo Compact (Base 4px):** Para paneles SaaS, dashboards y herramientas profesionales (`--density-multiplier: 0.85` o base 4px).

| Token | Valor Base (8px) | Modo Compacto (4px / 0.85x) | Uso típico |
|:---|:---|:---|:---|
| `spacing-1` | 4px | 4px | Separación mínima interna |
| `spacing-2` | 8px | 6px | Padding interno de badges, chips |
| `spacing-3` | 12px | 8px | Gap entre elementos inline |
| `spacing-4` | 16px | 12px | Padding de inputs, gap de grid |
| `spacing-5` | 20px | 16px | Separación de grupos |
| `spacing-6` | 24px | 20px | Padding de cards |
| `spacing-8` | 32px | 24px | Margen entre secciones |
| `spacing-10` | 40px | 32px | Separación de bloques |
| `spacing-12` | 48px | 40px | Padding de secciones |
| `spacing-16` | 64px | 48px | Margen entre secciones grandes |
| `spacing-20` | 80px | 64px | Padding de hero/secciones principales |
| `spacing-24` | 96px | 80px | Separación entre secciones de página |

---

### 4. FORMA (Shape / Geometry)

| Token | Descripción | Rango típico |
|:---|:---|:---|
| `shape-radius-sm` | Badges, checkboxes, tooltips | 2px — 8px |
| `shape-radius-md` | Inputs, dropdowns, cards pequeñas | 4px — 16px |
| `shape-radius-lg` | Product cards, modales, banners | 8px — 28px |
| `shape-radius-full` | Pill buttons, chips, avatares | 9999px |

> [!NOTE]
> Los valores exactos de border-radius se derivan automáticamente del **análisis geométrico del logo** (Paso 1.4) y del **ecualizador de marca** (eje Orgánica ↔ Sintética).

#### Valores predeterminados por tipo de sitio (sin ecualizador)

| Tipo de sitio | radius-sm | radius-md | radius-lg |
|:---|:---|:---|:---|
| E-Commerce | 8px | 12px | 20px |
| Portfolio | 4px | 8px | 16px |
| Landing Page | 8px | 16px | 28px |
| Negocio Local | 8px | 12px | 20px |
| Restaurante | 8px | 16px | 24px |
| Blog / Magazine | 4px | 8px | 12px |
| SaaS | 6px | 10px | 16px |

---

### 5. ELEVACIÓN Y PROFUNDIDAD (Dual Elevation: Light vs Dark Mode)

El sistema aplica una estrategia dual para garantizar visibilidad en ambos modos:
1. **Modo Claro (Light Mode):** Sombras tintadas con el color secundario/primario de la marca (evitando negro puro sucio).
2. **Modo Oscuro (Dark Mode — Surface Tint de Material 3):** En fondos oscuros (`#08080C`), las sombras no se perciben; la elevación se logra mediante un **tinte de superficie con el color primario (3% a 12%)**.

| Nivel de Elevación | Modo Claro (`box-shadow` tintada) | Modo Oscuro (`Surface Tint` de Material 3) | Uso Semántico |
|:---|:---|:---|:---|
| `elevation-0` | `none` | `none` (Fondo plano L0 `#08080C`) | Lienzo base |
| `elevation-1` | `0px 4px 16px rgba(R, G, B, 0.08)` | `color-mix(in srgb, var(--color-primary-500) 4%, var(--bg-surface))` | Cards, hover de elementos |
| `elevation-2` | `0px 8px 32px rgba(R, G, B, 0.12)` | `color-mix(in srgb, var(--color-primary-500) 8%, var(--bg-surface))` | Dropdowns, tooltips, popovers |
| `elevation-3` | `0px 16px 48px rgba(R, G, B, 0.16)` | `color-mix(in srgb, var(--color-primary-500) 12%, var(--bg-surface))` | Modales, drawers, diálogos |
| `focus-ring` | `0 0 0 4px rgba(R_prim, G_prim, B_prim, 0.4)` | `0 0 0 4px rgba(R_prim, G_prim, B_prim, 0.6)` | Indicador de foco visible WCAG AAA |

Donde `R, G, B` son los canales del **color secundario** de la marca, y `R_prim, G_prim, B_prim` son del **color primario**.

---

### 6. MOVIMIENTO (Motion)

#### Tokens de Transición CSS Base
| Token | Valor | Uso |
|:---|:---|:---|
| `motion-duration-fast` | 150ms | Hover, active, checkbox, toggle |
| `motion-duration-medium` | 300ms | Dropdowns, modales, transiciones de página |
| `motion-duration-slow` | 500ms | Drawers, carrito lateral, animaciones de entrada |
| `motion-easing-standard` | `cubic-bezier(0.2, 0.0, 0.0, 1.0)` | Movimiento general |
| `motion-easing-decelerate` | `cubic-bezier(0.0, 0.0, 0.2, 1.0)` | Elementos que entran |
| `motion-easing-accelerate` | `cubic-bezier(0.4, 0.0, 1.0, 1.0)` | Elementos que salen |

<!-- [BETA: GSAP MOTION TOKENS] -->
#### [BETA] Tokens de Coreografía & Easing GSAP
Tokens optimizados para su uso con el motor de animación GSAP 3 y ScrollTrigger:

| Token Semántico | Valor GSAP String | Valor CSS Equivalente | Uso Recomendado en GSAP |
|:---|:---|:---|:---|
| `gsap-ease-default` | `"power2.out"` | `cubic-bezier(0.25, 1, 0.5, 1)` | Entrada suave de tarjetas y revelados |
| `gsap-ease-smooth` | `"power3.out"` | `cubic-bezier(0.22, 1, 0.36, 1)` | Entrada cinematográfica del Hero y títulos |
| `gsap-ease-expressive` | `"expo.out"` | `cubic-bezier(0.16, 1, 0.3, 1)` | Elementos destacados y modales de impacto |
| `gsap-ease-spring` | `"elastic.out(1, 0.75)"` | N/A (Física elástica) | Feedback interactivo de badges e íconos |
| `gsap-duration-hero` | `0.85s` | `850ms` | Duración base para elementos del Hero |
| `gsap-duration-reveal` | `0.60s` | `600ms` | Duración para tarjetas en ScrollTrigger |
| `gsap-stagger-tight` | `0.06s` | `60ms` | Stagger para caracteres o listas densas |
| `gsap-stagger-base` | `0.10s` | `100ms` | Stagger estándar para grupos de tarjetas |
| `gsap-stagger-relaxed` | `0.16s` | `160ms` | Stagger para secciones editoriales amplias |
<!-- [/BETA: GSAP MOTION TOKENS] -->

#### Tokens de Sliders & Carruseles (Blossom & Embla)
| Token Semántico | Valor Base | Uso |
|:---|:---|:---|
| `carousel-gap` | `var(--spacing-4) (16px)` | Separación entre slides |
| `carousel-slide-width-sm` | `clamp(240px, 70vw, 320px)` | Ancho de tarjeta en móvil/compacto |
| `carousel-slide-width-lg` | `clamp(320px, 40vw, 480px)` | Ancho de tarjeta en desktop/editorial |
| `carousel-indicator-dot` | `8px` | Diámetro de indicador inactivo |
| `carousel-indicator-pill` | `24px` | Ancho de indicador activo (pill expandido) |
| `carousel-scroll-snap` | `mandatory` | Tipo de ajuste al scroll nativo |

---

### 7. BREAKPOINTS

| Token | Rango | Columnas | Margen | Gutter | Contexto |
|:---|:---|:---|:---|:---|:---|
| `breakpoint-xs` | 320px — 599px | 4 | 16px | 16px | Mobile Portrait |
| `breakpoint-sm` | 600px — 839px | 8 | 32px | 16px | Tablet Vertical |
| `breakpoint-md` | 840px — 1023px | 8 | 45px | 16px | Tablet Horizontal |
| `breakpoint-lg` | ≥ 1024px | 12 | 48px | 24px | Desktop |
| `breakpoint-tv` | ≥ 1920px | 12 | 24px | 24px | Ultra-Wide |

---

## Convenciones de nombres

### Reglas generales

1. **Formato**: `kebab-case` siempre (ej: `color-interactive-primary`)
2. **Prefijo por categoría**: `color-`, `typography-`, `spacing-`, `shape-`, `elevation-`, `motion-`, `breakpoint-`
3. **Escala numérica**: De 100 a 900 para variaciones (ej: `color-neutral-100` a `color-neutral-900`)
4. **Sufijos de estado**: `-hover`, `-active`, `-disabled`, `-focus` (ej: `color-interactive-primary-hover`)
5. **Prefijo `on-`**: Para textos sobre fondos de color (ej: `color-on-primary`)
6. **Sin abreviaciones crípticas**: `color-bg-default` no `clr-bg-def`

### En CSS variables

```css
:root {
  /* Primitivos: --category-name-scale */
  --color-primary-500: #52D9D9;
  
  /* Semánticos: --category-role-variant */
  --color-interactive-primary: var(--color-primary-500);
  --color-interactive-primary-hover: #3ECBCB;
  
  /* Componente: --component-part-state */
  --btn-primary-bg: var(--color-interactive-primary);
  --btn-primary-bg-hover: var(--color-interactive-primary-hover);
}
```

---

## Formato de salida en el Design System MD

### Ejemplo de Fase 2 generada (tokens de color)

```markdown
### 2.3. Design Tokens: Color

#### Primitivos Globales
* `color-primary-500`: `#52D9D9` (Cyan Base)
* `color-secondary-magenta-500`: `#A446A6` (Magenta Base)
* `color-accent-pink-500`: `#F25E7A` (Coral Base)
* `color-neutral-100`: `#F2F9F9` (Superficie tintada cyan 3%)
* `color-neutral-900`: `#111C1C` (Texto principal)

#### Tokens Semánticos y Cumplimiento WCAG
| Token Semántico | Valor / Referencia | Inline | Contraste | Función |
| `color-bg-default` | var(--color-neutral-100) | #F2F9F9 | N/A | Fondo general |
| `color-interactive-primary` | var(--color-primary-500) | #52D9D9 | N/A | CTA principal |
| `color-on-primary` | — | #052020 | 7.5:1 [PASS: AAA] | Texto sobre primario |
```

> [!TIP]
> Nota que la tabla semántica incluye **ambas columnas**: `Valor / Referencia` (token semántico) y `Inline` (valor CSS directo). Así el documento es útil para diseñadores Y desarrolladores.
