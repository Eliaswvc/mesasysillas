const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { lockInventario } = require('../services/inventario.service');
const mov = require('../services/movimientos.service');

// Precio en USD con 2 decimales; undefined/'' = no cambiar
function parsePrecio(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 99999999) throw new AppError('Precio inválido');
  return Math.round(n * 100) / 100;
}

exports.listar = async (req, res) => {
  const { rows } = await query('SELECT * FROM inventario ORDER BY id');
  res.json({ ok: true, data: rows });
};

exports.crear = async (req, res) => {
  const { tipo, nombre, cantidad_total } = req.body;
  const total = Number(cantidad_total);
  if (!['MESA', 'SILLA'].includes(tipo) || !nombre || !Number.isInteger(total) || total < 0) throw new AppError('Datos inválidos');
  const { rows } = await query(
    `INSERT INTO inventario (tipo,nombre,cantidad_total,cantidad_disponible,precio_unitario) VALUES ($1,$2,$3,$3,$4) RETURNING *`,
    [tipo, nombre, total, parsePrecio(req.body.precio_unitario) ?? 0]);
  res.status(201).json({ ok: true, data: rows[0] });
};

// Cambia el total; la diferencia se aplica sobre disponible (nunca bajo lo ya reservado/prestado)
exports.actualizar = async (req, res) => {
  const id = Number(req.params.id);
  const total = Number(req.body.cantidad_total);
  const { nombre, estado } = req.body;
  if (!Number.isInteger(total) || total < 0) throw new AppError('cantidad_total inválida');
  const precio = parsePrecio(req.body.precio_unitario);
  const data = await withTransaction(async (c) => {
    const [inv] = await lockInventario(c, [id]);
    const diff = total - inv.cantidad_total;
    if (inv.cantidad_disponible + diff < 0)
      throw new AppError('No se puede reducir por debajo de lo reservado/prestado', 409);
    const { rows } = await c.query(
      `UPDATE inventario SET cantidad_total=$2, cantidad_disponible=cantidad_disponible+$3,
         nombre=COALESCE($4,nombre), estado=COALESCE($5::estado_recurso,estado),
         precio_unitario=COALESCE($6,precio_unitario), updated_at=now()
       WHERE id=$1 RETURNING *`, [id, total, diff, nombre || null, estado || null, precio]);
    await mov.registrar(c, { usuario_id: req.user.id, tipo: 'MODIFICACION', inventario_id: id, cantidad: diff,
      estado_anterior: String(inv.cantidad_total), estado_posterior: String(total),
      descripcion: `Total de ${inv.nombre} modificado de ${inv.cantidad_total} a ${total}` +
        (precio !== null && precio !== Number(inv.precio_unitario) ? `; precio de ${Number(inv.precio_unitario).toFixed(2)} a ${precio.toFixed(2)} USD` : '') });
    return rows[0];
  });
  res.json({ ok: true, data });
};
