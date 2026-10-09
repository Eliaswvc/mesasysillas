// Notificaciones internas (campana) + alertas de inventario por correo.
// REGLA DE ORO: una notificación NUNCA debe romper la operación de negocio. Todo pasa por seguro():
// dentro de una transacción usa un SAVEPOINT, así un fallo aquí (p. ej. tabla sin migrar) no aborta el resto.
const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const mailer = require('../utils/mailer');
const alerta = require('../utils/alerta');

const pool = { query };
const enTx = (db) => typeof db.despuesDeCommit === 'function';

async function seguro(db, fn, porDefecto) {
  try {
    if (enTx(db)) await db.query('SAVEPOINT notif');
    const r = await fn();
    if (enTx(db)) await db.query('RELEASE SAVEPOINT notif');
    return r;
  } catch (e) {
    if (enTx(db)) await db.query('ROLLBACK TO SAVEPOINT notif').catch(() => {});
    console.error('Notificación no registrada:', e.message);
    return porDefecto;
  }
}

// Ejecuta f tras el COMMIT (o de inmediato si no hay transacción). Nunca lanza.
const despues = (db, f) => (enTx(db) ? db.despuesDeCommit(f) : Promise.resolve().then(f).catch((e) => console.error('Tarea de notificación falló:', e.message)));

// Inserta una notificación por destinatario y devuelve los ids que la recibieron.
// Con `clave`, evita duplicados: modo 'activa' (alertas de stock: mientras no se resuelvan) o 'noleida' (por defecto).
async function insertar(db, destinatarios, n, modo = 'noleida') {
  const dup = modo === 'activa' ? 'NOT resuelta' : 'NOT leida';
  const creadas = [];
  for (const uid of destinatarios) {
    const { rows } = await db.query(
      `INSERT INTO notificaciones (usuario_id,tipo,nivel,titulo,mensaje,enlace,clave)
       SELECT $1::int,$2::varchar,$3::varchar,$4::varchar,$5::varchar,$6::varchar,$7::varchar
       WHERE $7::varchar IS NULL OR NOT EXISTS (
         SELECT 1 FROM notificaciones WHERE usuario_id=$1::int AND clave=$7::varchar AND tipo=$2::varchar AND ${dup})
       RETURNING id`,
      [uid, n.tipo, n.nivel || 'info', String(n.titulo).slice(0, 120), String(n.mensaje).slice(0, 400), n.enlace || null, n.clave || null]);
    if (rows.length) creadas.push(uid);
  }
  return creadas;
}
const adminsIds = async (db) => (await db.query(`SELECT id FROM usuarios WHERE rol='ADMIN' AND activo`)).rows.map((r) => r.id);

// ---- creadores genéricos ----
exports.paraAdmins = (db, n, { excluir } = {}) =>
  seguro(db, async () => insertar(db, (await adminsIds(db)).filter((id) => id !== excluir), n), []);
exports.paraUsuario = (db, uid, n) => seguro(db, () => insertar(db, [uid], n), []);

// ---- inventario ----
// Evalúa el stock de un recurso (fila de `inventario` ya actualizada). Crea/cierra alertas y avisa por correo a los admins.
exports.evaluarStock = (db, inv) => seguro(db, async () => {
  if (!inv || inv.estado === 'INACTIVO') return;
  const disp = Number(inv.cantidad_disponible), min = Number(inv.stock_minimo ?? 0);
  const tipo = disp === 0 ? 'STOCK_AGOTADO' : disp <= min ? 'STOCK_BAJO' : null;
  const clave = `stock:${inv.id}`;
  // cierra las alertas que ya no aplican (se repuso stock o pasó de agotado a bajo)
  await db.query(
    `UPDATE notificaciones SET resuelta=TRUE, leida=TRUE
     WHERE clave=$1::varchar AND NOT resuelta AND tipo IN ('STOCK_AGOTADO','STOCK_BAJO') AND tipo IS DISTINCT FROM $2::varchar`, [clave, tipo]);
  if (!tipo) return;
  const agotado = tipo === 'STOCK_AGOTADO', nombre = String(inv.nombre || 'Recurso'), n = nombre.toLowerCase();
  const creadas = await insertar(db, await adminsIds(db), {
    tipo, nivel: agotado ? 'error' : 'warn', clave, enlace: 'inventario.html',
    titulo: agotado ? `Sin inventario de ${n}` : `Stock bajo de ${n}`,
    mensaje: agotado ? `Ya no quedan ${n} disponibles. Repón stock o espera devoluciones.` : `Quedan ${disp} ${n} disponibles (mínimo configurado: ${min}).`
  }, 'activa');
  if (creadas.length) despues(db, () => correoAdmins(creadas, alerta.stock({ agotado, nombre, disponible: disp, minimo: min })));
}, undefined);

async function correoAdmins(ids, { asunto, html, text }) {
  if (!mailer.configurado() || process.env.ALERTAS_POR_CORREO === 'false') return;
  const { rows } = await query('SELECT email FROM usuarios WHERE id = ANY($1::int[]) AND activo', [ids]);
  for (const r of rows) {
    try { await mailer.enviar({ to: r.email, subject: asunto, html, text }); }
    catch (e) { console.error(`Alerta por correo no enviada a ${r.email}:`, e.message); }
  }
}

// Alguien intentó reservar más de lo que hay: avisa a los admins (señal de demanda). Nunca lanza.
exports.reservaSinStock = (user, detalle) => exports.paraAdmins(pool, {
  tipo: 'RESERVA_SIN_STOCK', nivel: 'warn', enlace: 'inventario.html', clave: `sinstock:${user.id}`,
  titulo: 'Reserva rechazada por falta de inventario', mensaje: `${user.nombre || 'Un usuario'} intentó reservar y no hay suficiente (${detalle}).`
}, { excluir: user.id });

exports.prestamoVencido = async (p) => {
  const n = { tipo: 'PRESTAMO_VENCIDO', nivel: 'error', enlace: 'devoluciones.html', clave: `vencido:${p.id}`,
    titulo: `Préstamo #${p.id} vencido`, mensaje: `Pasó la fecha prevista de devolución del préstamo #${p.id}.` };
  await exports.paraUsuario(pool, p.usuario_id, n);
  await exports.paraAdmins(pool, n, { excluir: p.usuario_id });
};

// ---- lectura (campana) ----
let ultimaLimpieza = 0;
exports.listar = async (user) => {
  if (Date.now() - ultimaLimpieza > 3600e3) {          // limpieza oportunista: leídas con más de 30 días
    ultimaLimpieza = Date.now();
    query(`DELETE FROM notificaciones WHERE leida AND created_at < now() - interval '30 days'`).catch(() => {});
  }
  const [{ rows: items }, { rows: [{ n }] }] = await Promise.all([
    query(`SELECT id,tipo,nivel,titulo,mensaje,enlace,leida,resuelta,created_at FROM notificaciones
           WHERE usuario_id=$1 ORDER BY created_at DESC, id DESC LIMIT 40`, [user.id]),
    query('SELECT COUNT(*)::int n FROM notificaciones WHERE usuario_id=$1 AND NOT leida', [user.id])
  ]);
  return { no_leidas: n, items };
};
exports.marcarLeida = async (user, id) => {
  if (!Number.isInteger(id)) throw new AppError('Notificación inválida');
  await query('UPDATE notificaciones SET leida=TRUE WHERE id=$1 AND usuario_id=$2', [id, user.id]);
};
exports.marcarTodas = (user) => query('UPDATE notificaciones SET leida=TRUE WHERE usuario_id=$1 AND NOT leida', [user.id]);
