import { useState, useEffect } from 'react'
import { metaMap } from '../lib/metaDoc'
import type { Note } from '../types'

function mapToNotes(): Note[] {
  const result: Note[] = []
  metaMap.forEach((entry, id) => result.push({ id, ...entry }))
  return result.sort((a, b) => b.created_at - a.created_at)
}

export function useNoteList() {
  const [notes, setNotes] = useState<Note[]>(mapToNotes)

  useEffect(() => {
    const observer = () => setNotes(mapToNotes())
    metaMap.observe(observer)
    return () => metaMap.unobserve(observer)
  }, [])

  function createNote(title = 'Untitled'): string {
    const id = crypto.randomUUID()
    const now = Date.now()
    metaMap.set(id, { title, created_at: now, updated_at: now })
    return id
  }

  function renameNote(id: string, title: string) {
    const existing = metaMap.get(id)
    if (existing) {
      metaMap.set(id, { ...existing, title, updated_at: Date.now() })
    }
  }

  return { notes, createNote, renameNote }
}
