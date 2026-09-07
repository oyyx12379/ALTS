import { create } from 'zustand'
import { LOBBY_BGM_TRACKS, type BgmTrack } from '../music/bgmTracks'

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'error'
export type PlayMode = 'single' | 'list'
export type MusicContext = 'lobby' | 'room'

export type RoomMusicState = {
  tracks: BgmTrack[]
  currentTrackId: string
  status: PlaybackStatus
  volume: number
  muted: boolean
  playMode: PlayMode
  currentTime: number
  updatedAt: number
}

type RoomMusicDispatch = (patch: Partial<RoomMusicState>) => void

interface MusicStore {
  context: MusicContext
  roomId: number | null
  roomIsSN: boolean
  tracks: BgmTrack[]
  currentTrackId: string
  status: PlaybackStatus
  volume: number
  muted: boolean
  playMode: PlayMode
  currentTime: number
  duration: number
  updatedAt: number
  error: string
  setLobbyMusic: () => void
  enterRoomMusic: (roomId: number, isSN: boolean, dispatch: RoomMusicDispatch) => void
  leaveRoomMusic: (roomId: number) => void
  setRoomController: (isSN: boolean, dispatch: RoomMusicDispatch) => void
  applyRoomMusicState: (state: RoomMusicState) => void
  addTrack: (track: BgmTrack) => void
  removeTrack: (trackId: string) => void
  selectTrack: (trackId: string) => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  nextTrack: () => void
  previousTrack: () => void
  setVolume: (volume: number) => void
  toggleMuted: () => void
  setPlayMode: (mode: PlayMode) => void
  seek: (time: number) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setError: (error: string) => void
  clearError: () => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const numberOr = (value: unknown, fallback: number) => {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

const lobbyState = () => ({
  context: 'lobby' as const,
  roomId: null,
  roomIsSN: false,
  tracks: LOBBY_BGM_TRACKS,
  currentTrackId: LOBBY_BGM_TRACKS[0]?.id || '',
  status: LOBBY_BGM_TRACKS.length ? 'playing' as PlaybackStatus : 'idle' as PlaybackStatus,
  volume: 0.42,
  muted: false,
  playMode: 'single' as PlayMode,
  currentTime: 0,
  duration: 0,
  updatedAt: Date.now(),
  error: '',
})

const roomFallback = (roomId: number, roomIsSN: boolean) => ({
  context: 'room' as const,
  roomId,
  roomIsSN,
  tracks: [] as BgmTrack[],
  currentTrackId: '',
  status: 'idle' as PlaybackStatus,
  volume: 0.55,
  muted: false,
  playMode: 'list' as PlayMode,
  currentTime: 0,
  duration: 0,
  updatedAt: Date.now(),
  error: '',
})

const getTrackIndex = (tracks: BgmTrack[], currentTrackId: string) => {
  const index = tracks.findIndex(track => track.id === currentTrackId)
  return index >= 0 ? index : 0
}

let roomDispatch: RoomMusicDispatch | null = null

export const useMusic = create<MusicStore>((set, get) => {
  const commitRoomPatch = (patch: Partial<RoomMusicState>) => {
    const state = get()
    if (state.context !== 'room' || !state.roomIsSN || !roomDispatch) return
    const nextPatch = { ...patch, updatedAt: Date.now() }
    set(nextPatch)
    roomDispatch(nextPatch)
  }

  const canEdit = () => {
    const state = get()
    return state.context !== 'room' || state.roomIsSN
  }

  return {
    ...lobbyState(),

    setLobbyMusic: () => {
      roomDispatch = null
      set(lobbyState())
    },

    enterRoomMusic: (roomId, isSN, dispatch) => {
      roomDispatch = dispatch
      set(roomFallback(roomId, isSN))
    },

    leaveRoomMusic: roomId => {
      const state = get()
      if (state.context === 'room' && state.roomId === roomId) {
        roomDispatch = null
        set(lobbyState())
      }
    },

    setRoomController: (isSN, dispatch) => {
      roomDispatch = dispatch
      set({ roomIsSN: isSN })
    },

    applyRoomMusicState: roomState => {
      const activeTrackId = roomState.tracks.some(track => track.id === roomState.currentTrackId)
        ? roomState.currentTrackId
        : roomState.tracks[0]?.id || ''
      set({
        context: 'room',
        tracks: roomState.tracks,
        currentTrackId: activeTrackId,
        status: roomState.tracks.length ? roomState.status : 'idle',
        volume: clamp(numberOr(roomState.volume, 0.55), 0, 1),
        muted: !!roomState.muted,
        playMode: roomState.playMode === 'single' ? 'single' : 'list',
        currentTime: Math.max(0, numberOr(roomState.currentTime, 0)),
        updatedAt: numberOr(roomState.updatedAt, Date.now()),
        error: '',
      })
    },

    addTrack: track => {
      if (!canEdit()) return
      const normalized = { ...track, group: track.group?.trim() || '未分组' }
      if (get().context === 'room') {
        const state = get()
        const tracks = [...state.tracks, normalized]
        commitRoomPatch({
          tracks,
          currentTrackId: state.currentTrackId || normalized.id,
          status: state.currentTrackId ? state.status : 'paused',
          currentTime: 0,
        })
        return
      }
      set(state => ({
        tracks: [...state.tracks, normalized],
        currentTrackId: state.currentTrackId || normalized.id,
        status: state.currentTrackId ? state.status : 'paused',
        error: '',
      }))
    },

    removeTrack: trackId => {
      if (!canEdit()) return
      const state = get()
      const tracks = state.tracks.filter(track => track.id !== trackId)
      const removedCurrent = state.currentTrackId === trackId
      const currentTrackId = removedCurrent ? tracks[0]?.id || '' : state.currentTrackId
      const status = tracks.length ? (removedCurrent ? 'paused' : state.status) : 'idle'
      if (state.context === 'room') {
        commitRoomPatch({ tracks, currentTrackId, status, currentTime: 0 })
        return
      }
      set({ tracks, currentTrackId, status, currentTime: 0 })
    },

    selectTrack: trackId => {
      if (!canEdit()) return
      const state = get()
      if (!state.tracks.some(track => track.id === trackId)) return
      const patch = {
        currentTrackId: trackId,
        status: state.status === 'playing' ? 'playing' as PlaybackStatus : 'paused' as PlaybackStatus,
        currentTime: 0,
      }
      if (state.context === 'room') commitRoomPatch(patch)
      else set({ ...patch, error: '' })
    },

    play: () => {
      if (!canEdit()) return
      const state = get()
      const patch = {
        status: state.tracks.length && state.currentTrackId ? 'playing' as PlaybackStatus : 'idle' as PlaybackStatus,
        error: state.tracks.length ? '' : '没有可播放的音乐曲目',
      }
      if (state.context === 'room') commitRoomPatch({ status: patch.status, currentTime: state.currentTime })
      else set(patch)
    },

    pause: () => {
      if (!canEdit()) return
      const state = get()
      if (state.context === 'room') commitRoomPatch({ status: 'paused', currentTime: state.currentTime })
      else set({ status: 'paused' })
    },

    togglePlay: () => {
      const { status, play, pause } = get()
      if (status === 'playing') pause()
      else play()
    },

    nextTrack: () => {
      if (!canEdit()) return
      const state = get()
      if (!state.tracks.length) return
      const nextIndex = (getTrackIndex(state.tracks, state.currentTrackId) + 1) % state.tracks.length
      const patch = {
        currentTrackId: state.tracks[nextIndex].id,
        status: state.status === 'idle' ? 'paused' as PlaybackStatus : state.status,
        currentTime: 0,
      }
      if (state.context === 'room') commitRoomPatch(patch)
      else set({ ...patch, error: '' })
    },

    previousTrack: () => {
      if (!canEdit()) return
      const state = get()
      if (!state.tracks.length) return
      const index = getTrackIndex(state.tracks, state.currentTrackId)
      const previousIndex = (index - 1 + state.tracks.length) % state.tracks.length
      const patch = {
        currentTrackId: state.tracks[previousIndex].id,
        status: state.status === 'idle' ? 'paused' as PlaybackStatus : state.status,
        currentTime: 0,
      }
      if (state.context === 'room') commitRoomPatch(patch)
      else set({ ...patch, error: '' })
    },

    setVolume: volume => {
      if (!canEdit()) return
      const value = clamp(volume, 0, 1)
      if (get().context === 'room') commitRoomPatch({ volume: value, muted: false })
      else set({ volume: value, muted: false })
    },

    toggleMuted: () => {
      if (!canEdit()) return
      const muted = !get().muted
      if (get().context === 'room') commitRoomPatch({ muted })
      else set({ muted })
    },

    setPlayMode: mode => {
      if (!canEdit()) return
      if (get().context === 'room') commitRoomPatch({ playMode: mode })
      else set({ playMode: mode })
    },

    seek: time => {
      if (!canEdit()) return
      const currentTime = Math.max(0, numberOr(time, 0))
      if (get().context === 'room') commitRoomPatch({ currentTime })
      else set({ currentTime, updatedAt: Date.now() })
    },

    setCurrentTime: time => set({ currentTime: Math.max(0, numberOr(time, 0)) }),
    setDuration: duration => set({ duration: Math.max(0, numberOr(duration, 0)) }),
    setError: error => set({ error }),
    clearError: () => set({ error: '' }),
  }
})
