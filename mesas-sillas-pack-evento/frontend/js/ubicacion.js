const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const hhmm = (h) => { const hr = Math.floor(h), m = Math.round((h - hr) * 60); return `${String(hr).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };

// Hora actual en la zona del local (El Salvador, UTC-6, sin horario de verano)
function ahoraLocal() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: LOCAL.zona, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { dia: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), hora: Number(p.hour) + Number(p.minute) / 60 };
}
function estadoLocal() {
  const { dia, hora } = ahoraLocal(), h = LOCAL.horario[dia];
  if (h && hora >= h[0] && hora < h[1]) return { abierto: true, txt: `Abierto ahora · cierra a las ${hhmm(h[1])}` };
  for (let i = 0; i < 8; i++) {                       // próxima apertura
    const d = (dia + i) % 7, hd = LOCAL.horario[d];
    if (hd && (i > 0 || hora < hd[0])) return { abierto: false, txt: `Cerrado ahora · abre ${i === 0 ? 'hoy' : i === 1 ? 'mañana' : DIAS[d].toLowerCase()} a las ${hhmm(hd[0])}` };
  }
  return { abierto: false, txt: 'Cerrado' };
}

function render() {
  const { lat, lng } = LOCAL, e = estadoLocal(), hoy = ahoraLocal().dia;
  const bbox = [lng - 0.011, lat - 0.0065, lng + 0.011, lat + 0.0065].map((n) => n.toFixed(5)).join('%2C');
  const mapa = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, ruta = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const osm = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
  const tel = LOCAL.telefono.replace(/[^\d+]/g, '');
  const publico = document.body.dataset.public === '1';
  const filas = [1, 2, 3, 4, 5, 6, 0].map((d) => `<tr class="${d === hoy ? 'hoy' : ''}"><td>${DIAS[d]}${d === hoy ? ' <small>(hoy)</small>' : ''}</td><td>${LOCAL.horario[d] ? `${hhmm(LOCAL.horario[d][0])} – ${hhmm(LOCAL.horario[d][1])}` : 'Cerrado'}</td></tr>`).join('');
  document.getElementById('view').innerHTML = `${publico ? `<div class="pub-top"><img class="logo-img" src="img/logo.svg" alt="SIMEP" width="30" height="30"><span class="b-txt"><b>SIMEP</b></span><span class="sp"></span><a class="btn btn-sm" href="login.html">Iniciar sesión</a></div>` : ''}
  ${LOCAL.ficticio ? `<div class="alert-box warn" role="note">${icon('alert')}<span><b>Ubicación ficticia de ejemplo.</b> Esta dirección y estos datos de contacto no son reales.</span></div>` : ''}
  <div class="loc-grid">
    <div class="card loc-map"><iframe title="Mapa: ${esc(LOCAL.nombre)}" src="${mapa}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
      <div class="loc-actions"><a class="btn" href="${ruta}" target="_blank" rel="noopener">${icon('pin')} Cómo llegar</a><a class="btn btn-ghost" href="${gmaps}" target="_blank" rel="noopener">Abrir en Google Maps</a><a class="btn btn-ghost" href="${osm}" target="_blank" rel="noopener">OpenStreetMap</a></div></div>
    <div class="card loc-info">
      <h2>${esc(LOCAL.nombre)}</h2>
      <p class="loc-estado ${e.abierto ? 'abierto' : 'cerrado'}"><i></i>${esc(e.txt)}</p>
      <h3>Dirección</h3><p>${LOCAL.direccion.map(esc).join('<br>')}</p><p class="hint" style="margin-top:6px">${esc(LOCAL.referencia)}</p>
      <h3>Contacto</h3><p><a href="tel:${esc(tel)}">${esc(LOCAL.telefono)}</a><br><a href="mailto:${esc(LOCAL.correo)}">${esc(LOCAL.correo)}</a></p>
      <h3>Horario de atención</h3><table class="loc-horario"><tbody>${filas}</tbody></table>
    </div>
  </div>
  <div class="card" style="margin-top:18px"><h3 style="margin-top:0">Retiro y entrega</h3>
    <p style="margin:0 0 10px">Puedes retirar tus mesas y sillas en el local o coordinar la entrega. Las devoluciones se reciben en el mismo local, dentro del horario de atención.</p>
    <p class="hint" style="margin:0">Zonas de cobertura de entrega:</p><div class="chips loc-zonas">${LOCAL.cobertura.map((z) => `<span class="badge mant">${esc(z)}</span>`).join('')}</div></div>`;
}
render();
setInterval(() => { if (!document.hidden) render(); }, 60000);   // mantiene al día el "abierto ahora"
