// Correo de alerta de inventario para administradores. Todo el contenido variable se escapa.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

exports.stock = ({ agotado, nombre, disponible, minimo }) => {
  const n = String(nombre).toLowerCase();
  const url = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
  const asunto = agotado ? `Sin inventario de ${n}` : `Stock bajo de ${n}`;
  const detalle = agotado
    ? `Ya no quedan ${n} disponibles. Las nuevas reservas de este recurso se rechazarán hasta que se repongan o se devuelvan.`
    : `Quedan ${disponible} ${n} disponibles (mínimo configurado: ${minimo}).`;
  const color = agotado ? '#dd7272' : '#eeb26a';
  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#1d2140">
<div style="max-width:520px;margin:0 auto;padding:24px 12px"><div style="background:#fff;border-radius:16px;padding:26px;border:1px solid #e6e8f3;border-top:5px solid ${color}">
<h2 style="margin:0 0 8px">${esc(asunto)}</h2><p style="margin:0 0 18px;font-size:15px;line-height:1.5">${esc(detalle)}</p>
${url ? `<a href="${esc(url)}/inventario.html" style="display:inline-block;background:#5b6ad8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:bold;font-size:14px">Abrir inventario</a>` : ''}
</div><p style="text-align:center;color:#9aa0c0;font-size:12px;margin-top:14px">Alerta automática del sistema de mesas y sillas.</p></div></body></html>`;
  const text = `${asunto}\n\n${detalle}${url ? `\n\nInventario: ${url}/inventario.html` : ''}`;
  return { asunto, html, text };
};
