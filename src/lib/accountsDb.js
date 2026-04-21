
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
  user: process.env.DB_USER || 'voiduser',
  password: process.env.DB_PASSWORD || 'voidpass',
  database: process.env.DB_NAME || 'voidservices',
});

async function initAccountsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      username TEXT NOT NULL,
      created_at DATE NOT NULL
    );
  `);
}

export async function getAccountsByDate(dateStr) {
  await initAccountsTable();
  const res = await pool.query('SELECT username, email, password FROM accounts WHERE created_at = $1', [dateStr]);
  return res.rows;
}
