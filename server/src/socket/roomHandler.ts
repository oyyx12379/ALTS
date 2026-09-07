import { Server, Socket } from 'socket.io'
import { prisma } from '../index'

interface AuthSocket extends Socket {
  userId: number
}

type BoardState = {
  grid?: Record<string, unknown>
  snapToGrid?: boolean
  tokens?: unknown[]
  assets?: unknown[]
  scene?: {
    enabled?: boolean
    items?: unknown[]
  }
  drawLayers?: unknown[]
  drawStrokes?: unknown[]
  activeDrawLayerId?: string
}

type BoardRecord = Record<string, any>

type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'error'
type PlayMode = 'single' | 'list'

type RoomMusicTrack = {
  id: string
  title: string
  src: string
  scene?: 'lobby' | 'room' | 'battle'
  artist?: string
  group?: string
}

type RoomMusicState = {
  tracks: RoomMusicTrack[]
  currentTrackId: string
  status: PlaybackStatus
  volume: number
  muted: boolean
  playMode: PlayMode
  currentTime: number
  updatedAt: number
}

const roomBoardStates = new Map<number, BoardState>()
const roomMusicStates = new Map<number, RoomMusicState>()
const roomArchiveTimers = new Map<number, ReturnType<typeof setTimeout>>()
const roomTokenDragStates = new Map<number, Map<string, {
  tokenId: string
  userId: number
  socketId: string
  startedAt: number
  updatedAt: number
}>>()
const TOKEN_DRAG_STATE_TTL = 8000
const ROOM_ARCHIVE_IDLE_DELAY_MS = 12_000

function defaultBoardState(): BoardState {
  return {
    grid: {
      size: 64,
      lineWidth: 1,
      lineStyle: 'solid',
      color: '#3a4560',
    },
    snapToGrid: true,
    tokens: [],
    assets: [],
    scene: {
      enabled: false,
      items: [],
    },
    drawLayers: [{
      id: 'draw-default',
      name: 'Annotations',
      visible: true,
      locked: false,
      order: 100,
      opacity: 1,
      ownerUserId: null,
      ownerName: 'System',
    }],
    drawStrokes: [],
    activeDrawLayerId: 'draw-default',
  }
}

function sanitizeBoardState(state?: BoardState): BoardState {
  const fallback = defaultBoardState()
  return {
    grid: state?.grid && typeof state.grid === 'object' ? state.grid : fallback.grid,
    snapToGrid: typeof state?.snapToGrid === 'boolean' ? state.snapToGrid : true,
    tokens: Array.isArray(state?.tokens) ? state.tokens.slice(0, 300) : [],
    assets: Array.isArray(state?.assets) ? state.assets.slice(0, 120) : [],
    scene: {
      enabled: typeof state?.scene?.enabled === 'boolean' ? state.scene.enabled : false,
      items: Array.isArray(state?.scene?.items) ? state.scene.items.slice(0, 100) : [],
    },
    drawLayers: Array.isArray(state?.drawLayers) ? state.drawLayers.slice(0, 30) : fallback.drawLayers,
    drawStrokes: Array.isArray(state?.drawStrokes) ? state.drawStrokes.slice(0, 3000) : [],
    activeDrawLayerId: typeof state?.activeDrawLayerId === 'string' ? state.activeDrawLayerId : fallback.activeDrawLayerId,
  }
}

function parseBoardState(value?: string | null): BoardState {
  if (!value) return defaultBoardState()
  try {
    return sanitizeBoardState(JSON.parse(value))
  } catch {
    return defaultBoardState()
  }
}

async function getBoardState(roomId: number) {
  const existing = roomBoardStates.get(roomId)
  if (existing) return existing

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { boardState: true },
  })
  const state = parseBoardState(room?.boardState)
  roomBoardStates.set(roomId, state)
  return state
}

async function saveBoardState(roomId: number, state: BoardState) {
  const nextState = sanitizeBoardState(state)
  roomBoardStates.set(roomId, nextState)
  await prisma.room.update({
    where: { id: roomId },
    data: { boardState: JSON.stringify(nextState) },
  })
  return nextState
}

function isBoardRecord(value: unknown): value is BoardRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function getBoardRecordId(value: unknown) {
  return isBoardRecord(value) && typeof value.id === 'string' ? value.id : ''
}

function mapBoardRecordsById(values?: unknown[]) {
  const map = new Map<string, BoardRecord>()
  if (!Array.isArray(values)) return map

  values.forEach(value => {
    const id = getBoardRecordId(value)
    if (id && isBoardRecord(value)) map.set(id, value)
  })
  return map
}

function userCanMoveToken(token: BoardRecord, userId: number) {
  return (
    !token.locked
    && Array.isArray(token.allowedUserIds)
    && token.allowedUserIds.map(Number).includes(userId)
  )
}

function pickPlayerTokenMovePatch(previous: BoardRecord, incoming: BoardRecord) {
  const next = { ...previous }
  ;(['x', 'y'] as const).forEach(key => {
    if (Number.isFinite(Number(incoming[key]))) next[key] = Number(incoming[key])
  })

  if (incoming.direction === 'up' || incoming.direction === 'right' || incoming.direction === 'down' || incoming.direction === 'left') {
    next.direction = incoming.direction
  }

  if (isBoardRecord(previous.spine) && isBoardRecord(incoming.spine)) {
    const facing = incoming.spine.facing === 'left' ? 'left' : incoming.spine.facing === 'right' ? 'right' : previous.spine.facing
    next.spine = { ...previous.spine, facing }
  }

  return next
}

function mergeBoardStateForMember(previous: BoardState, incoming: BoardState, userId: number, isSN: boolean) {
  const sanitizedPrevious = sanitizeBoardState(previous)
  const sanitizedIncoming = sanitizeBoardState(incoming)
  if (isSN) return sanitizedIncoming

  const incomingTokenById = mapBoardRecordsById(sanitizedIncoming.tokens)
  const mergedTokens = (sanitizedPrevious.tokens || []).map(previousToken => {
    const id = getBoardRecordId(previousToken)
    const incomingToken = id ? incomingTokenById.get(id) : null
    if (!incomingToken || !isBoardRecord(previousToken)) return previousToken
    return userCanMoveToken(previousToken, userId)
      ? pickPlayerTokenMovePatch(previousToken, incomingToken)
      : previousToken
  })

  return {
    ...sanitizedPrevious,
    tokens: mergedTokens,
  }
}

function defaultRoomMusicState(): RoomMusicState {
  return {
    tracks: [],
    currentTrackId: '',
    status: 'idle',
    volume: 0.55,
    muted: false,
    playMode: 'list',
    currentTime: 0,
    updatedAt: Date.now(),
  }
}

function sanitizeMusicTrack(track: Partial<RoomMusicTrack>): RoomMusicTrack | null {
  if (!track.id || !track.title || !track.src) return null
  return {
    id: String(track.id).slice(0, 120),
    title: String(track.title).slice(0, 120),
    src: String(track.src),
    scene: track.scene === 'battle' || track.scene === 'lobby' ? track.scene : 'room',
    artist: track.artist ? String(track.artist).slice(0, 120) : undefined,
    group: track.group ? String(track.group).slice(0, 80) : '未分组',
  }
}

function sanitizeRoomMusicState(state?: Partial<RoomMusicState>): RoomMusicState {
  const fallback = defaultRoomMusicState()
  const tracks = Array.isArray(state?.tracks)
    ? state.tracks.map(sanitizeMusicTrack).filter((track): track is RoomMusicTrack => !!track).slice(0, 60)
    : fallback.tracks
  const currentTrackId = tracks.some(track => track.id === state?.currentTrackId)
    ? String(state?.currentTrackId)
    : tracks[0]?.id || ''
  const status = state?.status === 'playing' || state?.status === 'paused' || state?.status === 'error'
    ? state.status
    : tracks.length ? 'paused' : 'idle'
  return {
    tracks,
    currentTrackId,
    status: tracks.length ? status : 'idle',
    volume: Math.min(1, Math.max(0, Number(state?.volume ?? fallback.volume))),
    muted: typeof state?.muted === 'boolean' ? state.muted : fallback.muted,
    playMode: state?.playMode === 'single' ? 'single' : 'list',
    currentTime: Math.max(0, Number(state?.currentTime) || 0),
    updatedAt: Number(state?.updatedAt) || Date.now(),
  }
}

function getRoomMusicState(roomId: number) {
  const existing = roomMusicStates.get(roomId)
  if (existing) return existing
  const state = defaultRoomMusicState()
  roomMusicStates.set(roomId, state)
  return state
}

function saveRoomMusicState(roomId: number, state: Partial<RoomMusicState>) {
  const nextState = sanitizeRoomMusicState({
    ...getRoomMusicState(roomId),
    ...state,
    updatedAt: Date.now(),
  })
  roomMusicStates.set(roomId, nextState)
  return nextState
}

async function canControlRoomMusic(roomId: number, userId: number) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { snId: true },
  })
  if (!room) return false
  if (room.snId === userId) return true

  const member = await prisma.roomMember.findFirst({
    where: { roomId, userId },
    select: {
      role: true,
    },
  })
  return member?.role === 'SN'
}

async function isRoomMember(roomId: number, userId: number) {
  const member = await prisma.roomMember.findFirst({
    where: { roomId, userId },
    select: { id: true },
  })
  return !!member
}

async function canControlBoardToken(roomId: number, userId: number, tokenId: string) {
  const member = await prisma.roomMember.findFirst({
    where: { roomId, userId },
    select: { role: true, room: { select: { snId: true } } },
  })
  if (!member) return false
  if (member.role === 'SN' || member.room.snId === userId) return true

  const board = await getBoardState(roomId)
  const token = mapBoardRecordsById(board.tokens).get(tokenId)
  return !!token && userCanMoveToken(token, userId)
}

function getRoomTokenDragState(roomId: number) {
  let state = roomTokenDragStates.get(roomId)
  if (!state) {
    state = new Map()
    roomTokenDragStates.set(roomId, state)
  }
  return state
}

function cleanupStaleTokenDragStates(roomId: number) {
  const state = roomTokenDragStates.get(roomId)
  if (!state) return false

  const now = Date.now()
  let changed = false
  for (const [tokenId, entry] of state.entries()) {
    if (now - entry.updatedAt > TOKEN_DRAG_STATE_TTL) {
      state.delete(tokenId)
      changed = true
    }
  }
  if (!state.size) roomTokenDragStates.delete(roomId)
  return changed
}

function clearSocketTokenDragStates(socketId: string, roomId?: number) {
  const roomIds = roomId == null ? [...roomTokenDragStates.keys()] : [roomId]
  const changedRoomIds: number[] = []

  for (const targetRoomId of roomIds) {
    const state = roomTokenDragStates.get(targetRoomId)
    if (!state) continue

    let changed = false
    for (const [tokenId, entry] of state.entries()) {
      if (entry.socketId === socketId) {
        state.delete(tokenId)
        changed = true
      }
    }
    if (!state.size) roomTokenDragStates.delete(targetRoomId)
    if (changed) changedRoomIds.push(targetRoomId)
  }

  return changedRoomIds
}

function serializeTokenDragState(roomId: number) {
  cleanupStaleTokenDragStates(roomId)
  const state = roomTokenDragStates.get(roomId)
  return {
    roomId,
    tokens: state
      ? [...state.values()].map(entry => ({
        tokenId: entry.tokenId,
        userId: entry.userId,
        startedAt: entry.startedAt,
      }))
      : [],
  }
}

function emitTokenDragState(io: Server, roomId: number) {
  io.to(`room:${roomId}`).emit('room:token_drag_state', serializeTokenDragState(roomId))
}

function cancelRoomArchiveTimer(roomId: number) {
  const timer = roomArchiveTimers.get(roomId)
  if (!timer) return
  clearTimeout(timer)
  roomArchiveTimers.delete(roomId)
}

async function archiveRoomIfNoLiveSockets(io: Server, roomId: number) {
  const liveSocketCount = io.sockets.adapter.rooms.get(`room:${roomId}`)?.size || 0
  if (liveSocketCount > 0) return

  await prisma.$transaction([
    prisma.roomMember.deleteMany({ where: { roomId } }),
    prisma.room.update({
      where: { id: roomId },
      data: { isActive: false, archivedAt: new Date() },
    }),
  ])
  roomArchiveTimers.delete(roomId)
}

function scheduleRoomArchiveIfEmpty(io: Server, roomId: number) {
  cancelRoomArchiveTimer(roomId)
  const timer = setTimeout(() => {
    archiveRoomIfNoLiveSockets(io, roomId).catch(err => {
      console.error(`[Socket] archive room ${roomId} error:`, err)
      roomArchiveTimers.delete(roomId)
    })
  }, ROOM_ARCHIVE_IDLE_DELAY_MS)
  roomArchiveTimers.set(roomId, timer)
}

export function setupRoomSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    const userId = (socket as AuthSocket).userId
    socket.join(`user:${userId}`)
    console.log(`[Socket] User ${userId} connected (${socket.id})`)

    socket.on('room:join', async ({ roomId }: { roomId: number }) => {
      try {
        let member = await prisma.roomMember.findFirst({
          where: { roomId, userId },
          include: { user: { select: { id: true, username: true, role: true } } },
        })
        if (!member) {
          const room = await prisma.room.findUnique({
            where: { id: roomId },
            select: { snId: true },
          })
          if (room?.snId === userId) {
            await prisma.room.update({
              where: { id: roomId },
              data: { isActive: true },
            })
            member = await prisma.roomMember.create({
              data: {
                roomId,
                userId,
                role: 'SN',
              },
              include: { user: { select: { id: true, username: true, role: true } } },
            })
          }
        }
        if (!member) {
          socket.emit('error', { message: '你不是该房间的成员' })
          return
        }

        const roomKey = `room:${roomId}`
        cancelRoomArchiveTimer(roomId)
        socket.join(roomKey)
        console.log(`[Socket] User ${userId} joined room ${roomId}`)

        socket.to(roomKey).emit('room:user_joined', {
          userId,
          username: member.user.username,
          role: member.role,
        })

        const members = await prisma.roomMember.findMany({
          where: { roomId },
          include: {
            user: { select: { id: true, username: true, role: true } },
            character: {
              select: {
                id: true,
                name: true,
                profession: true,
                rawData: true,
                combat: { select: { hpMax: true, spMax: true, spInit: true, staminaMax: true } },
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        })
        io.to(roomKey).emit('room:members', members)
        socket.emit('room:board_state', await getBoardState(roomId))
        socket.emit('room:music_state', getRoomMusicState(roomId))
        const canControlMusic = await canControlRoomMusic(roomId, userId)
        console.log(`[Socket] Room ${roomId} music capability for user ${userId}: ${canControlMusic}`)
        socket.emit('room:music_capability', {
          roomId,
          canControl: canControlMusic,
        })
        socket.emit('room:token_drag_state', serializeTokenDragState(roomId))
      } catch (err) {
        console.error('[Socket] room:join error:', err)
        socket.emit('error', { message: '加入房间失败' })
      }
    })

    socket.on('room:board:update', async ({ roomId, state }: { roomId: number; state: BoardState }) => {
      try {
        const member = await prisma.roomMember.findFirst({
          where: { roomId, userId },
          select: { id: true, role: true, room: { select: { snId: true } } },
        })
        if (!member) return

        const previousState = await getBoardState(roomId)
        const isSN = member.role === 'SN' || member.room.snId === userId
        const mergedState = mergeBoardStateForMember(previousState, state, userId, isSN)
        const nextState = await saveBoardState(roomId, mergedState)
        io.to(`room:${roomId}`).emit('room:board_state', nextState)
      } catch (err) {
        console.error('[Socket] room:board:update error:', err)
      }
    })

    socket.on('room:music:update', async ({ roomId, patch }: { roomId: number; patch: Partial<RoomMusicState> }) => {
      try {
        if (!await canControlRoomMusic(roomId, userId)) {
          console.warn(`[Socket] Room ${roomId} music update rejected for user ${userId}`)
          socket.emit('room:music_error', { message: '只有SN可以控制房间音乐' })
          socket.emit('room:music_capability', { roomId, canControl: false })
          return
        }
        const nextState = saveRoomMusicState(roomId, patch)
        io.to(`room:${roomId}`).emit('room:music_state', nextState)
      } catch (err) {
        console.error('[Socket] room:music:update error:', err)
      }
    })

    socket.on('room:token_drag_start', async ({ roomId, tokenId }: { roomId: number; tokenId: string }) => {
      try {
        if (!tokenId || typeof tokenId !== 'string' || tokenId.length > 120) return
        if (!await canControlBoardToken(roomId, userId, tokenId)) return

        const now = Date.now()
        getRoomTokenDragState(roomId).set(tokenId, {
          tokenId,
          userId,
          socketId: socket.id,
          startedAt: now,
          updatedAt: now,
        })
        emitTokenDragState(io, roomId)
      } catch (err) {
        console.error('[Socket] room:token_drag_start error:', err)
      }
    })

    socket.on('room:token_drag_end', async ({ roomId, tokenId }: { roomId: number; tokenId: string }) => {
      try {
        if (!tokenId || typeof tokenId !== 'string') return
        if (!await isRoomMember(roomId, userId)) return

        const state = roomTokenDragStates.get(roomId)
        const entry = state?.get(tokenId)
        if (!entry || (entry.socketId !== socket.id && entry.userId !== userId)) return

        state?.delete(tokenId)
        if (state && !state.size) roomTokenDragStates.delete(roomId)
        emitTokenDragState(io, roomId)
      } catch (err) {
        console.error('[Socket] room:token_drag_end error:', err)
      }
    })

    socket.on('room:token_drag_move', async ({ roomId, tokens }: {
      roomId: number
      tokens: Array<{ tokenId: string; x: number; y: number }>
    }) => {
      try {
        if (!Array.isArray(tokens) || !tokens.length) return
        if (!await isRoomMember(roomId, userId)) return

        const now = Date.now()
        const state = getRoomTokenDragState(roomId)
        const nextTokens = tokens
          .map(token => ({
            tokenId: typeof token?.tokenId === 'string' ? token.tokenId.slice(0, 120) : '',
            x: Number(token?.x),
            y: Number(token?.y),
          }))
          .filter(token => token.tokenId && Number.isFinite(token.x) && Number.isFinite(token.y))
          .slice(0, 60)
        if (!nextTokens.length) return

        const board = await getBoardState(roomId)
        const tokenById = mapBoardRecordsById(board.tokens)
        const member = await prisma.roomMember.findFirst({
          where: { roomId, userId },
          select: { role: true, room: { select: { snId: true } } },
        })
        if (!member) return
        const isSN = member.role === 'SN' || member.room.snId === userId
        const permittedTokens = nextTokens.filter(token => (
          isSN || userCanMoveToken(tokenById.get(token.tokenId) || {}, userId)
        ))
        if (!permittedTokens.length) return

        permittedTokens.forEach(token => {
          const entry = state.get(token.tokenId)
          if (entry && (entry.socketId === socket.id || entry.userId === userId)) {
            entry.updatedAt = now
          }
        })

        socket.to(`room:${roomId}`).emit('room:token_drag_move', {
          roomId,
          tokens: permittedTokens,
        })
      } catch (err) {
        console.error('[Socket] room:token_drag_move error:', err)
      }
    })

    socket.on('room:message', async ({ roomId, content, type }: {
      roomId: number; content: string; type?: string }) => {
      try {
        const member = await prisma.roomMember.findFirst({
          where: { roomId, userId },
          include: { user: { select: { id: true, username: true } } },
        })
        if (!member) return

        const msg = await prisma.roomMessage.create({
          data: {
            roomId,
            userId,
            type: type || 'text',
            content,
          },
        })

        io.to(`room:${roomId}`).emit('room:message', {
          id: msg.id,
          type: msg.type,
          content: msg.content,
          user: { id: member.user.id, username: member.user.username },
          createdAt: msg.createdAt.toISOString(),
        })
      } catch (err) {
        console.error('[Socket] room:message error:', err)
      }
    })

    socket.on('room:dice', async ({ roomId, expression, result }: {
      roomId: number; expression: string; result: { total: number; rolls: number[] } }) => {
      try {
        const member = await prisma.roomMember.findFirst({
          where: { roomId, userId },
          include: { user: { select: { id: true, username: true } } },
        })
        if (!member) return

        const normalizedExpression = typeof expression === 'string'
          ? expression.trim().replace(/\s+/g, '').toUpperCase()
          : ''
        const expressionMatch = normalizedExpression.match(/^(\d*)D(\d+)([+-]\d+)?$/)
        if (!expressionMatch || !Array.isArray(result?.rolls)) return

        const count = expressionMatch[1] ? Number(expressionMatch[1]) : 1
        const sides = Number(expressionMatch[2])
        const modifier = expressionMatch[3] ? Number(expressionMatch[3]) : 0
        if (!Number.isInteger(count) || !Number.isInteger(sides) || count < 1 || count > 100 || sides < 2 || sides > 1000) return
        if (result.rolls.length !== count || result.rolls.some(value => !Number.isInteger(value) || value < 1 || value > sides)) return

        const total = result.rolls.reduce((sum, value) => sum + value, 0) + modifier
        const threshold = Math.ceil(count / 2)
        const maxFaceCount = result.rolls.filter(value => value === sides).length
        const minFaceCount = result.rolls.filter(value => value === 1).length
        const criticalSuccess = maxFaceCount >= threshold
        const criticalFailure = minFaceCount >= threshold
        const criticalTag = criticalSuccess && criticalFailure
          ? ' 【大成功 / 大失败】'
          : criticalSuccess
            ? ' 【大成功】'
            : criticalFailure
              ? ' 【大失败】'
              : ''
        const diceContent = `ROLL ${normalizedExpression} = [${result.rolls.join(', ')}] -> **${total}**${criticalTag}`
        const msg = await prisma.roomMessage.create({
          data: { roomId, userId, type: 'dice', content: diceContent },
        })

        io.to(`room:${roomId}`).emit('room:message', {
          id: msg.id,
          type: 'dice',
          content: diceContent,
          user: { id: member.user.id, username: member.user.username },
          createdAt: msg.createdAt.toISOString(),
        })
      } catch (err) {
        console.error('[Socket] room:dice error:', err)
      }
    })

    socket.on('room:leave', ({ roomId }: { roomId: number }) => {
      socket.leave(`room:${roomId}`)
      clearSocketTokenDragStates(socket.id, roomId).forEach(changedRoomId => {
        emitTokenDragState(io, changedRoomId)
      })
      scheduleRoomArchiveIfEmpty(io, roomId)
    })

    socket.on('disconnecting', () => {
      socket.rooms.forEach(roomKey => {
        if (!roomKey.startsWith('room:')) return
        const roomId = Number(roomKey.slice(5))
        if (Number.isFinite(roomId)) scheduleRoomArchiveIfEmpty(io, roomId)
      })
    })

    socket.on('disconnect', () => {
      clearSocketTokenDragStates(socket.id).forEach(roomId => {
        emitTokenDragState(io, roomId)
      })
      console.log(`[Socket] User ${userId} disconnected (${socket.id})`)
    })
  })
}
