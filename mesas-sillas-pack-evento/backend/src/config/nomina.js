// Parámetros de nómina de El Salvador y funciones de cálculo.
// IMPORTANTE: estos valores son los vigentes al momento de programar el módulo. Si la ley cambia
// (tasas de ISSS/AFP, tabla de renta, recargos), basta con editarlos aquí; no hay nada más hardcodeado.
// Conviene que tu contador valide la configuración antes de usar la planilla para pagos reales.

const P = {
  DIAS_MES: 30,        // salario diario = salario mensual / 30 (Código de Trabajo)
  HORAS_JORNADA: 8,    // jornada diurna ordinaria
  // Recargo sobre el valor de la hora ordinaria (1.0 = +100%, es decir, la hora se paga doble)
  RECARGO: { DIURNA: 1.0, NOCTURNA: 1.0, ASUETO: 1.0 },
  ISSS: { empleado: 0.03, tope: 1000 },   // 3 % sobre el salario ordinario, base máxima $1,000 (máx. $30)
  ISSS_INCLUYE_HORAS_EXTRA: false,        // las horas extra NO cotizan ISSS
  AFP: { empleado: 0.0725 },              // 7.25 % sobre todo lo devengado, sin tope
  // Tabla mensual de retención de renta: [hasta, tasa sobre el exceso, exceso sobre, cuota fija]
  RENTA: [
    [472.00, 0, 0, 0],
    [895.24, 0.10, 472.00, 17.67],
    [2038.10, 0.20, 895.24, 60.00],
    [Infinity, 0.30, 2038.10, 288.57]
  ]
};

const TIPOS = Object.keys(P.RECARGO);
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const valorHora = (salario) => Number(salario) / P.DIAS_MES / P.HORAS_JORNADA;
const montoHoras = (salario, horas, tipo) => r2(Number(horas) * valorHora(salario) * (1 + (P.RECARGO[tipo] ?? 1)));

const retencionRenta = (base) => {
  if (base <= 0) return 0;
  for (const [hasta, tasa, exceso, fija] of P.RENTA) if (base <= hasta) return r2((base - exceso) * tasa + fija);
  return 0;
};

// t: trabajador {salario_mensual}; horasRows: horas extra aprobadas del período [{horas, tipo}]
const calcularFila = (t, horasRows = []) => {
  const salario = r2(t.salario_mensual);
  let horas = 0, extra = 0;
  for (const h of horasRows) { horas += Number(h.horas); extra += montoHoras(salario, h.horas, h.tipo); }
  horas = r2(horas); extra = r2(extra);
  const bruto = r2(salario + extra);
  const baseIsss = P.ISSS_INCLUYE_HORAS_EXTRA ? bruto : salario;
  const isss = r2(Math.min(baseIsss, P.ISSS.tope) * P.ISSS.empleado);
  const afp = r2(bruto * P.AFP.empleado);
  const renta = retencionRenta(bruto - isss - afp);
  return { salario_base: salario, horas_extra: horas, monto_horas_extra: extra, bruto, isss, afp, renta, neto: r2(bruto - isss - afp - renta) };
};

module.exports = { P, TIPOS, r2, valorHora, montoHoras, retencionRenta, calcularFila };
