# Estados Interactivos — Referencia de Homium Site Builder

## Propósito

Este documento define los **6 estados interactivos obligatorios** que todo componente interactivo debe especificar en el Design System generado por Homium Site Builder. Esto garantiza consistencia visual y de comportamiento en todo el sitio.

---

## Los 6 Estados

### 1. `default`

El estado base del componente cuando no hay interacción del usuario.

- **Trigger**: Estado inicial al cargar la página
- **Tokens que define**:
  - `{component}-bg`: Color de fondo base
  - `{component}-text`: Color de texto
  - `{component}-border`: Color de borde (si aplica)
- **Ejemplo de salida en el Design System**:
  ```
  default: BG var(--color-interactive-primary) (#52D9D9), Text var(--color-on-primary) (#052020)
  ```

---

### 2. `hover`

Estado cuando el cursor está encima del componente (desktop).

- **Trigger**: `:hover` (mouse over)
- **Tokens que define**:
  - `{component}-bg-hover`: Variación del fondo (típicamente 10% más oscuro)
  - `{component}-transform-hover`: Transformación sutil (opcional)
- **Transformaciones típicas**:
  - `transform: translateY(-2px)` — elevación sutil
  - `box-shadow` aumentada — profundidad visual
  - Fondo 10% más oscuro que el default
- **Duración**: Usa `var(--motion-fast)` (150ms)
- **Ejemplo de salida en el Design System**:
  ```
  hover: BG var(--color-interactive-primary-hover) (#3ECBCB), transform: translateY(-2px)
  ```

> [!NOTE]
> En mobile el hover no aplica directamente, pero los estilos deben estar definidos para dispositivos con capacidad de hover (`@media (hover: hover)`).

---

### 3. `focus-visible`

Estado cuando el componente recibe foco mediante **navegación por teclado** (Tab). Es obligatorio para accesibilidad WCAG.

- **Trigger**: `:focus-visible` (no `:focus` simple, para evitar el ring en clicks)
- **Tokens que define**:
  - `{component}-focus-ring`: Anillo de foco visible
  - `{component}-outline`: Outline adicional de alto contraste
- **Valores estándar**:
  - `box-shadow: var(--focus-ring)` — anillo de 4px con color primario al 40% opacidad
  - `outline: 2px solid var(--color-neutral-900)` — outline de alto contraste
- **Ejemplo de salida en el Design System**:
  ```
  focus-visible: box-shadow: var(--focus-ring) (0 0 0 4px rgba(82, 217, 217, 0.4)), outline: 2px solid var(--color-neutral-900) (#111C1C)
  ```

> [!IMPORTANT]
> El focus ring **nunca** se omite. Es un requisito WCAG 2.2 Level AA y AAA. El color del ring se deriva del color primario de la marca.

---

### 4. `active`

Estado momentáneo durante el click o tap.

- **Trigger**: `:active` (mousedown / touchstart)
- **Tokens que define**:
  - `{component}-bg-active`: Fondo más oscuro que hover
  - `{component}-transform-active`: Efecto de presión
- **Transformaciones típicas**:
  - `transform: scale(0.98)` — efecto de presión
  - Fondo 15-20% más oscuro que default
- **Duración**: Instantánea (no necesita transición)
- **Ejemplo de salida en el Design System**:
  ```
  active: BG var(--color-interactive-primary-active) (#2EB3B3), transform: scale(0.98)
  ```

---

### 5. `disabled`

Estado cuando el componente no es interactuable.

- **Trigger**: Atributo `disabled` o `aria-disabled="true"`
- **Tokens que define**:
  - `{component}-bg-disabled`: Fondo neutral apagado
  - `{component}-text-disabled`: Texto de bajo contraste
  - `{component}-cursor-disabled`: `cursor: not-allowed`
- **Reglas obligatorias**:
  - No debe recibir foco (si usa `disabled` nativo)
  - Si usa `aria-disabled`, debe recibir foco pero no ejecutar acción
  - El contraste del texto disabled NO necesita cumplir WCAG (es intencionalmente apagado)
- **Ejemplo de salida en el Design System**:
  ```
  disabled: BG var(--color-neutral-200) (#E1EDED), Text var(--color-neutral-disabled) (#8A9E9E), cursor: not-allowed
  ```

---

### 6. `loading`

Estado durante una operación asíncrona (submit, fetch, etc.).

- **Trigger**: Estado controlado por JavaScript (clase `.is-loading` o atributo `aria-busy="true"`)
- **Tokens que define**:
  - `{component}-pointer-loading`: `pointer-events: none`
  - `{component}-spinner`: Spinner animado
- **Reglas obligatorias**:
  - `pointer-events: none` — prevenir clicks duplicados
  - Spinner usando el color de texto del componente
  - `aria-busy="true"` para lectores de pantalla
  - El texto del botón puede cambiar a "Cargando..." o mantenerse con spinner
- **Ejemplo de salida en el Design System**:
  ```
  loading: pointer-events: none, spinner animado con var(--color-on-primary) (#052020)
  ```

---

## Reglas de aplicación por categoría de componente

| Categoría | default | hover | focus-visible | active | disabled | loading |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Botones** (primary, secondary, ghost) | [x] | [x] | [x] | [x] | [x] | [x] |
| **Inputs** (text, textarea, select) | [x] | [x] | [x] | [x] | [x] | [x] |
| **Checkbox / Radio** | [x] | [x] | [x] | [x] | [x] | [-] |
| **Cards** (product, project, etc.) | [x] | [x] | [x] | [-] | [-] | [-] |
| **Links / Anchors** | [x] | [x] | [x] | [x] | [-] | [-] |
| **Tabs / Chips** | [x] | [x] | [x] | [x] | [x] | [-] |
| **Badges / Tags** | [x] | [-] | [-] | [-] | [-] | [-] |

---

## Formato de documentación en el Design System generado

Al documentar un componente, los estados se listan así:

```markdown
#### Componente: Botón Primario (`.btn-primary`)
* **Estados Interactivos (6 Estados):**
  1. `default`: BG var(--color-interactive-primary) (#52D9D9), Text var(--color-on-primary) (#052020)
  2. `hover`: BG var(--color-interactive-primary-hover) (#3ECBCB), transform: translateY(-2px)
  3. `focus-visible`: box-shadow: var(--focus-ring) (0 0 0 4px rgba(82,217,217,0.4)), outline: 2px solid var(--color-neutral-900) (#111C1C)
  4. `active`: BG var(--color-interactive-primary-active) (#2EB3B3), transform: scale(0.98)
  5. `disabled`: BG var(--color-neutral-200) (#E1EDED), Text var(--color-neutral-disabled) (#8A9E9E), cursor: not-allowed
  6. `loading`: pointer-events: none, spinner animado var(--color-on-primary) (#052020)
```

> [!TIP]
> Nota el formato dual: `var(--token-name) (#hex-value)` — se muestra tanto el token semántico como el valor CSS inline, para que el documento sea legible y al mismo tiempo técnicamente preciso.
