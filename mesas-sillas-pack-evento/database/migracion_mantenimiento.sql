-- MIGRACIÓN: estado de los muebles y mantenimiento.
-- Para quien YA tiene la base creada (no borra datos). Idempotente. El servidor también la aplica solo al arrancar,
-- así que ejecutarla a mano es opcional. Si creas la base desde cero, schema.sql ya la incluye.
-- IMPORTANTE: ejecuta primero la línea de ALTER TYPE por separado (Neon: pégala sola y pulsa Run), y luego el resto.

ALTER TYPE tipo_movimiento ADD VALUE IF NOT EXISTS 'MANTENIMIENTO';

-- ---- ejecutar lo siguiente en una segunda ejecución ----
BEGIN;

ALTER TABLE inventario ADD COLUMN IF NOT EXISTS cantidad_mantenimiento INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_mantenimiento >= 0);

ALTER TABLE inventario DROP CONSTRAINT IF EXISTS inventario_balance;
ALTER TABLE inventario ADD CONSTRAINT inventario_balance
  CHECK (cantidad_total = cantidad_disponible + cantidad_reservada + cantidad_prestada + cantidad_mantenimiento);

CREATE TABLE IF NOT EXISTS mantenimientos (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inventario_id       INTEGER NOT NULL REFERENCES inventario(id),
  cantidad            INTEGER NOT NULL CHECK (cantidad > 0),
  cantidad_reparada   INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_reparada >= 0),
  cantidad_descartada INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_descartada >= 0),
  motivo              VARCHAR(12) NOT NULL CHECK (motivo IN ('DANADO','REPARACION','LIMPIEZA','REVISION','OTRO')),
  descripcion         TEXT,
  costo               NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (costo >= 0),
  estado              VARCHAR(10) NOT NULL DEFAULT 'EN_CURSO' CHECK (estado IN ('EN_CURSO','CERRADO')),
  devolucion_id       INTEGER REFERENCES devoluciones(id),
  registrado_por      INTEGER NOT NULL REFERENCES usuarios(id),
  fecha_ingreso       TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_cierre        TIMESTAMPTZ,
  CONSTRAINT mantenimientos_balance CHECK (cantidad_reparada + cantidad_descartada <= cantidad)
);
CREATE INDEX IF NOT EXISTS idx_mant_estado ON mantenimientos (estado, fecha_ingreso DESC);

ALTER TABLE devoluciones_detalle ADD COLUMN IF NOT EXISTS cantidad_danada INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_danada >= 0);

COMMIT;
