const { withTransaction, query } = require('../config/db');
const AppError = require('../utils/AppError');
const inv = require('./inventario.service');
const mov = require('./movimientos.service');
const items = require('../utils/items');
const notif = require('./notificaciones.service');

// Marca como VENCIDO lo que pasó de fecha y avisa (solo la primera vez: ya no vuelve a cumplir la condición)
const marcarVencidos = async () => {
  const { rows } = await query(
    `UPDATE prestamos SET estado='VENCIDO', updated_at=now()
     WHERE estado IN ('ACTIVO','PARCIALMENTE_DEVUELTO') AND fecha_prevista_devolucion < now() RETURNING id,usuario_id`);
  for (const p of rows) await notif.prestamoVencido(p);
};
exports.marcarVencidos = marcarVencidos;

const SELECT = `
  SELECT p.*, u.nombre AS usuario_nombre,
    COALESCE(SUM(d.cantidad_prestada) FILTER (WHERE i.tipo='MESA'),0)::int AS mesas_prestadas,
    COALESCE(SUM(d.cantidad_prestada) FILTER (WHERE i.tipo='SILLA'),0)::int AS sillas_prestadas,
    COALESCE(SUM(d.cantidad_prestada-d.cantidad_devuelta) FILTER (WHERE i.tipo='MESA'),0)::int AS mesas_pendientes,
    COALESCE(SUM(d.cantidad_prestada-d.cantidad_devuelta) FILTER (WHERE i.tipo='SILLA'),0)::int AS sillas_pendientes
  FROM prestamos p JOIN usuarios u ON u.id=p.usuario_id
  LEFT JOIN prestamos_detalle d ON d.prestamo_id=p.id LEFT JOIN inventario i ON i.id=d.inventario_id`;

exports.listar = async (user) => {
  await marcarVencidos();
  const where = user.rol === 'ADMIN' ? '' : 'WHERE p.usuario_id=$1';
  const { rows } = await query(`${SELECT} ${where} GROUP BY p.id,u.nombre ORDER BY p.id DESC`, user.rol === 'ADMIN' ? [] : [user.id]);
  return rows;
};

exports.obtener = async (user, id) => {
  await marcarVencidos();
  const { rows } = await query(`${SELECT} WHERE p.id=$1 GROUP BY p.id,u.nombre`, [id]);
  if (!rows.length) throw new AppError('Préstamo inexistente', 404);
  if (user.rol !== 'ADMIN' && rows[0].usuario_id !== user.id) throw new AppError('Sin permisos', 403);
  return rows[0];
};

exports.crear = (user, b) => withTransaction(async (c) => {
  const fechaPrev = new Date(b.fecha_prevista_devolucion);
  if (!b.fecha_prevista_devolucion || Number.isNaN(fechaPrev.getTime())) throw new AppError('Fecha prevista inválida');
  if (fechaPrev <= new Date()) throw new AppError('La fecha prevista debe ser posterior al préstamo');

  let usuarioId, lista, reservaId = null;
  if (b.reserva_id) {
    reservaId = Number(b.reserva_id);
    const r = await c.query('SELECT * FROM reservas WHERE id=$1 FOR UPDATE', [reservaId]);
    if (!r.rowCount) throw new AppError('Reserva inexistente', 404);
    if (r.rows[0].estado !== 'CONFIRMADA') throw new AppError(`La reserva está ${r.rows[0].estado}; debe estar CONFIRMADA`, 409);
    if ((await c.query('SELECT 1 FROM prestamos WHERE reserva_id=$1', [reservaId])).rowCount) throw new AppError('La reserva ya tiene préstamo', 409);
    usuarioId = r.rows[0].usuario_id;
    lista = (await c.query('SELECT inventario_id,cantidad FROM reservas_detalle WHERE reserva_id=$1', [reservaId])).rows;
  } else {
    usuarioId = Number(b.usuario_id);
    if (!(await c.query('SELECT 1 FROM usuarios WHERE id=$1 AND activo', [usuarioId])).rowCount) throw new AppError('Usuario inexistente', 404);
    lista = await items(c, b.mesas, b.sillas);
  }

  await inv.lockInventario(c, lista.map(l => l.inventario_id));
  const from = reservaId ? 'reservada' : 'disponible';
  const { rows } = await c.query(
    `INSERT INTO prestamos (usuario_id,reserva_id,registrado_por,fecha_prevista_devolucion,estado,observaciones)
     VALUES ($1,$2,$3,$4,'ACTIVO',$5) RETURNING *`,
    [usuarioId, reservaId, user.id, fechaPrev.toISOString(), b.observaciones || null]);
  const p = rows[0];
  for (const l of lista) {
    await inv.mover(c, l.inventario_id, l.cantidad, from, 'prestada');
    await c.query('INSERT INTO prestamos_detalle (prestamo_id,inventario_id,cantidad_prestada) VALUES ($1,$2,$3)', [p.id, l.inventario_id, l.cantidad]);
    await mov.registrar(c, { usuario_id: user.id, tipo: 'PRESTAMO', inventario_id: l.inventario_id, cantidad: l.cantidad,
      estado_anterior: reservaId ? 'CONFIRMADA' : null, estado_posterior: 'ACTIVO', reserva_id: reservaId, prestamo_id: p.id,
      descripcion: `Préstamo #${p.id} registrado` });
  }
  if (reservaId) await c.query(`UPDATE reservas SET estado='FINALIZADA', updated_at=now() WHERE id=$1`, [reservaId]);
  return p;
});

exports.actualizar = (user, id, b) => withTransaction(async (c) => {
  const { rows } = await c.query('SELECT * FROM prestamos WHERE id=$1 FOR UPDATE', [id]);
  const p = rows[0];
  if (!p) throw new AppError('Préstamo inexistente', 404);
  if (p.estado === 'DEVUELTO') throw new AppError('El préstamo ya fue devuelto por completo', 409);
  const f = b.fecha_prevista_devolucion ? new Date(b.fecha_prevista_devolucion) : new Date(p.fecha_prevista_devolucion);
  if (Number.isNaN(f.getTime())) throw new AppError('Fecha inválida');
  if (f <= new Date(p.fecha_prestamo)) throw new AppError('La fecha de devolución no puede ser anterior al préstamo');
  let estado = p.estado;
  if (estado === 'VENCIDO' && f > new Date()) {
    const pend = await c.query('SELECT SUM(cantidad_devuelta)::int AS dev FROM prestamos_detalle WHERE prestamo_id=$1', [id]);
    estado = pend.rows[0].dev > 0 ? 'PARCIALMENTE_DEVUELTO' : 'ACTIVO';
  }
  const r = await c.query(
    `UPDATE prestamos SET fecha_prevista_devolucion=$2, observaciones=COALESCE($3,observaciones), estado=$4, updated_at=now() WHERE id=$1 RETURNING *`,
    [id, f.toISOString(), b.observaciones ?? null, estado]);
  await mov.registrar(c, { usuario_id: user.id, tipo: 'MODIFICACION', prestamo_id: id, estado_anterior: p.estado, estado_posterior: estado,
    descripcion: `Préstamo #${id} modificado (nueva fecha prevista)` });
  return r.rows[0];
});
