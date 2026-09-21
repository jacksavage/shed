import type { Note } from '../types'

export interface NoteMatch {
  note: Note
  snippet: string
}

function firstLine(text: string): string {
  return text.split('\n').find((line) => line.trim().length > 0)?.trim() ?? ''
}

export function noteLabel(note: Note): string {
  return firstLine(note.headingText) || firstLine(note.text) || 'Untitled note'
}

// First body line that isn't itself a heading — avoids repeating the label as the snippet
function bodyPreview(note: Note): string {
  const headingLines = new Set(note.headingText.split('\n').map((h) => h.trim()).filter(Boolean))
  const line = note.text.split('\n').map((l) => l.trim()).find((l) => l && !headingLines.has(l))
  return line ?? ''
}

function excerptAround(text: string, query: string, radius = 40): string {
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (index === -1) return firstLine(text).slice(0, radius * 2)
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + query.length + radius)
  const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return (start > 0 ? '…' : '') + snippet + (end < text.length ? '…' : '')
}

/**
 * Full-text search across notes. Heading matches outrank body-only matches;
 * within a tier, results are sorted by most recently updated.
 */
export function searchNotes(notes: Note[], query: string): NoteMatch[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return notes.map((note) => ({ note, snippet: bodyPreview(note) }))
  }

  const scored: { note: Note; score: number; snippet: string }[] = []
  for (const note of notes) {
    const heading = note.headingText.toLowerCase()
    const body = note.text.toLowerCase()
    const inHeading = words.every((w) => heading.includes(w))
    const inBody = words.every((w) => body.includes(w))
    if (!inHeading && !inBody) continue
    scored.push({
      note,
      score: inHeading ? 2 : 1,
      snippet: inHeading ? bodyPreview(note) : excerptAround(note.text, words[0]),
    })
  }

  scored.sort((a, b) => b.score - a.score || b.note.updated_at - a.note.updated_at)
  return scored.map(({ note, snippet }) => ({ note, snippet }))
}
