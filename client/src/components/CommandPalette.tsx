import { Command } from 'cmdk'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateNote: () => void
}

export function CommandPalette({ open, onOpenChange, onCreateNote }: CommandPaletteProps) {
  function run(action: () => void) {
    onOpenChange(false)
    action()
  }

  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Command palette" loop>
      <Command.Input autoFocus placeholder="Type a command…" />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>
        <Command.Group heading="Actions">
          <Command.Item onSelect={() => run(onCreateNote)}>New note</Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
