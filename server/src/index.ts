import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import http from 'http'
import { Server } from 'socket.io'
import { PrismaClient } from '@prisma/client'
import jwt from 'jsonwebtoken'
import authRoutes from './routes/auth'
import characterRoutes from './routes/characters'
import uploadRoutes from './routes/upload'
import ruleRoutes from './routes/rules'
import roomRoutes from './routes/rooms'
import { setupRoomSocket } from './socket/roomHandler'
import { setSocketServer } from './socket/socketServer'

export const prisma = new PrismaClient()

const app = express()
const server = http.createServer(app)
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'arknights-trpg-secret-key'
const defaultClientDistPath = path.resolve(__dirname, '../../client/dist')
const clientDistPath = path.resolve(process.env.CLIENT_DIST_PATH || defaultClientDistPath)
const allowedOrigins = (process.env.PUBLIC_ORIGIN || process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim().replace(/\/$/, ''))
  .filter(Boolean)

function isAllowedOrigin(origin?: string) {
  if (!origin) return true
  if (allowedOrigins.includes('*')) return true
  if (!allowedOrigins.length && process.env.NODE_ENV !== 'production') return true
  return allowedOrigins.includes(origin.replace(/\/$/, ''))
}

function resolveCorsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (isAllowedOrigin(origin)) {
    callback(null, true)
    return
  }
  callback(new Error(`Origin not allowed: ${origin}`))
}

// Socket.IO with JWT auth
const io = new Server(server, {
  cors: { origin: resolveCorsOrigin, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 20 * 1024 * 1024,
})
setSocketServer(io)

// Auth middleware for socket connections
io.use((socket, next) => {
  const token = socket.handshake.auth.token
  if (!token) {
    return next(new Error('未登录'))
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number }
    ;(socket as any).userId = decoded.userId
    next()
  } catch {
    next(new Error('登录已过期'))
  }
})

// Setup room events
setupRoomSocket(io)

// Express middleware
app.use(cors({ origin: resolveCorsOrigin }))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true }))

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))
app.use('/pdf', express.static(path.join(__dirname, '../pdf')))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/characters', characterRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/rules', ruleRoutes)
app.use('/api/rooms', roomRoutes)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  }))

  app.use((req, res, next) => {
    if (!req.accepts('html')) {
      next()
      return
    }
    res.sendFile(path.join(clientDistPath, 'index.html'))
  })
} else {
  console.warn(`[Static] Client dist not found: ${clientDistPath}`)
}

server.listen(PORT, () => {
  console.log(`[Arknights TRPG] Server running on http://localhost:${PORT}`)
  console.log(`[Socket.IO] WebSocket ready`)
  if (allowedOrigins.length) {
    console.log(`[CORS] Allowed origins: ${allowedOrigins.join(', ')}`)
  }
  if (fs.existsSync(clientDistPath)) {
    console.log(`[Static] Serving client from ${clientDistPath}`)
  }
})
