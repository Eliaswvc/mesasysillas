// Diagnóstico del correo (solo ADMIN). Muestra qué proveedores hay configurados en el servidor y permite enviar una prueba
// que devuelve el error EXACTO de cada proveedor, para arreglar la configuración de Render sin adivinar.
if (!isAdmin()) location.href = 'dashboard.html';

function pintar(e) {
  const orden = (id) => e.orden.indexOf(id);
  document.getElementById('view').innerHTML = `<div class="grid c2">
    <div class="card"><h3>Proveedores</h3>
      ${e.proveedores.map((p) => `<div class="proveedor"><span class="${p.activo ? 'estado-ok' : 'estado-no'}" style="margin-top:5px"></span>
        <div><b>${esc(p.nombre)}</b> ${p.activo ? `<span class="badge ACTIVO">Intento n.º ${orden(p.id) + 1}</span>` : '<span class="badge INACTIVO">No configurado</span>'}<small>${esc(p.nota)}</small></div></div>`).join('')}
      <p class="hint">Remitente: <code>${esc(e.remitente)}</code><br>${e.configurado
        ? 'Si un proveedor falla, el sistema prueba automáticamente el siguiente.'
        : '<b>No hay ninguno configurado:</b> agrega las variables de entorno en Render y vuelve a desplegar.'}</p></div>
    <div class="card"><h3>Enviar correo de prueba</h3>
      <form id="f"><label for="to">Destinatario</label><input id="to" name="to" type="email" inputmode="email" autocomplete="email" placeholder="tucorreo@ejemplo.com" required maxlength="160">
      <button class="btn" id="go" style="width:100%;justify-content:center;margin-top:14px" ${e.configurado ? '' : 'disabled'}>Enviar prueba</button></form>
      <div id="res" aria-live="polite"></div></div></div>
    <div class="card" style="margin-top:16px"><h3>¿Cómo hacerlo funcionar en Render (plan gratis)?</h3>
      <p class="hint" style="margin-top:0">Render gratis <b>bloquea SMTP</b>, así que usa un proveedor por HTTPS:</p>
      <ol class="hint" style="margin:0;padding-left:20px"><li><b>Gmail vía Apps Script</b> (sin dominio, a cualquier destinatario): pega <code>docs/correo-apps-script.gs</code> en script.google.com, publícalo como aplicación web y define <code>MAIL_WEBHOOK_URL</code> y <code>MAIL_WEBHOOK_SECRET</code>.</li>
      <li><b>Brevo</b>: <code>BREVO_API_KEY</code> + <code>MAIL_FROM</code> con un remitente validado.</li>
      <li><b>Resend</b>: <code>RESEND_API_KEY</code>; para escribir a terceros hay que verificar un dominio.</li></ol></div>`;
  const f = document.getElementById('f'), res = document.getElementById('res'), go = document.getElementById('go');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault(); go.disabled = true; go.textContent = 'Enviando…'; res.innerHTML = '';
    try {
      const r = await api('/correo/prueba', { method: 'POST', body: { to: f.to.value } });
      res.innerHTML = `<div class="resultado ok">✓ Enviado a <b>${esc(r.to)}</b> con <b>${esc(r.proveedor)}</b>. Revisa la bandeja (y spam).</div>`;
    } catch (err) { res.innerHTML = `<div class="resultado err"><b>Falló.</b> ${esc(err.message)}</div>`; }
    go.disabled = false; go.textContent = 'Enviar prueba';
  });
}
api('/correo/estado').then(pintar).catch((e) => { toast(e.message, 'error'); document.getElementById('view').innerHTML = '<div class="empty">No se pudo cargar el estado del correo</div>'; });
