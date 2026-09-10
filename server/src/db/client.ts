import Database from 'better-sqlite3'

const db = new Database(process.env.DB_PATH ?? 'shed.db')

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    owner_id   TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ydoc_state (
    document_name TEXT PRIMARY KEY,
    state         BLOB NOT NULL
  );
`)

export default db
