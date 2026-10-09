let pendientes = [];

function form() {
  const pre = Number(new URLSearchParams(location.search).get('prestamo')) || '';
  openModal('Registrar devolución', `<label>Préstamo</label><select name="prestamo_id" id="sel" required><option value="">Seleccione…</option>
    ${pendientes.map((p) => `<option value="${p.id}" ${p.id === pre ? 'selected' : ''}>#${p.id} · ${esc(p.usuario_nombre)}</option>`).join('')}</select>
    <p class="hint" id="info"></p>
    <div class="row2"><div><label>Mesas devueltas</label><input type="number" name="mesas" min="0" value="0" required></div><div><label>Sillas devueltas</label><input type="number" name="sillas" min="0" value="0" required></div></div>
    <label>Observaciones</label><textarea name="observaciones"></textarea>`,
    { submitText: 'Registrar', onSubmit: async (d, close) => {
      const p = pendientes.find((x) => x.id === Number(d.prestamo_id));
      if (!p) throw new Error('Seleccione un préstamo');
      const m = Number(d.mesas), s = Number(d.sillas);
      if (m < 0 || s < 0 || m + s === 0) throw new Error('Cantidades inválidas');
      if (m > p.mesas_pendientes || s > p.sillas_pendientes) throw new Error('No puede devolver más de lo pendiente');
      const r = await api('/devoluciones', { method: 'POST', body: { prestamo_id: p.id, mesas: m, sillas: s, observaciones: d.observaciones } });
      close(); toast(r.unidades_pendientes === 0 ? 'Préstamo devuelto por completo' : 'Devolución parcial registrada'); history.replaceState(null, '', 'devoluciones.html'); cargar();
    } });
  const sel = document.getElementById('sel');
  const info = () => {
    const p = pendientes.find((x) => x.id === Number(sel.value));
    document.getElementById('info').textContent = p ? `Pendientes: ${p.mesas_pendientes} mesas, ${p.sillas_pendientes} sillas` : '';
  };
  sel.onchange = info; info();
}

async function cargar() {
  const [devs, prest] = await Promise.all([api('/devoluciones'), api('/prestamos')]);
  pendientes = prest.filter((p) => p.estado !== 'DEVUELTO');
  const admin = isAdmin();
  document.getElementById('view').innerHTML = `<div class="toolbar"><span class="sp"></span>${admin ? '<button class="btn" id="nueva">+ Registrar devolución</button>' : ''}</div>
  <div class="table-wrap">${devs.length ? `<table><thead><tr><th>#</th><th>Préstamo</th>${admin ? '<th>Usuario</th>' : ''}<th>Fecha</th><th>Mesas</th><th>Sillas</th><th>Registró</th><th>Obs.</th></tr></thead><tbody>
  ${devs.map((d) => `<tr><td>${d.id}</td><td>#${d.prestamo_id}</td>${admin ? `<td>${esc(d.usuario_nombre)}</td>` : ''}<td>${fmtDateTime(d.fecha_devolucion)}</td><td>${d.mesas}</td><td>${d.sillas}</td><td>${esc(d.registrado_por_nombre)}</td><td>${esc(d.observaciones || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin devoluciones</div>'}</div>
  <h2 class="section-title">Devoluciones pendientes</h2><div class="table-wrap">${pendientes.length ? `<table><thead><tr><th>Préstamo</th>${admin ? '<th>Usuario</th>' : ''}<th>Devolver antes de</th><th>Mesas pend.</th><th>Sillas pend.</th><th>Estado</th></tr></thead><tbody>
  ${pendientes.map((p) => `<tr><td>#${p.id}</td>${admin ? `<td>${esc(p.usuario_nombre)}</td>` : ''}<td>${fmtDateTime(p.fecha_prevista_devolucion)}</td><td>${p.mesas_pendientes}</td><td>${p.sillas_pendientes}</td><td>${badge(p.estado)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nada pendiente</div>'}</div>`;
  if (admin) {
    document.getElementById('nueva').onclick = form;
    if (new URLSearchParams(location.search).get('prestamo') && !document.querySelector('.modal-overlay')) form();
  }
}
cargar().catch((e) => toast(e.message, 'error'));
