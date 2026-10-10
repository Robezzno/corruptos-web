/**
 * CorruptOS — hero3d.js
 * Fondo 3D de la portada: una red de nodos que evoca "atar cabos" de la
 * corrupción policial. Cada nodo es un caso; las líneas, conexiones/patrones.
 * Rojo carmesí sobre negro, rotación lenta y parallax con el ratón.
 * Degrada con elegancia: si Three.js no carga o no hay canvas, no hace nada.
 */
(function () {
  const canvas = document.getElementById('hero3d-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const ACCENT = 0xc41e3a;
  const BG = 0x0d0d0d;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Escena, cámara, render ──
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BG, 0.0125);

  const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 1, 400);
  camera.position.set(0, 0, 68);

  // Crear el contexto WebGL puede lanzar (GPU bloqueada, WebGL deshabilitado,
  // VMs sin aceleración). Degradar sin ruido en vez de dejar error en consola.
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (e) {
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  // ── Textura de punto suave (gradiente radial) ──
  function makeDotTexture() {
    const s = 64;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.85)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(c);
  }
  const dotTex = makeDotTexture();

  // ── Nodos ──
  const NODE_COUNT = window.innerWidth < 640 ? 90 : 150;
  const SPREAD = { x: 46, y: 27, z: 30 };
  const LINK_DIST = 12.5;
  const MAX_LINKS = 520;

  const group = new THREE.Group();
  scene.add(group);

  const nodes = [];
  const positions = new Float32Array(NODE_COUNT * 3);
  const colors = new Float32Array(NODE_COUNT * 3);
  const cAccent = new THREE.Color(ACCENT);
  const cHot = new THREE.Color(0xff4d64);
  const cWhite = new THREE.Color(0xf5f5f5);

  for (let i = 0; i < NODE_COUNT; i++) {
    const v = new THREE.Vector3(
      (Math.random() * 2 - 1) * SPREAD.x,
      (Math.random() * 2 - 1) * SPREAD.y,
      (Math.random() * 2 - 1) * SPREAD.z
    );
    nodes.push(v);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;

    // 10% blancos "calientes", 15% rojo brillante, resto acento
    const r = Math.random();
    const col = r < 0.1 ? cWhite : r < 0.25 ? cHot : cAccent;
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const pMat = new THREE.PointsMaterial({
    size: 1.9,
    map: dotTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  group.add(new THREE.Points(pGeo, pMat));

  // ── Líneas entre nodos cercanos ──
  const linePos = [];
  outer:
  for (let i = 0; i < NODE_COUNT; i++) {
    for (let j = i + 1; j < NODE_COUNT; j++) {
      if (nodes[i].distanceTo(nodes[j]) < LINK_DIST) {
        linePos.push(nodes[i].x, nodes[i].y, nodes[i].z, nodes[j].x, nodes[j].y, nodes[j].z);
        if (linePos.length / 6 >= MAX_LINKS) break outer;
      }
    }
  }
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
  const lMat = new THREE.LineBasicMaterial({
    color: ACCENT,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  group.add(new THREE.LineSegments(lGeo, lMat));

  // ── Parallax de ratón ──
  const mouse = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    target.x = (e.clientX / window.innerWidth) * 2 - 1;
    target.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  // ── Resize ──
  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', resize);
  resize();

  // ── Bucle ──
  let running = true;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running && !reduceMotion) requestAnimationFrame(loop);
  });

  function loop() {
    if (!running) return;
    mouse.x += (target.x - mouse.x) * 0.04;
    mouse.y += (target.y - mouse.y) * 0.04;

    group.rotation.y += 0.0006;
    group.rotation.x = mouse.y * 0.18;
    group.rotation.z = mouse.x * 0.05;

    camera.position.x += (mouse.x * 10 - camera.position.x) * 0.05;
    camera.position.y += (-mouse.y * 6 - camera.position.y) * 0.05;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
    if (!reduceMotion) requestAnimationFrame(loop);
  }

  if (reduceMotion) {
    resize();
    renderer.render(scene, camera); // fotograma estático
  } else {
    requestAnimationFrame(loop);
  }
})();
