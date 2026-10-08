const crypto = require('crypto');
const { withTransaction, query } = require('../config/db');
const AppError = require('../utils/AppError');
const tarjeta = require('../utils/tarjeta');

const referencia = (prefijo) => `${prefijo}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

// Pago simulado. El monto SIEMPRE sale de la reserva (nunca del cliente).
// Un pago rechazado también se registra (queda auditado) y se devuelve para que el controlador responda 402.
exports.pagar = (user, body) => withTransaction(async (c) => {
  const id = Number(body.reserva_id);
  if (!Number.isInteger(id)) throw new AppError('reserva_id inválido');
  const { rows } = await c.query('SELECT * FROM reservas WHERE id=$1 FOR UPDATE', [id]);
  const rv = rows[0];
  if (!rv) throw new AppError('Reserva inexistente', 404);
  if (user.rol !== 'ADMIN' && rv.usuario_id !== user.id) throw new AppError('Sin permisos', 403);
  if (!['PENDIENTE', 'CONFIRMADA'].includes(rv.estado)) throw new AppError(`No se puede pagar una reserva ${rv.estado}`, 409);
  if (rv.estado_pago === 'PAGADO') throw new AppError('Esta reserva ya está pagada', 409);
  const monto = Number(rv.total);
  if (!(monto > 0)) throw new AppError('La reserva no tiene un monto por pagar', 409);

  const t = tarjeta.validar(body);                  // 400 si los datos de la tarjeta son inválidos
  const r = tarjeta.simularPasarela(t.numero);
  const { rows: [pago] } = await c.query(
    `INSERT INTO pagos (reserva_id,usuario_id,registrado_por,tipo,estado,monto,marca,ultimos4,titular,referencia,motivo)
     VALUES ($1,$2,$3,'PAGO',$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [id, rv.usuario_id, user.id, r.aprobado ? 'APROBADO' : 'RECHAZADO', monto, t.marca, t.ultimos4, t.titular, referencia('SIM'), r.motivo]);
  if (r.aprobado) await c.query(`UPDATE reservas SET estado_pago='PAGADO', updated_at=now() WHERE id=$1`, [id]);
  return pago;
});

// Reembolso simulado (lo llama la cancelación de una reserva pagada). Corre dentro de la transacción de quien lo llama.
exports.reembolsar = async (c, rv, actorId) => {
  if (rv.estado_pago !== 'PAGADO') return null;
  const { rows: [orig] } = await c.query(`SELECT * FROM pagos WHERE reserva_id=$1 AND tipo='PAGO' AND estado='APROBADO'`, [rv.id]);
  if (!orig) return null;
  const { rows: [pago] } = await c.query(
    `INSERT INTO pagos (reserva_id,usuario_id,registrado_por,tipo,estado,monto,marca,ultimos4,titular,referencia,motivo)
     VALUES ($1,$2,$3,'REEMBOLSO','APROBADO',$4,$5,$6,$7,$8,'Reserva cancelada') RETURNING *`,
    [rv.id, rv.usuario_id, actorId, orig.monto, orig.marca, orig.ultimos4, orig.titular, referencia('RF')]);
  await c.query(`UPDATE reservas SET estado_pago='REEMBOLSADO', updated_at=now() WHERE id=$1`, [rv.id]);
  return pago;
};

exports.listar = async (user) => {
  const admin = user.rol === 'ADMIN';
  const { rows } = await query(
    `SELECT p.*, u.nombre AS usuario_nombre FROM pagos p JOIN usuarios u ON u.id = p.usuario_id
     ${admin ? '' : 'WHERE p.usuario_id = $1'} ORDER BY p.created_at DESC, p.id DESC`, admin ? [] : [user.id]);
  return rows;
};
