import type { onRequestPayload } from '@hocuspocus/server'
import { handleNotesRoute } from '../routes/notes'

export async function onRequest({ request, response }: onRequestPayload) {
  const handled = await handleNotesRoute(request, response)
  if (!handled) {
    response.writeHead(404)
    response.end()
  }
  // Hocuspocus writes its own 200 OK after hooks complete unless we throw a
  // falsy value — its catch block explicitly ignores empty throws.
  // eslint-disable-next-line @typescript-eslint/no-throw-literal
  throw null
}
