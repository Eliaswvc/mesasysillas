// Motivos de mantenimiento (compartido por inventario.js y mantenimiento.js)
const MOTIVOS = { DANADO: 'Dañado', REPARACION: 'Reparación', LIMPIEZA: 'Limpieza', REVISION: 'Revisión', OTRO: 'Otro' };
const motivoOpts = (sel = 'DANADO') => Object.entries(MOTIVOS).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');

// Modal "Enviar a mantenimiento". `recursos`: lista de GET /inventario. `idPreseleccionado` opcional. `despues`: callback tras guardar.
function modalEnviarMantenimiento(recursos, idPreseleccionado, despues) {
  const lista = recursos.filter((r) => r.estado !== 'INACTIVO');
  const pre = lista.find((r) => r.id === idPreseleccionado) || lista[0];
  if (!pre) return toast('No hay recursos', 'error');
  openModal('Enviar a mantenimiento', `<label>Recurso</label><select name="inventario_id" id="mRec">${lista.map((r) => `<option value="${r.id}" ${r.id === pre.id ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}</select>
    <p class="hint" id="mDisp"></p>
    <div class="row2"><div><label>Cantidad</label><input type="number" name="cantidad" id="mCant" min="1" value="1" required></div><div><label>Motivo</label><select name="motivo">${motivoOpts()}</select></div></div>
    <label>Descripción (qué le pasa)</label><textarea name="descripcion" placeholder="Ej.: patas flojas, plástico roto, manchas…"></textarea>`,
    { submitText: 'Enviar', onSubmit: async (d, close) => {
      const r = lista.find((x) => x.id === Number(d.inventario_id));
      const n = Number(d.cantidad);
      if (!Number.isInteger(n) || n < 1) throw new Error('Cantidad inválida');
      if (n > r.cantidad_disponible) throw new Error(`Solo hay ${r.cantidad_disponible} disponibles de ${r.nombre.toLowerCase()}`);
      await api('/mantenimiento', { method: 'POST', body: { inventario_id: r.id, cantidad: n, motivo: d.motivo, descripcion: d.descripcion } });
      close(); toast(`${n} ${r.nombre.toLowerCase()} enviada(s) a mantenimiento`, 'warn'); despues();
    } });
  const sel = document.getElementById('mRec'), cant = document.getElementById('mCant');
  const info = () => {
    const r = lista.find((x) => x.id === Number(sel.value));
    document.getElementById('mDisp').textContent = `Disponibles ahora: ${r.cantidad_disponible}. Solo se pueden enviar unidades disponibles (no reservadas ni prestadas).`;
    cant.max = Math.max(1, r.cantidad_disponible);
  };
  sel.onchange = info; info();
}
