const { withTransaction, query } = require('../config/db');
const AppError = require('../utils/AppError');
const inv = require('./inventario.service');
const mov = require('./movimientos.service');
const mant = require('./mantenimiento.service');

exports.listar = async (user) => {
  const where = user.rol === 'ADMIN' ? '' : 'WHERE p.usuario_id=$1';
  const { rows } = await query(
    `SELECT dv.*, p.usuario_id, u.nombre AS usuario_nombre, r.nombre AS registrado_por_nombre,
       COALESCE(SUM(dd.cantidad) FILTER (WHERE i.tipo='MESA'),0)::int AS mesas,
       COALESCE(SUM(dd.cantidad) FILTER (WHERE i.tipo='SILLA'),0)::int AS sillas,
       COALESCE(SUM(dd.cantidad_danada),0)::int AS danadas,
       COALESCE(SUM(dd.cantidad_danada) FILTER (WHERE i.tipo='MESA'),0)::int AS mesas_danadas,
       COALESCE(SUM(dd.cantidad_danada) FILTER (WHERE i.tipo='SILLA'),0)::int AS sillas_danadas
     FROM devoluciones dv JOIN prestamos p ON p.id=dv.prestamo_id
     JOIN usuarios u ON u.id=p.usuario_id JOIN usuarios r ON r.id=dv.registrado_por
     LEFT JOIN devoluciones_detalle dd ON dd.devolucion_id=dv.id LEFT JOIN inventario i ON i.id=dd.inventario_id
     ${where} GROUP BY dv.id,p.usuario_id,u.nombre,r.nombre ORDER BY dv.id DESC`,
    user.rol === 'ADMIN' ? [] : [user.id]);
  return rows;
};

exports.crear = (user, b) => withTransaction(async (c) => {
  const prestamoId = Number(b.prestamo_id);
  const req = { MESA: Number(b.mesas || 0), SILLA: Number(b.sillas || 0) };
  if (!Number.isInteger(prestamoId)) throw new AppError('Préstamo requerido');
  if (!Number.isInteger(req.MESA) || !Number.isInteger(req.SILLA) || req.MESA < 0 || req.SILLA < 0) throw new AppError('Cantidades inválidas');
  if (req.MESA + req.SILLA === 0) throw new AppError('Debe devolver al menos una unidad');
  // unidades que vuelven dañadas: no cuentan como disponibles, pasan a mantenimiento
  const dan = { MESA: Number(b.mesas_danadas || 0), SILLA: Number(b.sillas_danadas || 0) };
  for (const t of ['MESA', 'SILLA']) {
    if (!Number.isInteger(dan[t]) || dan[t] < 0) throw new AppError('Cantidad de unidades dañadas inválida');
    if (dan[t] > req[t]) throw new AppError(`No puede haber más ${t === 'MESA' ? 'mesas' : 'sillas'} dañadas que devueltas`);
  }

  const pr = await c.query('SELECT * FROM prestamos WHERE id=$1 FOR UPDATE', [prestamoId]);
  if (!pr.rowCount) throw new AppError('Préstamo inexistente', 404);
  const p = pr.rows[0];
  if (p.estado === 'DEVUELTO') throw new AppError('El préstamo ya fue devuelto por completo', 409);

  const { rows: det } = await c.query(
    `SELECT d.*, i.tipo FROM prestamos_detalle d JOIN inventario i ON i.id=d.inventario_id
     WHERE d.prestamo_id=$1 ORDER BY d.inventario_id FOR UPDATE OF d`, [prestamoId]);
  const bloqueados = await inv.lockInventario(c, det.map(d => d.inventario_id));

  for (const tipo of ['MESA', 'SILLA']) {
    if (req[tipo] === 0) continue;
    const d = det.find(x => x.tipo === tipo);
    if (!d) throw new AppError(`El préstamo no incluye ${tipo === 'MESA' ? 'mesas' : 'sillas'}`);
    const pend = d.cantidad_prestada - d.cantidad_devuelta;
    if (req[tipo] > pend) throw new AppError(`No puede devolver más de lo pendiente (${pend} ${tipo === 'MESA' ? 'mesas' : 'sillas'})`, 409);
  }

  const dv = (await c.query(
    'INSERT INTO devoluciones (prestamo_id,registrado_por,observaciones) VALUES ($1,$2,$3) RETURNING *',
    [prestamoId, user.id, b.observaciones || null])).rows[0];

  const movs = [];
  const danadas = [];
  for (const tipo of ['MESA', 'SILLA']) {
    const cant = req[tipo], malas = dan[tipo];
    if (cant === 0) continue;
    const d = det.find(x => x.tipo === tipo);
    await c.query('INSERT INTO devoluciones_detalle (devolucion_id,inventario_id,cantidad,cantidad_danada) VALUES ($1,$2,$3,$4)', [dv.id, d.inventario_id, cant, malas]);
    await c.query('UPDATE prestamos_detalle SET cantidad_devuelta = cantidad_devuelta + $2 WHERE id=$1', [d.id, cant]);
    // primero las buenas (suben el disponible), luego las dañadas (van a mantenimiento)
    if (cant - malas > 0) await inv.mover(c, d.inventario_id, cant - malas, 'prestada', 'disponible');
    if (malas > 0) {
      await inv.mover(c, d.inventario_id, malas, 'prestada', 'mantenimiento');
      danadas.push({ inventarioId: d.inventario_id, cantidad: malas, nombre: bloqueados.find(r => r.id === d.inventario_id).nombre });
    }
    movs.push({ inventario_id: d.inventario_id, cantidad: cant, malas });
  }

  const left = (await c.query('SELECT COALESCE(SUM(cantidad_prestada-cantidad_devuelta),0)::int AS n FROM prestamos_detalle WHERE prestamo_id=$1', [prestamoId])).rows[0].n;
  let estado;
  if (left === 0) estado = 'DEVUELTO';
  else estado = new Date(p.fecha_prevista_devolucion) < new Date() ? 'VENCIDO' : 'PARCIALMENTE_DEVUELTO';
  await c.query('UPDATE prestamos SET estado=$2, updated_at=now() WHERE id=$1', [prestamoId, estado]);

  for (const m of movs)
    await mov.registrar(c, { usuario_id: user.id, tipo: left === 0 ? 'DEVOLUCION' : 'DEVOLUCION_PARCIAL', inventario_id: m.inventario_id,
      cantidad: m.cantidad, estado_anterior: p.estado, estado_posterior: estado, prestamo_id: prestamoId, devolucion_id: dv.id,
      descripcion: `Devolución #${dv.id} del préstamo #${prestamoId}` + (m.malas ? ` (${m.malas} dañada${m.malas === 1 ? '' : 's'})` : '') });
  for (const dn of danadas) await mant.registrarDanadas(c, user, { ...dn, devolucionId: dv.id, observaciones: b.observaciones });

  return { ...dv, estado_prestamo: estado, unidades_pendientes: left, unidades_danadas: danadas.reduce((a, x) => a + x.cantidad, 0) };
});
