const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const prestamos = require('../services/prestamos.service');
const devoluciones = require('../services/devoluciones.service');
const dashboard = require('../services/dashboard.service');

exports.prestamos = {
  listar: async (req, res) => res.json({ ok: true, data: await prestamos.listar(req.user) }),
  obtener: async (req, res) => res.json({ ok: true, data: await prestamos.obtener(req.user, Number(req.params.id)) }),
  crear: async (req, res) => res.status(201).json({ ok: true, data: await prestamos.crear(req.user, req.body) }),
  actualizar: async (req, res) => res.json({ ok: true, data: await prestamos.actualizar(req.user, Number(req.params.id), req.body) })
};
exports.devoluciones = {
  listar: async (req, res) => res.json({ ok: true, data: await devoluciones.listar(req.user) }),
  crear: async (req, res) => res.status(201).json({ ok: true, data: await devoluciones.crear(req.user, req.body) })
};
exports.dashboard = async (req, res) => res.json({ ok: true, data: await dashboard.obtener(req.user) });

exports.historial = async (req, res) => {
  const { tipo, q } = req.query;
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const { rows } = await query(
    `SELECT m.*, u.nombre AS usuario_nombre, i.tipo AS recurso
     FROM movimientos m LEFT JOIN usuarios u ON u.id=m.usuario_id LEFT JOIN inventario i ON i.id=m.inventario_id
     WHERE ($1::text IS NULL OR m.tipo::text=$1) AND ($2::text IS NULL OR m.descripcion ILIKE '%'||$2||'%' OR u.nombre ILIKE '%'||$2||'%')
     ORDER BY m.id DESC LIMIT $3`, [tipo || null, q || null, limit]);
  res.json({ ok: true, data: rows });
};

exports.usuarios = {
  listar: async (req, res) => {
    const { rows } = await query('SELECT id,nombre,email,rol,activo,created_at FROM usuarios ORDER BY id');
    res.json({ ok: true, data: rows });
  },
  crear: async (req, res) => {
    const { nombre, email, password, rol } = req.body;
    if (!nombre || !email || !password || password.length < 8 || !['ADMIN', 'USER'].includes(rol)) throw new AppError('Datos inválidos (contraseña mínimo 8)');
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      'INSERT INTO usuarios (nombre,email,password_hash,rol) VALUES ($1,$2,$3,$4) RETURNING id,nombre,email,rol,activo',
      [nombre.trim(), email.toLowerCase().trim(), hash, rol]);
    res.status(201).json({ ok: true, data: rows[0] });
  },
  actualizar: async (req, res) => {
    const id = Number(req.params.id);
    const { nombre, rol, activo, password } = req.body;
    if (id === req.user.id && (activo === false || (rol && rol !== 'ADMIN'))) throw new AppError('No puede quitarse su propio acceso de administrador');
    if (rol && !['ADMIN', 'USER'].includes(rol)) throw new AppError('Rol inválido');
    if (password && password.length < 8) throw new AppError('Contraseña mínimo 8 caracteres');
    const hash = password ? await bcrypt.hash(password, 10) : null;
    const { rows } = await query(
      `UPDATE usuarios SET nombre=COALESCE($2,nombre), rol=COALESCE($3::rol_usuario,rol), activo=COALESCE($4,activo),
         password_hash=COALESCE($5,password_hash) WHERE id=$1 RETURNING id,nombre,email,rol,activo`,
      [id, nombre || null, rol || null, typeof activo === 'boolean' ? activo : null, hash]);
    if (!rows.length) throw new AppError('Usuario inexistente', 404);
    res.json({ ok: true, data: rows[0] });
  }
};
