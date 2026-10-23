if (!isAdmin()) location.href = 'dashboard.html';

const TIPOS = { DIURNA: 'Diurna', NOCTURNA: 'Nocturna', ASUETO: 'Asueto / descanso' };
const pad = (n) => String(n).padStart(2, '0');
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const mesActual = () => hoy().slice(0, 7);
const horasFmt = (h) => Number(h).toFixed(2).replace(/\.?0+$/, '');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (p) => `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const stat = (label, value, ic, cls = '') => `<div class="card stat ${cls}"><div class="ico">${icon(ic)}</div><div><div class="label">${label}</div><div class="value">${value}</div></div></div>`;

let tab = ['trabajadores', 'horas', 'planilla'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'trabajadores';
let cfg = null, trabajadores = [];
const st = { fTrab: 'true', qTrab: '', fHoras: '', mHoras: '', periodo: mesActual() };

const valorHora = (s) => Number(s) / cfg.dias_mes / cfg.horas_jornada;
const pctTxt = (r) => `${Math.round(r * 100)} %`;

// ---------- cabecera con tarjetas + pestañas ----------
async function pintarBase() {
  const r = await api('/nomina/resumen');
  const pend = r.registros_pendientes;
  document.getElementById('view').innerHTML = `<div class="grid c4" style="margin-bottom:18px">
    ${stat('Trabajadores activos', r.trabajadores_activos, 'users')}
    ${stat('Nómina base mensual', usd(r.nomina_base), 'cash')}
    ${stat('Horas extra por aprobar', `${horasFmt(r.horas_pendientes)} h`, 'clock', pend ? 'warn' : 'gray')}
    ${stat('Horas aprobadas por pagar', `${horasFmt(r.horas_por_pagar)} h`, 'card', r.horas_por_pagar ? 'ok' : 'gray')}</div>
  <div class="tabs" role="tablist">${[['trabajadores', 'Trabajadores'], ['horas', `Horas extra${pend ? ` (${pend})` : ''}`], ['planilla', 'Planilla']]
    .map(([k, l]) => `<button type="button" role="tab" class="tab ${tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
  <div id="panel"><div class="empty">Cargando…</div></div>`;
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; location.hash = tab; cargar(); }));
}

async function cargar() {
  try {
    if (!cfg) cfg = await api('/nomina/config');
    await pintarBase();
    await ({ trabajadores: tabTrabajadores, horas: tabHoras, planilla: tabPlanilla })[tab]();
  } catch (e) { toast(e.message, 'error'); }
}

// ================= TRABAJADORES =================
async function tabTrabajadores() {
  trabajadores = await api('/nomina/trabajadores');
  const panel = document.getElementById('panel');
  panel.innerHTML = `<div class="toolbar"><input id="q" placeholder="Buscar por nombre, DUI o cargo…" value="${esc(st.qTrab)}">
    <select id="f"><option value="true">Activos</option><option value="">Todos</option><option value="false">Inactivos</option></select><span class="sp"></span>
    <button class="btn" id="nuevo">+ Nuevo trabajador</button></div><div class="table-wrap" id="tabla"></div>`;
  document.getElementById('f').value = st.fTrab;
  const pintar = () => {
    st.qTrab = document.getElementById('q').value; st.fTrab = document.getElementById('f').value;
    let rows = filtrar(trabajadores, st.qTrab, ['nombre', 'dui', 'cargo']);
    if (st.fTrab) rows = rows.filter((t) => String(t.activo) === st.fTrab);
    document.getElementById('tabla').innerHTML = rows.length ? `<table><thead><tr><th>#</th><th>Nombre</th><th>DUI</th><th>Cargo</th><th>Ingreso</th><th class="num">Salario mensual</th><th class="num">Valor hora</th><th>Estado</th><th></th></tr></thead><tbody>
      ${rows.map((t) => `<tr><td>${t.id}</td><td>${esc(t.nombre)}</td><td>${esc(t.dui || '-')}</td><td>${esc(t.cargo || '-')}</td><td>${fmtDay(t.fecha_ingreso)}</td>
      <td class="num">${usd(t.salario_mensual)}</td><td class="num">${usd(valorHora(t.salario_mensual))}</td><td>${badge(t.activo ? 'ACTIVO' : 'INACTIVO')}</td>
      <td><button class="btn btn-sm" data-edit="${t.id}">Editar</button></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">Sin trabajadores. Agrega el primero con «+ Nuevo trabajador».</div>';
    document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => formTrabajador(trabajadores.find((t) => t.id === Number(b.dataset.edit)))));
  };
  document.getElementById('q').oninput = pintar; document.getElementById('f').onchange = pintar;
  document.getElementById('nuevo').onclick = () => formTrabajador(null);
  pintar();
}

function formTrabajador(t) {
  const nuevo = !t;
  openModal(nuevo ? 'Nuevo trabajador' : 'Editar trabajador', `<label>Nombre completo</label><input name="nombre" value="${esc(t?.nombre || '')}" required maxlength="120">
    <div class="row2"><div><label>DUI</label><input name="dui" value="${esc(t?.dui || '')}" placeholder="12345678-9" pattern="\\d{8}-?\\d"></div>
    <div><label>Cargo</label><input name="cargo" value="${esc(t?.cargo || '')}" maxlength="80" placeholder="Ej.: Repartidor"></div></div>
    <div class="row2"><div><label>Salario mensual (USD)</label><input type="number" name="salario_mensual" min="0.01" step="0.01" value="${t ? t.salario_mensual : ''}" required></div>
    <div><label>Fecha de ingreso</label><input type="date" name="fecha_ingreso" value="${esc(t?.fecha_ingreso || hoy())}" required></div></div>
    <label>Teléfono</label><input name="telefono" value="${esc(t?.telefono || '')}" maxlength="20">
    <label>Notas</label><textarea name="notas" placeholder="Opcional">${esc(t?.notas || '')}</textarea>
    ${nuevo ? '' : `<label>Estado</label><select name="activo"><option value="true" ${t.activo ? 'selected' : ''}>Activo</option><option value="false" ${!t.activo ? 'selected' : ''}>Inactivo</option></select>`}
    <p class="hint">Valor de la hora ordinaria = salario ÷ ${cfg.dias_mes} ÷ ${cfg.horas_jornada}.</p>`,
    { onSubmit: async (d, close) => {
      const body = { ...d, salario_mensual: Number(d.salario_mensual) };
      if (!nuevo) body.activo = d.activo === 'true';
      await api(nuevo ? '/nomina/trabajadores' : '/nomina/trabajadores/' + t.id, { method: nuevo ? 'POST' : 'PUT', body });
      close(); toast('Trabajador guardado'); cargar();
    } });
}

// ================= HORAS EXTRA =================
async function tabHoras() {
  const [lista, trab] = await Promise.all([
    api('/nomina/horas-extra?' + new URLSearchParams({ ...(st.fHoras && { estado: st.fHoras }), ...(st.mHoras && { periodo: st.mHoras }) })),
    api('/nomina/trabajadores')]);
  trabajadores = trab;
  const tot = lista.filter((h) => h.estado !== 'RECHAZADA');
  document.getElementById('panel').innerHTML = `<div class="toolbar">
    <select id="f"><option value="">Todos los estados</option>${['PENDIENTE', 'APROBADA', 'RECHAZADA', 'PAGADA'].map((e) => `<option value="${e}" ${st.fHoras === e ? 'selected' : ''}>${e[0] + e.slice(1).toLowerCase()}s</option>`).join('')}</select>
    <input type="month" id="m" value="${esc(st.mHoras)}" title="Filtrar por mes"><span class="sp"></span>
    <button class="btn" id="nuevo">+ Registrar horas extra</button></div>
  <div class="table-wrap">${lista.length ? `<table><thead><tr><th>#</th><th>Trabajador</th><th>Fecha</th><th class="num">Horas</th><th>Tipo</th><th class="num">Monto a pagar</th><th>Motivo</th><th>Estado</th><th></th></tr></thead><tbody>
    ${lista.map((h) => `<tr><td>${h.id}</td><td>${esc(h.trabajador_nombre)}</td><td>${fmtDay(h.fecha)}</td><td class="num">${horasFmt(h.horas)}</td><td>${TIPOS[h.tipo] || esc(h.tipo)}</td>
    <td class="num">${usd(h.monto)}</td><td style="white-space:pre-line;min-width:140px">${esc(h.motivo || '')}</td><td>${badge(h.estado)}</td>
    <td><div class="actions">${h.estado === 'PENDIENTE' ? `<button class="btn btn-sm" data-ok="${h.id}">Aprobar</button> <button class="btn btn-sm btn-ghost" data-no="${h.id}">Rechazar</button>` : ''}
    ${h.estado === 'APROBADA' ? `<button class="btn btn-sm btn-ghost" data-no="${h.id}">Rechazar</button>` : ''}
    ${h.estado !== 'PAGADA' ? `<button class="btn btn-sm btn-danger" data-del="${h.id}">Eliminar</button>` : ''}</div></td></tr>`).join('')}
    <tr class="total"><td colspan="3">Total (sin rechazadas)</td><td class="num">${horasFmt(tot.reduce((a, h) => a + h.horas, 0))}</td><td></td><td class="num">${usd(tot.reduce((a, h) => a + h.monto, 0))}</td><td colspan="3"></td></tr></tbody></table>`
    : '<div class="empty">Sin registros de horas extra con estos filtros.</div>'}</div>
  <p class="hint">Solo las horas <b>aprobadas</b> entran a la planilla del mes en que se trabajaron. Recargo: ${Object.entries(cfg.recargo).map(([k, v]) => `${TIPOS[k].toLowerCase()} +${pctTxt(v)}`).join(' · ')}.</p>`;
  document.getElementById('f').onchange = (e) => { st.fHoras = e.target.value; cargar(); };
  document.getElementById('m').onchange = (e) => { st.mHoras = e.target.value; cargar(); };
  document.getElementById('nuevo').onclick = formHoras;
  const resolver = (id, estado) => api(`/nomina/horas-extra/${id}/resolver`, { method: 'PUT', body: { estado } }).then(() => { toast(estado === 'APROBADA' ? 'Horas aprobadas' : 'Horas rechazadas'); cargar(); }).catch((e) => toast(e.message, 'error'));
  document.querySelectorAll('[data-ok]').forEach((b) => b.addEventListener('click', () => resolver(b.dataset.ok, 'APROBADA')));
  document.querySelectorAll('[data-no]').forEach((b) => b.addEventListener('click', () => resolver(b.dataset.no, 'RECHAZADA')));
  document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmModal('¿Eliminar este registro de horas extra?', { danger: true, okText: 'Eliminar' }))) return;
    api('/nomina/horas-extra/' + b.dataset.del, { method: 'DELETE' }).then(() => { toast('Registro eliminado'); cargar(); }).catch((e) => toast(e.message, 'error'));
  }));
}

function formHoras() {
  const activos = trabajadores.filter((t) => t.activo);
  if (!activos.length) return toast('Primero registra al menos un trabajador activo', 'warn');
  openModal('Registrar horas extra', `<label>Trabajador</label><select name="trabajador_id" required>${activos.map((t) => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('')}</select>
    <div class="row3"><div><label>Fecha</label><input type="date" name="fecha" value="${hoy()}" max="${hoy()}" required></div>
    <div><label>Horas</label><input type="number" name="horas" min="0.25" max="12" step="0.25" value="1" required></div>
    <div><label>Tipo</label><select name="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div></div>
    <label>Motivo</label><textarea name="motivo" placeholder="Ej.: entrega de pedidos de evento"></textarea>
    <label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" name="aprobar" value="1" style="width:auto"> Aprobar de una vez</label>
    <p class="hint">Se paga la hora ordinaria más el recargo legal. Las horas extra son voluntarias, salvo casos de fuerza mayor.</p>`,
    { submitText: 'Registrar', onSubmit: async (d, close) => {
      await api('/nomina/horas-extra', { method: 'POST', body: { ...d, trabajador_id: Number(d.trabajador_id), horas: Number(d.horas), aprobar: d.aprobar === '1' } });
      close(); toast('Horas extra registradas'); cargar();
    } });
}

// ================= PLANILLA =================
const COLS = [['nombre', 'Trabajador'], ['cargo', 'Cargo'], ['salario_base', 'Salario'], ['horas_extra', 'H. extra'], ['monto_horas_extra', 'Pago H. extra'], ['bruto', 'Bruto'], ['isss', 'ISSS'], ['afp', 'AFP'], ['renta', 'Renta'], ['neto', 'Neto a pagar']];

function tablaPlanilla(c) {
  const t = c.totales, m = (v) => usd(v);
  return c.filas.length ? `<table><thead><tr>${COLS.map(([k, l], i) => `<th class="${i > 1 ? 'num' : ''}">${l}</th>`).join('')}</tr></thead><tbody>
    ${c.filas.map((f) => `<tr><td>${esc(f.nombre)}</td><td>${esc(f.cargo || '-')}</td><td class="num">${m(f.salario_base)}</td><td class="num">${horasFmt(f.horas_extra)}</td><td class="num">${m(f.monto_horas_extra)}</td>
    <td class="num">${m(f.bruto)}</td><td class="num">${m(f.isss)}</td><td class="num">${m(f.afp)}</td><td class="num">${m(f.renta)}</td><td class="num"><b>${m(f.neto)}</b></td></tr>`).join('')}
    <tr class="total"><td colspan="2">Totales (${t.trabajadores})</td><td class="num">${m(t.salarios)}</td><td class="num">${horasFmt(t.horas_extra)}</td><td class="num">${m(t.monto_horas_extra)}</td>
    <td class="num">${m(t.bruto)}</td><td class="num">${m(t.isss)}</td><td class="num">${m(t.afp)}</td><td class="num">${m(t.renta)}</td><td class="num">${m(t.neto)}</td></tr></tbody></table>`
    : '<div class="empty">No hay trabajadores para esta planilla.</div>';
}

function descargarCSV(c) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lineas = [COLS.map(([, l]) => q(l)).join(',')].concat(c.filas.map((f) => COLS.map(([k]) => q(f[k])).join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `planilla-${c.periodo}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

async function tabPlanilla() {
  const [c, hist] = await Promise.all([api('/nomina/planilla/calculo?periodo=' + st.periodo), api('/nomina/planillas')]);
  const t = c.totales;
  document.getElementById('panel').innerHTML = `<div class="toolbar"><input type="month" id="per" value="${esc(st.periodo)}"><span class="sp"></span>
    <button class="btn btn-ghost" id="csv" ${c.filas.length ? '' : 'disabled'}>Descargar CSV</button>
    ${c.cerrada ? `<span>${badge('PAGADA')} Planilla cerrada</span>` : `<button class="btn" id="cerrar" ${c.filas.length ? '' : 'disabled'}>Cerrar y registrar planilla</button>`}</div>
  <div class="grid c4" style="margin-bottom:18px">${stat('Total bruto', usd(t.bruto), 'cash')}${stat('Pago por horas extra', usd(t.monto_horas_extra), 'clock', t.monto_horas_extra ? 'warn' : 'gray')}
    ${stat('Descuentos de ley', usd(t.deducciones), 'alert', 'err')}${stat('Neto a pagar', usd(t.neto), 'card', 'ok')}</div>
  <div class="table-wrap">${tablaPlanilla(c)}</div>
  <p class="hint">${c.cerrada ? 'Planilla ya cerrada: lo que ves es lo que quedó registrado.' : 'Vista previa de ' + nombreMes(c.periodo) + ': salario + horas extra <b>aprobadas</b> sin pagar. Al cerrarla, esas horas pasan a «Pagada» y el período queda bloqueado.'}
    Descuentos: ISSS ${pctTxt(cfg.isss.empleado)} sobre el salario ordinario (base máx. ${usd(cfg.isss.tope)}${cfg.isss_incluye_horas_extra ? '' : ', sin horas extra'}), AFP ${(cfg.afp.empleado * 100).toFixed(2)} % sobre lo devengado y renta según tabla mensual de retención.</p>
  <h2 style="margin:26px 0 12px;font-size:17px">Planillas cerradas</h2>
  <div class="table-wrap">${hist.length ? `<table><thead><tr><th>Período</th><th class="num">Trabajadores</th><th class="num">Bruto</th><th class="num">Horas extra</th><th class="num">Descuentos</th><th class="num">Neto</th><th>Cerrada por</th><th></th></tr></thead><tbody>
    ${hist.map((p) => `<tr><td>${esc(nombreMes(p.periodo))}</td><td class="num">${p.trabajadores}</td><td class="num">${usd(p.total_bruto)}</td><td class="num">${usd(p.total_horas_extra)}</td><td class="num">${usd(p.total_deducciones)}</td>
    <td class="num"><b>${usd(p.total_neto)}</b></td><td>${esc(p.cerrada_por_nombre)} · ${fmtDate(p.created_at)}</td><td><button class="btn btn-sm" data-per="${p.periodo}">Ver</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aún no hay planillas cerradas.</div>'}</div>`;
  document.getElementById('per').onchange = (e) => { if (e.target.value) { st.periodo = e.target.value; cargar(); } };
  document.getElementById('csv').onclick = () => descargarCSV(c);
  const cerrar = document.getElementById('cerrar');
  if (cerrar) cerrar.onclick = async () => {
    if (!(await confirmModal(`¿Cerrar la planilla de ${nombreMes(c.periodo)}? Total neto: ${usd(t.neto)}. Después no se podrán registrar más horas extra de ese mes.`, { okText: 'Cerrar planilla' }))) return;
    try { await api('/nomina/planilla', { method: 'POST', body: { periodo: c.periodo } }); toast('Planilla cerrada'); cargar(); } catch (e) { toast(e.message, 'error'); }
  };
  document.querySelectorAll('[data-per]').forEach((b) => b.addEventListener('click', () => { st.periodo = b.dataset.per; cargar(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
}

cargar();
