import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

export const NOTE_ID = 'hardcoded-note-v1'

export function createYdoc(noteId: string) {
  const doc = new Y.Doc()
  const persistence = new IndexeddbPersistence(`note:${noteId}`, doc)
  return { doc, persistence }
}
