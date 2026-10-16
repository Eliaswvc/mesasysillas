// Visor 3D del catálogo: un solo canvas WebGL compartido que se mueve a la tarjeta bajo el cursor
// y muestra el modelo girando. Tarjetas: <div class="prod-img" data-model="mesa|silla|pack:N">.
let THREE = null, models = null, loading = null;
let R, scene, camera, cache = {}, cur = null, raf = 0, last = 0, angle = .7, speed = 0, targetSpeed = 0, stopT = 0;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touchOnly = matchMedia('(hover: none)').matches;

function cargar() {
  if (!loading) loading = Promise.all([import('./vendor/three.module.min.js'), import('./models3d.js?v=6')])
    .then(([t, m]) => { THREE = t; models = m.makeModels(t); init(); })
    .catch((err) => { console.error('[visor 3D] no se pudo iniciar:', err); loading = null; throw err; });
  return loading;
}
function init() {
  R = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  R.setClearColor(0x000000, 0); R.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  R.domElement.className = 'prod-3d'; R.domElement.setAttribute('aria-hidden', 'true');
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 4 / 3, .05, 50);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc7c9e6, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(2.5, 4, 3); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe3ff, .7); fill.position.set(-3, 2, -2.5); scene.add(fill);
}
function sombra(w, d) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(70,70,120,.34)'); gr.addColorStop(1, 'rgba(70,70,120,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = .002; return m;
}
function modelo(kind) {
  if (cache[kind]) return cache[kind];
  const raw = kind === 'mesa' ? models.buildTable() : kind === 'silla' ? models.buildChair() : (kind === 'pack:4' ? models.buildPackFamiliar() : kind === 'pack:6' ? models.buildPackEvento() : kind === 'pack:8' ? models.buildPackBanquete() : models.buildPack(Number(kind.split(':')[1]) || 4));
  const box = new THREE.Box3().setFromObject(raw), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  raw.position.set(-ctr.x, 0, -ctr.z);
  const pivot = new THREE.Group(); pivot.add(raw);
  pivot.add(sombra(Math.max(size.x, size.z) * 1.5, Math.max(size.x, size.z) * 1.5));
  const r = size.length() / 2;
  return (cache[kind] = { pivot, ty: size.y * .46, dist: (r / Math.sin(THREE.MathUtils.degToRad(15))) * .86 });
}
function ajustar(m, el) {
  const w = el.clientWidth || 300, h = el.clientHeight || 225;
  R.setSize(w, h, false); camera.aspect = w / h;
  const el0 = THREE.MathUtils.degToRad(22);
  camera.position.set(0, m.ty + Math.sin(el0) * m.dist, Math.cos(el0) * m.dist);
  camera.lookAt(0, m.ty, 0); camera.updateProjectionMatrix();
}
function frame(t) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min((t - last) / 1000, .05); last = t;
  if (cur && !cur.el.isConnected) return ocultar();
  speed += (targetSpeed - speed) * Math.min(1, dt * 3.5);
  angle += speed * dt;
  if (cur) { cur.m.pivot.rotation.y = angle; try { R.render(scene, camera); } catch (e) { console.error('[visor 3D] render:', e); ocultar(); } }
}
async function mostrar(el) {
  try { await cargar(); } catch (e) { return; }
  if (cur && cur.el === el) return;
  if (cur) quitar();
  const kind = el.dataset.model, m = modelo(kind);
  scene.add(m.pivot); cur = { el, m };
  el.appendChild(R.domElement); ajustar(m, el);
  void R.domElement.offsetWidth; el.classList.add('is-3d');
  clearTimeout(stopT); targetSpeed = reduce ? .45 : .9; last = performance.now();
  if (!raf) raf = requestAnimationFrame(frame);
}
function quitar() { if (!cur) return; scene.remove(cur.m.pivot); cur.el.classList.remove('is-3d'); const cv = R.domElement, el = cur.el; setTimeout(() => { if (!el.classList.contains('is-3d') && cv.parentNode === el) el.removeChild(cv); }, 500); cur = null; }
function ocultar() {
  if (!cur) return;
  const el = cur.el; el.classList.remove('is-3d'); targetSpeed = 0;
  stopT = setTimeout(() => { if (!cur || cur.el === el) { cancelAnimationFrame(raf); raf = 0; if (cur) { scene.remove(cur.m.pivot); cur = null; } if (R.domElement.parentNode === el) el.removeChild(R.domElement); } }, 520);
}

document.addEventListener('pointerover', (e) => {
  if (e.pointerType === 'touch') return;
  const el = e.target.closest && e.target.closest('.prod-img[data-model]');
  if (el && !(cur && cur.el === el)) mostrar(el);
});
document.addEventListener('pointerout', (e) => {
  if (e.pointerType === 'touch' || !cur) return;
  if (!cur.el.contains(e.relatedTarget)) ocultar();
});
document.addEventListener('click', (e) => {
  if (!touchOnly) return;
  const el = e.target.closest && e.target.closest('.prod-img[data-model]');
  if (!el) return ocultar();
  if (cur && cur.el === el) ocultar(); else mostrar(el);
});
// precarga ligera cuando el navegador está libre
setTimeout(() => { cargar().catch(() => {}); }, 1500);

// arrastrar para girar a mano (mouse o dedo)
let drag = null;
const velAuto = () => (reduce ? .45 : .9);
document.addEventListener('pointerdown', (e) => {
  if (!cur || (e.pointerType === 'mouse' && e.button !== 0) || !cur.el.contains(e.target)) return;
  drag = { x: e.clientX }; targetSpeed = 0; speed = 0;
});
document.addEventListener('pointermove', (e) => { if (!drag) return; angle += (e.clientX - drag.x) * .012; drag.x = e.clientX; });
const soltar = () => { if (!drag) return; drag = null; if (cur) targetSpeed = velAuto(); };
document.addEventListener('pointerup', soltar);
document.addEventListener('pointercancel', soltar);
document.addEventListener('dragstart', (e) => { if (e.target.closest && e.target.closest('.prod-img[data-model]')) e.preventDefault(); });
