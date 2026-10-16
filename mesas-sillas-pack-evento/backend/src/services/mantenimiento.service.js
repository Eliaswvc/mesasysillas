const { withTransaction, query } = require('../config/db');
const AppError = require('../utils/AppError');
const inv = require('./inventario.service');
const mov = require('./movimientos.service');
const notif = require('./notificaciones.service');

const MOTIVOS = ['DANADO', 'REPARACION', 'LIMPIEZA', 'REVISION', 'OTRO'];
const ETIQUETA = { DANADO: 'dañado', REPARACION: 'reparación', LIMPIEZA: 'limpieza', REVISION: 'revisión', OTRO: 'otro motivo' };

const entero = (v, campo) => {
  const n = Number(v ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > 1000000) throw new AppError(`${campo} inválida`);
  return n;
};
const costo = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 99999999) throw new AppError('Costo inválido');
  return Math.round(n * 100) / 100;
};

exports.MOTIVOS = MOTIVOS;

// Lista los registros de mantenimiento (estado: EN_CURSO | CERRADO | undefined = todos)
exports.listar = async ({ estado } = {}) => {
  if (estado && !['EN_CURSO', 'CERRADO'].includes(estado)) throw new AppError('Estado inválido');
  const { rows } = await query(
    `SELECT m.*, (m.cantidad - m.cantidad_reparada - m.cantidad_descartada)::int AS pendientes,
            i.tipo AS recurso, i.nombre AS recurso_nombre, u.nombre AS registrado_por_nombre
     FROM mantenimientos m JOIN inventario i ON i.id=m.inventario_id JOIN usuarios u ON u.id=m.registrado_por
     WHERE ($1::text IS NULL OR m.estado=$1)
     ORDER BY (m.estado='EN_CURSO') DESC, m.id DESC LIMIT 300`, [estado || null]);
  return rows;
};

// Resumen para el dashboard / inventario: unidades fuera de servicio por recurso
exports.resumen = async () => (await query(
  `SELECT i.id AS inventario_id, i.tipo, i.nombre, i.cantidad_mantenimiento AS en_mantenimiento,
          COALESCE((SELECT SUM(cantidad_descartada) FROM mantenimientos WHERE inventario_id=i.id),0)::int AS dadas_de_baja,
          COALESCE((SELECT SUM(costo) FROM mantenimientos WHERE inventario_id=i.id),0)::float8 AS costo_total
   FROM inventario i ORDER BY i.id`)).rows;

// Envía unidades DISPONIBLES a mantenimiento (no se pueden reservar mientras estén ahí)
exports.enviar = (user, b) => withTransaction(async (c) => {
  const invId = Number(b.inventario_id), cant = Number(b.cantidad), motivo = String(b.motivo || '');
  if (!Number.isInteger(invId)) throw new AppError('Recurso requerido');
  if (!Number.isInteger(cant) || cant <= 0) throw new AppError('Cantidad inválida');
  if (!MOTIVOS.includes(motivo)) throw new AppError('Motivo inválido');
  const [recurso] = await inv.lockInventario(c, [invId]);
  if (cant > recurso.cantidad_disponible)
    throw new AppError(`Solo hay ${recurso.cantidad_disponible} ${recurso.nombre.toLowerCase()} disponibles para enviar a mantenimiento`, 409);
  await inv.mover(c, invId, cant, 'disponible', 'mantenimiento');
  const m = (await c.query(
    `INSERT INTO mantenimientos (inventario_id,cantidad,motivo,descripcion,registrado_por) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [invId, cant, motivo, (b.descripcion || '').trim() || null, user.id])).rows[0];
  await mov.registrar(c, { usuario_id: user.id, tipo: 'MANTENIMIENTO', inventario_id: invId, cantidad: cant,
    estado_anterior: 'DISPONIBLE', estado_posterior: 'MANTENIMIENTO',
    descripcion: `${cant} ${recurso.nombre} a mantenimiento #${m.id} (${ETIQUETA[motivo]})${m.descripcion ? ': ' + m.descripcion : ''}` });
  return m;
});

// Resuelve unidades de un mantenimiento: reparadas vuelven a disponible; descartadas se dan de baja (baja el total)
exports.resolver = (user, id, b) => withTransaction(async (c) => {
  if (!Number.isInteger(id)) throw new AppError('Mantenimiento inválido');
  const rep = entero(b.reparadas, 'Cantidad reparada'), des = entero(b.descartadas, 'Cantidad descartada');
  if (rep + des === 0) throw new AppError('Indica cuántas unidades se repararon o se dan de baja');
  const extra = costo(b.costo);

  const { rows } = await c.query('SELECT * FROM mantenimientos WHERE id=$1 FOR UPDATE', [id]);
  if (!rows.length) throw new AppError('Mantenimiento inexistente', 404);
  const m = rows[0];
  if (m.estado === 'CERRADO') throw new AppError('Este mantenimiento ya está cerrado', 409);
  const pend = m.cantidad - m.cantidad_reparada - m.cantidad_descartada;
  if (rep + des > pend) throw new AppError(`Solo quedan ${pend} unidades pendientes en este mantenimiento`, 409);

  const [recurso] = await inv.lockInventario(c, [m.inventario_id]);
  let ultima = recurso;
  if (rep > 0) ultima = await inv.mover(c, m.inventario_id, rep, 'mantenimiento', 'disponible');
  if (des > 0) {
    const r = await c.query(
      `UPDATE inventario SET cantidad_mantenimiento = cantidad_mantenimiento - $2, cantidad_total = cantidad_total - $2, updated_at = now()
       WHERE id=$1 AND cantidad_mantenimiento >= $2 RETURNING *`, [m.inventario_id, des]);
    if (!r.rowCount) throw new AppError('Cantidad insuficiente en mantenimiento', 409);
    ultima = r.rows[0];
  }
  const quedan = pend - rep - des;
  const upd = (await c.query(
    `UPDATE mantenimientos SET cantidad_reparada=cantidad_reparada+$2, cantidad_descartada=cantidad_descartada+$3, costo=costo+$4::numeric,
       estado=$5::varchar, fecha_cierre=CASE WHEN $5::varchar='CERRADO' THEN now() ELSE NULL END,
       descripcion=CASE WHEN $6::text IS NULL THEN descripcion ELSE COALESCE(descripcion||E'\n','')||$6::text END
     WHERE id=$1 RETURNING *`,
    [id, rep, des, extra, quedan === 0 ? 'CERRADO' : 'EN_CURSO', (b.observaciones || '').trim() || null])).rows[0];

  const partes = [];
  if (rep) partes.push(`${rep} reparada${rep === 1 ? '' : 's'} (vuelven a disponible)`);
  if (des) partes.push(`${des} dada${des === 1 ? '' : 's'} de baja`);
  await mov.registrar(c, { usuario_id: user.id, tipo: 'MANTENIMIENTO', inventario_id: m.inventario_id, cantidad: rep + des,
    estado_anterior: 'MANTENIMIENTO', estado_posterior: rep && !des ? 'DISPONIBLE' : des && !rep ? 'BAJA' : 'DISPONIBLE/BAJA',
    descripcion: `Mantenimiento #${id} de ${recurso.nombre}: ${partes.join(' y ')}${extra ? `; costo ${extra.toFixed(2)} USD` : ''}${quedan === 0 ? '. Cerrado' : `. Quedan ${quedan} en mantenimiento`}` });
  await notif.evaluarStock(c, ultima);   // al volver unidades a disponible se cierran las alertas de stock; al dar de baja puede abrirse una
  return upd;
});

// Registra unidades dañadas detectadas al devolver (las llama devoluciones.service dentro de su transacción)
exports.registrarDanadas = async (c, user, { inventarioId, cantidad, devolucionId, nombre, observaciones }) => {
  const m = (await c.query(
    `INSERT INTO mantenimientos (inventario_id,cantidad,motivo,descripcion,devolucion_id,registrado_por) VALUES ($1,$2,'DANADO',$3,$4,$5) RETURNING *`,
    [inventarioId, cantidad, (observaciones || '').trim() || null, devolucionId, user.id])).rows[0];
  await mov.registrar(c, { usuario_id: user.id, tipo: 'MANTENIMIENTO', inventario_id: inventarioId, cantidad,
    estado_anterior: 'PRESTADA', estado_posterior: 'MANTENIMIENTO', devolucion_id: devolucionId,
    descripcion: `${cantidad} ${nombre} devuelta${cantidad === 1 ? '' : 's'} dañada${cantidad === 1 ? '' : 's'} en la devolución #${devolucionId}; pasan a mantenimiento #${m.id}` });
  return m;
};
