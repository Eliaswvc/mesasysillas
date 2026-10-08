let datos = [];
function pintar() {
  const q = document.getElementById('q').value;
  const rows = filtrar(datos, q, ['nombre', 'email', 'rol']);
  document.getElementById('tabla').innerHTML = `<table><thead><tr><th>#</th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Activo</th><th></th></tr></thead><tbody>
  ${rows.map((u) => `<tr><td>${u.id}</td><td>${esc(u.nombre)}</td><td>${esc(u.email)}</td><td>${u.rol}</td><td>${u.activo ? 'Sí' : 'No'}</td><td><button class="btn btn-sm" data-id="${u.id}">Editar</button></td></tr>`).join('')}</tbody></table>`;
  document.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => formulario(datos.find((u) => u.id === Number(b.dataset.id)))));
}
function formulario(u) {
  const nuevo = !u;
  openModal(nuevo ? 'Nuevo usuario' : 'Editar usuario', `<label>Nombre</label><input name="nombre" value="${esc(u?.nombre || '')}" required>
    ${nuevo ? '<label>Correo</label><input type="email" name="email" required>' : ''}
    <label>${nuevo ? 'Contraseña' : 'Nueva contraseña (opcional)'}</label><input type="password" name="password" minlength="8" ${nuevo ? 'required' : ''}>
    <label>Rol</label><select name="rol">${['USER', 'ADMIN'].map((r) => `<option ${u?.rol === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
    ${nuevo ? '' : `<label>Estado</label><select name="activo"><option value="true" ${u.activo ? 'selected' : ''}>Activo</option><option value="false" ${!u.activo ? 'selected' : ''}>Inactivo</option></select>`}`,
    { onSubmit: async (d, close) => {
      if (nuevo) await api('/usuarios', { method: 'POST', body: d });
      else await api('/usuarios/' + u.id, { method: 'PUT', body: { nombre: d.nombre, rol: d.rol, activo: d.activo === 'true', password: d.password || undefined } });
      close(); toast('Usuario guardado'); cargar();
    } });
}
async function cargar() { datos = await api('/usuarios'); pintar(); }
document.getElementById('view').innerHTML = `<div class="toolbar"><input id="q" placeholder="Buscar…"><span class="sp"></span><button class="btn" id="nuevo">+ Nuevo usuario</button></div><div class="table-wrap" id="tabla"></div>`;
document.getElementById('q').oninput = pintar;
document.getElementById('nuevo').onclick = () => formulario(null);
cargar().catch((e) => toast(e.message, 'error'));
