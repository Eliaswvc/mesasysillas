const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const AppError = require('../utils/AppError');

const sign = (u) => jwt.sign({ id: u.id, rol: u.rol, nombre: u.nombre }, process.env.JWT_SECRET, { expiresIn: '8h' });

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError('Email y contraseña requeridos');
  const { rows } = await query('SELECT * FROM usuarios WHERE email = $1 AND activo = TRUE', [email.toLowerCase()]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new AppError('Credenciales inválidas', 401);
  res.json({ ok: true, token: sign(u), user: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol } });
};

exports.register = async (req, res) => {
  const nombre = String(req.body.nombre ?? '').trim();
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  if (nombre.length < 2 || nombre.length > 120) throw new AppError('El nombre debe tener entre 2 y 120 caracteres');
  if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AppError('Correo electrónico inválido');
  if (password.length < 8 || Buffer.byteLength(password) > 72) throw new AppError('La contraseña debe tener entre 8 y 72 caracteres');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new AppError('La contraseña debe incluir al menos una letra y un número');
  if ((await query('SELECT 1 FROM usuarios WHERE email = $1', [email])).rowCount) throw new AppError('Ya existe una cuenta con ese correo', 409);
  const hash = await bcrypt.hash(password, 10);
  // el registro público siempre crea rol USER
  const { rows } = await query(
    `INSERT INTO usuarios (nombre,email,password_hash,rol) VALUES ($1,$2,$3,'USER') RETURNING id,nombre,email,rol`,
    [nombre, email, hash]);
  res.status(201).json({ ok: true, token: sign(rows[0]), user: rows[0] });
};
