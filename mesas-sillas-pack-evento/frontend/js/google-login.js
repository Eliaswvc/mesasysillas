// "Continuar con Google" (Google Identity Services). El botón solo aparece si el servidor tiene GOOGLE_CLIENT_ID.
// Uso: initGoogle('gBox'); donde #gBox contiene un <div class="g-btn"></div>
function cargarScriptGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
    s.onload = ok; s.onerror = () => fail(new Error('No se pudo cargar Google'));
    document.head.appendChild(s);
  });
}

async function initGoogle(boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  try {
    const cfg = await api('/auth/config');
    if (!cfg.googleClientId) return;            // Google no configurado: no se muestra nada
    await cargarScriptGoogle();
    google.accounts.id.initialize({
      client_id: cfg.googleClientId,
      callback: async (resp) => {
        try {
          const r = await api('/auth/google', { method: 'POST', body: { credential: resp.credential } });
          localStorage.setItem('token', r.token); localStorage.setItem('user', JSON.stringify(r.user));
          location.href = r.nuevo ? 'catalogo.html' : 'dashboard.html';
        } catch (e) { toast(e.message, 'error'); }
      }
    });
    const slot = box.querySelector('.g-btn');
    google.accounts.id.renderButton(slot, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', locale: 'es', logo_alignment: 'center',
      width: Math.max(200, Math.min(400, Math.round(box.parentElement.clientWidth || 360))) });
    box.hidden = false;
  } catch (e) { console.warn('Google no disponible:', e.message); }   // sin red a Google: el login normal sigue funcionando
}
