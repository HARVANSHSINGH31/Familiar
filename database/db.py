import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'familiar.db')

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
    with get_connection() as conn:
        with open(schema_path, 'r') as f:
            conn.executescript(f.read())
    print("Database initialised successfully.")

if __name__ == "__main__":
    init_db()

def get_db():
    conn = get_connection()
    return conn
