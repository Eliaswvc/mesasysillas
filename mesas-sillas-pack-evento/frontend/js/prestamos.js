let datos = [], usuarios = [];
const q = { texto: '', estado: '' };

function pintar() {
  let rows = filtrar(datos, q.texto, ['usuario_nombre', 'observaciones', 'id']);
  if (q.estado) rows = rows.filter((r) => r.estado === q.estado);
  const admin = isAdmin();
  document.getElementById('tabla').innerHTML = rows.length ? `<table><thead><tr><th>#</th>${admin ? '<th>Usuario</th>' : ''}<th>Préstamo</th><th>Devolver antes de</th><th>Mesas (pend./total)</th><th>Sillas (pend./total)</th><th>Estado</th><th></th></tr></thead><tbody>
  ${rows.map((r) => `<tr><td>${r.id}</td>${admin ? `<td>${esc(r.usuario_nombre)}</td>` : ''}<td>${fmtDate(r.fecha_prestamo)}</td><td>${fmtDateTime(r.fecha_prevista_devolucion)}</td>
  <td>${r.mesas_pendientes}/${r.mesas_prestadas}</td><td>${r.sillas_pendientes}/${r.sillas_prestadas}</td><td>${badge(r.estado)}</td>
  <td>${admin && r.estado !== 'DEVUELTO' ? `<div class="actions"><a class="btn btn-ok btn-sm" href="devoluciones.html?prestamo=${r.id}">Devolver</a><button class="btn btn-ghost btn-sm" data-id="${r.id}">Editar fecha</button></div>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin préstamos</div>';
  document.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => editar(Number(b.dataset.id))));
}

function editar(id) {
  openModal('Modificar préstamo #' + id, `<label>Nueva fecha prevista</label><input type="datetime-local" name="f" required><label>Observaciones</label><textarea name="o"></textarea>`,
    { onSubmit: async (d, close) => {
      await api('/prestamos/' + id, { method: 'PUT', body: { fecha_prevista_devolucion: new Date(d.f).toISOString(), observaciones: d.o || undefined } });
      close(); toast('Préstamo actualizado'); cargar();
    } });
}

function nuevo() {
  openModal('Nuevo préstamo directo', `<label>Usuario responsable</label><select name="usuario_id">${usuarios.map((u) => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select>
    <div class="row2"><div><label>Mesas</label><input type="number" name="mesas" min="0" value="0" required></div><div><label>Sillas</label><input type="number" name="sillas" min="0" value="0" required></div></div>
    <label>Fecha prevista de devolución</label><input type="datetime-local" name="f" required><label>Observaciones</label><textarea name="o"></textarea>`,
    { submitText: 'Registrar', onSubmit: async (d, close) => {
      if (new Date(d.f) <= new Date()) throw new Error('La fecha prevista debe ser futura');
      if (Number(d.mesas) + Number(d.sillas) <= 0) throw new Error('Indique cantidades');
      await api('/prestamos', { method: 'POST', body: { usuario_id: Number(d.usuario_id), mesas: Number(d.mesas), sillas: Number(d.sillas), fecha_prevista_devolucion: new Date(d.f).toISOString(), observaciones: d.o } });
      close(); toast('Préstamo registrado'); cargar();
    } });
}

async function cargar() { datos = await api('/prestamos'); pintar(); }
async function init() {
  const admin = isAdmin();
  if (admin) usuarios = (await api('/usuarios')).filter((u) => u.activo);
  document.getElementById('view').innerHTML = `<div class="toolbar"><input id="q" placeholder="Buscar…"><select id="e"><option value="">Todos los estados</option>
    ${['ACTIVO', 'PARCIALMENTE_DEVUELTO', 'DEVUELTO', 'VENCIDO'].map((e) => `<option>${e}</option>`).join('')}</select><span class="sp"></span>
    ${admin ? '<button class="btn" id="nuevo">+ Nuevo préstamo</button>' : ''}</div><div class="table-wrap" id="tabla"></div>`;
  document.getElementById('q').oninput = (e) => { q.texto = e.target.value; pintar(); };
  document.getElementById('e').onchange = (e) => { q.estado = e.target.value; pintar(); };
  if (admin) document.getElementById('nuevo').onclick = nuevo;
  await cargar();
}
init().catch((e) => toast(e.message, 'error'));
