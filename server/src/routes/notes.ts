import { randomUUID } from 'crypto'
import type { IncomingMessage, ServerResponse } from 'http'
import { listNotes, createNote, setNoteTitle } from '../db/queries'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => resolve(body))
  })
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

// Matches /notes and /notes/:id
const NOTES_RE = /^\/notes(?:\/([^/]+))?$/

export async function handleNotesRoute(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const match = NOTES_RE.exec(req.url?.split('?')[0] ?? '')
  if (!match) return false

  const id = match[1]

  if (!id && req.method === 'GET') {
    json(res, 200, listNotes())
    return true
  }

  if (!id && req.method === 'POST') {
    const body = await readBody(req)
    const { title = 'Untitled' } = JSON.parse(body) as { title?: string }
    json(res, 201, createNote(randomUUID(), title))
    return true
  }

  if (id && req.method === 'PATCH') {
    const body = await readBody(req)
    const { title } = JSON.parse(body) as { title: string }
    setNoteTitle(id, title)
    res.writeHead(204)
    res.end()
    return true
  }

  return false
}
