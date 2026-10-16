let datos = [], usuarios = [];
const q = { texto: '', estado: '' };

const puedePagar = (r) => ['PENDIENTE', 'CONFIRMADA'].includes(r.estado) && r.estado_pago === 'PENDIENTE' && Number(r.total) > 0;
const pagoBadge = (r) => (r.estado === 'CANCELADA' && r.estado_pago === 'PENDIENTE') || !Number(r.total) ? '<span style="color:var(--muted)">—</span>' : badge(r.estado_pago);

function pintar() {
  let rows = filtrar(datos, q.texto, ['usuario_nombre', 'observaciones', 'id']);
  if (q.estado) rows = rows.filter((r) => r.estado === q.estado);
  const admin = isAdmin();
  document.getElementById('tabla').innerHTML = rows.length ? `<table><thead><tr><th>#</th>${admin ? '<th>Usuario</th>' : ''}<th>Fecha</th><th>Horario</th><th>Mesas</th><th>Sillas</th><th>Total</th><th>Estado</th><th>Pago</th><th>Obs.</th><th></th></tr></thead><tbody>
  ${rows.map((r) => `<tr><td>${r.id}</td>${admin ? `<td>${esc(r.usuario_nombre)}</td>` : ''}<td>${fmtDay(r.fecha)}</td><td>${r.hora_inicio.slice(0, 5)}–${r.hora_fin.slice(0, 5)}</td>
  <td>${r.mesas}</td><td>${r.sillas}</td><td><b>${usd(r.total)}</b></td><td>${badge(r.estado)}</td><td>${pagoBadge(r)}</td><td>${esc(r.observaciones || '')}</td><td><div class="actions">
  ${admin && r.estado === 'PENDIENTE' ? `<button class="btn btn-ok btn-sm" data-a="confirmar" data-id="${r.id}">Confirmar</button>` : ''}
  ${admin && r.estado === 'CONFIRMADA' ? `<button class="btn btn-sm" data-a="prestar" data-id="${r.id}">Prestar</button>` : ''}
  ${puedePagar(r) ? `<button class="btn btn-ok btn-sm" data-a="pagar" data-id="${r.id}">Pagar ${usd(r.total)}</button>` : ''}
  ${['PENDIENTE', 'CONFIRMADA'].includes(r.estado) ? `<button class="btn btn-danger btn-sm" data-a="cancelar" data-id="${r.id}">Cancelar</button>` : ''}
  </div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin reservas</div>';
  document.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => accion(b.dataset.a, Number(b.dataset.id))));
}

async function accion(a, id) {
  try {
    if (a === 'confirmar') {
      if (!(await confirmModal('¿Confirmar la reserva #' + id + '? Se descontará del inventario disponible.'))) return;
      await api(`/reservas/${id}/confirmar`, { method: 'POST' }); toast('Reserva confirmada');
    } else if (a === 'cancelar') {
      const rv = datos.find((x) => x.id === id);
      const aviso = rv?.estado_pago === 'PAGADO' ? ` Se reembolsarán ${usd(rv.total)} (simulado).` : '';
      if (!(await confirmModal('¿Cancelar la reserva #' + id + '?' + aviso, { danger: true, okText: 'Sí, cancelar' }))) return;
      const res = await api(`/reservas/${id}/cancelar`, { method: 'POST' });
      toast(res.estado_pago === 'REEMBOLSADO' ? `Reserva cancelada · reembolso de ${usd(res.total)}` : 'Reserva cancelada');
    } else if (a === 'pagar') {
      return abrirPago(datos.find((x) => x.id === id), cargar);
    } else if (a === 'prestar') {
      return openModal('Convertir en préstamo', `<label>Fecha prevista de devolución</label><input type="datetime-local" name="f" required><label>Observaciones</label><textarea name="o"></textarea>`,
        { submitText: 'Registrar préstamo', onSubmit: async (d, close) => {
          await api('/prestamos', { method: 'POST', body: { reserva_id: id, fecha_prevista_devolucion: new Date(d.f).toISOString(), observaciones: d.o } });
          close(); toast('Préstamo registrado'); cargar();
        } });
    }
    cargar();
  } catch (e) { toast(e.message, 'error'); }
}

async function nueva() {
  const admin = isAdmin();
  // stock actual para advertir al instante; si no carga, igual el servidor rechaza lo que exceda
  let stock = null;
  try { stock = {}; (await api('/inventario')).forEach((i) => { stock[i.tipo] = i.estado === 'DISPONIBLE' ? Number(i.cantidad_disponible) : 0; }); } catch { stock = null; }
  const faltas = (m, s) => stock ? [msgStock('mesa', m, stock.MESA ?? 0), msgStock('silla', s, stock.SILLA ?? 0)].filter(Boolean) : [];
  const disp = (t) => (stock ? ` <small style="color:var(--muted);font-weight:400">(disponibles: ${stock[t] ?? 0})</small>` : '');
  const hoy = new Date().toISOString().slice(0, 10);
  const m = openModal('Nueva reserva', `${admin ? `<label>Usuario</label><select name="usuario_id">${usuarios.map((u) => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select>` : ''}
    <label>Fecha</label><input type="date" name="fecha" min="${hoy}" required>
    <div class="row2"><div><label>Inicio</label><input type="time" name="hora_inicio" required></div><div><label>Fin</label><input type="time" name="hora_fin" required></div></div>
    <div class="row2"><div><label>Mesas${disp('MESA')}</label><input type="number" name="mesas" min="0" value="0" required></div><div><label>Sillas${disp('SILLA')}</label><input type="number" name="sillas" min="0" value="0" required></div></div>
    <div class="stock-warn" id="avisoStock" role="alert" hidden></div>
    <label>Observaciones</label><textarea name="observaciones"></textarea>
    ${admin ? '<label><input type="checkbox" name="confirmar" style="width:auto"> Confirmar de inmediato (descuenta inventario)</label>' : ''}`,
    { onSubmit: async (d, close) => {
      if (d.hora_fin <= d.hora_inicio) throw new Error('La hora de fin debe ser posterior al inicio');
      if (Number(d.mesas) < 0 || Number(d.sillas) < 0 || Number(d.mesas) + Number(d.sillas) === 0) throw new Error('Cantidades inválidas');
      const f = faltas(Number(d.mesas), Number(d.sillas));
      if (f.length) throw new Error('No hay inventario suficiente. ' + f.join(' '));
      const nueva = await api('/reservas', { method: 'POST', body: { ...d, mesas: Number(d.mesas), sillas: Number(d.sillas), confirmar: !!d.confirmar, usuario_id: d.usuario_id ? Number(d.usuario_id) : undefined } });
      close(); toast('Reserva creada · total ' + usd(nueva.total)); cargar();
    } });
  // advertencia en vivo mientras escribe las cantidades
  const f = m.el.querySelector('form'), box = m.el.querySelector('#avisoStock');
  const revisar = () => {
    const t = faltas(Number(f.mesas.value) || 0, Number(f.sillas.value) || 0);
    box.hidden = !t.length; box.innerHTML = t.length ? avisoStockHTML(t.join(' ')) : '';
    f.mesas.classList.toggle('excedido', !!stock && (Number(f.mesas.value) || 0) > (stock.MESA ?? 0));
    f.sillas.classList.toggle('excedido', !!stock && (Number(f.sillas.value) || 0) > (stock.SILLA ?? 0));
  };
  f.mesas.addEventListener('input', revisar); f.sillas.addEventListener('input', revisar);
}

async function cargar() { datos = await api('/reservas'); pintar(); }
async function init() {
  if (isAdmin()) usuarios = (await api('/usuarios')).filter((u) => u.activo);
  document.getElementById('view').innerHTML = `<div class="toolbar"><input id="q" placeholder="Buscar…"><select id="e"><option value="">Todos los estados</option>
    ${['PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'FINALIZADA'].map((e) => `<option>${e}</option>`).join('')}</select><span class="sp"></span><a class="btn btn-ghost" href="catalogo.html">Ver catálogo</a><button class="btn" id="nueva">+ Nueva reserva</button></div>
    <div class="table-wrap" id="tabla"></div>`;
  document.getElementById('q').oninput = (e) => { q.texto = e.target.value; pintar(); };
  document.getElementById('e').onchange = (e) => { q.estado = e.target.value; pintar(); };
  document.getElementById('nueva').onclick = nueva;
  await cargar();
}
init().catch((e) => toast(e.message, 'error'));
