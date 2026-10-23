const r = require('express').Router();
const h = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const c = require('../controllers/nomina.controller');

r.use(auth, roles('ADMIN'));   // datos sensibles (salarios): solo administradores
r.get('/config', h(c.config));
r.get('/resumen', h(c.resumen));

r.get('/trabajadores', h(c.trabajadores.listar));
r.post('/trabajadores', h(c.trabajadores.crear));
r.put('/trabajadores/:id', h(c.trabajadores.actualizar));

r.get('/horas-extra', h(c.horas.listar));
r.post('/horas-extra', h(c.horas.crear));
r.put('/horas-extra/:id/resolver', h(c.horas.resolver));
r.delete('/horas-extra/:id', h(c.horas.eliminar));

r.get('/planilla/calculo', h(c.planilla.calculo));
r.post('/planilla', h(c.planilla.cerrar));
r.get('/planillas', h(c.planilla.listar));
r.get('/planillas/:id', h(c.planilla.obtener));
module.exports = r;
