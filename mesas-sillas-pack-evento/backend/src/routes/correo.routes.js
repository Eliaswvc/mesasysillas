// Diagnóstico del correo (solo ADMIN): qué proveedores hay configurados y envío de prueba con el error exacto.
const r = require('express').Router();
const h = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const rateLimit = require('../middleware/rateLimit');
const AppError = require('../utils/AppError');
const mailer = require('../utils/mailer');

r.use(auth, roles('ADMIN'));
r.get('/estado', h(async (req, res) => res.json({ ok: true, data: mailer.estado() })));
r.post('/prueba', rateLimit({ max: 10, windowMs: 10 * 60 * 1000, mensaje: 'Demasiadas pruebas, espera unos minutos' }), h(async (req, res) => {
  const to = String(req.body.to ?? '').trim().toLowerCase();
  if (to.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new AppError('Correo de destino inválido');
  if (!mailer.configurado()) throw new AppError('No hay ningún proveedor de correo configurado en el servidor', 409);
  try {
    const { proveedor } = await mailer.enviar({
      to, subject: 'Prueba de correo · Mesas y Sillas',
      html: '<p style="font-family:Arial,sans-serif">✅ El correo del sistema funciona. Ya puedes enviar facturas y alertas.</p>',
      text: 'El correo del sistema funciona. Ya puedes enviar facturas y alertas.'
    });
    res.json({ ok: true, data: { proveedor, to } });
  } catch (e) { throw new AppError(`No se pudo enviar: ${e.message}`, 502); }
}));
module.exports = r;
