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
  try {
    await initProxyTable();
  } catch (err) {
    console.error('Failed to initialize proxy table:', err);
    throw err;
  }

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
  try {
    await initProxyTable();
    const res = await pool.query('SELECT proxy FROM residential_proxies ORDER BY proxy ASC');
    // Always return an array, even if res.rows is falsy
    return Array.isArray(res?.rows) ? res.rows.map(row => row.proxy) : [];
  } catch (err) {
    console.error('getAllResidentialProxies failed:', err);
    return []; // Fallback to empty array on error
  }
}

export async function getResidentialProxyCount() {
  try {
    await initProxyTable();
    const res = await pool.query('SELECT COUNT(*) AS count FROM residential_proxies');
    return res?.rows?.[0]?.count ?? 0;
  } catch (err) {
    console.error('getResidentialProxyCount failed:', err);
    return 0;
  }
}

// Alias for compatibility
export const getAllProxies = getAllResidentialProxies;