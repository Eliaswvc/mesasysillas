const s = require('../services/pagos.service');
exports.pagar = async (req, res) => {
  const p = await s.pagar(req.user, req.body);
  if (p.estado === 'RECHAZADO') return res.status(402).json({ ok: false, error: `Pago rechazado: ${p.motivo}`, data: p });
  res.status(201).json({ ok: true, data: p });
};
exports.listar = async (req, res) => res.json({ ok: true, data: await s.listar(req.user) });
