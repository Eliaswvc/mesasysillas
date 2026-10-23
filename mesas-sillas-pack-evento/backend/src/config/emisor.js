// Datos del EMISOR de la factura (tu negocio). Se leen de variables de entorno para no dejarlos fijos en el código.
// Son los datos que Hacienda exige ver en una factura: nombre, NIT, NRC, actividad económica y dirección.
const e = process.env;
const cod = (v, def) => String(v || def).toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(4, '0').slice(0, 4);

exports.emisor = () => ({
  nombre: e.EMISOR_NOMBRE || '',                                   // razón social o nombre del contribuyente
  comercial: e.EMISOR_NOMBRE_COMERCIAL || e.EMISOR_NOMBRE || 'SIMEP',
  nit: e.EMISOR_NIT || '',                                         // 14 dígitos
  nrc: e.EMISOR_NRC || '',                                         // Número de Registro de Contribuyente
  codActividad: e.EMISOR_COD_ACTIVIDAD || '',                      // código CAT-019 de Hacienda
  actividad: e.EMISOR_ACTIVIDAD || 'Alquiler de mobiliario para eventos',
  direccion: e.EMISOR_DIRECCION || '',                             // complemento + municipio + departamento
  telefono: e.EMISOR_TELEFONO || '',
  correo: e.EMISOR_CORREO || '',
  codEstablecimiento: cod(e.EMISOR_COD_ESTABLECIMIENTO, 'M001'),   // 4 caracteres (los asigna Hacienda)
  codPuntoVenta: cod(e.EMISOR_COD_PUNTO_VENTA, 'P001'),            // 4 caracteres
  ambiente: e.DTE_AMBIENTE === '01' ? '01' : '00'                  // 00 = pruebas, 01 = producción
});

// ¿Están completos los datos mínimos que debe mostrar una factura real?
exports.completo = (em) => Boolean(em.nombre && em.nit && em.nrc && em.codActividad && em.direccion);
