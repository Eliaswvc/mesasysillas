const COL = { ok: '#6cc4a4', warn: '#f0bd7e', pri: '#7b88e8', err: '#ea9a9a', gray: '#b4bbd2' };
const EST_COL = { PENDIENTE: '#f0bd7e', CONFIRMADA: '#6cc4a4', CANCELADA: '#ea9a9a', FINALIZADA: '#8d98ee', ACTIVO: '#6cc4a4', PARCIALMENTE_DEVUELTO: '#f2a97f', DEVUELTO: '#8d98ee', VENCIDO: '#ea9a9a' };
if (window.Chart) { Chart.defaults.font.family = '"Plus Jakarta Sans", Inter, system-ui, sans-serif'; Chart.defaults.color = '#7a829c'; Chart.defaults.animation.duration = 900; Chart.defaults.animation.easing = 'easeOutQuart'; }
let charts = [];

const stat = (label, value, ic, cls = '') => `<div class="card stat ${cls}"><div class="ico">${icon(ic)}</div><div><div class="label">${label}</div><div class="value">${value}</div></div></div>`;

function resumen(inv) {
  const t = inv.cantidad_total || 1, w = (n) => ((n / t) * 100).toFixed(1);
  return `<h2 class="section-title">${esc(inv.nombre)}</h2>
  <div class="grid c4">${stat('Total', inv.cantidad_total, 'box')}${stat('Disponibles', inv.cantidad_disponible, 'box', 'ok')}
  ${stat('Reservadas', inv.cantidad_reservada, 'calendar', 'warn')}${stat('Prestadas', inv.cantidad_prestada, 'out', 'err')}</div>
  <div class="bar"><i class="d" style="width:${w(inv.cantidad_disponible)}%"></i><i class="r" style="width:${w(inv.cantidad_reservada)}%"></i><i class="p" style="width:${w(inv.cantidad_prestada)}%"></i></div>`;
}

function dona(id, inv) {
  return new Chart(document.getElementById(id), {
    type: 'doughnut',
    data: { labels: ['Disponibles', 'Reservadas', 'Prestadas'], datasets: [{ data: [inv.cantidad_disponible, inv.cantidad_reservada, inv.cantidad_prestada], backgroundColor: [COL.ok, COL.warn, COL.err], borderWidth: 3, borderColor: '#fff', hoverOffset: 6 }] },
    options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom' } } }
  });
}

function porEstado(id, rows, tipo) {
  return new Chart(document.getElementById(id), {
    type: 'bar',
    data: { labels: rows.map((r) => r.estado.replace('_', ' ')), datasets: [{ label: tipo, data: rows.map((r) => r.n), backgroundColor: rows.map((r) => EST_COL[r.estado] || COL.gray), borderRadius: 10, borderSkipped: false, maxBarThickness: 46 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eef0f7' }, border: { display: false } }, x: { grid: { display: false } } } }
  });
}

async function cargar() {
  try {
    const d = await api('/dashboard');
    const o = d.operaciones, g = d.graficas;
    charts.forEach((c) => c.destroy()); charts = [];
    document.getElementById('view').innerHTML = alertasStock(d.inventario) + d.inventario.map(resumen).join('') +
      `<h2 class="section-title">Operaciones ${d.alcance === 'personal' ? '(tus datos)' : ''}</h2>
       <div class="grid c4">${stat('Reservas pendientes', o.reservas_pendientes, 'calendar', 'warn')}${stat('Préstamos activos', o.prestamos_activos, 'out')}
       ${stat('Préstamos vencidos', o.prestamos_vencidos, 'clock', 'err')}${stat('Devoluciones pendientes', o.devoluciones_pendientes, 'back')}</div>
       <h2 class="section-title">Finanzas en USD (pagos simulados) ${d.alcance === 'personal' ? '(tus datos)' : ''}</h2>
       <div class="grid c4">${stat('Cobrado', usd(d.finanzas.cobrado), 'card', 'ok')}${stat('Reembolsado', usd(d.finanzas.reembolsado), 'back')}
       ${stat('Ingresos netos', usd(d.finanzas.cobrado - d.finanzas.reembolsado), 'card')}${stat('Por cobrar', usd(d.finanzas.por_cobrar), 'clock', 'warn')}</div>
       <h2 class="section-title">Análisis</h2>
       <div class="grid c2">${d.inventario.map((i, k) => `<div class="card"><h3>Distribución de ${esc(i.nombre.toLowerCase())}</h3><div class="chart-box sm"><canvas id="dona${k}"></canvas></div></div>`).join('')}</div>
       <div class="grid c2" style="margin-top:16px">
         <div class="card"><h3>Préstamos por estado</h3><div class="chart-box sm"><canvas id="cPrest"></canvas></div></div>
         <div class="card"><h3>Reservas por estado</h3><div class="chart-box sm"><canvas id="cRes"></canvas></div></div></div>
       ${g.actividad_7d.length ? `<div class="card" style="margin-top:16px"><h3>Actividad de los últimos 7 días (unidades)</h3><div class="chart-box"><canvas id="cAct"></canvas></div></div>` : ''}`;
    if (!window.Chart) return;   // sin Chart.js (CDN caído o red lenta) igual se ven los números
    d.inventario.forEach((i, k) => charts.push(dona('dona' + k, i)));
    charts.push(porEstado('cPrest', g.prestamos_por_estado, 'Préstamos'), porEstado('cRes', g.reservas_por_estado, 'Reservas'));
    if (g.actividad_7d.length) charts.push(new Chart(document.getElementById('cAct'), {
      type: 'line',
      data: { labels: g.actividad_7d.map((r) => r.dia), datasets: [
        { label: 'Reservas', data: g.actividad_7d.map((r) => r.reservas), borderColor: COL.warn, backgroundColor: COL.warn + '2e', tension: .4, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderWidth: 2, fill: true },
        { label: 'Préstamos', data: g.actividad_7d.map((r) => r.prestamos), borderColor: COL.pri, backgroundColor: COL.pri + '2e', tension: .4, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderWidth: 2, fill: true },
        { label: 'Devoluciones', data: g.actividad_7d.map((r) => r.devoluciones), borderColor: COL.ok, backgroundColor: COL.ok + '2e', tension: .4, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderWidth: 2, fill: true }] },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, grid: { color: '#eef0f7' }, border: { display: false } }, x: { grid: { display: false } } } }
    }));
  } catch (e) { toast(e.message, 'error'); }
}
cargar();
setInterval(cargar, 30000);
