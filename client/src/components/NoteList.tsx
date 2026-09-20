import type { Note } from '../types'
import { shortcutLabel } from '../lib/platform'

interface NoteListProps {
  notes: Note[]
  activeNoteId: string | null
  onSelect: (id: string) => void
  onCreateNote: () => void
  onOpenPalette: () => void
}

export function NoteList({ notes, activeNoteId, onSelect, onCreateNote, onOpenPalette }: NoteListProps) {
  return (
    <aside style={{
      width: 220,
      flexShrink: 0,
      borderRight: '1px solid #e0e0e0',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'sans-serif',
    }}>
      <div style={{ padding: '12px 12px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          onClick={onCreateNote}
          style={{
            width: '100%',
            padding: '6px 0',
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          + New note
        </button>
        <button
          onClick={onOpenPalette}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            background: 'transparent',
            color: '#555',
            border: '1px solid #e0e0e0',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          <span>Search…</span>
          <span style={{ color: '#999' }}>{shortcutLabel('K')}</span>
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {notes.length === 0 && (
          <p style={{ padding: '8px 12px', color: '#888', fontSize: 13 }}>No notes yet</p>
        )}
        {notes.map((note) => (
          <div
            key={note.id}
            onClick={() => onSelect(note.id)}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: 13,
              background: note.id === activeNoteId ? '#f0f0f0' : 'transparent',
              fontWeight: note.id === activeNoteId ? 600 : 400,
              borderLeft: note.id === activeNoteId ? '2px solid #111' : '2px solid transparent',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {note.title || 'Untitled'}
          </div>
        ))}
      </div>
    </aside>
  )
}
