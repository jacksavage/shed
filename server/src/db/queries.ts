import db from './client'

const load = db.prepare<[string], { state: Buffer }>(
  'SELECT state FROM ydoc_state WHERE document_name = ?'
)

const save = db.prepare<[string, Buffer]>(
  'INSERT OR REPLACE INTO ydoc_state (document_name, state) VALUES (?, ?)'
)

const list = db.prepare<[], { id: string; title: string; created_at: number; updated_at: number }>(
  'SELECT id, title, created_at, updated_at FROM notes ORDER BY updated_at DESC'
)

const upsert = db.prepare<[string, string, number, number]>(`
  INSERT INTO notes (id, title, owner_id, created_at, updated_at) VALUES (?, ?, 'anonymous', ?, ?)
  ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at
`)

export function loadYdocState(documentName: string): Buffer | null {
  return load.get(documentName)?.state ?? null
}

export function saveYdocState(documentName: string, state: Uint8Array): void {
  save.run(documentName, Buffer.from(state))
}

export function listNotes() {
  return list.all()
}

export function upsertNote(id: string, title: string, created_at: number, updated_at: number) {
  upsert.run(id, title, created_at, updated_at)
}
