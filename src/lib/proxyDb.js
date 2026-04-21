
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
  user: process.env.DB_USER || 'voiduser',
  password: process.env.DB_PASSWORD || 'voidpass',
  database: process.env.DB_NAME || 'voidservices',
});

async function initProxyTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS residential_proxies (
      proxy TEXT PRIMARY KEY,
      ip TEXT NOT NULL,
      port INTEGER NOT NULL,
      source TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_residential_proxies_ip ON residential_proxies(ip);`);
}

export async function replaceResidentialProxies(proxies) {
  await initProxyTable();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM residential_proxies');
    for (const item of proxies) {
      await client.query(
        `INSERT INTO residential_proxies (proxy, ip, port, source, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (proxy) DO UPDATE SET
           ip = EXCLUDED.ip,
           port = EXCLUDED.port,
           source = EXCLUDED.source,
           updated_at = CURRENT_TIMESTAMP`,
        [item.proxy, item.ip, item.port, item.source]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getAllResidentialProxies() {
  await initProxyTable();
  const res = await pool.query('SELECT proxy FROM residential_proxies ORDER BY proxy ASC');
  return res.rows.map(row => row.proxy);
}

export function getResidentialProxyCount() {
  const database = getDb();
  const stmt = database.prepare('SELECT COUNT(*) AS count FROM residential_proxies');
  const result = stmt.get();
  return result?.count ?? 0;
}

// Alias for compatibility
export const getAllProxies = getAllResidentialProxies;