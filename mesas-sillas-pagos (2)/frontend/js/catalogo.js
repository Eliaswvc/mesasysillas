// Catálogo de reserva: productos con imagen + panel "Tu reserva".
// Usa GET /inventario y POST /reservas (sin cambios en el backend).
const IMG = {
  MESA: { base: 'img/mesa', desc: 'Mesa rectangular de madera, ideal para comedor o eventos.' },
  SILLA: { base: 'img/silla', desc: 'Silla apilable con asiento acolchado y respaldo cómodo.' }
};
// Packs rápidos: suman 1 mesa + N sillas a la reserva.
const PACKS = [
  { id: 'p4', nombre: 'Pack Familiar', mesas: 1, sillas: 4, img: 'img/pack-4', desc: 'Para reuniones pequeñas.' },
  { id: 'p6', nombre: 'Pack Evento', mesas: 1, sillas: 6, img: 'img/pack-6', desc: 'El más pedido para fiestas.' },
  { id: 'p8', nombre: 'Pack Banquete', mesas: 1, sillas: 8, img: 'img/pack-8', desc: 'Mesa larga para grupos grandes.' }
];

let inv = {};            // { MESA: {...}, SILLA: {...} }
let usuarios = [];
const cart = { mesas: 0, sillas: 0 };

// Intenta cargar foto real (.jpg) y, si no existe, usa la ilustración (.svg)
const imgTag = (base, alt) => `<img src="${base}.jpg" alt="${esc(alt)}" loading="lazy" onerror="this.onerror=null;this.src='${base}.svg'">`;
const precio = (tipo) => Number(inv[tipo]?.precio_unitario || 0);
const totalCarrito = () => cart.mesas * precio('MESA') + cart.sillas * precio('SILLA');
const disp = (tipo) => (inv[tipo] && inv[tipo].estado === 'DISPONIBLE' ? inv[tipo].cantidad_disponible : 0);
const maxDe = (k) => disp(k === 'mesas' ? 'MESA' : 'SILLA');

function setQty(k, v) {
  v = Math.max(0, Math.min(maxDe(k), Number.isFinite(v) ? Math.floor(v) : 0));
  cart[k] = v;
  pintarCarrito();
}

function stock(tipo) {
  const d = disp(tipo);
  if (!inv[tipo] || inv[tipo].estado !== 'DISPONIBLE') return '<span class="badge AGOTADO">No disponible</span>';
  if (d === 0) return '<span class="badge AGOTADO">Agotado</span>';
  return `<span class="badge ${d <= 10 ? 'PENDIENTE' : 'DISPONIBLE'}">${d} disponibles</span>`;
}

function cardProducto(tipo, key) {
  const i = inv[tipo]; if (!i) return '';
  const off = disp(tipo) === 0;
  return `<article class="prod ${off ? 'off' : ''}">
    <div class="prod-img">${imgTag(IMG[tipo].base, i.nombre)}<span class="prod-tag">${stock(tipo)}</span></div>
    <div class="prod-body"><h3>${esc(tipo === 'MESA' ? 'Mesa' : 'Silla')}</h3><p>${esc(IMG[tipo].desc)}</p>
      <div class="prod-foot"><div class="prod-price">${usd(precio(tipo))}<small> / unidad</small></div><div class="stepper" data-k="${key}">
        <button type="button" class="icon-btn" data-d="-1" aria-label="Quitar" ${off ? 'disabled' : ''}>−</button>
        <input type="number" min="0" max="${disp(tipo)}" value="${cart[key]}" aria-label="Cantidad de ${key}" ${off ? 'disabled' : ''}>
        <button type="button" class="icon-btn" data-d="1" aria-label="Agregar" ${off ? 'disabled' : ''}>+</button></div></div></div></article>`;
}

function cardPack(p) {
  const ok = disp('MESA') >= p.mesas && disp('SILLA') >= p.sillas;
  return `<article class="prod ${ok ? '' : 'off'}">
    <div class="prod-img">${imgTag(p.img, p.nombre)}<span class="prod-tag"><span class="badge FINALIZADA">${p.mesas} mesa + ${p.sillas} sillas</span></span></div>
    <div class="prod-body"><h3>${esc(p.nombre)}</h3><p>${esc(p.desc)}</p>
      <div class="prod-foot"><div class="prod-price">${usd(p.mesas * precio('MESA') + p.sillas * precio('SILLA'))}</div><button type="button" class="btn btn-sm" data-pack="${p.id}" ${ok ? '' : 'disabled'}>${ok ? '+ Agregar pack' : 'Sin stock'}</button></div></div></article>`;
}

function pintarCarrito() {
  // Sincroniza los steppers del catálogo y el panel lateral sin volver a pintar todo
  document.querySelectorAll('.stepper').forEach((s) => { s.querySelector('input').value = cart[s.dataset.k]; });
  const lineas = [['mesas', 'Mesas', 'MESA'], ['sillas', 'Sillas', 'SILLA']].filter(([k]) => cart[k] > 0);
  document.getElementById('lineas').innerHTML = lineas.length
    ? lineas.map(([k, n, t]) => `<li><span class="thumb">${imgTag(IMG[t].base, n)}</span><span class="nm">${n}<small>${usd(precio(t))} c/u</small></span><span style="color:var(--muted)">× ${cart[k]}</span><b>${usd(cart[k] * precio(t))}</b>
        <button type="button" class="icon-btn" data-quitar="${k}" aria-label="Quitar ${n}">&times;</button></li>`).join('')
    : '<li class="vacio">Aún no has agregado nada.</li>';
  const total = cart.mesas + cart.sillas;
  document.getElementById('total').textContent = usd(totalCarrito());
  document.getElementById('enviar').disabled = total === 0;
  document.getElementById('enviar').textContent = total ? 'Reservar · ' + usd(totalCarrito()) : 'Enviar reserva';
  document.getElementById('fabCount').textContent = usd(totalCarrito());
  document.getElementById('fab').classList.toggle('show', total > 0);
}

function pintar() {
  const admin = isAdmin();
  const hoy = new Date().toISOString().slice(0, 10);
  document.getElementById('view').innerHTML = `<div class="cat-layout">
    <section>
      <div class="section-title" style="margin-top:0">Productos</div>
      <div class="prod-grid" id="productos">${cardProducto('MESA', 'mesas')}${cardProducto('SILLA', 'sillas')}</div>
      <div class="section-title">Packs rápidos</div>
      <div class="prod-grid">${PACKS.map(cardPack).join('')}</div>
    </section>
    <aside class="card cart" id="carrito"><h3>Tu reserva</h3>
      <ul class="lineas" id="lineas"></ul>
      <div class="cart-total"><span>Total</span><b id="total">$0.00</b></div><div class="cart-note">USD · precio por unidad y por reserva</div>
      <form id="form">
        ${admin ? `<label>Usuario</label><select name="usuario_id">${usuarios.map((u) => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select>` : ''}
        <label>Fecha</label><input type="date" name="fecha" min="${hoy}" required>
        <div class="row2"><div><label>Inicio</label><input type="time" name="hora_inicio" required></div><div><label>Fin</label><input type="time" name="hora_fin" required></div></div>
        <label>Observaciones</label><textarea name="observaciones" rows="2" placeholder="Opcional: lugar, tipo de evento…"></textarea>
        ${admin ? '<label><input type="checkbox" name="confirmar" style="width:auto"> Confirmar de inmediato (descuenta inventario)</label>' : '<p class="hint">Tu solicitud quedará <b>PENDIENTE</b> hasta que un administrador la confirme.</p>'}
        <button class="btn" id="enviar" style="width:100%;justify-content:center;margin-top:14px" disabled>Enviar reserva</button>
        <button type="button" class="btn btn-ghost btn-sm" id="vaciar" style="width:100%;justify-content:center;margin-top:8px">Vaciar</button>
      </form></aside></div>
    <button type="button" class="fab" id="fab">Ver reserva · <b id="fabCount">$0.00</b></button>`;

  document.querySelectorAll('.stepper').forEach((s) => {
    const k = s.dataset.k, inp = s.querySelector('input');
    s.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => setQty(k, cart[k] + Number(b.dataset.d))));
    inp.addEventListener('change', () => setQty(k, Number(inp.value)));
  });
  document.querySelectorAll('[data-pack]').forEach((b) => b.addEventListener('click', () => {
    const p = PACKS.find((x) => x.id === b.dataset.pack);
    if (cart.mesas + p.mesas > maxDe('mesas') || cart.sillas + p.sillas > maxDe('sillas')) return toast('No hay suficiente stock para agregar este pack', 'error');
    cart.mesas += p.mesas; cart.sillas += p.sillas; pintarCarrito(); toast(p.nombre + ' agregado');
  }));
  document.getElementById('lineas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-quitar]'); if (b) setQty(b.dataset.quitar, 0);
  });
  document.getElementById('vaciar').onclick = () => { cart.mesas = 0; cart.sillas = 0; pintarCarrito(); };
  document.getElementById('fab').onclick = () => document.getElementById('carrito').scrollIntoView({ behavior: 'smooth' });
  document.getElementById('form').addEventListener('submit', enviar);
  pintarCarrito();
}

async function enviar(e) {
  e.preventDefault();
  const btn = document.getElementById('enviar');
  const d = Object.fromEntries(new FormData(e.target).entries());
  try {
    if (!d.fecha || !d.hora_inicio || !d.hora_fin) throw new Error('Completa fecha y horario');
    if (d.hora_fin <= d.hora_inicio) throw new Error('La hora de fin debe ser posterior al inicio');
    if (cart.mesas + cart.sillas === 0) throw new Error('Agrega al menos una mesa o silla');
    btn.disabled = true;
    const rv = await api('/reservas', { method: 'POST', body: { ...d, mesas: cart.mesas, sillas: cart.sillas, confirmar: !!d.confirmar, usuario_id: d.usuario_id ? Number(d.usuario_id) : undefined } });
    cart.mesas = 0; cart.sillas = 0;
    exito(rv, !!d.confirmar, false);
  } catch (err) { toast(err.message, 'error'); btn.disabled = cart.mesas + cart.sillas === 0; }
}

function exito(rv, confirmada, pagada) {
  const hayMonto = Number(rv.total) > 0;
  document.getElementById('view').innerHTML = `<div class="card ok-box"><div class="ok-ico">✓</div><h3>¡Reserva #${rv.id} enviada!</h3>
    <p class="sub" style="margin-bottom:6px">${confirmada ? 'La reserva quedó confirmada.' : 'Tu solicitud está pendiente de confirmación por un administrador.'}</p>
    <div class="pay-summary" style="margin:14px 0"><span>${pagada ? 'Pagado' : 'Total a pagar'}</span><b>${usd(rv.total)}</b></div>
    <div class="modal-actions" style="justify-content:center;flex-wrap:wrap"><a class="btn btn-ghost" href="catalogo.html">Hacer otra reserva</a>
    ${hayMonto && !pagada ? '<button class="btn btn-ok" id="pagar">Pagar ahora</button>' : ''}<a class="btn ${hayMonto && !pagada ? 'btn-ghost' : ''}" href="reservas.html">Ver mis reservas</a></div>
    ${hayMonto && !pagada ? '<p class="hint">También puedes pagar más tarde desde <b>Reservas</b>.</p>' : ''}</div>`;
  const b = document.getElementById('pagar');
  if (b) b.onclick = () => abrirPago(rv, () => exito(rv, confirmada, true));
}

async function init() {
  const lista = await api('/inventario');
  inv = Object.fromEntries(lista.map((i) => [i.tipo, i]));
  if (isAdmin()) usuarios = (await api('/usuarios')).filter((u) => u.activo);
  pintar();
}
init().catch((e) => { toast(e.message, 'error'); document.getElementById('view').innerHTML = '<div class="empty">No se pudo cargar el catálogo</div>'; });
