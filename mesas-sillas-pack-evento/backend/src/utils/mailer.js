// Envío de correos por HTTPS (funciona en Render gratis) con respaldo automático entre proveedores.
// Proveedores (se prueban en este orden; si uno falla se intenta el siguiente):
//   1) Resend            -> RESEND_API_KEY   (a terceros requiere dominio verificado)
//   2) Brevo             -> BREVO_API_KEY    (remitente verificado; permite Gmail)
//   3) Google Apps Script-> MAIL_WEBHOOK_URL (+ MAIL_WEBHOOK_SECRET)  envía desde tu Gmail a cualquiera, sin dominio
//   4) SMTP (nodemailer) -> SMTP_HOST...     (Render gratis BLOQUEA los puertos SMTP; solo sirve en local)
// MAIL_PROVIDER=resend|brevo|webhook|smtp  fuerza cuál se intenta primero.
// Remitente: MAIL_FROM  (ej.: "Mesas y Sillas <facturas@tudominio.com>")
const FROM = () => process.env.MAIL_FROM || process.env.SMTP_USER || 'onboarding@resend.dev';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// "Nombre <correo@x.com>" -> { name, email }
function parseFrom(f) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(f);
  return m ? { name: m[1].replace(/^"|"$/g, '') || undefined, email: m[2] } : { email: f.trim() };
}

// fetch con timeout y UN reintento ante fallo de red, 429 o 5xx (Render gratis a veces tarda en la primera salida)
async function http(url, opts, limite) {
  let ultimo;
  for (let intento = 0; intento < 2; intento++) {
    const restante = limite - Date.now();
    if (restante < 1500) break;
    try {
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(Math.min(9000, restante)) });
      if ((r.status === 429 || r.status >= 500) && intento === 0) { ultimo = new Error(`HTTP ${r.status}`); await esperar(700); continue; }
      return r;
    } catch (e) { ultimo = e; if (intento === 0) await esperar(700); }
  }
  throw ultimo || new Error('tiempo de espera agotado');
}

async function viaResend({ to, subject, html, text }, limite) {
  const r = await http('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM(), to: [to], subject, html, text })
  }, limite);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function viaBrevo({ to, subject, html, text }, limite) {
  const r = await http('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender: parseFrom(FROM()), to: [{ email: to }], subject, htmlContent: html, textContent: text })
  }, limite);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// Google Apps Script publicado como "aplicación web" (ver docs/correo-apps-script.gs). Envía desde tu Gmail.
async function viaWebhook({ to, subject, html, text }, limite) {
  const r = await http(process.env.MAIL_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: process.env.MAIL_WEBHOOK_SECRET || '', to, subject, html, text, name: parseFrom(FROM()).name })
  }, limite);
  const cuerpo = await r.text();
  let j;
  try { j = JSON.parse(cuerpo); } catch {
    throw new Error('respuesta inesperada de Apps Script (¿URL mal copiada o acceso distinto a "Cualquier persona"?)');
  }
  if (!j.ok) throw new Error(j.error || 'Apps Script rechazó el envío');
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

const PROVEEDORES = [
  { id: 'resend', nombre: 'Resend', activo: () => Boolean(process.env.RESEND_API_KEY), enviar: viaResend,
    nota: 'Sin dominio verificado solo envía a tu propio correo de Resend.' },
  { id: 'brevo', nombre: 'Brevo', activo: () => Boolean(process.env.BREVO_API_KEY), enviar: viaBrevo,
    nota: 'El remitente (MAIL_FROM) debe estar validado en Brevo.' },
  { id: 'webhook', nombre: 'Gmail vía Apps Script', activo: () => Boolean(process.env.MAIL_WEBHOOK_URL), enviar: viaWebhook,
    nota: 'Gmail personal: unos 100 correos por día.' },
  { id: 'smtp', nombre: 'SMTP', activo: () => Boolean(process.env.SMTP_HOST), enviar: viaSmtp,
    nota: 'Render gratis bloquea los puertos SMTP: solo funciona en local o en planes de pago.' }
];

function activos() {
  const a = PROVEEDORES.filter((p) => p.activo());
  const pref = (process.env.MAIL_PROVIDER || '').trim().toLowerCase();
  return pref ? [...a.filter((p) => p.id === pref), ...a.filter((p) => p.id !== pref)] : a;
}

const motivo = (e) => (e.name === 'TimeoutError' ? 'tiempo de espera agotado' : `${e.message}${e.cause?.code ? ` (${e.cause.code})` : ''}`);

exports.configurado = () => activos().length > 0;

// Para el panel de administración: nunca expone claves.
exports.estado = () => ({
  configurado: exports.configurado(),
  remitente: FROM(),
  orden: activos().map((p) => p.id),
  proveedores: PROVEEDORES.map((p) => ({ id: p.id, nombre: p.nombre, activo: p.activo(), nota: p.nota }))
});

// Devuelve { proveedor } con el que lo envió. Lanza Error con el detalle de cada proveedor si todos fallan.
exports.enviar = async (msg) => {
  const lista = activos();
  if (!lista.length) throw new Error('Correo no configurado');
  const limite = Date.now() + 20000;      // tope total para no dejar al usuario esperando
  const fallos = [];
  for (const p of lista) {
    if (limite - Date.now() < 1500) { fallos.push(`${p.nombre}: sin tiempo`); break; }
    try { await p.enviar(msg, limite); return { proveedor: p.id }; }
    catch (e) { const m = motivo(e); console.error(`Correo vía ${p.nombre} falló: ${m}`); fallos.push(`${p.nombre}: ${m}`); }
  }
  throw new Error(fallos.join(' | '));
};
