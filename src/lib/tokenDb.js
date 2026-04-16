import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', '..', 'data', 'tokens.db');

let db;

function initialize() {
	db = new Database(dbPath);

	db.exec(`
		CREATE TABLE IF NOT EXISTS selfbot_tokens (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id TEXT UNIQUE NOT NULL,
			token TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE INDEX IF NOT EXISTS idx_user_id ON selfbot_tokens(user_id);
	`);

	return db;
}

function getDb() {
	if (!db) {
		initialize();
	}

	return db;
}

export function saveToken(userId, token) {
	const database = getDb();
	const stmt = database.prepare(`
		INSERT INTO selfbot_tokens (user_id, token)
		VALUES (?, ?)
		ON CONFLICT(user_id) DO UPDATE SET
			token = excluded.token,
			updated_at = CURRENT_TIMESTAMP
	`);

	return stmt.run(userId, token);
}

export function getToken(userId) {
	const database = getDb();
	const stmt = database.prepare('SELECT token FROM selfbot_tokens WHERE user_id = ?');
	const result = stmt.get(userId);

	return result ? result.token : null;
}

export function deleteToken(userId) {
	const database = getDb();
	const stmt = database.prepare('DELETE FROM selfbot_tokens WHERE user_id = ?');

	return stmt.run(userId);
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
