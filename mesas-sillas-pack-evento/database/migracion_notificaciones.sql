-- MIGRACIÓN: notificaciones + stock mínimo por recurso.
-- Para quien YA tiene la base creada (no borra datos). Idempotente. El servidor también la aplica solo al arrancar,
-- así que ejecutarla a mano es opcional. Si creas la base desde cero, schema.sql ya la incluye.
BEGIN;

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

COMMIT;
