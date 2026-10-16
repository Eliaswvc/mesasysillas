module.exports = (err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message;
  // errores de PostgreSQL
  if (err.code === '23505') { status = 409; message = 'Registro duplicado'; }
  else if (err.code === '23514') { status = 400; message = 'Operación viola una restricción de inventario'; }
  else if (err.code === '23503') { status = 400; message = 'Referencia inexistente'; }
  else if (err.code === '22P02' || err.code === '22007' || err.code === '22008') { status = 400; message = 'Dato con formato inválido'; }
  if (status === 500) console.error(err);
  res.status(status).json({ ok: false, error: status === 500 ? 'Error interno del servidor' : message });
};
