import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', '..', 'data', 'accounts.db');

export function getAccountsByDate(dateStr) {
  const db = new Database(dbPath, { readonly: true });
  const stmt = db.prepare('SELECT username, email, password FROM accounts WHERE created_at = ?');
  const rows = stmt.all(dateStr);
  db.close();
  return rows;
}
