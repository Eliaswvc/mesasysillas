const crypto = require('crypto');
const { withTransaction, query } = require('../config/db');
const AppError = require('../utils/AppError');
const tarjeta = require('../utils/tarjeta');
const mailer = require('../utils/mailer');
const factura = require('../utils/factura');
const { emisor: emisorCfg } = require('../config/emisor');
const notif = require('./notificaciones.service');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function validarEmail(v) {
  const e = String(v ?? '').trim().toLowerCase();
  if (e.length > 160 || !EMAIL_RE.test(e)) throw new AppError('Correo electrónico inválido: es necesario para enviar la factura');
  return e;
}

// DUI (9 dígitos) o NIT (14 dígitos) del receptor: OPCIONAL (solo si quiere la factura a su nombre). Se guarda solo con dígitos.
function validarDocumento(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const d = s.replace(/\D/g, '');
  if (!/^\d{9}$/.test(d) && !/^\d{14}$/.test(d)) throw new AppError('Documento inválido: ingresa un DUI (9 dígitos) o un NIT (14 dígitos), o déjalo vacío');
  return d;
}

// Comprobante de Crédito Fiscal (DTE-03): solo para contribuyentes. Exige NIT (14 dígitos), NRC, nombre o razón social,
// actividad económica (código CAT-019 y descripción) y dirección del receptor, porque con ellos el cliente se acredita el IVA.
function validarCCF(b) {
  const txt = (v, max, campo) => {
    const t = String(v ?? '').trim().replace(/\s+/g, ' ');
    if (!t) throw new AppError(`Crédito fiscal: falta ${campo}`);
    if (t.length > max) throw new AppError(`Crédito fiscal: ${campo} demasiado largo (máx. ${max})`);
    return t;
  };
  const nit = String(b.documento ?? '').replace(/\D/g, '');
  if (!/^\d{14}$/.test(nit)) throw new AppError('Crédito fiscal: el NIT debe tener 14 dígitos');
  const nrc = String(b.receptor_nrc ?? '').replace(/\D/g, '');
  if (!/^\d{1,8}$/.test(nrc)) throw new AppError('Crédito fiscal: el NRC debe tener de 1 a 8 dígitos');
  const cod = String(b.receptor_cod_actividad ?? '').replace(/\D/g, '');
  if (!/^\d{5,6}$/.test(cod)) throw new AppError('Crédito fiscal: el código de actividad económica debe tener 5 o 6 dígitos');
  return {
    documento: nit, nrc, cod_actividad: cod,
    nombre: txt(b.receptor_nombre, 160, 'el nombre o razón social'),
    actividad: txt(b.receptor_actividad, 160, 'la descripción de la actividad económica'),
    direccion: txt(b.receptor_direccion, 250, 'la dirección')
  };
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
  const emisor = emisorCfg();
  const monto = Number(rv.total);
  if (!(monto > 0)) throw new AppError('La reserva no tiene un monto por pagar', 409);

  const email = validarEmail(body.email);          // 400 si falta o es inválido (antes de intentar el cobro)
  const tipoDte = String(body.tipo_dte ?? '01') === '03' ? '03' : '01';
  const ccf = tipoDte === '03' ? validarCCF(body) : null;
  const documento = ccf ? ccf.documento : validarDocumento(body.documento);
  const t = tarjeta.validar(body);                  // 400 si los datos de la tarjeta son inválidos
  const r = tarjeta.simularPasarela(t.numero);
  const { rows: [pago] } = await c.query(
    // Código de generación (UUID) y número de control correlativo SOLO para pagos aprobados (un rechazo no es un DTE: no consume correlativo).
    // Formato del número de control: DTE-<tipo>-<establecimiento+punto de venta>-<correlativo de 15 dígitos>; cada tipo de DTE lleva su propio correlativo.
    `INSERT INTO pagos (reserva_id,usuario_id,registrado_por,tipo,estado,monto,marca,ultimos4,titular,referencia,motivo,email_factura,
                        codigo_generacion,numero_control,receptor_documento,tipo_dte,
                        receptor_nombre,receptor_nrc,receptor_cod_actividad,receptor_actividad,receptor_direccion)
     VALUES ($1,$2,$3,'PAGO',$4,$5,$6,$7,$8,$9,$10,$11,
             $12, CASE WHEN $13::boolean THEN $14::text || lpad((CASE WHEN $16 = '03' THEN nextval('pagos_dte03_seq') ELSE nextval('pagos_dte_seq') END)::text, 15, '0') END, $15, $16,
             $17,$18,$19,$20,$21) RETURNING *`,
    [id, rv.usuario_id, user.id, r.aprobado ? 'APROBADO' : 'RECHAZADO', monto, t.marca, t.ultimos4, t.titular, referencia('SIM'), r.motivo, email,
     r.aprobado ? crypto.randomUUID().toUpperCase() : null, r.aprobado, `DTE-${tipoDte}-${emisor.codEstablecimiento}${emisor.codPuntoVenta}-`, documento, tipoDte,
     ccf?.nombre ?? null, ccf?.nrc ?? null, ccf?.cod_actividad ?? null, ccf?.actividad ?? null, ccf?.direccion ?? null]);
  if (r.aprobado) {
    await c.query(`UPDATE reservas SET estado_pago='PAGADO', updated_at=now() WHERE id=$1`, [id]);
    if (user.rol !== 'ADMIN')
      await notif.paraAdmins(c, { tipo: 'PAGO_RECIBIDO', nivel: 'ok', enlace: 'pagos.html', clave: `pago:${pago.id}`,
        titulo: `Pago recibido · reserva #${id}`, mensaje: `${user.nombre || 'Un usuario'} pagó $${monto.toFixed(2)} (simulado).` });
  }
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
  await notif.paraUsuario(c, rv.usuario_id, { tipo: 'REEMBOLSO', nivel: 'info', enlace: 'pagos.html', clave: `reembolso:${pago.id}`,
    titulo: `Reembolso de $${Number(orig.monto).toFixed(2)}`, mensaje: `Se reembolsó el pago de la reserva #${rv.id} (simulado).` });
  return pago;
};

exports.listar = async (user) => {
  const admin = user.rol === 'ADMIN';
  const { rows } = await query(
    `SELECT p.*, u.nombre AS usuario_nombre FROM pagos p JOIN usuarios u ON u.id = p.usuario_id
     ${admin ? '' : 'WHERE p.usuario_id = $1'} ORDER BY p.created_at DESC, p.id DESC`, admin ? [] : [user.id]);
  return rows;
};

// Arma la factura (HTML + texto) de un pago aprobado. Lanza si el pago no existe o no es un cobro aprobado.
const armarFactura = async (pagoId) => {
  const { rows: [pago] } = await query(`SELECT * FROM pagos WHERE id=$1 AND tipo='PAGO' AND estado='APROBADO'`, [pagoId]);
  if (!pago) throw new AppError('Pago aprobado no encontrado', 404);
  const [{ rows: [reserva] }, { rows: lineas }, { rows: [cliente] }] = await Promise.all([
    query('SELECT * FROM reservas WHERE id=$1', [pago.reserva_id]),
    query(`SELECT i.tipo, d.cantidad, d.precio_unitario FROM reservas_detalle d JOIN inventario i ON i.id=d.inventario_id
           WHERE d.reserva_id=$1 ORDER BY i.tipo`, [pago.reserva_id]),
    query('SELECT nombre FROM usuarios WHERE id=$1', [pago.usuario_id])
  ]);
  return { pago, factura: factura.construir({ pago, reserva, lineas, cliente }) };
};

// Envía la factura de un pago aprobado al correo indicado al pagar. NUNCA lanza: si falla, el pago sigue válido.
// Devuelve { enviada, email, error? } para que la interfaz pueda avisar y ofrecer reintentar.
exports.enviarFactura = async (pagoId) => {
  let email = null;
  try {
    const { pago, factura: f } = await armarFactura(pagoId);
    email = pago.email_factura;
    if (!email) throw new Error('El pago no tiene correo de factura');
    if (!mailer.configurado()) throw new Error('El servidor no tiene el correo configurado');
    const { proveedor } = await mailer.enviar({ to: email, subject: f.asunto, html: f.html, text: f.text });
    return { enviada: true, email, proveedor };
  } catch (e) {
    console.error('Factura no enviada:', e.message);
    return { enviada: false, email, error: e.message };
  }
};

// Ver / imprimir la factura en pantalla (dueño de la reserva o ADMIN)
exports.verFactura = async (user, pagoId) => {
  const { rows: [p] } = await query(`SELECT usuario_id FROM pagos WHERE id=$1`, [pagoId]);
  if (!p) throw new AppError('Pago inexistente', 404);
  if (user.rol !== 'ADMIN' && p.usuario_id !== user.id) throw new AppError('Sin permisos', 403);
  const { factura: f } = await armarFactura(pagoId);
  return { asunto: f.asunto, numero_control: f.numero_control, codigo_generacion: f.codigo_generacion, html: f.html };
};

// Reenvío manual (dueño de la reserva o ADMIN)
exports.reenviarFactura = async (user, pagoId) => {
  const { rows: [p] } = await query(`SELECT usuario_id FROM pagos WHERE id=$1`, [pagoId]);
  if (!p) throw new AppError('Pago inexistente', 404);
  if (user.rol !== 'ADMIN' && p.usuario_id !== user.id) throw new AppError('Sin permisos', 403);
  return exports.enviarFactura(pagoId);
};
