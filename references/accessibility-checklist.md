# Checklist de Accesibilidad — Referencia de Homium Site Builder

## Propósito

Este documento define los criterios de accesibilidad que el Design System generado debe cumplir. Homium Site Builder valida estos criterios durante la generación y documenta su cumplimiento en la **Fase 4** del Design System de salida.

---

## Niveles de conformidad

> **Estándar por defecto:** Homium Site Builder aplica automáticamente el nivel **WCAG 2.2 Level AAA (Triple AAA)** como estándar predeterminado en todos los proyectos para garantizar la máxima legibilidad, accesibilidad universal y cumplimiento riguroso.

| Nivel | Estándar | Contraste texto normal | Contraste texto grande | Uso típico |
|:---|:---|:---|:---|:---|
| **AAA (Por defecto)** | WCAG 2.2 Level AAA | ≥ 7:1 | ≥ 4.5:1 | Máxima accesibilidad |
| **AA (Opcional)** | WCAG 2.2 Level AA | ≥ 4.5:1 | ≥ 3:1 | Estándar mínimo anterior |

> **Texto grande** = ≥ 24px regular o ≥ 18.66px bold (≥ 1.5rem / ≥ 1.17rem bold)

---

## Checklist obligatorio

### 1. Contraste de Color

- [ ] **Texto sobre fondos**: Todos los pares texto/fondo cumplen el nivel elegido
- [ ] **Texto sobre botón primario**: `color-on-primary` sobre `color-interactive-primary` cumple contraste
- [ ] **Texto sobre botón secundario**: `color-on-secondary` sobre `color-interactive-secondary` cumple contraste
- [ ] **Estados de error**: `color-status-error` sobre fondo default cumple contraste
- [ ] **Estados de warning**: `color-status-warning` sobre fondo default cumple contraste
- [ ] **Estados de success**: `color-status-success` sobre fondo default cumple contraste
- [ ] **Placeholders**: Texto placeholder tiene contraste mínimo de 3:1 (informativo, no requisito estricto)

#### Pares de contraste obligatorios a validar

| Par | Foreground | Background | Contraste mínimo AA | Contraste mínimo AAA |
|:---|:---|:---|:---|:---|
| Texto principal | `color-neutral-900` | `color-neutral-100` | 4.5:1 | 7:1 |
| Texto secundario | `color-neutral-800` | `color-neutral-100` | 4.5:1 | 7:1 |
| Texto sobre primario | `color-on-primary` | `color-interactive-primary` | 4.5:1 | 7:1 |
| Texto sobre secundario | `color-on-secondary` | `color-interactive-secondary` | 4.5:1 | 7:1 |
| Texto de error | `color-status-error` | `color-bg-default` | 4.5:1 | 7:1 |
| Texto de éxito | `color-status-success` | `color-bg-default` | 4.5:1 | 7:1 |
| Headings (texto grande) | `color-neutral-900` | `color-neutral-100` | 3:1 | 4.5:1 |

#### Fórmula de contraste y Heurística de Tonos HCT (Material 3)

Se usa la **luminancia relativa** según WCAG 2.2:

```
Contraste = (L1 + 0.05) / (L2 + 0.05)

Donde L1 = luminancia más clara, L2 = luminancia más oscura
```

##### Regla Heurística de Diferencial Tonal HCT (Delta Tone):
Para predecir el cumplimiento de contraste sin alucinaciones matemáticas en el modelo:
* **Para WCAG AAA Texto Normal (≥ 7:1):** La diferencia entre el tono HCT del texto y el del fondo debe ser **ΔTone ≥ 60** (ej. Texto Tone 10 sobre Fondo Tone 90 = ΔTone 80 ➔ **PASS AAA**).
* **Para WCAG AAA Texto Display / Grande (≥ 4.5:1):** La diferencia debe ser **ΔTone ≥ 45**.
* **Para Componentes / Bordes UI (≥ 3:1):** La diferencia debe ser **ΔTone ≥ 30**.

---

### 1.1. Protocolo de No-Alucinación Semiótica y Cultural del Color
> [!IMPORTANT]
> **Guardrail de No-Alucinación Cultural:** El agente NO debe asumir significados universales ni proyectar clichés culturales sobre el color:
> - El rojo se asocia a peligro/error en Occidente, pero a prosperidad y fortuna en Asia.
> - El blanco se asocia a pureza en tradiciones occidentales, pero a luto en varias culturas orientales y africanas.
> - Cualquier inferencia sobre "psicología o significado del color" debe presentarse siempre como una **hipótesis técnica a validar con la audiencia real del cliente**, nunca como una verdad absoluta.

---

### 2. Áreas táctiles (Touch Targets)

- [ ] **Botones**: Mínimo 48 × 48px de área clicable en mobile
- [ ] **Inputs**: Mínimo 48px de altura
- [ ] **Checkboxes / Radios**: Mínimo 48 × 48px de área táctil (el visual puede ser más pequeño, pero el área clicable no)
- [ ] **Links en navegación**: Mínimo 48 × 48px de área táctil
- [ ] **Iconos interactivos** (favorito, cerrar, etc.): Mínimo 48 × 48px
- [ ] **Separación entre targets**: Mínimo 8px entre áreas táctiles adyacentes

> [!IMPORTANT]
> La medida de 48 × 48px es el **área clicable total**, no el tamaño visual del componente. Se puede lograr con padding si el elemento visual es más pequeño.

---

### 3. No solo color

- [ ] **Errores en formulario**: Incluyen ícono `[!]` + texto explicativo, no solo borde rojo
- [ ] **Estados de éxito**: Incluyen ícono `[OK]` + texto, no solo verde
- [ ] **Links en texto**: Tienen subrayado además de color diferente
- [ ] **Campos requeridos**: Marcados con asterisco `*` + `aria-required="true"`, no solo color
- [ ] **Badges de estado** (stock, promo): Incluyen texto, no solo un punto de color

---

### 4. Movimiento reducido

- [ ] **`prefers-reduced-motion: reduce`** integrado en el Design System
- [ ] Todas las animaciones se reducen a `0.01ms` cuando el usuario lo prefiere
- [ ] Los carruseles automáticos se detienen
- [ ] Las transiciones de hover se simplifican a cambios instantáneos
- [ ] Formato de implementación:
  ```css
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```

---

### 5. Navegación por teclado

- [ ] **Focus ring visible**: Todos los controles interactivos tienen `focus-visible` con ring de 4px
- [ ] **Orden de tabulación**: Lógico y predecible (sin `tabindex` positivo)
- [ ] **Skip to content**: Link al inicio del documento para saltar la navegación
- [ ] **Escape para cerrar**: Modales, drawers y dropdowns se cierran con `Escape`
- [ ] **Focus trap**: Modales y drawers atrapan el foco dentro mientras están abiertos
- [ ] **Arrow keys**: Tabs, dropdowns y carruseles navegables con flechas

---

### 6. Semántica y ARIA

- [ ] **Landmarks**: `<header>`, `<nav>`, `<main>`, `<footer>` presentes
- [ ] **Headings**: Un solo `<h1>` por página, jerarquía correcta (h1 → h2 → h3)
- [ ] **Botones vs Links**: `<button>` para acciones, `<a>` para navegación
- [ ] **Imágenes**: Todas con `alt` descriptivo o `alt=""` si decorativas
- [ ] **Formularios**: Labels asociados con `for/id` o `aria-label`
- [ ] **Modales**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- [ ] **Drawers**: `role="dialog"`, focus trap, cierre con Escape
- [ ] **Carruseles**: `role="region"`, `aria-label`, controles de navegación accesibles

---

### 7. Zoom y Reescalado de Texto

- [ ] **Zoom hasta 200%**: El layout no se rompe (sin scroll horizontal, sin texto cortado/solapado) al aplicar zoom del navegador hasta 200%
- [ ] **Unidades relativas**: Tamaños de fuente y espaciados críticos en `rem`/`em`, no `px` fijos, para que respondan al zoom del sistema operativo
- [ ] **Contenedores fluidos**: `max-width` en vez de `width` fija en contenedores de texto, para que el reflow no genere overflow

---

### 8. Soporte Multilingüe / RTL (si aplica)

> [!IMPORTANT]
> Solo aplica si el usuario indicó explícitamente soporte multilingüe en la Fase 1/2. El agente NO debe asumir el alcance de idiomas — es una de las decisiones que el Protocolo de Cero Alucinación prohíbe inferir sin que el usuario la haya indicado.

- [ ] **Cobertura de glifos**: La tipografía elegida soporta los caracteres especiales/acentos de los idiomas objetivo (validar con Google Fonts "language subsets" antes de bloquear la fuente)
- [ ] **Layout RTL**: Si algún idioma objetivo es RTL (árabe, hebreo), los estilos usan propiedades lógicas CSS (`margin-inline-start`, `padding-inline-end`) en vez de `margin-left`/`padding-right`, y el atributo `dir="rtl"` se aplica a nivel de `<html>` o contenedor
- [ ] **Longitud de texto**: Componentes con texto corto en el idioma base (botones, badges, nav) toleran expansión de +30-50% típica en otros idiomas sin romper el layout

---

## Formato de documentación en el Design System generado

La Fase 4 del Design System de salida debe verse así:

```markdown
## FASE 4: AUDITORÍA DE ACCESIBILIDAD Y VALIDACIÓN VISUAL

**Nivel de conformidad:** WCAG 2.2 {{AA|AAA}}

### Contraste de Color
| Par | Foreground | Background | Contraste | Cumple |
| Texto principal | var(--color-neutral-900) (#111C1C) | var(--color-neutral-100) (#F2F9F9) | 15.2:1 | [PASS: AAA] |
| Texto sobre primario | var(--color-on-primary) (#052020) | var(--color-interactive-primary) (#52D9D9) | 7.5:1 | [PASS: AAA] |
...

### Checklist
* [x] Touch targets ≥ 48×48px
* [x] No solo color para comunicar estados
* [x] prefers-reduced-motion integrado
* [x] Focus ring visible en todos los controles
* [x] Semántica ARIA en componentes interactivos
```
