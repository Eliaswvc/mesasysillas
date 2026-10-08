const crypto = require('crypto');
const { withTransaction, query } = require('../config/db');
const AppError = require('../utils/AppError');
const tarjeta = require('../utils/tarjeta');
const mailer = require('../utils/mailer');
const factura = require('../utils/factura');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function validarEmail(v) {
  const e = String(v ?? '').trim().toLowerCase();
  if (e.length > 160 || !EMAIL_RE.test(e)) throw new AppError('Correo electrónico inválido: es necesario para enviar la factura');
  return e;
}

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

  const email = validarEmail(body.email);          // 400 si falta o es inválido (antes de intentar el cobro)
  const t = tarjeta.validar(body);                  // 400 si los datos de la tarjeta son inválidos
  const r = tarjeta.simularPasarela(t.numero);
  const { rows: [pago] } = await c.query(
    `INSERT INTO pagos (reserva_id,usuario_id,registrado_por,tipo,estado,monto,marca,ultimos4,titular,referencia,motivo,email_factura)
     VALUES ($1,$2,$3,'PAGO',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [id, rv.usuario_id, user.id, r.aprobado ? 'APROBADO' : 'RECHAZADO', monto, t.marca, t.ultimos4, t.titular, referencia('SIM'), r.motivo, email]);
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

// Envía la factura de un pago aprobado al correo indicado al pagar. NUNCA lanza: si falla, el pago sigue válido.
// Devuelve { enviada, email, error? } para que la interfaz pueda avisar y ofrecer reintentar.
exports.enviarFactura = async (pagoId) => {
  let email = null;
  try {
    const { rows: [pago] } = await query(`SELECT * FROM pagos WHERE id=$1 AND tipo='PAGO' AND estado='APROBADO'`, [pagoId]);
    if (!pago) throw new Error('Pago no encontrado');
    email = pago.email_factura;
    if (!email) throw new Error('El pago no tiene correo de factura');
    if (!mailer.configurado()) throw new Error('El servidor no tiene el correo configurado');
    const [{ rows: [reserva] }, { rows: lineas }, { rows: [cliente] }] = await Promise.all([
      query('SELECT * FROM reservas WHERE id=$1', [pago.reserva_id]),
      query(`SELECT i.tipo, d.cantidad, d.precio_unitario FROM reservas_detalle d JOIN inventario i ON i.id=d.inventario_id
             WHERE d.reserva_id=$1 ORDER BY i.tipo`, [pago.reserva_id]),
      query('SELECT nombre FROM usuarios WHERE id=$1', [pago.usuario_id])
    ]);
    const f = factura.construir({ pago, reserva, lineas, cliente });
    await mailer.enviar({ to: email, subject: f.asunto, html: f.html, text: f.text });
    return { enviada: true, email };
  } catch (e) {
    console.error('Factura no enviada:', e.message);
    return { enviada: false, email, error: e.message };
  }
};

// Reenvío manual (dueño de la reserva o ADMIN)
exports.reenviarFactura = async (user, pagoId) => {
  const { rows: [p] } = await query(`SELECT usuario_id FROM pagos WHERE id=$1`, [pagoId]);
  if (!p) throw new AppError('Pago inexistente', 404);
  if (user.rol !== 'ADMIN' && p.usuario_id !== user.id) throw new AppError('Sin permisos', 403);
  return exports.enviarFactura(pagoId);
};
