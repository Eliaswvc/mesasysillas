// Validación de tarjetas y pasarela SIMULADA. No se procesa dinero real.
// Regla de seguridad: el número completo y el CVV solo viven en memoria durante la petición; nunca se guardan.
const AppError = require('./AppError');

const soloDigitos = (s) => String(s ?? '').replace(/[\s-]/g, '');

function luhn(n) {
  let sum = 0, alt = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return sum % 10 === 0;
}

function marca(n) {
  if (/^4/.test(n)) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'MASTERCARD';
  if (/^3[47]/.test(n)) return 'AMEX';
  return 'TARJETA';
}

// Tarjetas de prueba que la pasarela simulada rechaza (cualquier otra tarjeta válida se aprueba)
const RECHAZOS = {
  '4000000000000002': 'Tarjeta rechazada por el banco emisor',
  '4000000000009995': 'Fondos insuficientes',
  '4000000000000127': 'Código de seguridad (CVV) incorrecto'
};

function validar({ numero, titular, vencimiento, cvv }) {
  const n = soloDigitos(numero);
  if (!/^\d{13,19}$/.test(n) || !luhn(n)) throw new AppError('Número de tarjeta inválido');
  const nombre = String(titular ?? '').trim();
  if (nombre.length < 2 || nombre.length > 120) throw new AppError('Nombre del titular inválido');
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(vencimiento ?? '').trim());
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) throw new AppError('Fecha de vencimiento inválida (use MM/AA)');
  const hoy = new Date();
  const anio = 2000 + Number(m[2]), mes = Number(m[1]);
  if (anio < hoy.getFullYear() || (anio === hoy.getFullYear() && mes < hoy.getMonth() + 1)) throw new AppError('La tarjeta está vencida');
  const largoCvv = marca(n) === 'AMEX' ? 4 : 3;
  if (!new RegExp(`^\\d{${largoCvv}}$`).test(String(cvv ?? ''))) throw new AppError(`CVV inválido (${largoCvv} dígitos)`);
  return { numero: n, marca: marca(n), ultimos4: n.slice(-4), titular: nombre.toUpperCase() };
}

// Pasarela simulada: decide aprobado/rechazado solo por el número de tarjeta
function simularPasarela(numero) {
  const motivo = RECHAZOS[numero] || null;
  return { aprobado: !motivo, motivo };
}

module.exports = { validar, simularPasarela, luhn, marca, RECHAZOS };
