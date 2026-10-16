// Construye la factura (HTML + texto) de un pago aprobado. Todo el contenido variable se escapa.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
const NOMBRE = { MESA: 'Mesa', SILLA: 'Silla' };
const dia = (d) => new Date(d).toLocaleDateString('es-SV', { timeZone: 'UTC' });   // fecha de reserva (DATE)
const hhmm = (t) => String(t).slice(0, 5);

exports.construir = ({ pago, reserva, lineas, cliente }) => {
  const emitida = new Date(pago.created_at).toLocaleString('es-SV', { timeZone: 'America/El_Salvador' });
  const filas = lineas.map((l) => ({
    desc: NOMBRE[l.tipo] || l.tipo, cant: l.cantidad, pu: Number(l.precio_unitario), sub: l.cantidad * Number(l.precio_unitario)
  }));
  const asunto = `Factura ${pago.referencia} · Reserva #${reserva.id}`;

  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#1d2140">
<div style="max-width:560px;margin:0 auto;padding:24px 12px">
 <div style="background:#fff;border-radius:16px;padding:28px;border:1px solid #e6e8f3">
  <h2 style="margin:0 0 4px">Factura</h2>
  <p style="margin:0 0 18px;color:#6b7194;font-size:14px">N.º ${esc(pago.referencia)} · ${esc(emitida)}</p>
  <p style="margin:0 0 4px;font-size:14px"><b>Cliente:</b> ${esc(cliente.nombre)}</p>
  <p style="margin:0 0 4px;font-size:14px"><b>Reserva:</b> #${reserva.id} · ${esc(dia(reserva.fecha))} · ${esc(hhmm(reserva.hora_inicio))}–${esc(hhmm(reserva.hora_fin))}</p>
  <p style="margin:0 0 18px;font-size:14px"><b>Pago:</b> ${esc(pago.marca)} •••• ${esc(pago.ultimos4)} (${esc(pago.titular)})</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
   <thead><tr style="text-align:left;border-bottom:2px solid #e6e8f3"><th style="padding:8px 0">Descripción</th><th style="text-align:right">Cant.</th><th style="text-align:right">P. unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
   <tbody>${filas.map((f) => `<tr style="border-bottom:1px solid #eef0f8"><td style="padding:8px 0">${esc(f.desc)}</td><td style="text-align:right">${f.cant}</td><td style="text-align:right">${usd(f.pu)}</td><td style="text-align:right">${usd(f.sub)}</td></tr>`).join('')}</tbody>
   <tfoot><tr><td colspan="3" style="padding-top:12px;text-align:right"><b>Total pagado (USD)</b></td><td style="padding-top:12px;text-align:right;font-size:18px"><b>${usd(pago.monto)}</b></td></tr></tfoot>
  </table>
  <p style="margin:22px 0 0;font-size:12px;color:#8a6a2c;background:#fdf7e8;border-radius:10px;padding:10px">Pago simulado de demostración: no se realizó ningún cobro real.</p>
 </div>
 <p style="text-align:center;color:#9aa0c0;font-size:12px;margin-top:14px">Gracias por tu reserva.</p>
</div></body></html>`;

  const text = [`FACTURA ${pago.referencia}`, emitida, '', `Cliente: ${cliente.nombre}`,
    `Reserva #${reserva.id} - ${dia(reserva.fecha)} ${hhmm(reserva.hora_inicio)}-${hhmm(reserva.hora_fin)}`,
    `Pago: ${pago.marca} **** ${pago.ultimos4}`, '',
    ...filas.map((f) => `${f.desc} x${f.cant} @ ${usd(f.pu)} = ${usd(f.sub)}`), '', `TOTAL (USD): ${usd(pago.monto)}`,
    '', '(Pago simulado de demostración: no se realizó ningún cobro real.)'].join('\n');

  return { asunto, html, text };
};
