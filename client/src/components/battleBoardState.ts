export type BoardGrid = {
  size: number
  lineWidth: number
  lineStyle: 'solid' | 'dashed'
  color: string
  visible: boolean
}

export type TokenDisposition = 'player' | 'enemy' | 'neutral'
export type TokenThreatLevel = 'normal' | 'high'
export type TokenDirection = 'up' | 'right' | 'down' | 'left'
export type TokenHorizontalFacing = 'left' | 'right'
export type BoardDrawTool = 'pen' | 'eraser'

export type BoardTokenSpine = {
  presetId?: string
  skeleton: string
  atlas: string
  animation: string
  viewportScale: number
  offsetX: number
  offsetY: number
  facing: TokenHorizontalFacing
}

export type BoardToken = {
  id: string
  name: string
  x: number
  y: number
  size: number
  color: string
  disposition: TokenDisposition
  threatLevel: TokenThreatLevel
  direction: TokenDirection
  attention: boolean
  hp: number
  hpMax: number
  sp: number
  spMax: number
  stamina: number
  staminaMax: number
  image?: string
  spine?: BoardTokenSpine
  ownerUserId: number | null
  ownerName: string
  characterId?: number | null
  allowedUserIds: number[]
  locked: boolean
  layer: number
  cropX: number
  cropY: number
  cropZoom: number
}

export type BoardImageAsset = {
  id: string
  name: string
  src: string
  x: number
  y: number
  width: number
  height: number
  originalWidth: number
  originalHeight: number
  ownerUserId: number | null
  ownerName: string
  locked: boolean
  layer: number
  opacity: number
}

export type BoardSceneItemKind = 'background' | 'portrait' | 'npc'

export type BoardSceneItem = {
  id: string
  kind: BoardSceneItemKind
  name: string
  src: string
  x: number
  y: number
  width: number
  height: number
  originalWidth: number
  originalHeight: number
  ownerUserId: number | null
  ownerName: string
  presetId?: string
  visible: boolean
  locked: boolean
  layer: number
  opacity: number
}

export type BoardSceneState = {
  enabled: boolean
  items: BoardSceneItem[]
}

export type BoardDrawLayer = {
  id: string
  name: string
  visible: boolean
  locked: boolean
  order: number
  opacity: number
  ownerUserId: number | null
  ownerName: string
}

export type BoardDrawStroke = {
  id: string
  layerId: string
  tool: BoardDrawTool
  points: number[]
  color: string
  width: number
  opacity: number
  ownerUserId: number | null
  ownerName: string
  createdAt: number
}

export type BoardState = {
  grid: BoardGrid
  snapToGrid: boolean
  tokens: BoardToken[]
  assets: BoardImageAsset[]
  scene: BoardSceneState
  drawLayers: BoardDrawLayer[]
  drawStrokes: BoardDrawStroke[]
  activeDrawLayerId: string
}

export const TOKEN_COLORS = ['#ffa940', '#4096ff', '#52c41a', '#ff4d4f', '#13c2c2', '#722ed1', '#ff85c0']
export const TOKEN_RELATION_COLORS = {
  self: '#87df8f',
  ally: '#6aa7ff',
  enemy: '#ef9b48',
  threat: '#e85249',
  neutral: '#a8b0a9',
  neutralAlert: '#e25b4b',
} as const
export const DEFAULT_DRAW_LAYER_ID = 'draw-default'

export function createDefaultBoardState(): BoardState {
  return {
    grid: {
      size: 64,
      lineWidth: 1,
      lineStyle: 'solid',
      color: '#3a4560',
      visible: true,
    },
    snapToGrid: true,
    tokens: [],
    assets: [],
    scene: {
      enabled: false,
      items: [],
    },
    drawLayers: [createDefaultDrawLayer()],
    drawStrokes: [],
    activeDrawLayerId: DEFAULT_DRAW_LAYER_ID,
  }
}

export function normalizeBoardState(input: any): BoardState {
  const fallback = createDefaultBoardState()
  if (!input || typeof input !== 'object') return fallback
  const drawLayers = normalizeDrawLayers(input.drawLayers, fallback.drawLayers)
  const drawLayerIds = new Set(drawLayers.map(layer => layer.id))
  const activeDrawLayerId = drawLayerIds.has(String(input.activeDrawLayerId))
    ? String(input.activeDrawLayerId)
    : drawLayers[0].id

  return {
    grid: {
      ...fallback.grid,
      ...(input.grid || {}),
      size: clamp(Number(input.grid?.size) || fallback.grid.size, 24, 160),
      lineWidth: clamp(Number(input.grid?.lineWidth) || fallback.grid.lineWidth, 1, 8),
      lineStyle: input.grid?.lineStyle === 'dashed' ? 'dashed' : 'solid',
      color: input.grid?.color || fallback.grid.color,
      visible: typeof input.grid?.visible === 'boolean' ? input.grid.visible : fallback.grid.visible,
    },
    snapToGrid: typeof input.snapToGrid === 'boolean' ? input.snapToGrid : fallback.snapToGrid,
    tokens: Array.isArray(input.tokens) ? input.tokens.map(normalizeToken) : [],
    assets: Array.isArray(input.assets) ? input.assets.map(normalizeAsset) : [],
    scene: {
      enabled: typeof input.scene?.enabled === 'boolean' ? input.scene.enabled : fallback.scene.enabled,
      items: Array.isArray(input.scene?.items)
        ? input.scene.items.slice(0, 100).map(normalizeSceneItem).filter((item: BoardSceneItem) => item.src)
        : [],
    },
    drawLayers,
    drawStrokes: Array.isArray(input.drawStrokes)
      ? input.drawStrokes
        .map((stroke: any) => normalizeDrawStroke(stroke, drawLayerIds, activeDrawLayerId))
        .filter((stroke: BoardDrawStroke | null): stroke is BoardDrawStroke => !!stroke)
      : [],
    activeDrawLayerId,
  }
}

export function normalizeToken(token: any): BoardToken {
  return {
    id: String(token.id || createId('token')),
    name: typeof token.name === 'string' ? token.name : 'Token',
    x: Number(token.x) || 0,
    y: Number(token.y) || 0,
    size: clamp(Number(token.size) || 64, 24, 180),
    color: token.color || TOKEN_COLORS[0],
    disposition: normalizeDisposition(token.disposition || token.side || token.relation),
    threatLevel: token.threatLevel === 'high' || token.threat === 'high' ? 'high' : 'normal',
    direction: normalizeDirection(token.direction || token.facing),
    attention: typeof token.attention === 'boolean' ? token.attention : !!token.alert || token.disposition === 'neutral',
    hp: clamp(Number(token.hp ?? token.hpCurrent ?? token.health ?? token.hpMax ?? 10) || 0, 0, 9999),
    hpMax: clamp(Number(token.hpMax ?? token.healthMax ?? 10) || 1, 1, 9999),
    sp: clamp(Number(token.sp ?? token.spCurrent ?? token.spInit ?? 0) || 0, 0, 999),
    spMax: clamp(Number(token.spMax ?? 9) || 1, 1, 999),
    stamina: clamp(Number(token.stamina ?? token.staminaCurrent ?? token.staminaMax ?? 2) || 0, 0, 999),
    staminaMax: clamp(Number(token.staminaMax ?? 2) || 1, 1, 999),
    image: token.image || undefined,
    spine: normalizeTokenSpine(token.spine),
    ownerUserId: typeof token.ownerUserId === 'number' ? token.ownerUserId : null,
    ownerName: token.ownerName || '未分配',
    characterId: typeof token.characterId === 'number' ? token.characterId : null,
    allowedUserIds: Array.isArray(token.allowedUserIds) ? token.allowedUserIds.map(Number) : [],
    locked: !!token.locked,
    layer: Number(token.layer) || 0,
    cropX: Number(token.cropX) || 0,
    cropY: Number(token.cropY) || 0,
    cropZoom: clamp(Number(token.cropZoom) || 1, 1, 12),
  }
}

export function normalizeAsset(asset: any): BoardImageAsset {
  const width = clamp(Number(asset.width) || 360, 40, 4000)
  const height = clamp(Number(asset.height) || 240, 40, 4000)
  return {
    id: String(asset.id || createId('asset')),
    name: typeof asset.name === 'string' ? asset.name : '图片',
    src: String(asset.src || ''),
    x: Number(asset.x) || 0,
    y: Number(asset.y) || 0,
    width,
    height,
    originalWidth: clamp(Number(asset.originalWidth) || width, 40, 8000),
    originalHeight: clamp(Number(asset.originalHeight) || height, 40, 8000),
    ownerUserId: typeof asset.ownerUserId === 'number' ? asset.ownerUserId : null,
    ownerName: asset.ownerName || '未分配',
    locked: !!asset.locked,
    layer: Number(asset.layer) || 0,
    opacity: clamp(Number(asset.opacity) || 1, 0.1, 1),
  }
}

export function normalizeSceneItem(item: any): BoardSceneItem {
  const width = clamp(Number(item.width) || 480, 40, 6000)
  const height = clamp(Number(item.height) || 720, 40, 6000)
  return {
    id: String(item.id || createId('scene-item')),
    kind: normalizeSceneItemKind(item.kind),
    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 80) : '场景素材',
    src: typeof item.src === 'string' ? item.src : '',
    x: Number(item.x) || 0,
    y: Number(item.y) || 0,
    width,
    height,
    originalWidth: clamp(Number(item.originalWidth) || width, 40, 12000),
    originalHeight: clamp(Number(item.originalHeight) || height, 40, 12000),
    ownerUserId: typeof item.ownerUserId === 'number' ? item.ownerUserId : null,
    ownerName: item.ownerName || '未分配',
    presetId: typeof item.presetId === 'string' && item.presetId ? item.presetId.slice(0, 80) : undefined,
    visible: typeof item.visible === 'boolean' ? item.visible : true,
    locked: !!item.locked,
    layer: Number.isFinite(Number(item.layer)) ? Number(item.layer) : 0,
    opacity: clamp(Number(item.opacity ?? 1), 0.05, 1),
  }
}

export function createDefaultDrawLayer(): BoardDrawLayer {
  return {
    id: DEFAULT_DRAW_LAYER_ID,
    name: 'Annotations',
    visible: true,
    locked: false,
    order: 100,
    opacity: 1,
    ownerUserId: null,
    ownerName: 'System',
  }
}

export function normalizeDrawLayer(layer: any, index = 0): BoardDrawLayer {
  return {
    id: String(layer.id || createId('draw-layer')),
    name: typeof layer.name === 'string' && layer.name.trim() ? layer.name.slice(0, 48) : `Layer ${index + 1}`,
    visible: typeof layer.visible === 'boolean' ? layer.visible : true,
    locked: !!layer.locked,
    order: Number.isFinite(Number(layer.order)) ? Number(layer.order) : 100 + index,
    opacity: clamp(Number(layer.opacity) || 1, 0.05, 1),
    ownerUserId: typeof layer.ownerUserId === 'number' ? layer.ownerUserId : null,
    ownerName: layer.ownerName || 'System',
  }
}

export function normalizeDrawStroke(stroke: any, layerIds?: Set<string>, fallbackLayerId = DEFAULT_DRAW_LAYER_ID): BoardDrawStroke | null {
  const layerId = String(stroke.layerId || fallbackLayerId)
  const targetLayerId = layerIds?.has(layerId) ? layerId : fallbackLayerId
  if (layerIds && !layerIds.has(targetLayerId)) return null
  const points = Array.isArray(stroke.points)
    ? stroke.points.map(Number).filter(Number.isFinite).slice(0, 3000)
    : []
  if (points.length < 2) return null

  return {
    id: String(stroke.id || createId('draw-stroke')),
    layerId: targetLayerId,
    tool: stroke.tool === 'eraser' ? 'eraser' : 'pen',
    points,
    color: typeof stroke.color === 'string' ? stroke.color : TOKEN_COLORS[0],
    width: clamp(Number(stroke.width) || 6, 1, 96),
    opacity: clamp(Number(stroke.opacity) || 1, 0.05, 1),
    ownerUserId: typeof stroke.ownerUserId === 'number' ? stroke.ownerUserId : null,
    ownerName: stroke.ownerName || 'System',
    createdAt: Number(stroke.createdAt) || Date.now(),
  }
}

function normalizeDrawLayers(input: any, fallback: BoardDrawLayer[]) {
  const layers = Array.isArray(input)
    ? input.map((layer, index) => normalizeDrawLayer(layer, index))
    : fallback
  const uniqueLayers = layers.filter((layer, index, list) => (
    layer.id && list.findIndex(candidate => candidate.id === layer.id) === index
  ))
  return uniqueLayers.length ? uniqueLayers : fallback
}

function normalizeTokenSpine(spine: any): BoardTokenSpine | undefined {
  if (!spine || typeof spine !== 'object') return undefined
  const skeleton = typeof spine.skeleton === 'string' ? spine.skeleton : ''
  const atlas = typeof spine.atlas === 'string' ? spine.atlas : ''
  if (!skeleton || !atlas) return undefined

  return {
    presetId: typeof spine.presetId === 'string' && spine.presetId ? spine.presetId.slice(0, 80) : undefined,
    skeleton,
    atlas,
    animation: typeof spine.animation === 'string' && spine.animation ? spine.animation : 'Idle',
    viewportScale: clamp(Number(spine.viewportScale) || 2.5, 0.8, 6),
    offsetX: clamp(Number(spine.offsetX) || 0, -300, 300),
    offsetY: clamp(Number(spine.offsetY) || 0, -300, 300),
    facing: normalizeHorizontalFacing(spine.facing),
  }
}

export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeDisposition(value: any): TokenDisposition {
  if (value === 'enemy' || value === 'hostile') return 'enemy'
  if (value === 'neutral') return 'neutral'
  return 'player'
}

function normalizeDirection(value: any): TokenDirection {
  if (value === 'right' || value === 'east' || value === 'e') return 'right'
  if (value === 'down' || value === 'south' || value === 's') return 'down'
  if (value === 'left' || value === 'west' || value === 'w') return 'left'
  return 'up'
}

function normalizeHorizontalFacing(value: any): TokenHorizontalFacing {
  return value === 'left' ? 'left' : 'right'
}

function normalizeSceneItemKind(value: any): BoardSceneItemKind {
  if (value === 'portrait' || value === 'npc') return value
  return 'background'
}
