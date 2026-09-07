const apiOrigin = (import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '')

export const API_BASE_URL = `${apiOrigin}/api`
export const ASSET_BASE_URL = apiOrigin
export const SOCKET_URL = apiOrigin || undefined
