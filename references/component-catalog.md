# Catálogo de Componentes — Referencia de Homium Site Builder

## Propósito

Este documento contiene el inventario completo de componentes para los tipos de sitio soportados. Homium Site Builder selecciona automáticamente los componentes aplicables según el tipo de sitio elegido por el cliente.

---

## Sección 1: Componentes Universales (20)

Estos componentes se incluyen en **todo** Design System, independientemente del tipo de sitio.

### Átomos (12)

| # | Componente | Clase CSS | Descripción | Tokens principales que consume |
|:--|:---|:---|:---|:---|
| 1 | **Botón Primario** | `.btn-primary` | CTA principal del sitio. Contenedor pill, label + ícono opcional | color-interactive-primary, color-on-primary, shape-radius-full |
| 2 | **Botón Secundario** | `.btn-secondary` | Acciones de apoyo. Misma anatomía que primario, diferente color | color-interactive-secondary, color-on-secondary |
| 3 | **Botón Ghost** | `.btn-ghost` | Acciones terciarias. Sin fondo, solo borde o texto | color-interactive-primary, color-border-default |
| 4 | **Input de Texto** | `.input-field` | Campo de formulario estándar. 48px alto, borde redondeado | color-border-default, color-border-focus, shape-radius-md |
| 5 | **Textarea** | `.textarea-field` | Campo de texto multilínea. Mínimo 120px alto | Mismos que input-field |
| 6 | **Select / Dropdown** | `.select-field` | Selector de opciones con flecha indicadora | color-border-default, elevation-2 (para el listado) |
| 7 | **Checkbox** | `.checkbox` | Control de selección múltiple. 24px visual, 48px área táctil | color-interactive-primary, shape-radius-sm |
| 8 | **Radio Button** | `.radio` | Control de selección única. 24px visual, 48px área táctil | color-interactive-primary |
| 9 | **Badge / Tag** | `.badge` | Etiqueta de estado o categoría. Pill shape | color-interactive-primary, shape-radius-full, typography-caption |
| 10 | **Spinner / Loader** | `.spinner` | Indicador de carga animado. 24px default | color-interactive-primary, motion-duration-medium |
| 11 | **Tooltip** | `.tooltip` | Información contextual al hover/focus. Flecha indicadora | color-neutral-900, elevation-2, shape-radius-sm |
| 12 | **Divider** | `.divider` | Separador horizontal. 1px solid | color-border-default |

### Moléculas (4)

| # | Componente | Clase CSS | Descripción | Tokens principales |
|:--|:---|:---|:---|:---|
| 13 | **Breadcrumb** | `.breadcrumb` | Navegación jerárquica. Separadores "/" o ">" | typography-caption, color-text-secondary |
| 14 | **Toast / Notification** | `.toast` | Mensaje de feedback temporal. Auto-dismiss en 5s | color-status-*, elevation-2, motion-duration-medium |
| 15 | **Avatar** | `.avatar` | Imagen de perfil. Circular, 3 tamaños (32, 40, 48px) | shape-radius-full, elevation-1 |
| 16 | **Search Bar** | `.search-bar` | Input con ícono de búsqueda y autocompletado | color-border-default, shape-radius-full, elevation-1 |

### Organismos (4)

| # | Componente | Clase CSS | Descripción | Tokens principales |
|:--|:---|:---|:---|:---|
| 17 | **Navbar / Header** | `.navbar` | Logo + navegación principal + menú hamburguesa mobile | elevation-1, color-bg-elevated, spacing-* |
| 18 | **Footer** | `.footer` | Links, redes sociales, copyright, newsletter | color-neutral-900, typography-caption |
| 19 | **Hero Section** | `.hero` | Sección de aterrizaje principal. Título + subtítulo + CTA | typography-display-hero, spacing-20+ |
| 20 | **Modal / Dialog** | `.modal` | Ventana emergente con overlay. Focus trap, cierre con Escape | elevation-3, shape-radius-lg, motion-duration-medium |

---

## Sección 2: Componentes por tipo de sitio

### [Tipo 1] E-Commerce

**Total con universales: ~40 componentes**

| # | Componente | Clase CSS | Categoría | Descripción |
|:--|:---|:---|:---|:---|
| 21 | **Product Card** | `.product-card` | Molécula | Imagen 1:1, título, precio, badge promo, botón agregar, ícono favorito |
| 22 | **Product Gallery** | `.product-gallery` | Organismo | Carrusel de imágenes con thumbnails y zoom |
| 23 | **Product Detail Layout** | `.product-detail` | Template | Layout completo: gallery + info + variantes + CTA |
| 24 | **Cart Drawer** | `.cart-drawer` | Organismo | Sidebar deslizante con lista de ítems y botón checkout |
| 25 | **Cart Item Row** | `.cart-item` | Molécula | Imagen thumb + título + precio + selector cantidad + eliminar |
| 26 | **Checkout Form** | `.checkout-form` | Organismo | Multi-step: datos personales → envío → pago |
| 27 | **Price Display** | `.price` | Átomo | Precio actual + precio anterior tachado + badge descuento |
| 28 | **Quantity Selector** | `.qty-selector` | Molécula | Botones +/- con input numérico central |
| 29 | **Variant Picker** | `.variant-picker` | Molécula | Selector visual de talla/color con swatches |
| 30 | **Filter Sidebar** | `.filter-sidebar` | Organismo | Filtros por categoría, precio (range), talla, color |
| 31 | **Sort Dropdown** | `.sort-dropdown` | Molécula | Ordenar por: precio, relevancia, más nuevos |
| 32 | **Product Grid** | `.product-grid` | Organismo | Grilla responsive de product cards (2-4 columnas) |
| 33 | **Wishlist Button** | `.wishlist-btn` | Átomo | Toggle corazón/favorito con animación |
| 34 | **Review Card** | `.review-card` | Molécula | Estrellas + texto + autor + fecha |
| 35 | **Rating Stars** | `.rating` | Átomo | 5 estrellas (llenas, medio, vacías) |
| 36 | **Stock Indicator** | `.stock-badge` | Átomo | Badge de disponibilidad ("Disponible" / "Quedan 3" / "Agotado") |
| 37 | **Shipping Banner** | `.shipping-banner` | Molécula | Ícono + texto ("Envío gratis en pedidos +$X") |
| 38 | **Promo Banner** | `.promo-bar` | Molécula | Barra superior de anuncios/promociones |
| 39 | **Newsletter Signup** | `.newsletter` | Molécula | Input email + botón suscribirse |
| 40 | **Order Summary** | `.order-summary` | Organismo | Resumen del pedido: ítems, subtotal, envío, total |

---

### [Tipo 2] Portfolio

**Total con universales: ~33 componentes**

| # | Componente | Clase CSS | Categoría | Descripción |
|:--|:---|:---|:---|:---|
| 21 | **Project Card** | `.project-card` | Molécula | Thumbnail + título + categoría + hover con overlay |
| 22 | **Project Gallery** | `.project-gallery` | Organismo | Grid masonry o estándar de imágenes del proyecto |
| 23 | **Project Detail** | `.project-detail` | Template | Layout de caso de estudio: brief, proceso, resultado |
| 24 | **Image Lightbox** | `.lightbox` | Organismo | Imagen ampliada con navegación prev/next y cierre |
| 25 | **About Section** | `.about-section` | Organismo | Bio, foto personal, historia breve |
| 26 | **Skills List** | `.skills-list` | Molécula | Lista visual de habilidades con nivel (barras o tags) |
| 27 | **Timeline** | `.timeline` | Organismo | Experiencia cronológica vertical con conectores |
| 28 | **Testimonial Card** | `.testimonial-card` | Molécula | Cita + nombre + empresa + avatar |
| 29 | **Contact Form** | `.contact-form` | Organismo | Nombre + email + asunto + mensaje + enviar |
| 30 | **Social Links** | `.social-links` | Molécula | Íconos de redes sociales con hover |
| 31 | **Stats Counter** | `.stats-counter` | Molécula | Números animados (proyectos, clientes, años, etc.) |
| 32 | **Category Tabs** | `.category-tabs` | Molécula | Tabs/pills para filtrar proyectos por tipo |
| 33 | **Download Button** | `.download-btn` | Átomo | Botón para descargar CV/PDF |

---

### [Tipo 3] Landing Page

**Total con universales: ~32 componentes**

| # | Componente | Clase CSS | Categoría | Descripción |
|:--|:---|:---|:---|:---|
| 21 | **Hero CTA** | `.hero-cta` | Organismo | Título impactante + subtítulo + botón principal + imagen/video |
| 22 | **Feature Card** | `.feature-card` | Molécula | Ícono + título + descripción corta de un beneficio |
| 23 | **Features Section** | `.features-section` | Organismo | Grid de 3-4 feature cards |
| 24 | **Social Proof Bar** | `.social-proof` | Molécula | Logos de clientes / "Confiado por +500 empresas" |
| 25 | **Testimonial Carousel** | `.testimonial-carousel` | Organismo | Reseñas de clientes en carrusel automático |
| 26 | **Pricing Table** | `.pricing-table` | Organismo | Comparativa de 2-3 planes con features y CTA |
| 27 | **FAQ Accordion** | `.faq-accordion` | Organismo | Preguntas frecuentes expandibles |
| 28 | **CTA Section** | `.cta-section` | Organismo | Llamada a la acción final antes del footer |
| 29 | **Video Embed** | `.video-embed` | Molécula | Video embebido responsive (YouTube/Vimeo) con poster |
| 30 | **Countdown Timer** | `.countdown` | Molécula | Timer para lanzamiento o promoción |
| 31 | **Lead Form** | `.lead-form` | Molécula | Email + nombre para capturar leads |
| 32 | **Comparison Table** | `.comparison-table` | Organismo | "Nosotros vs competencia" con checks/crosses |

---

### [Tipo 4] Negocio Local

**Total con universales: ~32 componentes**

| # | Componente | Clase CSS | Categoría | Descripción |
|:--|:---|:---|:---|:---|
| 21 | **Service Card** | `.service-card` | Molécula | Ícono + título + descripción + precio opcional + CTA |
| 22 | **Pricing Table** | `.pricing-table` | Organismo | Planes o servicios con precios y features |
| 23 | **Team Member Card** | `.team-card` | Molécula | Foto + nombre + rol + bio corta + redes |
| 24 | **Location Map** | `.location-map` | Organismo | Mapa embebido (Google Maps/OpenStreetMap) + dirección |
| 25 | **Hours of Operation** | `.hours` | Molécula | Tabla de horarios por día con indicador "Abierto ahora" |
| 26 | **Contact Info Block** | `.contact-info` | Molécula | Teléfono + email + dirección agrupados con íconos |
| 27 | **FAQ Accordion** | `.faq-accordion` | Organismo | Preguntas frecuentes expandibles |
| 28 | **Testimonial Carousel** | `.testimonial-carousel` | Organismo | Reseñas de clientes en carrusel |
| 29 | **CTA Section** | `.cta-section` | Organismo | Llamada a la acción ("Agenda tu cita") |
| 30 | **Photo Gallery** | `.photo-gallery` | Organismo | Grid de fotos del local/trabajo |
| 31 | **Booking Form** | `.booking-form` | Organismo | Formulario de cita: fecha + hora + servicio + datos |
| 32 | **WhatsApp Button** | `.whatsapp-btn` | Átomo | Botón flotante fijo con ícono de WhatsApp |

---

### [Tipo 5] Restaurante / Café

**Total con universales: ~29 componentes**

| # | Componente | Clase CSS | Categoría | Descripción |
|:--|:---|:---|:---|:---|
| 21 | **Menu Category** | `.menu-category` | Organismo | Sección del menú (Entradas, Platos, Postres, Bebidas) |
| 22 | **Menu Item** | `.menu-item` | Molécula | Nombre + descripción + precio + imagen opcional + badge (nuevo/especial) |
| 23 | **Reservation Form** | `.reservation-form` | Organismo | Fecha + hora + personas + nombre + teléfono |
| 24 | **Location & Hours** | `.location-hours` | Organismo | Mapa + dirección + horarios combinados |
| 25 | **Chef Section** | `.chef-section` | Organismo | Foto del chef/equipo + bio + filosofía |
| 26 | **Gallery Carousel** | `.gallery-carousel` | Organismo | Fotos de platos y ambiente del restaurante |
| 27 | **Special Offer** | `.special-offer` | Molécula | Banner de promoción del día/semana |
| 28 | **Review Widget** | `.review-widget` | Molécula | Rating promedio + últimas reseñas (Google Reviews) |
| 29 | **Delivery Partners** | `.delivery-partners` | Molécula | Logos de servicios de delivery (Rappi, UberEats, etc.) |

---

### [Tipo 6] Blog / Magazine

**Total con universales: ~31 componentes**

| # | Componente | Clase CSS | Categoría | Descripción |
|:--|:---|:---|:---|:---|
| 21 | **Article Card** | `.article-card` | Molécula | Imagen + título + extracto + autor + fecha + categoría |
| 22 | **Article Card Featured** | `.article-card-featured` | Molécula | Versión grande del article card para destacados |
| 23 | **Author Bio** | `.author-bio` | Molécula | Avatar + nombre + bio + redes sociales |
| 24 | **Reading Progress** | `.reading-progress` | Átomo | Barra de progreso fija en top al hacer scroll |
| 25 | **Table of Contents** | `.toc` | Molécula | Índice de contenidos del artículo (sidebar o inline) |
| 26 | **Category Tag** | `.category-tag` | Átomo | Tag de categoría clicable |
| 27 | **Article Grid** | `.article-grid` | Organismo | Grid de article cards (masonry o estándar) |
| 28 | **Newsletter CTA** | `.newsletter-cta` | Molécula | Sección de suscripción al newsletter |
| 29 | **Share Buttons** | `.share-buttons` | Molécula | Botones para compartir en redes sociales |
| 30 | **Related Articles** | `.related-articles` | Organismo | Grid de artículos relacionados al final |
| 31 | **Comment Section** | `.comments` | Organismo | Lista de comentarios + formulario para comentar |

---

### [Tipo 7] SaaS / Producto Digital

**Total con universales: ~33 componentes**

| # | Componente | Clase CSS | Categoría | Descripción |
|:--|:---|:---|:---|:---|
| 21 | **Pricing Table** | `.pricing-table` | Organismo | 2-3 planes con toggle mensual/anual, features, CTA |
| 22 | **Pricing Card** | `.pricing-card` | Molécula | Un solo plan con badge "Popular", features, precio, CTA |
| 23 | **Feature Card** | `.feature-card` | Molécula | Ícono + título + descripción de feature |
| 24 | **Feature Section** | `.features-section` | Organismo | Grid o alternating layout de features |
| 25 | **Comparison Table** | `.comparison-table` | Organismo | "Nosotros vs competencia" o planes lado a lado |
| 26 | **Dashboard Preview** | `.dashboard-preview` | Organismo | Screenshot/mockup del producto con frame decorativo |
| 27 | **Integration Logos** | `.integrations` | Molécula | Grid de logos de integraciones / "Funciona con..." |
| 28 | **Testimonial Card** | `.testimonial-card` | Molécula | Cita + foto + nombre + empresa + logo |
| 29 | **Stats Section** | `.stats-section` | Molécula | Números grandes animados ("10K+ usuarios", "99.9% uptime") |
| 30 | **CTA Banner** | `.cta-banner` | Organismo | Banner de conversión con formulario de signup |
| 31 | **FAQ Accordion** | `.faq-accordion` | Organismo | Preguntas frecuentes expandibles |
| 32 | **Trust Badges** | `.trust-badges` | Molécula | Certificaciones, sellos de seguridad, compliance |
| 33 | **Changelog / Updates** | `.changelog` | Organismo | Lista de actualizaciones recientes del producto |

---

## Sección 3: Matriz de componentes × tipo de sitio

### Componentes compartidos entre tipos

Algunos componentes específicos aparecen en más de un tipo de sitio:

| Componente | E-Com | Portfolio | Landing | Negocio | Restaurante | Blog | SaaS |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| FAQ Accordion | [-] | [-] | [x] | [x] | [-] | [-] | [x] |
| Pricing Table | [-] | [-] | [x] | [x] | [-] | [-] | [x] |
| Testimonial Card/Carousel | [-] | [x] | [x] | [x] | [-] | [-] | [x] |
| CTA Section | [-] | [-] | [x] | [x] | [-] | [-] | [x] |
| Contact Form | [-] | [x] | [-] | [-] | [-] | [-] | [-] |
| Newsletter Signup | [x] | [-] | [-] | [-] | [-] | [x] | [-] |
| Photo/Image Gallery | [-] | [x] | [-] | [x] | [x] | [-] | [-] |
| Social Links | [-] | [x] | [-] | [-] | [-] | [x] | [-] |
| Feature Card/Section | [-] | [-] | [x] | [-] | [-] | [-] | [x] |
| Comparison Table | [-] | [-] | [x] | [-] | [-] | [-] | [x] |
| WhatsApp Button | [-] | [-] | [-] | [x] | [x] | [-] | [-] |

> [!TIP]
> Cuando un componente aparece en múltiples tipos de sitio, su estructura base es idéntica pero los tokens que consume pueden variar. Por ejemplo, el `FAQ Accordion` en un sitio SaaS usa tipografía más técnica que en un sitio de Negocio Local.

---

## Formato de documentación por componente en el Design System

Cada componente se documenta en el Design System MD generado con esta estructura:

```markdown
#### Componente: [Nombre] (`.clase-css`) — [Categoría Atomic]

* **Anatomía:** Descripción de las partes que lo componen con medidas y tokens.
* **Estados Interactivos (6 Estados):**
  1. `default`: [tokens + valores inline]
  2. `hover`: [tokens + valores inline]
  3. `focus-visible`: [tokens + valores inline]
  4. `active`: [tokens + valores inline]
  5. `disabled`: [tokens + valores inline]
  6. `loading`: [tokens + valores inline]
* **Accesibilidad:** Roles ARIA, labels, keyboard support.
* **Responsive:** Comportamiento en cada breakpoint.
```

> [!NOTE]
> No todos los estados aplican a todos los componentes. Ver [interactive-states.md](./interactive-states.md) para la tabla de estados por categoría.

---

## Sección 4: Arquitectura de Páginas por Defecto (Sitemap) según el Tipo de Sitio

Cuando el cliente selecciona **Multi-página (MPA)**, los componentes se distribuyen automáticamente en las siguientes rutas y plantillas de página para evitar layouts mono-página:

### [E-Commerce]
* `/` (Home): `.navbar`, `.hero`, `.promo-bar`, `.shipping-banner`, `.product-grid` (Destacados), `.newsletter`, `.footer`
* `/tienda` (Catálogo / PLP): `.navbar`, `.breadcrumb`, `.filter-sidebar`, `.sort-dropdown`, `.product-grid`, `.footer`
* `/producto/[slug]` (Detalle / PDP): `.navbar`, `.breadcrumb`, `.product-detail` (`.product-gallery`, `.price`, `.variant-picker`, `.qty-selector`, `.btn-primary`, `.stock-badge`), `.review-card`, `.footer`
* `/checkout` (Carrito & Pago): `.cart-drawer`, `.checkout-form`, `.order-summary`, `.btn-primary`

### [Portfolio]
* `/` (Inicio): `.navbar`, `.hero`, `.project-card` (Destacados), `.skills-list`, `.testimonial-card`, `.contact-form`, `.footer`
* `/proyectos` (Galería): `.navbar`, `.category-tabs`, `.project-gallery` (`.project-card`, `.lightbox`), `.footer`
* `/proyecto/[slug]` (Caso de Estudio): `.navbar`, `.project-detail`, `.lightbox`, `.stats-counter`, `.social-links`, `.footer`
* `/nosotros` (Bio & Trayectoria): `.navbar`, `.about-section`, `.timeline`, `.download-btn`, `.footer`
* `/contacto`: `.navbar`, `.contact-form`, `.social-links`, `.footer`

### [Landing Page]
* `/` (Landing Principal): `.navbar`, `.hero-cta`, `.social-proof`, `.features-section` (`.feature-card`), `.comparison-table`, `.pricing-table`, `.testimonial-carousel`, `.faq-accordion`, `.cta-section`, `.footer`

### [Negocio Local]
* `/` (Inicio): `.navbar`, `.hero`, `.service-card`, `.hours`, `.location-map`, `.whatsapp-btn`, `.footer`
* `/servicios` (Servicios & Tarifas): `.navbar`, `.service-card`, `.pricing-table`, `.faq-accordion`, `.footer`
* `/nosotros` (Local & Equipo): `.navbar`, `.team-card`, `.photo-gallery`, `.hours`, `.footer`
* `/contacto` (Reservas / Citas): `.navbar`, `.booking-form`, `.contact-info`, `.location-map`, `.whatsapp-btn`, `.footer`

### [Restaurante / Café]
* `/` (Inicio): `.navbar`, `.hero`, `.special-offer`, `.chef-section`, `.review-widget`, `.delivery-partners`, `.footer`
* `/menu` (Menú / Carta): `.navbar`, `.menu-category`, `.menu-item`, `.footer`
* `/reservas` (Reservar Mesa): `.navbar`, `.reservation-form`, `.location-hours`, `.footer`
* `/ubicacion` (Contacto & Fotos): `.navbar`, `.location-hours`, `.gallery-carousel`, `.footer`

### [Blog / Magazine]
* `/` (Portada Editorial): `.navbar`, `.article-card-featured`, `.article-grid` (`.article-card`, `.category-tag`), `.newsletter-cta`, `.footer`
* `/articulo/[slug]` (Artículo Completo): `.navbar`, `.reading-progress`, `.toc`, `.author-bio`, `.share-buttons`, `.related-articles`, `.comments`, `.footer`
* `/categoria/[slug]` (Archivo de Categorías): `.navbar`, `.article-grid`, `.category-tag`, `.footer`

### [SaaS / Producto Digital]
* `/` (Home Landing): `.navbar`, `.hero`, `.social-proof`, `.dashboard-preview`, `.features-section`, `.stats-section`, `.trust-badges`, `.cta-banner`, `.footer`
* `/precios` (Planes & Precios): `.navbar`, `.pricing-table` (`.pricing-card`), `.comparison-table`, `.faq-accordion`, `.footer`
* `/funcionalidades` (Características & Integraciones): `.navbar`, `.feature-card`, `.integrations`, `.changelog`, `.footer`

---

## Sección 5: Variantes y props de demostración (Component Blocks del Showcase)

Fuente de verdad para el **contenido de cada Component Block vivo** del grupo §3 (Componentes) del Living HTML Showcase (ver `phases/phase-4-validation.md`). Cada bloque renderiza **todas** las variantes listadas como instancias `.dsc-*` con estados reales de CSS.

### Átomos universales

| Componente | Variantes a renderizar en el `.ds-stage` | Props / instancias de demo |
|:---|:---|:---|
| Botón Primario / Secundario / Ghost | `primary`, `secondary`, `ghost`, `sm`, `lg`, `+ícono`, `[disabled]`, `[aria-busy]` | Labels con verbos reales del dominio |
| Input de Texto | `default`, `con ícono`, `con help text`, `error [aria-invalid] + [!]`, `[disabled]` | 4–5 campos en `.ds-stage--grid` |
| Textarea | `default`, `error`, `[disabled]` | 1 campo min. 120px alto |
| Select / Dropdown | `default`, `abierto`, `[disabled]` | 3–4 opciones reales |
| Checkbox / Radio | `off`, `on`, `focus-visible`, `[disabled]` | 24px visual / 48px área táctil |
| Badge / Tag | tonos `promo`, `primary`, `neutral`, `warning [!]`, `error [!]`, `success [✓]` | Textos de estado reales |
| Spinner / Loader | `24px` (default) | 1 instancia |
| Tooltip | `hover/focus visible` | 1 disparador + burbuja |
| Divider | `horizontal` | 1 línea |

### Moléculas universales

| Componente | Variantes | Props de demo |
|:---|:---|:---|
| Breadcrumb | 2–3 niveles | Rutas reales del sitemap |
| Toast / Notification | `success`, `error`, `info` (disparadas con `dsToast`) | Mensajes contextuales |
| Avatar | `32`, `40`, `48px`, con imagen / iniciales | — |
| Search Bar | `default`, `con valor`, `focus` | Placeholder del dominio |

### Organismos universales

| Componente | Variantes | Props de demo |
|:---|:---|:---|
| Navbar / Header | `desktop`, `mobile (hamburguesa)` | Logo + 3–4 links + CTA reales |
| Footer | `completo` | Columnas + copyright reales |
| Hero Section | miniatura del blueprint | Headline + sub + CTA reales |
| Modal / Dialog | `abierto` (reutiliza `#modal-demo`) | Focus trap + Escape |

### Específicos por tipo de sitio (ejemplos)

| Tipo | Componente | Variantes / props de demo |
|:---|:---|:---|
| E-Commerce | Product Card | 2–3 tarjetas: con badge promo + `compareAtPrice` + favorito; hover eleva + zoom 1.03 |
| E-Commerce | Cart Drawer | trigger + panel funcional (`dsOpenDrawer`/`dsCloseDrawer`), 2 líneas, subtotal, focus trap |
| E-Commerce | Quantity Selector | funcional con `dsStep`, `aria-live` |
| E-Commerce | Variant Picker | swatches de talla/color, 1 seleccionado |
| E-Commerce | Price / Rating Stars / Stock Indicator | actual + anterior tachado / 5 estrellas / "Disponible" · "Quedan 3" · "Agotado" |
| Landing / SaaS | Feature Card | 3 en `.ds-stage--grid` con ícono + título + desc reales |
| Portfolio | Project Card | 2–3 con overlay al hover |
| Negocio / Restaurante | Service Card / Menu Item | ícono/nombre + desc + precio |
| Blog | Article Card | imagen + título + extracto + autor + fecha + categoría |

> [!NOTE]
> La **morfología** (radio, padding, altura, bg, transición) de cada instancia se copia de `structural_blueprint.component_dna` / `card_morphology` del `design-system-state.json` (Regla 15 del SKILL) — estas tablas definen *qué variantes* mostrar, no su geometría.

