let datos = [];
const q = { texto: '', tipo: '' };

const stat = (label, value, ic, cls = '') => `<div class="card stat ${cls}"><div class="ico">${icon(ic)}</div><div><div class="label">${label}</div><div class="value">${value}</div></div></div>`;

function pintar() {
  const admin = isAdmin();
  let rows = filtrar(datos, q.texto, ['referencia', 'usuario_nombre', 'reserva_id', 'ultimos4', 'titular']);
  if (q.tipo) rows = rows.filter((r) => (q.tipo === 'RECHAZADO' ? r.estado === 'RECHAZADO' : r.tipo === q.tipo && r.estado === 'APROBADO'));
  document.getElementById('tabla').innerHTML = rows.length ? `<table><thead><tr><th>Referencia</th><th>Fecha</th><th>Reserva</th>${admin ? '<th>Usuario</th>' : ''}<th>Tipo</th><th>Monto (USD)</th><th>Tarjeta</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><code>${esc(r.referencia)}</code></td><td>${fmtDateTime(r.created_at)}</td><td>#${r.reserva_id}</td>${admin ? `<td>${esc(r.usuario_nombre)}</td>` : ''}
    <td>${badge(r.tipo)}</td><td class="${r.tipo === 'REEMBOLSO' ? 'neg' : ''}"><b>${r.tipo === 'REEMBOLSO' ? '−' : ''}${usd(r.monto)}</b></td>
    <td>${esc(r.marca || '')} •••• ${esc(r.ultimos4 || '')}</td><td>${badge(r.estado)}</td><td>${esc(r.motivo || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin movimientos</div>';
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
