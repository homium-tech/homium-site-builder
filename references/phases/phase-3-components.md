# Fase 3: COMPONENTES INTERACTIVOS (ATOMIC DESIGN)

> Las rutas `references/...`, `templates/...` y `scripts/...` de esta guía son relativas a `<APP_ROOT>` (la ruta absoluta indicada en "HERRAMIENTAS DE LA APP" de tu prompt). No existen dentro del workspace: usa siempre la ruta absoluta.

## Rol del Asistente
Lead Component Systems Architect. Define el catálogo completo de átomos, moléculas y organismos con sus 6 estados interactivos. Tono 100% sobrio, técnico y objetivo, enfocado en especificaciones directas sin frases de adulación o cortesía. Una sola pregunta por turno.

> [!IMPORTANT]
> **GUARDRAIL DE BYPASS (MODO FAST-TRACK):**
> Si en la Fase 1 se seleccionó `Fidelidad Arquitectónica Total`, esta fase se omite. Las morfologías de componentes ya vienen de `structural_blueprint.component_dna` (confirmadas en Fase 1). El catálogo se auto-genera desde esos datos y se presenta para confirmación rápida antes de avanzar a Fase 4.

> **Entregable de esta fase:** catálogo de componentes aprobado y persistido en `design-system-state.json`. La renderización visual en HTML ocurre en la Fase 4 (`[Brand]_Design_System.html`).

---

## Instrucción de Carga Determinista

> [!CRITICAL_RULE]
> Antes de iniciar esta fase, el asistente DEBE leer de inmediato los siguientes archivos de referencia mediante `view_file`:
> - [`references/component-catalog.md`](../component-catalog.md) → fuente de verdad del catálogo atómico completo.
> - [`references/interactive-states.md`](../interactive-states.md) → fuente de verdad de los 6 estados por componente.
>
> Prohibido definir o listar componentes sin haber leído estos archivos.

---

## Metodología Atomic Design

El sistema de componentes se organiza en 3 niveles:

```
Átomos (unidades básicas indivisibles)
  └─► Moléculas (combinaciones de 2+ átomos)
        └─► Organismos (secciones completas de interfaz)
```

**6 estados obligatorios por componente interactivo:**

| Estado | CSS | Descripción |
| :--- | :--- | :--- |
| Default | (sin modificador) | Estado en reposo |
| Hover | `:hover` | Mouse sobre el elemento |
| Active | `:active` | Click/tap en curso |
| Focus | `:focus-visible` | Foco de teclado (WCAG 2.2 obligatorio) |
| Disabled | `[disabled]` / `aria-disabled` | Acción no disponible |
| Loading | `[aria-busy="true"]` | Operación asíncrona en curso |

---

## Formato de Presentación Obligatorio en Chat

> [!CRITICAL_RULE]
> **PROHIBIDO usar `<br>` en celdas de tabla (NON-BYPASSABLE).** El chat renderiza `<br>` como texto literal.
>
> Cada componente (átomo, molécula, organismo) se presenta como **bloque independiente** con esta estructura:
>
> #### [Nombre del Componente]
> - Variantes: `` `clase-1` `` · `` `clase-2` `` · `` `clase-3` ``
> - Geometría: radio Xpx · padding Xpx · altura Xpx
> - Default: [descripción del estado base]
> - Hover: [descripción del cambio visual]
> - Focus: ring 3px WCAG AAA · Active: [escala/fondo]
> - Disabled: opacity 0.45 · cursor not-allowed
> - Loading: spinner inline sin cambio de tamaño
>
> Separar cada componente con `---`. Presentar de a **uno o dos por turno** y pedir confirmación antes de continuar con el siguiente.
>
> **Documentación completa fuera del chat:** además de lo anterior, cada componente guarda en `design-system-state.json` (`components.*`) su **anatomía**, su **comportamiento responsive** y sus **notas de accesibilidad** (rol ARIA, orden de tabulación, atajos de teclado si aplica). Eso NO se pregunta ni se lista en el chat: se redacta en el `[Brand]_Design_System.md` de la Fase 4 (campos `{{anatomy}}`, responsive y accesibilidad de la plantilla).

---

## Etapa 3.1 — Átomos

### Catálogo Universal de Átomos

El asistente presenta cada átomo y pide confirmación o ajuste. Para cada uno:
- Describe su morfología derivada de `component_dna` (radio, padding, colores de la allowlist)
- Muestra las variantes principales
- Lista los 6 estados aplicables (usando `references/interactive-states.md`)

**Átomos a definir:**

1. **Button** — Variantes: `primary`, `secondary`, `ghost`, `destructive`
   - Morfología tomada de `component_dna.buttons[]` (radio, padding, bg, hover)
   - Focus ring: `--focus-ring` WCAG AAA
   - Loading: spinner inline, sin cambio de tamaño

2. **Badge / Tag** — Variantes: `default`, `success`, `warning`, `error`, `info`
   - Radio: `--radius-full` o `--radius-sm` según arquetipo
   - Sin estado disabled/loading

3. **Input de Texto** — Variantes: `default`, `error`, `success`
   - Morfología: `component_dna.inputs[]` (altura, radio, borde)
   - Focus: borde 2px del color primario + `--focus-ring`

4. **Checkbox** — Estados: unchecked, checked, indeterminate, focus, disabled

5. **Toggle / Switch** — Estados: off, on, focus, disabled

6. **Link** — Variantes: `default`, `muted`, `destructive`
   - Hover: subrayado o cambio de color (coherente con `link_hover` del blueprint)

7. **Icon** — Sistema de íconos aprobado en Fase 2.2.4 (inline SVG, 16/20/24px)

8. **Avatar** — Radio: circular (`--radius-full`) o cuadrado (`--radius-md`)

---

## Etapa 3.2 — Moléculas

El asistente presenta cada molécula como combinación de átomos definidos en 3.1:

1. **Card** — Morfología: `card_morphology` del blueprint (radio, borde, bg, sombra, hover)
   - Sub-variantes: `card-media` (con imagen), `card-simple` (solo texto), `card-cta`
   - Aspect ratio de imagen: desde `cards_detail[].image_aspect_ratio`

2. **Form Group** — Label + Input + Helper text + Error message
   - Derivado de `component_dna.inputs[]`

3. **Alert / Toast** — Variantes: success, warning, error, info
   - Icono + texto + botón de cierre opcional

4. **Tabs** — Variantes: `underline` (minimal), `pill` (si arquetipo usa pill)
   - Estado `aria-selected` para tab activo

5. **Dropdown Menu** — Trigger + lista flotante
   - Posición: debajo del trigger, alineado a la izquierda

6. **Select** — Selector de opciones con flecha indicadora (`default`, abierto, `disabled`)
   - Rol `listbox`/`combobox` y navegación por flechas

7. **Search Bar** — Input + botón de búsqueda (o ícono integrado)
   - Variante con filtro (campo de búsqueda + selector de filtro)

> Los **grupos de formularios** se componen a partir de Form Group (punto 2).

---

## Etapa 3.3 — Organismos

Los organismos son secciones completas de interfaz construidas con moléculas:

1. **Navbar / Header** — Fiel al `structural_blueprint.navbar`:
   - 3 zonas: Logo / Nav links (con pill si `nav_links_pill != null`) / CTA + utility_controls
   - Sticky si `is_sticky: true`
   - Móvil: hamburger menu con drawer lateral

2. **Footer** — Fiel al `structural_blueprint.footer`:
   - Columnas según `footer.columns` y `footer.column_items`
   - Social links si `has_social: true`
   - Newsletter inline si `has_newsletter: true`

3. **Hero Section** — Layout según `hero.layout_type` del blueprint
   - Signature Asset según `hero.signature_asset_type`
   - CTAs según `component_dna.buttons[]`

4. **Feature Grid / Bento** — Grilla de cards de características
   - Columnas y ratios según `section_sequence[]`

5. **Modal** — Overlay backdrop + contenedor con `--radius-lg` (organismo: sobrepone una sección completa de interfaz)
   - Focus trap obligatorio (WCAG 2.2)
   - Cerrar con Escape y clic en backdrop

6. **Drawer** — Panel lateral deslizante (menú móvil, carrito, filtros)
   - Focus trap, cierre con Escape y clic en backdrop, `aria-modal="true"`

7. **Pricing Table** — Tarjetas de precio con tier destacado (si aplica al modelo de negocio)

8. **Testimonials / Social Proof** — Cards de testimonial con avatar, nombre y texto

---

## Etapa 3.4 — Motion Tokens

Define los tokens de movimiento del sistema:

| Token | Valor por Defecto | Uso |
| :--- | :--- | :--- |
| `--motion-duration-fast` | 150ms | Micro-interacciones: hover, tooltips, chips (rango 100–200ms) |
| `--motion-duration-medium` | 300ms | Transiciones estándar: modales, dropdowns, fades (rango 300–400ms) |
| `--motion-duration-slow` | 500ms | Transiciones complejas o grandes: drawers, page transitions, reveals (500ms o más) |
| `--motion-easing-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | La mayoría de transiciones |
| `--motion-easing-decelerate` | `cubic-bezier(0, 0, 0.2, 1)` | Elementos que entran |
| `--motion-easing-accelerate` | `cubic-bezier(0.4, 0, 1, 1)` | Elementos que salen |
| `--motion-easing-emphasized` | `cubic-bezier(0.2, 0, 0, 1)` | Transiciones destacadas (hero, cambios de contexto) |

- Si `motion_dna.has_smooth_scroll: true` → implementar Lenis smooth scroll en el prototipo (Fase 5) con CDN `https://cdn.jsdelivr.net/npm/lenis@latest/dist/lenis.mjs`
- Si `motion_dna.has_custom_cursor: true` → implementar cursor personalizado según `cursor_selector`
- GSAP 3 + ScrollTrigger para reveals y stagger animations
- Respetar `@media (prefers-reduced-motion: reduce)` en todos los tokens de movimiento

---

## Resumen de Fase 3 y Confirmación

Al completar átomos, moléculas, organismos y motion tokens, el asistente presenta un inventario consolidado:

> *"Catálogo de Componentes Interactivos aprobado:*
> - *{{N}} Átomos confirmados con 6 estados cada uno*
> - *{{M}} Moléculas derivadas de los átomos*
> - *{{K}} Organismos de sección*
> - *Motion tokens: fast {{T_FAST}}ms / normal {{T_NORMAL}}ms / slow {{T_SLOW}}ms, 4 curvas y alternativa sin animación (prefers-reduced-motion)*
>
> ¿Apruebas el catálogo para avanzar a la **Fase 4 (VALIDACIÓN VISUAL)** donde se generarán `[Brand]_Design_System.md` y `[Brand]_Design_System.html`?"*

> **Acción de Persistencia en Disco:** Al confirmar, actualiza `design-system-state.json`:
> - `components.atoms` — lista de átomos con variantes y morfología aprobada
> - `components.molecules` — lista de moléculas
> - `components.organisms` — lista de organismos
> - `motion_tokens` — objeto con los 7 tokens de movimiento (3 duraciones y 4 curvas)
> - Marca `phase_3_complete: true`
