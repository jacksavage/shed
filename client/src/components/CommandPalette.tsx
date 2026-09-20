import { Command } from 'cmdk'
import type { Note } from '../types'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  notes: Note[]
  onSelectNote: (id: string) => void
  onCreateNote: () => void
}

export function CommandPalette({ open, onOpenChange, notes, onSelectNote, onCreateNote }: CommandPaletteProps) {
  function run(action: () => void) {
    onOpenChange(false)
    action()
  }

  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Command palette" loop>
      <Command.Input autoFocus placeholder="Type a command or search notes…" />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>
        <Command.Group heading="Actions">
          <Command.Item onSelect={() => run(onCreateNote)}>New note</Command.Item>
        </Command.Group>
        {notes.length > 0 && (
          <Command.Group heading="Notes">
            {notes.map((note) => (
              <Command.Item
                key={note.id}
                value={`${note.title || 'Untitled'} ${note.id}`}
                onSelect={() => run(() => onSelectNote(note.id))}
              >
                {note.title || 'Untitled'}
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  )
}
