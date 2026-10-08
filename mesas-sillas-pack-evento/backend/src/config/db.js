require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10
});

const query = (text, params) => pool.query(text, params);

// Ejecuta fn(client) dentro de BEGIN/COMMIT, con ROLLBACK ante cualquier error
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
