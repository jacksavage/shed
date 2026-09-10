import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { HocuspocusProvider } from '@hocuspocus/provider'

export type NoteEntry = { title: string; created_at: number; updated_at: number }

const META_ROOM = '__shed_meta__'

export const metaDoc = new Y.Doc()
export const metaMap = metaDoc.getMap<NoteEntry>('notes')
export const metaPersistence = new IndexeddbPersistence(`meta:${META_ROOM}`, metaDoc)

// Connection maintained for the app lifetime — not exported since callers don't need it
new HocuspocusProvider({ url: 'ws://localhost:1234', name: META_ROOM, document: metaDoc })
