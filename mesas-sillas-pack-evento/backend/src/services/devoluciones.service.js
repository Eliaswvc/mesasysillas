const { withTransaction, query } = require('../config/db');
const AppError = require('../utils/AppError');
const inv = require('./inventario.service');
const mov = require('./movimientos.service');

exports.listar = async (user) => {
  const where = user.rol === 'ADMIN' ? '' : 'WHERE p.usuario_id=$1';
  const { rows } = await query(
    `SELECT dv.*, p.usuario_id, u.nombre AS usuario_nombre, r.nombre AS registrado_por_nombre,
       COALESCE(SUM(dd.cantidad) FILTER (WHERE i.tipo='MESA'),0)::int AS mesas,
       COALESCE(SUM(dd.cantidad) FILTER (WHERE i.tipo='SILLA'),0)::int AS sillas
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

  const pr = await c.query('SELECT * FROM prestamos WHERE id=$1 FOR UPDATE', [prestamoId]);
  if (!pr.rowCount) throw new AppError('Préstamo inexistente', 404);
  const p = pr.rows[0];
  if (p.estado === 'DEVUELTO') throw new AppError('El préstamo ya fue devuelto por completo', 409);

  const { rows: det } = await c.query(
    `SELECT d.*, i.tipo FROM prestamos_detalle d JOIN inventario i ON i.id=d.inventario_id
     WHERE d.prestamo_id=$1 ORDER BY d.inventario_id FOR UPDATE OF d`, [prestamoId]);
  await inv.lockInventario(c, det.map(d => d.inventario_id));

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
  for (const tipo of ['MESA', 'SILLA']) {
    const cant = req[tipo];
    if (cant === 0) continue;
    const d = det.find(x => x.tipo === tipo);
    await c.query('INSERT INTO devoluciones_detalle (devolucion_id,inventario_id,cantidad) VALUES ($1,$2,$3)', [dv.id, d.inventario_id, cant]);
    await c.query('UPDATE prestamos_detalle SET cantidad_devuelta = cantidad_devuelta + $2 WHERE id=$1', [d.id, cant]);
    await inv.mover(c, d.inventario_id, cant, 'prestada', 'disponible');
    movs.push({ inventario_id: d.inventario_id, cantidad: cant });
  }

  const left = (await c.query('SELECT COALESCE(SUM(cantidad_prestada-cantidad_devuelta),0)::int AS n FROM prestamos_detalle WHERE prestamo_id=$1', [prestamoId])).rows[0].n;
  let estado;
  if (left === 0) estado = 'DEVUELTO';
  else estado = new Date(p.fecha_prevista_devolucion) < new Date() ? 'VENCIDO' : 'PARCIALMENTE_DEVUELTO';
  await c.query('UPDATE prestamos SET estado=$2, updated_at=now() WHERE id=$1', [prestamoId, estado]);

  for (const m of movs)
    await mov.registrar(c, { usuario_id: user.id, tipo: left === 0 ? 'DEVOLUCION' : 'DEVOLUCION_PARCIAL', inventario_id: m.inventario_id,
      cantidad: m.cantidad, estado_anterior: p.estado, estado_posterior: estado, prestamo_id: prestamoId, devolucion_id: dv.id,
      descripcion: `Devolución #${dv.id} del préstamo #${prestamoId}` });

  return { ...dv, estado_prestamo: estado, unidades_pendientes: left };
});
