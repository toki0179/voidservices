
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
  user: process.env.DB_USER || 'voiduser',
  password: process.env.DB_PASSWORD || 'voidpass',
  database: process.env.DB_NAME || 'voidservices',
});

async function initTokenTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS selfbot_tokens (
      id SERIAL PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      token TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_id ON selfbot_tokens(user_id);`);
}

export async function saveToken(userId, token) {
  await initTokenTable();
  await pool.query(
    `INSERT INTO selfbot_tokens (user_id, token, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
       token = EXCLUDED.token,
       updated_at = CURRENT_TIMESTAMP`,
    [userId, token]
  );
}

export async function getToken(userId) {
  await initTokenTable();
  const res = await pool.query('SELECT token FROM selfbot_tokens WHERE user_id = $1', [userId]);
  return res.rows.length ? res.rows[0].token : null;
}

export async function deleteToken(userId) {
  await initTokenTable();
  await pool.query('DELETE FROM selfbot_tokens WHERE user_id = $1', [userId]);
}

export function hasToken(userId) {
	const database = getDb();
	const stmt = database.prepare('SELECT 1 FROM selfbot_tokens WHERE user_id = ? LIMIT 1');

	return stmt.get(userId) !== undefined;
}

export function getAllUserIds() {
	const database = getDb();
	const stmt = database.prepare('SELECT user_id FROM selfbot_tokens');

	return stmt.all().map((row) => row.user_id);
}
