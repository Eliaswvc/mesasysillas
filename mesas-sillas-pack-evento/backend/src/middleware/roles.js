const AppError = require('../utils/AppError');
module.exports = (...roles) => (req, res, next) =>
  roles.includes(req.user?.rol) ? next() : next(new AppError('Sin permisos', 403));
