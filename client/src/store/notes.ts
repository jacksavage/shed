import { create } from 'zustand'
import type { Note } from '../types'

interface NotesState {
  notes: Note[]
  activeNoteId: string | null
  setNotes: (notes: Note[]) => void
  addNote: (note: Note) => void
  setActiveNoteId: (id: string) => void
  updateNoteTitle: (id: string, title: string) => void
}

export const useNotesStore = create<NotesState>((set) => ({
  notes: [],
  activeNoteId: null,
  setNotes: (notes) => set({ notes }),
  addNote: (note) => set((s) => ({ notes: [note, ...s.notes], activeNoteId: note.id })),
  setActiveNoteId: (id) => set({ activeNoteId: id }),
  updateNoteTitle: (id, title) =>
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, title } : n)) })),
}))
