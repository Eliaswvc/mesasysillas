// Migraciones idempotentes que se aplican al arrancar (equivale a database/migracion_notificaciones.sql).
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

exports.asegurar = async () => {
  try { await pool.query(SQL); console.log('Esquema de notificaciones OK'); }
  catch (e) { console.error('No se pudo aplicar la migración de notificaciones (ejecuta database/migracion_notificaciones.sql a mano):', e.message); }
};
