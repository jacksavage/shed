import { HocuspocusProvider } from '@hocuspocus/provider'
import type * as Y from 'yjs'

export function createProvider(noteId: string, doc: Y.Doc) {
  return new HocuspocusProvider({
    url: 'ws://localhost:1234',
    name: noteId,
    document: doc,
  })
}
