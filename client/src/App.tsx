import { useEffect, useRef, useState } from 'react'
import { Editor } from './components/Editor'
import { NOTE_ID, createYdoc } from './lib/ydoc'
import { createProvider } from './lib/provider'
import type * as Y from 'yjs'

export default function App() {
  const [ready, setReady] = useState(false)
  const docRef = useRef<Y.Doc | null>(null)

  useEffect(() => {
    let cancelled = false
    const { doc, persistence } = createYdoc(NOTE_ID)
    const provider = createProvider(NOTE_ID, doc)
    docRef.current = doc

    persistence.once('synced', () => {
      if (!cancelled) setReady(true)
    })

    return () => {
      cancelled = true
      provider.destroy()
      persistence.destroy()
      doc.destroy()
      docRef.current = null
    }
  }, [])

  if (!ready || !docRef.current) {
    return <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>Loading…</div>
  }

  return (
    <div style={{ maxWidth: 720, margin: '48px auto', padding: '0 24px', fontFamily: 'sans-serif' }}>
      <h1 style={{ marginBottom: 24 }}>Shed</h1>
      <Editor doc={docRef.current} />
    </div>
  )
}
