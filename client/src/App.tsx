import { useEffect, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { Editor } from './components/Editor'
import { CommandPalette } from './components/CommandPalette'
import { SearchPalette } from './components/SearchPalette'
import { createYdoc } from './lib/ydoc'
import { createProvider } from './lib/provider'
import { useNoteList } from './hooks/useNoteList'
import { shortcutLabel } from './lib/platform'
import type * as Y from 'yjs'

// Hotkeys should fire from anywhere, including form fields and the ProseMirror editor
const HOTKEY_OPTS = { enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }

export default function App() {
  const { notes, createNote, updateNoteContent } = useNoteList()
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [editorReady, setEditorReady] = useState(false)
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const docRef = useRef<Y.Doc | null>(null)

  // Auto-select the most recently updated note once the list loads from IndexedDB
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

  // Command Palette mirrors VS Code's own bindings (Ctrl+Shift+P, F1); Quick Open
  // (full-text search) is Ctrl+P. Ctrl+N is skipped entirely — Chrome reserves it
  // for opening a new window and never lets the page see the keystroke.
  useHotkeys('mod+shift+p, f1', () => setCommandsOpen((v) => !v), HOTKEY_OPTS)
  useHotkeys('mod+p', () => setSearchOpen((v) => !v), HOTKEY_OPTS)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <CommandPalette open={commandsOpen} onOpenChange={setCommandsOpen} onCreateNote={handleCreateNote} />
      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} notes={notes} onSelectNote={setActiveNoteId} />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!activeNoteId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', color: '#888' }}>
            <div style={{ textAlign: 'center' }}>
              <p>No note selected</p>
              <button onClick={handleCreateNote} style={{ marginTop: 8, cursor: 'pointer' }}>
                Create your first note
              </button>
              <p style={{ marginTop: 16, fontSize: 12 }}>
                {shortcutLabel('P')} to search &middot; {shortcutLabel('Shift+P')} for commands
              </p>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            {!editorReady || !docRef.current ? (
              <div style={{ color: '#888', fontFamily: 'sans-serif', fontSize: 14 }}>Loading…</div>
            ) : (
              <Editor
                doc={docRef.current}
                onContentChange={(headingText, text) => updateNoteContent(activeNoteId, headingText, text)}
              />
            )}
          </div>
        )}
      </main>
    </div>
  )
}
