import type { onRequestPayload } from '@hocuspocus/server'
import { handleNotesRoute } from '../routes/notes'

export async function onRequest({ request, response }: onRequestPayload) {
  const handled = await handleNotesRoute(request, response)
  if (!handled) {
    response.writeHead(404)
    response.end()
  }
}
