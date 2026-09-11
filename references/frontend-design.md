---
name: frontend-design
description: Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices that don't read as templated defaults.
---

# Frontend Design — Artesanía & Guardrails Anti-Genéricos

Approach this as the design lead at a small studio known for giving every client a visual identity that could not be mistaken for anyone else's. This client has already rejected proposals that felt templated, and is paying for a distinctive point of view: make deliberate, opinionated choices about palette, typography, and layout that are specific to this brief, and take one real aesthetic risk you can justify.

## 1. Ground it in the subject (Contenido con Sentido Real)
- Si el brief o la referencia definen el producto/tema, constrúyelo con contenido real y contextual en todo el prototipo.
- **Prohibido el copy genérico o de relleno ("Lorem ipsum", "Soluciones innovadoras para su negocio"):** Escribe desde la perspectiva del usuario final con verbos de acción concretos (*"Guardar cambios"* en lugar de *"Enviar"*, mensajes de confirmación coherentes con la acción).
- La voz debe ser clara, sin adjetivos grandilocuentes vacíos.

## 2. Principios de Diseño & Anti-Clichés de IA
- **El Hero es una Tesis:** Abre con el elemento más característico del mundo del sujeto (Headline asimétrico, demostración viva, interactividad o media real). Evita la respuesta plantilla (número gigante + etiqueta pequeña + gradiente genérico) a menos que esté justificada en el blueprint.
- **La Estructura es Información (Cero Decoración Gratuita):** 
  - Dispositivos estructurales como numeradores `01 / 02 / 03`, pestañas o badges deben codificar información real secuencial o categórica. **Prohibido poner `01 / 02 / 03` como adorno si el contenido no es un proceso paso a paso.**
- **Anti-Patrones de IA:**
  - Evitar caer en los 3 clichés por defecto de la IA:
    1. Fondo crema (#F4F1EA) + Serif display + Acento terracota.
    2. Fondo casi negro + Verde ácido / Bermellón chillón.
    3. Estilo periódico denso con líneas finas (hairline rules) sin radio de borde.
  - *Excepción:* Si la referencia real o el usuario eligieron explícitamente uno de estos estilos, respétalo al 100%. Si no, no los uses por inercia.

## 3. Contención y "Gastar la Audacia en un Solo Lugar"
- Deja que el **Signature Asset** (Canvas WebGL, UI Mockup interactivo, Bento dinámico o Media Masked) sea la pieza memorable principal.
- Mantén el resto de la interfaz silencioso, disciplinado y limpio. Elimina cualquier decoración superflua que no aporte a la jerarquía visual.
- **Animación con Propósito:** Usa micro-interacciones sutiles (150-250ms), reveals con ScrollTrigger o timelines coordinadas. Prohibido sobre-animar o agregar efectos dispersos que hagan que el sitio parezca una plantilla de IA.

## 4. Arquitectura CSS & Especificidad Limpia
- Estructura selectores limpios sin colisiones de especificidad (evitar clases como `.section` vs `.cta` que cancelen paddings o márgenes entre secciones).
- Tipografía y espaciados fluidos con `clamp()`.
- Respetar siempre `@media (prefers-reduced-motion: reduce)`.
