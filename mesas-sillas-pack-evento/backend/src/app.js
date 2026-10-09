require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');
const mailer = require('./utils/mailer');
const esquema = require('./config/esquema');

if (!process.env.JWT_SECRET) throw new Error('Falta JWT_SECRET');

const app = express();
app.set('trust proxy', 1); // detrás del proxy de Render, para que req.ip sea la IP real
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/inventario', require('./routes/inventario.routes'));
app.use('/api/reservas', require('./routes/reservas.routes'));
app.use('/api/pagos', require('./routes/pagos.routes'));
app.use('/api/notificaciones', require('./routes/notificaciones.routes'));
app.use('/api/correo', require('./routes/correo.routes'));
const otros = require('./routes/otros.routes');
app.use('/api/prestamos', otros.prestamos);
app.use('/api/devoluciones', otros.devoluciones);
app.use('/api/historial', otros.historial);
app.use('/api/dashboard', otros.dashboard);
app.use('/api/usuarios', otros.usuarios);

app.use(express.static(path.join(__dirname, '../../frontend')));
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Ruta no encontrada' }));
app.use(errorHandler);

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor en puerto ${PORT}`);
  const m = mailer.estado();
  console.log(m.configurado ? `Correo: ${m.orden.join(' → ')} (remitente ${m.remitente})` : 'Correo: SIN CONFIGURAR (las facturas no se enviarán)');
  esquema.asegurar();
});
