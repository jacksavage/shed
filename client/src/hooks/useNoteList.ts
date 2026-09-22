import { useState, useEffect } from 'react'
import { metaMap } from '../lib/metaDoc'
import type { Note } from '../types'

function mapToNotes(): Note[] {
  const result: Note[] = []
  metaMap.forEach((entry, id) => result.push({ id, ...entry }))
  return result.sort((a, b) => b.updated_at - a.updated_at)
}

export function useNoteList() {
  const [notes, setNotes] = useState<Note[]>(mapToNotes)

  useEffect(() => {
    const observer = () => setNotes(mapToNotes())
    metaMap.observe(observer)
    return () => metaMap.unobserve(observer)
  }, [])

  function createNote(): string {
    const id = crypto.randomUUID()
    const now = Date.now()
    metaMap.set(id, { headingText: '', text: '', created_at: now, updated_at: now })
    return id
  }

  function updateNoteContent(id: string, headingText: string, text: string) {
    const existing = metaMap.get(id)
    if (!existing) return
    if (existing.headingText === headingText && existing.text === text) return
    metaMap.set(id, { ...existing, headingText, text, updated_at: Date.now() })
  }

  return { notes, createNote, updateNoteContent }
}
