/**
 * CorruptOS — map.js
 * Mapa coroplético interactivo de España por comunidades autónomas.
 * - Inyecta blog/map-es.svg y colorea cada CCAA según su nº de casos.
 * - Hover: tooltip con nombre y recuento.
 * - Clic: filtra el listado de artículos por esa comunidad (toggle).
 * - Ranking lateral con las comunidades ordenadas por casos.
 * Los artículos con ámbito "Estatal" no tienen geografía: botón aparte.
 */

const ccaaMap = {
  svgLoaded: false,
  selected: 'all',
  counts: {},

  async init() {
    const canvas = document.getElementById('map-canvas');
    if (!canvas) return;

    try {
      const res = await fetch('map-es.svg');
      if (!res.ok) throw new Error('map-es.svg no encontrado');
      const svgText = await res.text();
      canvas.insertAdjacentHTML('afterbegin', svgText);
      this.svgLoaded = true;
    } catch (e) {
      console.error('Mapa no disponible:', e);
      return;
    }

    // Interacción por delegación
    const svg = canvas.querySelector('svg');
    svg.addEventListener('click', (e) => {
      const el = e.target.closest('.ccaa');
      if (el) this.select(el.dataset.ccaa);
    });
    svg.addEventListener('mousemove', (e) => {
      const el = e.target.closest('.ccaa');
      this.tooltip(el, e);
    });
    svg.addEventListener('mouseleave', () => this.tooltip(null));

    // Pintar cuando main.js tenga los datos (y en cada re-render/cambio idioma)
    window.addEventListener('corruptos:rendered', () => this.refresh());
    this.refresh();
  },

  refresh() {
    if (!this.svgLoaded || typeof app === 'undefined') return;
    const articles = app.allArticles || [];
    const widget = document.getElementById('map-widget');
    if (!widget) return;
    widget.style.display = articles.length > 0 ? '' : 'none';
    if (articles.length === 0) return;

    // Recuento por CCAA
    this.counts = {};
    articles.forEach(a => {
      const c = a.comunidad_autonoma || 'Estatal';
      this.counts[c] = (this.counts[c] || 0) + 1;
    });

    const geoCounts = Object.entries(this.counts).filter(([k]) => k !== 'Estatal');
    const max = Math.max(1, ...geoCounts.map(([, n]) => n));

    // Colorear el mapa
    document.querySelectorAll('#map-canvas .ccaa').forEach(el => {
      const name = el.dataset.ccaa;
      const n = this.counts[name] || 0;
      // Intensidad 0 → gris oscuro; max → acento pleno
      const t = n === 0 ? 0 : 0.25 + 0.75 * (n / max);
      el.style.fill = n === 0
        ? 'rgba(255,255,255,0.05)'
        : `rgba(196, 30, 58, ${t.toFixed(2)})`;
      el.classList.toggle('has-cases', n > 0);
      el.classList.toggle('selected', this.selected === name);
    });

    // Ranking lateral
    const ranking = document.getElementById('map-ranking');
    if (ranking) {
      const sorted = geoCounts.sort((a, b) => b[1] - a[1]);
      ranking.innerHTML = `
        <div class="map-ranking-title">${i18n.t('map-ranking-title')}</div>
        ${sorted.length === 0 ? `<p style="font-size:0.8rem;color:var(--text-dim);">${i18n.t('map-empty')}</p>` : ''}
        ${sorted.map(([name, n]) => `
          <button class="map-rank-row ${this.selected === name ? 'active' : ''}" onclick="ccaaMap.select('${name.replace(/'/g, "\\'")}')">
            <span class="map-rank-name">${escapeHTML(name)}</span>
            <span class="map-rank-bar"><span style="width:${(n / max) * 100}%"></span></span>
            <span class="map-rank-num">${n}</span>
          </button>
        `).join('')}
      `;
    }

    // Botón estatal
    const estatalCount = document.getElementById('map-estatal-count');
    if (estatalCount) estatalCount.textContent = `(${this.counts['Estatal'] || 0})`;
    const estatalBtn = document.getElementById('map-estatal-btn');
    if (estatalBtn) estatalBtn.classList.toggle('active-filter', this.selected === 'Estatal');
    const resetBtn = document.getElementById('map-reset-btn');
    if (resetBtn) resetBtn.style.display = this.selected === 'all' ? 'none' : '';
  },

  select(name) {
    // Toggle: volver a hacer clic en la misma CCAA quita el filtro
    this.selected = (this.selected === name || name === 'all') ? 'all' : name;
    if (typeof app !== 'undefined') {
      app.setFilter('ccaa', this.selected);
      // Llevar al usuario al listado filtrado
      if (this.selected !== 'all') {
        document.getElementById('articles-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    this.refresh();
  },

  tooltip(el, ev) {
    const tip = document.getElementById('map-tooltip');
    if (!tip) return;
    if (!el) { tip.style.display = 'none'; return; }
    const name = el.dataset.ccaa;
    const n = this.counts[name] || 0;
    tip.innerHTML = `<strong>${escapeHTML(name)}</strong><br>${n} ${i18n.t(n === 1 ? 'map-case' : 'map-cases')}`;
    tip.style.display = 'block';
    const rect = document.getElementById('map-canvas').getBoundingClientRect();
    tip.style.left = (ev.clientX - rect.left + 14) + 'px';
    tip.style.top = (ev.clientY - rect.top - 10) + 'px';
  }
};

document.addEventListener('DOMContentLoaded', () => ccaaMap.init());
