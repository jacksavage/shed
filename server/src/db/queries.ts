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

const insert = db.prepare<[string, string, number, number]>(
  'INSERT INTO notes (id, title, owner_id, created_at, updated_at) VALUES (?, ?, \'anonymous\', ?, ?)'
)

const updateTitle = db.prepare<[string, number, string]>(
  'UPDATE notes SET title = ?, updated_at = ? WHERE id = ?'
)

export function loadYdocState(documentName: string): Buffer | null {
  return load.get(documentName)?.state ?? null
}

export function saveYdocState(documentName: string, state: Uint8Array): void {
  save.run(documentName, Buffer.from(state))
}

export function listNotes() {
  return list.all()
}

export function createNote(id: string, title: string) {
  const now = Date.now()
  insert.run(id, title, now, now)
  return { id, title, created_at: now, updated_at: now }
}

export function setNoteTitle(id: string, title: string) {
  updateTitle.run(title, Date.now(), id)
}
