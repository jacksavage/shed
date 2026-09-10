import type { IncomingMessage, ServerResponse } from 'http'
import { listNotes } from '../db/queries'

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

export async function handleNotesRoute(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (req.url?.split('?')[0] !== '/notes') return false

  if (req.method === 'GET') {
    json(res, 200, listNotes())
    return true
  }

  return false
}
