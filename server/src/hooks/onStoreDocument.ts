import * as Y from 'yjs'
import type { onStoreDocumentPayload } from '@hocuspocus/server'
import { saveYdocState } from '../db/queries'

export async function onStoreDocument({ document, documentName }: onStoreDocumentPayload) {
  const state = Y.encodeStateAsUpdate(document)
  saveYdocState(documentName, state)
}
