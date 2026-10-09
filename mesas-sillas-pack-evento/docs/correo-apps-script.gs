/**
 * Relé de correo para Render: envía desde TU Gmail a cualquier destinatario, sin dominio propio.
 * Gmail personal: ~100 correos/día (suficiente para facturas y alertas).
 *
 * PASOS
 * 1. Entra a https://script.google.com → Nuevo proyecto → pega TODO este archivo.
 * 2. Cambia SECRETO por una frase larga y aleatoria (la misma irá en MAIL_WEBHOOK_SECRET).
 * 3. Implementar → Nueva implementación → tipo "Aplicación web":
 *      Ejecutar como: Yo   |   Quién tiene acceso: Cualquier persona
 *    Autoriza los permisos cuando Google los pida (necesita enviar correos).
 * 4. Copia la URL que termina en /exec y en Render define:
 *      MAIL_WEBHOOK_URL    = esa URL
 *      MAIL_WEBHOOK_SECRET = el mismo SECRETO
 *      MAIL_FROM           = Mesas y Sillas <tucorreo@gmail.com>   (solo el nombre se usa; el remitente real es tu Gmail)
 * 5. Si cambias este código, vuelve a "Implementar → Administrar implementaciones → Editar → Nueva versión".
 */
const SECRETO = 'cambia-esto-por-una-frase-larga';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRETO) return salida({ ok: false, error: 'secreto incorrecto' });
    if (!d.to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.to)) return salida({ ok: false, error: 'destinatario inválido' });
    MailApp.sendEmail({
      to: d.to,
      subject: String(d.subject || '(sin asunto)').slice(0, 200),
      htmlBody: d.html || undefined,
      body: d.text || '',
      name: d.name || 'Mesas y Sillas'
    });
    return salida({ ok: true });
  } catch (err) {
    return salida({ ok: false, error: String(err) });
  }
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
