# Ecualizador de Marca — Referencia de Homium Site Builder

## Propósito

El Ecualizador de Marca es una herramienta **opcional** que traduce la personalidad de una marca en decisiones técnicas concretas de diseño. Funciona como un ecualizador de audio: 14 deslizadores que van de 1 a 5, donde cada posición genera valores específicos de CSS/tokens.

> [!IMPORTANT]
> **Este feature es OPCIONAL**. Homium Site Builder lo ofrece de forma visible pero nunca obligatoria. Si el cliente no lo usa, se aplican valores predeterminados según el tipo de sitio.

---

## Cómo presentar el ecualizador al cliente

### Momento del flujo

El ecualizador se ofrece **después** de recopilar los datos base (nombre, tipo de sitio, colores, fuentes) y **antes** de generar el Design System:

```
PASO 1: Datos base (nombre, tipo, colores, fuentes)  ← obligatorio
PASO 2: ¿Desea personalizar la personalidad visual?  ← aquí se ofrece
PASO 3: Generar Design System
```

### Mensaje sugerido para ofrecer el ecualizador

> "Tengo los datos base de tu marca. Para definir la personalidad visual de forma rápida, puedes elegir un **Arquetipo de Diseño (1 clic)** o calibrar manualmente los 14 ejes si prefieres un ajuste milimétrico:
>
> 1. `[Tech Minimalist]` **Tech Minimalist** (Limpio, preciso, esquinas rectangulares 2-4px, tipografía sans-serif nítida)
> 2. `[Bold & Vibrant]` **Bold & Vibrant** (Colores saturados, tipografía ExtraBold gigante 800, botones de 56px, alto contraste)
> 3. `[Corporate & Trust]` **Corporate & Trust** (Estructura sobria, simetría estricta, tonos neutros serios, confiable)
> 4. `[Organic & Warm]` **Organic & Warm** (Esquinas redondeadas 16-28px, tonos cálidos tintados, espaciado cómodo)
> 5. `[Cyber & Futuristic]` **Cyber & Futuristic** (Fondo oscuro/nocturno, acentos neón, resplandores tintados, ciber-digital)
> 6. `[Editorial & Premium]` **Editorial & Premium** (Tipografía Display refinada, espaciado amplio, grillas elegantes, lujo)
> 7. `[Calibración Manual]` **Calibración Manual por Ejes (Avanzado)**
> 8. `[Defaults]` **Usar Valores por Defecto del tipo de sitio**"

---

## Los 6 Arquetipos Preset (Matriz de Puntuación de los 14 Ejes)

Cuando el cliente selecciona un Arquetipo, se aplican automáticamente los siguientes valores en la escala del 1 al 5:

| Eje de Marca | Tech Minimalist | Bold & Vibrant | Corporate & Trust | Organic & Warm | Cyber & Futuristic | Editorial & Premium |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Sofisticación** | 1 | 3 | 2 | 4 | 1 | 1 |
| **2. Audacia** | 4 | 1 | 4 | 3 | 1 | 3 |
| **3. Extraversión** | 3 | 1 | 4 | 3 | 1 | 2 |
| **4. Rebeldía** | 4 | 1 | 5 | 2 | 1 | 3 |
| **5. Vibración** | 4 | 1 | 5 | 3 | 1 | 4 |
| **6. Densidad** | 2 | 4 | 3 | 2 | 3 | 1 |
| **7. Textura** | 5 | 2 | 4 | 1 | 3 | 4 |
| **8. Época** | 5 | 5 | 4 | 3 | 5 | 2 |
| **9. Innovación** | 2 | 1 | 4 | 3 | 1 | 3 |
| **10. Forma** | 5 | 2 | 4 | 1 | 4 | 3 |
| **11. Fabricación** | 5 | 4 | 4 | 1 | 5 | 2 |
| **12. Naturalidad** | 5 | 3 | 4 | 1 | 5 | 3 |
| **13. Fuerza** | 4 | 1 | 2 | 4 | 2 | 4 |
| **14. Alcance** | 5 | 4 | 5 | 2 | 5 | 4 |

---

## Auto-Calibración desde Referencias Visuales (Fidelidad Total)

Cuando el cliente selecciona `[Fidelidad Arquitectónica Total]` en el Paso 1.5, el agente calcula automáticamente los valores de los 14 ejes a partir de la deconstrucción visual sin forzar al usuario a elegir un preset genérico:

* **Eje 1 (Sofisticación):** Se calibra según la elegancia tipográfica y los espaciados del menú de navegación (1 = refinado/multinivel, 5 = casual/simplificado).
* **Eje 2 (Audacia):** Se calibra según el tamaño, peso y contraste de los CTAs (1 = botones XL 56px de alto contraste, 5 = botones sutiles o ghost).
* **Eje 3 (Extraversión):** Se calibra según la escala del Hero Title (1 = display ExtraBold 800 de 4rem+, 3 = bold estándar de 2.5rem).
* **Eje 4 (Rebeldía):** Se calibra según `component_dna.buttons[0].border_radius_px` — píldora ≥30px → **1** (rebelde); rectilíneo 0–2px → **5** (establecida); valores intermedios se mapean linealmente.
* **Eje 5 (Vibración):** Se calibra según la saturación de los acentos cromáticos detectados (1 = colores neón saturados, 5 = tonos neutros o monocromáticos).
* **Eje 6 (Densidad):** Se calibra según el padding vertical entre secciones (1 = espaciado editorial ultra-amplio, 4 = layout compacto de dashboard/aplicación).
* **Eje 7 (Textura):** Se calibra según los efectos de superficie (1 = texturas y gradientes ricos, 3 = glassmorphism y bordes luminosos, 5 = flat minimalista puro).
* **Eje 8 (Época):** Se calibra según la familia tipográfica principal — nombres con "Serif", "Times", "Georgia", "Playfair", "Cormorant" → **1–2** (vintage/clásica); sans-serif geométrica moderna ("Inter", "Geist", "Söhne", "Satoshi", "DM Sans") → **4–5** (contemporánea).
* **Eje 9 (Innovación):** Se calibra según `hero.signature_asset_type` — A (Canvas/WebGL) → **1**; C (SVG animado) → **2**; B (UI Mockup) → **3**; E/F (foto editorial o solo texto) → **4–5**.
* **Eje 10 (Forma):** Se calibra según el radio de curvatura de tarjetas y botones (1 = esquinas ultra-redondeadas 24px+/píldora, 3 = radios suaves 12-16px, 5 = rectilíneo 2-4px).
* **Eje 11 (Fabricación):** Se calibra según `hero.signature_asset_type` — B (capturas/mockups de UI) → **5** (tecnológica); A (Canvas/WebGL) → **4**; F (solo texto/editorial) → **3**; E (foto editorial) → **2**; si predominan imágenes artesanales/texturas → **1** (artesanal).
* **Eje 12 (Naturalidad):** Se calibra según el tono HSL del `accent_hex` detectado — cian eléctrico/neón (H: 160–200°, S > 80%) → **5** (artificial); tonos cálidos/terrosos (H: 20–80°, S < 65%) o verdes orgánicos (H: 90–150°, S < 60%) → **1–2** (natural); neutros → **3**.
* **Eje 13 (Fuerza):** Se calibra según el grosor de bordes y sombras (1 = bordes prominentes de 2px y sombras profundas, 4 = bordes hairline de 1px sutiles).
* **Eje 14 (Alcance):** Valor por defecto **3** (no es derivable de datos visuales con certeza). Ajustar manualmente: **1–2** si la marca es claramente local/regional (idioma único, moneda local visible en nav); **4–5** si hay selector de idioma, múltiples divisas o imágenes de equipos internacionales.

---

## Los 14 ejes

Cada eje tiene un nombre descriptivo, dos extremos, y una **pregunta en lenguaje simple** para que el cliente la entienda sin conocimiento técnico.

### Eje 1: Sofisticación
- **Extremos**: Sofisticada (1) ↔ Sencilla y cercana (5)
- **Pregunta para el cliente**: "¿Tu marca se siente más elegante y refinada, o más casual y accesible?"
- **Impacto en UI**:

| Puntuación | Density | Touch targets | Navegación |
|:---|:---|:---|:---|
| 1 (Sofisticada) | Compact | 40px mínimo | Menús expandidos, multi-nivel |
| 3 (Neutral) | Default | 44px mínimo | Menú estándar |
| 5 (Sencilla) | Comfortable | 48px mínimo | Navegación intuitiva, áreas amplias |

---

### Eje 2: Audacia
- **Extremos**: Audaz (1) ↔ Discreta (5)
- **Pregunta para el cliente**: "¿Tu marca busca llamar la atención con fuerza, o prefiere un enfoque más sutil?"
- **Impacto en UI**:

| Puntuación | Saturación de CTAs | Tamaño de CTAs | Contraste visual |
|:---|:---|:---|:---|
| 1 (Audaz) | 100% saturación del primario | Grandes (56px alto) | Alto, colores vivos |
| 3 (Neutral) | 80% saturación | Medianos (48px alto) | Moderado |
| 5 (Discreta) | 60% saturación, tonos pastel | Estándar (44px alto) | Suave |

---

### Eje 3: Extraversión
- **Extremos**: Extrovertida (1) ↔ Reservada (5)
- **Pregunta para el cliente**: "¿Tu marca es expresiva y vocal, o más tranquila y medida?"
- **Impacto en UI**:

| Puntuación | Font Display Weight | Tamaño de headings | Uso de font display |
|:---|:---|:---|:---|
| 1 (Extrovertida) | 800 (ExtraBold) | Hero: 4rem+ | Headings + CTAs + banners |
| 3 (Neutral) | 700 (Bold) | Hero: 3rem | Solo headings |
| 5 (Reservada) | 500 (Medium) | Hero: 2.5rem | Solo h1 y hero |

---

### Eje 4: Rebeldía
- **Extremos**: Rebelde (1) ↔ Establecida (5)
- **Pregunta para el cliente**: "¿Tu marca rompe moldes, o sigue las convenciones de su industria?"
- **Impacto en UI**:

| Puntuación | Border radius | Layout | Simetría |
|:---|:---|:---|:---|
| 1 (Rebelde) | Curvo: sm=8, md=16, lg=28 | Asimétrico, rotaciones sutiles | Orgánica |
| 3 (Neutral) | Medio: sm=6, md=10, lg=16 | Estándar con variaciones | Mayormente simétrica |
| 5 (Establecida) | Recto: sm=2, md=4, lg=8 | Grid estricto, alineado | Totalmente simétrica |

---

### Eje 5: Vibración
- **Extremos**: Vibrante (1) ↔ Sobria (5)
- **Pregunta para el cliente**: "¿Los colores de tu marca son intensos y vivos, o más apagados y serios?"
- **Impacto en UI**:

| Puntuación | Paleta de colores | Saturación de neutrales | Uso de acentos |
|:---|:---|:---|:---|
| 1 (Vibrante) | Colores primarios al 100% saturación | Tintado 5% del primario | 3 colores de acento frecuentes |
| 3 (Neutral) | Saturación moderada (80%) | Tintado 3% del primario | 1-2 acentos moderados |
| 5 (Sobria) | Colores desaturados (50%) | Grises casi puros | 1 acento mínimo |

---

### Eje 6: Densidad
- **Extremos**: Minimalista (1) ↔ Maximalista (5)
- **Pregunta para el cliente**: "¿Prefieres mucho espacio en blanco y pocos elementos, o una experiencia visual rica y llena de contenido?"
- **Impacto en UI**:

| Puntuación | Spacing multiplier | Contenido por viewport | Imágenes |
|:---|:---|:---|:---|
| 1 (Minimalista) | 1.5x base | Poco, muy espaciado | Pocas, pequeñas |
| 3 (Neutral) | 1x base | Balanceado | Medianas |
| 5 (Maximalista) | 0.8x base | Denso, full-bleed | Full-bleed, muchas fotos |

---

### Eje 7: Textura
- **Extremos**: Cruda (1) ↔ Pulida (5)
- **Pregunta para el cliente**: "¿Tu marca tiene un acabado artesanal y natural, o es limpia y perfectamente acabada?"
- **Impacto en UI**:

| Puntuación | Sombras | Bordes | Superficies |
|:---|:---|:---|:---|
| 1 (Cruda) | Sombras tintadas, difusas | Bordes suaves o sin bordes | Texturas visuales, gradientes sutiles |
| 3 (Neutral) | Sombras estándar | Bordes definidos 1px | Fondos sólidos |
| 5 (Pulida) | Sombras precisas y limpias | Bordes definidos, hairline | Superficies lisas, gradientes suaves |

---

### Eje 8: Época
- **Extremos**: Vintage (1) ↔ Contemporánea (5)
- **Pregunta para el cliente**: "¿Tu marca tiene un aire retro o nostálgico, o se siente moderna y actual?"
- **Impacto en UI**:

| Puntuación | Tipografía display | Paleta | Layout |
|:---|:---|:---|:---|
| 1 (Vintage) | Serif o decorativa | Tonos warm, sepia | Clásico, centrado |
| 3 (Neutral) | Sans-serif versátil | Balanceado | Adaptable |
| 5 (Contemporánea) | Sans-serif geométrica o variable | Tonos cool o neutros | Mobile-first, modular, ágil |

---

### Eje 9: Innovación
- **Extremos**: Innovadora (1) ↔ Tradicional (5)
- **Pregunta para el cliente**: "¿Tu marca busca ser vanguardista, o prefiere lo probado y confiable?"
- **Impacto en UI**:

| Puntuación | Animaciones | Interacciones | Patrones de UI |
|:---|:---|:---|:---|
| 1 (Innovadora) | Micro-animaciones fluidas, parallax | Gestos, scroll-triggered | Experimentales, layouts no convencionales |
| 3 (Neutral) | Transiciones suaves estándar | Click/tap estándar | Convencionales con toques frescos |
| 5 (Tradicional) | Mínimas, solo feedback visual | Solo click/tap básico | Patrones establecidos, predecibles |

<!-- [BETA: GSAP MOTION TIERS] -->
#### [BETA] Mapeo de Complejidad con GSAP 3
Si se selecciona GSAP en la Fase 5 (Prototipo Interactivo), la puntuación del Eje 9 determina la estrategia de animación:

| Puntuación | Perfil de Movimiento GSAP | Implementación Técnica |
|:---|:---|:---|
| **1 (Innovadora / Bold)** | **Cinematic Choreography** | Intro Timeline completa en Hero, ScrollTrigger con pinning y scrubbing suave en secciones clave, efectos de entrada con stagger y aceleración GPU. |
| **2 - 3 (Neutral / Modern)** | **Refined Micro-Interactions** | Entrada suave del Hero en bloque, ScrollTrigger en batch para cards/grids con `opacity` y `y: 24`, hovers sutiles con `power2.out`. |
| **4 - 5 (Tradicional / Minimal)** | **Essential Transitions** | Solo CSS Transitions básicas o GSAP mínimo en estado estático con transiciones estándar sin scroll parallax. |
<!-- [/BETA: GSAP MOTION TIERS] -->

---

### Eje 10: Forma
- **Extremos**: Orgánica (1) ↔ Sintética (5)
- **Pregunta para el cliente**: "¿Los elementos de tu marca se sienten naturales y redondeados, o geométricos y angulares?"
- **Impacto en UI**:

| Puntuación | radius-sm | radius-md | radius-lg | radius-full |
|:---|:---|:---|:---|:---|
| 1 (Orgánica) | 8px | 16px | 28px | 9999px |
| 2 | 6px | 12px | 22px | 9999px |
| 3 (Neutral) | 6px | 10px | 16px | 9999px |
| 4 | 4px | 6px | 10px | 9999px |
| 5 (Sintética) | 2px | 4px | 8px | 9999px |

---

### Eje 11: Fabricación
- **Extremos**: Artesanal (1) ↔ Tecnológica (5)
- **Pregunta para el cliente**: "¿Tu marca evoca algo hecho a mano, o se siente high-tech y digital?"
- **Impacto en UI**:

| Puntuación | Prioridad visual | Fotografía | Iconografía |
|:---|:---|:---|:---|
| 1 (Artesanal) | Textura, detalle, materiales | Close-ups de producto, texturas | Ilustraciones hand-drawn |
| 3 (Neutral) | Balance entre producto y UI | Fotografía estándar | Íconos outline estándar |
| 5 (Tecnológica) | Datos, métricas, dashboards | Screenshots, renders 3D | Íconos filled, geométricos |

---

### Eje 12: Naturalidad
- **Extremos**: Natural (1) ↔ Artificial (5)
- **Pregunta para el cliente**: "¿Tu marca está conectada con la naturaleza, o es más urbana/digital?"
- **Impacto en UI**:

| Puntuación | Tintado de neutrales | Paleta de color | Sombras |
|:---|:---|:---|:---|
| 1 (Natural) | 5% tintado del primario | Tonos tierra, verdes, cálidos | Tintadas con el primario |
| 3 (Neutral) | 3% tintado | Paleta proporcionada por cliente | Ligeramente tintadas |
| 5 (Artificial) | 0% tintado (grises puros) | Neón, eléctricos, monocromáticos | Negras puras |

---

### Eje 13: Fuerza
- **Extremos**: Robusta (1) ↔ Delicada (5)
- **Pregunta para el cliente**: "¿Tu marca transmite fuerza y solidez, o elegancia y ligereza?"
- **Impacto en UI**:

| Puntuación | Spacing base | Font weight body | Elevation intensity |
|:---|:---|:---|:---|
| 1 (Robusta) | 4px | 500 (Medium) | Sombras fuertes (opacity 0.15+) |
| 3 (Neutral) | 6px | 400 (Regular) | Sombras medias (opacity 0.10) |
| 5 (Delicada) | 8px | 400 (Regular) o 300 (Light) | Sombras sutiles (opacity 0.06) |

---

### Eje 14: Alcance
- **Extremos**: Local (1) ↔ Global (5)
- **Pregunta para el cliente**: "¿Tu marca tiene raíces locales fuertes, o aspira a una audiencia global?"
- **Impacto en UI**:

| Puntuación | Identidad visual | Lenguaje | Imagery |
|:---|:---|:---|:---|
| 1 (Local) | Elementos culturales locales prominentes | Una sola lengua | Fotografía local, paisajes regionales |
| 3 (Neutral) | Identidad adaptable | Bilingüe opcional | Mix de local e internacional |
| 5 (Global) | Identidad universal, neutral culturalmente | Multi-idioma listo (i18n) | Stock internacional, diversidad |

---

## Ejemplos Comparativos de Calibración

### Ejemplo A: Marca Expresiva / E-Commerce Artesanal

| Eje | Puntuación | Resultado en UI |
|:---|:---|:---|
| Sofisticación | 5 (Sencilla) | Density: comfortable, touch targets 48px |
| Audacia | 1 (Audaz) | CTAs saturados, colores vivos |
| Extraversión | 1 (Extrovertida) | Syne 800 ExtraBold en headings |
| Rebeldía | 1 (Rebelde) | radius: sm=8, md=16, lg=28 |
| Vibración | 1 (Vibrante) | Cyan + Magenta, sin grises puros |
| Densidad | 5 (Maximalista) | Fotos full-bleed, headers expresivos |
| Textura | 1 (Cruda) | Sombras tintadas, texturas orgánicas |
| Época | 5 (Contemporánea) | Mobile-first, layout modular |
| Innovación | 1 (Innovadora) | Micro-animaciones fluidas |
| Forma | 1 (Orgánica) | Curvas: 8px, 16px, 28px |
| Fabricación | 1 (Artesanal) | Prioridad en textura del producto |
| Naturalidad | 1 (Natural) | Neutrales tintados 3% cyan |
| Fuerza | 5 (Delicada) | Spacing 8px base, sombras sutiles |
| Alcance | 1 (Local) | Identidad cultural/local prominente |

### Ejemplo B: Marca Sobria / Firma de Servicios Corporativos

| Eje | Puntuación | Resultado en UI |
|:---|:---|:---|
| Sofisticación | 1 (Sofisticada) | Density: compact, navegación multi-nivel |
| Audacia | 5 (Discreta) | CTAs sutiles, tonos navy |
| Extraversión | 5 (Reservada) | Headings weight 500, tamaños moderados |
| Rebeldía | 5 (Establecida) | radius: sm=2, md=4, lg=8 |
| Vibración | 5 (Sobria) | Navy + gris, paleta desaturada |
| Densidad | 2 (Casi minimalista) | Mucho espacio en blanco |
| Textura | 5 (Pulida) | Sombras precisas, superficies lisas |
| Época | 4 (Casi contemporánea) | Limpio, moderno pero conservador |
| Innovación | 5 (Tradicional) | Sin animaciones vistosas |
| Forma | 5 (Sintética) | Esquinas rectas: 2px, 4px, 8px |
| Fabricación | 5 (Tecnológica) | Íconos geométricos, datos |
| Naturalidad | 5 (Artificial) | Grises puros, sin tintado |
| Fuerza | 1 (Robusta) | Spacing 4px, font-weight medio |
| Alcance | 5 (Global) | Identidad universal, multi-idioma |

---

## Tabla de derivación completa

Esta tabla resume **qué tokens se derivan de cada eje**:

| Eje | Tokens que afecta |
|:---|:---|
| Sofisticación | spacing, touch-target-size, nav-complexity |
| Audacia | color saturation, cta-size, contrast-weight |
| Extraversión | font-display-weight, heading-scale, font-display-usage |
| Rebeldía | shape-radius-*, layout-symmetry |
| Vibración | color saturation, neutral-tint-%, accent-count |
| Densidad | spacing-multiplier, image-sizing, content-density |
| Textura | elevation-style, border-style, surface-treatment |
| Época | font-family-display suggestion, color-temperature, layout-style |
| Innovación | motion-complexity, interaction-patterns, layout-experimentation |
| Forma | shape-radius-sm/md/lg (valores exactos) |
| Fabricación | visual-priority, photography-style, icon-style |
| Naturalidad | neutral-tint-%, color-palette-warmth, shadow-tint |
| Fuerza | spacing-base, font-weight-body, elevation-opacity |
| Alcance | cultural-elements, language-support, imagery-scope |

---

## Cuando el ecualizador NO se usa

Si el cliente omite el ecualizador, la skill aplica **valores predeterminados neutros** (puntuación 3 en todos los ejes) y luego ajusta según el tipo de sitio:

| Tipo de sitio | Ajustes predeterminados respecto a neutral |
|:---|:---|
| E-Commerce | Más audaz (+), más maximalista (+), más orgánica (+) |
| Portfolio | Más minimalista (+), más contemporánea (+) |
| Landing Page | Más audaz (+), más innovadora (+) |
| Negocio Local | Más sencilla (+), más local (+) |
| Restaurante | Más orgánica (+), más artesanal (+), más local (+) |
| Blog / Magazine | Más establecida (+), más delicada (+) |
| SaaS | Más innovadora (+), más tecnológica (+), más global (+) |
