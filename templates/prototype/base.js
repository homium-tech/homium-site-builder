/**
 * BASE DE COMPORTAMIENTO DEL PROTOTIPO (no define diseño visual).
 * Tema claro/oscuro con persistencia, menú móvil accesible (foco, Escape, inert), conteos y canvas que
 * respetan prefers-reduced-motion y se pausan fuera de pantalla.
 * Sustituye THEME_KEY por una clave propia de la marca. Elimina estos comentarios al terminar.
 */

'use strict';

const THEME_KEY = 'prototype-theme';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initDrawer();
  initCountUp();
});

/* 1. Tema (oscuro por defecto) */
function initTheme() {
  const root = document.documentElement;
  let stored = null;
  try { stored = localStorage.getItem(THEME_KEY); } catch (e) { /* almacenamiento bloqueado */ }
  root.setAttribute('data-theme', stored === 'light' ? 'light' : 'dark');

  document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(root.getAttribute('data-theme') === 'light'));
    btn.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignorar */ }
      document.querySelectorAll('.theme-toggle-btn').forEach((b) => b.setAttribute('aria-pressed', String(next === 'light')));
    });
  });
}

/* 2. Menú móvil: aria-expanded, inert, foco que entra y vuelve, trampa de Tab y Escape */
function initDrawer() {
  const menuBtn = document.querySelector('.mobile-menu-btn');
  const drawer = document.querySelector('.mobile-drawer');
  const backdrop = document.querySelector('.drawer-backdrop');
  const closeBtn = document.querySelector('.drawer-close-btn');
  if (!menuBtn || !drawer || !backdrop) return;

  const focusable = () => Array.from(drawer.querySelectorAll('a[href], button:not([disabled])'));

  function openDrawer() {
    drawer.removeAttribute('inert');
    drawer.classList.add('is-open');
    backdrop.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    const first = focusable()[0];
    if (first) first.focus();
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('inert', '');
    backdrop.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    menuBtn.focus();
  }

  menuBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (!drawer.classList.contains('is-open')) return;
    if (e.key === 'Escape') { closeDrawer(); return; }
    if (e.key !== 'Tab') return;
    const items = focusable();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

/* 3. Conteo animado: <span class="stat-number" data-target="120" data-prefix="+" data-suffix="%">120</span>
      El texto ya contiene el valor final (sin JS o con movimiento reducido se ve tal cual). */
function initCountUp() {
  const stats = document.querySelectorAll('.stat-number[data-target]');
  if (!stats.length || reducedMotion.matches || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      obs.unobserve(el);
      const target = parseInt(el.getAttribute('data-target'), 10) || 0;
      const prefix = el.getAttribute('data-prefix') || '';
      const suffix = el.getAttribute('data-suffix') || '';
      const duration = 1200;
      const start = performance.now();
      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        el.textContent = `${prefix}${Math.round(target * progress)}${suffix}`;
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.2 });

  stats.forEach((el) => observer.observe(el));
}

/* 4. Canvas 2D reutilizable: nítido en pantallas HiDPI, se pausa fuera de pantalla o con la pestaña oculta
      y con movimiento reducido dibuja un solo cuadro.
      Uso: createCanvasLoop(canvas, (ctx, width, height, time) => { ...dibujar... }); */
function createCanvasLoop(canvas, draw) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let frame = null;
  let visible = true;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function loop(time) {
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height, time);
    frame = requestAnimationFrame(loop);
  }

  function play() {
    if (frame === null && visible && !document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(loop);
  }

  function pause() {
    if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
  }

  resize();
  window.addEventListener('resize', () => { resize(); if (reducedMotion.matches) draw(ctx, width, height, 0); });
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) play(); else pause();
    }).observe(canvas);
  }

  if (reducedMotion.matches) draw(ctx, width, height, 0);
  else play();

  return { play, pause };
}
