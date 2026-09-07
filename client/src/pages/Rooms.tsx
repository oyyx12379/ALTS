import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createRoom,
  deleteArchivedRoom,
  getArchivedRooms,
  getCharacters,
  getRooms,
  joinRoom,
} from '../api'

export default function Rooms() {
  const [rooms, setRooms] = useState<any[]>([])
  const [archivedRooms, setArchivedRooms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [deletingArchiveId, setDeletingArchiveId] = useState<number | null>(null)
  const [charactersLoading, setCharactersLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [newRoom, setNewRoom] = useState({ name: '', description: '', maxPlayers: 6 })
  const [selectedArchiveRoomId, setSelectedArchiveRoomId] = useState<number | null>(null)
  const [inviteCode, setInviteCode] = useState('')
  const [myCharacters, setMyCharacters] = useState<any[]>([])
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null)
  const navigate = useNavigate()

  const currentUser = (() => {
    const stored = localStorage.getItem('user')
    if (!stored) return null
    try { return JSON.parse(stored) } catch { return null }
  })()

  useEffect(() => { loadRooms() }, [])

  useEffect(() => {
    if (showJoin) loadCharacters()
  }, [showJoin])

  const loadRooms = async () => {
    try {
      const [active, archived] = await Promise.all([
        getRooms(),
        getArchivedRooms().catch(() => []),
      ])
      setRooms(active)
      setArchivedRooms(archived)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const loadCharacters = async () => {
    if (myCharacters.length > 0) return
    try {
      setCharactersLoading(true)
      const chars = await getCharacters()
      setMyCharacters(chars)
      setSelectedCharacterId((current) => current || chars[0]?.id || null)
    } catch (err) {
      console.error(err)
    } finally {
      setCharactersLoading(false)
    }
  }

  const openCreate = () => {
    setShowCreate(true)
    setShowJoin(false)
  }

  const openJoin = (code = '') => {
    setInviteCode(code)
    setSelectedCharacterId(null)
    setShowJoin(true)
    setShowCreate(false)
  }

  const enterRoom = (room: any) => {
    const existingMember = room.members?.find((member: any) => member.userId === currentUser?.id)
    if (existingMember) {
      navigate(`/rooms/${room.id}`)
      return
    }
    openJoin(room.inviteCode || '')
  }

  const handleCreate = async () => {
    if (!newRoom.name.trim()) return
    try {
      const room = await createRoom({ ...newRoom, archiveRoomId: selectedArchiveRoomId })
      navigate(`/rooms/${room.id}`)
    } catch (err: any) {
      alert(err.response?.data?.error || '创建房间失败')
    }
  }

  const formatArchiveTime = (value?: string) => {
    if (!value) return '暂无退出记录'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '暂无退出记录' : date.toLocaleString()
  }

  const selectArchive = (room: any | null) => {
    setSelectedArchiveRoomId(room?.id || null)
    if (!room) return
    setNewRoom({
      name: room.name || '',
      description: room.description || '',
      maxPlayers: room.maxPlayers || 6,
    })
  }

  const handleDeleteArchive = async (room: any) => {
    if (!confirm(`确定删除存档「${room.name || '未命名房间'}」？此操作不可撤销。`)) return
    try {
      setDeletingArchiveId(room.id)
      await deleteArchivedRoom(room.id)
      setArchivedRooms(prev => prev.filter(item => item.id !== room.id))
      if (selectedArchiveRoomId === room.id) selectArchive(null)
    } catch (err: any) {
      alert(err.response?.data?.error || '删除存档失败')
    } finally {
      setDeletingArchiveId(null)
    }
  }

  const handleJoin = async () => {
    if (!inviteCode.trim()) return
    try {
      setJoining(true)
      const result = await joinRoom(inviteCode.toUpperCase(), selectedCharacterId || undefined)
      navigate(`/rooms/${result.room.id}`)
    } catch (err: any) {
      alert(err.response?.data?.error || '加入失败')
    } finally {
      setJoining(false)
    }
  }

  return (
    <>
      <div className="top-header">
        <span className="page-title">游戏房间</span>
        <div className="spacer" />
        <button className="btn btn-ghost" onClick={() => openJoin()}>
          加入房间
        </button>
        <button className="btn btn-primary" onClick={openCreate}>
          创建房间
        </button>
      </div>

      <div className="page-content">
        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal room-create-modal" onClick={event => event.stopPropagation()}>
              <h2>创建游戏房间</h2>

              <div className="room-save-picker">
                <div className="room-save-picker-head">
                  <div>
                    <strong>选择存档</strong>
                    <small>无人在线的房间会从大厅移除，并保留为存档。</small>
                  </div>
                  <button
                    className={`btn btn-sm ${selectedArchiveRoomId === null ? 'btn-primary' : 'btn-ghost'}`}
                    type="button"
                    onClick={() => selectArchive(null)}
                  >
                    新开空白房间
                  </button>
                </div>
                {archivedRooms.length > 0 ? (
                  <div className="room-save-list">
                    {archivedRooms.map(room => (
                      <div
                        key={room.id}
                        className={`room-save-card ${selectedArchiveRoomId === room.id ? 'active' : ''}`}
                      >
                        <button
                          className="room-save-card-main"
                          type="button"
                          onClick={() => selectArchive(room)}
                        >
                          <span>
                            <strong>{room.name}</strong>
                            <small>{room.description || '无描述'}</small>
                          </span>
                          <em>上次退出 {formatArchiveTime(room.archivedAt)}</em>
                          <b>{room._count?.messages || 0} 条记录</b>
                        </button>
                        <button
                          className="btn btn-danger btn-sm room-save-delete"
                          type="button"
                          disabled={deletingArchiveId === room.id}
                          onClick={() => handleDeleteArchive(room)}
                        >
                          {deletingArchiveId === room.id ? '删除中' : '删除'}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="room-save-empty">暂无可用存档，将创建一个全新的房间。</div>
                )}
              </div>

              <div className="form-field">
                <label>房间名称</label>
                <input
                  className="input"
                  value={newRoom.name}
                  onChange={event => setNewRoom({ ...newRoom, name: event.target.value })}
                  placeholder="为这次跑团冒险取一个名字"
                  autoFocus
                />
              </div>
              <div className="form-field">
                <label>描述</label>
                <input
                  className="input"
                  value={newRoom.description}
                  onChange={event => setNewRoom({ ...newRoom, description: event.target.value })}
                  placeholder="简要描述本次冒险的背景"
                />
              </div>
              <div className="form-field">
                <label>最大玩家数</label>
                <select
                  className="input"
                  value={newRoom.maxPlayers}
                  onChange={event => setNewRoom({ ...newRoom, maxPlayers: Number(event.target.value) })}
                >
                  {[3, 4, 5, 6, 7, 8].map(count => (
                    <option key={count} value={count}>{count}人</option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>取消</button>
                <button className="btn btn-primary" onClick={handleCreate}>
                  {selectedArchiveRoomId ? '使用存档创建' : '创建'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showJoin && (
          <div className="modal-overlay" onClick={() => setShowJoin(false)}>
            <div className="modal" onClick={event => event.stopPropagation()}>
              <h2>加入游戏房间</h2>
              <div className="form-field">
                <label>邀请码</label>
                <input
                  className="input"
                  value={inviteCode}
                  onChange={event => setInviteCode(event.target.value.toUpperCase())}
                  placeholder="输入 SN 提供的 6 位邀请码"
                  autoFocus
                  maxLength={6}
                  style={{ fontSize: 20, textAlign: 'center', letterSpacing: 8, fontWeight: 700 }}
                />
              </div>

              <div className="form-field">
                <label>选择角色</label>
                {charactersLoading ? (
                  <div className="input" style={{ color: 'var(--text-muted)' }}>角色加载中...</div>
                ) : myCharacters.length > 0 ? (
                  <select
                    className="input"
                    value={selectedCharacterId || ''}
                    onChange={event => setSelectedCharacterId(event.target.value ? Number(event.target.value) : null)}
                  >
                    <option value="">不绑定角色，直接进入房间</option>
                    {myCharacters.map((character: any) => (
                      <option key={character.id} value={character.id}>
                        {character.name} - {character.profession || '未设置职业'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="room-join-no-character">
                    <div className="input">暂无可用角色，也可以直接进入房间。</div>
                    <button className="btn btn-ghost" type="button" onClick={() => navigate('/characters')}>
                      前往角色管理
                    </button>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setShowJoin(false)}>取消</button>
                <button
                  className="btn btn-primary"
                  disabled={joining || charactersLoading}
                  onClick={handleJoin}
                >
                  {joining ? '加入中...' : '加入'}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading-page"><div className="spinner" /><span>加载房间列表...</span></div>
        ) : rooms.length === 0 ? (
          <div className="room-empty-state">
            <div>--</div>
            <p>暂无活跃房间，创建一个开始冒险吧</p>
          </div>
        ) : (
          <div className="grid-3">
            {rooms.map(room => (
              <button
                key={room.id}
                className="card card-glow room-card"
                type="button"
                onClick={() => enterRoom(room)}
              >
                <div className="room-card-head">
                  <span className="badge badge-green">
                    {room.members?.length || 0}/{room.maxPlayers}人
                  </span>
                  <span>{room.inviteCode}</span>
                </div>
                <h3>{room.name}</h3>
                <p>{room.description || '无描述'}</p>
                <div>SN: {room.members?.find((member: any) => member.role === 'SN')?.user?.username || '未知'}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
