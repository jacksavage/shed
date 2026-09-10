import { useEffect, useRef, useState } from 'react'
import { Editor } from './components/Editor'
import { NoteList } from './components/NoteList'
import { createYdoc } from './lib/ydoc'
import { createProvider } from './lib/provider'
import { useNoteList } from './hooks/useNoteList'
import type * as Y from 'yjs'

export default function App() {
  const { notes, createNote, renameNote } = useNoteList()
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [editorReady, setEditorReady] = useState(false)
  const docRef = useRef<Y.Doc | null>(null)

  // Auto-select the first note once the list loads from IndexedDB
  useEffect(() => {
    if (notes.length > 0 && !activeNoteId) {
      setActiveNoteId(notes[0].id)
    }
  }, [notes, activeNoteId])

  // Re-initialise Y.Doc whenever the active note changes
  useEffect(() => {
    if (!activeNoteId) return
    let cancelled = false
    setEditorReady(false)

    const { doc, persistence } = createYdoc(activeNoteId)
    const provider = createProvider(activeNoteId, doc)
    docRef.current = doc

    persistence.once('synced', () => {
      if (!cancelled) setEditorReady(true)
    })

    return () => {
      cancelled = true
      provider.destroy()
      persistence.destroy()
      doc.destroy()
      docRef.current = null
    }
  }, [activeNoteId])

  function handleCreateNote() {
    const id = createNote()
    setActiveNoteId(id)
  }

  function handleTitleChange(id: string, title: string) {
    renameNote(id, title)
  }

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <NoteList
        notes={notes}
        activeNoteId={activeNoteId}
        onSelect={setActiveNoteId}
        onCreateNote={handleCreateNote}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!activeNoteId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', color: '#888' }}>
            <div style={{ textAlign: 'center' }}>
              <p>No note selected</p>
              <button onClick={handleCreateNote} style={{ marginTop: 8, cursor: 'pointer' }}>
                Create your first note
              </button>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px 0', borderBottom: '1px solid #e0e0e0' }}>
              <input
                key={activeNoteId}
                defaultValue={activeNote?.title ?? ''}
                placeholder="Untitled"
                onBlur={(e) => handleTitleChange(activeNoteId, e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  fontSize: 20,
                  fontWeight: 700,
                  fontFamily: 'sans-serif',
                  padding: '0 0 12px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {!editorReady || !docRef.current ? (
                <div style={{ color: '#888', fontFamily: 'sans-serif', fontSize: 14 }}>Loading…</div>
              ) : (
                <Editor doc={docRef.current} />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
