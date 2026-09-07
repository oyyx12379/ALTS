import { Server } from 'socket.io'

let socketServer: Server | null = null

export function setSocketServer(io: Server) {
  socketServer = io
}

export function getSocketServer() {
  return socketServer
}
