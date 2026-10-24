import { useState } from 'react'
import { Command } from 'cmdk'
import type { Note } from '../types'
import { noteLabel, searchNotes } from '../lib/noteSearch'

interface SearchPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  notes: Note[]
  onSelectNote: (id: string) => void
}

export function SearchPalette({ open, onOpenChange, notes, onSelectNote }: SearchPaletteProps) {
  const [query, setQuery] = useState('')
  const results = searchNotes(notes, query)

  function select(id: string) {
    // Closing via onOpenChange(false) bypasses the Dialog's own onOpenChange below, so
    // reset the query here too; otherwise the next Ctrl+P opens with the old search
    setQuery('')
    onOpenChange(false)
    onSelectNote(id)
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setQuery('')
      }}
      label="Search notes"
      shouldFilter={false}
      loop
    >
      <Command.Input autoFocus value={query} onValueChange={setQuery} placeholder="Search notes…" />
      <Command.List>
        <Command.Empty>No matching notes.</Command.Empty>
        {results.map(({ note, snippet }) => (
          <Command.Item key={note.id} value={note.id} onSelect={() => select(note.id)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{noteLabel(note)}</span>
              {snippet && (
                <span style={{ fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {snippet}
                </span>
              )}
            </div>
          </Command.Item>
        ))}
      </Command.List>
    </Command.Dialog>
  )
}
