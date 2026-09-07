import { Router, Response } from 'express'
import { prisma } from '../index'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { getSocketServer } from '../socket/socketServer'

const router = Router()

function omitBoardState<T extends { boardState?: unknown }>(room: T) {
  const publicRoom = { ...room }
  delete publicRoom.boardState
  return publicRoom
}

function createInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

async function archiveRoom(roomId: number) {
  const archivedAt = new Date()
  await prisma.$transaction([
    prisma.roomMember.deleteMany({ where: { roomId } }),
    prisma.room.update({
      where: { id: roomId },
      data: { isActive: false, archivedAt },
    }),
  ])
  return archivedAt
}

async function archiveRoomsWithoutLiveSockets() {
  const io = getSocketServer()
  if (!io) return

  const activeRooms = await prisma.room.findMany({
    where: {
      isActive: true,
      createdAt: { lt: new Date(Date.now() - 15_000) },
    },
    select: { id: true },
  })

  await Promise.all(activeRooms.map(async room => {
    const liveSocketCount = io.sockets.adapter.rooms.get(`room:${room.id}`)?.size || 0
    if (liveSocketCount > 0) return
    await archiveRoom(room.id)
  }))
}

async function emitRoomMembers(roomId: number) {
  const io = getSocketServer()
  if (!io) return

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
  io.to(`room:${roomId}`).emit('room:members', members)

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { snId: true },
  })
  if (!room) return

  members.forEach(member => {
    io.to(`user:${member.userId}`).emit('room:music_capability', {
      roomId,
      canControl: member.role === 'SN' || room.snId === member.userId,
    })
  })
}

function emitRoomMessage(roomId: number, msg: {
  id: number
  type: string
  content: string
  createdAt: Date
  user?: { id: number; username: string }
}) {
  const io = getSocketServer()
  if (!io) return

  io.to(`room:${roomId}`).emit('room:message', {
    id: msg.id,
    type: msg.type,
    content: msg.content,
    user: msg.user,
    createdAt: msg.createdAt.toISOString(),
  })
}

// Create room (SN only)
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, maxPlayers, archiveRoomId } = req.body
    const inviteCode = createInviteCode()

    if (archiveRoomId) {
      const roomId = Number(archiveRoomId)
      const archivedRoom = await prisma.room.findUnique({ where: { id: roomId } })
      if (!archivedRoom) {
        res.status(404).json({ error: '存档不存在' })
        return
      }
      if (archivedRoom.snId !== req.userId) {
        res.status(403).json({ error: '只能使用自己作为SN的存档' })
        return
      }
      if (archivedRoom.isActive) {
        res.status(400).json({ error: '该存档仍在进行中' })
        return
      }

      const room = await prisma.room.update({
        where: { id: roomId },
        data: {
          name: name?.trim() || archivedRoom.name,
          description: description ?? archivedRoom.description,
          inviteCode,
          maxPlayers: maxPlayers || archivedRoom.maxPlayers,
          isActive: true,
          archivedAt: null,
        },
      })

      await prisma.roomMember.create({
        data: {
          roomId: room.id,
          userId: req.userId!,
          role: 'SN',
        },
      })

      res.json(omitBoardState(room))
      return
    }

    const room = await prisma.room.create({
      data: {
        name,
        description: description || '',
        inviteCode,
        snId: req.userId!,
        maxPlayers: maxPlayers || 6,
      },
    })

    // Auto-join creator as SN
    await prisma.roomMember.create({
      data: {
        roomId: room.id,
        userId: req.userId!,
        role: 'SN',
      },
    })

    res.json(omitBoardState(room))
  } catch (err) {
    res.status(500).json({ error: '创建房间失败' })
  }
})

// Get inactive rooms owned by current SN for reopening.
router.get('/archived', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const rooms = await prisma.room.findMany({
      where: {
        isActive: false,
        snId: req.userId!,
      },
      include: {
        members: { include: { user: { select: { id: true, username: true } } } },
        _count: { select: { messages: true } },
      },
      orderBy: [
        { archivedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    })
    res.json(rooms.map(omitBoardState))
  } catch {
    res.status(500).json({ error: '获取历史房间失败' })
  }
})

// Delete an inactive room save owned by the current SN.
router.delete('/archived/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const roomId = Number(req.params.id)
    const room = await prisma.room.findUnique({ where: { id: roomId } })
    if (!room) {
      res.status(404).json({ error: '存档不存在' })
      return
    }
    if (room.snId !== req.userId) {
      res.status(403).json({ error: '只能删除自己作为SN的存档' })
      return
    }
    if (room.isActive) {
      res.status(400).json({ error: '进行中的房间不能作为存档删除' })
      return
    }

    await prisma.room.delete({ where: { id: roomId } })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: '删除存档失败' })
  }
})

// Get all active rooms
router.get('/', async (_req, res: Response) => {
  await archiveRoomsWithoutLiveSockets()
  const rooms = await prisma.room.findMany({
    where: {
      isActive: true,
      members: { some: {} },
    },
    include: {
      members: { include: { user: { select: { id: true, username: true } } } },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(rooms.map(omitBoardState))
})

// Get room by ID
router.get('/:id', async (req, res: Response) => {
  const room = await prisma.room.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      members: {
        include: {
          user: { select: { id: true, username: true, role: true } },
          character: {
            include: {
              combat: { select: { hpMax: true, spMax: true, spInit: true, staminaMax: true } },
            },
          },
        },
      },
      messages: {
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, username: true } } },
      },
    },
  })
  if (!room) {
    res.status(404).json({ error: '房间不存在' })
    return
  }
  res.json({ ...omitBoardState(room), messages: room.messages.reverse() })
})

// Join room by invite code
router.post('/join', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { inviteCode, characterId } = req.body
    const room = await prisma.room.findUnique({ where: { inviteCode } })
    if (!room) {
      res.status(404).json({ error: '房间不存在或邀请码错误' })
      return
    }
    if (!room.isActive) {
      res.status(400).json({ error: '房间已归档，请由SN重新开启后再加入' })
      return
    }

    const boundCharacterId = characterId ? Number(characterId) : null
    if (false && !boundCharacterId) {
      res.status(400).json({ error: '进入房间前请选择角色' })
      return
    }

    const character = boundCharacterId ? await prisma.character.findFirst({
      where: { id: boundCharacterId, userId: req.userId },
    }) : null
    if (boundCharacterId && !character) {
      res.status(400).json({ error: '只能绑定自己的角色' })
      return
    }

    const existing = await prisma.roomMember.findFirst({
      where: { roomId: room.id, userId: req.userId },
    })
    if (existing) {
      await prisma.roomMember.update({
        where: { id: existing.id },
        data: { characterId: boundCharacterId },
      })
      await emitRoomMembers(room.id)
      res.json({ alreadyJoined: true, room: omitBoardState(room) })
      return
    }

    const memberCount = await prisma.roomMember.count({ where: { roomId: room.id } })
    if (memberCount >= room.maxPlayers) {
      res.status(400).json({ error: '房间已满' })
      return
    }

    await prisma.roomMember.create({
      data: {
        roomId: room.id,
        userId: req.userId!,
        characterId: boundCharacterId,
        role: 'PL',
      },
    })

    res.json({ success: true, room: omitBoardState(room) })
  } catch (err) {
    res.status(500).json({ error: '加入房间失败' })
  }
})

// Reopen an inactive room save. Only the current SN/owner can reopen it.
router.post('/:id/reopen', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const roomId = Number(req.params.id)
    const room = await prisma.room.findUnique({ where: { id: roomId } })
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    if (room.snId !== req.userId) {
      res.status(403).json({ error: '只有该房间的SN可以重新开启' })
      return
    }

    const reopened = await prisma.room.update({
      where: { id: roomId },
      data: {
        isActive: true,
        inviteCode: createInviteCode(),
      },
    })

    const existingMember = await prisma.roomMember.findFirst({
      where: { roomId, userId: req.userId! },
      select: { id: true },
    })

    if (existingMember) {
      await prisma.roomMember.update({
        where: { id: existingMember.id },
        data: { role: 'SN' },
      })
    } else {
      await prisma.roomMember.create({
        data: {
          roomId,
          userId: req.userId!,
          role: 'SN',
        },
      })
    }

    res.json(omitBoardState(reopened))
  } catch (err) {
    console.error('Reopen room error:', err)
    res.status(500).json({ error: '重新开启房间失败' })
  }
})

// Transfer SN permissions to another current room member.
router.put('/:id/transfer-sn', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const roomId = Number(req.params.id)
    const targetUserId = Number(req.body.userId)
    if (!targetUserId) {
      res.status(400).json({ error: '请选择要转让的成员' })
      return
    }

    const room = await prisma.room.findUnique({ where: { id: roomId } })
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }

    const currentMember = await prisma.roomMember.findFirst({
      where: { roomId, userId: req.userId },
    })
    if (!currentMember || (room.snId !== req.userId && currentMember.role !== 'SN')) {
      res.status(403).json({ error: '只有当前SN可以转让权限' })
      return
    }

    const targetMember = await prisma.roomMember.findFirst({
      where: { roomId, userId: targetUserId },
      include: { user: { select: { id: true, username: true } } },
    })
    if (!targetMember) {
      res.status(400).json({ error: '目标成员不在房间中' })
      return
    }

    const [, , , message] = await prisma.$transaction([
      prisma.room.update({
        where: { id: roomId },
        data: { snId: targetUserId },
      }),
      prisma.roomMember.updateMany({
        where: { roomId, role: 'SN' },
        data: { role: 'PL' },
      }),
      prisma.roomMember.update({
        where: { id: targetMember.id },
        data: { role: 'SN' },
      }),
      prisma.roomMessage.create({
        data: {
          roomId,
          userId: req.userId!,
          type: 'system',
          content: `SN权限已转让给 ${targetMember.user.username}`,
        },
        include: { user: { select: { id: true, username: true } } },
      }),
    ])

    await emitRoomMembers(roomId)
    emitRoomMessage(roomId, message)

    res.json({ success: true, snId: targetUserId })
  } catch (err) {
    console.error('Transfer SN error:', err)
    res.status(500).json({ error: '转让SN权限失败' })
  }
})

// Leave room
router.delete('/:id/leave', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const roomId = Number(req.params.id)
    const room = await prisma.room.findUnique({ where: { id: roomId } })
    const leavingMember = await prisma.roomMember.findFirst({
      where: {
        roomId,
        userId: req.userId,
      },
    })
    if (!room || !leavingMember) {
      res.json({ success: true })
      return
    }

    await prisma.roomMember.delete({ where: { id: leavingMember.id } })

    const remainingMembers = await prisma.roomMember.findMany({
      where: { roomId },
      orderBy: { joinedAt: 'asc' },
    })

    if (remainingMembers.length === 0) {
      await archiveRoom(roomId)
      res.json({ success: true, archived: true })
      return
    }

    let transferMessage: {
      id: number
      type: string
      content: string
      createdAt: Date
      user?: { id: number; username: string }
    } | null = null

    if (room.snId === req.userId || leavingMember.role === 'SN') {
      const nextSN = remainingMembers[0]
      const [, , , message] = await prisma.$transaction([
        prisma.room.update({
          where: { id: roomId },
          data: { snId: nextSN.userId },
        }),
        prisma.roomMember.updateMany({
          where: { roomId, role: 'SN' },
          data: { role: 'PL' },
        }),
        prisma.roomMember.update({
          where: { id: nextSN.id },
          data: { role: 'SN' },
        }),
        prisma.roomMessage.create({
          data: {
            roomId,
            userId: nextSN.userId,
            type: 'system',
            content: '原SN离开房间，SN权限已自动转移。',
          },
          include: { user: { select: { id: true, username: true } } },
        }),
      ])
      transferMessage = message
    }

    await emitRoomMembers(roomId)
    if (transferMessage) emitRoomMessage(roomId, transferMessage)

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: '退出房间失败' })
  }
})

// Bind character to room
router.put('/:id/bind-character', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const characterId = req.body.characterId ? Number(req.body.characterId) : null
    if (characterId) {
      const character = await prisma.character.findFirst({
        where: { id: characterId, userId: req.userId },
      })
      if (!character) {
        res.status(400).json({ error: '只能绑定自己的角色' })
        return
      }
    }

    const result = await prisma.roomMember.updateMany({
      where: {
        roomId: Number(req.params.id),
        userId: req.userId,
      },
      data: { characterId },
    })
    if (result.count === 0) {
      res.status(403).json({ error: '你不是该房间的成员' })
      return
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: '绑定角色失败' })
  }
})

// Get room messages
router.get('/:id/messages', async (req, res: Response) => {
  const messages = await prisma.roomMessage.findMany({
    where: { roomId: Number(req.params.id) },
    take: 100,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, username: true } } },
  })
  res.json(messages.reverse())
})

// Create a room message (REST fallback)
router.post('/:id/messages', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const roomId = Number(req.params.id)
    const { content, type } = req.body

    const member = await prisma.roomMember.findFirst({
      where: { roomId, userId: req.userId },
    })
    if (!member) {
      res.status(403).json({ error: '你不是该房间的成员' })
      return
    }

    const msg = await prisma.roomMessage.create({
      data: {
        roomId,
        userId: req.userId!,
        type: type || 'text',
        content,
      },
    })
    res.json(msg)
  } catch (err) {
    res.status(500).json({ error: '发送消息失败' })
  }
})

export default router
