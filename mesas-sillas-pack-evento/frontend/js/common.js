const API = '/api';
const getToken = () => localStorage.getItem('token');
const getUser = () => JSON.parse(localStorage.getItem('user') || 'null');
const isAdmin = () => getUser()?.rol === 'ADMIN';

function logout() { localStorage.clear(); location.href = 'login.html'; }

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401 && !path.startsWith('/auth')) { logout(); throw new Error('Sesión expirada'); }
  if (!res.ok) throw new Error(data.error || 'Error de servidor');
  if (data.factura && data.data && typeof data.data === 'object') data.data.factura = data.factura;   // estado del envío de la factura (POST /pagos)
  return data.data !== undefined ? data.data : data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('es-SV') : '-');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('es-SV') : '-');
const fmtDay = (d) => (d ? String(d).slice(0, 10) : '-');
const usd = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
const badge = (e) => `<span class="badge ${esc(e)}">${esc(String(e).replace('_', ' '))}</span>`;

function toast(msg, type = 'success') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'error' ? 'error' : type === 'warn' ? 'warn' : '');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function openModal(title, bodyHTML, { onSubmit, submitText = 'Guardar', cancelText = 'Cancelar' } = {}) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal"><div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-close>&times;</button></div>
    <form class="modal-body">${bodyHTML}<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>${esc(cancelText)}</button>
    ${onSubmit ? `<button class="btn">${esc(submitText)}</button>` : ''}</div></form></div>`;
  const close = () => ov.remove();
  ov.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  const form = ov.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return close();
    const btn = form.querySelector('.btn:not(.btn-ghost)');
    btn.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      await onSubmit(data, close);
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  });
  document.body.appendChild(ov);
  return { close, el: ov };
}

function confirmModal(message, { danger = false, okText = 'Confirmar' } = {}) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal"><div class="modal-head"><h3>Confirmar</h3></div><div class="modal-body"><p>${esc(message)}</p>
      <div class="modal-actions"><button class="btn btn-ghost" data-v="0">Cancelar</button><button class="btn ${danger ? 'btn-danger' : ''}" data-v="1">${esc(okText)}</button></div></div></div>`;
    ov.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { ov.remove(); resolve(b.dataset.v === '1'); }));
    document.body.appendChild(ov);
  });
}

const IC = {
  dashboard: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  out: '<path d="M7 17L17 7M8 7h9v9"/>',
  back: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  store: '<path d="M3 9l2-5h14l2 5M4 9v11h16V9M3 9h18M9 20v-6h6v6"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M17 4a4 4 0 0 1 0 8M22 21c0-3-2-5.5-5-6.5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'
};
const icon = (n, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${IC[n]}</svg>`;

// Avisos de inventario agotado / bajo (dashboard y catálogo). `inv` = lista de GET /inventario.
function alertasStock(inv) {
  const admin = isAdmin();
  return inv.filter((i) => i.estado !== 'INACTIVO').map((i) => {
    const n = String(i.nombre).toLowerCase(), d = Number(i.cantidad_disponible), min = Number(i.stock_minimo ?? 0);
    if (d === 0) return ['error', admin ? `Sin inventario de ${n}. Repón stock o espera devoluciones.` : `Sin inventario de ${n} por ahora: no se pueden reservar hasta que haya disponibilidad.`];
    if (d <= min) return ['warn', admin ? `Stock bajo de ${n}: quedan ${d} (mínimo ${min}).` : `Quedan pocas ${n}: ${d} disponibles.`];
    return null;
  }).filter(Boolean)
    .map(([nivel, msg]) => `<div class="alert-box ${nivel}" role="alert">${icon('alert')}<span>${esc(msg)}${admin ? ' <a href="inventario.html">Ir al inventario</a>' : ''}</span></div>`).join('');
}

// Mensaje de advertencia si se pide más de lo que hay en inventario ('' si la cantidad es válida).
// nombre en singular: 'mesa' | 'silla'
function msgStock(nombre, pedido, disponible) {
  if (pedido <= disponible) return '';
  const pl = (n) => (n === 1 ? nombre : nombre + 's');
  if (disponible <= 0) return `No hay ${nombre}s disponibles por ahora.`;
  return `Solo ${disponible === 1 ? 'queda' : 'quedan'} ${disponible} ${pl(disponible)} disponible${disponible === 1 ? '' : 's'} (pediste ${pedido}).`;
}
const avisoStockHTML = (msg) => `${icon('alert')}<span>${esc(msg)}</span>`;

const MENU = [
  ['dashboard.html', 'Dashboard', 'dashboard', false, 'General'], ['inventario.html', 'Inventario', 'box', false, 'Operación'],
  ['catalogo.html', 'Catálogo', 'store', false], ['reservas.html', 'Reservas', 'calendar', false], ['pagos.html', 'Pagos', 'card', false], ['prestamos.html', 'Préstamos', 'out', false], ['devoluciones.html', 'Devoluciones', 'back', false],
  ['historial.html', 'Historial', 'clock', true, 'Administración'], ['usuarios.html', 'Usuarios', 'users', true], ['correo.html', 'Correo', 'mail', true]
];

// Pestañas de la barra inferior en móvil (el resto del menú queda en "Más")
const NAV_MOVIL = (admin) => (admin
  ? [['dashboard.html', 'Inicio', 'dashboard'], ['inventario.html', 'Inventario', 'box'], ['reservas.html', 'Reservas', 'calendar'], ['prestamos.html', 'Préstamos', 'out']]
  : [['dashboard.html', 'Inicio', 'dashboard'], ['catalogo.html', 'Catálogo', 'store'], ['reservas.html', 'Reservas', 'calendar'], ['pagos.html', 'Pagos', 'card']]);

function initShell() {
  if (!getToken()) return (location.href = 'login.html');
  const u = getUser();
  if (!u) return logout();
  const admin = u.rol === 'ADMIN';
  const page = location.pathname.split('/').pop() || 'index.html';
  const content = document.getElementById('content');
  const links = MENU.filter(([, , , adm]) => !adm || admin)
    .map(([href, label, ic, , group]) => `${group ? `<div class="nav-label">${group}</div>` : ''}<a href="${href}" class="${href === page ? 'active' : ''}">${icon(ic)}${label}</a>`).join('');
  const ini = u.nombre.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  const prim = NAV_MOVIL(admin);
  const tabs = prim.map(([href, label, ic]) => `<a href="${href}" class="${href === page ? 'active' : ''}">${icon(ic)}<span>${label}</span></a>`).join('')
    + `<button type="button" id="moreBtn" class="${prim.some(([h]) => h === page) ? '' : 'active'}" aria-label="Más opciones">${icon('more')}<span>Más</span></button>`;
  const shell = document.createElement('div');
  shell.className = 'shell';
  shell.innerHTML = `<aside class="sidebar" id="sidebar"><div class="brand"><span class="logo">${icon('box', 'width="18" height="18" style="color:#fff"')}</span>Mesas &amp; Sillas</div>${links}
    <button type="button" class="side-logout" id="sideLogout">${icon('logout')}Cerrar sesión</button>
    <div class="side-foot">Sistema de inventario v1.1</div></aside>
    <div class="backdrop" id="backdrop"></div>
    <div class="main"><header class="navbar"><a class="nav-brand" href="dashboard.html"><span class="logo">${icon('box', 'width="16" height="16" style="color:#fff"')}</span>Mesas &amp; Sillas</a><span class="sp"></span>
    <div class="notif"><button type="button" class="bell" id="bellBtn" aria-label="Notificaciones" aria-expanded="false" aria-controls="notifPanel">${icon('bell')}<span class="bell-badge" id="bellBadge" hidden>0</span></button>
      <div class="notif-panel" id="notifPanel" hidden><div class="notif-head"><b>Notificaciones</b><button type="button" class="btn btn-ghost btn-sm" id="notifTodas">Marcar todo leído</button></div>
        <div class="notif-list" id="notifList"><div class="empty">Cargando…</div></div></div></div>
    <div class="user-chip"><div class="avatar">${esc(ini)}</div><div class="t"><div class="n">${esc(u.nombre)}</div><div class="r">${admin ? 'Administrador' : 'Usuario'}</div></div></div>
    <button class="btn btn-ghost btn-sm" id="logoutBtn">Salir</button></header></div>
    <nav class="bottom-nav" aria-label="Navegación principal">${tabs}</nav>`;
  document.body.prepend(shell);
  shell.querySelector('.main').appendChild(content);
  document.getElementById('logoutBtn').onclick = logout;
  document.getElementById('sideLogout').onclick = logout;

  // menú lateral como cajón en móvil
  const sb = document.getElementById('sidebar'), bd = document.getElementById('backdrop');
  const cajon = (abrir) => { sb.classList.toggle('open', abrir); bd.classList.toggle('show', abrir); document.body.classList.toggle('no-scroll', abrir); };
  document.getElementById('moreBtn').onclick = () => cajon(!sb.classList.contains('open'));
  bd.onclick = () => cajon(false);
  sb.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => cajon(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cajon(false); });

  initNotificaciones(u);
}

// ---------- notificaciones (campana) ----------
function tiempoRel(d) {
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return fmtDate(d);
}

function initNotificaciones(u) {
  const btn = document.getElementById('bellBtn'), badgeEl = document.getElementById('bellBadge');
  const panel = document.getElementById('notifPanel'), list = document.getElementById('notifList');
  const kLast = 'notif_last_' + u.id, tituloBase = document.title;
  let items = [];

  const cerrar = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  const pintar = (noLeidas) => {
    badgeEl.hidden = !noLeidas;
    badgeEl.textContent = noLeidas > 99 ? '99+' : noLeidas;
    document.title = noLeidas ? `(${noLeidas}) ${tituloBase}` : tituloBase;
    list.innerHTML = items.length ? items.map((n) => `<button type="button" class="notif-item ${n.leida ? '' : 'unread'} ${esc(n.nivel)}" data-id="${n.id}" data-enlace="${esc(n.enlace || '')}">
      <span class="notif-dot"></span><span class="notif-body"><b>${esc(n.titulo)}</b><span>${esc(n.mensaje)}</span>
      <small>${esc(tiempoRel(n.created_at))}${n.resuelta ? ' · ✓ Resuelta' : ''}</small></span></button>`).join('')
      : '<div class="empty">Sin notificaciones por ahora</div>';
  };

  async function cargar() {
    try {
      const d = await api('/notificaciones');
      items = d.items;
      pintar(d.no_leidas);
      // aviso emergente solo para lo que llegó mientras la sesión estaba abierta (la primera vez solo fija el punto de partida)
      const max = items.reduce((m, x) => Math.max(m, x.id), 0), guardado = localStorage.getItem(kLast);
      if (guardado === null) localStorage.setItem(kLast, String(max));
      else {
        const nuevas = items.filter((x) => x.id > Number(guardado) && !x.leida).sort((a, b) => a.id - b.id);
        nuevas.slice(-3).forEach((x) => toast(`${x.titulo}: ${x.mensaje}`, x.nivel === 'error' ? 'error' : x.nivel === 'warn' ? 'warn' : 'success'));
        if (nuevas.length) { btn.classList.remove('ring'); void btn.offsetWidth; btn.classList.add('ring'); }
        if (max > Number(guardado)) localStorage.setItem(kLast, String(max));
      }
    } catch { /* la campana nunca debe molestar con errores */ }
  }

  btn.onclick = (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) cargar();
  };
  document.addEventListener('click', (e) => { if (!panel.hidden && !e.target.closest('.notif')) cerrar(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
  document.getElementById('notifTodas').onclick = async () => {
    try { await api('/notificaciones/leer-todas', { method: 'POST' }); items.forEach((n) => { n.leida = true; }); pintar(0); } catch (err) { toast(err.message, 'error'); }
  };
  list.addEventListener('click', async (e) => {
    const it = e.target.closest('.notif-item'); if (!it) return;
    const n = items.find((x) => x.id === Number(it.dataset.id));
    if (n && !n.leida) { n.leida = true; pintar(items.filter((x) => !x.leida).length); api(`/notificaciones/${n.id}/leer`, { method: 'POST' }).catch(() => {}); }
    cerrar();
    const dest = it.dataset.enlace;
    if (dest && dest !== (location.pathname.split('/').pop() || 'index.html')) location.href = dest;
  });

  cargar();
  setInterval(() => { if (!document.hidden) cargar(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) cargar(); });
}

// Etiqueta cada celda con el nombre de su columna: en móvil la tabla se muestra como tarjetas (ver styles.css)
function etiquetarTablas() {
  document.querySelectorAll('table').forEach((t) => {
    const cab = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    t.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => { if (td.dataset.label === undefined) td.dataset.label = cab[i] || ''; }));
  });
}

// Utilidad de tabla con búsqueda local
function filtrar(rows, q, campos) {
  q = (q || '').toLowerCase().trim();
  if (!q) return rows;
  return rows.filter((r) => campos.some((c) => String(r[c] ?? '').toLowerCase().includes(q)));
}
document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.public !== '1') {
    initShell();
    let pendiente = false;
    new MutationObserver(() => { if (!pendiente) { pendiente = true; requestAnimationFrame(() => { pendiente = false; etiquetarTablas(); }); } })
      .observe(document.getElementById('content') || document.body, { childList: true, subtree: true });
    etiquetarTablas();
  }
  // animación de entrada solo en la primera carga (no en refrescos)
  const v = document.getElementById('view');
  if (v) {
    const mo = new MutationObserver(() => {
      mo.disconnect();
      v.dataset.fresh = '1';
      setTimeout(() => v.removeAttribute('data-fresh'), 1400);
    });
    mo.observe(v, { childList: true });
  }
});
