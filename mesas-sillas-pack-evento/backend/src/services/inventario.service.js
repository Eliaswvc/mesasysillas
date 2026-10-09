const AppError = require('../utils/AppError');
const notif = require('./notificaciones.service');

// Bloquea filas del inventario en orden de id (evita deadlocks) y las devuelve
async function lockInventario(client, ids) {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const { rows } = await client.query(
    'SELECT * FROM inventario WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE', [sorted]);
  if (rows.length !== sorted.length) throw new AppError('Recurso inexistente', 404);
  return rows;
}

// Mueve unidades entre columnas. from/to: 'disponible' | 'reservada' | 'prestada'
async function mover(client, inventarioId, cantidad, from, to) {
  const cols = ['disponible', 'reservada', 'prestada'];
  if (!cols.includes(from) || !cols.includes(to)) throw new Error('Columna inválida');
  const { rows } = await client.query(
    `UPDATE inventario SET cantidad_${from} = cantidad_${from} - $2,
                           cantidad_${to}   = cantidad_${to}   + $2,
                           updated_at = now()
     WHERE id = $1 AND cantidad_${from} >= $2 RETURNING *`, [inventarioId, cantidad]);
  if (!rows.length) throw new AppError('Cantidad insuficiente en inventario', 409);
  await notif.evaluarStock(client, rows[0]);   // alerta de stock agotado/bajo (o la cierra si se repuso)
  return rows[0];
}

module.exports = { lockInventario, mover };
