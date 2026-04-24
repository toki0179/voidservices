
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
            token TEXT,
            created_at DATE NOT NULL
        )
    ''')
    conn.commit()
    c.close()
    conn.close()

def insert_account(email, password, username):
    conn = get_db_conn()
    c = conn.cursor()
    def _insert(email, password, username, token=None):
        c.execute('''
            INSERT INTO accounts (email, password, username, token, created_at)
            VALUES (%s, %s, %s, %s, %s)
        ''', (email, password, username, token, datetime.utcnow().strftime('%Y-%m-%d')))
    # Backward compatible: if called with 3 args, token is None
    import inspect
    if len(inspect.getargvalues(inspect.currentframe()).locals) == 4:
        _insert(email, password, username)
    else:
        _insert(email, password, username, None)

def insert_account_with_token(email, password, username, token):
    conn = get_db_conn()
    c = conn.cursor()
    c.execute('''
        INSERT INTO accounts (email, password, username, token, created_at)
        VALUES (%s, %s, %s, %s, %s)
    ''', (email, password, username, token, datetime.utcnow().strftime('%Y-%m-%d')))
    conn.commit()
    c.close()
    conn.close()
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
