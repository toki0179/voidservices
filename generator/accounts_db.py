
import psycopg2
from psycopg2 import sql
from datetime import datetime
import os

def get_db_conn():
    return psycopg2.connect(
        dbname=os.environ.get('DB_NAME', 'voidservices'),
        user=os.environ.get('DB_USER', 'voiduser'),
        password=os.environ.get('DB_PASSWORD', 'voidpass'),
        host=os.environ.get('DB_HOST', 'localhost'),
        port=os.environ.get('DB_PORT', 5432)
    )

def init_accounts_db():
    conn = get_db_conn()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS accounts (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            password TEXT NOT NULL,
            username TEXT NOT NULL,
            created_at DATE NOT NULL
        )
    ''')
    conn.commit()
    c.close()
    conn.close()

def insert_account(email, password, username):
    conn = get_db_conn()
    c = conn.cursor()
    c.execute('''
        INSERT INTO accounts (email, password, username, created_at)
        VALUES (%s, %s, %s, %s)
    ''', (email, password, username, datetime.utcnow().strftime('%Y-%m-%d')))
    conn.commit()
    c.close()
    conn.close()

def get_accounts_by_date(date_str):
    conn = get_db_conn()
    c = conn.cursor()
    c.execute('''
        SELECT username, email, password FROM accounts WHERE created_at = %s
    ''', (date_str,))
    results = c.fetchall()
    c.close()
    conn.close()
    return results

if __name__ == "__main__":
    init_accounts_db()
