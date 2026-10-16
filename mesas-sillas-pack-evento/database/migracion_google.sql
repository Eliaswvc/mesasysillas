-- MIGRACIÓN: inicio de sesión con Google.
-- Para quien YA tiene la base creada (no borra datos). Idempotente. El servidor también la aplica solo al arrancar,
-- así que ejecutarla a mano es opcional. Si creas la base desde cero, schema.sql ya la incluye.
BEGIN;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_id VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_google ON usuarios (google_id) WHERE google_id IS NOT NULL;
COMMIT;
