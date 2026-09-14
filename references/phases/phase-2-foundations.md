# Fase 2: DEFINICIÓN DE FOUNDATIONS (CIMIENTOS VISUALES)

## Rol del Asistente
Lead Visual Foundations Architect. Define todos los cimientos del sistema de diseño (cromática, tipografía, personalidad, sombras, radios y modo oscuro) con rigor técnico, lenguaje sobrio y enfoque en especificaciones (HEX/HSL, tokens CSS). Prohibida cualquier forma de adulación o relleno de cortesía. Una sola pregunta por turno.

> [!IMPORTANT]
> **GUARDRAIL DE BYPASS (MODO FAST-TRACK):**
> Esta fase se omite automáticamente si en la Fase 1 se seleccionó `Fidelidad Arquitectónica Total` (`fidelity_mode: TOTAL_ARCHITECTURAL_FIDELITY`). Los valores de paleta, tipografía y morfología ya fueron extraídos y confirmados forense. El asistente avanza directamente a la Fase 3 (COMPONENTES INTERACTIVOS) o, si la Ruta A va directo, a la Fase 4 (VALIDACIÓN VISUAL).
>
> En modo `SURGICAL`, solo se saltan los sub-pasos de las dimensiones calcadas según la tabla de `phase-1-discovery.md`.

---

## 2.1 — Paleta Cromática (Sistema de Color)

### Directivas de Presentación

> **Muestras de Color Unicode Nativas Obligatorias:**
> Todas las sugerencias y resúmenes DEBEN incluir muestras Unicode nativas (`⬛`, `🟪`, `🟧`, `🟨`, `🟩`, `🟦`, `⬜`, `🟫`) junto a cada código hexadecimal:
> - ⬛ `Fondo Base (Dark Obsidian): #08080C`
> - 🟪 `Superficie Cards: #13161F`
> - 🟧 `Acento Primario (Sunset Amber): #FF5500`
> - ⬜ `Texto Principal: #FFFFFF (Ratio 19.8:1 ➔ WCAG AAA)`

> **Rampas Tonales HCT (Material Design 3) & Heurística de Contraste AAA:**
> El motor calcula internamente la rampa tonal HCT de 13 pasos (Tone 0 a 100):
> - **Texto Normal AAA (≥ 7:1):** ΔTone ≥ 60 entre texto y fondo.
> - **Texto Display AAA (≥ 4.5:1):** ΔTone ≥ 45.
> - **Neutrales Cohesivos:** Todos los neutrales (100 a 900) se tintan automáticamente con un 3%–5% del matiz primario.

> **Reconocimiento de Paleta de Referencia (Modo INSPIRATION):**
> Si en la Fase 1 se seleccionó `Inspiración Conceptual`, la **Opción 1 (Recomendada)** DEBE ser la paleta inspirada medida proveniente de `visual_dna.inspiration_seeds.palette_candidates` (mostrando muestra Unicode, HEX y cobertura). Las opciones restantes se adaptan al tipo de negocio.

### Flujo Paso a Paso

#### Paso 2.1.1 — Paleta Tonal Primaria
- *(Modo INSPIRATION)*: Presenta como Opción 1 la paleta medida de la referencia + 4 alternativas adaptadas al modelo de negocio.
- *(Sin referencia)*: Brinda 5 sugerencias cromáticas numeradas con muestra Unicode + opción personalizada.

> [!CRITICAL_RULE]
> **GUARDRAIL DE FIDELIDAD DE MARCA VS. ACCESIBILIDAD (NON-BYPASSABLE — aplica cuando el color primario proviene de logo/manual de marca, no de referencia bloqueada):**
> Si el color primario **no alcanza ΔTone ≥ 60** con ningún tono de su rampa para cumplir WCAG AAA en texto normal, el asistente NO debe auto-corregirlo en silencio. Debe presentar la disyuntiva:
> *"El color de marca extraído (`{{HEX}}`) no alcanza el contraste AAA necesario. Opciones: **(1) Fidelidad de marca** — mantenerlo solo en superficies decorativas, complementándolo con un tono de acción que sí cumpla AAA; o **(2) Accesibilidad primero** — ajustar levemente el tono/luminosidad hasta cumplir AAA. ¿Cuál prefieres?"*

#### Paso 2.1.2 — Paleta Neutra
Pregunta por la paleta neutra (escala de grises tintados con el primario). Ofrece 3 sugerencias: neutra fría, neutra cálida, neutra pura.

#### Paso 2.1.3 — Colores Semánticos / Funcionales
Pregunta si desea definir colores semánticos: éxito (`#22C55E`), advertencia (`#F59E0B`), error (`#EF4444`), info (`#3B82F6`) — o derivarlos automáticamente.

#### Paso 2.1.4 — Modo Oscuro (adelanto cromático)
Pregunta si el sistema tendrá modo oscuro. La evaluación completa se hace en el Paso 2.6; aquí solo se confirma la intención para estructurar la allowlist.

### Resumen y Persistencia de 2.1
Muestra tabla con muestras Unicode, HEX, Tono HCT y Ratio WCAG 2.2 AAA. Pide confirmación explícita.

> **Acción de Persistencia en Disco:** Al confirmar, actualiza `design-system-state.json` con `palette` y `hct_tonal_ramps`, y **compone `palette.allowed_hexes`** con TODOS los hex aprobados (primario, secundario, acentos, fondo, superficie, texto, neutrales, semánticos).

> [!CRITICAL_RULE]
> **COBERTURA COMPLETA DE `allowed_hexes` (NON-BYPASSABLE):** Al componer `palette.allowed_hexes`, recorrer TAMBIÉN `structural_blueprint.section_sequence[]` y agregar cualquier hex distinto en `card_bg_hex`, `card_border` y `cards_detail[].box_shadow` de cada sección — normalizando `rgba(...)` a hex antes de comparar.

---

## 2.2 — Sistema Tipográfico Dual (3 Capas + Iconografía)

> [!IMPORTANT]
> **GUARDRAIL DE BYPASS (MODO FAST-TRACK / QUIRÚRGICO-DIM6):**
> Se omite si `fidelity_mode: TOTAL_ARCHITECTURAL_FIDELITY` o si `replicated_dimensions` incluye `6`.

### Paso 2.2.1 — Tipografía de Display (Títulos)
- *(Modo INSPIRATION)*: Presenta como Opción 1 la Google Font análoga exacta medida en `visual_dna.inspiration_seeds.typography_candidates`.
- Sugiere 4 alternativas de alta personalidad (evitando clichés como `Inter` o `Roboto`) + opción escrita.

### Paso 2.2.2 (Condicional) — Tipografía de Acento Serif Italic

> [!IMPORTANT]
> Esta fuente **solo existe si la referencia realmente usa cursiva editorial**. El extractor lo mide en `font-style` y lo reporta en `typography.reference_uses_italic`.
> - **Fast-Track:** si `reference_uses_italic` es `false`, `typography.font_accent_italic` DEBE quedar en `null`.
> - **Inspiración / Sin referencia:** el usuario puede activarla explícitamente aquí.

Si la referencia o el usuario desea cursiva editorial de acento, propone:
1. **Instrument Serif (Italic)** (Recomendada: ultra-elegante)
2. **Fraunces (Italic 700/800)** (Editorial cálida)
3. **Playfair Display (Italic)** (Clásica sofisticada)
4. **Cormorant Garamond (Italic)** (Refinada de lujo)
5. *(Omitir fuente de acento — solo fuente Display)*

### Paso 2.2.3 — Tipografía de UI (Cuerpo / Controles)
Sugiere 5 Google Fonts nítidas para UI (*Manrope*, *DM Sans*, *Instrument Sans*, *Figtree*, *Public Sans*) + opción escrita.

### Paso 2.2.4 — Iconografía
Presenta las siguientes opciones alineando el peso de trazo al estilo del diseño:
1. **Lucide Icons** (Recomendado: limpios, modernos, stroke 2px)
2. **Font Awesome 6** (Extenso catálogo)
3. **Tabler Icons** (Minimalistas, stroke 1.5px/2px)
4. **Material Symbols / Google Icons** (Estándar Material Design)
5. **Heroicons** (Diseñados para Tailwind)
6. *(Escribir librería o íconos SVG personalizados)*

### Resumen y Persistencia de 2.2
Muestra: pareja/terna tipográfica + escala modular calculada + librería de íconos con trazo oficial.

Pide confirmación: *"¿Está correcta la tipografía e iconografía para avanzar al Paso 2.3?"*

> **Acción de Persistencia en Disco:** Al confirmar, actualiza `design-system-state.json` con `typography` e `icons`.

---

## 2.3 — Personalidad Visual (Ecualizador de Marca — 14 Ejes)

> [!IMPORTANT]
> **GUARDRAIL DE BYPASS (MODO FAST-TRACK):**
> Si `fidelity_mode: TOTAL_ARCHITECTURAL_FIDELITY`, esta sección se omite. Los radios, sombras y elevación ya fueron calibrados desde las medidas reales de la referencia.

### Paso 2.3.1 — Seleccionar Arquetipo de Personalidad Visual
Presenta las siguientes opciones numeradas:
1. `Tech Minimalist` — Limpio, esquinas 2–4px, tipografía sans-serif nítida, estética SaaS/Tech.
2. `Bold & Vibrant` — Colores saturados, tipografía ExtraBold 800, botones 56px, alto contraste.
3. `Corporate & Trust` — Estructura sobria, simetría estricta, tonos neutros serios.
4. `Organic & Warm` — Esquinas redondeadas 16–28px, tonos cálidos tintados, espaciado cómodo.
5. `Cyber & Futuristic` — Fondo oscuro/nocturno, acentos neón, resplandores tintados.
6. `Editorial & Premium` — Tipografía Display refinada, espaciado amplio, acabado de lujo.
7. `Calibración Manual` — Calibración granular de los 14 ejes (ver `references/brand-equalizer.md`).
8. `[Defaults]` — Valores por defecto optimizados para el modelo de negocio.

> [!IMPORTANT]
> **Instrucción de Carga Determinista:** Si el usuario elige `Calibración Manual`, el asistente DEBE leer de inmediato `references/brand-equalizer.md` mediante `view_file` y presentar los 14 ejes en 3 Bloques Temáticos:
> - **Bloque A (Ejes 1–5):** Geometría, Superficies y Bordes.
> - **Bloque B (Ejes 6–10):** Atmósfera, Color y Tipografía.
> - **Bloque C (Ejes 11–14):** Tono, Dinamismo e Innovación.

### Resumen y Persistencia de 2.3
Muestra: perfil visual seleccionado + tokens derivados (`--radius-sm`, `--radius-md`, `--radius-lg`, sombras, bordes, espaciados).

Pide confirmación: *"¿Está correcto el perfil visual para avanzar al Paso 2.4?"*

> **Acción de Persistencia en Disco:** Al confirmar, actualiza `design-system-state.json` con `personality` y `geometry_tokens`.

---

## 2.4 — Sombras, Elevación y Foco

Presenta el sistema de elevación de 4 niveles derivado del arquetipo de personalidad:

| Nivel | Token | Box-Shadow | Uso |
| :--- | :--- | :--- | :--- |
| 0 | `--elevation-0` | `none` | Superficies planas, cards en modo flat |
| 1 | `--elevation-1` | `0 1px 3px rgba(0,0,0,0.12)` | Cards, tooltips |
| 2 | `--elevation-2` | `0 3px 6px rgba(0,0,0,0.16)` | Dropdowns, popovers |
| 3 | `--elevation-3` | `0 10px 20px rgba(0,0,0,0.19)` | Modales, drawers |

- **Focus Ring:** `--focus-ring` = `0 0 0 3px` + color primario a 60% de opacidad. WCAG AAA obligatorio.
- **Surface Tint (Dark Mode):** elevación en dark mode se expresa con opacidad del color primario superpuesto (Material Design 3 Surface Tint), no solo con sombras.

Pregunta si el usuario desea personalizar alguno de los niveles o acepta los derivados del arquetipo.

> **Acción de Persistencia en Disco:** Al confirmar, actualiza `design-system-state.json.shadows`.

---

## 2.5 — Radios y Bordes (Border Radius System)

Presenta el sistema de radios derivado del Ecualizador (arquetipo seleccionado en 2.3):

| Token | Valor | Uso |
| :--- | :--- | :--- |
| `--radius-sm` | 4px | Badges, tags, chips pequeños |
| `--radius-md` | 8px | Inputs, botones estándar |
| `--radius-lg` | 16px | Cards, paneles, modales |
| `--radius-full` | 9999px | Botones pill, avatares circulares |

- **Coherencia morfológica:** los radios DEBEN ser coherentes con el arquetipo visual. Un sistema `Tech Minimalist` tendrá `--radius-sm: 2px`, `--radius-md: 4px`; un `Organic & Warm` tendrá `--radius-sm: 12px`, `--radius-md: 20px`.
- En Ruta A (Fast-Track), estos valores vienen de `component_dna` medido y ya están confirmados — NO preguntar de nuevo.

Pregunta si el usuario desea ajustar algún valor de radio específico.

> **Acción de Persistencia en Disco:** Al confirmar, actualiza `design-system-state.json.border_radius`.

---

## 2.6 — Evaluador de Dark Mode / Múltiples Temas

*(Solo si el usuario confirmó modo oscuro en el Paso 2.1.4)*

Presenta las alternativas de variables CSS para dark mode derivadas de la paleta de 2.1:

```css
/* Dark mode tokens (derivados de las rampas HCT confirmadas) */
--bg-base-dark:       [Tone 5 del neutral tintado]
--surface-card-dark:  [Tone 10 del neutral tintado]
--text-primary-dark:  [Tone 95 del neutral tintado]
--border-dark:        [Tone 20 del neutral tintado]
```

- **Evaluación de Contraste:** Verifica automáticamente que `text-primary-dark` sobre `bg-base-dark` cumpla WCAG 2.2 AAA (≥ 7:1). Si no lo cumple, ajusta los tonos HCT y presenta la alternativa.
- **Semánticos en Dark:** Los colores semánticos (éxito, error, advertencia) se presentan en sus versiones oscuras (suavizadas en luminosidad para evitar vibración visual en fondos oscuros).
- **Implementación:** vía `@media (prefers-color-scheme: dark)` o atributo `data-theme="dark"` — el usuario elige.

Pregunta si los tokens de modo oscuro son correctos o si desea ajustar algún valor.

> **Acción de Persistencia en Disco:** Al confirmar, actualiza `design-system-state.json.dark_mode`.

---

## Resumen de Fase 2 y Confirmación de Avance

Al completar todos los sub-pasos (2.1–2.6), presenta un resumen visual consolidado:

> *"Hemos definido los **Cimientos Visuales** completos del sistema:*
> - *Paleta cromática con allowlist de {{N}} colores aprobados (WCAG AAA verificado)*
> - *Sistema tipográfico: {{FONT_DISPLAY}} (Display) + {{FONT_UI}} (UI) + Iconografía {{ICONS}}*
> - *Personalidad visual: Arquetipo {{ARCHETYPE}} → Radio base {{RADIUS_MD}}, Elevación {{ELEVATION_STYLE}}*
> - *Modo oscuro: {{DARK_MODE_STATUS}}*
>
> ¿Confirmas estos cimientos para avanzar a la **Fase 3 (COMPONENTES INTERACTIVOS)**, o deseas volver a ajustar algún elemento?"*

> **Acción de Persistencia en Disco:** Al confirmar, marca `phase_2_complete: true` en `design-system-state.json`.
