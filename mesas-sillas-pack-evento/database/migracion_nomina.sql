-- Módulo de nómina (trabajadores, horas extra, planillas). El servidor lo aplica solo al arrancar;
-- este archivo es para ejecutarlo a mano si lo prefieres. Es idempotente.

CREATE TABLE IF NOT EXISTS trabajadores (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre          VARCHAR(120) NOT NULL,
  dui             VARCHAR(10),
  cargo           VARCHAR(80),
  telefono        VARCHAR(20),
  fecha_ingreso   DATE NOT NULL DEFAULT CURRENT_DATE,
  salario_mensual NUMERIC(10,2) NOT NULL CHECK (salario_mensual > 0),
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_trabajadores_dui ON trabajadores (dui) WHERE dui IS NOT NULL;

CREATE TABLE IF NOT EXISTS planillas (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  periodo           VARCHAR(7) NOT NULL UNIQUE,
  trabajadores      INTEGER NOT NULL,
  total_salarios    NUMERIC(12,2) NOT NULL,
  total_horas_extra NUMERIC(12,2) NOT NULL,
  total_bruto       NUMERIC(12,2) NOT NULL,
  total_deducciones NUMERIC(12,2) NOT NULL,
  total_neto        NUMERIC(12,2) NOT NULL,
  cerrada_por       INTEGER NOT NULL REFERENCES usuarios(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planilla_detalle (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  planilla_id       INTEGER NOT NULL REFERENCES planillas(id) ON DELETE CASCADE,
  trabajador_id     INTEGER NOT NULL REFERENCES trabajadores(id),
  nombre            VARCHAR(120) NOT NULL,
  cargo             VARCHAR(80),
  salario_base      NUMERIC(10,2) NOT NULL,
  horas_extra       NUMERIC(7,2)  NOT NULL DEFAULT 0,
  monto_horas_extra NUMERIC(10,2) NOT NULL DEFAULT 0,
  bruto             NUMERIC(10,2) NOT NULL,
  isss              NUMERIC(10,2) NOT NULL,
  afp               NUMERIC(10,2) NOT NULL,
  renta             NUMERIC(10,2) NOT NULL,
  neto              NUMERIC(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_planilla_det ON planilla_detalle (planilla_id);

CREATE TABLE IF NOT EXISTS horas_extra (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trabajador_id    INTEGER NOT NULL REFERENCES trabajadores(id),
  fecha            DATE NOT NULL,
  horas            NUMERIC(4,2) NOT NULL CHECK (horas > 0 AND horas <= 12),
  tipo             VARCHAR(10) NOT NULL DEFAULT 'DIURNA' CHECK (tipo IN ('DIURNA','NOCTURNA','ASUETO')),
  motivo           VARCHAR(200),
  estado           VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','APROBADA','RECHAZADA','PAGADA')),
  planilla_id      INTEGER REFERENCES planillas(id),
  registrado_por   INTEGER NOT NULL REFERENCES usuarios(id),
  resuelto_por     INTEGER REFERENCES usuarios(id),
  fecha_resolucion TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_horas_extra_fecha ON horas_extra (fecha, estado);
CREATE INDEX IF NOT EXISTS idx_horas_extra_trab  ON horas_extra (trabajador_id);
