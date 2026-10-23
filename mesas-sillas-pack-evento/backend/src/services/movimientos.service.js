async function registrar(client, m) {
  await client.query(
    `INSERT INTO movimientos (usuario_id,tipo,inventario_id,cantidad,estado_anterior,estado_posterior,reserva_id,prestamo_id,devolucion_id,descripcion)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [m.usuario_id, m.tipo, m.inventario_id ?? null, m.cantidad ?? 0, m.estado_anterior ?? null,
     m.estado_posterior ?? null, m.reserva_id ?? null, m.prestamo_id ?? null, m.devolucion_id ?? null, m.descripcion ?? null]
  );
}
module.exports = { registrar };
