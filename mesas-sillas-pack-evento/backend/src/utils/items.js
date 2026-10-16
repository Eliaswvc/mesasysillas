const AppError = require('./AppError');
// Convierte {mesas, sillas} en [{inventario_id, cantidad}] validando enteros >= 0
module.exports = async function items(c, mesasRaw, sillasRaw) {
  const mesas = Number(mesasRaw || 0), sillas = Number(sillasRaw || 0);
  if (!Number.isInteger(mesas) || !Number.isInteger(sillas) || mesas < 0 || sillas < 0) throw new AppError('Cantidades inválidas');
  if (mesas + sillas === 0) throw new AppError('Debe indicar al menos una unidad');
  const { rows } = await c.query(`SELECT id,tipo FROM inventario WHERE tipo IN ('MESA','SILLA')`);
  const by = Object.fromEntries(rows.map(r => [r.tipo, r.id]));
  const out = [];
  if (mesas > 0) out.push({ inventario_id: by.MESA, cantidad: mesas });
  if (sillas > 0) out.push({ inventario_id: by.SILLA, cantidad: sillas });
  return out;
};
