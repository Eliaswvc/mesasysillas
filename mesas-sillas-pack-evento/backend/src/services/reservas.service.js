const { withTransaction, query } = require('../config/db');
const AppError = require('../utils/AppError');
const inv = require('./inventario.service');
const mov = require('./movimientos.service');
const pagos = require('./pagos.service');
const notif = require('./notificaciones.service');

function validarPayload(b) {
  const { fecha, hora_inicio, hora_fin } = b;
  const mesas = Number(b.mesas || 0), sillas = Number(b.sillas || 0);
  if (!fecha || !hora_inicio || !hora_fin) throw new AppError('Fecha y horas requeridas');
  if (Number.isNaN(Date.parse(fecha))) throw new AppError('Fecha inválida');
  if (hora_fin <= hora_inicio) throw new AppError('La hora de fin debe ser posterior al inicio');
  if (!Number.isInteger(mesas) || !Number.isInteger(sillas) || mesas < 0 || sillas < 0) throw new AppError('Cantidades inválidas');
  if (mesas + sillas === 0) throw new AppError('Debe reservar al menos una unidad');
  return { mesas, sillas };
}

async function items(c, { mesas, sillas }) {
  const { rows } = await c.query(`SELECT id,tipo FROM inventario WHERE tipo IN ('MESA','SILLA')`);
  const byTipo = Object.fromEntries(rows.map(r => [r.tipo, r.id]));
  const out = [];
  if (mesas > 0) out.push({ inventario_id: byTipo.MESA, cantidad: mesas });
  if (sillas > 0) out.push({ inventario_id: byTipo.SILLA, cantidad: sillas });
  return out;
}

// Reserva stock: disponible -> reservada (con bloqueo FOR UPDATE)
async function reservarStock(c, reservaId, userId, estadoAnterior) {
  const { rows: det } = await c.query('SELECT inventario_id,cantidad FROM reservas_detalle WHERE reserva_id=$1', [reservaId]);
  await inv.lockInventario(c, det.map(d => d.inventario_id));
  for (const d of det) {
    await inv.mover(c, d.inventario_id, d.cantidad, 'disponible', 'reservada');
    await mov.registrar(c, { usuario_id: userId, tipo: 'RESERVA', inventario_id: d.inventario_id, cantidad: d.cantidad,
      estado_anterior: estadoAnterior, estado_posterior: 'CONFIRMADA', reserva_id: reservaId, descripcion: `Reserva #${reservaId} confirmada` });
  }
}

// Rechaza (409) pedir más de lo disponible y avisa a los admins. El stock real se vuelve a validar con bloqueo al confirmar.
async function verificarStock(user, q) {
  const { rows } = await query(`SELECT tipo,cantidad_disponible,estado FROM inventario WHERE tipo IN ('MESA','SILLA')`);
  const por = Object.fromEntries(rows.map((i) => [i.tipo, i]));
  const falta = [];
  for (const [tipo, pedido, plural] of [['MESA', q.mesas, 'mesas'], ['SILLA', q.sillas, 'sillas']]) {
    if (pedido <= 0) continue;
    const i = por[tipo], disp = i && i.estado === 'DISPONIBLE' ? i.cantidad_disponible : 0;
    if (pedido > disp) falta.push(disp === 0 ? `${plural}: sin inventario` : `${plural}: pides ${pedido}, quedan ${disp}`);
  }
  if (!falta.length) return;
  const detalle = falta.join(' · ');
  await notif.reservaSinStock(user, detalle);
  throw new AppError(`No hay inventario suficiente (${detalle})`, 409);
}

exports.crear = async (user, body) => {
  await verificarStock(user, validarPayload(body));
  return crearReserva(user, body);
};

const crearReserva = (user, body) => withTransaction(async (c) => {
  const q = validarPayload(body);
  let usuarioId = user.id;
  if (user.rol === 'ADMIN' && body.usuario_id) {
    usuarioId = Number(body.usuario_id);
    const u = await c.query('SELECT 1 FROM usuarios WHERE id=$1 AND activo', [usuarioId]);
    if (!u.rowCount) throw new AppError('Usuario inexistente', 404);
  }
  // USER crea PENDIENTE; ADMIN puede crear directamente CONFIRMADA
  const estado = user.rol === 'ADMIN' && body.confirmar ? 'CONFIRMADA' : 'PENDIENTE';
  const { rows } = await c.query(
    `INSERT INTO reservas (usuario_id,fecha,hora_inicio,hora_fin,estado,observaciones) VALUES ($1,$2,$3,$4,'PENDIENTE',$5) RETURNING *`,
    [usuarioId, body.fecha, body.hora_inicio, body.hora_fin, body.observaciones || null]);
  const reserva = rows[0];
  for (const it of await items(c, q))
    await c.query(`INSERT INTO reservas_detalle (reserva_id,inventario_id,cantidad,precio_unitario)
                   SELECT $1::int,$2::int,$3::int,precio_unitario FROM inventario WHERE id=$2::int`, [reserva.id, it.inventario_id, it.cantidad]);
  // el total lo calcula SIEMPRE el servidor con el precio vigente (queda congelado en cada línea)
  reserva.total = (await c.query(
    `UPDATE reservas SET total=(SELECT COALESCE(SUM(cantidad*precio_unitario),0) FROM reservas_detalle WHERE reserva_id=$1) WHERE id=$1 RETURNING total`,
    [reserva.id])).rows[0].total;
  if (estado === 'CONFIRMADA') {
    await reservarStock(c, reserva.id, user.id, 'PENDIENTE');
    await c.query(`UPDATE reservas SET estado='CONFIRMADA', updated_at=now() WHERE id=$1`, [reserva.id]);
    reserva.estado = 'CONFIRMADA';
  }
  const lugar = `${String(body.fecha).slice(0, 10)} ${String(body.hora_inicio).slice(0, 5)}–${String(body.hora_fin).slice(0, 5)}`;
  if (user.rol !== 'ADMIN')
    await notif.paraAdmins(c, { tipo: 'RESERVA_NUEVA', nivel: 'info', enlace: 'reservas.html', clave: `reserva:${reserva.id}`,
      titulo: `Nueva reserva #${reserva.id}`, mensaje: `${user.nombre || 'Un usuario'} solicitó ${q.mesas} mesas y ${q.sillas} sillas (${lugar}). Falta confirmarla.` });
  else if (usuarioId !== user.id)
    await notif.paraUsuario(c, usuarioId, { tipo: 'RESERVA_REGISTRADA', nivel: 'info', enlace: 'reservas.html', clave: `reserva:${reserva.id}`,
      titulo: `Reserva #${reserva.id} registrada`, mensaje: `Un administrador registró tu reserva (${lugar}). Estado: ${reserva.estado}.` });
  return reserva;
});

exports.confirmar = (user, id) => withTransaction(async (c) => {
  const { rows } = await c.query('SELECT * FROM reservas WHERE id=$1 FOR UPDATE', [id]);
  if (!rows.length) throw new AppError('Reserva inexistente', 404);
  if (rows[0].estado !== 'PENDIENTE') throw new AppError(`No se puede confirmar una reserva ${rows[0].estado}`, 409);
  await reservarStock(c, id, user.id, 'PENDIENTE');
  const r = await c.query(`UPDATE reservas SET estado='CONFIRMADA', updated_at=now() WHERE id=$1 RETURNING *`, [id]);
  await notif.paraUsuario(c, rows[0].usuario_id, { tipo: 'RESERVA_CONFIRMADA', nivel: 'ok', enlace: 'reservas.html', clave: `confirmada:${id}`,
    titulo: `Reserva #${id} confirmada`, mensaje: 'Tu reserva fue confirmada. Si aún no la pagaste, puedes hacerlo desde Reservas.' });
  return r.rows[0];
});

exports.cancelar = (user, id) => withTransaction(async (c) => {
  const { rows } = await c.query('SELECT * FROM reservas WHERE id=$1 FOR UPDATE', [id]);
  const rv = rows[0];
  if (!rv) throw new AppError('Reserva inexistente', 404);
  if (user.rol !== 'ADMIN' && rv.usuario_id !== user.id) throw new AppError('Sin permisos', 403);
  if (!['PENDIENTE', 'CONFIRMADA'].includes(rv.estado)) throw new AppError(`Reserva ya ${rv.estado}`, 409);
  const { rows: det } = await c.query('SELECT inventario_id,cantidad FROM reservas_detalle WHERE reserva_id=$1', [id]);
  if (rv.estado === 'CONFIRMADA') {
    await inv.lockInventario(c, det.map(d => d.inventario_id));
    for (const d of det) await inv.mover(c, d.inventario_id, d.cantidad, 'reservada', 'disponible');
  }
  for (const d of det)
    await mov.registrar(c, { usuario_id: user.id, tipo: 'CANCELACION', inventario_id: d.inventario_id, cantidad: d.cantidad,
      estado_anterior: rv.estado, estado_posterior: 'CANCELADA', reserva_id: id, descripcion: `Reserva #${id} cancelada` });
  await pagos.reembolsar(c, rv, user.id);   // si estaba pagada, genera el reembolso (simulado)
  const r = await c.query(`UPDATE reservas SET estado='CANCELADA', updated_at=now() WHERE id=$1 RETURNING *`, [id]);
  const aviso = { tipo: 'RESERVA_CANCELADA', nivel: 'warn', enlace: 'reservas.html', clave: `cancelada:${id}`, titulo: `Reserva #${id} cancelada` };
  if (user.id !== rv.usuario_id) await notif.paraUsuario(c, rv.usuario_id, { ...aviso, mensaje: 'Un administrador canceló tu reserva. Si ya la habías pagado, se generó el reembolso.' });
  else await notif.paraAdmins(c, { ...aviso, mensaje: `${user.nombre || 'El usuario'} canceló su reserva. Las unidades volvieron al inventario.` }, { excluir: user.id });
  return r.rows[0];
});

exports.listar = async (user) => {
  const where = user.rol === 'ADMIN' ? '' : 'WHERE r.usuario_id = $1';
  const { rows } = await query(
    `SELECT r.*, u.nombre AS usuario_nombre,
       COALESCE(SUM(d.cantidad) FILTER (WHERE i.tipo='MESA'),0)::int AS mesas,
       COALESCE(SUM(d.cantidad) FILTER (WHERE i.tipo='SILLA'),0)::int AS sillas
     FROM reservas r JOIN usuarios u ON u.id=r.usuario_id
     LEFT JOIN reservas_detalle d ON d.reserva_id=r.id LEFT JOIN inventario i ON i.id=d.inventario_id
     ${where} GROUP BY r.id,u.nombre ORDER BY r.fecha DESC, r.id DESC`,
    user.rol === 'ADMIN' ? [] : [user.id]);
  return rows;
};
