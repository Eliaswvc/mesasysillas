// Migraciones idempotentes que se aplican al arrancar (equivale a database/migracion_notificaciones.sql
// y database/migracion_mantenimiento.sql).
// Así, al desplegar en Render no hay que acordarse de ejecutar el SQL a mano.
const { pool } = require('./db');

const SQL = `
ALTER TABLE inventario ADD COLUMN IF NOT EXISTS stock_minimo INTEGER NOT NULL DEFAULT 10 CHECK (stock_minimo >= 0);

CREATE TABLE IF NOT EXISTS notificaciones (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo        VARCHAR(30)  NOT NULL,
  nivel       VARCHAR(10)  NOT NULL DEFAULT 'info' CHECK (nivel IN ('info','ok','warn','error')),
  titulo      VARCHAR(120) NOT NULL,
  mensaje     VARCHAR(400) NOT NULL,
  enlace      VARCHAR(80),
  clave       VARCHAR(60),
  leida       BOOLEAN NOT NULL DEFAULT FALSE,
  resuelta    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_usuario ON notificaciones (usuario_id, leida, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_clave   ON notificaciones (clave) WHERE NOT resuelta;
`;

// Estado de los muebles y mantenimiento (unidades fuera de servicio por daño, reparación o limpieza)
const SQL_MANT = `
ALTER TABLE inventario ADD COLUMN IF NOT EXISTS cantidad_mantenimiento INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_mantenimiento >= 0);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventario_balance'
                 AND pg_get_constraintdef(oid) LIKE '%cantidad_mantenimiento%') THEN
    ALTER TABLE inventario DROP CONSTRAINT IF EXISTS inventario_balance;
    ALTER TABLE inventario ADD CONSTRAINT inventario_balance
      CHECK (cantidad_total = cantidad_disponible + cantidad_reservada + cantidad_prestada + cantidad_mantenimiento);
  END IF;
END $$;

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
`;

// Inicio de sesión con Google: id de la cuenta de Google (único) en usuarios
const SQL_GOOGLE = `
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_id VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_google ON usuarios (google_id) WHERE google_id IS NOT NULL;
`;

// Factura electrónica (DTE): código de generación, número de control correlativo y documento del receptor en pagos
const SQL_DTE = `
CREATE SEQUENCE IF NOT EXISTS pagos_dte_seq START 1;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS codigo_generacion UUID;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS numero_control VARCHAR(40);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS receptor_documento VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_codigo_generacion ON pagos (codigo_generacion) WHERE codigo_generacion IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_numero_control    ON pagos (numero_control)    WHERE numero_control IS NOT NULL;
`;

exports.asegurar = async () => {
  try { await pool.query(SQL); console.log('Esquema de notificaciones OK'); }
  catch (e) { console.error('No se pudo aplicar la migración de notificaciones (ejecuta database/migracion_notificaciones.sql a mano):', e.message); }
  try { await pool.query(SQL_GOOGLE); console.log('Esquema de Google OK'); }
  catch (e) { console.error('No se pudo aplicar la migración de Google (ejecuta database/migracion_google.sql a mano):', e.message); }
  try { await pool.query(SQL_DTE); console.log('Esquema de factura electrónica OK'); }
  catch (e) { console.error('No se pudo aplicar la migración de factura electrónica (ejecuta database/migracion_factura_dte.sql a mano):', e.message); }
  try {
    // ADD VALUE va en su propia consulta: no se puede usar junto con otras sentencias en la misma transacción
    await pool.query(`ALTER TYPE tipo_movimiento ADD VALUE IF NOT EXISTS 'MANTENIMIENTO'`);
    await pool.query(SQL_MANT);
    console.log('Esquema de mantenimiento OK');
  } catch (e) { console.error('No se pudo aplicar la migración de mantenimiento (ejecuta database/migracion_mantenimiento.sql a mano):', e.message); }
};
