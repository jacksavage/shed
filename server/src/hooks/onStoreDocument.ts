import * as Y from 'yjs'
import type { onStoreDocumentPayload } from '@hocuspocus/server'
import { saveYdocState, upsertNote } from '../db/queries'

type NoteEntry = { title: string; created_at: number; updated_at: number }

export async function onStoreDocument({ document, documentName }: onStoreDocumentPayload) {
  const state = Y.encodeStateAsUpdate(document)
  saveYdocState(documentName, state)

  if (documentName === '__shed_meta__') {
    const map = document.getMap<NoteEntry>('notes')
    for (const [id, entry] of map.entries()) {
      upsertNote(id, entry.title, entry.created_at, entry.updated_at ?? entry.created_at)
    }
  }
}
