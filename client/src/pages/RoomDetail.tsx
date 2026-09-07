import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'
import { getRoom, leaveRoom, getCharacters, bindCharacter, transferRoomSN } from '../api'
import { SOCKET_URL } from '../config'
import BattleBoard from '../components/BattleBoard'
import {
  createDefaultBoardState,
  normalizeBoardState,
  type BoardState,
} from '../components/battleBoardState'
import DiceTotalSlot from '../components/DiceTotalSlot'
import { useMusic, type RoomMusicState } from '../stores/music'
import { rollDiceExpression, type DiceRoll } from '../utils/dice'

type TokenDragPreviewPosition = { tokenId: string; x: number; y: number }

export default function RoomDetail({ user }: { user: any }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [room, setRoom] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<any[]>([])
  const [chatInput, setChatInput] = useState('')
  const [diceExpr, setDiceExpr] = useState('D20')
  const [diceError, setDiceError] = useState('')
  const [lastDiceRoll, setLastDiceRoll] = useState<DiceRoll | null>(null)
  const [diceRollKey, setDiceRollKey] = useState(0)
  const [myChars, setMyChars] = useState<any[]>([])
  const [selectedCharId, setSelectedCharId] = useState<number | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [showDice, setShowDice] = useState(false)
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)
  const [boardState, setBoardState] = useState<BoardState>(() => createDefaultBoardState())
  const [activeDraggingTokenIds, setActiveDraggingTokenIds] = useState<string[]>([])
  const [tokenDragPreviewPositions, setTokenDragPreviewPositions] = useState<Record<string, { x: number; y: number }>>({})
  const socketRef = useRef<Socket | null>(null)
  const lastTokenDragMoveEmitAtRef = useRef(0)
  const clearDragPreviewTimerRef = useRef<number | null>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const {
    enterRoomMusic,
    leaveRoomMusic,
    setRoomController,
    applyRoomMusicState,
    setError: setMusicError,
  } = useMusic()

  const roomId = Number(id)
  const currentUserId = Number(user.id)
  const isSN = useMemo(() => (
    Number(room?.snId) === currentUserId
    || members.some((member: any) => Number(member.userId) === currentUserId && member.role === 'SN')
  ), [currentUserId, members, room?.snId])

  const dispatchRoomMusic = useCallback((patch: Partial<RoomMusicState>) => {
    socketRef.current?.emit('room:music:update', {
      roomId,
      patch,
    })
  }, [roomId])

  const loadRoom = useCallback(async () => {
    try {
      const data = await getRoom(roomId)
      setRoom(data)
      setMessages(data.messages || [])
      setMembers(data.members || [])

      const myMember = data.members?.find((member: any) => Number(member.userId) === currentUserId)
      setSelectedCharId(myMember?.characterId || null)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [currentUserId, roomId])

  const loadMyChars = useCallback(async () => {
    try {
      const chars = await getCharacters()
      setMyChars(chars)
    } catch {
      // The room itself can still work if the character list request fails.
    }
  }, [])

  useEffect(() => {
    enterRoomMusic(roomId, false, dispatchRoomMusic)
    return () => leaveRoomMusic(roomId)
  }, [dispatchRoomMusic, enterRoomMusic, leaveRoomMusic, roomId])

  useEffect(() => {
    loadRoom()
    loadMyChars()
    return () => {
      if (socketRef.current) {
        socketRef.current.emit('room:leave', { roomId })
        socketRef.current.disconnect()
      }
    }
  }, [loadRoom, loadMyChars, roomId])

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (loading) return

    const token = localStorage.getItem('token')
    const socketOptions = { auth: { token } }
    const socket = SOCKET_URL ? io(SOCKET_URL, socketOptions) : io(socketOptions)
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('room:join', { roomId })
    })

    socket.on('room:message', (msg: any) => {
      setMessages(prev => [...prev, msg])
    })

    socket.on('room:user_joined', (data: any) => {
      setMessages(prev => [...prev, {
        id: Date.now(),
        type: 'system',
        content: `${data.username} 加入了房间`,
        user: { username: '系统' },
        createdAt: new Date().toISOString(),
      }])
    })

    socket.on('room:members', (list: any[]) => {
      setMembers(prev => list.map(member => {
        const previous = prev.find(item => item.id === member.id || item.userId === member.userId)
        if (member.character?.rawData || !previous?.character?.rawData) return member
        return {
          ...member,
          character: member.character
            ? { ...previous.character, ...member.character }
            : previous.character,
        }
      }))
    })

    socket.on('room:board_state', (state: any) => {
      setBoardState(normalizeBoardState(state))
      setTokenDragPreviewPositions({})
    })

    socket.on('room:music_state', (state: RoomMusicState) => {
      applyRoomMusicState(state)
    })

    socket.on('room:music_capability', (payload: any) => {
      if (Number(payload?.roomId) !== roomId) return
      setRoomController(!!payload?.canControl, dispatchRoomMusic)
    })

    socket.on('room:music_error', (payload: any) => {
      setMusicError(payload?.message || '房间音乐控制失败')
    })

    socket.on('room:token_drag_state', (payload: any) => {
      if (Number(payload?.roomId) !== roomId) return
      const tokenIds: string[] = Array.isArray(payload?.tokens)
        ? payload.tokens
          .map((entry: any) => entry?.tokenId)
          .filter((tokenId: unknown): tokenId is string => typeof tokenId === 'string' && tokenId.length > 0)
        : Array.isArray(payload?.tokenIds)
          ? payload.tokenIds.filter((tokenId: unknown): tokenId is string => typeof tokenId === 'string' && tokenId.length > 0)
          : []
      setActiveDraggingTokenIds([...new Set<string>(tokenIds)])
      if (!tokenIds.length) {
        if (clearDragPreviewTimerRef.current) window.clearTimeout(clearDragPreviewTimerRef.current)
        clearDragPreviewTimerRef.current = window.setTimeout(() => {
          setTokenDragPreviewPositions({})
          clearDragPreviewTimerRef.current = null
        }, 900)
      }
    })

    socket.on('room:token_drag_move', (payload: any) => {
      if (Number(payload?.roomId) !== roomId || !Array.isArray(payload?.tokens)) return
      const positions: TokenDragPreviewPosition[] = payload.tokens
        .map((token: any): TokenDragPreviewPosition | null => {
          const tokenId = typeof token?.tokenId === 'string' ? token.tokenId : ''
          const x = Number(token?.x)
          const y = Number(token?.y)
          return tokenId && Number.isFinite(x) && Number.isFinite(y) ? { tokenId, x, y } : null
        })
        .filter((token: TokenDragPreviewPosition | null): token is TokenDragPreviewPosition => !!token)
      if (!positions.length) return

      setTokenDragPreviewPositions(prev => {
        const next = { ...prev }
        positions.forEach(position => {
          next[position.tokenId] = { x: position.x, y: position.y }
        })
        return next
      })
    })

    socket.on('error', (err: any) => {
      console.error('[Socket] Error:', err.message)
    })

    return () => {
      socket.emit('room:leave', { roomId })
      socket.disconnect()
      setActiveDraggingTokenIds([])
      setTokenDragPreviewPositions({})
      if (clearDragPreviewTimerRef.current) window.clearTimeout(clearDragPreviewTimerRef.current)
    }
  }, [applyRoomMusicState, dispatchRoomMusic, loading, roomId, setMusicError, setRoomController])

  const updateBoardState = useCallback((next: BoardState, options?: { sync?: boolean }) => {
    const normalized = normalizeBoardState(next)
    setBoardState(normalized)
    if (options?.sync !== false && socketRef.current) {
      socketRef.current.emit('room:board:update', {
        roomId,
        state: normalized,
      })
    }
  }, [roomId])

  const handleTokenDragStart = useCallback((tokenId: string) => {
    socketRef.current?.emit('room:token_drag_start', { roomId, tokenId })
  }, [roomId])

  const handleTokenDragEnd = useCallback((tokenId: string) => {
    socketRef.current?.emit('room:token_drag_end', { roomId, tokenId })
  }, [roomId])

  const handleTokenDragMove = useCallback((tokens: TokenDragPreviewPosition[], options?: { force?: boolean }) => {
    if (!socketRef.current || !tokens.length) return

    const now = performance.now()
    if (!options?.force && now - lastTokenDragMoveEmitAtRef.current < 80) return
    lastTokenDragMoveEmitAtRef.current = now
    socketRef.current.emit('room:token_drag_move', { roomId, tokens })
  }, [roomId])

  const sendMessage = () => {
    if (!chatInput.trim() || !socketRef.current) return
    socketRef.current.emit('room:message', {
      roomId,
      content: chatInput.trim(),
      type: 'text',
    })
    setChatInput('')
  }

  const rollDice = () => {
    if (!socketRef.current) return
    const rolled = rollDiceExpression(diceExpr)
    if (!rolled) {
      setDiceError('请输入 xdy+z 格式，例如 D20、2d6+3、3d8-1')
      return
    }
    setDiceError('')
    setLastDiceRoll(rolled)
    setDiceRollKey(key => key + 1)

    window.setTimeout(() => {
      socketRef.current?.emit('room:dice', {
        roomId,
        expression: rolled.expression,
        result: {
          total: rolled.total,
          rolls: rolled.rolls,
          criticalSuccess: rolled.criticalSuccess,
          criticalFailure: rolled.criticalFailure,
        },
      })
    }, 1700)
  }

  const bindChar = async (charId: number | null) => {
    try {
      await bindCharacter(roomId, charId)
      setSelectedCharId(charId)
      await loadRoom()
    } catch (err) {
      console.error(err)
    }
  }

  const transferSN = async (member: any) => {
    const targetName = member.user?.username || '该成员'
    if (!confirm(`确定将 SN 权限转让给 ${targetName}？`)) return
    try {
      await transferRoomSN(roomId, member.userId)
      await loadRoom()
    } catch (err: any) {
      alert(err.response?.data?.error || '转让失败')
    }
  }

  const handleLeave = async () => {
    if (!confirm('确定退出房间？')) return
    try {
      await leaveRoom(roomId)
      navigate('/rooms')
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>加载房间...</span>
      </div>
    )
  }

  if (!room) return <div className="loading-page"><span>房间不存在</span></div>

  return (
    <div className="room-battle-shell">
      <div className="top-header">
        <button className="btn btn-ghost" onClick={() => navigate('/rooms')}>返回</button>
        <span className="page-title">{room.name}</span>
        <span className="badge badge-green">{members.length}/{room.maxPlayers}人</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
          邀请码: <strong style={{ color: 'var(--color-orange)' }}>{room.inviteCode}</strong>
        </span>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => setShowDice(!showDice)}>掷骰</button>
        <button className="btn btn-danger btn-sm" onClick={handleLeave}>退出</button>
      </div>

      {showDice && (
        <div className="room-dice-bar">
          <DiceTotalSlot
            rollKey={diceRollKey}
            result={lastDiceRoll?.total ?? null}
            label={lastDiceRoll?.expression || 'DICE TOTAL'}
            minTotal={lastDiceRoll ? lastDiceRoll.count + lastDiceRoll.modifier : undefined}
            maxTotal={lastDiceRoll ? lastDiceRoll.count * lastDiceRoll.sides + lastDiceRoll.modifier : undefined}
            criticalSuccess={lastDiceRoll?.criticalSuccess}
            criticalFailure={lastDiceRoll?.criticalFailure}
          />
          <div className="room-dice-control">
            <label htmlFor="room-dice-input">骰子</label>
            <input
              id="room-dice-input"
              className="input"
              value={diceExpr}
              onChange={event => {
                setDiceExpr(event.target.value)
                setDiceError('')
              }}
              onKeyDown={event => { if (event.key === 'Enter') rollDice() }}
              style={{ width: 150 }}
              placeholder="2d6+3"
            />
            {[2, 4, 6, 8, 10, 12, 20].map(sides => (
              <button key={sides} className="btn btn-sm" onClick={() => setDiceExpr(`D${sides}`)}>D{sides}</button>
            ))}
            <button className="btn btn-primary btn-sm" onClick={rollDice}>投掷</button>
            <span className="text-muted text-sm">支持 xdy+z，如 2d6+3</span>
            {diceError && <span className="room-dice-error" role="alert">{diceError}</span>}
          </div>
        </div>
      )}

      <div className="room-battle-main">
        <main className="room-board-area">
          <BattleBoard
            state={boardState}
            members={members}
            user={user}
            room={room}
            onChange={updateBoardState}
            activeDraggingTokenIds={activeDraggingTokenIds}
            tokenDragPreviewPositions={tokenDragPreviewPositions}
            onTokenDragStart={handleTokenDragStart}
            onTokenDragMove={handleTokenDragMove}
            onTokenDragEnd={handleTokenDragEnd}
          />
        </main>

        <aside className={`room-chat-panel ${mobilePanelOpen ? 'open' : ''}`}>
          <section className="room-side-section">
            <div className="room-side-title">
              <strong>我的角色</strong>
              <span>{isSN ? 'SN' : 'PL'}</span>
            </div>
            <select
              className="input"
              value={selectedCharId || ''}
              onChange={event => bindChar(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">未绑定角色</option>
              {myChars.map((character: any) => (
                <option key={character.id} value={character.id}>
                  {character.name} - {character.profession || '未设置职业'}
                </option>
              ))}
            </select>
          </section>

          <section className="room-side-section room-members-section">
            <div className="room-side-title">
              <strong>成员</strong>
              <span>{members.length}</span>
            </div>
            <div className="room-member-list">
              {members.map((member: any) => (
                <div key={member.id} className="room-member-item">
                  <span className={`room-member-dot ${member.role === 'SN' ? 'sn' : ''}`} />
                  <div>
                    <strong>{member.user?.username}</strong>
                    <small>{member.role === 'SN' ? '叙事者' : '玩家'}{member.character ? ` / ${member.character.name}` : ''}</small>
                  </div>
                  {isSN && member.userId !== user.id && member.role !== 'SN' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      onClick={() => transferSN(member)}
                      style={{ marginLeft: 'auto' }}
                    >
                      转让
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="room-chat-section">
            <div className="room-side-title">
              <strong>房间聊天</strong>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowDice(!showDice)}>掷骰</button>
            </div>

            <div ref={chatRef} className="room-message-list">
              {messages.length === 0 && (
                <div className="room-empty-chat">暂无消息</div>
              )}
              {messages.map((msg: any) => (
                <div key={msg.id} className={`room-message ${msg.type === 'system' ? 'system' : ''}`}>
                  {msg.type === 'system' ? (
                    <span>{msg.content}</span>
                  ) : (
                    <>
                      <div className="room-message-meta">
                        <strong className={msg.type === 'dice' ? 'dice' : ''}>
                          {msg.user?.username || '系统'}
                        </strong>
                        <time>{new Date(msg.createdAt).toLocaleTimeString()}</time>
                      </div>
                      <p className={msg.type === 'dice' ? 'dice' : ''}>{msg.content}</p>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="room-chat-input">
              <input
                className="input"
                value={chatInput}
                onChange={event => setChatInput(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') sendMessage() }}
                placeholder="输入消息..."
              />
              <button className="btn btn-primary" onClick={sendMessage}>发送</button>
            </div>
          </section>
        </aside>
      </div>

      <div className="room-mobile-dock" aria-label="移动端房间工具">
        <button
          className={`btn btn-sm ${mobilePanelOpen ? 'btn-primary' : ''}`}
          type="button"
          aria-expanded={mobilePanelOpen}
          onClick={() => setMobilePanelOpen(open => !open)}
        >
          {mobilePanelOpen ? '收起侧栏' : '角色/聊天'}
        </button>
        <button
          className={`btn btn-sm ${showDice ? 'btn-primary' : ''}`}
          type="button"
          aria-expanded={showDice}
          onClick={() => setShowDice(open => !open)}
        >
          骰子
        </button>
      </div>
    </div>
  )
}
