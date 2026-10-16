// Verificación del ID token que entrega "Iniciar sesión con Google" (Google Identity Services).
// Se valida firma, caducidad, emisor y que el token fue emitido PARA ESTA app (audience = GOOGLE_CLIENT_ID).
const { OAuth2Client } = require('google-auth-library');
const AppError = require('./AppError');

let client;
exports.clientId = () => (process.env.GOOGLE_CLIENT_ID || '').trim() || null;

// Devuelve el payload verificado ({ sub, email, email_verified, name, picture, ... }). Lanza AppError si no es válido.
exports.verificar = async (credential) => {
  const id = exports.clientId();
  if (!id) throw new AppError('El inicio de sesión con Google no está configurado', 503);
  try {
    client = client || new OAuth2Client(id);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: id });
    return ticket.getPayload();
  } catch (e) {
    console.error('Token de Google rechazado:', e.message);
    throw new AppError('No se pudo verificar tu cuenta de Google. Intenta de nuevo.', 401);
  }
};
