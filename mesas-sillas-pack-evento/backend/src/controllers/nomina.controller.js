const svc = require('../services/nomina.service');
const AppError = require('../utils/AppError');

const id = (req) => { const n = Number(req.params.id); if (!Number.isInteger(n)) throw new AppError('Id inválido'); return n; };

exports.config = async (req, res) => res.json({ ok: true, data: svc.config() });
exports.resumen = async (req, res) => res.json({ ok: true, data: await svc.resumen() });

exports.trabajadores = {
  listar: async (req, res) => res.json({ ok: true, data: await svc.listarTrabajadores({ activo: req.query.activo }) }),
  crear: async (req, res) => res.status(201).json({ ok: true, data: await svc.crearTrabajador(req.body) }),
  actualizar: async (req, res) => res.json({ ok: true, data: await svc.actualizarTrabajador(id(req), req.body) })
};

exports.horas = {
  listar: async (req, res) => res.json({ ok: true, data: await svc.listarHoras(req.query) }),
  crear: async (req, res) => res.status(201).json({ ok: true, data: await svc.registrarHoras(req.user, req.body) }),
  resolver: async (req, res) => res.json({ ok: true, data: await svc.resolverHoras(req.user, id(req), req.body.estado) }),
  eliminar: async (req, res) => res.json({ ok: true, data: await svc.eliminarHoras(id(req)) })
};

exports.planilla = {
  calculo: async (req, res) => res.json({ ok: true, data: await svc.calcular(req.query.periodo) }),
  cerrar: async (req, res) => res.status(201).json({ ok: true, data: await svc.cerrarPlanilla(req.user, req.body.periodo) }),
  listar: async (req, res) => res.json({ ok: true, data: await svc.listarPlanillas() }),
  obtener: async (req, res) => res.json({ ok: true, data: await svc.obtenerPlanilla(id(req)) })
};
