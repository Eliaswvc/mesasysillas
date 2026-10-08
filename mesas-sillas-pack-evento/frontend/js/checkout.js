// Pago SIMULADO con tarjeta (USD). No se cobra dinero real.
// El número de tarjeta y el CVV viajan solo en la petición de pago; el servidor guarda únicamente marca y últimos 4 dígitos.
const TARJETAS_PRUEBA = [
  ['4242 4242 4242 4242', 'Aprobada'],
  ['5555 5555 5555 4444', 'Aprobada'],
  ['4000 0000 0000 0002', 'Rechazada'],
  ['4000 0000 0000 9995', 'Sin fondos']
];

function formatoNumero(v) {
  const d = v.replace(/\D/g, '').slice(0, 19);
  if (/^3[47]/.test(d)) return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ');   // AMEX 4-6-5
  return d.replace(/(\d{4})(?=\d)/g, '$1 ');
}
const formatoVenc = (v) => { const d = v.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; };
const marcaDe = (d) => (/^4/.test(d) ? 'VISA' : /^(5[1-5]|2[2-7])/.test(d) ? 'MASTERCARD' : /^3[47]/.test(d) ? 'AMEX' : '');

function abrirPago(reserva, onDone) {
  if (!reserva) return;
  const total = Number(reserva.total);
  const m = openModal('Pagar reserva #' + reserva.id, `
    <div class="pay-summary"><span>Total a pagar</span><b>${usd(total)}</b></div>
    <div class="sim-banner"><b>Pago simulado:</b> no se realiza ningún cobro real. Usa una tarjeta de prueba:
      <div class="chips">${TARJETAS_PRUEBA.map(([n, t]) => `<button type="button" class="chip" data-card="${n}">${n}<small>${t}</small></button>`).join('')}</div></div>
    <label>Correo para la factura</label>
    <input name="email" type="email" autocomplete="email" placeholder="tucorreo@ejemplo.com" value="${esc(getUser()?.email || '')}" maxlength="160" required>
    <p class="hint" style="margin:4px 0 0">Te enviaremos la factura a este correo cuando el pago sea aprobado.</p>
    <label>Número de tarjeta <span id="marca" class="marca"></span></label>
    <input name="numero" inputmode="numeric" autocomplete="off" placeholder="4242 4242 4242 4242" required>
    <label>Nombre del titular</label><input name="titular" autocomplete="off" placeholder="Como aparece en la tarjeta" required>
    <div class="row2"><div><label>Vencimiento</label><input name="vencimiento" inputmode="numeric" autocomplete="off" placeholder="MM/AA" maxlength="5" required></div>
    <div><label>CVV</label><input name="cvv" type="password" inputmode="numeric" autocomplete="off" placeholder="123" maxlength="4" required></div></div>`,
    { submitText: `Pagar ${usd(total)}`, onSubmit: async (d, close) => {
      const pago = await api('/pagos', { method: 'POST', body: { reserva_id: reserva.id, email: d.email, numero: d.numero, titular: d.titular, vencimiento: d.vencimiento, cvv: d.cvv } });
      close(); recibo(pago); if (onDone) onDone(pago);
    } });
  const f = m.el.querySelector('form'), num = f.numero;
  num.addEventListener('input', () => { num.value = formatoNumero(num.value); m.el.querySelector('#marca').textContent = marcaDe(num.value.replace(/\s/g, '')); });
  f.vencimiento.addEventListener('input', () => { f.vencimiento.value = formatoVenc(f.vencimiento.value); });
  f.cvv.addEventListener('input', () => { f.cvv.value = f.cvv.value.replace(/\D/g, ''); });
  m.el.querySelectorAll('[data-card]').forEach((b) => b.addEventListener('click', () => {
    num.value = b.dataset.card; num.dispatchEvent(new Event('input'));
    if (!f.titular.value) f.titular.value = (getUser()?.nombre || 'Titular de prueba');
    if (!f.vencimiento.value) f.vencimiento.value = '12/30';
    if (!f.cvv.value) f.cvv.value = '123';
  }));
  num.focus();
}

function recibo(p) {
  const m = openModal('Pago aprobado', `<div class="receipt"><div class="ok-ico">✓</div><div class="amt">${usd(p.monto)}</div><p class="sub" style="margin:0 0 14px">Pago simulado aprobado</p>
    <dl><dt>Referencia</dt><dd>${esc(p.referencia)}</dd><dt>Reserva</dt><dd>#${p.reserva_id}</dd>
    <dt>Tarjeta</dt><dd>${esc(p.marca)} •••• ${esc(p.ultimos4)}</dd><dt>Titular</dt><dd>${esc(p.titular)}</dd><dt>Fecha</dt><dd>${fmtDateTime(p.created_at)}</dd></dl>
    <div id="fact" style="margin-top:12px;font-size:13px"></div></div>`,
    { cancelText: 'Cerrar' });
  const box = m.el.querySelector('#fact');
  const pintar = (f) => {
    if (f?.enviada) { box.innerHTML = `<span class="badge ACTIVO">✓ Factura enviada a <b>${esc(f.email)}</b></span><br><small>Revisa también la carpeta de spam.</small>`; return; }
    box.innerHTML = `<div class="sim-banner" style="margin:0">No pudimos enviar la factura a <b>${esc(f?.email || p.email_factura || 'tu correo')}</b>. Tu pago sí quedó registrado.<br><button type="button" class="btn btn-ghost" id="reenviar" style="margin-top:8px">Reintentar envío</button></div>`;
    box.querySelector('#reenviar').onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = 'Enviando…';
      try { pintar(await api(`/pagos/${p.id}/factura`, { method: 'POST' })); } catch (err) { toast(err.message, 'error'); e.target.disabled = false; e.target.textContent = 'Reintentar envío'; }
    };
  };
  pintar(p.factura);
}
