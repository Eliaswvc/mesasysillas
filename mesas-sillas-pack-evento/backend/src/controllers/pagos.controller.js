const s = require('../services/pagos.service');
exports.pagar = async (req, res) => {
  const p = await s.pagar(req.user, req.body);
  if (p.estado === 'RECHAZADO') return res.status(402).json({ ok: false, error: `Pago rechazado: ${p.motivo}`, data: p });
  // El pago ya está confirmado; el envío de la factura no puede deshacerlo (enviarFactura nunca lanza).
  const factura = await s.enviarFactura(p.id);
  res.status(201).json({ ok: true, data: p, factura });
};
exports.reenviarFactura = async (req, res) => {
  const factura = await s.reenviarFactura(req.user, Number(req.params.id));
  factura.enviada
    ? res.json({ ok: true, data: factura })
    : res.status(502).json({ ok: false, error: `No se pudo enviar la factura: ${factura.error}` });
};
exports.listar = async (req, res) => res.json({ ok: true, data: await s.listar(req.user) });
