-- Schema completo para Neon PostgreSQL. Ejecutar completo en el SQL Editor.
BEGIN;

DROP TABLE IF EXISTS notificaciones, pagos, movimientos, devoluciones_detalle, devoluciones, prestamos_detalle, prestamos,
  reservas_detalle, reservas, inventario, usuarios CASCADE;
DROP TYPE IF EXISTS rol_usuario, tipo_recurso, estado_recurso, estado_reserva, estado_prestamo, tipo_movimiento CASCADE;

CREATE TYPE rol_usuario    AS ENUM ('ADMIN','USER');
CREATE TYPE tipo_recurso   AS ENUM ('MESA','SILLA');
CREATE TYPE estado_recurso AS ENUM ('DISPONIBLE','AGOTADO','INACTIVO');
CREATE TYPE estado_reserva AS ENUM ('PENDIENTE','CONFIRMADA','CANCELADA','FINALIZADA');
CREATE TYPE estado_prestamo AS ENUM ('PENDIENTE','ACTIVO','PARCIALMENTE_DEVUELTO','DEVUELTO','VENCIDO');
CREATE TYPE tipo_movimiento AS ENUM ('RESERVA','CANCELACION','PRESTAMO','DEVOLUCION','DEVOLUCION_PARCIAL','MODIFICACION');

CREATE TABLE usuarios (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  rol           rol_usuario NOT NULL DEFAULT 'USER',
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventario (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo                tipo_recurso NOT NULL UNIQUE,
  nombre              VARCHAR(80) NOT NULL,
  precio_unitario     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),  -- USD por unidad y por reserva
  cantidad_total      INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_total >= 0),
  cantidad_disponible INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_disponible >= 0),
  cantidad_reservada  INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_reservada >= 0),
  cantidad_prestada   INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_prestada >= 0),
  stock_minimo        INTEGER NOT NULL DEFAULT 10 CHECK (stock_minimo >= 0),   -- umbral de la alerta "stock bajo"
  estado              estado_recurso NOT NULL DEFAULT 'DISPONIBLE',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventario_balance CHECK (cantidad_total = cantidad_disponible + cantidad_reservada + cantidad_prestada)
);

CREATE TABLE reservas (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
  fecha         DATE NOT NULL,
  hora_inicio   TIME NOT NULL,
  hora_fin      TIME NOT NULL,
  estado        estado_reserva NOT NULL DEFAULT 'PENDIENTE',
  observaciones TEXT,
  total         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0),   -- USD
  estado_pago   VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_pago IN ('PENDIENTE','PAGADO','REEMBOLSADO')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reservas_horas CHECK (hora_fin > hora_inicio)
);
-- evita reservas duplicadas activas del mismo usuario en el mismo horario
CREATE UNIQUE INDEX uq_reserva_activa ON reservas (usuario_id, fecha, hora_inicio, hora_fin)
  WHERE estado IN ('PENDIENTE','CONFIRMADA');
CREATE INDEX idx_reservas_usuario ON reservas (usuario_id);
CREATE INDEX idx_reservas_estado ON reservas (estado);

CREATE TABLE reservas_detalle (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reserva_id    INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  inventario_id INTEGER NOT NULL REFERENCES inventario(id),
  cantidad      INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),  -- precio congelado al reservar
  UNIQUE (reserva_id, inventario_id)
);

CREATE TABLE prestamos (
  id                        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id                INTEGER NOT NULL REFERENCES usuarios(id),
  reserva_id                INTEGER REFERENCES reservas(id),
  registrado_por            INTEGER NOT NULL REFERENCES usuarios(id),
  fecha_prestamo            TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_prevista_devolucion TIMESTAMPTZ NOT NULL,
  estado                    estado_prestamo NOT NULL DEFAULT 'ACTIVO',
  observaciones             TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prestamos_fechas CHECK (fecha_prevista_devolucion > fecha_prestamo)
);
-- una reserva solo puede convertirse una vez en préstamo
CREATE UNIQUE INDEX uq_prestamo_reserva ON prestamos (reserva_id) WHERE reserva_id IS NOT NULL;
CREATE INDEX idx_prestamos_usuario ON prestamos (usuario_id);
CREATE INDEX idx_prestamos_estado ON prestamos (estado);

CREATE TABLE prestamos_detalle (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prestamo_id       INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  inventario_id     INTEGER NOT NULL REFERENCES inventario(id),
  cantidad_prestada INTEGER NOT NULL CHECK (cantidad_prestada > 0),
  cantidad_devuelta INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_devuelta >= 0),
  UNIQUE (prestamo_id, inventario_id),
  CONSTRAINT detalle_devuelta_max CHECK (cantidad_devuelta <= cantidad_prestada)
);

CREATE TABLE devoluciones (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prestamo_id      INTEGER NOT NULL REFERENCES prestamos(id),
  registrado_por   INTEGER NOT NULL REFERENCES usuarios(id),
  fecha_devolucion TIMESTAMPTZ NOT NULL DEFAULT now(),
  observaciones    TEXT
);
CREATE INDEX idx_devoluciones_prestamo ON devoluciones (prestamo_id);

CREATE TABLE devoluciones_detalle (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  devolucion_id INTEGER NOT NULL REFERENCES devoluciones(id) ON DELETE CASCADE,
  inventario_id INTEGER NOT NULL REFERENCES inventario(id),
  cantidad      INTEGER NOT NULL CHECK (cantidad > 0),
  UNIQUE (devolucion_id, inventario_id)
);

CREATE TABLE movimientos (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id      INTEGER REFERENCES usuarios(id),
  tipo            tipo_movimiento NOT NULL,
  inventario_id   INTEGER REFERENCES inventario(id),
  cantidad        INTEGER NOT NULL DEFAULT 0,
  estado_anterior VARCHAR(40),
  estado_posterior VARCHAR(40),
  reserva_id      INTEGER REFERENCES reservas(id),
  prestamo_id     INTEGER REFERENCES prestamos(id),
  devolucion_id   INTEGER REFERENCES devoluciones(id),
  descripcion     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mov_tipo ON movimientos (tipo);
CREATE INDEX idx_mov_fecha ON movimientos (created_at DESC);

-- el historial no se puede borrar ni editar
CREATE OR REPLACE FUNCTION movimientos_inmutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'movimientos es inmutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_mov_inmutable BEFORE UPDATE OR DELETE ON movimientos
  FOR EACH ROW EXECUTE FUNCTION movimientos_inmutable();

-- libro de pagos (inmutable): pagos, intentos rechazados y reembolsos en USD (simulados)
CREATE TABLE pagos (
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
  email_factura  VARCHAR(160),       -- correo al que se envió la factura
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_pago_aprobado ON pagos (reserva_id) WHERE tipo = 'PAGO' AND estado = 'APROBADO';
CREATE UNIQUE INDEX uq_reembolso     ON pagos (reserva_id) WHERE tipo = 'REEMBOLSO' AND estado = 'APROBADO';
CREATE INDEX idx_pagos_usuario ON pagos (usuario_id);
CREATE INDEX idx_pagos_reserva ON pagos (reserva_id);

CREATE OR REPLACE FUNCTION pagos_inmutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'pagos es inmutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_pagos_inmutable BEFORE UPDATE OR DELETE ON pagos
  FOR EACH ROW EXECUTE FUNCTION pagos_inmutable();

-- notificaciones internas (campana) por usuario: stock agotado/bajo, reservas, pagos, préstamos vencidos
CREATE TABLE notificaciones (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo        VARCHAR(30)  NOT NULL,
  nivel       VARCHAR(10)  NOT NULL DEFAULT 'info' CHECK (nivel IN ('info','ok','warn','error')),
  titulo      VARCHAR(120) NOT NULL,
  mensaje     VARCHAR(400) NOT NULL,
  enlace      VARCHAR(80),
  clave       VARCHAR(60),                       -- evita duplicados (p. ej. stock:1)
  leida       BOOLEAN NOT NULL DEFAULT FALSE,
  resuelta    BOOLEAN NOT NULL DEFAULT FALSE,    -- alertas de stock: se cierran solas al reponer
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_usuario ON notificaciones (usuario_id, leida, created_at DESC);
CREATE INDEX idx_notif_clave   ON notificaciones (clave) WHERE NOT resuelta;

-- ===================== DATOS DE PRUEBA =====================
-- Admin123! / User123!  (bcrypt)
INSERT INTO usuarios (nombre,email,password_hash,rol) VALUES
 ('Administrador','admin@demo.com','$2b$10$ZfMh/cDAwnzonPvJRHIpYeMTXEWWni94hlz8JpSZybsFxIro1P/ge','ADMIN'),
 ('Usuario Uno','user1@demo.com','$2b$10$bkJEQAoDkbZTUYsKlBt5WOJgdRbijDyVZ1jblrAs8XNKTExMI180O','USER'),
 ('Usuario Dos','user2@demo.com','$2b$10$bkJEQAoDkbZTUYsKlBt5WOJgdRbijDyVZ1jblrAs8XNKTExMI180O','USER');

-- Mesas: 100 = 82 disp + 5 reserv + 13 prest | Sillas: 200 = 115 disp + 20 reserv + 65 prest
INSERT INTO inventario (tipo,nombre,precio_unitario,cantidad_total,cantidad_disponible,cantidad_reservada,cantidad_prestada,stock_minimo) VALUES
 ('MESA','Mesas',8.00,100,82,5,13,10),
 ('SILLA','Sillas',1.50,200,115,20,65,30);

INSERT INTO reservas (usuario_id,fecha,hora_inicio,hora_fin,estado,observaciones) VALUES
 (2,CURRENT_DATE+3,'08:00','12:00','CONFIRMADA','Evento familiar'),
 (3,CURRENT_DATE+5,'14:00','18:00','PENDIENTE','Reunión comunitaria'),
 (2,CURRENT_DATE+1,'09:00','11:00','CANCELADA','Cancelada por el usuario');
INSERT INTO reservas_detalle (reserva_id,inventario_id,cantidad) VALUES
 (1,1,5),(1,2,20),(2,1,3),(2,2,10),(3,1,2),(3,2,8);

-- Totales de las reservas de prueba (precio congelado = precio actual)
UPDATE reservas_detalle d SET precio_unitario = i.precio_unitario FROM inventario i WHERE i.id = d.inventario_id;
UPDATE reservas r SET total = (SELECT SUM(d.cantidad * d.precio_unitario) FROM reservas_detalle d WHERE d.reserva_id = r.id);
-- Reserva 1 pagada (VISA 4242) y un intento rechazado en la reserva 2
UPDATE reservas SET estado_pago = 'PAGADO' WHERE id = 1;
INSERT INTO pagos (reserva_id,usuario_id,registrado_por,tipo,estado,monto,marca,ultimos4,titular,referencia,motivo) VALUES
 (1,2,2,'PAGO','APROBADO',70.00,'VISA','4242','USUARIO UNO','SIM-DEMO000001',NULL),
 (2,3,3,'PAGO','RECHAZADO',39.00,'VISA','0002','USUARIO DOS','SIM-DEMO000002','Tarjeta rechazada por el banco emisor');

INSERT INTO prestamos (usuario_id,registrado_por,fecha_prestamo,fecha_prevista_devolucion,estado,observaciones) VALUES
 (2,1,now()-interval '1 day', now()+interval '5 days','ACTIVO','Préstamo activo'),
 (3,1,now()-interval '2 days',now()+interval '3 days','PARCIALMENTE_DEVUELTO','Devolución parcial hecha'),
 (2,1,now()-interval '10 days',now()-interval '3 days','VENCIDO','Plazo vencido');
INSERT INTO prestamos_detalle (prestamo_id,inventario_id,cantidad_prestada,cantidad_devuelta) VALUES
 (1,1,10,0),(1,2,40,0),
 (2,1,4,2),(2,2,30,10),
 (3,1,1,0),(3,2,5,0);

INSERT INTO devoluciones (prestamo_id,registrado_por,observaciones) VALUES (2,1,'Primera devolución parcial');
INSERT INTO devoluciones_detalle (devolucion_id,inventario_id,cantidad) VALUES (1,1,2),(1,2,10);

INSERT INTO movimientos (usuario_id,tipo,inventario_id,cantidad,estado_anterior,estado_posterior,reserva_id,prestamo_id,devolucion_id,descripcion) VALUES
 (1,'RESERVA',1,5,NULL,'CONFIRMADA',1,NULL,NULL,'Reserva confirmada: 5 mesas'),
 (1,'RESERVA',2,20,NULL,'CONFIRMADA',1,NULL,NULL,'Reserva confirmada: 20 sillas'),
 (1,'CANCELACION',1,2,'PENDIENTE','CANCELADA',3,NULL,NULL,'Reserva cancelada'),
 (1,'PRESTAMO',1,10,NULL,'ACTIVO',NULL,1,NULL,'Préstamo registrado: 10 mesas'),
 (1,'PRESTAMO',2,40,NULL,'ACTIVO',NULL,1,NULL,'Préstamo registrado: 40 sillas'),
 (1,'DEVOLUCION_PARCIAL',1,2,'ACTIVO','PARCIALMENTE_DEVUELTO',NULL,2,1,'Devolución parcial: 2 mesas'),
 (1,'DEVOLUCION_PARCIAL',2,10,'ACTIVO','PARCIALMENTE_DEVUELTO',NULL,2,1,'Devolución parcial: 10 sillas');

COMMIT;
