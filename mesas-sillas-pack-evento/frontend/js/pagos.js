let datos = [];
const q = { texto: '', tipo: '' };

const stat = (label, value, ic, cls = '') => `<div class="card stat ${cls}"><div class="ico">${icon(ic)}</div><div><div class="label">${label}</div><div class="value">${value}</div></div></div>`;

function pintar() {
  const admin = isAdmin();
  let rows = filtrar(datos, q.texto, ['referencia', 'usuario_nombre', 'reserva_id', 'ultimos4', 'titular']);
  if (q.tipo) rows = rows.filter((r) => (q.tipo === 'RECHAZADO' ? r.estado === 'RECHAZADO' : r.tipo === q.tipo && r.estado === 'APROBADO'));
  document.getElementById('tabla').innerHTML = rows.length ? `<table><thead><tr><th>Referencia</th><th>Fecha</th><th>Reserva</th>${admin ? '<th>Usuario</th>' : ''}<th>Tipo</th><th>Monto (USD)</th><th>Tarjeta</th><th>Estado</th><th>Detalle</th><th>Factura</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><code>${esc(r.referencia)}</code></td><td>${fmtDateTime(r.created_at)}</td><td>#${r.reserva_id}</td>${admin ? `<td>${esc(r.usuario_nombre)}</td>` : ''}
    <td>${badge(r.tipo)}</td><td class="${r.tipo === 'REEMBOLSO' ? 'neg' : ''}"><b>${r.tipo === 'REEMBOLSO' ? '−' : ''}${usd(r.monto)}</b></td>
    <td>${esc(r.marca || '')} •••• ${esc(r.ultimos4 || '')}</td><td>${badge(r.estado)}</td><td>${esc(r.motivo || '')}</td><td>${r.tipo === 'PAGO' && r.estado === 'APROBADO' ? `<button class="btn btn-ghost" data-ver="${r.id}">Ver</button> <button class="btn btn-ghost" data-mail="${r.id}">Reenviar</button><div style="font-size:11px;color:#6b7194"><code>${esc(r.numero_control || '')}</code></div>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin movimientos</div>';
  const t = document.getElementById('tabla');
  t.querySelectorAll('[data-ver]').forEach((b) => (b.onclick = () => verFactura(b.dataset.ver, b)));
  t.querySelectorAll('[data-mail]').forEach((b) => (b.onclick = () => reenviar(b.dataset.mail, b)));
}

async function verFactura(id, btn) {
  const w = window.open('', '_blank');   // se abre antes del await para que el navegador no bloquee la ventana
  btn.disabled = true;
  try {
    const f = await api(`/pagos/${id}/factura`);
    const barra = '<style>@media print{.no-print{display:none!important}}</style><div class="no-print" style="position:fixed;top:10px;right:10px"><button onclick="print()" style="padding:8px 14px;border:0;border-radius:8px;background:#3b4ccf;color:#fff;cursor:pointer">Imprimir / PDF</button></div>';
    w.document.open(); w.document.write(f.html.replace('</body>', `${barra}</body>`)); w.document.title = f.asunto; w.document.close();
  } catch (e) { w.close(); toast(e.message, 'error'); } finally { btn.disabled = false; }
}

async function reenviar(id, btn) {
  btn.disabled = true;
  try { const f = await api(`/pagos/${id}/factura`, { method: 'POST' }); toast(`Factura enviada a ${f.email}`); }
  catch (e) { toast(e.message, 'error'); } finally { btn.disabled = false; }
}

async function init() {
  datos = await api('/pagos');
  const ok = datos.filter((p) => p.estado === 'APROBADO');
  const cobrado = ok.filter((p) => p.tipo === 'PAGO').reduce((s, p) => s + Number(p.monto), 0);
  const reemb = ok.filter((p) => p.tipo === 'REEMBOLSO').reduce((s, p) => s + Number(p.monto), 0);
  const rechazados = datos.filter((p) => p.estado === 'RECHAZADO').length;
  document.getElementById('view').innerHTML = `<div class="grid c4" style="margin-bottom:18px">
    ${stat(isAdmin() ? 'Cobrado' : 'Total pagado', usd(cobrado), 'card', 'ok')}${stat('Reembolsado', usd(reemb), 'back')}
    ${stat(isAdmin() ? 'Ingresos netos' : 'Gasto neto', usd(cobrado - reemb), 'card')}${stat('Intentos rechazados', rechazados, 'clock', rechazados ? 'err' : '')}</div>
    <div class="toolbar"><input id="q" placeholder="Buscar referencia, reserva, tarjeta…"><select id="t"><option value="">Todos</option><option value="PAGO">Pagos</option><option value="REEMBOLSO">Reembolsos</option><option value="RECHAZADO">Rechazados</option></select>
    <span class="sp"></span><a class="btn btn-ghost" href="reservas.html">Ir a reservas</a></div><div class="table-wrap" id="tabla"></div>`;
  document.getElementById('q').oninput = (e) => { q.texto = e.target.value; pintar(); };
  document.getElementById('t').onchange = (e) => { q.tipo = e.target.value; pintar(); };
  pintar();
}
init().catch((e) => toast(e.message, 'error'));
