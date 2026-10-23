// Factura Electrónica (DTE tipo 01) y Comprobante de Crédito Fiscal (DTE tipo 03, para contribuyentes con NIT y NRC). Ambos de un pago aprobado, con el contenido que exige
// el Ministerio de Hacienda de El Salvador: emisor (NIT/NRC/actividad/dirección), receptor, código de generación,
// número de control, sello de recepción, detalle con IVA (13 %, incluido en el precio), total en letras y enlace de consulta.
// Todo el contenido variable se escapa. Es la REPRESENTACIÓN GRÁFICA: tiene validez fiscal solo cuando el JSON del DTE
// fue firmado y transmitido a Hacienda y se recibió el sello de recepción (ver README → "Factura electrónica").
const crypto = require('crypto');
const { emisor: emisorCfg, completo } = require('../config/emisor');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd4 = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(n) || 0);
const nitFmt = (d) => { const x = String(d || '').replace(/\D/g, ''); return x.length === 14 ? `${x.slice(0, 4)}-${x.slice(4, 10)}-${x.slice(10, 13)}-${x.slice(13)}` : x; };
const usd = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const NOMBRE = { MESA: 'Mesa', SILLA: 'Silla' };
const IVA = 0.13;
const TZ = 'America/El_Salvador';
const dia = (d) => new Date(d).toLocaleDateString('es-SV', { timeZone: 'UTC' });   // fecha de reserva (DATE)
const hhmm = (t) => String(t).slice(0, 5);

// ---- Total en letras: "CIENTO VEINTE 50/100 DÓLARES" ----
const U = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
  'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO',
  'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
function menorMil(n) {
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100), r = n % 100, p = [];
  if (c) p.push(C[c]);
  if (r < 30) { if (r) p.push(U[r]); } else { const d = Math.floor(r / 10), u = r % 10; p.push(u ? `${D[d]} Y ${U[u]}` : D[d]); }
  return p.join(' ');
}
function enteroALetras(n) {
  if (n === 0) return 'CERO';
  const mill = Math.floor(n / 1e6), mil = Math.floor((n % 1e6) / 1000), res = n % 1000, p = [];
  if (mill) p.push(mill === 1 ? 'UN MILLÓN' : `${menorMil(mill)} MILLONES`);
  if (mil) p.push(mil === 1 ? 'MIL' : `${menorMil(mil)} MIL`);
  if (res) p.push(menorMil(res));
  return p.join(' ').replace(/VEINTIÚN$/, 'VEINTIUNO').replace(/UN$/, 'UNO');
}
const totalEnLetras = (monto) => {
  const cts = Math.round(Number(monto) * 100);
  return `${enteroALetras(Math.floor(cts / 100))} ${String(cts % 100).padStart(2, '0')}/100 DÓLARES`;
};
exports.totalEnLetras = totalEnLetras;

// Para pagos anteriores a esta versión (sin código guardado): UUID determinista a partir de la referencia, así el reenvío no cambia.
const uuidDe = (s) => {
  const h = crypto.createHash('sha1').update(`mesas-sillas:${s}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`.toUpperCase();
};

exports.construir = ({ pago, reserva, lineas, cliente, emisor = emisorCfg() }) => {
  const ccf = pago.tipo_dte === '03';                                   // Comprobante de Crédito Fiscal
  const tipoCod = ccf ? '03' : '01';
  const emitida = new Date(pago.created_at);
  const fechaEmi = emitida.toLocaleDateString('en-CA', { timeZone: TZ });                         // YYYY-MM-DD
  const horaEmi = emitida.toLocaleTimeString('es-SV', { timeZone: TZ, hour12: false });
  const codGen = String(pago.codigo_generacion || uuidDe(pago.referencia)).toUpperCase();
  const numControl = pago.numero_control || `DTE-${tipoCod}-${emisor.codEstablecimiento}${emisor.codPuntoVenta}-${String(pago.id).padStart(15, '0')}`;
  const sello = pago.sello_recepcion || '';
  const urlConsulta = `https://admin.factura.gob.sv/consultaPublica?ambiente=${emisor.ambiente}&codGen=${encodeURIComponent(codGen)}&fechaEmi=${fechaEmi}`;

  // Los precios del sistema YA incluyen el IVA (13 %). Factura (01): se muestra "IVA incluido". Crédito fiscal (03): el precio se
  // desglosa en base gravada (sin IVA) + IVA 13 % aparte; el total es el mismo que se cobró.
  const total = r2(pago.monto);
  const gravada = ccf ? r2(total / (1 + IVA)) : total;
  const ivaMonto = r2(total - gravada);
  const filas = lineas.map((l, i) => {
    const pu = ccf ? Number(l.precio_unitario) / (1 + IVA) : Number(l.precio_unitario);
    return { n: i + 1, cant: l.cantidad, desc: NOMBRE[l.tipo] || l.tipo, pu, gravada: r2(l.cantidad * pu) };
  });
  if (ccf && filas.length) { const dif = r2(gravada - filas.reduce((x, f) => x + f.gravada, 0)); filas[filas.length - 1].gravada = r2(filas[filas.length - 1].gravada + dif); }   // absorbe el centavo de redondeo
  const puFmt = ccf ? usd4 : usd;
  const letras = totalEnLetras(total);
  const doc = pago.receptor_documento ? String(pago.receptor_documento) : '';
  const tipoDoc = doc.replace(/\D/g, '').length === 14 ? 'NIT' : doc ? 'DUI' : '';
  const completoEmisor = completo(emisor);
  const titulo = ccf ? 'COMPROBANTE DE CRÉDITO FISCAL' : 'FACTURA';
  const asunto = `${ccf ? 'Comprobante de crédito fiscal' : 'Factura electrónica'} ${numControl} · Reserva #${reserva.id}`;

  const fila = (a, b) => `<tr><td style="padding:3px 0;color:#6b7194">${a}</td><td style="padding:3px 0;text-align:right">${b}</td></tr>`;
  const caja = (titulo, cuerpo) => `<td valign="top" style="width:50%;padding:12px 14px;border:1px solid #dfe2f0;border-radius:8px;font-size:12.5px;line-height:1.55"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7194;margin-bottom:4px"><b>${titulo}</b></div>${cuerpo}</td>`;
  const dato = (k, v) => (v ? `<div><span style="color:#6b7194">${k}:</span> ${esc(v)}</div>` : '');

  const avisos = [
    sello ? '' : `<p style="margin:16px 0 0;font-size:12px;color:#8a6a2c;background:#fdf7e8;border-radius:8px;padding:10px 12px"><b>Sin Sello de Recepción.</b> Esta es una representación gráfica preliminar: el documento aún no fue transmitido al Ministerio de Hacienda, por lo que no tiene validez fiscal como DTE.</p>`,
    completoEmisor ? '' : `<p style="margin:10px 0 0;font-size:12px;color:#8a6a2c;background:#fdf7e8;border-radius:8px;padding:10px 12px"><b>Datos del emisor incompletos.</b> Configura NIT, NRC, actividad económica y dirección del negocio (variables <code>EMISOR_*</code>).</p>`,
    `<p style="margin:10px 0 0;font-size:12px;color:#8a6a2c;background:#fdf7e8;border-radius:8px;padding:10px 12px">Pago simulado de demostración: no se realizó ningún cobro real.</p>`
  ].join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#1d2140">
<div style="max-width:680px;margin:0 auto;padding:24px 12px">
 <div style="background:#fff;border-radius:12px;border:1px solid #e6e8f3;overflow:hidden">
  <div style="background:#1d2140;color:#fff;padding:18px 24px">
   <table role="presentation" style="width:100%;border-collapse:collapse"><tr>
    <td style="font-size:18px"><b>${esc(emisor.comercial)}</b><div style="font-size:12px;opacity:.75;margin-top:2px">${esc(emisor.nombre || 'Contribuyente sin configurar')}</div></td>
    <td style="text-align:right"><div style="font-size:11px;letter-spacing:.08em;opacity:.75">DOCUMENTO TRIBUTARIO ELECTRÓNICO</div><div style="font-size:${ccf ? 16 : 20}px"><b>${titulo}</b></div></td>
   </tr></table>
  </div>
  <div style="padding:20px 24px">
   <table role="presentation" style="width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:14px">
    <tr><td style="padding:2px 0;color:#6b7194;width:170px">Código de generación</td><td style="padding:2px 0;font-family:Consolas,monospace;word-break:break-all">${esc(codGen)}</td></tr>
    <tr><td style="padding:2px 0;color:#6b7194">Número de control</td><td style="padding:2px 0;font-family:Consolas,monospace;word-break:break-all">${esc(numControl)}</td></tr>
    <tr><td style="padding:2px 0;color:#6b7194">Sello de recepción</td><td style="padding:2px 0;font-family:Consolas,monospace;word-break:break-all">${sello ? esc(sello) : '<span style="color:#b0732a">PENDIENTE DE TRANSMISIÓN</span>'}</td></tr>
    <tr><td style="padding:2px 0;color:#6b7194">Modelo / transmisión</td><td style="padding:2px 0">Modelo de facturación previo · Transmisión normal</td></tr>
    <tr><td style="padding:2px 0;color:#6b7194">Fecha y hora de generación</td><td style="padding:2px 0">${esc(emitida.toLocaleDateString('es-SV', { timeZone: TZ }))} ${esc(horaEmi)}</td></tr>
    <tr><td style="padding:2px 0;color:#6b7194">Moneda</td><td style="padding:2px 0">USD (dólar de los Estados Unidos de América)</td></tr>
   </table>
   <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:0 -8px 16px"><tr>
    ${caja('Emisor', `<b>${esc(emisor.nombre || '—')}</b>${dato('NIT', emisor.nit)}${dato('NRC', emisor.nrc)}${dato('Actividad económica', [emisor.codActividad, emisor.actividad].filter(Boolean).join(' · '))}${dato('Dirección', emisor.direccion)}${dato('Teléfono', emisor.telefono)}${dato('Correo', emisor.correo)}`)}
    ${caja('Receptor', ccf
     ? `<b>${esc(pago.receptor_nombre)}</b>${dato('NIT', nitFmt(doc))}${dato('NRC', pago.receptor_nrc)}${dato('Actividad económica', [pago.receptor_cod_actividad, pago.receptor_actividad].filter(Boolean).join(' · '))}${dato('Dirección', pago.receptor_direccion)}${dato('Correo', pago.email_factura)}${dato('Reserva', `#${reserva.id} · ${dia(reserva.fecha)} · ${hhmm(reserva.hora_inicio)}–${hhmm(reserva.hora_fin)}`)}`
     : `<b>${esc(cliente.nombre)}</b>${tipoDoc ? dato(tipoDoc, doc) : '<div style="color:#6b7194">Consumidor final</div>'}${dato('Correo', pago.email_factura)}${dato('Reserva', `#${reserva.id} · ${dia(reserva.fecha)} · ${hhmm(reserva.hora_inicio)}–${hhmm(reserva.hora_fin)}`)}`)}
   </tr></table>
   <table style="width:100%;border-collapse:collapse;font-size:12.5px">
    <thead><tr style="background:#f1f3fb;text-align:left"><th style="padding:8px 6px">N.º</th><th style="padding:8px 6px;text-align:right">Cant.</th><th style="padding:8px 6px">Unidad</th><th style="padding:8px 6px">Descripción</th><th style="padding:8px 6px;text-align:right">Precio unit.${ccf ? ' (sin IVA)' : ''}</th><th style="padding:8px 6px;text-align:right">Descuento</th><th style="padding:8px 6px;text-align:right">Ventas gravadas</th></tr></thead>
    <tbody>${filas.map((f) => `<tr style="border-bottom:1px solid #eef0f8"><td style="padding:8px 6px">${f.n}</td><td style="padding:8px 6px;text-align:right">${f.cant}</td><td style="padding:8px 6px">Unidad</td><td style="padding:8px 6px">Alquiler de ${esc(f.desc.toLowerCase())}</td><td style="padding:8px 6px;text-align:right">${puFmt(f.pu)}</td><td style="padding:8px 6px;text-align:right">${usd(0)}</td><td style="padding:8px 6px;text-align:right">${usd(f.gravada)}</td></tr>`).join('')}</tbody>
   </table>
   <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:14px"><tr>
    <td valign="top" style="width:52%;font-size:12.5px;padding-right:16px">
     <div style="color:#6b7194;font-size:11px;letter-spacing:.06em;text-transform:uppercase"><b>Total en letras</b></div><div style="margin-bottom:10px">${esc(letras)}</div>
     <div style="color:#6b7194;font-size:11px;letter-spacing:.06em;text-transform:uppercase"><b>Condición de la operación</b></div><div style="margin-bottom:10px">Contado</div>
     <div style="color:#6b7194;font-size:11px;letter-spacing:.06em;text-transform:uppercase"><b>Forma de pago</b></div><div>Tarjeta de crédito/débito · ${esc(pago.marca)} •••• ${esc(pago.ultimos4)}<br><span style="color:#6b7194">Ref. ${esc(pago.referencia)}</span></div>
    </td>
    <td valign="top" style="font-size:12.5px"><table role="presentation" style="width:100%;border-collapse:collapse">
     ${fila('Suma de ventas no sujetas', usd(0))}${fila('Suma de ventas exentas', usd(0))}${fila('Suma de ventas gravadas', usd(gravada))}
     ${fila('Descuentos', usd(0))}${ccf ? fila('Impuesto al Valor Agregado 13 %', usd(ivaMonto)) + fila('Sub-total', usd(total)) : fila('IVA 13 % (incluido en el precio)', usd(ivaMonto))}${fila('Monto total de la operación', usd(total))}
     <tr><td style="padding:10px 0 0;border-top:2px solid #1d2140"><b>TOTAL A PAGAR</b></td><td style="padding:10px 0 0;border-top:2px solid #1d2140;text-align:right;font-size:18px"><b>${usd(total)}</b></td></tr>
    </table></td>
   </tr></table>
   <p style="margin:18px 0 0;font-size:12px;color:#6b7194">Consulta este documento en el portal de Hacienda: <a href="${esc(urlConsulta)}" style="color:#3b4ccf">Verificar DTE</a>.${emisor.ambiente === '00' ? ' (Ambiente de pruebas.)' : ''}<br>Conserva esta representación gráfica; puedes solicitar la invalidación de la factura dentro del plazo que fija Hacienda.</p>
   ${avisos}
  </div>
 </div>
 <p style="text-align:center;color:#9aa0c0;font-size:12px;margin-top:14px">Gracias por tu reserva.<br><b style="letter-spacing:.12em;color:#5b6ad8">SIMEP</b> · Sistema Integral de Mesas y Préstamos<br><i>Cada recurso en su lugar, cada préstamo bajo control.</i></p>
</div></body></html>`;

  const L = (k, v) => (v ? `${k}: ${v}` : null);
  const text = [ccf ? 'COMPROBANTE DE CRÉDITO FISCAL ELECTRÓNICO (DTE-03)' : 'FACTURA ELECTRÓNICA (DTE-01)', emisor.comercial, L('Razón social', emisor.nombre), L('NIT', emisor.nit), L('NRC', emisor.nrc),
    L('Actividad económica', [emisor.codActividad, emisor.actividad].filter(Boolean).join(' - ')), L('Dirección', emisor.direccion), '',
    `Código de generación: ${codGen}`, `Número de control: ${numControl}`, `Sello de recepción: ${sello || 'PENDIENTE DE TRANSMISIÓN'}`,
    `Fecha y hora: ${emitida.toLocaleDateString('es-SV', { timeZone: TZ })} ${horaEmi}`, '',
    ccf ? `Receptor: ${pago.receptor_nombre} | NIT ${nitFmt(doc)} | NRC ${pago.receptor_nrc} | Actividad: ${[pago.receptor_cod_actividad, pago.receptor_actividad].filter(Boolean).join(' - ')} | Dirección: ${pago.receptor_direccion}`
      : `Receptor: ${cliente.nombre}${tipoDoc ? ` (${tipoDoc} ${doc})` : ' (consumidor final)'}`,
    `Reserva #${reserva.id} - ${dia(reserva.fecha)} ${hhmm(reserva.hora_inicio)}-${hhmm(reserva.hora_fin)}`, '',
    ...filas.map((f) => `${f.n}. ${f.cant} x Alquiler de ${f.desc.toLowerCase()} @ ${puFmt(f.pu)} = ${usd(f.gravada)}`), '',
    `Ventas gravadas: ${usd(gravada)}`, ccf ? `IVA 13%: ${usd(ivaMonto)}` : `IVA 13% (incluido): ${usd(ivaMonto)}`, `TOTAL A PAGAR (USD): ${usd(total)}`, `Son: ${letras}`,
    'Condición: Contado', `Pago: Tarjeta ${pago.marca} **** ${pago.ultimos4} (ref. ${pago.referencia})`, '', `Verificar DTE: ${urlConsulta}`, '',
    sello ? '' : 'Sin Sello de Recepción: representación gráfica preliminar, sin validez fiscal como DTE.',
    '(Pago simulado de demostración: no se realizó ningún cobro real.)'].filter((x) => x !== null).join('\n');

  return { asunto, html, text, codigo_generacion: codGen, numero_control: numControl };
};
