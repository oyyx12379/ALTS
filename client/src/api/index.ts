import axios from 'axios'
import { API_BASE_URL } from '../config'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
})

// Auth interceptor
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Auth
export const login = (username: string, password: string) =>
  api.post('/auth/login', { username, password }).then(r => r.data)

export const register = (username: string, password: string) =>
  api.post('/auth/register', { username, password }).then(r => r.data)

// Characters
export const getCharacters = () =>
  api.get('/characters').then(r => r.data)

export const getCharacter = (id: number) =>
  api.get(`/characters/${id}`).then(r => r.data)

export const createCharacter = (data: any = {}) =>
  api.post('/characters', data).then(r => r.data)

export const updateCharacter = (id: number, data: any) =>
  api.put(`/characters/${id}`, data).then(r => r.data)

export const deleteCharacter = (id: number) =>
  api.delete(`/characters/${id}`).then(r => r.data)

// Upload
export const uploadCharacterSheet = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/upload/character-sheet', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const importCharacter = (fileName: string) =>
  api.post('/upload/import-character', { fileName }).then(r => r.data)

export const parseRules = () =>
  api.get('/upload/parse-rules').then(r => r.data)

// Rooms
export const getRooms = () =>
  api.get('/rooms').then(r => r.data)

export const getArchivedRooms = () =>
  api.get('/rooms/archived').then(r => r.data)

export const deleteArchivedRoom = (id: number) =>
  api.delete(`/rooms/archived/${id}`).then(r => r.data)

export const getRoom = (id: number) =>
  api.get(`/rooms/${id}`).then(r => r.data)

export const createRoom = (data: { name: string; description?: string; maxPlayers?: number; archiveRoomId?: number | null }) =>
  api.post('/rooms', data).then(r => r.data)

export const joinRoom = (inviteCode: string, characterId?: number) =>
  api.post('/rooms/join', { inviteCode, characterId }).then(r => r.data)

export const leaveRoom = (id: number) =>
  api.delete(`/rooms/${id}/leave`).then(r => r.data)

export const reopenRoom = (id: number) =>
  api.post(`/rooms/${id}/reopen`).then(r => r.data)

export const transferRoomSN = (roomId: number, userId: number) =>
  api.put(`/rooms/${roomId}/transfer-sn`, { userId }).then(r => r.data)

export const bindCharacter = (roomId: number, characterId: number | null) =>
  api.put(`/rooms/${roomId}/bind-character`, { characterId }).then(r => r.data)

export const getRulesRaces = () =>
  api.get('/rules/races').then(r => r.data)

export const getRulesCombatClasses = () =>
  api.get('/rules/combat-classes').then(r => r.data)

export const getRulesArts = () =>
  api.get('/rules/arts').then(r => r.data)

export const getRulesTraits = () =>
  api.get('/rules/traits').then(r => r.data)

export const getRulesInfection = () =>
  api.get('/rules/infection').then(r => r.data)

export default api
