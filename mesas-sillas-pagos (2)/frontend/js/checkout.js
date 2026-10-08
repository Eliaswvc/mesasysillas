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
    <label>Número de tarjeta <span id="marca" class="marca"></span></label>
    <input name="numero" inputmode="numeric" autocomplete="off" placeholder="4242 4242 4242 4242" required>
    <label>Nombre del titular</label><input name="titular" autocomplete="off" placeholder="Como aparece en la tarjeta" required>
    <div class="row2"><div><label>Vencimiento</label><input name="vencimiento" inputmode="numeric" autocomplete="off" placeholder="MM/AA" maxlength="5" required></div>
    <div><label>CVV</label><input name="cvv" type="password" inputmode="numeric" autocomplete="off" placeholder="123" maxlength="4" required></div></div>`,
    { submitText: `Pagar ${usd(total)}`, onSubmit: async (d, close) => {
      const pago = await api('/pagos', { method: 'POST', body: { reserva_id: reserva.id, numero: d.numero, titular: d.titular, vencimiento: d.vencimiento, cvv: d.cvv } });
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
  openModal('Pago aprobado', `<div class="receipt"><div class="ok-ico">✓</div><div class="amt">${usd(p.monto)}</div><p class="sub" style="margin:0 0 14px">Pago simulado aprobado</p>
    <dl><dt>Referencia</dt><dd>${esc(p.referencia)}</dd><dt>Reserva</dt><dd>#${p.reserva_id}</dd>
    <dt>Tarjeta</dt><dd>${esc(p.marca)} •••• ${esc(p.ultimos4)}</dd><dt>Titular</dt><dd>${esc(p.titular)}</dd><dt>Fecha</dt><dd>${fmtDateTime(p.created_at)}</dd></dl></div>`,
    { cancelText: 'Cerrar' });
}
