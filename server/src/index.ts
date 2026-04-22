import { Server } from '@hocuspocus/server'
import { onLoadDocument } from './hooks/onLoadDocument'
import { onStoreDocument } from './hooks/onStoreDocument'

const server = Server.configure({
  port: 1234,
  onLoadDocument,
  onStoreDocument,
})

server.listen()
console.log('Hocuspocus running on ws://localhost:1234')
