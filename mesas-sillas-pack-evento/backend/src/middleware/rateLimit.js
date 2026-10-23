// Limitador simple en memoria (por IP). Suficiente para una sola instancia; para varias, usar Redis.
const AppError = require('../utils/AppError');
module.exports = ({ max, windowMs, mensaje = 'Demasiados intentos, intenta más tarde' }) => {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    let h = hits.get(req.ip);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(req.ip, h); }
    if (++h.n > max) return next(new AppError(mensaje, 429));
    next();
  };
};
