const { query } = require('../config/db');
const { marcarVencidos } = require('./prestamos.service');

exports.obtener = async (user) => {
  await marcarVencidos();
  const inventario = (await query('SELECT * FROM inventario ORDER BY id')).rows;
  const admin = user.rol === 'ADMIN';
  const p = admin ? [] : [user.id];
  const f = admin ? '' : ' AND usuario_id=$1';
  const one = async (sql) => (await query(sql, p)).rows[0].n;
  const operaciones = {
    reservas_pendientes: await one(`SELECT COUNT(*)::int n FROM reservas WHERE estado='PENDIENTE'${f}`),
    prestamos_activos: await one(`SELECT COUNT(*)::int n FROM prestamos WHERE estado IN ('ACTIVO','PARCIALMENTE_DEVUELTO')${f}`),
    prestamos_vencidos: await one(`SELECT COUNT(*)::int n FROM prestamos WHERE estado='VENCIDO'${f}`),
    devoluciones_pendientes: await one(`SELECT COUNT(*)::int n FROM prestamos WHERE estado IN ('ACTIVO','PARCIALMENTE_DEVUELTO','VENCIDO')${f}`)
  };
  const finanzas = {
    cobrado: await one(`SELECT COALESCE(SUM(monto),0)::float8 n FROM pagos WHERE tipo='PAGO' AND estado='APROBADO'${f}`),
    reembolsado: await one(`SELECT COALESCE(SUM(monto),0)::float8 n FROM pagos WHERE tipo='REEMBOLSO' AND estado='APROBADO'${f}`),
    por_cobrar: await one(`SELECT COALESCE(SUM(total),0)::float8 n FROM reservas WHERE estado IN ('PENDIENTE','CONFIRMADA') AND estado_pago='PENDIENTE'${f}`)
  };
  const rowsQ = async (sql) => (await query(sql, p)).rows;
  const graficas = {
    prestamos_por_estado: await rowsQ(`SELECT estado::text AS estado, COUNT(*)::int AS n FROM prestamos WHERE TRUE${f} GROUP BY estado`),
    reservas_por_estado: await rowsQ(`SELECT estado::text AS estado, COUNT(*)::int AS n FROM reservas WHERE TRUE${f} GROUP BY estado`),
    actividad_7d: admin ? (await query(
      `SELECT to_char(d,'DD/MM') AS dia,
         COALESCE(SUM(m.cantidad) FILTER (WHERE m.tipo='RESERVA'),0)::int AS reservas,
         COALESCE(SUM(m.cantidad) FILTER (WHERE m.tipo='PRESTAMO'),0)::int AS prestamos,
         COALESCE(SUM(m.cantidad) FILTER (WHERE m.tipo IN ('DEVOLUCION','DEVOLUCION_PARCIAL')),0)::int AS devoluciones
       FROM generate_series(current_date-6, current_date, interval '1 day') d
       LEFT JOIN movimientos m ON m.created_at::date = d::date
       GROUP BY d ORDER BY d`)).rows : []
  };
  return { inventario, operaciones, finanzas, graficas, alcance: admin ? 'global' : 'personal' };
};
