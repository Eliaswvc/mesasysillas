-- MIGRACIÓN: factura electrónica (DTE tipo 01). Idempotente; el servidor también la aplica solo al arrancar.
-- Agrega código de generación, número de control correlativo y documento (DUI/NIT) opcional del receptor.
BEGIN;
CREATE SEQUENCE IF NOT EXISTS pagos_dte_seq START 1;      -- correlativo DTE-01 (factura)
CREATE SEQUENCE IF NOT EXISTS pagos_dte03_seq START 1;    -- correlativo DTE-03 (comprobante de crédito fiscal)
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS tipo_dte CHAR(2) NOT NULL DEFAULT '01';
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS receptor_nombre VARCHAR(160);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS receptor_nrc VARCHAR(10);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS receptor_cod_actividad VARCHAR(6);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS receptor_actividad VARCHAR(160);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS receptor_direccion VARCHAR(250);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS codigo_generacion UUID;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS numero_control VARCHAR(40);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS receptor_documento VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_codigo_generacion ON pagos (codigo_generacion) WHERE codigo_generacion IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_numero_control    ON pagos (numero_control)    WHERE numero_control IS NOT NULL;
COMMIT;
