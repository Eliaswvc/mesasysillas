const r = require('express').Router();
const h = require('../utils/asyncHandler');
const c = require('../controllers/auth.controller');
r.post('/login', h(c.login));
const rateLimit = require('../middleware/rateLimit');
r.post('/register', rateLimit({ max: 10, windowMs: 60 * 60 * 1000, mensaje: 'Demasiados registros desde esta red, intenta en una hora' }), h(c.register));
r.get('/config', c.config);
r.post('/google', rateLimit({ max: 30, windowMs: 15 * 60 * 1000, mensaje: 'Demasiados intentos, espera unos minutos' }), h(c.google));
module.exports = r;
