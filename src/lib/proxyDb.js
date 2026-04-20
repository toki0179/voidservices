import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = process.env.PROXY_DB_PATH || path.join(__dirname, '..', '..', 'data', 'proxies.db');

let db;
let initializationError;

function initialize() {
  if (db) {
    return db;
  }

  if (initializationError) {
    throw initializationError;
  }

  try {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);

    db.exec(`
      CREATE TABLE IF NOT EXISTS residential_proxies (
        proxy TEXT PRIMARY KEY,
        ip TEXT NOT NULL,
        port INTEGER NOT NULL,
        source TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_residential_proxies_ip ON residential_proxies(ip);
    `);
  } catch (error) {
    initializationError = new Error(`Proxy database initialization failed: ${error.message}`);
    throw initializationError;
  }

  return db;
}

function getDb() {
  if (!db) {
    initialize();
  }

  return db;
}

export function replaceResidentialProxies(proxies) {
  const database = getDb();
  const deleteStmt = database.prepare('DELETE FROM residential_proxies');
  const insertStmt = database.prepare(`
    INSERT INTO residential_proxies (proxy, ip, port, source, updated_at)
    VALUES (@proxy, @ip, @port, @source, CURRENT_TIMESTAMP)
    ON CONFLICT(proxy) DO UPDATE SET
      ip = excluded.ip,
      port = excluded.port,
      source = excluded.source,
      updated_at = CURRENT_TIMESTAMP
  `);

  const transaction = database.transaction((items) => {
    deleteStmt.run();
    for (const item of items) {
      insertStmt.run(item);
    }
  });

  transaction(proxies);
}

export function getAllResidentialProxies() {
  const database = getDb();
  const stmt = database.prepare('SELECT proxy FROM residential_proxies ORDER BY proxy ASC');
  return stmt.all().map((row) => row.proxy);
}

export function getResidentialProxyCount() {
  const database = getDb();
  const stmt = database.prepare('SELECT COUNT(*) AS count FROM residential_proxies');
  const result = stmt.get();
  return result?.count ?? 0;
}