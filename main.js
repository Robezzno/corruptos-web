/**
 * Corrupción Policial — main.js
 * Explorador de casos (SPA estática). Contrato de datos: docs/CONTRATO-WEB.md
 */

const ARTICLES_PER_PAGE = 24;

// Dirección que recibe las denuncias ciudadanas (alias de Namecheap que
// reenvía al Gmail del proyecto). El panel admin lee por IMAP los correos
// cuyo asunto contenga "Corrupción Policial" (ver backend/manual_submit.py).
const CONTACT_EMAIL = 'contacto@corrupcionpolicial.com';

// ─── Taxonomías del contrato (las etiquetas visibles viven en i18n.js) ───
const ESTADOS = ['investigado', 'procesado', 'condenado_no_firme', 'condena_firme', 'absuelto',
  'archivado', 'indultado', 'disciplinario', 'sin_novedades'];
const CONDUCTAS = ['tortura-malos-tratos', 'muerte-custodia-disparos', 'violencia-sexual', 'violencia-genero',
  'racismo-perfiles', 'corrupcion-cohecho', 'narcotrafico-crimen', 'falsedad-obstruccion', 'detencion-ilegal',
  'abuso-sancionador', 'revelacion-secretos', 'acoso-laboral-interno', 'otros'];
const CUERPOS = ['guardia-civil', 'policia-nacional', 'mossos', 'ertzaintza', 'policia-local', 'policia-foral', 'otro'];

// Campos de filtro sincronizados con la URL: clave interna → parámetro
const URL_PARAMS = { cuerpo: 'cuerpo', conducta: 'conducta', estado: 'estado', ano: 'ano',
  ccaa: 'ccaa', month: 'mes', query: 'q' };
const DEFAULT_FILTERS = { cuerpo: 'all', conducta: 'all', estado: 'all', ano: 'all',
  ccaa: 'all', month: 'all', query: '' };

// legal_status antiguo → estado del contrato. «condenado» antiguo no distingue
// firmeza: se muestra como no firme (nunca se afirma una condena firme sin dato).
const LEGACY_ESTADO = {
  investigado: 'investigado', imputado: 'investigado', acusado: 'procesado', procesado: 'procesado',
  condenado: 'condenado_no_firme', inhabilitado: 'condenado_no_firme', absolucion: 'absuelto',
  archivado: 'archivado', indultado: 'indultado', disciplinario: 'disciplinario', readmitido: 'sin_novedades'
};

/** Completa los campos del contrato a partir de los antiguos si faltan. */
function normalizeArticle(a) {
  const legal = normStatus(a.legal_status);
  const out = { ...a, legal_status: legal };
  out.estado = ESTADOS.includes(a.estado) ? a.estado : (LEGACY_ESTADO[legal] || 'investigado');
  if (!CUERPOS.includes(a.cuerpo)) {
    const c = slugify(a.cuerpo_policial);
    out.cuerpo = CUERPOS.includes(c) ? c
      : c.startsWith('mossos') ? 'mossos'
      : c.includes('guardia-civil') ? 'guardia-civil'
      : c.includes('nacional') ? 'policia-nacional'
      : c.includes('local') || c.includes('municipal') ? 'policia-local'
      : c.includes('foral') ? 'policia-foral'
      : c.includes('ertzaintza') ? 'ertzaintza' : 'otro';
  }
  out.ccaa_slug = a.ccaa_slug || slugify(a.comunidad_autonoma || 'Estatal');
  out.conducta = Array.isArray(a.conducta) ? a.conducta : (a.conducta ? [a.conducta] : []);
  out.provincia = a.provincia || '';
  out.municipio = a.municipio || '';
  out.fecha_hechos = a.fecha_hechos || '';
  out.fuentes_n = a.fuentes_n ?? (a.source_urls ? a.source_urls.length : 0);
  out.url = a.url || `/caso/${a.slug}/`;
  out._sortHechos = padDate(out.fecha_hechos || a.date);
  out._sortPub = padDate(a.date);
  out._year = (out.fecha_hechos || a.date || '').substring(0, 4);
  return out;
}

function padDate(s) {
  s = String(s || '');
  return s.length >= 10 ? s.substring(0, 10) : (s + '0000-00-00'.substring(s.length));
}

function slugify(s) {
  return deaccent(String(s || '')).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const app = {
  allArticles: [],
  filteredArticles: [],
  currentPage: 1,
  filters: { ...DEFAULT_FILTERS },
  sort: 'hechos',   // 'hechos' | 'pub'
  view: 'cards',    // 'cards' | 'table'

  async init() {
    i18n.init();
    // Marca la sección actual en la navegación común
    document.querySelectorAll('.site-nav a').forEach(l => {
      const h = l.getAttribute('href');
      if (h === location.pathname || (h !== '/' && location.pathname.startsWith(h))) l.classList.add('active');
    });
    document.addEventListener('langchange', () => {
      this.renderAll();
      // En la página de artículo, re-render con el contenido del idioma nuevo
      if (this.currentArticle) this.renderArticle(this.currentArticle);
    });

    // Detectar si estamos en artículo individual
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');

    if (slug && document.getElementById('article-title')) {
      await this.loadArticle(slug);
    } else if (document.getElementById('articles-list')) {
      window.addEventListener('popstate', () => {
        this.readUrl();
        this.refreshAfterFilter();
        this.renderAll();
      });
      await this.loadIndex();
    }
  },

  async loadIndex() {
    try {
      const res = await fetch('/articles/index.json');
      if (!res.ok) throw new Error('index.json no encontrado');
      this.allArticles = (await res.json()).map(normalizeArticle);
    } catch {
      this.allArticles = [];
    }
    this.readUrl();
    this.renderArchives();
    this.applyFilters();
    this.syncSearchInputs();
    this.renderAll();
  },

  // ─── Sincronización con la URL ───
  readUrl() {
    const p = new URLSearchParams(window.location.search);
    this.filters = { ...DEFAULT_FILTERS };
    for (const [key, param] of Object.entries(URL_PARAMS)) {
      const v = p.get(param);
      if (v) this.filters[key] = v;
    }
    this.sort = p.get('orden') === 'pub' ? 'pub' : 'hechos';
    this.view = p.get('vista') === 'tabla' ? 'table' : 'cards';
    this.currentPage = Math.max(1, parseInt(p.get('p'), 10) || 1);
  },

  writeUrl(replace) {
    if (!document.getElementById('articles-list')) return;
    const p = new URLSearchParams();
    for (const [key, param] of Object.entries(URL_PARAMS)) {
      const v = this.filters[key];
      if (v && v !== DEFAULT_FILTERS[key]) p.set(param, v);
    }
    if (this.sort === 'pub') p.set('orden', 'pub');
    if (this.view === 'table') p.set('vista', 'tabla');
    if (this.currentPage > 1) p.set('p', this.currentPage);
    const qs = p.toString();
    const url = location.pathname + (qs ? '?' + qs : '') + location.hash;
    if (url === location.pathname + location.search + location.hash) return;
    try { history[replace ? 'replaceState' : 'pushState'](null, '', url); } catch {}
  },

  syncSearchInputs() {
    ['main-search-input', 'search-input', 'f-query', 'top-search'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value !== this.filters.query) el.value = this.filters.query;
    });
    const clear = document.getElementById('main-search-clear');
    if (clear) clear.style.display = this.filters.query ? 'block' : 'none';
  },

  /** Tras cambiar filtros (o la URL): recalcula lista y estado del mapa. */
  refreshAfterFilter() {
    this.applyFilters();
    this.syncSearchInputs();
    this.renderArchives();
    this.updateActiveButtons();
  },

  handleSearch(e) {
    this.filters.query = (e.target.value || '').trim();
    this.currentPage = 1;
    this.applyFilters();
    this.syncSearchInputs();
    this.writeUrl(true);
    this.renderArticleList();
    this.renderPagination();
  },

  clearSearch() {
    this.filters.query = '';
    this.currentPage = 1;
    this.applyFilters();
    this.syncSearchInputs();
    this.writeUrl(false);
    this.renderArticleList();
    this.renderPagination();
    this.renderFilterBar(false);
  },

  setFilter(type, value) {
    this.currentPage = 1;
    if (type === 'estado') setTimeout(() => this.renderEstadoBar(), 0);
    this.filters[type] = value;
    this.applyFilters();
    this.writeUrl(false);
    this.renderArticleList();
    this.renderPagination();
    this.renderFilterBar(false);
    this.updateActiveButtons();
  },

  clearFilters() {
    this.filters = { ...DEFAULT_FILTERS };
    this.currentPage = 1;
    this.applyFilters();
    this.syncSearchInputs();
    this.writeUrl(false);
    this.renderArchives();
    this.renderArticleList();
    this.renderPagination();
    this.renderFilterBar(false);
    window.dispatchEvent(new CustomEvent('corruptos:rendered'));
  },

  setSort(v) {
    this.sort = v === 'pub' ? 'pub' : 'hechos';
    this.currentPage = 1;
    this.applyFilters();
    this.writeUrl(false);
    this.renderArticleList();
    this.renderPagination();
  },

  setView(v) {
    this.view = v === 'table' ? 'table' : 'cards';
    this.writeUrl(false);
    this.renderArticleList();
    this.renderFilterBar(false);
  },

  updateActiveButtons() {
    document.querySelectorAll('.archive-btn').forEach(b => b.classList.remove('active'));
    const abtn = document.getElementById(`btn-archive-${this.filters.month}`);
    if (abtn) abtn.classList.add('active');
  },

  applyFilters() {
    const f = this.filters;
    const q = f.query ? deaccent(f.query) : '';
    this.filteredArticles = this.allArticles.filter(a => {
      if (f.estado !== 'all' && a.estado !== f.estado) return false;
      if (f.cuerpo !== 'all' && a.cuerpo !== f.cuerpo) return false;
      if (f.conducta !== 'all' && !a.conducta.includes(f.conducta)) return false;
      if (f.ano !== 'all' && a._year !== f.ano) return false;

      // Mes de publicación (archivo lateral; a.date puede faltar)
      if (f.month !== 'all' && !(a.date || '').startsWith(f.month)) return false;

      // Comunidad autónoma (filtro del mapa): se compara por slug
      if (f.ccaa !== 'all' && a.ccaa_slug !== slugify(f.ccaa)) return false;

      // Búsqueda de texto (insensible a acentos)
      if (q) {
        const en = a.i18n?.en || {};
        const text = deaccent(a.title + " " + (a.lead || "") + " " + (a.tags || []).join(" ")
          + " " + (en.title || "") + " " + (en.lead || "") + " " + (en.tags || []).join(" ")
          + " " + i18n.ccaa(a.comunidad_autonoma)
          + " " + (a.cuerpo_policial || "") + " " + (a.comunidad_autonoma || "")
          + " " + a.provincia + " " + a.municipio);
        if (!text.includes(q)) return false;
      }
      return true;
    });
    const key = this.sort === 'pub' ? '_sortPub' : '_sortHechos';
    this.filteredArticles.sort((x, y) => (y[key] > x[key] ? 1 : y[key] < x[key] ? -1 : 0));
  },

  /** Barra de filtros: selects con recuentos, vista, orden y buscador. */
  renderFilterBar(rebuild = true) {
    const bar = document.getElementById('filter-bar');
    if (!bar) return;
    const f = this.filters;
    const t = k => i18n.t(k);
    const count = (field, val) => this.allArticles.filter(a =>
      (field === 'conducta' ? a.conducta.includes(val) : a[field] === val)).length;
    const opts = (list, field, labelKey, cur) => list.map(v => {
      const n = count(field, v);
      if (!n && v !== cur) return '';
      return `<option value="${escapeHTML(v)}"${v === cur ? ' selected' : ''}>${escapeHTML(t(labelKey + v))} (${n})</option>`;
    }).join('');
    const years = [...new Set(this.allArticles.map(a => a._year).filter(Boolean))].sort().reverse();
    const sel = (id, label, all, inner) => `
      <label class="f-field"><span>${escapeHTML(t(label))}</span>
        <select id="${id}" onchange="app.setFilter('${id.replace('f-', '')}', this.value)">
          <option value="all">${escapeHTML(t(all))}</option>${inner}
        </select></label>`;
    const dirty = Object.keys(DEFAULT_FILTERS).some(k => f[k] !== DEFAULT_FILTERS[k]);
    bar.innerHTML = `
      <div class="f-row">
        ${sel('f-cuerpo', 'f-cuerpo', 'f-all-m', opts(CUERPOS, 'cuerpo', 'cuerpo-', f.cuerpo))}
        ${sel('f-conducta', 'f-conducta', 'f-all-f', opts(CONDUCTAS, 'conducta', 'conducta-', f.conducta))}
        ${sel('f-estado', 'f-estado', 'f-all-m', opts(ESTADOS, 'estado', 'estado-', f.estado))}
        ${sel('f-ano', 'f-ano', 'f-all-m', years.map(y => `<option value="${y}"${y === f.ano ? ' selected' : ''}>${y}</option>`).join(''))}
        <label class="f-field f-field-q"><span class="visually-hidden">${escapeHTML(t('f-search-ph'))}</span>
          <input type="search" id="f-query" value="${escapeHTML(f.query)}" placeholder="${escapeHTML(t('f-search-ph'))}" oninput="app.handleSearch(event)"></label>
      </div>
      <div class="f-row f-row-2">
        <label class="f-field"><span>${escapeHTML(t('f-orden'))}</span>
          <select id="f-orden" onchange="app.setSort(this.value)">
            <option value="hechos"${this.sort === 'hechos' ? ' selected' : ''}>${escapeHTML(t('sort-hechos'))}</option>
            <option value="pub"${this.sort === 'pub' ? ' selected' : ''}>${escapeHTML(t('sort-pub'))}</option>
          </select></label>
        <div class="view-toggle" role="group" aria-label="${escapeHTML(t('f-vista'))}">
          <button type="button" class="${this.view === 'cards' ? 'active' : ''}" onclick="app.setView('cards')">${escapeHTML(t('view-cards'))}</button>
          <button type="button" class="${this.view === 'table' ? 'active' : ''}" onclick="app.setView('table')">${escapeHTML(t('view-table'))}</button>
        </div>
        ${f.ccaa !== 'all' ? `<span class="f-chip">${escapeHTML(i18n.ccaa(this.ccaaName(f.ccaa)))}</span>` : ''}
        ${dirty ? `<button type="button" class="f-clear" onclick="app.clearFilters()">${escapeHTML(t('f-clear'))}</button>` : ''}
      </div>`;
    if (!rebuild) { const q = document.getElementById('f-query'); if (document.activeElement === q) q.focus(); }
  },

  /** Nombre canónico de una CCAA a partir de su slug o nombre (para mostrar). */
  ccaaName(v) {
    const hit = this.allArticles.find(a => a.ccaa_slug === slugify(v) && a.comunidad_autonoma);
    return hit ? hit.comunidad_autonoma : (v === 'estatal' ? 'Estatal' : v);
  },

  /** Estado: texto legible + definición (tooltip). */
  estadoLabel(e) { return i18n.t('estado-' + e); },
  estadoBadge(a, small) {
    return `<span class="status-badge estado-${escapeHTML(a.estado)}"${small ? ' style="font-size:0.6rem;"' : ''} title="${escapeHTML(i18n.t('estado-' + a.estado + '-def'))}">${escapeHTML(this.estadoLabel(a.estado))}</span>`;
  },

  renderAll() {
    this.renderFilterBar();
    this.renderStats();
    this.renderHero();
    this.renderArticleList();
    this.renderPagination();
    this.renderBreakingBar();
    window.dispatchEvent(new CustomEvent('corruptos:rendered'));
  },

  renderStats() {
    const total = document.getElementById('stat-total');
    const month = document.getElementById('stat-month');
    if (total) {
      total.dataset.target = this.allArticles.length;
      total.classList.add('animated-counter');
    }
    if (month) {
      const now = new Date();
      const thisMonth = this.allArticles.filter(a => {
        const d = new Date(a.date);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      });
      month.dataset.target = thisMonth.length;
      month.classList.add('animated-counter');
    }
    // Conteo artículos visible
    const countEl = document.getElementById('article-count');
    if (countEl) countEl.textContent = `${this.filteredArticles.length} ${i18n.t('count-articles')}`;

    // Contadores del banner 3D
    const h3dCasos = document.getElementById('h3d-casos');
    if (h3dCasos) {
      const condenas = this.allArticles.filter(a => ['condena_firme', 'condenado_no_firme', 'indultado'].includes(a.estado)).length;
      const investigados = this.allArticles.filter(a => a.estado === 'investigado' || a.estado === 'procesado').length;
      h3dCasos.dataset.target = this.allArticles.length;
      const cEl = document.getElementById('h3d-condenas');
      if (cEl) cEl.dataset.target = condenas;
      const iEl = document.getElementById('h3d-investigados');
      if (iEl) iEl.dataset.target = investigados;
    }

    // Portada 2026: total en el texto, libro de cifras por estado y listas
    this.renderLedger();

    // Widget Dashboard
    const widget = document.getElementById('dashboard-widget');
    if (widget && this.allArticles.length > 0) {
      widget.style.display = 'block';
      const wCasos = document.getElementById('w-total-casos');
      const wCondenas = document.getElementById('w-total-condenas');
      const wInvestigados = document.getElementById('w-total-investigados');
      const wDisciplinario = document.getElementById('w-total-disciplinario');

      const condenas = this.allArticles.filter(a => ['condena_firme', 'condenado_no_firme', 'indultado'].includes(a.estado)).length;
      const investigados = this.allArticles.filter(a => a.estado === 'investigado' || a.estado === 'procesado').length;
      const disciplinario = this.allArticles.filter(a => a.estado === 'disciplinario').length;

      if (wCasos) wCasos.dataset.target = this.allArticles.length;
      if (wCondenas) wCondenas.dataset.target = condenas;
      if (wInvestigados) wInvestigados.dataset.target = investigados;
      if (wDisciplinario) wDisciplinario.dataset.target = disciplinario;

      // Chart
      const cuerpos = {};
      this.allArticles.forEach(a => {
        cuerpos[a.cuerpo] = (cuerpos[a.cuerpo] || 0) + 1;
      });
      const topCuerpos = Object.entries(cuerpos).sort((a,b) => b[1]-a[1]).slice(0, 5);
      const maxCount = topCuerpos.length ? topCuerpos[0][1] : 1;
      
      const chartContainer = document.getElementById('w-bar-chart');
      if (chartContainer) {
        chartContainer.innerHTML = topCuerpos.map(c => `
          <div style="display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-dim);">
              <span>${escapeHTML(i18n.t('cuerpo-' + c[0]))}</span>
              <span>${c[1]}</span>
            </div>
            <div style="width:100%; height:8px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
              <div style="width:${(c[1]/maxCount)*100}%; height:100%; background:var(--accent); border-radius:4px; transition:width 1s ease-out;"></div>
            </div>
          </div>
        `).join('');
      }
    }
  },

  /** Portada: total, cifras por estado procesal y recuentos por cuerpo/conducta. */
  renderLedger() {
    const all = this.allArticles;
    if (!all.length) return;
    document.querySelectorAll('.js-total').forEach(el => { el.textContent = all.length.toLocaleString('es-ES'); });
    const n = (...est) => all.filter(a => est.includes(a.estado)).length;
    const set2 = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v.toLocaleString(i18n.locale()); };
    const set = (id, v) => { const el = document.getElementById(id); if (el) { el.dataset.target = v; el.classList.add('animated-counter'); if (!el.dataset.counted) el.textContent = v; } };
    set('l-firme', n('condena_firme', 'indultado'));
    set('l-nofirme', n('condenado_no_firme'));
    set('l-procesado', n('procesado'));
    set('l-investigado', n('investigado', 'disciplinario'));
    set('l-absuelto', n('absuelto', 'archivado'));
    set('l-sinnov', n('sin_novedades'));
    set2('h-condenas', n('condena_firme', 'indultado', 'condenado_no_firme'));
    set2('h-investigados', n('investigado', 'procesado', 'disciplinario'));
    set2('h-absueltos', n('absuelto', 'archivado'));
    this.renderEstadoBar();
    this.renderRecientes();

    // barras proporcionales al mayor de los estados
    const bars = [...document.querySelectorAll('[data-bar]')];
    const vals = bars.map(b => parseInt(document.getElementById(b.dataset.bar)?.dataset.target, 10) || 0);
    const max = Math.max(1, ...vals);
    bars.forEach((b, i) => b.style.setProperty('--p', (vals[i] / max).toFixed(3)));

    const lista = (id, field, prefix, base) => {
      const el = document.getElementById(id);
      if (!el) return;
      const c = {};
      all.forEach(a => (field === 'conducta' ? a.conducta : [a[field]]).forEach(v => { if (v) c[v] = (c[v] || 0) + 1; }));
      el.innerHTML = Object.entries(c).sort((x, y) => y[1] - x[1]).map(([k, v]) =>
        `<li><a href="/${base}/${encodeURIComponent(k)}/"><span>${escapeHTML(i18n.t(prefix + k))}</span><b>${v}</b></a></li>`).join('');
    };
    lista('lista-cuerpos', 'cuerpo', 'cuerpo-', 'cuerpo');
    lista('lista-conductas', 'conducta', 'conducta-', 'conducta');
  },

  /** Barra apilada con el reparto por estado judicial; cada estado filtra el explorador. */
  renderEstadoBar() {
    const bar = document.getElementById('estado-bar'), ley = document.getElementById('estado-leyenda');
    if (!bar || !ley) return;
    const orden = ['condena_firme', 'indultado', 'condenado_no_firme', 'procesado', 'investigado',
                   'disciplinario', 'absuelto', 'archivado', 'sin_novedades'];
    const total = this.allArticles.length || 1;
    const c = {};
    this.allArticles.forEach(a => { c[a.estado] = (c[a.estado] || 0) + 1; });
    const est = orden.filter(e => c[e]);
    bar.innerHTML = est.map(e =>
      `<button type="button" class="estado-seg estado-${e}" style="flex:${c[e]}" title="${escapeHTML(this.estadoLabel(e))}: ${c[e]}"
        onclick="app.filtrarEstado('${e}')" aria-label="${escapeHTML(this.estadoLabel(e))}: ${c[e]}"></button>`).join('');
    ley.innerHTML = est.map(e =>
      `<li class="estado-${e}${this.filters.estado === e ? ' activo' : ''}"><button type="button" onclick="app.filtrarEstado('${e}')">
        <i aria-hidden="true"></i><span>${escapeHTML(this.estadoLabel(e))}</span><b>${c[e].toLocaleString(i18n.locale())}</b>
        <em>${Math.round(c[e] * 100 / total)} %</em></button></li>`).join('');
  },

  filtrarEstado(e) {
    this.setFilter('estado', this.filters.estado === e ? 'all' : e);
    this.renderEstadoBar();
    document.getElementById('casos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  /** Los 4 casos más recientes (con imagen si la hay), en tarjetas. */
  renderRecientes() {
    const grid = document.getElementById('recientes-grid');
    if (!grid) return;
    const porFecha = [...this.allArticles].sort((x, y) => (y.date || '').localeCompare(x.date || ''));
    const con = porFecha.filter(a => a.image_url).slice(0, 4);
    const lista = con.length >= 4 ? con : porFecha.slice(0, 4);
    grid.innerHTML = lista.map((a, i) => {
      const lugar = a.municipio || i18n.ccaa(a.comunidad_autonoma) || i18n.t('scope-spain');
      return `<article class="tarjeta estado-${escapeHTML(a.estado)}">
        <a href="${escapeHTML(a.url)}" class="tarjeta-img">${a.image_url
          ? `<img src="/${escapeHTML(a.image_url.replace(/^\.?\//, ''))}" alt="" loading="${i < 2 ? 'eager' : 'lazy'}" width="640" height="400" onerror="this.remove()">`
          : ''}<span class="status-badge estado-${escapeHTML(a.estado)}">${escapeHTML(this.estadoLabel(a.estado))}</span></a>
        <h3><a href="${escapeHTML(a.url)}">${escapeHTML(i18n.field(a, 'title'))}</a></h3>
        <p class="tarjeta-meta">${escapeHTML(i18n.t('cuerpo-' + a.cuerpo))} · ${escapeHTML(lugar)} · ${escapeHTML(formatDate(a.date))}</p>
      </article>`;
    }).join('');
  },

  /** Buscador de la cabecera fija. */
  topSearch(e) {
    e.preventDefault();
    this.handleSearch({ target: document.getElementById('top-search') });
    this.renderFilterBar(false);
    document.getElementById('casos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return false;
  },

  /** Buscador de la primera pantalla: recuento en directo mientras se escribe. */
  heroPreview(e) {
    const live = document.getElementById('hero-live');
    if (!live) return;
    const q = (e.target.value || '').trim();
    if (q.length < 2) { live.textContent = ''; return; }
    const prev = this.filters.query;
    this.filters.query = q;
    const saved = this.filteredArticles;
    this.applyFilters();
    const n = this.filteredArticles.length;
    this.filters.query = prev;
    this.filteredArticles = saved;
    const key = n === 0 ? 'hero-live-0' : n === 1 ? 'hero-live-1' : 'hero-live-n';
    live.textContent = i18n.t(key).replace('{n}', n.toLocaleString('es-ES')).replace('{q}', q);
  },

  heroSearch(e) {
    e.preventDefault();
    const input = document.getElementById('main-search-input');
    this.handleSearch({ target: input });
    this.renderFilterBar(false);
    document.getElementById('casos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return false;
  },

  renderHero() {
    const heroSection = document.getElementById('hero-section');
    if (!heroSection || this.allArticles.length === 0) return;

    // Destacado ALEATORIO: se elige uno al cargar la página (y se mantiene
    // estable durante la sesión, para que no salte al cambiar de idioma o filtrar).
    if (!this._heroSlug || !this.allArticles.some(a => a.slug === this._heroSlug)) {
      this._heroSlug = this.allArticles[Math.floor(Math.random() * this.allArticles.length)].slug;
    }
    const hero = this.allArticles.find(a => a.slug === this._heroSlug) || this.allArticles[0];
    heroSection.style.display = '';

    document.getElementById('hero-title').innerHTML =
      `<a href="${escapeHTML(hero.url)}">${escapeHTML(i18n.field(hero, 'title'))}</a>`;
    document.getElementById('hero-lead').textContent = i18n.field(hero, 'lead');
    document.getElementById('hero-meta').innerHTML =
      `<span>${formatDate(hero.date)}</span>
       <span class="sep">·</span>
       <span>${escapeHTML(i18n.t('cuerpo-' + hero.cuerpo))}</span>
       <span class="sep">·</span>
       <span>${escapeHTML(i18n.ccaa(hero.comunidad_autonoma))}</span>`;

    // Añadir imagen al hero si existe
    const heroContent = document.getElementById('hero-content-wrapper') || heroSection;
    if (hero.image_url && !document.getElementById('hero-img')) {
      const img = document.createElement('img');
      img.id = 'hero-img';
      img.onerror = () => img.remove();
      img.src = hero.image_url;
      img.style.width = '100%';
      img.style.maxHeight = '400px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = 'var(--radius)';
      img.style.marginBottom = '1rem';
      heroSection.insertBefore(img, heroSection.firstChild);
    } else if (hero.image_url && document.getElementById('hero-img')) {
      document.getElementById('hero-img').src = hero.image_url;
    } else if (!hero.image_url && document.getElementById('hero-img')) {
      document.getElementById('hero-img').remove();
    }

    const tagsEl = document.getElementById('hero-tags');
    if (tagsEl && hero.tags) {
      tagsEl.innerHTML = i18n.tags(hero).slice(0, 4).map(t =>
        `<span class="tag">${escapeHTML(t)}</span>`
      ).join('');
      tagsEl.innerHTML = this.estadoBadge(hero) + tagsEl.innerHTML;
    }

    // Aside: 4 artículos recientes (excluyendo el destacado)
    const asideList = document.getElementById('hero-aside-list');
    if (asideList) {
      asideList.innerHTML = this.allArticles.filter(a => a.slug !== hero.slug).slice(0, 4).map(a => `
        <div style="padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="margin-bottom:6px;">
            ${this.estadoBadge(a, true)}
          </div>
          <a href="${escapeHTML(a.url)}" style="font-size:0.9rem;font-weight:600;color:var(--white);line-height:1.3;display:block;transition:color 200ms;"
             onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--white)'">
            ${escapeHTML(i18n.field(a, 'title'))}
          </a>
          <div style="font-size:0.72rem;color:var(--text-dim);margin-top:4px;">${formatDate(a.date)}</div>
        </div>
      `).join('');
    }
  },

  renderBreakingBar() {
    const bar = document.getElementById('breaking-bar');
    const text = document.getElementById('breaking-text');
    if (!bar || !text || this.allArticles.length === 0) return;
    // Mostrar los últimos 3 titulares en bucle
    const headlines = this.allArticles.slice(0, 3).map(a => i18n.field(a, 'title')).join('   ·   ');
    text.textContent = headlines + '   ·   ' + headlines; // duplicar para efecto continuo
    bar.style.display = '';
  },

  expandedYears: new Set(),

  renderArchives() {
    const list = document.getElementById('archive-list');
    if (!list) return;

    // Agrupar: año → { total, meses: { YYYY-MM: n } }
    const years = {};
    this.allArticles.forEach(a => {
      if (!a.date) return;
      const y = a.date.substring(0, 4);
      const m = a.date.substring(0, 7);
      years[y] = years[y] || { count: 0, months: {} };
      years[y].count++;
      years[y].months[m] = (years[y].months[m] || 0) + 1;
    });

    const sortedYears = Object.keys(years).sort().reverse();
    // Por defecto, el año más reciente desplegado
    if (this.expandedYears.size === 0 && sortedYears.length) {
      this.expandedYears.add(sortedYears[0]);
    }

    let html = `<button id="btn-archive-all" class="filter-btn archive-btn ${this.filters.month === 'all' ? 'active' : ''}" onclick="app.setFilter('month', 'all')" data-i18n="filter-all">${i18n.t('filter-all') || 'Todos'}</button>`;

    sortedYears.forEach(y => {
      const open = this.expandedYears.has(y);
      const yData = years[y];
      html += `
        <div class="archive-year">
          <button id="btn-archive-${y}" class="filter-btn archive-btn archive-year-btn ${this.filters.month === y ? 'active' : ''}" onclick="app.toggleYear('${y}')">
            <span class="archive-caret ${open ? 'open' : ''}">▸</span>
            <strong>${y}</strong>
            <span style="margin-left:auto; opacity:0.5;">(${yData.count})</span>
          </button>
          <div class="archive-months" style="display:${open ? 'flex' : 'none'};">
            ${Object.keys(yData.months).sort().reverse().map(m => {
              const date = new Date(parseInt(y), parseInt(m.split('-')[1]) - 1, 1);
              const name = date.toLocaleDateString(i18n.locale(), { month: 'long' });
              const cap = name.charAt(0).toUpperCase() + name.slice(1);
              return `<button id="btn-archive-${m}" class="filter-btn archive-btn archive-month-btn ${this.filters.month === m ? 'active' : ''}" onclick="app.setFilter('month', '${m}')">${cap} <span style="float:right; opacity:0.5;">(${yData.months[m]})</span></button>`;
            }).join('')}
          </div>
        </div>`;
    });

    list.innerHTML = html;
  },

  /** Clic en un año: filtra por ese año y despliega/pliega sus meses. */
  toggleYear(y) {
    if (this.filters.month === y) {
      // Segundo clic en el año activo: quitar filtro y plegar
      this.expandedYears.delete(y);
      this.setFilter('month', 'all');
    } else {
      this.expandedYears.add(y);
      this.setFilter('month', y);
    }
    this.renderArchives();
  },

  renderArticleList() {
    const container = document.getElementById('articles-list');
    if (!container) return;

    const start = (this.currentPage - 1) * ARTICLES_PER_PAGE;
    const pageArticles = this.filteredArticles.slice(start, start + ARTICLES_PER_PAGE);
    container.classList.toggle('as-table', this.view === 'table');

    const countEl = document.getElementById('article-count');
    if (countEl) countEl.textContent = `${this.filteredArticles.length} ${i18n.t('count-articles')}`;

    if (this.filteredArticles.length === 0) {
      container.innerHTML = this.allArticles.length === 0 ? `
        <li class="empty-state">
                    <h2 data-i18n="no-articles">${i18n.t('no-articles')}</h2>
          <p data-i18n="no-articles-sub">${i18n.t('no-articles-sub')}</p>
        </li>` : `
        <li class="empty-state">
                    <h2>${escapeHTML(i18n.t('no-match'))}</h2>
          <p><button type="button" class="f-clear" onclick="app.clearFilters()">${escapeHTML(i18n.t('f-clear'))}</button></p>
        </li>`;
      return;
    }

    const conductaLabels = a => a.conducta.slice(0, 2).map(c => i18n.t('conducta-' + c));
    const fecha = a => a.fecha_hechos ? formatDate(a.fecha_hechos) : formatDate(a.date);

    if (this.view === 'table') {
      container.innerHTML = `
        <li class="cases-table-wrap"><table class="cases-table">
          <thead><tr>
            <th>${escapeHTML(i18n.t('col-date'))}</th><th>${escapeHTML(i18n.t('col-title'))}</th>
            <th>${escapeHTML(i18n.t('col-body'))}</th><th>${escapeHTML(i18n.t('col-ccaa'))}</th>
            <th>${escapeHTML(i18n.t('col-state'))}</th><th>${escapeHTML(i18n.t('col-conduct'))}</th>
          </tr></thead><tbody>
          ${pageArticles.map(a => `<tr>
            <td class="ct-date">${escapeHTML(fecha(a))}</td>
            <td class="ct-title"><a href="${escapeHTML(a.url)}">${escapeHTML(i18n.field(a, 'title'))}</a></td>
            <td>${escapeHTML(i18n.t('cuerpo-' + a.cuerpo))}</td>
            <td>${escapeHTML(i18n.ccaa(a.comunidad_autonoma) || i18n.t('scope-spain'))}</td>
            <td>${this.estadoBadge(a)}</td>
            <td>${escapeHTML(conductaLabels(a).join(' · '))}</td>
          </tr>`).join('')}
          </tbody></table></li>`;
      return;
    }

    // Filas: marca de color del estado, titular, cuerpo · lugar · estado, fecha.
    // Separadores de año según el criterio de orden activo.
    let lastYear = null;
    container.innerHTML = pageArticles.map(a => {
      const year = (this.sort === 'pub' ? (a.date || '') : (a.fecha_hechos || a.date || '')).substring(0, 4);
      const divider = (year && year !== lastYear)
        ? `<li class="year-divider" aria-hidden="true">${year}</li>`
        : '';
      lastYear = year || lastYear;
      const lugar = a.municipio || i18n.ccaa(a.comunidad_autonoma) || i18n.t('scope-spain');
      const img = a.image_url ? `<img src="/${escapeHTML(a.image_url.replace(/^\.?\//, ''))}" alt="" loading="lazy" width="240" height="160" onerror="this.remove()">` : '';
      return divider + `
      <li class="caso-fila estado-${escapeHTML(a.estado)}">
        <span class="caso-thumb" aria-hidden="true">${img}</span>
        <div class="caso-txt">
          <h3><a href="${escapeHTML(a.url)}">${escapeHTML(i18n.field(a, 'title'))}</a></h3>
          <p class="caso-meta"><span class="status-badge estado-${escapeHTML(a.estado)}" title="${escapeHTML(i18n.t('estado-' + a.estado + '-def'))}">${escapeHTML(this.estadoLabel(a.estado))}</span> ${escapeHTML(i18n.t('cuerpo-' + a.cuerpo))} · ${escapeHTML(lugar)}</p>
          <p class="caso-lead">${escapeHTML(i18n.field(a, 'lead'))}</p>
        </div>
        <span class="caso-fecha">${escapeHTML(fecha(a))}</span>
      </li>`;
    }).join('');
  },

  renderPagination() {
    const container = document.getElementById('pagination');
    if (!container) return;

    const totalPages = Math.ceil(this.filteredArticles.length / ARTICLES_PER_PAGE);
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    // Ventana de páginas: 1 … (actual±2) … última. Con cientos de artículos
    // pintar todos los números desbordaba el ancho de la página.
    const cur = this.currentPage;
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - cur) <= 2) pages.push(i);
    }

    let html = '';
    if (cur > 1) {
      html += `<button class="page-btn" onclick="app.goPage(${cur - 1})">←</button>`;
    }
    let prev = 0;
    for (const i of pages) {
      if (i - prev > 1) html += `<span class="page-ellipsis">…</span>`;
      html += `<button class="page-btn ${i === cur ? 'active' : ''}" onclick="app.goPage(${i})">${i}</button>`;
      prev = i;
    }
    if (cur < totalPages) {
      html += `<button class="page-btn" onclick="app.goPage(${cur + 1})">→</button>`;
    }
    container.innerHTML = html;
  },

  goPage(page) {
    this.currentPage = page;
    this.writeUrl(false);
    this.renderArticleList();
    this.renderPagination();
    document.getElementById('casos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  // ─── ARTÍCULO INDIVIDUAL ───
  async loadArticle(slug) {
    try {
      const res = await fetch(`/articles/${encodeURIComponent(slug)}.json`);
      if (!res.ok) throw new Error('Artículo no encontrado');
      const article = await res.json();
      article.legal_status = normStatus(article.legal_status);
      this.renderArticle(article);
    } catch (e) {
      console.error("Error en loadArticle:", e);
      document.getElementById('article-title').textContent = 'Artículo no encontrado';
      document.getElementById('article-body').innerHTML =
        '<p style="color:var(--text-dim)">El artículo solicitado no existe o ha sido eliminado.</p>';
    }
  },

  renderArticle(a) {
    // Guardar para re-render al cambiar de idioma (langchange)
    this.currentArticle = a;
    const title = i18n.field(a, 'title');
    const lead = i18n.field(a, 'lead');

    // Meta tags dinámicos
    document.getElementById('page-title').textContent = `${title} — Corrupción Policial`;
    const descEl = document.getElementById('page-description');
    if (descEl) descEl.setAttribute('content', lead);

    // Eyebrow (badges)
    const eyebrow = document.getElementById('article-eyebrow');
    if (eyebrow) {
      eyebrow.innerHTML = `
        <span class="status-badge status-${escapeHTML(a.legal_status || '')}">${escapeHTML(i18n.t('status-' + a.legal_status))}</span>
        ${a.cuerpo_policial ? `<span class="tag" style="margin-left:8px;">${escapeHTML(a.cuerpo_policial)}</span>` : ''}
        ${a.comunidad_autonoma ? `<span class="tag">${escapeHTML(i18n.ccaa(a.comunidad_autonoma))}</span>` : ''}
      `;
    }

    document.getElementById('article-title').textContent = title;
    document.getElementById('article-lead').textContent = lead;
    document.getElementById('article-date').textContent = formatDate(a.date);

    // Render image
    const articleHeader = document.getElementById('article-header') || document.querySelector('.article-header');
    if (a.image_url && !document.getElementById('article-main-img') && articleHeader && articleHeader.parentNode) {
      const imgWrap = document.createElement('figure');
      imgWrap.id = 'article-main-img';
      imgWrap.style.margin = '0 auto 2.5rem auto';
      imgWrap.style.maxWidth = 'var(--col-main)';
      imgWrap.style.width = '100%';
      imgWrap.innerHTML = `
        <img src="${escapeHTML(a.image_url)}" onerror="this.closest('figure').remove()" style="width:100%; max-height:500px; object-fit:cover; border-radius:var(--radius-lg, 12px); box-shadow: 0 12px 40px rgba(0,0,0,0.5); border: 1px solid var(--border);">
        <figcaption data-i18n="img-ai-caption" style="font-size:0.7rem; color:var(--text-dim); margin-top:8px; text-align:right;">${escapeHTML(i18n.t('img-ai-caption'))}</figcaption>
      `;
      // insert after header
      articleHeader.parentNode.insertBefore(imgWrap, articleHeader.nextSibling);
    }

    const cuerpoEl = document.getElementById('article-body-policial');
    if (cuerpoEl) cuerpoEl.textContent = a.cuerpo_policial || '';

    // Cuerpo: párrafos separados por \n\n (en el idioma activo)
    const bodyEl = document.getElementById('article-body');
    if (bodyEl) {
      bodyEl.innerHTML = i18n.field(a, 'body')
        .split('\n\n')
        .filter(p => p.trim())
        .map(p => `<p>${escapeHTML(p)}</p>`)
        .join('');
    }

    // Análisis Jurídico — va PRIMERO, antes de la noticia (es lo que
    // distingue a la publicación). Se inserta delante del cuerpo.
    const analysisEl = document.getElementById('article-critical-analysis') || document.createElement('div');
    if (!document.getElementById('article-critical-analysis')) {
      analysisEl.id = 'article-critical-analysis';
      analysisEl.style.margin = '0 0 2.5rem 0';
      analysisEl.style.padding = '1.5rem 1.75rem';
      analysisEl.style.backgroundColor = 'var(--bg-2)';
      analysisEl.style.borderLeft = '4px solid var(--accent)';
      analysisEl.style.borderRadius = '0 var(--radius) var(--radius) 0';
      if (bodyEl && bodyEl.parentNode) {
        bodyEl.parentNode.insertBefore(analysisEl, bodyEl);   // DELANTE del cuerpo
      }
    }

    // Separador "Los hechos" delante del cuerpo, para distinguir el análisis
    // (arriba) de la crónica de la noticia (abajo). Solo si hay análisis.
    let factsEl = document.getElementById('article-facts-heading');
    if (!factsEl && bodyEl && bodyEl.parentNode) {
      factsEl = document.createElement('h3');
      factsEl.id = 'article-facts-heading';
      factsEl.style.cssText = 'font-family:var(--font-display,"Playfair Display",serif);' +
        'font-size:1.3rem;margin:0 0 1rem 0;padding-top:1.25rem;' +
        'border-top:1px solid var(--border);color:var(--white);';
      bodyEl.parentNode.insertBefore(factsEl, bodyEl);
    }
    if (factsEl) {
      factsEl.textContent = i18n.t('article-facts');
      factsEl.style.display = a.critical_analysis ? 'block' : 'none';
    }

    if (a.critical_analysis) {
      analysisEl.style.display = 'block';
      analysisEl.innerHTML = `
        <h3 style="color:var(--accent); font-size:1.1rem; margin-bottom:0.8rem; display:flex; align-items:center; gap:8px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          ${i18n.t('article-analysis')}
        </h3>
        <div style="font-size:0.9rem; line-height:1.6; color:var(--text-dim);">
          ${i18n.field(a, 'critical_analysis').split('\n\n').map(p => `<p style="margin-bottom:0.5rem;">${escapeHTML(p)}</p>`).join('')}
        </div>
      `;
    } else {
      analysisEl.style.display = 'none';
    }

    // Fuentes
    if (a.source_urls?.length) {
      const sourceBox = document.getElementById('source-box');
      const sourceLinks = document.getElementById('source-links');
      if (sourceBox) sourceBox.style.display = '';
      if (sourceLinks) {
        sourceLinks.innerHTML = a.source_urls.map(u =>
          `<a href="${escapeHTML(u)}" target="_blank" rel="noopener noreferrer">${escapeHTML(u)}</a>`
        ).join('');
      }
    }

    // Tags
    const tagsEl = document.getElementById('article-tags');
    if (tagsEl && a.tags) {
      tagsEl.innerHTML = i18n.tags(a).map(t => `<span class="tag">${escapeHTML(t)}</span>`).join('');
    }

    // Botones de compartir
    const shareBar = document.getElementById('share-bar');
    if (shareBar) {
      const url = encodeURIComponent(window.location.href);
      const title = encodeURIComponent(a.title || 'Corrupción Policial');
      const set = (id, href) => { const el = document.getElementById(id); if (el) el.href = href; };
      set('share-x', `https://twitter.com/intent/tweet?text=${title}&url=${url}`);
      set('share-fb', `https://www.facebook.com/sharer/sharer.php?u=${url}`);
      set('share-wa', `https://wa.me/?text=${title}%20—%20${url}`);
      set('share-tg', `https://t.me/share/url?url=${url}&text=${title}`);
      shareBar.style.display = 'flex';
    }
  },

  copyShareLink(btn) {
    // navigator.clipboard es undefined en contextos no seguros / navegadores
    // viejos → acceder a .writeText lanza síncrono. Guarda + fallback.
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(window.location.href).then(() => {
      btn.classList.add('copied');
      const prev = btn.title;
      btn.title = i18n.t('share-copied') || 'Enlace copiado';
      setTimeout(() => { btn.classList.remove('copied'); btn.title = prev; }, 2000);
    }).catch(() => {});
  },

  // ─── DENUNCIA CIUDADANA ───
  openContact() {
    const modal = document.getElementById('report-modal');
    if (modal) modal.style.display = 'flex';
  },

  closeContact() {
    const modal = document.getElementById('report-modal');
    if (modal) modal.style.display = 'none';
  },

  sendContact() {
    const text = (document.getElementById('report-textarea')?.value || '').trim();
    const subject = encodeURIComponent('[Corrupción Policial] Denuncia ciudadana');
    const body = encodeURIComponent(
      (text || '(escribe aquí tu testimonio)') +
      '\n\n—\nEnviado desde el formulario público de Corrupción Policial.'
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    this.closeContact();
  },

  copyCrypto(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.select();
    input.setSelectionRange(0, 99999);
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(input.value).then(() => {
      const originalText = btn.textContent;
      btn.textContent = i18n.t('donate-copied') || '¡Copiado!';
      setTimeout(() => btn.textContent = originalText, 2000);
    }).catch(() => {
      console.error("Failed to copy");
    });
  }
};

// ─── Utilidades ───
// El agente escribe el estado legal con tilde ("absolución") y a veces usa
// términos fuera de la lista cerrada; las claves i18n y las clases CSS van sin
// tilde. Sin normalizar, la web mostraba el texto literal "status-absolución".
function normStatus(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Normaliza texto para búsqueda: minúsculas y sin acentos/diacríticos.
function deaccent(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Algunos navegadores (Chromium con datos de idioma reducidos) no traen euskera ni
// gallego: entonces se formatea a mano para no mostrar la fecha en español.
const MESES_PROPIOS = {
  'gl-ES': { mes: ['xaneiro','febreiro','marzo','abril','maio','xuño','xullo','agosto','setembro','outubro','novembro','decembro'],
             dia: (d, m, y) => `${d} de ${m} de ${y}`, mesAno: (m, y) => `${m} de ${y}` },
  'eu-ES': { mes: ['urtarrila','otsaila','martxoa','apirila','maiatza','ekaina','uztaila','abuztua','iraila','urria','azaroa','abendua'],
             dia: (d, m, y) => `${y}(e)ko ${m.replace(/a$/, '')}aren ${d}(a)`, mesAno: (m, y) => `${y}(e)ko ${m}` },
};
function fechaPropia(loc, y, mo, d) {
  const t = MESES_PROPIOS[loc];
  if (!t) return null;
  try { if (Intl.DateTimeFormat.supportedLocalesOf([loc]).length) return null; } catch (e) { /* sin Intl */ }
  const m = t.mes[mo];
  return d ? t.dia(d, m, y) : t.mesAno(m, y);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const loc = window.i18n?.locale ? window.i18n.locale() : 'es-ES';
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(String(dateStr));
  if (m) {   // fecha parcial: "YYYY" o "YYYY-MM"
    if (!m[2]) return m[1];
    return fechaPropia(loc, +m[1], +m[2] - 1) || new Date(+m[1], +m[2] - 1, 1).toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  }
  try {
    const dt = new Date(dateStr);
    const propia = isNaN(dt) ? null : fechaPropia(loc, dt.getFullYear(), dt.getMonth(), dt.getDate());
    if (propia) return propia;
    return new Date(dateStr).toLocaleDateString(loc, {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch { return escapeHTML(dateStr); }
}

// ─── Arranque ───
document.addEventListener('DOMContentLoaded', () => app.init());
