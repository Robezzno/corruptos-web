/* Métricas de comportamiento, anónimas y agregadas (GoatCounter, sin cookies ni identificadores).
 * Cada evento es un contador con nombre «categoría/detalle»; nunca se envía nada que identifique a una
 * persona ni lo que escribe salvo los términos de búsqueda (recortados). Se ve en el panel → «Eventos».
 * Lo inyecta backend/build_release.py junto a count.js cuando hay STATS_ENDPOINT. */
(function () {
  'use strict';
  if (window.__metricas) return;
  window.__metricas = true;

  var cola = [];
  var enviados = {};
  function tipoPagina(p) {
    p = p || location.pathname;
    if (p === '/' || p === '/index.html') return 'portada';
    var m = p.match(/^\/([a-z]+)\//);
    return m ? m[1] : 'otra';
  }
  function limpio(s, n) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9ñ@._ -]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, n || 60);
  }
  // Envía un evento; «unaVez» evita repetirlo en la misma página vista.
  function ev(nombre, titulo, unaVez) {
    if (unaVez) { if (enviados[nombre]) return; enviados[nombre] = 1; }
    var hit = { path: nombre, title: titulo || nombre, event: true };
    if (window.goatcounter && window.goatcounter.count) window.goatcounter.count(hit);
    else cola.push(hit);
  }
  (function vaciar() {
    if (window.goatcounter && window.goatcounter.count) {
      while (cola.length) window.goatcounter.count(cola.shift());
    } else if (cola.length) setTimeout(vaciar, 1000);
  })();
  var tipo = tipoPagina();

  // ── Clics: salidas a fuentes, compartir, descargas, RSS, donaciones, navegación interna ──
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('a,button,[data-metrica]');
    if (!el) return;
    if (el.dataset && el.dataset.metrica) return ev('clic/' + limpio(el.dataset.metrica), null);
    if (el.id && /^wallet-/.test(el.id)) return ev('donar/' + el.id.replace('wallet-', ''), 'Donación ' + el.id);
    if (el.closest('#lang-switcher')) return;  // lo cuenta el observador de idioma
    var href = el.getAttribute && el.getAttribute('href');
    if (!href) {
      var txt = limpio(el.getAttribute('aria-label') || el.textContent, 30);
      if (/compart|share|copiar|copy|enlace|link/.test(txt)) ev('compartir/copiar-enlace/' + tipo, null);
      else if (txt) ev('boton/' + tipo + '/' + txt, null);
      return;
    }
    var u;
    try { u = new URL(href, location.href); } catch (_) { return; }
    var red = { 'wa.me': 'whatsapp', 'api.whatsapp.com': 'whatsapp', 't.me': 'telegram', 'twitter.com': 'x',
      'x.com': 'x', 'www.facebook.com': 'facebook', 'facebook.com': 'facebook', 'bsky.app': 'bluesky',
      'www.reddit.com': 'reddit', 'www.linkedin.com': 'linkedin' }[u.hostname];
    if (red) return ev('compartir/' + red + '/' + tipo, 'Compartir en ' + red);
    if (u.protocol === 'mailto:') return ev('contacto/email/' + tipo, 'Email');
    if (/\.(csv|json|zip|pdf)$/i.test(u.pathname) && u.hostname === location.hostname)
      return ev('descarga' + u.pathname, 'Descarga ' + u.pathname);
    if (/\/rss\/|\.xml$/.test(u.pathname)) return ev('rss' + u.pathname.replace(/\.xml$/, ''), 'RSS');
    if (u.hostname !== location.hostname) {
      var host = u.hostname.replace(/^www\./, '');
      return ev('salida/' + tipo + '/' + host, 'Fuente: ' + host);  // qué medios consulta la gente
    }
    ev('navega/' + tipo + '-a-' + tipoPagina(u.pathname), null);
  }, true);

  // ── Búsquedas y filtros (la portada guarda el estado en la URL) ──
  var ultimo = location.search;
  function filtros() {
    if (location.search === ultimo) return;
    ultimo = location.search;
    var q = new URLSearchParams(location.search);
    q.forEach(function (v, k) {
      if (!v || k === 'page' || k === 'p') return;
      if (/^(q|query|search|buscar)$/.test(k)) ev('busqueda/' + limpio(v, 40), 'Búsqueda: ' + v.slice(0, 40));
      else ev('filtro/' + limpio(k, 20) + '/' + limpio(v, 40), 'Filtro ' + k + '=' + v);
    });
  }
  ['pushState', 'replaceState'].forEach(function (f) {
    var orig = history[f];
    history[f] = function () { var r = orig.apply(this, arguments); clearTimeout(filtros.t); filtros.t = setTimeout(filtros, 1500); return r; };
  });
  window.addEventListener('popstate', function () { setTimeout(filtros, 300); });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.tagName === 'SELECT') ev('filtro/' + limpio(t.id || t.name || 'select', 20) + '/' + limpio(t.value, 40), null);
  }, true);
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (e.key !== 'Enter' || !t || !(t.type === 'search' || /search|buscar/i.test(t.id || ''))) return;
    if (t.value && t.value.length > 1) ev('busqueda/' + limpio(t.value, 40), 'Búsqueda: ' + t.value.slice(0, 40));
  }, true);

  // ── Idioma ──
  new MutationObserver(function () {
    ev('idioma/' + (document.documentElement.lang || 'es'), 'Cambio de idioma');
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  // ── Profundidad de lectura (scroll) ──
  var marcas = [25, 50, 75, 100];
  function scroll() {
    var h = document.documentElement.scrollHeight - innerHeight;
    if (h < 200) return;
    var pct = Math.round(scrollY / h * 100);
    marcas.forEach(function (m) { if (pct >= m - 2) ev('lectura/' + tipo + '/' + m, 'Leído ' + m + '% (' + tipo + ')', true); });
  }
  addEventListener('scroll', function () { clearTimeout(scroll.t); scroll.t = setTimeout(scroll, 250); }, { passive: true });

  // ── Tiempo de atención (solo con la pestaña visible), por tramos ──
  var activo = 0, desde = document.visibilityState === 'visible' ? Date.now() : 0;
  function tramo(s) {
    return s < 10 ? '0-10s' : s < 30 ? '10-30s' : s < 60 ? '30-60s' : s < 180 ? '1-3min' : s < 600 ? '3-10min' : '10min+';
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      if (desde) activo += Date.now() - desde;
      desde = 0;
      ev('tiempo/' + tipo + '/' + tramo(activo / 1000), 'Tiempo en ' + tipo, true);
    } else desde = Date.now();
  });

  // ── Copiar texto, imprimir, abandono rápido ──
  document.addEventListener('copy', function () { ev('copiar-texto/' + tipo, 'Copia texto', true); });
  addEventListener('beforeprint', function () { ev('imprimir/' + tipo, 'Imprime', true); });

  // ── Contexto de la visita (una vez por página vista) ──
  try {
    var c = navigator.connection;
    if (c && c.effectiveType) ev('conexion/' + c.effectiveType, 'Conexión', true);
    ev('tema/' + (matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'), 'Tema', true);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) ev('accesibilidad/menos-movimiento', null, true);
    if (matchMedia('(display-mode: standalone)').matches) ev('app/instalada', null, true);
  } catch (_) {}
  addEventListener('load', function () {
    setTimeout(function () {
      try {
        var nav = performance.getEntriesByType('navigation')[0];
        var ms = nav && nav.loadEventStart;
        if (ms) ev('velocidad/' + tipo + '/' + (ms < 1000 ? '<1s' : ms < 2500 ? '1-2.5s' : ms < 5000 ? '2.5-5s' : '>5s'), 'Carga', true);
      } catch (_) {}
    }, 0);
  });
  addEventListener('error', function (e) {
    if (e.filename && e.filename.indexOf(location.origin) === 0) ev('error-js/' + limpio(e.message, 50), 'Error JS', true);
  });
})();
