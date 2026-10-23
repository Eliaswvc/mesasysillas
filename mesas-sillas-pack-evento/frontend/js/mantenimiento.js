if (!isAdmin()) location.href = 'dashboard.html';
let filtro = 'EN_CURSO', inventario = [];

const stat = (label, value, ic, cls = '') => `<div class="card stat ${cls}"><div class="ico">${icon(ic)}</div><div><div class="label">${label}</div><div class="value">${value}</div></div></div>`;

function resolver(m) {
  openModal(`Resolver mantenimiento #${m.id}`, `<p class="hint" style="margin-top:0"><b>${esc(m.recurso_nombre)}</b> · ${MOTIVOS[m.motivo] || m.motivo} · quedan <b>${m.pendientes}</b> de ${m.cantidad} en mantenimiento.</p>
    <div class="row2"><div><label>Reparadas (vuelven a disponible)</label><input type="number" name="reparadas" min="0" max="${m.pendientes}" value="${m.pendientes}" required></div>
    <div><label>Dadas de baja (se descartan)</label><input type="number" name="descartadas" min="0" max="${m.pendientes}" value="0" required></div></div>
    <p class="hint warn">Las dadas de baja se restan del <b>total</b> del inventario. Las que no marques aquí siguen en mantenimiento.</p>
    <label>Costo de esta reparación (USD, opcional)</label><input type="number" name="costo" min="0" step="0.01" value="0">
    <label>Observaciones</label><textarea name="observaciones" placeholder="Ej.: se cambiaron las patas"></textarea>`,
    { submitText: 'Guardar', onSubmit: async (d, close) => {
      const rep = Number(d.reparadas || 0), des = Number(d.descartadas || 0);
      if (!Number.isInteger(rep) || !Number.isInteger(des) || rep < 0 || des < 0) throw new Error('Cantidades inválidas');
      if (rep + des === 0) throw new Error('Indica cuántas unidades se repararon o se dan de baja');
      if (rep + des > m.pendientes) throw new Error(`Solo quedan ${m.pendientes} pendientes`);
      await api(`/mantenimiento/${m.id}/resolver`, { method: 'PUT', body: { reparadas: rep, descartadas: des, costo: Number(d.costo || 0), observaciones: d.observaciones } });
      close(); toast('Mantenimiento actualizado'); cargar();
    } });
}

async function cargar() {
  const [resumen, lista, inv] = await Promise.all([api('/mantenimiento/resumen'), api('/mantenimiento' + (filtro ? '?estado=' + filtro : '')), api('/inventario')]);
  inventario = inv;
  const baja = resumen.reduce((a, r) => a + r.dadas_de_baja, 0), costo = resumen.reduce((a, r) => a + r.costo_total, 0);
  document.getElementById('view').innerHTML = `<div class="grid c4" style="margin-bottom:18px">
    ${resumen.map((r) => stat(`${esc(r.nombre)} en mantenimiento`, r.en_mantenimiento, 'wrench', r.en_mantenimiento ? 'warn' : 'gray')).join('')}
    ${stat('Dadas de baja', baja, 'alert', baja ? 'err' : 'gray')}${stat('Costo de reparaciones', usd(costo), 'card')}</div>
  <div class="toolbar"><select id="f"><option value="EN_CURSO" ${filtro === 'EN_CURSO' ? 'selected' : ''}>En curso</option><option value="CERRADO" ${filtro === 'CERRADO' ? 'selected' : ''}>Cerrados</option><option value="" ${filtro === '' ? 'selected' : ''}>Todos</option></select><span class="sp"></span><button class="btn" id="nuevo">+ Enviar a mantenimiento</button></div>
  <div class="table-wrap">${lista.length ? `<table><thead><tr><th>#</th><th>Recurso</th><th>Motivo</th><th>Cant.</th><th>Reparadas</th><th>De baja</th><th>Pendientes</th><th>Costo</th><th>Ingreso</th><th>Origen</th><th>Descripción</th><th>Estado</th><th></th></tr></thead><tbody>
  ${lista.map((m) => `<tr><td>${m.id}</td><td>${esc(m.recurso_nombre)}</td><td><span class="badge ${m.motivo === 'DANADO' ? 'DANADO' : 'mant'}">${MOTIVOS[m.motivo] || esc(m.motivo)}</span></td><td>${m.cantidad}</td><td>${m.cantidad_reparada}</td><td>${m.cantidad_descartada}</td><td>${m.pendientes}</td><td>${Number(m.costo) ? usd(m.costo) : '-'}</td><td>${fmtDateTime(m.fecha_ingreso)}</td><td>${m.devolucion_id ? `<a href="devoluciones.html">Devolución #${m.devolucion_id}</a>` : 'Manual'}</td><td style="white-space:pre-line;min-width:160px">${esc(m.descripcion || '')}</td><td>${badge(m.estado)}</td>
  <td>${m.estado === 'EN_CURSO' ? `<button class="btn btn-sm" data-id="${m.id}">Resolver</button>` : ''}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">${filtro === 'EN_CURSO' ? 'Nada en mantenimiento. ¡Todo el inventario está operativo!' : 'Sin registros'}</div>`}</div>`;
  document.getElementById('f').onchange = (e) => { filtro = e.target.value; cargar().catch((x) => toast(x.message, 'error')); };
  document.getElementById('nuevo').onclick = () => modalEnviarMantenimiento(inventario, null, cargar);
  document.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => resolver(lista.find((m) => m.id === Number(b.dataset.id)))));
}
cargar().catch((e) => toast(e.message, 'error'));
