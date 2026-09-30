/**
 * preview-pages — HTML generado por el servidor para las vistas previas.
 * Todo valor que proviene del estado (marca, nombres) se escapa antes de interpolarse.
 */

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Página standalone del Blueprint (/preview/blueprint).
 * @param {string} brandName Nombre de marca sin escapar
 * @returns {string}
 */
function renderBlueprintPage(brandName) {
  const safeBrand = escapeHtml(brandName);
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blueprint · ${safeBrand} · Homium Site Builder</title>
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/homium/colors_and_type.css">
  <link href="https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300..900;1,300..900&family=Fira+Code:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body { background: #09010e; color: #fff; margin: 0; padding: 2rem 1.5rem; font-family: 'Rubik', sans-serif; min-height: 100vh; box-sizing: border-box; }
    .blueprint-standalone-wrapper { max-width: 1200px; margin: 0 auto; }
    .standalone-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 1rem; }
    .standalone-title { display: flex; align-items: center; gap: 0.6rem; font-size: 15px; font-weight: 600; color: var(--homium-cyan, #00ffff); }
  </style>
</head>
<body>
  <div class="blueprint-standalone-wrapper">
    <div class="standalone-header">
      <div class="standalone-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
        <span>HOMIUM SITE BUILDER · BLUEPRINT ARCHITECTURAL SPEC</span>
      </div>
      <span style="font-family: 'Fira Code', monospace; font-size: 12px; color: rgba(255,255,255,0.6);">${safeBrand}</span>
    </div>
    <div class="blueprint-view" id="blueprintView"></div>
  </div>
  <script src="/app.js"></script>
</body>
</html>`;
}

module.exports = { escapeHtml, renderBlueprintPage };
