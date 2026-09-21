import Database from 'better-sqlite3'

const db = new Database(process.env.DB_PATH ?? 'shed.db')

db.exec(`
  CREATE TABLE IF NOT EXISTS ydoc_state (
    document_name TEXT PRIMARY KEY,
    state         BLOB NOT NULL
  );
`)

export default db
