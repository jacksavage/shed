import db from './client'

const load = db.prepare<[string], { state: Buffer }>(
  'SELECT state FROM ydoc_state WHERE document_name = ?'
)

const save = db.prepare<[string, Buffer]>(
  'INSERT OR REPLACE INTO ydoc_state (document_name, state) VALUES (?, ?)'
)

export function loadYdocState(documentName: string): Buffer | null {
  return load.get(documentName)?.state ?? null
}

export function saveYdocState(documentName: string, state: Uint8Array): void {
  save.run(documentName, Buffer.from(state))
}
