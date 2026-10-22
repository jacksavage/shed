import { Server } from '@hocuspocus/server'
import { onLoadDocument } from './hooks/onLoadDocument'
import { onStoreDocument } from './hooks/onStoreDocument'
import { onRequest } from './hooks/onRequest'

const port = 1234

const server = Server.configure({
  port,
  onLoadDocument,
  onStoreDocument,
  onRequest,
})

server.listen()
console.log(`Hocuspocus running on ws://localhost:${port}`)
