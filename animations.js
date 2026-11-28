// Movimiento y pequeñas interacciones de la portada (2026).
// Sin librerías: IntersectionObserver + transiciones CSS. Si el script falla,
// el contenido se ve igual (la clase .no-js y el CSS dejan todo visible).
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── Entradas al hacer scroll (.rv → .in) ───
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      io.unobserve(en.target);
      en.target.querySelectorAll?.('.animated-counter').forEach(countUp);
      if (en.target.classList.contains('animated-counter')) countUp(en.target);
    });
  }, { rootMargin: '0px 0px 15% 0px', threshold: 0 }) : null;

  function watch(root) {
    (root || document).querySelectorAll('.rv:not([data-rv]), .photo-band:not([data-rv]), .about-photo:not([data-rv])').forEach(el => {
      el.dataset.rv = '1';
      if (io && !reduce) io.observe(el); else el.classList.add('in');
    });
  }

  // ─── Contadores: suben hasta su valor cuando entran en pantalla ───
  function countUp(el) {
    const target = parseInt(el.dataset.target, 10);
    if (!target || el.dataset.counted === String(target)) return;
    el.dataset.counted = String(target);
    if (reduce) { el.textContent = target.toLocaleString('es-ES'); return; }
    const t0 = performance.now(), dur = 900;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * e).toLocaleString('es-ES');
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function refreshCounters() {
    document.querySelectorAll('.animated-counter').forEach(el => {
      const target = parseInt(el.dataset.target, 10);
      if (!target) return;
      const row = el.closest('.rv');
      // si su fila ya está a la vista (o no hay observer), contar ya
      if (!row || row.classList.contains('in') || !io) countUp(el);
    });
  }

  // ─── Frase de medios: un nombre encendido cada 2 s ───
  let medTimer = null;
  function cycleMedios() {
    const names = [...document.querySelectorAll('#medios-frase .m')];
    if (!names.length || reduce) { names.forEach(n => n.classList.add('on')); return; }
    clearInterval(medTimer);
    let i = 0;
    const step = () => { names.forEach(n => n.classList.remove('on')); names[i % names.length].classList.add('on'); i++; };
    step();
    medTimer = setInterval(step, 2000);
  }

  // Medios reales: los genera el build a partir de las fuentes de cada caso
  async function loadMedios() {
    const frase = document.getElementById('medios-frase');
    if (!frase) return;
    try {
      const r = await fetch('/datos/medios.json');
      if (!r.ok) throw 0;
      const lista = (await r.json()).medios || [];
      const nombres = lista.slice(0, window.innerWidth < 640 ? 8 : 12).map(m => m.nombre);
      if (nombres.length >= 3) {
        const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const y = (typeof i18n !== 'undefined') ? i18n.t('medios-y') : 'y';
        frase.innerHTML = nombres.slice(0, -1).map(n => `<span class="m">${esc(n)}</span>`).join(', ')
          + ` <span data-i18n="medios-y">${esc(y)}</span> <span class="m">${esc(nombres[nombres.length - 1])}</span>.`;
      }
    } catch (e) { /* se queda la frase por defecto */ }
    cycleMedios();
  }

  // ─── Menú «Más» de la barra superior ───
  function initMenu() {
    document.querySelectorAll('.topbar-more').forEach(box => {
      const btn = box.querySelector('button');
      const close = () => { box.removeAttribute('data-open'); btn.setAttribute('aria-expanded', 'false'); };
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = box.hasAttribute('data-open');
        if (open) close(); else { box.setAttribute('data-open', ''); btn.setAttribute('aria-expanded', 'true'); }
      });
      document.addEventListener('click', (e) => { if (!box.contains(e.target)) close(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
      box.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
    });
  }

  // En pantallas estrechas los filtros empiezan plegados (salvo que la URL traiga filtros)
  function initFiltros() {
    const d = document.getElementById('filtros');
    if (!d) return;
    const conFiltros = /[?&](cuerpo|conducta|estado|ano|ccaa|q|mes)=/.test(location.search);
    if (window.innerWidth <= 1080 && !conFiltros) d.removeAttribute('open');
  }

  document.addEventListener('DOMContentLoaded', () => {
    initFiltros();
    watch();
    initMenu();
    loadMedios();
  });
  window.addEventListener('corruptos:rendered', () => { watch(); refreshCounters(); });
  document.addEventListener('langchange', () => setTimeout(cycleMedios, 0));
})();
