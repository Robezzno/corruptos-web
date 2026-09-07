// Fase 1: Setup
// Guardas: si algún CDN (GSAP/ScrollTrigger/Lenis) falla o está bloqueado, NO
// debe abortar todo el fichero (dejaría los contadores del hero/dashboard
// congelados en "0" para el visitante). Todo lo que dependa de estas libs se
// condiciona a que existan; el contenido y los contadores tienen fallback.
const HAS_GSAP = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';

if (HAS_GSAP) {
  gsap.registerPlugin(ScrollTrigger);
  try {
    if (typeof Lenis !== 'undefined') {
      const lenis = new Lenis();
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    }
  } catch (e) { /* scroll suave opcional */ }
}

// Fase 5: Barra de progreso de scroll
window.addEventListener('scroll', () => {
  const pct = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
  const progress = document.getElementById('scroll-progress');
  if (progress) progress.style.width = pct + '%'
})

// Fase 5: Efecto parallax sutil en el hero
setTimeout(() => {
  if (HAS_GSAP && document.querySelector('.hero-main')) {
    gsap.to('.hero-main', {
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
      y: 50
    })
  }
}, 500);

// Partículas para el Dashboard Widget
function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width, height;
  let particles = [];
  
  function resize() {
    width = canvas.offsetWidth;
    height = canvas.offsetHeight;
    canvas.width = width;
    canvas.height = height;
  }
  
  class Particle {
    constructor() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * 0.5;
      this.vy = (Math.random() - 0.5) * 0.5;
      this.size = Math.random() * 2;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < 0) this.x = width;
      if (this.x > width) this.x = 0;
      if (this.y < 0) this.y = height;
      if (this.y > height) this.y = 0;
    }
    draw() {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  function init() {
    resize();
    particles = [];
    for (let i = 0; i < 50; i++) {
      particles.push(new Particle());
    }
    window.addEventListener('resize', resize);
  }
  
  function animate() {
    ctx.clearRect(0, 0, width, height);
    particles.forEach(p => {
      p.update();
      p.draw();
    });
    requestAnimationFrame(animate);
  }
  
  init();
  animate();
}
// Inicializar partículas tras carga
setTimeout(initParticles, 100);

// Función para inicializar animaciones en los elementos inyectados dinámicamente
function initDOMAnimations() {
 // Bloque de animaciones GSAP: se salta entero si el CDN no cargó, para que
 // los CONTADORES (más abajo, con su propio fallback) siempre se pinten.
 if (HAS_GSAP) {
  // Fase 2: Animaciones de entrada (solo las que no tienen ya un ScrollTrigger asociado)
  document.querySelectorAll('.article-card').forEach(card => {
    if (card.dataset.animInit) return;
    card.dataset.animInit = 'true';
    
    gsap.from(card, {
      scrollTrigger: { trigger: card, start: "top 90%" },
      y: 40, opacity: 0, duration: 0.6, ease: "power2.out",
      clearProps: "all" // Para no romper el tilt luego
    });

    // Fase 3: Efecto 3D Tilt
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width - 0.5
      const y = (e.clientY - rect.top) / rect.height - 0.5
      card.style.transform = `perspective(600px) rotateX(${-y * 12}deg) rotateY(${x * 12}deg) scale(1.03)`
    })
    card.addEventListener('mouseleave', () => {
      card.style.transform = ''
      card.style.transition = 'transform 0.3s ease'
    })
    card.addEventListener('mouseenter', () => {
      card.style.transition = 'none'
    })
  });

  const heroTitle = document.querySelector('.hero-title');
  if (heroTitle && !heroTitle.dataset.animInit && heroTitle.textContent.trim().length > 0) {
    heroTitle.dataset.animInit = 'true';
    gsap.from(heroTitle, {
      y: 30, opacity: 0, duration: 0.8, ease: "power3.out", clearProps: "all"
    })
  }

  document.querySelectorAll('.sidebar-stat-value').forEach(el => {
    if (el.dataset.animInit) return;
    el.dataset.animInit = 'true';
    
    gsap.from(el.parentElement, {
      scrollTrigger: { trigger: el.parentElement, start: "top 90%" },
      scale: 0.95, opacity: 0, duration: 0.6, ease: "back.out(1.7)", clearProps: "all"
    });
  });
 }  // fin del bloque GSAP

  // Fase 4: Contadores animados (con fallback si no hay GSAP)
  document.querySelectorAll('.animated-counter').forEach(el => {
    const target = parseInt(el.dataset.target) || 0;
    
    // Si ya inicializamos y el target es el mismo, no hacemos nada
    if (el.dataset.counterInit === String(target)) return;
    
    // Si el target es 0 al inicio (antes de que main.js cargue los datos), esperamos
    if (target === 0 && !el.dataset.counterInit) return;
    
    el.dataset.counterInit = String(target);

    // Sin GSAP/ScrollTrigger (CDN caído): pintar el valor final directamente,
    // que el visitante vea el número real y no un "0" congelado.
    if (!HAS_GSAP) {
      el.textContent = target.toLocaleString('es-ES');
      return;
    }

    el.textContent = "0";
    // Destruir ScrollTrigger anterior si existe (para actualizar el target)
    if (el._st) el._st.kill();

    el._st = ScrollTrigger.create({
      trigger: el,
      start: 'top 95%',
      once: true,
      onEnter: () => {
        let v = 0
        const step = target / 80 || 1
        const iv = setInterval(() => {
          v = Math.min(v + step, target)
          el.textContent = Math.round(v).toLocaleString('es-ES')
          if (v >= target) clearInterval(iv)
        }, 16)
      }
    })
  })
}

// Usar MutationObserver para detectar cuando main.js renderiza contenido nuevo
const observer = new MutationObserver((mutations) => {
  let shouldReinit = false;
  mutations.forEach(m => {
    if (m.addedNodes.length > 0) {
      shouldReinit = true;
    }
  });
  if (shouldReinit) {
    initDOMAnimations();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener('corruptos:rendered', initDOMAnimations);

// Llamada inicial
initDOMAnimations();
