require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10
});

const query = (text, params) => pool.query(text, params);

// Ejecuta fn(client) dentro de BEGIN/COMMIT, con ROLLBACK ante cualquier error.
// client.despuesDeCommit(fn) registra tareas (p. ej. enviar un correo) que corren SOLO si la transacción se confirma.
async function withTransaction(fn) {
  const client = await pool.connect();
  const despues = [];
  client.despuesDeCommit = (f) => despues.push(f);
  let result;
  try {
    await client.query('BEGIN');
    result = await fn(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  for (const f of despues) Promise.resolve().then(f).catch((e) => console.error('Tarea posterior al commit falló:', e.message));
  return result;
}

module.exports = { pool, query, withTransaction };
