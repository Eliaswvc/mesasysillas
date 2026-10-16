-- MIGRACIÓN: precios en USD + pagos simulados.
-- Para quien YA tiene la base creada (no borra datos). Es idempotente: se puede ejecutar más de una vez.
-- Si vas a crear la base desde cero, usa schema.sql (ya incluye todo esto).
BEGIN;

-- 1) Precio por unidad (USD, por unidad y por reserva)
ALTER TABLE inventario ADD COLUMN IF NOT EXISTS precio_unitario NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0);
UPDATE inventario SET precio_unitario = 8.00 WHERE tipo = 'MESA'  AND precio_unitario = 0;
UPDATE inventario SET precio_unitario = 1.50 WHERE tipo = 'SILLA' AND precio_unitario = 0;

-- 2) Totales y estado de pago en reservas; precio "congelado" en cada línea
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS total NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0);
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS estado_pago VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
  CHECK (estado_pago IN ('PENDIENTE','PAGADO','REEMBOLSADO'));
ALTER TABLE reservas_detalle ADD COLUMN IF NOT EXISTS precio_unitario NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0);

-- 3) Reservas existentes: calcular su total con los precios actuales (solo las que aún están en 0)
UPDATE reservas_detalle d SET precio_unitario = i.precio_unitario
  FROM inventario i WHERE i.id = d.inventario_id AND d.precio_unitario = 0;
UPDATE reservas r SET total = COALESCE((SELECT SUM(d.cantidad * d.precio_unitario) FROM reservas_detalle d WHERE d.reserva_id = r.id), 0)
  WHERE r.total = 0;

-- 4) Libro de pagos (inmutable): pagos, intentos rechazados y reembolsos
CREATE TABLE IF NOT EXISTS pagos (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reserva_id     INTEGER NOT NULL REFERENCES reservas(id),
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id),   -- dueño de la reserva
  registrado_por INTEGER NOT NULL REFERENCES usuarios(id),   -- quien ejecutó la operación
  tipo           VARCHAR(10) NOT NULL CHECK (tipo IN ('PAGO','REEMBOLSO')),
  estado         VARCHAR(10) NOT NULL CHECK (estado IN ('APROBADO','RECHAZADO')),
  monto          NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  moneda         CHAR(3) NOT NULL DEFAULT 'USD' CHECK (moneda = 'USD'),
  marca          VARCHAR(20),
  ultimos4       CHAR(4),            -- NUNCA se guarda el número completo ni el CVV
  titular        VARCHAR(120),
  referencia     VARCHAR(30) NOT NULL UNIQUE,
  motivo         VARCHAR(160),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pago_aprobado ON pagos (reserva_id) WHERE tipo = 'PAGO' AND estado = 'APROBADO';
CREATE UNIQUE INDEX IF NOT EXISTS uq_reembolso     ON pagos (reserva_id) WHERE tipo = 'REEMBOLSO' AND estado = 'APROBADO';
CREATE INDEX IF NOT EXISTS idx_pagos_usuario ON pagos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_pagos_reserva ON pagos (reserva_id);

CREATE OR REPLACE FUNCTION pagos_inmutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'pagos es inmutable'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_pagos_inmutable ON pagos;
CREATE TRIGGER trg_pagos_inmutable BEFORE UPDATE OR DELETE ON pagos
  FOR EACH ROW EXECUTE FUNCTION pagos_inmutable();

-- 5) Correo al que se envía la factura (pagos nuevos)
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS email_factura VARCHAR(160);

COMMIT;
