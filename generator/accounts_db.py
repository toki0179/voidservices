import sqlite3
from datetime import datetime
import os

def get_accounts_db_path():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(base_dir, '..', 'data', 'accounts.db')
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    return db_path

def init_accounts_db():
    db_path = get_accounts_db_path()
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            password TEXT NOT NULL,
            username TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

def insert_account(email, password, username):
    db_path = get_accounts_db_path()
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute('''
        INSERT INTO accounts (email, password, username, created_at)
        VALUES (?, ?, ?, ?)
    ''', (email, password, username, datetime.utcnow().strftime('%Y-%m-%d')))
    conn.commit()
    conn.close()

def get_accounts_by_date(date_str):
    db_path = get_accounts_db_path()
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute('''
        SELECT username, email, password FROM accounts WHERE created_at = ?
    ''', (date_str,))
    results = c.fetchall()
    conn.close()
    return results

if __name__ == "__main__":
    init_accounts_db()
