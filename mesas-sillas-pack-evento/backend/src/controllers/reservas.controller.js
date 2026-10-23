const s = require('../services/reservas.service');
exports.listar = async (req, res) => res.json({ ok: true, data: await s.listar(req.user) });
exports.crear = async (req, res) => res.status(201).json({ ok: true, data: await s.crear(req.user, req.body) });
exports.confirmar = async (req, res) => res.json({ ok: true, data: await s.confirmar(req.user, Number(req.params.id)) });
exports.cancelar = async (req, res) => res.json({ ok: true, data: await s.cancelar(req.user, Number(req.params.id)) });
