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
  t.className = 'toast ' + (type === 'error' ? 'error' : '');
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
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M17 4a4 4 0 0 1 0 8M22 21c0-3-2-5.5-5-6.5"/>'
};
const icon = (n, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${IC[n]}</svg>`;

const MENU = [
  ['dashboard.html', 'Dashboard', 'dashboard', false, 'General'], ['inventario.html', 'Inventario', 'box', false, 'Operación'],
  ['catalogo.html', 'Catálogo', 'store', false], ['reservas.html', 'Reservas', 'calendar', false], ['pagos.html', 'Pagos', 'card', false], ['prestamos.html', 'Préstamos', 'out', false], ['devoluciones.html', 'Devoluciones', 'back', false],
  ['historial.html', 'Historial', 'clock', true, 'Administración'], ['usuarios.html', 'Usuarios', 'users', true]
];

function initShell() {
  if (!getToken()) return (location.href = 'login.html');
  const u = getUser();
  const page = location.pathname.split('/').pop() || 'index.html';
  const content = document.getElementById('content');
  const links = MENU.filter(([, , , adm]) => !adm || u.rol === 'ADMIN')
    .map(([href, label, ic, , group]) => `${group ? `<div class="nav-label">${group}</div>` : ''}<a href="${href}" class="${href === page ? 'active' : ''}">${icon(ic)}${label}</a>`).join('');
  const ini = u.nombre.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  const shell = document.createElement('div');
  shell.className = 'shell';
  shell.innerHTML = `<aside class="sidebar" id="sidebar"><div class="brand"><span class="logo">${icon('box', 'width="18" height="18" style="color:#fff"')}</span>Mesas &amp; Sillas</div>${links}
    <div class="side-foot">Sistema de inventario v1.0</div></aside>
    <div class="main"><header class="navbar"><button class="btn btn-ghost menu-btn" id="menuBtn">☰</button><span class="sp"></span>
    <div class="user-chip"><div class="avatar">${esc(ini)}</div><div class="t"><div class="n">${esc(u.nombre)}</div><div class="r">${u.rol === 'ADMIN' ? 'Administrador' : 'Usuario'}</div></div></div>
    <button class="btn btn-ghost btn-sm" id="logoutBtn">Salir</button></header></div>`;
  document.body.prepend(shell);
  shell.querySelector('.main').appendChild(content);
  document.getElementById('logoutBtn').onclick = logout;
  document.getElementById('menuBtn').onclick = () => document.getElementById('sidebar').classList.toggle('open');
}

// Utilidad de tabla con búsqueda local
function filtrar(rows, q, campos) {
  q = (q || '').toLowerCase().trim();
  if (!q) return rows;
  return rows.filter((r) => campos.some((c) => String(r[c] ?? '').toLowerCase().includes(q)));
}
document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.public !== '1') initShell();
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
