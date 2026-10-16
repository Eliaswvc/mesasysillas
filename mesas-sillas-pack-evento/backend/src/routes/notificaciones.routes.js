const r = require('express').Router();
const h = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const s = require('../services/notificaciones.service');
r.use(auth);
r.get('/', h(async (req, res) => res.json({ ok: true, data: await s.listar(req.user) })));
r.post('/leer-todas', h(async (req, res) => { await s.marcarTodas(req.user); res.json({ ok: true }); }));
r.post('/:id/leer', h(async (req, res) => { await s.marcarLeida(req.user, Number(req.params.id)); res.json({ ok: true }); }));
module.exports = r;
