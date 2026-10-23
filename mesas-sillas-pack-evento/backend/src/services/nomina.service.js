const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const N = require('../config/nomina');

// ---------- validaciones ----------
const periodo = (p) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(p || ''))) throw new AppError('Período inválido (use AAAA-MM)');
  return String(p);
};
const fecha = (v, campo = 'Fecha') => {
  const s = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new AppError(`${campo} inválida`);
  return s;
};
const texto = (v, max) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
const dinero = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 100000) throw new AppError('Salario inválido');
  return N.r2(n);
};
const dui = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (!/^\d{8}-?\d$/.test(s)) throw new AppError('DUI inválido (formato 12345678-9)');
  const d = s.replace('-', '');
  return `${d.slice(0, 8)}-${d.slice(8)}`;
};

const COLS_TRAB = `id, nombre, dui, cargo, telefono, to_char(fecha_ingreso,'YYYY-MM-DD') AS fecha_ingreso, salario_mensual::float8 AS salario_mensual, activo, notas`;

exports.config = () => ({
  dias_mes: N.P.DIAS_MES, horas_jornada: N.P.HORAS_JORNADA, recargo: N.P.RECARGO,
  isss: N.P.ISSS, afp: N.P.AFP, isss_incluye_horas_extra: N.P.ISSS_INCLUYE_HORAS_EXTRA
});

// ---------- trabajadores ----------
exports.listarTrabajadores = async ({ activo } = {}) => {
  const { rows } = await query(
    `SELECT ${COLS_TRAB} FROM trabajadores WHERE ($1::boolean IS NULL OR activo=$1) ORDER BY activo DESC, nombre`,
    [activo === undefined || activo === '' ? null : activo === 'true']);
  return rows;
};

const datosTrabajador = (b) => {
  const nombre = texto(b.nombre, 120);
  if (!nombre) throw new AppError('El nombre es requerido');
  return [nombre, dui(b.dui), texto(b.cargo, 80), texto(b.telefono, 20),
    b.fecha_ingreso ? fecha(b.fecha_ingreso, 'Fecha de ingreso') : null, dinero(b.salario_mensual), texto(b.notas, 500)];
};

exports.crearTrabajador = async (b) => {
  const [nombre, d, cargo, tel, ingreso, salario, notas] = datosTrabajador(b);
  const { rows } = await query(
    `INSERT INTO trabajadores (nombre,dui,cargo,telefono,fecha_ingreso,salario_mensual,notas)
     VALUES ($1,$2,$3,$4,COALESCE($5::date,CURRENT_DATE),$6,$7) RETURNING ${COLS_TRAB}`,
    [nombre, d, cargo, tel, ingreso, salario, notas]);
  return rows[0];
};

exports.actualizarTrabajador = async (id, b) => {
  const [nombre, d, cargo, tel, ingreso, salario, notas] = datosTrabajador(b);
  const activo = typeof b.activo === 'boolean' ? b.activo : null;
  const { rows } = await query(
    `UPDATE trabajadores SET nombre=$2, dui=$3, cargo=$4, telefono=$5, fecha_ingreso=COALESCE($6::date,fecha_ingreso),
       salario_mensual=$7, notas=$8, activo=COALESCE($9,activo) WHERE id=$1 RETURNING ${COLS_TRAB}`,
    [id, nombre, d, cargo, tel, ingreso, salario, notas, activo]);
  if (!rows.length) throw new AppError('Trabajador inexistente', 404);
  return rows[0];
};

// ---------- horas extra ----------
const COLS_HORAS = `h.id, h.trabajador_id, to_char(h.fecha,'YYYY-MM-DD') AS fecha, h.horas::float8 AS horas, h.tipo, h.motivo, h.estado,
  h.planilla_id, h.created_at, h.fecha_resolucion, t.nombre AS trabajador_nombre, t.salario_mensual::float8 AS salario_mensual`;

exports.listarHoras = async ({ estado, trabajador_id, periodo: per } = {}) => {
  if (estado && !['PENDIENTE', 'APROBADA', 'RECHAZADA', 'PAGADA'].includes(estado)) throw new AppError('Estado inválido');
  if (per) periodo(per);
  const { rows } = await query(
    `SELECT ${COLS_HORAS} FROM horas_extra h JOIN trabajadores t ON t.id=h.trabajador_id
     WHERE ($1::text IS NULL OR h.estado=$1) AND ($2::int IS NULL OR h.trabajador_id=$2)
       AND ($3::text IS NULL OR to_char(h.fecha,'YYYY-MM')=$3)
     ORDER BY h.fecha DESC, h.id DESC LIMIT 500`,
    [estado || null, trabajador_id ? Number(trabajador_id) : null, per || null]);
  return rows.map((r) => ({ ...r, monto: N.montoHoras(r.salario_mensual, r.horas, r.tipo) }));
};

exports.registrarHoras = async (user, b) => {
  const tid = Number(b.trabajador_id), horas = Number(b.horas), f = fecha(b.fecha);
  if (!Number.isInteger(tid)) throw new AppError('Trabajador requerido');
  if (!Number.isFinite(horas) || horas <= 0 || horas > 12) throw new AppError('Las horas deben estar entre 0.25 y 12 por registro');
  if (Math.round(horas * 4) !== horas * 4) throw new AppError('Las horas se registran en múltiplos de 0.25 (15 min)');
  const tipo = String(b.tipo || 'DIURNA');
  if (!N.TIPOS.includes(tipo)) throw new AppError('Tipo de hora extra inválido');
  const t = (await query('SELECT id, activo FROM trabajadores WHERE id=$1', [tid])).rows[0];
  if (!t) throw new AppError('Trabajador inexistente', 404);
  if (!t.activo) throw new AppError('El trabajador está inactivo');
  const cerrada = (await query('SELECT 1 FROM planillas WHERE periodo=$1', [f.slice(0, 7)])).rows.length;
  if (cerrada) throw new AppError(`La planilla de ${f.slice(0, 7)} ya está cerrada; no se pueden registrar más horas en ese mes`, 409);
  const aprobar = b.aprobar === true;
  const { rows } = await query(
    `INSERT INTO horas_extra (trabajador_id,fecha,horas,tipo,motivo,estado,registrado_por,resuelto_por,fecha_resolucion)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [tid, f, horas, tipo, texto(b.motivo, 200), aprobar ? 'APROBADA' : 'PENDIENTE', user.id, aprobar ? user.id : null, aprobar ? new Date() : null]);
  return (await exports.listarHoras({})).find((h) => h.id === rows[0].id);
};

exports.resolverHoras = async (user, id, estado) => {
  if (!['APROBADA', 'RECHAZADA', 'PENDIENTE'].includes(estado)) throw new AppError('Estado inválido');
  const { rows } = await query(
    `UPDATE horas_extra SET estado=$2, resuelto_por=$3, fecha_resolucion=now() WHERE id=$1 AND estado<>'PAGADA' RETURNING id`,
    [id, estado, user.id]);
  if (!rows.length) {
    const ex = (await query('SELECT estado FROM horas_extra WHERE id=$1', [id])).rows[0];
    throw new AppError(ex ? 'Estas horas ya fueron pagadas en una planilla' : 'Registro inexistente', ex ? 409 : 404);
  }
  return { id };
};

exports.eliminarHoras = async (id) => {
  const { rows } = await query(`DELETE FROM horas_extra WHERE id=$1 AND estado<>'PAGADA' RETURNING id`, [id]);
  if (!rows.length) throw new AppError('No existe o ya fue pagado en una planilla', 409);
  return { id };
};

// ---------- planilla ----------
const totales = (filas) => {
  const s = (k) => N.r2(filas.reduce((a, f) => a + Number(f[k]), 0));
  return { trabajadores: filas.length, salarios: s('salario_base'), horas_extra: s('horas_extra'), monto_horas_extra: s('monto_horas_extra'),
    bruto: s('bruto'), isss: s('isss'), afp: s('afp'), renta: s('renta'), deducciones: N.r2(s('isss') + s('afp') + s('renta')), neto: s('neto') };
};

// Cálculo (sin guardar) de la planilla de un mes con las horas extra APROBADAS y aún no pagadas.
// Si ya está cerrada, devuelve lo que quedó registrado.
async function calcular(per, ex = { query }) {
  periodo(per);
  const cerrada = (await ex.query('SELECT id FROM planillas WHERE periodo=$1', [per])).rows[0];
  if (cerrada) {
    const filas = (await ex.query(
      `SELECT trabajador_id, nombre, cargo, salario_base::float8, horas_extra::float8, monto_horas_extra::float8, bruto::float8,
              isss::float8, afp::float8, renta::float8, neto::float8 FROM planilla_detalle WHERE planilla_id=$1 ORDER BY nombre`, [cerrada.id])).rows;
    return { periodo: per, cerrada: true, planilla_id: cerrada.id, filas, totales: totales(filas), horas_ids: [] };
  }
  const inicio = `${per}-01`;
  const horas = (await ex.query(
    `SELECT id, trabajador_id, horas::float8 AS horas, tipo FROM horas_extra
     WHERE estado='APROBADA' AND planilla_id IS NULL AND fecha >= $1::date AND fecha < ($1::date + interval '1 month')`, [inicio])).rows;
  const conHoras = [...new Set(horas.map((h) => h.trabajador_id))];
  const trab = (await ex.query(
    `SELECT id, nombre, cargo, salario_mensual::float8 AS salario_mensual FROM trabajadores
     WHERE fecha_ingreso < ($1::date + interval '1 month') AND (activo OR id = ANY($2::int[])) ORDER BY nombre`, [inicio, conHoras])).rows;
  const filas = trab.map((t) => ({
    trabajador_id: t.id, nombre: t.nombre, cargo: t.cargo, ...N.calcularFila(t, horas.filter((h) => h.trabajador_id === t.id))
  }));
  return { periodo: per, cerrada: false, planilla_id: null, filas, totales: totales(filas), horas_ids: horas.map((h) => h.id) };
}
exports.calcular = (per) => calcular(per);

exports.cerrarPlanilla = (user, per) => withTransaction(async (c) => {
  periodo(per);
  const calc = await calcular(per, c);
  if (calc.cerrada) throw new AppError(`La planilla de ${per} ya está cerrada`, 409);
  if (!calc.filas.length) throw new AppError('No hay trabajadores para esta planilla');
  const t = calc.totales;
  const p = (await c.query(
    `INSERT INTO planillas (periodo,trabajadores,total_salarios,total_horas_extra,total_bruto,total_deducciones,total_neto,cerrada_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [per, t.trabajadores, t.salarios, t.monto_horas_extra, t.bruto, t.deducciones, t.neto, user.id])).rows[0];
  for (const f of calc.filas) {
    await c.query(
      `INSERT INTO planilla_detalle (planilla_id,trabajador_id,nombre,cargo,salario_base,horas_extra,monto_horas_extra,bruto,isss,afp,renta,neto)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [p.id, f.trabajador_id, f.nombre, f.cargo, f.salario_base, f.horas_extra, f.monto_horas_extra, f.bruto, f.isss, f.afp, f.renta, f.neto]);
  }
  if (calc.horas_ids.length)
    await c.query(`UPDATE horas_extra SET estado='PAGADA', planilla_id=$1 WHERE id = ANY($2::int[])`, [p.id, calc.horas_ids]);
  return { ...calc, cerrada: true, planilla_id: p.id };
});

exports.listarPlanillas = async () => (await query(
  `SELECT p.id, p.periodo, p.trabajadores, p.total_salarios::float8, p.total_horas_extra::float8, p.total_bruto::float8,
          p.total_deducciones::float8, p.total_neto::float8, p.created_at, u.nombre AS cerrada_por_nombre
   FROM planillas p JOIN usuarios u ON u.id=p.cerrada_por ORDER BY p.periodo DESC LIMIT 60`)).rows;

exports.obtenerPlanilla = async (id) => {
  const p = (await query('SELECT periodo FROM planillas WHERE id=$1', [id])).rows[0];
  if (!p) throw new AppError('Planilla inexistente', 404);
  return calcular(p.periodo);
};

// Tarjetas de la cabecera
exports.resumen = async () => {
  const t = (await query(`SELECT COUNT(*)::int AS activos, COALESCE(SUM(salario_mensual),0)::float8 AS base FROM trabajadores WHERE activo`)).rows[0];
  const h = (await query(
    `SELECT COALESCE(SUM(horas) FILTER (WHERE estado='PENDIENTE'),0)::float8 AS horas_pendientes,
            COUNT(*) FILTER (WHERE estado='PENDIENTE')::int AS registros_pendientes,
            COALESCE(SUM(horas) FILTER (WHERE estado='APROBADA'),0)::float8 AS horas_por_pagar FROM horas_extra`)).rows[0];
  const u = (await query(`SELECT periodo, total_neto::float8 AS total_neto FROM planillas ORDER BY periodo DESC LIMIT 1`)).rows[0] || null;
  return { trabajadores_activos: t.activos, nomina_base: t.base, ...h, ultima_planilla: u };
};
