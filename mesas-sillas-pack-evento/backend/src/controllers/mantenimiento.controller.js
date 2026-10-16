const svc = require('../services/mantenimiento.service');

exports.listar = async (req, res) => res.json({ ok: true, data: await svc.listar({ estado: req.query.estado }) });
exports.resumen = async (req, res) => res.json({ ok: true, data: await svc.resumen() });
exports.enviar = async (req, res) => res.status(201).json({ ok: true, data: await svc.enviar(req.user, req.body) });
exports.resolver = async (req, res) => res.json({ ok: true, data: await svc.resolver(req.user, Number(req.params.id), req.body) });
