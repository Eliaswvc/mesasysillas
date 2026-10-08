// Envío de correos. Dos opciones (la primera que esté configurada):
//   1) Resend (API HTTPS)  -> RESEND_API_KEY      (recomendado en Render gratis: bloquea los puertos SMTP)
//   2) SMTP (nodemailer)   -> SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
// Remitente: MAIL_FROM  (ej.: "Mesas y Sillas <facturas@tudominio.com>")
const FROM = () => process.env.MAIL_FROM || process.env.SMTP_USER || 'onboarding@resend.dev';

exports.configurado = () => Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST);

async function viaResend({ to, subject, html, text }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM(), to: [to], subject, html, text }),
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

let transporte;
async function viaSmtp({ to, subject, html, text }) {
  if (!transporte) {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT || 587);
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port, secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000
    });
  }
  await transporte.sendMail({ from: FROM(), to, subject, html, text });
}

exports.enviar = async (msg) => {
  if (process.env.RESEND_API_KEY) return viaResend(msg);
  if (process.env.SMTP_HOST) return viaSmtp(msg);
  throw new Error('Correo no configurado');
};
