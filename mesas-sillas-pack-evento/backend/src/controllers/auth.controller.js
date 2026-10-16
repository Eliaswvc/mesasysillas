const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const crypto = require('crypto');
const AppError = require('../utils/AppError');
const google = require('../utils/googleAuth');

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

// ---- Google ----
// El front pregunta si Google está configurado (así el botón solo aparece cuando hay GOOGLE_CLIENT_ID)
exports.config = (req, res) => res.json({ ok: true, googleClientId: google.clientId() });

// Recibe el ID token de Google. Cuentas nuevas: rol USER. Si el correo ya existía con contraseña, se vincula (Google ya verificó ese correo).
exports.google = async (req, res) => {
  const credential = String(req.body.credential ?? '');
  if (!credential || credential.length > 4096) throw new AppError('Credencial de Google requerida');
  const p = await google.verificar(credential);   // lanza AppError si el token no es válido
  const email = String(p.email ?? '').trim().toLowerCase();
  if (!p.sub || !email || p.email_verified !== true) throw new AppError('Tu cuenta de Google no tiene el correo verificado', 401);

  let u = (await query('SELECT * FROM usuarios WHERE google_id = $1', [p.sub])).rows[0];
  let nuevo = false;
  if (!u) {
    u = (await query('SELECT * FROM usuarios WHERE email = $1', [email])).rows[0];
    if (u && u.google_id && u.google_id !== p.sub) throw new AppError('Ese correo ya está vinculado a otra cuenta de Google', 409);
    if (u && u.activo) {
      await query('UPDATE usuarios SET google_id = $2 WHERE id = $1 AND google_id IS NULL', [u.id, p.sub]);   // vincula cuenta existente
    } else if (!u) {
      let nombre = String(p.name || '').trim() || email.split('@')[0];
      if (nombre.length < 2) nombre = email;
      nombre = nombre.slice(0, 120);
      const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);   // contraseña aleatoria que nadie conoce: solo entra con Google
      try {
        u = (await query(`INSERT INTO usuarios (nombre,email,password_hash,rol,google_id) VALUES ($1,$2,$3,'USER',$4) RETURNING *`, [nombre, email, hash, p.sub])).rows[0];
        nuevo = true;
      } catch (e) {
        if (e.code === '23505') throw new AppError('No se pudo crear la cuenta, intenta de nuevo', 409);   // carrera: otro registro simultáneo
        throw e;
      }
    }
  }
  if (!u.activo) throw new AppError('Tu cuenta está desactivada. Contacta al administrador.', 403);
  res.json({ ok: true, nuevo, token: sign(u), user: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol } });
};
