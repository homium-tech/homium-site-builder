# Fase 4: VALIDACIÓN VISUAL

## Rol del Asistente
Lead Design System Documentation Engineer & Visual Specification Writer. Redacción técnica rigurosa y directa orientada a especificaciones, sin preámbulos ni adulación.

---

## Protocolo de Generación en 2 Pasos

```
[design-system-state.json]
       ↓
[Etapa 4.1: [Brand]_Design_System.md]   → spec completo de 5 fases
       ↓
[Etapa 4.2: [Brand]_Design_System.html] → showcase vivo con tema dinámico del cliente
       ↓
[Exportación de Código — al completar #sec-code]
       ↓
[Compuerta de Aprobación → Fase 5]
```

---

### Etapa 4.1 — Documento Maestro de Especificación (`[Brand]_Design_System.md`)

1. **Lectura de Estado:** Lee `design-system-state.json` en disco como única fuente de verdad.
2. **Lectura de Plantilla MD:** Lee `templates/design-system.md`.

> [!CRITICAL_RULE]
> **LECTURA OBLIGATORIA DE REFERENCIAS TÉCNICAS (NON-BYPASSABLE):** Antes de redactar las secciones de foundations y componentes, el asistente DEBE leer con `view_file`:
> - [`references/token-architecture.md`](../token-architecture.md) → capas de tokens W3C, rampas HCT, densidad dual, elevación, motion, breakpoints.
> - [`references/component-catalog.md`](../component-catalog.md) → catálogo atómico completo.
> - [`references/interactive-states.md`](../interactive-states.md) → 6 estados obligatorios por componente.
> - [`references/accessibility-checklist.md`](../accessibility-checklist.md) → matriz de contraste WCAG AAA.

3. **Completar todas las secciones §1–§5** de la plantilla con los datos reales de `design-system-state.json`:
   - **§1 Discovery & Estrategia de Marca:** propósito, modelo de negocio, logo, nivel de fidelidad, referencias, ecualizador de 14 ejes, ficha forense de 6 dimensiones.
   - **§2 Foundations:** tokens W3C con rampas HCT 13 tonos, escala tipográfica completa verbatim de `state.typography`, grilla 5 breakpoints, densidad dual, elevación, iconografía.
   - **§3 Componentes:** catálogo completo de átomos/moléculas/organismos aprobados en Fase 3 con 6 estados por componente interactivo.
   - **§4 Auditoría WCAG 2.2 AAA:** matriz de contraste de todos los pares críticos (texto/fondo, estados activos, focus ring) con ratios medidos.
   - **§5 Handoff de Código:** bloque `:root` completo con TODOS los tokens del sistema + formato de exportación elegido en la Etapa 4.3.

4. **Adaptaciones por la estructura de 5 fases** (sin sitemap ni selección de stack):
   - §1.1: No incluir campos de `Frontend Framework`, `CSS Framework` ni `Tipo de Sitio` — el skill no cubre selección de stack.
   - §1.3: Omitir completamente la sección "Arquitectura de Páginas y Mapa del Sitio" — la fase sitemap fue eliminada del flujo.
   - §5.2: Incluir el bloque Tailwind CSS solo si `state.export_format === "tailwind"` (se confirma en la Etapa 4.3).

5. **Nombre del archivo:** `[BrandSlug]_Design_System.md` donde `BrandSlug` es el valor de `state.brand.name` en snake_case sin acentos ni caracteres especiales (ej: `"Acme Corp"` → `Acme_Corp_Design_System.md`).

---

### Etapa 4.2 — Showcase de Design System (`[Brand]_Design_System.html`)

#### Base estructural

Lee `templates/design-system.html`. Es la base estructural y de código del showcase.

**MANTENER INTACTO (no modificar):**
- Todo el CSS de layout y responsive: `.app-layout`, `.left-rail-sidebar`, `.main-viewport`, `.doc-section`, `.ds-block`, `.ds-stage`, `.ds-tokens`, `.dsc-*`, `.homium-card`, `.tech-table`, `.swatch-card`, `.type-scale-table`, `.modal-overlay`, `.to-top`, `@media print`, todos los `@media (max-width:...)`.
- El patrón "Component Block" (`.ds-block` con `.ds-stage` + `.ds-tokens`).
- El script de ScrollSpy para la navegación activa del rail y el `dsToggleGroup` de grupos colapsables.
- El botón "Volver arriba".
- La barra de navegación móvil (`.mobile-nav`).

**ADAPTAR:**
- El bloque de paleta HOMIUM en `:root` → paleta dinámica del cliente.
- El logo HOMIUM en el left rail → logo o nombre del cliente.
- El número y etiquetas de secciones en el nav → 14 secciones de 5 fases.
- Todo el contenido HTML de las secciones → datos reales del cliente desde `state.json`.

---

#### Adaptación de cromatismo del showcase (HOMIUM → Cliente)

Reemplaza el bloque de variables HOMIUM de la plantilla con tokens derivados de `design-system-state.json`. El showcase usa los colores reales del cliente para su propio chrome (left rail, hovers, eyebrows, active states, dots del nav):

```css
:root {
  /* ========== SHOWCASE CHROME — DERIVADO DE LA PALETA DEL CLIENTE ========== */
  /* Reemplaza por completo el bloque --homium-* de la plantilla base.
     Todos los hexes literales DEBEN existir en palette.allowed_hexes.
     Los rgba() y color-mix() se computan en runtime — son permitidos. */

  /* Fondo y superficies del showcase */
  --bg:              {{BG_PRIMARY_HEX}};         /* state.palette.bg_primary — fondo principal */
  --bg-elevated:     {{BG_ELEVATED_HEX}};        /* tono ligeramente más claro (dark) / más oscuro (light) que --bg */
  --bg-sunken:       {{BG_SUNKEN_HEX}};          /* tono más profundo: left rail, inputs de código */
  --surface-card:    rgba(de bg-elevated, 0.65); /* derivado en runtime con rgba/color-mix */
  --surface-overlay: rgba(de client-primary, 0.04);

  /* Foreground del showcase */
  --fg:         {{TEXT_PRIMARY_HEX}};            /* state.palette.text_primary */
  --fg-muted:   rgba(de fg, 0.72);               /* ~72% del texto primario */
  --fg-subtle:  rgba(de fg, 0.45);               /* ~45% del texto primario */

  /* Acento del chrome (bordes hover, dots activos, eyebrows, chips de sección) */
  --accent:          {{PRIMARY_HEX}};            /* state.palette.primary */
  --accent-2:        {{SECONDARY_HEX}};          /* state.palette.secondary */
  --accent-display:  {{PRIMARY_HEX}};

  /* Links */
  --link:            {{PRIMARY_HEX}};
  --link-hover:      {{PRIMARY_LIGHTER_HEX}};    /* tono claro/tone-70 de la ramp HCT primaria */

  /* Bordes */
  --border:          rgba(de fg, 0.10);
  --border-strong:   rgba(de fg, 0.22);
  --border-cyan:     {{PRIMARY_HEX}};            /* renombrado "border-accent" conceptualmente */
  --focus-ring:      {{PRIMARY_HEX}};

  /* Glows — derivados del primario del cliente (no del cian HOMIUM) */
  --glow-primary:   0 0 24px rgba({{PRIMARY_RGB}}, 0.40);
  --glow-secondary: 0 0 24px rgba({{SECONDARY_RGB}}, 0.35);
  --shadow-card:    0 8px 32px rgba({{SHADOW_RGB}}, 0.20);
  --shadow-lift:    0 18px 48px rgba({{SHADOW_RGB}}, 0.30);

  /* Severity (mantener valores estándar) */
  --sev-critico: #e02547;
  --sev-alto:    #d97516;
  --sev-medio:   #b8860b;
  --sev-bajo:    #2bb077;

  /* Radios (mantener igual que plantilla base) */
  --radius-xs:  4px;
  --radius-sm:  8px;
  --radius-md:  14px;
  --radius-lg:  20px;
  --radius-xl:  28px;
  --radius-pill: 999px;

  /* Spacing (mantener igual) */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px;
  --sp-6: 32px; --sp-7: 48px; --sp-8: 64px; --sp-9: 96px; --sp-10: 128px;

  /* Easing / Duration (mantener igual) */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast: 140ms;
  --dur-med:  260ms;

  /* Typography del showcase — usar las familias del cliente para el chrome */
  --font-sans:    '{{FONT_UI}}', system-ui, sans-serif;
  --font-display: '{{FONT_DISPLAY}}', system-ui, sans-serif;
  --font-mono:    '{{FONT_MONO}}', 'Fira Code', ui-monospace, monospace;

  /* ========== TOKENS CLIENTE (igual que plantilla base, sin cambios) ========== */
  --client-primary:          {{PRIMARY_HEX}};
  --client-secondary:        {{SECONDARY_HEX}};
  --client-accent:           {{ACCENT_HEX}};
  --client-bg:               {{BG_BASE}};
  --client-surface:          {{SURFACE_CARD}};
  --client-text:             {{TEXT_PRIMARY}};
  --client-font-display:     '{{FONT_DISPLAY}}', var(--font-sans);
  --client-font-ui:          '{{FONT_UI}}', var(--font-sans);
  --client-radius-sm:        {{RADIUS_SM}};
  --client-radius-md:        {{RADIUS_MD}};
  --client-radius-lg:        {{RADIUS_LG}};
  --client-radius-full:      {{RADIUS_FULL}};
  --client-border-emphasis:  {{BORDER_WIDTH_EMPHASIS}};
  --border-width-emphasis:   var(--client-border-emphasis, 2px);
  --client-scale-ratio:      {{MODULAR_SCALE_RATIO}};
  --sample-accent:           var(--client-accent, var(--client-primary, var(--accent)));
}

/* ---- dsc-* helpers (mantener igual que plantilla base) ---- */
@keyframes dsc-spin { to { transform: rotate(360deg); } }
:root {
  --dsc-focus:       0 0 0 4px color-mix(in srgb, var(--sample-accent) 40%, transparent);
  --dsc-accent-tint: color-mix(in srgb, var(--sample-accent) 12%, transparent);
}
```

> [!CRITICAL_RULE]
> **ALLOWLIST CROMÁTICA:** TODOS los valores hex literales en `:root` y en el HTML DEBEN existir verbatim en `palette.allowed_hexes`. Los `rgba()` y `color-mix()` computados en runtime desde esos hexes son permitidos. Prohibido inventar tonos intermedios no presentes en la allowlist.

#### Modo oscuro del showcase (`html[data-theme="light"]`)

El bloque de tema claro invierte los mismos roles con la versión invertida de la paleta del cliente:
- **Cliente dark-first:** el light theme usa fondos claros de la paleta (tone-95/99), texto oscuro (tone-10/20).
- **Cliente light-first:** el dark theme (default `data-theme="dark"`) usa fondos oscuros de la ramp, texto claro.

Todos los valores del bloque light-theme también deben estar en `palette.allowed_hexes`.

#### Elemento `<html>` inicial

Detectar el modo del cliente:
- Si `state.palette.bg_is_dark === true` → `<html lang="es" data-theme="dark">`
- Si `state.palette.bg_is_dark === false` → `<html lang="es" data-theme="light">`

#### Logo en el left rail

Reemplaza el bloque SVG de HOMIUM completamente:

```html
<!-- Si state.brand.logo_url tiene valor (extraído por el extractor forense): -->
<a href="#" style="display:inline-block;text-decoration:none;">
  <img src="{{LOGO_URL}}" alt="{{BRAND_NAME}}" style="max-width:160px;height:auto;display:block;">
</a>

<!-- Si no hay URL de logo: -->
<div style="font-family:var(--font-display);font-size:1.25rem;font-weight:700;
            color:var(--fg);letter-spacing:-0.02em;line-height:1.1;">
  {{BRAND_NAME}}
</div>
```

Eliminar también el elemento `<span class="brand-subtitle">DESIGN SYSTEM</span>` — reemplazar con:
```html
<span style="font-size:8.5px;font-weight:500;color:var(--fg-subtle);
             letter-spacing:0.18em;text-transform:uppercase;margin-top:2px;display:block;">
  DESIGN SYSTEM v1.0
</span>
```

#### Título del documento y hero

```html
<title>{{BRAND_NAME}} — Design System</title>
```

Pill de estado:
```html
<div class="client-status-pill">
  <span class="cs-live">Design System</span>
  <span class="cs-sep">/</span>
  <span class="cs-brand">{{BRAND_NAME}}</span>
  <span class="cs-sep">/</span>
  <span class="cs-meta">{{CURRENT_DATE}}</span>
  <span class="cs-sep">/</span>
  <span class="cs-meta">v1.0.0</span>
</div>
```

Headline (sin mencionar HOMIUM):
```html
<h1 class="hero-headline">
  {{BRAND_NAME}}<br>
  <span class="display-italic">Design System.</span>
</h1>
<p class="hero-desc">
  Sistema de diseño vivo y especificación técnica construida bajo el estándar W3C Design Tokens
  y accesibilidad WCAG 2.2 AAA.
</p>
```

#### Navegación del rail (14 secciones, alineadas a 5 fases)

```html
<ul class="rail-nav-list" id="rail-nav">
  <li class="rail-nav-item"><a href="#sec-discovery" class="active"><span class="rail-num">01</span><span class="rail-dot"></span> Resumen de marca</a></li>
  <li class="rail-nav-item"><a href="#sec-equalizer"><span class="rail-num">02</span><span class="rail-dot"></span> Ecualizador de marca</a></li>
  <li class="rail-nav-item"><a href="#sec-visual-dna"><span class="rail-num">03</span><span class="rail-dot"></span> Deconstrucción ADN</a></li>
  <li class="rail-nav-item"><a href="#sec-spacing"><span class="rail-num">04</span><span class="rail-dot"></span> Grilla & espaciado</a></li>
  <li class="rail-nav-item"><a href="#sec-colors"><span class="rail-num">05</span><span class="rail-dot"></span> Paleta & rampas HCT</a></li>
  <li class="rail-nav-item"><a href="#sec-typography"><span class="rail-num">06</span><span class="rail-dot"></span> Sistema tipográfico</a></li>
  <li class="rail-nav-item"><a href="#sec-geometry"><span class="rail-num">07</span><span class="rail-dot"></span> Geometría & sombras</a></li>
  <li class="rail-nav-item"><a href="#sec-icons"><span class="rail-num">08</span><span class="rail-dot"></span> Iconografía oficial</a></li>
  <li class="rail-nav-item"><a href="#sec-motion"><span class="rail-num">09</span><span class="rail-dot"></span> Motion tokens</a></li>
  <li class="rail-nav-item"><a href="#sec-atoms"><span class="rail-num">10</span><span class="rail-dot"></span> Catálogo atómico</a></li>
  <li class="rail-nav-item"><a href="#sec-molecules"><span class="rail-num">11</span><span class="rail-dot"></span> Moléculas UI</a></li>
  <li class="rail-nav-item"><a href="#sec-organisms"><span class="rail-num">12</span><span class="rail-dot"></span> Organismos & bento</a></li>
  <li class="rail-nav-item"><a href="#sec-wcag"><span class="rail-num">13</span><span class="rail-dot"></span> Auditoría WCAG AAA</a></li>
  <li class="rail-nav-item"><a href="#sec-code"><span class="rail-num">14</span><span class="rail-dot"></span> Handoff de código</a></li>
</ul>
```

El select del `.mobile-nav` se puebla automáticamente desde `#rail-nav` por el script existente de ScrollSpy.

#### Contenido de las 14 secciones (poblar desde `state.json`)

| Sección | ID | Fuente en state.json | Fase |
| :--- | :--- | :--- | :--- |
| Resumen de marca | `#sec-discovery` | `brand.*`, `visual_dna.fidelity_mode`, `visual_dna.primary_reference` | Fase 1 |
| Ecualizador de marca | `#sec-equalizer` | `brand_equalizer.*` (14 ejes); omitir si `equalizer_skipped: true` | Fase 1 |
| Deconstrucción ADN | `#sec-visual-dna` | `visual_dna.structural_blueprint.*` (6 dimensiones técnicas) | Fase 1 |
| Grilla & espaciado | `#sec-spacing` | `foundations.spacing_base`, `foundations.density_mode`, breakpoints | Fase 2 |
| Paleta & rampas HCT | `#sec-colors` | `palette.*`, `palette.allowed_hexes`, rampas HCT 13 tonos, modo oscuro | Fase 2 |
| Sistema tipográfico | `#sec-typography` | `typography.*`, escala modular verbatim de `h1_*`/`h2_*`/`body_*` | Fase 2 |
| Geometría & sombras | `#sec-geometry` | `shadows.*`, `border_radius.*`, `focus_ring` | Fase 2 |
| Iconografía oficial | `#sec-icons` | `typography.icon_library`, `icon_style` | Fase 2 |
| Motion tokens | `#sec-motion` | `motion_tokens.*`, `motion_dna.*` | Fase 2/3 |
| Catálogo atómico | `#sec-atoms` | `components.atoms` — todos los átomos aprobados en Fase 3 | Fase 3 |
| Moléculas UI | `#sec-molecules` | `components.molecules` | Fase 3 |
| Organismos & bento | `#sec-organisms` | `components.organisms` | Fase 3 |
| Auditoría WCAG AAA | `#sec-wcag` | `palette.wcag_pairs` — todos los pares con ratio medido y badge PASS/FAIL | Fase 4 |
| Handoff de código | `#sec-code` | Bloque `:root` completo + exportación elegida en la Etapa 4.3 | Fase 4 |

> [!CRITICAL_RULE]
> **MORFOLOGÍA BLOQUEADA (NON-BYPASSABLE):** Todo botón, input y nav_cta en los Component Blocks (`#sec-atoms`, `#sec-molecules`, `#sec-organisms`) DEBE portar la morfología medida en `structural_blueprint.component_dna` (radio, padding, altura, bg/texto) vía `style="..."` inline o vía tokens `--client-*`. El verificador valida radios con tolerancia ±2px.

> [!CRITICAL_RULE]
> **CROMÁTICA DE MUESTRAS (NON-BYPASSABLE):** Todo color hardcodeado en el HTML DEBE pertenecer a `palette.allowed_hexes`. Los swatches de componentes usan `var(--client-primary)` para acciones primarias y `var(--client-accent)` para acentos.

#### Nombre del archivo

`[BrandSlug]_Design_System.html` (mismo slug que el MD de la Etapa 4.1).

---

### Exportación de Código (al completar `#sec-code`)

Al llegar a la sección `#sec-code`, Claude presenta:

> *"¿En qué formato deseas exportar los Design Tokens del sistema?"*
> 1. **CSS Custom Properties `:root`** (Recomendado — directo en el browser)
> 2. **Tailwind CSS `theme.extend`** (para proyectos Tailwind)
> 3. **JSON Style Dictionary** (para pipelines de tokens multiplataforma)
> 4. **SCSS `$variables`** (para proyectos Sass/SCSS)

Luego:
> *"¿Para qué plataforma es la exportación principal?"*
> 1. **Web** (CSS/JS)
> 2. **iOS** (Swift tokens — `UIColor`, `UIFont`)
> 3. **Android** (XML resources — `colors.xml`, `dimens.xml`)

Genera el bloque de exportación correspondiente al final de `#sec-code` en el HTML y en la §5 del MD.

---

### Verificación Mecánica Obligatoria

Tras guardar `[Brand]_Design_System.html`, ejecuta:

```bash
node scripts/audit_showcase.cjs "[Brand]_Design_System.html"
```

Si detecta:
- `{{PLACEHOLDER}}` sin reemplazar → corregir antes de presentar
- Variables CSS requeridas ausentes en `:root` → agregar

Adicionalmente:
```bash
node scripts/verify_fidelity.cjs --state design-system-state.json --check A
```
(Check A: allowlist cromática — ningún hex literal en el HTML fuera de `palette.allowed_hexes`)

---

### Etapa 4.3 — Persistencia y Confirmación de Exportación

Guarda en `design-system-state.json`:
- `export_format`: formato de exportación elegido
- `export_platform`: plataforma destino elegida
- `phase_4_complete: true`

---

## Compuerta de Aprobación de Fase 4

Presenta ambos entregables al usuario:

> *"He generado los entregables de Validación Visual:*
> - *`[Brand]_Design_System.md` — Especificación completa del sistema (foundations, componentes, WCAG, tokens)*
> - *`[Brand]_Design_System.html` — Showcase vivo del Design System con los colores, tipografía y componentes reales de la marca*
>
> ¿Apruebas el sistema de diseño para proceder a la **Fase 5 (PROTOTIPO INTERACTIVO)** donde se construirán las 3 pantallas en `prototype/`?"*

> [!CAUTION]
> **REGLA ESTRICTA:** NO escribir código de la Fase 5 hasta que el usuario dé su aprobación explícita (*"Aprobado"*, *"Proceder"*, *"Sin cambios"*). Si el usuario solicita ajustes, se actualizan los entregables antes de avanzar.
