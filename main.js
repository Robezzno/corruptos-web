/**
 * Corrupción Policial — main.js
 * Lógica del blog: carga artículos, renderiza lista, hero, artículo individual
 */

const ARTICLES_PER_PAGE = 10;

// Dirección que recibe las denuncias ciudadanas (alias de Namecheap que
// reenvía al Gmail del proyecto). El panel admin lee por IMAP los correos
// cuyo asunto contenga "Corrupción Policial" (ver backend/manual_submit.py).
const CONTACT_EMAIL = 'contacto@corrupcionpolicial.com';

const app = {
  allArticles: [],
  filteredArticles: [],
  currentPage: 1,
  filters: {
    status: 'all',
    month: 'all',
    ccaa: 'all',
    query: ''
  },

  async init() {
    i18n.init();
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
      await this.loadIndex();
    }
  },

  async loadIndex() {
    try {
      const res = await fetch(`articles/index.json?t=${Date.now()}`);
      if (!res.ok) throw new Error('index.json no encontrado');
      this.allArticles = await res.json();
    } catch {
      this.allArticles = [];
    }
    this.renderArchives();
    this.applyFilters();
    this.renderAll();
  },

  handleSearch(e) {
    const q = (e.target.value || '').toLowerCase();
    this.filters.query = q;
    this.currentPage = 1;
    // Mantener sincronizados el buscador principal y el de la barra lateral
    ['main-search-input', 'search-input'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el !== e.target) el.value = e.target.value;
    });
    const clear = document.getElementById('main-search-clear');
    if (clear) clear.style.display = q ? 'block' : 'none';
    this.applyFilters();
    this.renderArticleList();
    this.renderPagination();
  },

  clearSearch() {
    this.filters.query = '';
    this.currentPage = 1;
    ['main-search-input', 'search-input'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const clear = document.getElementById('main-search-clear');
    if (clear) clear.style.display = 'none';
    this.applyFilters();
    this.renderArticleList();
    this.renderPagination();
  },

  setFilter(type, value) {
    this.currentPage = 1;
    this.filters[type] = value;
    this.applyFilters();
    this.renderArticleList();
    this.renderPagination();
    this.updateActiveButtons();
  },

  updateActiveButtons() {
    document.querySelectorAll('.filter-btn:not(.archive-btn)').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`btn-filter-${this.filters.status}`);
    if (btn) btn.classList.add('active');

    document.querySelectorAll('.archive-btn').forEach(b => b.classList.remove('active'));
    const abtn = document.getElementById(`btn-archive-${this.filters.month}`);
    if (abtn) abtn.classList.add('active');
  },

  applyFilters() {
    this.filteredArticles = this.allArticles.filter(a => {
      // Estado legal
      if (this.filters.status !== 'all' && !a.legal_status?.toLowerCase().includes(this.filters.status)) return false;
      
      // Mes (a.date puede faltar → sin la guarda, undefined.startsWith rompe TODO el filtrado)
      if (this.filters.month !== 'all' && !(a.date || '').startsWith(this.filters.month)) return false;

      // Comunidad autónoma (filtro del mapa)
      if (this.filters.ccaa !== 'all' && (a.comunidad_autonoma || 'Estatal') !== this.filters.ccaa) return false;
      
      // Búsqueda de texto (insensible a acentos): título, entradilla, tags,
      // cuerpo policial y comunidad.
      if (this.filters.query) {
        const en = a.i18n?.en || {};
        const text = deaccent(a.title + " " + (a.lead || "") + " " + (a.tags || []).join(" ")
          + " " + (en.title || "") + " " + (en.lead || "")
          + " " + (a.cuerpo_policial || "") + " " + (a.comunidad_autonoma || ""));
        if (!text.includes(deaccent(this.filters.query))) return false;
      }
      
      return true;
    });
  },

  renderAll() {
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
    if (countEl) countEl.textContent = `${this.filteredArticles.length} artículos`;

    // Contadores del banner 3D
    const h3dCasos = document.getElementById('h3d-casos');
    if (h3dCasos) {
      const condenas = this.allArticles.filter(a => a.legal_status === 'condenado').length;
      const investigados = this.allArticles.filter(a => a.legal_status === 'investigado').length;
      h3dCasos.dataset.target = this.allArticles.length;
      const cEl = document.getElementById('h3d-condenas');
      if (cEl) cEl.dataset.target = condenas;
      const iEl = document.getElementById('h3d-investigados');
      if (iEl) iEl.dataset.target = investigados;
    }

    // Widget Dashboard
    const widget = document.getElementById('dashboard-widget');
    if (widget && this.allArticles.length > 0) {
      widget.style.display = 'block';
      const wCasos = document.getElementById('w-total-casos');
      const wCondenas = document.getElementById('w-total-condenas');
      const wInvestigados = document.getElementById('w-total-investigados');
      const wDisciplinario = document.getElementById('w-total-disciplinario');

      const condenas = this.allArticles.filter(a => a.legal_status === 'condenado').length;
      const investigados = this.allArticles.filter(a => a.legal_status === 'investigado').length;
      const disciplinario = this.allArticles.filter(a => a.legal_status === 'disciplinario').length;

      if (wCasos) wCasos.dataset.target = this.allArticles.length;
      if (wCondenas) wCondenas.dataset.target = condenas;
      if (wInvestigados) wInvestigados.dataset.target = investigados;
      if (wDisciplinario) wDisciplinario.dataset.target = disciplinario;

      // Chart
      const cuerpos = {};
      this.allArticles.forEach(a => {
        if (a.cuerpo_policial) {
          cuerpos[a.cuerpo_policial] = (cuerpos[a.cuerpo_policial] || 0) + 1;
        }
      });
      const topCuerpos = Object.entries(cuerpos).sort((a,b) => b[1]-a[1]).slice(0, 5);
      const maxCount = topCuerpos.length ? topCuerpos[0][1] : 1;
      
      const chartContainer = document.getElementById('w-bar-chart');
      if (chartContainer) {
        chartContainer.innerHTML = topCuerpos.map(c => `
          <div style="display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-dim);">
              <span>${escapeHTML(c[0])}</span>
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
      `<a href="article.html?slug=${escapeHTML(hero.slug)}">${escapeHTML(i18n.field(hero, 'title'))}</a>`;
    document.getElementById('hero-lead').textContent = i18n.field(hero, 'lead');
    document.getElementById('hero-meta').innerHTML =
      `<span>${formatDate(hero.date)}</span>
       <span class="sep">·</span>
       <span>${escapeHTML(hero.cuerpo_policial || '')}</span>
       <span class="sep">·</span>
       <span>${escapeHTML(hero.comunidad_autonoma || '')}</span>`;

    // Añadir imagen al hero si existe
    const heroContent = document.getElementById('hero-content-wrapper') || heroSection;
    if (hero.image_url && !document.getElementById('hero-img')) {
      const img = document.createElement('img');
      img.id = 'hero-img';
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
      tagsEl.innerHTML = hero.tags.slice(0, 4).map(t =>
        `<span class="tag">${escapeHTML(t)}</span>`
      ).join('');
      if (hero.legal_status) {
        tagsEl.innerHTML = `<span class="status-badge status-${escapeHTML(hero.legal_status)}">${escapeHTML(i18n.t('status-' + hero.legal_status))}</span>` + tagsEl.innerHTML;
      }
    }

    // Aside: 4 artículos recientes (excluyendo el destacado)
    const asideList = document.getElementById('hero-aside-list');
    if (asideList) {
      asideList.innerHTML = this.allArticles.filter(a => a.slug !== hero.slug).slice(0, 4).map(a => `
        <div style="padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="margin-bottom:6px;">
            <span class="status-badge status-${escapeHTML(a.legal_status)}" style="font-size:0.6rem;">
              ${escapeHTML(i18n.t('status-' + a.legal_status))}
            </span>
          </div>
          <a href="article.html?slug=${escapeHTML(a.slug)}" style="font-size:0.9rem;font-weight:600;color:var(--white);line-height:1.3;display:block;transition:color 200ms;"
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
    const headlines = this.allArticles.slice(0, 3).map(a => `📌 ${i18n.field(a, 'title')}`).join('   ·   ');
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
              const name = date.toLocaleDateString(i18n.currentLang || 'es', { month: 'long' });
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

    if (this.filteredArticles.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <h2 data-i18n="no-articles">${i18n.t('no-articles')}</h2>
          <p data-i18n="no-articles-sub">${i18n.t('no-articles-sub')}</p>
        </div>`;
      return;
    }

    // Separadores de año entre artículos (el índice viene ordenado por fecha desc)
    let lastYear = null;
    container.innerHTML = pageArticles.map(a => {
      const year = (a.date || '').substring(0, 4);
      const divider = (year && year !== lastYear)
        ? `<div class="year-divider"><span>${year}</span></div>`
        : '';
      lastYear = year || lastYear;
      return divider + `
      <article class="article-card">
        ${a.image_url ? `<a href="article.html?slug=${escapeHTML(a.slug)}"><img src="${escapeHTML(a.image_url)}" style="width:100%; height:180px; object-fit:cover; border-radius:var(--radius) var(--radius) 0 0; display:block;"></a>` : ''}
        <div class="article-card-body">
          <div class="article-card-eyebrow">
            <span class="status-badge status-${escapeHTML(a.legal_status)}">${escapeHTML(i18n.t('status-' + a.legal_status))}</span>
            ${a.cuerpo_policial ? `<span class="tag">${escapeHTML(a.cuerpo_policial)}</span>` : ''}
          </div>
          <h2 class="article-card-title">
            <a href="article.html?slug=${escapeHTML(a.slug)}">${escapeHTML(i18n.field(a, 'title'))}</a>
          </h2>
          <p class="article-card-lead">${escapeHTML(i18n.field(a, 'lead'))}</p>
          <div class="article-card-meta">
            <span>${escapeHTML(a.comunidad_autonoma || 'España')}</span>
            ${a.tags?.slice(0, 2).map(t => `<span class="tag">${escapeHTML(t)}</span>`).join('') || ''}
          </div>
        </div>
        <div class="article-card-date">${formatDate(a.date)}</div>
      </article>`;
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
    this.renderArticleList();
    this.renderPagination();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // ─── ARTÍCULO INDIVIDUAL ───
  async loadArticle(slug) {
    try {
      const res = await fetch(`articles/${slug}.json?t=${Date.now()}`);
      if (!res.ok) throw new Error('Artículo no encontrado');
      const article = await res.json();
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
        ${a.comunidad_autonoma ? `<span class="tag">${escapeHTML(a.comunidad_autonoma)}</span>` : ''}
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
        <img src="${escapeHTML(a.image_url)}" style="width:100%; max-height:500px; object-fit:cover; border-radius:var(--radius-lg, 12px); box-shadow: 0 12px 40px rgba(0,0,0,0.5); border: 1px solid var(--border);">
        <figcaption style="font-size:0.7rem; color:var(--text-dim); margin-top:8px; text-align:right;">Imagen generada conceptualmente por IA</figcaption>
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
      tagsEl.innerHTML = a.tags.map(t => `<span class="tag">${escapeHTML(t)}</span>`).join('');
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

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString(
      (window.i18n?.currentLang === 'en') ? 'en-GB' : 'es-ES', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch { return escapeHTML(dateStr); }
}

// ─── Arranque ───
document.addEventListener('DOMContentLoaded', () => app.init());
