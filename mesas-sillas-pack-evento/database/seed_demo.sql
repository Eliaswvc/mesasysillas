-- OPCIONAL: historial ficticio de los últimos 7 días para que las gráficas tengan datos.
-- Solo inserta en "movimientos" (no toca el inventario). Ejecutar una vez en Neon.
INSERT INTO movimientos (usuario_id,tipo,inventario_id,cantidad,estado_anterior,estado_posterior,descripcion,created_at)
SELECT 1,
  (ARRAY['RESERVA','PRESTAMO','DEVOLUCION','DEVOLUCION_PARCIAL'])[1 + (g.i % 4)]::tipo_movimiento,
  1 + (g.i % 2),
  5 + ((g.i * 7) % 30),
  NULL, NULL,
  'Movimiento de demostración',
  now() - ((g.i % 7) || ' days')::interval - ((g.i * 37 % 600) || ' minutes')::interval
FROM generate_series(1,40) AS g(i);
