-- MIGRACIÓN: factura electrónica (DTE tipo 01). Idempotente; el servidor también la aplica solo al arrancar.
-- Agrega código de generación, número de control correlativo y documento (DUI/NIT) opcional del receptor.
BEGIN;
CREATE SEQUENCE IF NOT EXISTS pagos_dte_seq START 1;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS codigo_generacion UUID;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS numero_control VARCHAR(40);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS receptor_documento VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_codigo_generacion ON pagos (codigo_generacion) WHERE codigo_generacion IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_numero_control    ON pagos (numero_control)    WHERE numero_control IS NOT NULL;
COMMIT;
