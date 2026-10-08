const express = require('express');
const h = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const c = require('../controllers/otros.controller');

const prestamos = express.Router();
prestamos.use(auth);
prestamos.get('/', h(c.prestamos.listar));
prestamos.get('/:id', h(c.prestamos.obtener));
prestamos.post('/', roles('ADMIN'), h(c.prestamos.crear));
prestamos.put('/:id', roles('ADMIN'), h(c.prestamos.actualizar));

const devoluciones = express.Router();
devoluciones.use(auth);
devoluciones.get('/', h(c.devoluciones.listar));
devoluciones.post('/', roles('ADMIN'), h(c.devoluciones.crear));

const historial = express.Router();
historial.get('/', auth, roles('ADMIN'), h(c.historial));

const dashboard = express.Router();
dashboard.get('/', auth, h(c.dashboard));

const usuarios = express.Router();
usuarios.use(auth, roles('ADMIN'));
usuarios.get('/', h(c.usuarios.listar));
usuarios.post('/', h(c.usuarios.crear));
usuarios.put('/:id', h(c.usuarios.actualizar));

module.exports = { prestamos, devoluciones, historial, dashboard, usuarios };
