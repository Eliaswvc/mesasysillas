const TIPOS = ['RESERVA', 'CANCELACION', 'PRESTAMO', 'DEVOLUCION', 'DEVOLUCION_PARCIAL', 'MODIFICACION'];
async function cargar() {
  const tipo = document.getElementById('t').value, q = document.getElementById('q').value;
  const rows = await api(`/historial?${new URLSearchParams({ ...(tipo && { tipo }), ...(q && { q }) })}`);
  document.getElementById('tabla').innerHTML = rows.length ? `<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Usuario</th><th>Recurso</th><th>Cant.</th><th>Antes</th><th>Después</th><th>Ref.</th><th>Descripción</th></tr></thead><tbody>
  ${rows.map((m) => `<tr><td>${fmtDateTime(m.created_at)}</td><td>${esc(m.tipo.replace('_', ' '))}</td><td>${esc(m.usuario_nombre || '-')}</td><td>${esc(m.recurso || '-')}</td><td>${m.cantidad}</td>
  <td>${esc(m.estado_anterior || '-')}</td><td>${esc(m.estado_posterior || '-')}</td><td>${m.reserva_id ? 'R#' + m.reserva_id : ''} ${m.prestamo_id ? 'P#' + m.prestamo_id : ''} ${m.devolucion_id ? 'D#' + m.devolucion_id : ''}</td><td>${esc(m.descripcion || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin movimientos</div>';
}
document.getElementById('view').innerHTML = `<div class="toolbar"><input id="q" placeholder="Buscar…"><select id="t"><option value="">Todos los tipos</option>${TIPOS.map((t) => `<option>${t}</option>`).join('')}</select></div><div class="table-wrap" id="tabla"></div>`;
let timer; document.getElementById('q').oninput = () => { clearTimeout(timer); timer = setTimeout(() => cargar().catch((e) => toast(e.message, 'error')), 300); };
document.getElementById('t').onchange = () => cargar().catch((e) => toast(e.message, 'error'));
cargar().catch((e) => toast(e.message, 'error'));
