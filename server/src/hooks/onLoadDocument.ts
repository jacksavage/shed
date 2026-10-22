import * as Y from 'yjs'
import type { onLoadDocumentPayload } from '@hocuspocus/server'
import { loadYdocState } from '../db/queries'

export async function onLoadDocument({ document, documentName }: onLoadDocumentPayload) {
  document.gc = false
  const state = loadYdocState(documentName)
  if (state) {
    Y.applyUpdate(document, state)
  }
}
