import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Stage, Layer, Group, Line, Rect, Circle, Text, Image as KonvaImage, Arc } from 'react-konva'
import {
  TOKEN_COLORS,
  TOKEN_RELATION_COLORS,
  clamp,
  createId,
  normalizeAsset,
  normalizeBoardState,
  normalizeSceneItem,
  normalizeToken,
  type BoardGrid,
  type BoardImageAsset,
  type BoardSceneItem,
  type BoardSceneItemKind,
  type BoardState,
  type BoardToken,
  type TokenDirection,
} from './battleBoardState'
import { normalizeCharacterCardVNext } from '../types/characterCard'

const PRESET_TOKEN_MANIFEST_URL = '/spine/presetTokens.json'
const PRESET_TOKEN_DEFAULT_VIEWPORT_SCALE = 1
const PRESET_TOKEN_DEFAULT_OFFSET_Y = 0
const FALLBACK_PRESET_TOKEN: PresetTokenDefinition = {
  id: '1000_gopro',
  name: '猎狗',
  skeleton: '/spine/presets/1000_gopro/enemy_1000_gopro.skel',
  atlas: '/spine/presets/1000_gopro/enemy_1000_gopro.atlas',
  texture: '/spine/presets/1000_gopro/enemy_1000_gopro.png',
  avatar: '/spine/presets/1000_gopro/头像_敌人_猎狗.png',
  animation: 'Idle',
  viewportScale: PRESET_TOKEN_DEFAULT_VIEWPORT_SCALE,
  offsetX: 0,
  offsetY: PRESET_TOKEN_DEFAULT_OFFSET_Y,
}

const PRESET_TOKEN_ANIMATIONS = ['Idle', 'Move_Loop', 'Run_Loop', 'Attack', 'Die']
const PRESET_TOKEN_MOTION_ANIMATIONS = {
  idle: ['Idle'],
  move: ['Move_Loop', 'Run_Loop', 'Walk_Loop', 'Move', 'Run', 'Walk'],
  attack: ['Attack', 'Attack_Loop', 'Attack01', 'Attack_1'],
} as const
const PRESET_TOKEN_CANVAS_PADDING = 4
const PRESET_TOKEN_MAX_RENDER_CANVAS_SIZE = 768
const PRESET_TOKEN_MAX_LIVE_ANIMATIONS = 12
const PRESET_TOKEN_REDRAW_FPS = 60
const PRESET_TOKEN_HIT_PADDING = 1.35
const spineStaticCanvasCache = new Map<string, HTMLCanvasElement | Promise<HTMLCanvasElement | null>>()

type PresetTokenDefinition = {
  id: string
  name: string
  skeleton: string
  atlas: string
  texture?: string | null
  avatar?: string | null
  animation: string
  viewportScale: number
  offsetX: number
  offsetY: number
}

type PresetTokenBatchItem = {
  preset: PresetTokenDefinition
  quantity: number
}

type ScenePortraitOption = {
  id: string
  name: string
  src: string
  kind: 'portrait' | 'npc'
  presetId?: string
}

type TokenTone = {
  core: string
  deep: string
  border: string
  glow: string
  label: string
  badge: string
  attention: boolean
}

type RoomMember = {
  id: number
  userId: number
  role: string
  user?: { id: number; username: string }
  characterId?: number | null
  character?: {
    id: number
    name: string
    profession?: string
    rawData?: unknown
    combat?: {
      hpMax?: number
      spMax?: number
      spInit?: number
      staminaMax?: number
    } | null
  }
}

type BattleBoardProps = {
  state: BoardState
  members: RoomMember[]
  user: { id: number; username: string; role?: string }
  room: { snId?: number }
  onChange: (state: BoardState, options?: { sync?: boolean }) => void
  activeDraggingTokenIds?: string[]
  tokenDragPreviewPositions?: Record<string, { x: number; y: number }>
  onTokenDragStart?: (tokenId: string) => void
  onTokenDragMove?: (tokens: Array<{ tokenId: string; x: number; y: number }>, options?: { force?: boolean }) => void
  onTokenDragEnd?: (tokenId: string) => void
}

type TokenCropDraft = {
  tokenId: string
  image: string
  cropX: number
  cropY: number
  cropZoom: number
}

type BoardSelectionBox = {
  startX: number
  startY: number
  endX: number
  endY: number
}

type BoardSelectionBounds = {
  x: number
  y: number
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
}

type BoardClipboard =
  | { kind: 'tokens'; tokens: BoardToken[] }
  | { kind: 'asset'; asset: BoardImageAsset }
  | { kind: 'scene-item'; item: BoardSceneItem }

type BoardInteractionMode = 'select' | 'token-drag' | 'box-select' | 'pan'

function useCanvasImage(src?: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!src) {
      setImage(null)
      return
    }

    let active = true
    const img = new window.Image()
    img.onload = () => { if (active) setImage(img) }
    img.onerror = () => { if (active) setImage(null) }
    img.src = src

    return () => { active = false }
  }, [src])

  return image
}

function readImageFile(file: File): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const src = String(reader.result || '')
      const img = new window.Image()
      img.onload = () => resolve({ src, width: img.naturalWidth || 640, height: img.naturalHeight || 420 })
      img.onerror = reject
      img.src = src
    }
    reader.readAsDataURL(file)
  })
}

function readImageSource(src: string): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve({ src, width: img.naturalWidth || 480, height: img.naturalHeight || 720 })
    img.onerror = reject
    img.src = src
  })
}

function destroyPixiApp(app: any) {
  if (!app) return
  try {
    app.destroy(true, { children: true, texture: false, baseTexture: false })
  } catch {
    // Pixi can already be disposed during fast token updates; ignore duplicate teardown.
  }
}

function normalizeAnimationName(value: string) {
  return value.toLowerCase().replace(/[\s_-]/g, '')
}

function pickSpineAnimation(animationNames: string[], candidates: string[], fallback?: string) {
  const preferred = [...candidates, fallback || 'Idle', 'Idle'].filter(Boolean)
  const exact = preferred.find(candidate => animationNames.includes(candidate))
  if (exact) return exact

  const caseInsensitive = animationNames.find(animation => (
    preferred.some(candidate => animation.toLowerCase() === candidate.toLowerCase())
  ))
  if (caseInsensitive) return caseInsensitive

  return animationNames.find(animation => {
    const normalizedAnimation = normalizeAnimationName(animation)
    return preferred.some(candidate => {
      const normalizedCandidate = normalizeAnimationName(candidate)
      return normalizedAnimation.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedAnimation)
    })
  }) || animationNames[0]
}

function applySpineAnimation(spineDisplay: any, animation: string) {
  if (!animation || spineDisplay.state?.tracks?.[0]?.animation?.name === animation) return
  spineDisplay.state.setAnimation(0, animation, animation !== 'Die')
}

function buildSpineStaticCanvasCacheKey(
  spine: BoardToken['spine'],
  canvasSize: number,
  modelSize: number,
  animationCandidates: readonly string[],
) {
  if (!spine) return ''
  return [
    spine.skeleton,
    spine.atlas,
    spine.animation,
    canvasSize,
    Math.round(modelSize),
    animationCandidates.join('|'),
  ].join('::')
}

function shouldAnimatePresetToken(animationCandidates?: readonly string[]) {
  return Boolean(animationCandidates?.length)
}

function useSpineCanvas(
  spine: BoardToken['spine'],
  canvasSize: number,
  modelSize: number,
  tokenName: string,
  animated = true,
  animationCandidates: readonly string[] = [],
) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const appRef = useRef<any>(null)
  const spineDisplayRef = useRef<any>(null)
  const animationNamesRef = useRef<string[]>([])
  const animationKey = animationCandidates.join('|')
  const staticAnimationKey = animated ? '' : `${spine?.animation || ''}|${animationKey}`
  const preferredAnimationsRef = useRef<string[]>([])

  preferredAnimationsRef.current = animationCandidates.length
    ? [...animationCandidates]
    : spine?.animation
      ? [spine.animation]
      : [...PRESET_TOKEN_MOTION_ANIMATIONS.idle]

  useEffect(() => {
    if (!spine) {
      setCanvas(null)
      return
    }

    let cancelled = false
    let localApp: any = null
    const staticCacheKey = !animated
      ? buildSpineStaticCanvasCacheKey(spine, canvasSize, modelSize, preferredAnimationsRef.current)
      : ''
    const cachedStaticCanvas = staticCacheKey ? spineStaticCanvasCache.get(staticCacheKey) : undefined

    setCanvas(null)
    spineDisplayRef.current = null
    animationNamesRef.current = []

    if (cachedStaticCanvas instanceof HTMLCanvasElement) {
      setCanvas(cachedStaticCanvas)
      return
    }

    if (cachedStaticCanvas) {
      void cachedStaticCanvas.then(snapshot => {
        if (!cancelled && snapshot) setCanvas(snapshot)
      })
      return () => { cancelled = true }
    }

    const loadCanvas = Promise.all([
      import('pixi.js'),
      import('@pixi-spine/all-3.8'),
    ]).then(async ([PIXI, spineRuntime]) => {
      if (cancelled) return null

      const renderResolution = canvasSize > 768 ? 1 : Math.min(window.devicePixelRatio || 1, 2)
      const app = new PIXI.Application({
        width: canvasSize,
        height: canvasSize,
        backgroundAlpha: 0,
        antialias: true,
        autoStart: animated,
        autoDensity: true,
        resolution: renderResolution,
        preserveDrawingBuffer: false,
      })
      localApp = app
      appRef.current = app
      app.ticker.maxFPS = PRESET_TOKEN_REDRAW_FPS
      if (!animated) app.ticker.stop()

      const resource = await PIXI.Assets.load({
        src: spine.skeleton,
        data: { spineAtlasFile: spine.atlas },
      })
      if (cancelled || appRef.current !== app) {
        destroyPixiApp(app)
        return null
      }

      const SpineClass = (spineRuntime as any).Spine
      const spineDisplay = new SpineClass(resource.spineData)
      const animationNames = spineDisplay.spineData?.animations?.map((animation: any) => animation.name) || []
      animationNamesRef.current = animationNames
      spineDisplayRef.current = spineDisplay
      const animation = pickSpineAnimation(animationNames, preferredAnimationsRef.current, spine.animation)
      if (animation) {
        applySpineAnimation(spineDisplay, animation)
      }
      spineDisplay.x = canvasSize / 2
      spineDisplay.y = canvasSize / 2 + modelSize * 0.22
      app.stage.addChild(spineDisplay)

      const fitScale = modelSize / 260
      spineDisplay.scale.set(fitScale)

      if (animated) {
        return app.view as HTMLCanvasElement
      }

      spineDisplay.update?.(0)
      app.render()
      const source = app.view as HTMLCanvasElement
      const snapshot = document.createElement('canvas')
      snapshot.width = source.width
      snapshot.height = source.height
      snapshot.getContext('2d')?.drawImage(source, 0, 0)
      destroyPixiApp(app)
      localApp = null
      appRef.current = null
      spineDisplayRef.current = null
      animationNamesRef.current = []
      return snapshot
    }).catch(error => {
      console.warn(`[SpineToken] ${tokenName}:`, error)
      if (staticCacheKey) spineStaticCanvasCache.delete(staticCacheKey)
      return null
    })

    if (staticCacheKey) spineStaticCanvasCache.set(staticCacheKey, loadCanvas)
    void loadCanvas.then(nextCanvas => {
      if (staticCacheKey && nextCanvas) spineStaticCanvasCache.set(staticCacheKey, nextCanvas)
      if (!cancelled && nextCanvas) setCanvas(nextCanvas)
    })

    return () => {
      cancelled = true
      if (appRef.current === localApp) {
        appRef.current = null
        spineDisplayRef.current = null
        animationNamesRef.current = []
      }
      destroyPixiApp(localApp)
    }
  }, [spine?.skeleton, spine?.atlas, canvasSize, modelSize, tokenName, animated, staticAnimationKey])

  useEffect(() => {
    if (!spine || !animated) return
    const spineDisplay = spineDisplayRef.current
    const animationNames = animationNamesRef.current
    if (!spineDisplay || !animationNames.length) return

    const animation = pickSpineAnimation(animationNames, preferredAnimationsRef.current, spine.animation)
    if (animation) applySpineAnimation(spineDisplay, animation)
  }, [spine?.animation, animationKey, spine?.skeleton, animated])

  return canvas
}

function SpineTokenModelNode({
  token,
  animationCandidates,
  animated,
}: {
  token: BoardToken
  animationCandidates?: readonly string[]
  animated: boolean
}) {
  const spine = token.spine
  const viewportScale = spine?.viewportScale || 2.5
  const modelBoardSize = token.size * viewportScale
  const canvasBoardSize = modelBoardSize * PRESET_TOKEN_CANVAS_PADDING
  const desiredModelRenderSize = Math.max(96, Math.round(modelBoardSize))
  const desiredCanvasRenderSize = Math.max(
    desiredModelRenderSize,
    Math.round(desiredModelRenderSize * PRESET_TOKEN_CANVAS_PADDING),
  )
  const canvasRenderSize = Math.min(PRESET_TOKEN_MAX_RENDER_CANVAS_SIZE, desiredCanvasRenderSize)
  const modelRenderSize = canvasRenderSize / PRESET_TOKEN_CANVAS_PADDING
  const canvas = useSpineCanvas(spine, canvasRenderSize, modelRenderSize, token.name, animated, animationCandidates)

  if (!spine || !canvas) return null

  const facingLeft = spine.facing === 'left'

  return (
    <KonvaImage
      image={canvas}
      x={(spine.offsetX || 0) + (facingLeft ? canvasBoardSize / 2 : -canvasBoardSize / 2)}
      y={(spine.offsetY || 0) - canvasBoardSize / 2}
      width={canvasBoardSize}
      height={canvasBoardSize}
      scaleX={facingLeft ? -1 : 1}
      listening={false}
    />
  )
}

function useElementInViewport<T extends Element>(enabled: boolean) {
  const ref = useRef<T | null>(null)
  const [visible, setVisible] = useState(!enabled)

  useEffect(() => {
    if (!enabled) {
      setVisible(true)
      return
    }

    const node = ref.current
    if (!node) return

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        setVisible(entries.some(entry => entry.isIntersecting))
      },
      { rootMargin: '160px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled])

  return { ref, visible }
}

function PresetTokenPreview({ preset, active }: { preset: PresetTokenDefinition; active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const shouldRenderSpineFrame = active && !preset.avatar
  const spine = shouldRenderSpineFrame ? {
    presetId: preset.id,
    skeleton: preset.skeleton,
    atlas: preset.atlas,
    animation: preset.animation || 'Idle',
    viewportScale: preset.viewportScale,
    offsetX: 0,
    offsetY: 0,
    facing: 'right' as const,
  } : undefined
  const canvas = useSpineCanvas(spine, 220, 92, preset.name, false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.replaceChildren()
    if (canvas) host.appendChild(canvas)
    return () => {
      if (canvas?.parentElement === host) host.removeChild(canvas)
    }
  }, [canvas])

  if (preset.avatar) {
    return (
      <div className="preset-token-preview ready">
        <img className="preset-token-avatar" src={preset.avatar} alt={preset.name} loading="lazy" />
      </div>
    )
  }

  return <div ref={hostRef} className={`preset-token-preview ${canvas ? 'ready' : ''}`} />
}

function PresetTokenPicker({
  open,
  presets,
  search,
  loading,
  error,
  onSearch,
  onSelect,
  onSelectBatch,
  onClose,
}: {
  open: boolean
  presets: PresetTokenDefinition[]
  search: string
  loading: boolean
  error: string
  onSearch: (value: string) => void
  onSelect: (preset: PresetTokenDefinition) => void
  onSelectBatch: (items: PresetTokenBatchItem[]) => void
  onClose: () => void
}) {
  const [batchMode, setBatchMode] = useState(false)
  const [batchItems, setBatchItems] = useState<PresetTokenBatchItem[]>([])
  const batchTotal = batchItems.reduce((sum, item) => sum + item.quantity, 0)

  useEffect(() => {
    if (!open) {
      setBatchMode(false)
      setBatchItems([])
    }
  }, [open])

  if (!open) return null

  const changeBatchQuantity = (preset: PresetTokenDefinition, delta: number) => {
    setBatchItems(prev => {
      const index = prev.findIndex(item => item.preset.id === preset.id)
      if (index < 0) {
        return delta > 0 ? [...prev, { preset, quantity: 1 }] : prev
      }

      const next = [...prev]
      const quantity = next[index].quantity + delta
      if (quantity <= 0) {
        next.splice(index, 1)
        return next
      }
      next[index] = { ...next[index], quantity: clamp(quantity, 1, 99) }
      return next
    })
  }

  const selectPreset = (preset: PresetTokenDefinition) => {
    if (batchMode) {
      changeBatchQuantity(preset, 1)
      return
    }
    onSelect(preset)
  }

  const confirmBatch = () => {
    if (!batchItems.length) return
    onSelectBatch(batchItems)
    setBatchItems([])
    setBatchMode(false)
  }

  return (
    <div className="preset-token-modal" role="dialog" aria-modal="true" aria-label="选择预设TOKEN">
      <div className="preset-token-dialog">
        <div className="preset-token-head">
          <div>
            <strong>选择预设TOKEN</strong>
            <span>{batchMode ? `批量待创建 ${batchTotal} 个` : loading ? '载入预设库' : `${presets.length} 个可用预设`}</span>
          </div>
          <div className="preset-token-head-actions">
            <button
              className={`btn btn-sm ${batchMode ? 'btn-primary' : ''}`}
              onClick={() => setBatchMode(mode => !mode)}
            >
              批量创建
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>关闭</button>
          </div>
        </div>
        <div className="preset-token-warning">
          预设TOKEN会播放待机动画，创建过多预设TOKEN可能导致动画播放卡顿。
        </div>
        {batchMode && (
          <div className="preset-token-batch-panel">
            {batchItems.length === 0 ? (
              <span className="preset-token-batch-empty">点击下方预设加入批量创建列表</span>
            ) : (
              <div className="preset-token-batch-list">
                {batchItems.map(item => (
                  <div className="preset-token-batch-item" key={item.preset.id}>
                    <span>{item.preset.name}</span>
                    <div>
                      <button className="btn btn-sm" onClick={() => changeBatchQuantity(item.preset, -1)}>-</button>
                      <b>{item.quantity}</b>
                      <button className="btn btn-sm" onClick={() => changeBatchQuantity(item.preset, 1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="preset-token-batch-actions">
              <button className="btn btn-sm" disabled={!batchItems.length} onClick={() => setBatchItems([])}>清空</button>
              <button className="btn btn-primary btn-sm" disabled={!batchItems.length} onClick={confirmBatch}>确定创建</button>
            </div>
          </div>
        )}
        <div className="preset-token-tools">
          <input
            className="input"
            value={search}
            placeholder="搜索 ID"
            onChange={event => onSearch(event.target.value)}
            autoFocus
          />
        </div>
        {error && <div className="preset-token-status">{error}</div>}
        {!error && presets.length === 0 && (
          <div className="preset-token-status">{loading ? '正在准备预览...' : '没有匹配的预设TOKEN'}</div>
        )}
        <div className="preset-token-grid">
          {presets.map(preset => (
            <PresetTokenOption key={preset.id} preset={preset} onSelect={selectPreset} />
          ))}
        </div>
      </div>
    </div>
  )
}

function PresetTokenOption({
  preset,
  onSelect,
}: {
  preset: PresetTokenDefinition
  onSelect: (preset: PresetTokenDefinition) => void
}) {
  const { ref, visible } = useElementInViewport<HTMLButtonElement>(true)

  return (
    <button
      ref={ref}
      className="preset-token-card"
      onClick={() => onSelect(preset)}
      title={preset.id}
    >
      <PresetTokenPreview preset={preset} active={visible} />
      <span>{preset.name}</span>
    </button>
  )
}

function ScenePortraitPicker({
  open,
  options,
  search,
  onSearch,
  onSelect,
  onClose,
}: {
  open: boolean
  options: ScenePortraitOption[]
  search: string
  onSearch: (value: string) => void
  onSelect: (option: ScenePortraitOption) => void
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="preset-token-modal" role="dialog" aria-modal="true" aria-label="选择场景角色或NPC">
      <div className="preset-token-dialog scene-portrait-dialog">
        <div className="preset-token-head">
          <div>
            <strong>添加场景角色 / NPC</strong>
            <span>{options.length} 个可用立绘</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>关闭</button>
        </div>
        <div className="preset-token-warning">这里使用静态立绘，不会额外播放预设TOKEN动画。</div>
        <div className="preset-token-tools">
          <input
            className="input"
            value={search}
            placeholder="搜索名称或 ID"
            onChange={event => onSearch(event.target.value)}
            autoFocus
          />
        </div>
        {options.length === 0 ? (
          <div className="preset-token-status">没有匹配的角色立绘或NPC头像</div>
        ) : (
          <div className="preset-token-grid">
            {options.map(option => (
              <button
                key={option.id}
                className="preset-token-card scene-portrait-card"
                onClick={() => onSelect(option)}
                title={option.id}
              >
                <div className="preset-token-preview ready">
                  <img className="preset-token-avatar" src={option.src} alt={option.name} loading="lazy" />
                </div>
                <span>{option.name}</span>
                <small>{option.kind === 'npc' ? 'NPC' : '角色'}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const TOKEN_DIRECTION_ROTATION: Record<TokenDirection, number> = {
  up: -135,
  right: -45,
  down: 45,
  left: 135,
}

const TOKEN_DIRECTION_LABELS: Record<TokenDirection, string> = {
  up: '上',
  right: '右',
  down: '下',
  left: '左',
}

const TOKEN_DIRECTION_KEYS: Record<string, TokenDirection> = {
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowLeft: 'left',
}

function getCharacterPortraitUrl(character?: RoomMember['character']) {
  if (!character?.rawData) return ''
  return normalizeCharacterCardVNext(character.rawData).mainCard.portrait.imageUrl.trim()
}

function getTokenCombatDefaults(character?: RoomMember['character']) {
  const combat = character?.combat
  const hpMax = clamp(Number(combat?.hpMax) || 10, 1, 9999)
  const spMax = clamp(Number(combat?.spMax) || 9, 1, 999)
  const staminaMax = clamp(Number(combat?.staminaMax) || 2, 1, 999)
  return {
    hp: hpMax,
    hpMax,
    sp: clamp(Number(combat?.spInit) || 0, 0, spMax),
    spMax,
    stamina: staminaMax,
    staminaMax,
  }
}

function getTokenBarRatio(current: number, max: number) {
  if (!Number.isFinite(max) || max <= 0) return 0
  return clamp((Number(current) || 0) / max, 0, 1)
}

function TokenCropModal({
  token,
  draft,
  onCancel,
  onApply,
}: {
  token: BoardToken
  draft: TokenCropDraft
  onCancel: () => void
  onApply: (draft: TokenCropDraft) => void
}) {
  const image = useCanvasImage(draft.image)
  const frameSize = 260
  const tokenSize = Math.max(1, token.size)
  const previewRatio = frameSize / tokenSize
  const [cropX, setCropX] = useState(draft.cropX)
  const [cropY, setCropY] = useState(draft.cropY)
  const [cropZoom, setCropZoom] = useState(draft.cropZoom)
  const dragRef = useRef<null | { x: number; y: number; cropX: number; cropY: number }>(null)

  useEffect(() => {
    setCropX(draft.cropX)
    setCropY(draft.cropY)
    setCropZoom(draft.cropZoom)
  }, [draft.cropX, draft.cropY, draft.cropZoom, draft.image])

  const imageNaturalWidth = image?.naturalWidth || 1
  const imageNaturalHeight = image?.naturalHeight || 1
  const baseScale = Math.max(frameSize / imageNaturalWidth, frameSize / imageNaturalHeight)
  const imageWidth = imageNaturalWidth * baseScale * cropZoom
  const imageHeight = imageNaturalHeight * baseScale * cropZoom
  const imageLeft = frameSize / 2 - imageWidth / 2 + cropX * previewRatio
  const imageTop = frameSize / 2 - imageHeight / 2 + cropY * previewRatio

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, cropX, cropY }
  }

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    setCropX(dragRef.current.cropX + (event.clientX - dragRef.current.x) / previewRatio)
    setCropY(dragRef.current.cropY + (event.clientY - dragRef.current.y) / previewRatio)
  }

  const endDrag = () => {
    dragRef.current = null
  }

  const applyCrop = () => {
    onApply({
      ...draft,
      cropX: Math.round(cropX * 10) / 10,
      cropY: Math.round(cropY * 10) / 10,
      cropZoom: Math.round(cropZoom * 100) / 100,
    })
  }

  return (
    <div className="token-crop-modal" role="dialog" aria-modal="true">
      <div className="token-crop-dialog">
        <div className="token-crop-head">
          <div>
            <strong>TOKEN图片裁切</strong>
            <span>{token.name}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>关闭</button>
        </div>

        <div
          className="token-crop-stage"
          style={{ width: frameSize, height: frameSize }}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {image && (
            <img
              src={draft.image}
              alt=""
              draggable={false}
              style={{
                width: imageWidth,
                height: imageHeight,
                left: imageLeft,
                top: imageTop,
              }}
            />
          )}
          <div className="token-crop-mask" />
          <div className="token-crop-ring" />
          <div className="token-crop-cross horizontal" />
          <div className="token-crop-cross vertical" />
        </div>

        <div className="token-crop-controls">
          <div className="token-crop-control-head">
            <label>缩放</label>
            <span>{Math.round(cropZoom * 100)}%</span>
          </div>
          <input
            className="input"
            type="range"
            min={1}
            max={12}
            step={0.01}
            value={cropZoom}
            onChange={event => setCropZoom(Number(event.target.value))}
          />
          <div className="token-crop-actions">
            <button className="btn btn-sm" onClick={() => { setCropX(0); setCropY(0); setCropZoom(1) }}>重置</button>
            <button className="btn btn-sm" onClick={onCancel}>取消</button>
            <button className="btn btn-primary btn-sm" onClick={applyCrop}>应用</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function resolveTokenTone(token: BoardToken, isSN: boolean, currentUserId: number): TokenTone {
  if (token.disposition === 'enemy') {
    if (token.threatLevel === 'high') {
      return {
        core: TOKEN_RELATION_COLORS.threat,
        deep: '#792622',
        border: 'rgba(255, 174, 166, 0.94)',
        glow: 'rgba(232, 82, 73, 0.22)',
        label: '高危',
        badge: '高危',
        attention: true,
      }
    }

    return {
      core: TOKEN_RELATION_COLORS.enemy,
      deep: '#784724',
      border: 'rgba(255, 207, 139, 0.9)',
      glow: 'rgba(239, 155, 72, 0.2)',
      label: '敌人',
      badge: '敌人',
      attention: false,
    }
  }

  if (token.disposition === 'neutral') {
    return {
      core: TOKEN_RELATION_COLORS.neutral,
      deep: '#565f59',
      border: 'rgba(255, 126, 113, 0.94)',
      glow: 'rgba(226, 91, 75, 0.22)',
      label: '中立',
      badge: '中立',
      attention: token.attention,
    }
  }

  if (!isSN && token.ownerUserId === currentUserId) {
    return {
      core: TOKEN_RELATION_COLORS.self,
      deep: '#2b6c3f',
      border: 'rgba(179, 255, 189, 0.9)',
      glow: 'rgba(135, 223, 143, 0.2)',
      label: '本人',
      badge: '本人',
      attention: false,
    }
  }

  return {
    core: TOKEN_RELATION_COLORS.ally,
    deep: '#264b82',
    border: 'rgba(177, 210, 255, 0.9)',
    glow: 'rgba(106, 167, 255, 0.2)',
    label: isSN ? '玩家' : '队友',
    badge: isSN ? '玩家' : '队友',
    attention: false,
  }
}

function areOpposingCombatants(token: BoardToken, target: BoardToken) {
  return (
    (token.disposition === 'enemy' && target.disposition === 'player')
    || (token.disposition === 'player' && target.disposition === 'enemy')
  )
}

function tokenGridCoordinate(value: number, gridSize: number) {
  return Math.round(value / Math.max(1, gridSize))
}

type CombatantGridIndex = {
  players: Set<string>
  enemies: Set<string>
}

function combatantGridKey(x: number, y: number) {
  return `${x}:${y}`
}

function buildCombatantGridIndex(tokens: BoardToken[], gridSize: number) {
  const index: CombatantGridIndex = {
    players: new Set(),
    enemies: new Set(),
  }
  tokens.forEach(token => {
    const key = combatantGridKey(tokenGridCoordinate(token.x, gridSize), tokenGridCoordinate(token.y, gridSize))
    if (token.disposition === 'player') index.players.add(key)
    if (token.disposition === 'enemy') index.enemies.add(key)
  })
  return index
}

function isTokenInAdjacentGridRange(token: BoardToken, target: BoardToken, gridSize: number) {
  return (
    Math.abs(tokenGridCoordinate(token.x, gridSize) - tokenGridCoordinate(target.x, gridSize)) <= 1
    && Math.abs(tokenGridCoordinate(token.y, gridSize) - tokenGridCoordinate(target.y, gridSize)) <= 1
  )
}

function hasAttackTargetInRange(token: BoardToken, tokens: BoardToken[], gridSize: number) {
  return tokens.some(target => (
    target.id !== token.id
    && areOpposingCombatants(token, target)
    && isTokenInAdjacentGridRange(token, target, gridSize)
  ))
}

function hasAttackTargetInGridIndex(token: BoardToken, gridSize: number, index: CombatantGridIndex) {
  const targets = token.disposition === 'enemy'
    ? index.players
    : token.disposition === 'player'
      ? index.enemies
      : null
  if (!targets) return false

  const gridX = tokenGridCoordinate(token.x, gridSize)
  const gridY = tokenGridCoordinate(token.y, gridSize)
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (targets.has(combatantGridKey(gridX + dx, gridY + dy))) return true
    }
  }
  return false
}

function resolvePresetTokenAnimationCandidates(
  token: BoardToken,
  tokens: BoardToken[],
  gridSize: number,
  draggingTokenIds: ReadonlySet<string>,
  combatantGridIndex?: CombatantGridIndex,
) {
  if (!token.spine) return undefined
  if (draggingTokenIds.has(token.id)) return PRESET_TOKEN_MOTION_ANIMATIONS.move
  if (combatantGridIndex
    ? hasAttackTargetInGridIndex(token, gridSize, combatantGridIndex)
    : hasAttackTargetInRange(token, tokens, gridSize)
  ) return PRESET_TOKEN_MOTION_ANIMATIONS.attack
  return [token.spine.animation || 'Idle', ...PRESET_TOKEN_MOTION_ANIMATIONS.idle]
}

function normalizeSelectionBox(box: BoardSelectionBox): BoardSelectionBounds {
  const left = Math.min(box.startX, box.endX)
  const right = Math.max(box.startX, box.endX)
  const top = Math.min(box.startY, box.endY)
  const bottom = Math.max(box.startY, box.endY)
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    left,
    right,
    top,
    bottom,
  }
}

function getTokenSelectionRadius(token: BoardToken) {
  const radius = token.size / 2
  if (!token.spine) return radius
  return Math.max(radius, (token.size * (token.spine.viewportScale || 2.5) * PRESET_TOKEN_HIT_PADDING) / 2)
}

function isTokenInsideSelection(token: BoardToken, bounds: BoardSelectionBounds) {
  const radius = getTokenSelectionRadius(token)
  const closestX = clamp(token.x, bounds.left, bounds.right)
  const closestY = clamp(token.y, bounds.top, bounds.bottom)
  return ((token.x - closestX) ** 2) + ((token.y - closestY) ** 2) <= radius ** 2
}

function buildTokenDirectionPatch(token: BoardToken, direction: TokenDirection): Partial<BoardToken> {
  return {
    direction,
    ...(token.spine && (direction === 'left' || direction === 'right')
      ? { spine: { ...token.spine, facing: direction } }
      : {}),
  }
}

function TokenNode({
  token,
  selected,
  canMove,
  viewportZoom,
  tone,
  attentionPulse,
  animationCandidates,
  animateSpine,
  onSelect,
  onDragStart,
  snapPosition,
  onDragMove,
  onDragEnd,
}: {
  token: BoardToken
  selected: boolean
  canMove: boolean
  viewportZoom: number
  tone: TokenTone
  attentionPulse: number
  animationCandidates?: readonly string[]
  animateSpine: boolean
  onSelect: () => void
  onDragStart: () => void
  snapPosition: (x: number, y: number) => { x: number; y: number }
  onDragMove: (x: number, y: number) => void
  onDragEnd: (x: number, y: number) => void
}) {
  const image = useCanvasImage(token.image)
  const radius = token.size / 2
  const imageNaturalWidth = image?.naturalWidth || 1
  const imageNaturalHeight = image?.naturalHeight || 1
  const imageScale = image ? Math.max(token.size / imageNaturalWidth, token.size / imageNaturalHeight) * token.cropZoom : 1
  const imageWidth = imageNaturalWidth * imageScale
  const imageHeight = imageNaturalHeight * imageScale
  const pulseRadius = radius + (8 + attentionPulse * 10) / viewportZoom
  const statusBarWidth = Math.max(token.size, 52 / viewportZoom)
  const statusBarHeight = 4 / viewportZoom
  const statusBarGap = 2 / viewportZoom
  const statusBarsY = radius + 6 / viewportZoom
  const infoBoxWidth = Math.max(token.size + 42 / viewportZoom, 152 / viewportZoom)
  const infoBoxHeight = 74 / viewportZoom
  const infoBoxY = statusBarsY + 3 * statusBarHeight + 3 * statusBarGap + 6 / viewportZoom
  const ownerLabel = token.ownerName || '未分配'
  const directionOuterRadius = radius + 16 / viewportZoom
  const directionInnerRadius = radius + 7 / viewportZoom
  const isPresetToken = Boolean(token.spine)
  const showTokenControls = !isPresetToken || selected
  const spineHitRadius = token.spine
    ? Math.max(radius, (token.size * (token.spine.viewportScale || 2.5) * PRESET_TOKEN_HIT_PADDING) / 2)
    : radius
  const tokenBars = [
    { key: 'hp', label: 'HP', current: token.hp, max: token.hpMax, color: '#e85249' },
    { key: 'sp', label: 'SP', current: token.sp, max: token.spMax, color: '#9be58d' },
    { key: 'stamina', label: '耐力', current: token.stamina, max: token.staminaMax, color: '#4ea7ff' },
  ]

  return (
    <Group
      x={token.x}
      y={token.y}
      draggable={canMove}
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={onDragStart}
      onDragMove={(event: any) => {
        const next = snapPosition(event.target.x(), event.target.y())
        event.target.position(next)
        onDragMove(next.x, next.y)
      }}
      onDragEnd={(event: any) => {
        const next = snapPosition(event.target.x(), event.target.y())
        event.target.position(next)
        onDragEnd(next.x, next.y)
      }}
    >
      {token.spine && (
        <>
          <Circle radius={spineHitRadius} fill="rgba(0,0,0,0.001)" />
          <SpineTokenModelNode token={token} animationCandidates={animationCandidates} animated={animateSpine} />
        </>
      )}
      {showTokenControls && (
        <>
          {tone.attention && (
            <Circle
              radius={pulseRadius}
              stroke={TOKEN_RELATION_COLORS.neutralAlert}
              strokeWidth={2 / viewportZoom}
              opacity={0.72 - attentionPulse * 0.42}
              listening={false}
            />
          )}
          <Arc
            innerRadius={directionInnerRadius}
            outerRadius={directionOuterRadius}
            angle={90}
            rotation={TOKEN_DIRECTION_ROTATION[token.direction]}
            fill={selected ? 'rgba(255, 169, 64, 0.34)' : 'rgba(255, 169, 64, 0.2)'}
            stroke="rgba(255, 169, 64, 0.86)"
            strokeWidth={(selected ? 1.7 : 1.1) / viewportZoom}
            shadowColor="#ffa940"
            shadowBlur={selected ? 14 / viewportZoom : 8 / viewportZoom}
            shadowOpacity={selected ? 0.38 : 0.2}
            listening={false}
          />
          <Line
            points={[0, -directionOuterRadius - 2 / viewportZoom, 0, -directionOuterRadius - 7 / viewportZoom]}
            rotation={TOKEN_DIRECTION_ROTATION[token.direction] + 45}
            stroke="rgba(255, 230, 190, 0.82)"
            strokeWidth={1.2 / viewportZoom}
            listening={false}
          />
          <Circle
            radius={radius + (selected ? 5 / viewportZoom : 2 / viewportZoom)}
            fill={selected ? tone.glow : 'rgba(4, 7, 7, 0.72)'}
            stroke={selected ? tone.border : 'rgba(128,230,213,0.32)'}
            strokeWidth={(selected ? 3 : 1.5) / viewportZoom}
          />
          {!token.spine && (
            <>
              <Circle radius={radius} fill={tone.deep} opacity={0.96} />
              <Circle radius={radius * 0.82} fill={tone.core} opacity={image ? 0.38 : 0.94} />
            </>
          )}
          {!token.spine && image && (
            <Group
              clipFunc={(ctx: any) => {
                ctx.arc(0, 0, radius, 0, Math.PI * 2, false)
              }}
            >
              <KonvaImage
                image={image}
                x={-imageWidth / 2 + token.cropX}
                y={-imageHeight / 2 + token.cropY}
                width={imageWidth}
                height={imageHeight}
              />
            </Group>
          )}
          <Circle
            radius={radius}
            stroke={token.locked ? TOKEN_RELATION_COLORS.threat : tone.border}
            strokeWidth={3 / viewportZoom}
          />
          {tone.attention && (
            <Text
              text="!"
              x={radius - 8 / viewportZoom}
              y={-radius - 7 / viewportZoom}
              width={18 / viewportZoom}
              height={18 / viewportZoom}
              fontSize={16 / viewportZoom}
              fontStyle="bold"
              align="center"
              verticalAlign="middle"
              fill="#fff5f2"
              stroke={TOKEN_RELATION_COLORS.neutralAlert}
              strokeWidth={3 / viewportZoom}
              listening={false}
            />
          )}
          {token.locked && (
            <Text
              text="锁定"
              x={-10}
              y={-10}
              width={20}
              height={20}
              fontSize={14 / viewportZoom}
              align="center"
              verticalAlign="middle"
              fill="#fff"
              listening={false}
            />
          )}
        </>
      )}
      <Group
        x={-statusBarWidth / 2}
        y={statusBarsY}
        onClick={(event: any) => {
          event.cancelBubble = true
          onSelect()
        }}
        onTap={(event: any) => {
          event.cancelBubble = true
          onSelect()
        }}
      >
        {tokenBars.map((bar, index) => {
          const y = index * (statusBarHeight + statusBarGap)
          const ratio = getTokenBarRatio(bar.current, bar.max)
          return (
            <Group key={bar.key} y={y}>
              <Rect
                width={statusBarWidth}
                height={statusBarHeight}
                fill="rgba(0, 0, 0, 0.68)"
                stroke="rgba(255, 255, 255, 0.22)"
                strokeWidth={0.8 / viewportZoom}
                cornerRadius={statusBarHeight / 2}
              />
              <Rect
                width={statusBarWidth * ratio}
                height={statusBarHeight}
                fill={bar.color}
                cornerRadius={statusBarHeight / 2}
                shadowColor={bar.color}
                shadowBlur={selected ? 6 / viewportZoom : 2 / viewportZoom}
                shadowOpacity={0.35}
                listening={false}
              />
            </Group>
          )
        })}
      </Group>
      {selected && (
        <Group listening={false}>
          <Line
            points={[0, statusBarsY + 3 * statusBarHeight + 2 * statusBarGap + 2 / viewportZoom, 0, infoBoxY]}
            stroke={tone.border}
            strokeWidth={1.2 / viewportZoom}
            opacity={0.82}
            listening={false}
          />
          <Rect
            x={-infoBoxWidth / 2}
            y={infoBoxY}
            width={infoBoxWidth}
            height={infoBoxHeight}
            fill="rgba(4, 8, 8, 0.9)"
            stroke={tone.border}
            strokeWidth={1.4 / viewportZoom}
            cornerRadius={2 / viewportZoom}
            shadowColor={tone.core}
            shadowBlur={12 / viewportZoom}
            shadowOpacity={0.28}
            listening={false}
          />
          <Line
            points={[
              -infoBoxWidth / 2 + 8 / viewportZoom,
              infoBoxY + 17 / viewportZoom,
              infoBoxWidth / 2 - 8 / viewportZoom,
              infoBoxY + 17 / viewportZoom,
            ]}
            stroke="rgba(128, 230, 213, 0.18)"
            strokeWidth={1 / viewportZoom}
            listening={false}
          />
          <Text
            text={`所属 ${ownerLabel} / 属性 ${tone.badge}`}
            x={-infoBoxWidth / 2 + 8 / viewportZoom}
            y={infoBoxY + 4 / viewportZoom}
            width={infoBoxWidth - 16 / viewportZoom}
            align="center"
            fontSize={9 / viewportZoom}
            fontStyle="bold"
            fill={tone.border}
            opacity={0.95}
            listening={false}
          />
          <Text
            text={token.name}
            x={-infoBoxWidth / 2 + 8 / viewportZoom}
            y={infoBoxY + 22 / viewportZoom}
            width={infoBoxWidth - 16 / viewportZoom}
            align="center"
            fontSize={12.5 / viewportZoom}
            fontStyle="bold"
            fill="#edf3ef"
            listening={false}
          />
          <Text
            text={tokenBars.map(bar => `${bar.label} ${bar.current}/${bar.max}`).join('  ')}
            x={-infoBoxWidth / 2 + 8 / viewportZoom}
            y={infoBoxY + 47 / viewportZoom}
            width={infoBoxWidth - 16 / viewportZoom}
            align="center"
            fontSize={10.5 / viewportZoom}
            fontStyle="bold"
            fill="rgba(237, 243, 239, 0.82)"
            listening={false}
          />
        </Group>
      )}
    </Group>
  )
}

function AssetNode({
  asset,
  selected,
  canMove,
  viewportZoom,
  onSelect,
  snapPosition,
  onDragEnd,
}: {
  asset: BoardImageAsset
  selected: boolean
  canMove: boolean
  viewportZoom: number
  onSelect: () => void
  snapPosition: (x: number, y: number) => { x: number; y: number }
  onDragEnd: (x: number, y: number) => void
}) {
  const image = useCanvasImage(asset.src)

  return (
    <Group
      x={asset.x}
      y={asset.y}
      listening={!asset.locked}
      draggable={canMove}
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={(event: any) => {
        const next = snapPosition(event.target.x(), event.target.y())
        event.target.position(next)
      }}
      onDragEnd={(event: any) => {
        const next = snapPosition(event.target.x(), event.target.y())
        event.target.position(next)
        onDragEnd(next.x, next.y)
      }}
    >
      {image ? (
        <KonvaImage image={image} width={asset.width} height={asset.height} opacity={asset.opacity} />
      ) : (
        <Rect width={asset.width} height={asset.height} fill="#222838" opacity={asset.opacity} />
      )}
      <Rect
        width={asset.width}
        height={asset.height}
        stroke={selected ? '#ffa940' : asset.locked ? '#ff4d4f' : 'rgba(255,255,255,0.25)'}
        strokeWidth={(selected ? 3 : 1.5) / viewportZoom}
        dash={asset.locked ? [8 / viewportZoom, 6 / viewportZoom] : undefined}
      />
      <Text
        text={`${asset.locked ? '锁定 ' : ''}${asset.name}`}
        x={8 / viewportZoom}
        y={8 / viewportZoom}
        fontSize={12 / viewportZoom}
        fill="#fff"
        stroke="#0a0e14"
        strokeWidth={3 / viewportZoom}
        listening={false}
      />
    </Group>
  )
}

function GridBackdrop({
  width,
  height,
  grid,
  viewport,
}: {
  width: number
  height: number
  grid: BoardGrid
  viewport: { x: number; y: number; zoom: number }
}) {
  const viewLeft = -viewport.x / viewport.zoom
  const viewTop = -viewport.y / viewport.zoom
  const viewRight = (width - viewport.x) / viewport.zoom
  const viewBottom = (height - viewport.y) / viewport.zoom

  return (
    <Rect
      x={viewLeft - grid.size}
      y={viewTop - grid.size}
      width={viewRight - viewLeft + grid.size * 2}
      height={viewBottom - viewTop + grid.size * 2}
      fill="#0b0f16"
      listening={false}
    />
  )
}

function GridLines({
  width,
  height,
  grid,
  viewport,
}: {
  width: number
  height: number
  grid: BoardGrid
  viewport: { x: number; y: number; zoom: number }
}) {
  const lines = []
  const viewLeft = -viewport.x / viewport.zoom
  const viewTop = -viewport.y / viewport.zoom
  const viewRight = (width - viewport.x) / viewport.zoom
  const viewBottom = (height - viewport.y) / viewport.zoom
  const startX = Math.floor(viewLeft / grid.size) * grid.size
  const startY = Math.floor(viewTop / grid.size) * grid.size
  const dash = grid.lineStyle === 'dashed' ? [grid.size / 4, grid.size / 6] : undefined
  const strokeWidth = grid.lineWidth / viewport.zoom

  for (let x = startX, count = 0; x <= viewRight; x += grid.size, count += 1) {
    if (count > 500) break
    lines.push(
      <Line
        key={`v-${x}`}
        points={[x, viewTop - grid.size, x, viewBottom + grid.size]}
        stroke={grid.color}
        strokeWidth={strokeWidth}
        dash={dash}
        opacity={0.9}
        listening={false}
      />,
    )
  }

  for (let y = startY, count = 0; y <= viewBottom; y += grid.size, count += 1) {
    if (count > 500) break
    lines.push(
      <Line
        key={`h-${y}`}
        points={[viewLeft - grid.size, y, viewRight + grid.size, y]}
        stroke={grid.color}
        strokeWidth={strokeWidth}
        dash={dash}
        opacity={0.9}
        listening={false}
      />,
    )
  }

  return (
    <>
      {lines}
      <Line
        points={[viewLeft - grid.size, 0, viewRight + grid.size, 0]}
        stroke="rgba(255,169,64,0.7)"
        strokeWidth={2 / viewport.zoom}
        listening={false}
      />
      <Line
        points={[0, viewTop - grid.size, 0, viewBottom + grid.size]}
        stroke="rgba(255,169,64,0.7)"
        strokeWidth={2 / viewport.zoom}
        listening={false}
      />
    </>
  )
}

function SceneItemNode({
  item,
  selected,
  canMove,
  viewportZoom,
  onSelect,
  snapPosition,
  onDragEnd,
}: {
  item: BoardSceneItem
  selected: boolean
  canMove: boolean
  viewportZoom: number
  onSelect: () => void
  snapPosition: (x: number, y: number) => { x: number; y: number }
  onDragEnd: (x: number, y: number) => void
}) {
  const image = useCanvasImage(item.src)

  return (
    <Group
      x={item.x}
      y={item.y}
      listening={canMove || selected}
      draggable={canMove}
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={(event: any) => {
        const next = snapPosition(event.target.x(), event.target.y())
        event.target.position(next)
      }}
      onDragEnd={(event: any) => {
        const next = snapPosition(event.target.x(), event.target.y())
        event.target.position(next)
        onDragEnd(next.x, next.y)
      }}
    >
      {image ? (
        <KonvaImage image={image} width={item.width} height={item.height} opacity={item.opacity} />
      ) : (
        <Rect width={item.width} height={item.height} fill="#151c22" opacity={item.opacity} />
      )}
      {selected && (
        <>
          <Rect
            width={item.width}
            height={item.height}
            stroke="#80e6d5"
            strokeWidth={2.5 / viewportZoom}
            dash={item.locked ? [8 / viewportZoom, 6 / viewportZoom] : undefined}
          />
          <Text
            text={`${item.kind === 'background' ? '背景' : item.kind === 'npc' ? 'NPC' : '角色'} / ${item.name}`}
            x={8 / viewportZoom}
            y={8 / viewportZoom}
            fontSize={12 / viewportZoom}
            fill="#fff"
            stroke="#0a0e14"
            strokeWidth={3 / viewportZoom}
            listening={false}
          />
        </>
      )}
    </Group>
  )
}

export default function BattleBoard({
  state,
  members,
  user,
  room,
  onChange,
  activeDraggingTokenIds = [],
  tokenDragPreviewPositions = {},
  onTokenDragStart,
  onTokenDragMove,
  onTokenDragEnd,
}: BattleBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<any>(null)
  const boardLayerRef = useRef<any>(null)
  const localDraggingTokenIdsRef = useRef<string[]>([])
  const localTokenPreviewFrameRef = useRef<number | null>(null)
  const pendingLocalTokenPreviewRef = useRef<Record<string, { x: number; y: number }>>({})
  const [size, setSize] = useState({ width: 960, height: 640 })
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 })
  const [panning, setPanning] = useState<null | { x: number; y: number; originX: number; originY: number }>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelTab, setPanelTab] = useState<'tokens' | 'assets' | 'scene' | 'grid'>('tokens')
  const [tokenInspectorTab, setTokenInspectorTab] = useState<'style' | 'attributes'>('style')
  const [selectedTokenId, setSelectedTokenId] = useState('')
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [selectedSceneItemId, setSelectedSceneItemId] = useState('')
  const [tokenOwnerId, setTokenOwnerId] = useState<number | ''>('')
  const [attentionPulse, setAttentionPulse] = useState(0)
  const [cropEditor, setCropEditor] = useState<TokenCropDraft | null>(null)
  const [presetTokens, setPresetTokens] = useState<PresetTokenDefinition[]>([])
  const [presetTokensLoading, setPresetTokensLoading] = useState(false)
  const [presetTokensError, setPresetTokensError] = useState('')
  const [presetPickerOpen, setPresetPickerOpen] = useState(false)
  const [presetSearch, setPresetSearch] = useState('')
  const [scenePortraitPickerOpen, setScenePortraitPickerOpen] = useState(false)
  const [scenePortraitSearch, setScenePortraitSearch] = useState('')
  const [localDraggingTokenIds, setLocalDraggingTokenIds] = useState<string[]>([])
  const [localTokenDragPreviewPositions, setLocalTokenDragPreviewPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [selectionBox, setSelectionBox] = useState<BoardSelectionBox | null>(null)
  const [boardClipboard, setBoardClipboard] = useState<BoardClipboard | null>(null)
  const [isCoarsePointer, setIsCoarsePointer] = useState(false)
  const [interactionMode, setInteractionMode] = useState<BoardInteractionMode>('box-select')

  const board = useMemo(() => normalizeBoardState(state), [state])
  const currentMember = members.find(member => member.userId === user.id)
  const isSN = currentMember?.role === 'SN' || room?.snId === user.id
  const selectedToken = board.tokens.find(token => token.id === selectedTokenId)
  const selectedTokenIdSet = useMemo(() => new Set(selectedTokenIds), [selectedTokenIds])
  const selectedTokens = useMemo(
    () => board.tokens.filter(token => selectedTokenIdSet.has(token.id)),
    [board.tokens, selectedTokenIdSet],
  )
  const selectedAsset = board.assets.find(asset => asset.id === selectedAssetId)
  const selectedSceneItem = board.scene.items.find(item => item.id === selectedSceneItemId)
  const sortedAssets = useMemo(() => [...board.assets].sort((a, b) => a.layer - b.layer), [board.assets])
  const underGridAssets = useMemo(() => sortedAssets.filter(asset => asset.layer < 0), [sortedAssets])
  const overGridAssets = useMemo(() => sortedAssets.filter(asset => asset.layer >= 0), [sortedAssets])
  const visibleSceneItems = useMemo(
    () => board.scene.enabled
      ? [...board.scene.items].filter(item => item.visible).sort((a, b) => a.layer - b.layer)
      : [],
    [board.scene.enabled, board.scene.items],
  )
  const visualTokens = useMemo(() => (
    board.tokens.map(token => {
      const previewPosition = localTokenDragPreviewPositions[token.id] || tokenDragPreviewPositions[token.id]
      return previewPosition ? { ...token, x: previewPosition.x, y: previewPosition.y } : token
    })
  ), [board.tokens, localTokenDragPreviewPositions, tokenDragPreviewPositions])
  const sortedTokens = useMemo(() => [...visualTokens].sort((a, b) => a.layer - b.layer), [visualTokens])
  const activeDraggingTokenIdSet = useMemo(() => (
    new Set([...activeDraggingTokenIds, ...localDraggingTokenIds].filter(Boolean))
  ), [activeDraggingTokenIds, localDraggingTokenIds])
  const combatantGridIndex = useMemo(
    () => buildCombatantGridIndex(visualTokens, board.grid.size),
    [board.grid.size, visualTokens],
  )
  const presetTokenAnimationCandidates = useMemo(() => {
    const candidates = new Map<string, readonly string[]>()
    visualTokens.forEach(token => {
      const animationCandidates = resolvePresetTokenAnimationCandidates(
        token,
        visualTokens,
        board.grid.size,
        activeDraggingTokenIdSet,
        combatantGridIndex,
      )
      if (animationCandidates) candidates.set(token.id, animationCandidates)
    })
    return candidates
  }, [activeDraggingTokenIdSet, board.grid.size, combatantGridIndex, visualTokens])
  const liveAnimatedPresetTokenIdSet = useMemo(() => {
    const animatedTokens = visualTokens
      .filter(token => token.spine && shouldAnimatePresetToken(presetTokenAnimationCandidates.get(token.id)))
      .sort((a, b) => {
        const dragPriority = Number(activeDraggingTokenIdSet.has(b.id)) - Number(activeDraggingTokenIdSet.has(a.id))
        if (dragPriority) return dragPriority
        if (a.layer !== b.layer) return a.layer - b.layer
        return a.id.localeCompare(b.id)
      })

    return new Set(animatedTokens.slice(0, PRESET_TOKEN_MAX_LIVE_ANIMATIONS).map(token => token.id))
  }, [activeDraggingTokenIdSet, presetTokenAnimationCandidates, visualTokens])
  const hasAttentionTokens = useMemo(
    () => board.tokens.some(token => (token.disposition === 'neutral' && token.attention) || (token.disposition === 'enemy' && token.threatLevel === 'high')),
    [board.tokens],
  )
  const filteredPresetTokens = useMemo(() => {
    const query = presetSearch.trim().toLowerCase()
    const source = presetTokens.length ? presetTokens : [FALLBACK_PRESET_TOKEN]
    const visiblePresets = source.filter(preset => Boolean(preset.avatar))
    if (!query) return visiblePresets
    return visiblePresets.filter(preset => (
      preset.id.toLowerCase().includes(query)
      || preset.name.toLowerCase().includes(query)
    ))
  }, [presetSearch, presetTokens])
  const filteredScenePortraitOptions = useMemo(() => {
    const characterOptions = members
      .reduce<ScenePortraitOption[]>((options, member) => {
        const src = getCharacterPortraitUrl(member.character)
        if (!src) return options
        options.push({
          id: `character-${member.character?.id || member.userId}`,
          name: member.character?.name || member.user?.username || '角色',
          src,
          kind: 'portrait',
        })
        return options
      }, [])
    const presetOptions = (presetTokens.length ? presetTokens : [FALLBACK_PRESET_TOKEN])
      .filter(preset => Boolean(preset.avatar))
      .map(preset => ({
        id: `preset-${preset.id}`,
        name: preset.name,
        src: String(preset.avatar),
        kind: 'npc' as const,
        presetId: preset.id,
      }))
    const uniqueOptions = [...characterOptions, ...presetOptions].filter((option, index, options) => (
      options.findIndex(candidate => candidate.src === option.src) === index
    ))
    const query = scenePortraitSearch.trim().toLowerCase()
    if (!query) return uniqueOptions
    return uniqueOptions.filter(option => (
      option.id.toLowerCase().includes(query) || option.name.toLowerCase().includes(query)
    ))
  }, [members, presetTokens, scenePortraitSearch])
  const selectedAssetScale = selectedAsset
    ? Math.round((selectedAsset.width / selectedAsset.originalWidth) * 100)
    : 100
  const selectedSceneItemScale = selectedSceneItem
    ? Math.round((selectedSceneItem.width / selectedSceneItem.originalWidth) * 100)
    : 100
  const selectionBounds = selectionBox ? normalizeSelectionBox(selectionBox) : null
  const selectedBatchSizeValue = selectedTokens.length && selectedTokens.every(token => token.size === selectedTokens[0].size)
    ? String(selectedTokens[0].size)
    : ''
  const selectedBatchDirection = selectedTokens.length && selectedTokens.every(token => token.direction === selectedTokens[0].direction)
    ? selectedTokens[0].direction
    : null

  useEffect(() => {
    setTokenInspectorTab('style')
  }, [selectedTokenId])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const updateSize = () => {
      setSize({
        width: Math.max(300, node.clientWidth),
        height: Math.max(260, node.clientHeight),
      })
    }
    updateSize()

    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(node)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia('(pointer: coarse), (max-width: 900px)')
    const applyCompactMode = () => {
      const compact = media.matches
      setIsCoarsePointer(compact)
      if (compact) {
        setPanelOpen(false)
        setInteractionMode(mode => (mode === 'box-select' ? 'select' : mode))
      }
    }
    applyCompactMode()
    media.addEventListener?.('change', applyCompactMode)
    return () => media.removeEventListener?.('change', applyCompactMode)
  }, [])

  useEffect(() => () => {
    if (localTokenPreviewFrameRef.current != null) {
      window.cancelAnimationFrame(localTokenPreviewFrameRef.current)
    }
  }, [])

  useEffect(() => {
    const tokenIds = new Set(board.tokens.map(token => token.id))
    setSelectedTokenIds(prev => prev.filter(id => tokenIds.has(id)))
  }, [board.tokens.map(token => token.id).join('|')])

  useEffect(() => {
    if (selectedSceneItemId && !board.scene.items.some(item => item.id === selectedSceneItemId)) {
      setSelectedSceneItemId('')
    }
  }, [board.scene.items, selectedSceneItemId])

  useEffect(() => {
    if (!hasAttentionTokens) {
      setAttentionPulse(0)
      return
    }

    const timer = window.setInterval(() => {
      setAttentionPulse((Math.sin(performance.now() / 360) + 1) / 2)
    }, 80)
    return () => {
      window.clearInterval(timer)
    }
  }, [hasAttentionTokens])

  useEffect(() => {
    if (!liveAnimatedPresetTokenIdSet.size) return

    let frameId = 0
    let lastDrawAt = 0
    const frameInterval = 1000 / PRESET_TOKEN_REDRAW_FPS

    const drawAnimatedPresetTokens = (timestamp: number) => {
      if (timestamp - lastDrawAt >= frameInterval) {
        boardLayerRef.current?.batchDraw()
        lastDrawAt = timestamp
      }
      frameId = window.requestAnimationFrame(drawAnimatedPresetTokens)
    }

    frameId = window.requestAnimationFrame(drawAnimatedPresetTokens)
    return () => window.cancelAnimationFrame(frameId)
  }, [liveAnimatedPresetTokenIdSet])

  useEffect(() => {
    let active = true
    setPresetTokensLoading(true)
    setPresetTokensError('')

    fetch(PRESET_TOKEN_MANIFEST_URL)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((data: unknown) => {
        if (!active) return
        const presets = Array.isArray(data)
          ? data
            .map((item: any): PresetTokenDefinition | null => {
              if (!item || typeof item !== 'object') return null
              const id = typeof item.id === 'string' ? item.id.trim() : ''
              const skeleton = typeof item.skeleton === 'string' ? item.skeleton.trim() : ''
              const atlas = typeof item.atlas === 'string' ? item.atlas.trim() : ''
              if (!id || !skeleton || !atlas) return null
              return {
                id,
                name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id,
                skeleton,
                atlas,
                texture: typeof item.texture === 'string' ? item.texture : null,
                avatar: typeof item.avatar === 'string' ? item.avatar : null,
                animation: typeof item.animation === 'string' && item.animation ? item.animation : 'Idle',
                viewportScale: clamp(Number(item.viewportScale) || PRESET_TOKEN_DEFAULT_VIEWPORT_SCALE, 0.8, 6),
                offsetX: clamp(Number(item.offsetX) || 0, -300, 300),
                offsetY: clamp(Number(item.offsetY) || PRESET_TOKEN_DEFAULT_OFFSET_Y, -300, 300),
              }
            })
            .filter((preset): preset is PresetTokenDefinition => Boolean(preset))
          : []
        setPresetTokens(presets)
        const avatarPresetCount = presets.filter(preset => Boolean(preset.avatar)).length
        setPresetTokensError(avatarPresetCount ? '' : '当前还没有带头像的预设TOKEN。')
      })
      .catch(error => {
        if (!active) return
        console.warn('[PresetTokenManifest]', error)
        setPresetTokens([])
        setPresetTokensError('预设TOKEN列表读取失败，已保留默认预设。')
      })
      .finally(() => {
        if (active) setPresetTokensLoading(false)
      })

    return () => { active = false }
  }, [])

  const updateBoard = (updater: BoardState | ((prev: BoardState) => BoardState), sync = true) => {
    const next = normalizeBoardState(typeof updater === 'function' ? updater(board) : updater)
    onChange(next, { sync })
  }

  const queueLocalTokenDragPreview = (positions: Array<{ tokenId: string; x: number; y: number }>) => {
    const next = positions.reduce<Record<string, { x: number; y: number }>>((acc, position) => {
      acc[position.tokenId] = { x: position.x, y: position.y }
      return acc
    }, {})
    pendingLocalTokenPreviewRef.current = next
    if (localTokenPreviewFrameRef.current != null) return

    localTokenPreviewFrameRef.current = window.requestAnimationFrame(() => {
      localTokenPreviewFrameRef.current = null
      setLocalTokenDragPreviewPositions(pendingLocalTokenPreviewRef.current)
    })
  }

  const clearLocalTokenDragPreview = () => {
    pendingLocalTokenPreviewRef.current = {}
    if (localTokenPreviewFrameRef.current != null) {
      window.cancelAnimationFrame(localTokenPreviewFrameRef.current)
      localTokenPreviewFrameRef.current = null
    }
    setLocalTokenDragPreviewPositions({})
  }

  const startTokenDragAnimation = (tokenIds: string[]) => {
    const nextIds = [...new Set(tokenIds.filter(Boolean))]
    clearLocalTokenDragPreview()
    localDraggingTokenIdsRef.current = nextIds
    setLocalDraggingTokenIds(nextIds)
    nextIds.forEach(tokenId => onTokenDragStart?.(tokenId))
  }

  const endTokenDragAnimation = (fallbackTokenIds: string[]) => {
    const nextIds = localDraggingTokenIdsRef.current.length
      ? localDraggingTokenIdsRef.current
      : fallbackTokenIds
    localDraggingTokenIdsRef.current = []
    setLocalDraggingTokenIds([])
    clearLocalTokenDragPreview()
    nextIds.forEach(tokenId => onTokenDragEnd?.(tokenId))
  }

  const boardPoint = (screenX = size.width / 2, screenY = size.height / 2) => ({
    x: (screenX - viewport.x) / viewport.zoom,
    y: (screenY - viewport.y) / viewport.zoom,
  })

  const snap = (value: number) => (
    board.snapToGrid ? Math.round(value / board.grid.size) * board.grid.size : value
  )

  const canMoveToken = (token: BoardToken) => (
    !token.locked && (isSN || token.allowedUserIds.includes(user.id))
  )
  const canEditToken = (_token: BoardToken) => isSN
  const canMoveAsset = (asset: BoardImageAsset) => !asset.locked && isSN
  const canEditAsset = (_asset: BoardImageAsset) => isSN
  const canMoveSceneItem = (item: BoardSceneItem) => board.scene.enabled && item.visible && !item.locked && isSN
  const canEditSceneItem = (_item: BoardSceneItem) => isSN

  const resolveOwner = (ownerId: number | '') => {
    const owner = members.find(member => member.userId === ownerId) || currentMember
    return {
      ownerUserId: owner?.userId ?? user.id,
      ownerName: owner?.user?.username || user.username,
      characterId: owner?.characterId || owner?.character?.id || null,
      tokenName: owner?.character?.name || owner?.user?.username || user.username,
      portraitUrl: getCharacterPortraitUrl(owner?.character),
      combatDefaults: getTokenCombatDefaults(owner?.character),
    }
  }

  const addToken = () => {
    if (!isSN) return
    const center = boardPoint()
    const owner = resolveOwner(isSN ? tokenOwnerId : user.id)
    const token: BoardToken = {
      id: createId('token'),
      name: owner.tokenName,
      x: snap(center.x),
      y: snap(center.y),
      size: board.grid.size,
      color: TOKEN_COLORS[board.tokens.length % TOKEN_COLORS.length],
      disposition: 'player',
      threatLevel: 'normal',
      direction: 'up',
      attention: false,
      ...owner.combatDefaults,
      image: owner.portraitUrl || undefined,
      ownerUserId: owner.ownerUserId,
      ownerName: owner.ownerName,
      characterId: owner.characterId,
      allowedUserIds: [],
      locked: false,
      layer: board.tokens.length + 10,
      cropX: 0,
      cropY: 0,
      cropZoom: 1,
    }

    setPanelTab('tokens')
    setSelectedAssetId('')
    setSelectedSceneItemId('')
    setSelectedTokenId(token.id)
    setSelectedTokenIds([])
    updateBoard(prev => ({ ...prev, tokens: [...prev.tokens, token] }))
  }

  const openPresetTokenPicker = () => {
    if (!isSN) return
    setPanelTab('tokens')
    setPanelOpen(true)
    setPresetPickerOpen(true)
  }

  const createPresetBoardToken = (
    preset: PresetTokenDefinition,
    owner: ReturnType<typeof resolveOwner>,
    x: number,
    y: number,
    layer: number,
  ): BoardToken => ({
      id: createId('token'),
      name: preset.name || preset.id,
      x,
      y,
      size: board.grid.size,
      color: TOKEN_RELATION_COLORS.enemy,
      disposition: 'enemy',
      threatLevel: 'normal',
      direction: 'up',
      attention: false,
      hp: 10,
      hpMax: 10,
      sp: 0,
      spMax: 9,
      stamina: 2,
      staminaMax: 2,
      spine: {
        presetId: preset.id,
        skeleton: preset.skeleton,
        atlas: preset.atlas,
        animation: preset.animation || 'Idle',
        viewportScale: PRESET_TOKEN_DEFAULT_VIEWPORT_SCALE,
        offsetX: preset.offsetX,
        offsetY: PRESET_TOKEN_DEFAULT_OFFSET_Y,
        facing: 'right',
      },
      ownerUserId: owner.ownerUserId,
      ownerName: owner.ownerName,
      characterId: null,
      allowedUserIds: [],
      locked: false,
      layer,
      cropX: 0,
      cropY: 0,
      cropZoom: 1,
  })

  const addPresetToken = (preset: PresetTokenDefinition) => {
    const center = boardPoint()
    const owner = resolveOwner(isSN ? tokenOwnerId : user.id)
    const token = createPresetBoardToken(
      preset,
      owner,
      snap(center.x),
      snap(center.y),
      board.tokens.length + 10,
    )

    setPanelTab('tokens')
    setSelectedAssetId('')
    setSelectedSceneItemId('')
    setSelectedTokenId(token.id)
    setSelectedTokenIds([])
    setPresetPickerOpen(false)
    updateBoard(prev => ({ ...prev, tokens: [...prev.tokens, token] }))
  }

  const addPresetTokensBatch = (items: PresetTokenBatchItem[]) => {
    const expandedPresets = items.flatMap(item => Array.from({ length: item.quantity }, () => item.preset))
    if (!expandedPresets.length) return

    const center = boardPoint()
    const owner = resolveOwner(isSN ? tokenOwnerId : user.id)
    const columns = Math.ceil(Math.sqrt(expandedPresets.length))
    const gridStep = board.grid.size
    const baseX = snap(center.x) - Math.floor(columns / 2) * gridStep
    const baseY = snap(center.y) - Math.floor(Math.ceil(expandedPresets.length / columns) / 2) * gridStep
    const tokens = expandedPresets.map((preset, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)
      return createPresetBoardToken(
        preset,
        owner,
        snap(baseX + column * gridStep),
        snap(baseY + row * gridStep),
        board.tokens.length + 10 + index,
      )
    })

    setPanelTab('tokens')
    setSelectedAssetId('')
    setSelectedSceneItemId('')
    setSelectedTokenId('')
    setSelectedTokenIds(tokens.map(token => token.id))
    setPresetPickerOpen(false)
    updateBoard(prev => ({ ...prev, tokens: [...prev.tokens, ...tokens] }))
  }

  const updateToken = (tokenId: string, patch: Partial<BoardToken>, sync = true) => {
    const target = board.tokens.find(token => token.id === tokenId)
    if (!target) return
    let safePatch = patch
    if (!canEditToken(target)) {
      if (!canMoveToken(target)) return
      const nextDirection = patch.direction
      const nextFacing = patch.spine?.facing
      safePatch = {
        ...(nextDirection ? { direction: nextDirection } : {}),
        ...(target.spine && (nextFacing === 'left' || nextFacing === 'right')
          ? { spine: { ...target.spine, facing: nextFacing } }
          : {}),
      }
      if (!Object.keys(safePatch).length) return
    }
    updateBoard(prev => ({
      ...prev,
      tokens: prev.tokens.map(token => token.id === tokenId ? normalizeToken({ ...token, ...safePatch }) : token),
    }), sync)
  }

  const updateTokenDirection = (token: BoardToken, direction: TokenDirection) => {
    if (!canMoveToken(token)) return
    updateToken(token.id, buildTokenDirectionPatch(token, direction))
  }

  const updateSelectedTokens = (patcher: (token: BoardToken) => Partial<BoardToken>, sync = true) => {
    if (!selectedTokenIds.length || !isSN) return
    const targetIds = new Set(selectedTokenIds)
    updateBoard(prev => ({
      ...prev,
      tokens: prev.tokens.map(token => (
        targetIds.has(token.id) && canEditToken(token)
          ? normalizeToken({ ...token, ...patcher(token) })
          : token
      )),
    }), sync)
  }

  const updateSelectedTokenDirection = (direction: TokenDirection) => {
    updateSelectedTokens(token => buildTokenDirectionPatch(token, direction))
  }

  const updateSelectedTokenSize = (size: number) => {
    updateSelectedTokens(() => ({ size: clamp(size, 24, 180) }))
  }

  const moveSelectedTokensBy = (dx: number, dy: number, sync = true) => {
    if (!selectedTokenIds.length || !isSN) return
    const targetIds = new Set(selectedTokenIds)
    updateBoard(prev => ({
      ...prev,
      tokens: prev.tokens.map(token => (
        targetIds.has(token.id) && canMoveToken(token)
          ? normalizeToken({ ...token, x: token.x + dx, y: token.y + dy })
          : token
      )),
    }), sync)
  }

  const getTokenMovePreviewPositions = (tokenId: string, x: number, y: number) => {
    const groupIds = selectedTokenIdSet.has(tokenId) ? selectedTokenIds : [tokenId]
    const targetIds = new Set(groupIds)
    const anchor = board.tokens.find(token => token.id === tokenId)
    if (!anchor) return []

    const dx = x - anchor.x
    const dy = y - anchor.y
    return board.tokens
      .filter(token => targetIds.has(token.id) && canMoveToken(token))
      .map(token => ({
        tokenId: token.id,
        x: token.x + dx,
        y: token.y + dy,
      }))
  }

  const moveTokenWithSelection = (tokenId: string, x: number, y: number, sync = true) => {
    const groupIds = selectedTokenIdSet.has(tokenId) ? selectedTokenIds : [tokenId]
    const targetIds = new Set(groupIds)
    updateBoard(prev => {
      const anchor = prev.tokens.find(token => token.id === tokenId)
      if (!anchor) return prev
      const dx = x - anchor.x
      const dy = y - anchor.y
      return {
        ...prev,
        tokens: prev.tokens.map(token => (
          targetIds.has(token.id) && canMoveToken(token)
            ? normalizeToken({ ...token, x: token.x + dx, y: token.y + dy })
            : token
        )),
      }
    }, sync)
  }

  const removeToken = (tokenId: string) => {
    const target = board.tokens.find(token => token.id === tokenId)
    if (!target || !canEditToken(target)) return
    updateBoard(prev => ({ ...prev, tokens: prev.tokens.filter(token => token.id !== tokenId) }))
    if (selectedTokenId === tokenId) setSelectedTokenId('')
    setSelectedTokenIds(prev => prev.filter(id => id !== tokenId))
  }

  const deleteActiveSelection = () => {
    if (selectedTokenIds.length) {
      const targetIds = new Set(selectedTokenIds)
      updateBoard(prev => ({
        ...prev,
        tokens: prev.tokens.filter(token => !targetIds.has(token.id) || !canEditToken(token)),
      }))
      setSelectedTokenIds([])
      setSelectedTokenId('')
      return
    }

    if (selectedToken && canEditToken(selectedToken)) {
      removeToken(selectedToken.id)
      return
    }

    if (selectedAsset && canEditAsset(selectedAsset)) {
      removeAsset(selectedAsset.id)
      return
    }

    if (selectedSceneItem && canEditSceneItem(selectedSceneItem)) {
      removeSceneItem(selectedSceneItem.id)
    }
  }

  const resizeActiveSelection = (delta: number) => {
    if (selectedTokenIds.length) {
      updateSelectedTokens(token => ({ size: clamp(token.size + delta, 24, 180) }))
      return
    }

    if (selectedToken && canEditToken(selectedToken)) {
      updateToken(selectedToken.id, { size: clamp(selectedToken.size + delta, 24, 180) })
      return
    }

    if (selectedAsset && canEditAsset(selectedAsset)) {
      const scale = delta > 0 ? 1.1 : 0.9
      updateAssetSize(selectedAsset.id, selectedAsset.width * scale, selectedAsset.height * scale)
      return
    }

    if (selectedSceneItem && canEditSceneItem(selectedSceneItem)) {
      const scale = delta > 0 ? 1.1 : 0.9
      updateSceneItemSize(selectedSceneItem.id, selectedSceneItem.width * scale, selectedSceneItem.height * scale)
    }
  }

  const copyActiveSelection = () => {
    if (selectedTokenIds.length) {
      const targetIds = new Set(selectedTokenIds)
      const tokens = board.tokens.filter(token => targetIds.has(token.id))
      if (tokens.length) setBoardClipboard({ kind: 'tokens', tokens })
      return
    }

    if (selectedToken) {
      setBoardClipboard({ kind: 'tokens', tokens: [selectedToken] })
      return
    }

    if (selectedAsset) {
      setBoardClipboard({ kind: 'asset', asset: selectedAsset })
      return
    }

    if (selectedSceneItem) {
      setBoardClipboard({ kind: 'scene-item', item: selectedSceneItem })
    }
  }

  const addAsset = async (file: File) => {
    if (!isSN) return
    const data = await readImageFile(file)
    const center = boardPoint()
    const maxWidth = Math.min(720, data.width)
    const ratio = maxWidth / data.width
    const asset: BoardImageAsset = {
      id: createId('asset'),
      name: file.name.replace(/\.[^.]+$/, '') || 'Map Image',
      src: data.src,
      x: snap(center.x - maxWidth / 2),
      y: snap(center.y - (data.height * ratio) / 2),
      width: Math.round(maxWidth),
      height: Math.round(data.height * ratio),
      originalWidth: data.width,
      originalHeight: data.height,
      ownerUserId: user.id,
      ownerName: user.username,
      locked: false,
      layer: board.assets.length,
      opacity: 1,
    }

    setPanelTab('assets')
    setSelectedSceneItemId('')
    setSelectedAssetId(asset.id)
    updateBoard(prev => ({ ...prev, assets: [...prev.assets, asset] }))
  }

  const updateAsset = (assetId: string, patch: Partial<BoardImageAsset>, sync = true) => {
    const target = board.assets.find(asset => asset.id === assetId)
    if (!target || !canEditAsset(target)) return
    updateBoard(prev => ({
      ...prev,
      assets: prev.assets.map(asset => asset.id === assetId ? normalizeAsset({ ...asset, ...patch }) : asset),
    }), sync)
  }

  const resizeAssetFromCenter = (asset: BoardImageAsset, width: number, height: number) => {
    const nextWidth = clamp(Math.round(width), 40, 4000)
    const nextHeight = clamp(Math.round(height), 40, 4000)
    return normalizeAsset({
      ...asset,
      x: asset.x + (asset.width - nextWidth) / 2,
      y: asset.y + (asset.height - nextHeight) / 2,
      width: nextWidth,
      height: nextHeight,
    })
  }

  const updateAssetSize = (assetId: string, width: number, height: number, sync = true) => {
    const target = board.assets.find(asset => asset.id === assetId)
    if (!target || !canEditAsset(target)) return
    updateBoard(prev => ({
      ...prev,
      assets: prev.assets.map(asset => asset.id === assetId ? resizeAssetFromCenter(asset, width, height) : asset),
    }), sync)
  }

  const updateAssetScale = (assetId: string, scalePercent: number, sync = true) => {
    const target = board.assets.find(asset => asset.id === assetId)
    if (!target || !canEditAsset(target)) return
    updateBoard(prev => ({
      ...prev,
      assets: prev.assets.map(asset => {
        if (asset.id !== assetId) return asset
        const scale = clamp(scalePercent, 5, 300) / 100
        return resizeAssetFromCenter(asset, asset.originalWidth * scale, asset.originalHeight * scale)
      }),
    }), sync)
  }

  const removeAsset = (assetId: string) => {
    const target = board.assets.find(asset => asset.id === assetId)
    if (!target || !canEditAsset(target)) return
    updateBoard(prev => ({ ...prev, assets: prev.assets.filter(asset => asset.id !== assetId) }))
    if (selectedAssetId === assetId) setSelectedAssetId('')
  }

  const createSceneItem = (
    data: { src: string; width: number; height: number },
    kind: BoardSceneItemKind,
    name: string,
    presetId?: string,
  ) => {
    if (!isSN) return
    const center = boardPoint()
    const isBackground = kind === 'background'
    const scale = isBackground
      ? Math.min(1, 1400 / data.width)
      : Math.min(1, 720 / data.height, 520 / data.width)
    const width = Math.max(40, Math.round(data.width * scale))
    const height = Math.max(40, Math.round(data.height * scale))
    const backgroundCount = board.scene.items.filter(item => item.kind === 'background').length
    const highestLayer = board.scene.items.reduce((highest, item) => Math.max(highest, item.layer), 0)
    const item = normalizeSceneItem({
      id: createId('scene-item'),
      kind,
      name,
      src: data.src,
      x: snap(center.x - width / 2),
      y: snap(center.y - height / 2),
      width,
      height,
      originalWidth: data.width,
      originalHeight: data.height,
      ownerUserId: user.id,
      ownerName: user.username,
      presetId,
      visible: true,
      locked: false,
      layer: isBackground ? -100 + backgroundCount : highestLayer + 1,
      opacity: 1,
    })

    setPanelTab('scene')
    setSelectedTokenId('')
    setSelectedTokenIds([])
    setSelectedAssetId('')
    setSelectedSceneItemId(item.id)
    updateBoard(prev => ({
      ...prev,
      scene: {
        enabled: true,
        items: [...prev.scene.items, item],
      },
    }))
  }

  const addSceneImage = async (file: File, kind: BoardSceneItemKind) => {
    if (!isSN) return
    const data = await readImageFile(file)
    createSceneItem(data, kind, file.name.replace(/\.[^.]+$/, '') || '场景素材')
  }

  const addScenePortraitOption = async (option: ScenePortraitOption) => {
    if (!isSN) return
    try {
      const data = await readImageSource(option.src)
      createSceneItem(data, option.kind, option.name, option.presetId)
      setScenePortraitPickerOpen(false)
    } catch (error) {
      console.warn('[ScenePortrait]', error)
    }
  }

  const updateScene = (patch: Partial<BoardState['scene']>) => {
    if (!isSN) return
    updateBoard(prev => ({ ...prev, scene: { ...prev.scene, ...patch } }))
  }

  const updateSceneItem = (itemId: string, patch: Partial<BoardSceneItem>, sync = true) => {
    const target = board.scene.items.find(item => item.id === itemId)
    if (!target || !canEditSceneItem(target)) return
    updateBoard(prev => ({
      ...prev,
      scene: {
        ...prev.scene,
        items: prev.scene.items.map(item => item.id === itemId ? normalizeSceneItem({ ...item, ...patch }) : item),
      },
    }), sync)
  }

  const resizeSceneItemFromCenter = (item: BoardSceneItem, width: number, height: number) => {
    const nextWidth = clamp(Math.round(width), 40, 6000)
    const nextHeight = clamp(Math.round(height), 40, 6000)
    return normalizeSceneItem({
      ...item,
      x: item.x + (item.width - nextWidth) / 2,
      y: item.y + (item.height - nextHeight) / 2,
      width: nextWidth,
      height: nextHeight,
    })
  }

  const updateSceneItemSize = (itemId: string, width: number, height: number, sync = true) => {
    const target = board.scene.items.find(item => item.id === itemId)
    if (!target || !canEditSceneItem(target)) return
    updateBoard(prev => ({
      ...prev,
      scene: {
        ...prev.scene,
        items: prev.scene.items.map(item => (
          item.id === itemId ? resizeSceneItemFromCenter(item, width, height) : item
        )),
      },
    }), sync)
  }

  const updateSceneItemScale = (itemId: string, scalePercent: number, sync = true) => {
    const target = board.scene.items.find(item => item.id === itemId)
    if (!target || !canEditSceneItem(target)) return
    const scale = clamp(scalePercent, 5, 400) / 100
    updateSceneItemSize(itemId, target.originalWidth * scale, target.originalHeight * scale, sync)
  }

  const removeSceneItem = (itemId: string) => {
    const target = board.scene.items.find(item => item.id === itemId)
    if (!target || !canEditSceneItem(target)) return
    updateBoard(prev => ({
      ...prev,
      scene: { ...prev.scene, items: prev.scene.items.filter(item => item.id !== itemId) },
    }))
    if (selectedSceneItemId === itemId) setSelectedSceneItemId('')
  }

  const pasteClipboard = () => {
    if (!isSN) return
    if (!boardClipboard) return
    const target = getBoardPointer() || boardPoint()

    if (boardClipboard.kind === 'tokens') {
      const left = Math.min(...boardClipboard.tokens.map(token => token.x))
      const right = Math.max(...boardClipboard.tokens.map(token => token.x))
      const top = Math.min(...boardClipboard.tokens.map(token => token.y))
      const bottom = Math.max(...boardClipboard.tokens.map(token => token.y))
      const sourceCenter = {
        x: left + (right - left) / 2,
        y: top + (bottom - top) / 2,
      }
      const tokens = boardClipboard.tokens.map((token, index) => normalizeToken({
        ...token,
        id: createId('token'),
        name: token.name,
        x: snap(target.x + token.x - sourceCenter.x),
        y: snap(target.y + token.y - sourceCenter.y),
        spine: token.spine ? { ...token.spine } : undefined,
        allowedUserIds: [...token.allowedUserIds],
        layer: board.tokens.length + 10 + index,
      }))

      updateBoard(prev => ({ ...prev, tokens: [...prev.tokens, ...tokens] }))
      setBoardClipboard({ kind: 'tokens', tokens })
      setSelectedAssetId('')
      setSelectedSceneItemId('')
      setSelectedTokenId(tokens.length === 1 ? tokens[0].id : '')
      setSelectedTokenIds(tokens.length > 1 ? tokens.map(token => token.id) : [])
      return
    }

    if (boardClipboard.kind === 'asset') {
      const asset = normalizeAsset({
        ...boardClipboard.asset,
        id: createId('asset'),
        name: `${boardClipboard.asset.name} Copy`,
        x: snap(target.x - boardClipboard.asset.width / 2),
        y: snap(target.y - boardClipboard.asset.height / 2),
        layer: board.assets.length,
      })
      updateBoard(prev => ({ ...prev, assets: [...prev.assets, asset] }))
      setBoardClipboard({ kind: 'asset', asset })
      setSelectedTokenId('')
      setSelectedTokenIds([])
      setSelectedSceneItemId('')
      setSelectedAssetId(asset.id)
      return
    }

    const item = normalizeSceneItem({
      ...boardClipboard.item,
      id: createId('scene-item'),
      name: `${boardClipboard.item.name} Copy`,
      x: snap(target.x - boardClipboard.item.width / 2),
      y: snap(target.y - boardClipboard.item.height / 2),
      layer: board.scene.items.reduce((highest, candidate) => Math.max(highest, candidate.layer), 0) + 1,
    })
    updateBoard(prev => ({
      ...prev,
      scene: { enabled: true, items: [...prev.scene.items, item] },
    }))
    setBoardClipboard({ kind: 'scene-item', item })
    setSelectedTokenId('')
    setSelectedTokenIds([])
    setSelectedAssetId('')
    setSelectedSceneItemId(item.id)
  }

  const updateGrid = (patch: Partial<BoardGrid>) => {
    if (!isSN) return
    updateBoard(prev => ({ ...prev, grid: { ...prev.grid, ...patch } }))
  }

  const handleWheel = (event: any) => {
    event.evt.preventDefault()
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return

    const oldZoom = viewport.zoom
    const direction = event.evt.deltaY > 0 ? -1 : 1
    const nextZoom = clamp(oldZoom * (direction > 0 ? 1.08 : 0.92), 0.35, 2.5)
    const mousePoint = {
      x: (pointer.x - viewport.x) / oldZoom,
      y: (pointer.y - viewport.y) / oldZoom,
    }

    setViewport({
      x: pointer.x - mousePoint.x * nextZoom,
      y: pointer.y - mousePoint.y * nextZoom,
      zoom: nextZoom,
    })
  }

  const getBoardPointer = () => {
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return null
    return {
      x: (pointer.x - viewport.x) / viewport.zoom,
      y: (pointer.y - viewport.y) / viewport.zoom,
    }
  }

  const startPan = (event: any) => {
    event.evt.preventDefault()
    setSelectionBox(null)
    setSelectedTokenId('')
    setSelectedAssetId('')
    setSelectedSceneItemId('')
    setPanning({
      x: event.evt.clientX,
      y: event.evt.clientY,
      originX: viewport.x,
      originY: viewport.y,
    })
    const container = stageRef.current?.container()
    if (container) container.style.cursor = 'grabbing'
  }

  const startSelection = (event: any) => {
    const point = getBoardPointer()
    if (!point) return
    event.evt.preventDefault()
    setPanning(null)
    setSelectedTokenId('')
    setSelectedAssetId('')
    setSelectedSceneItemId('')
    setSelectionBox({
      startX: point.x,
      startY: point.y,
      endX: point.x,
      endY: point.y,
    })
    const container = stageRef.current?.container()
    if (container) container.style.cursor = 'crosshair'
  }

  const startBoardInteraction = (event: any) => {
    const nativeEvent = event.evt as any
    const button = typeof nativeEvent.button === 'number' ? nativeEvent.button : 0
    if (button === 1 || button === 2 || nativeEvent.getModifierState?.('Space')) {
      startPan(event)
      return
    }
    if (button !== 0) return
    if (interactionMode === 'pan') {
      startPan(event)
      return
    }
    if (event.target !== event.target.getStage()) return
    if (interactionMode === 'box-select') {
      startSelection(event)
      return
    }
    event.evt.preventDefault()
    setSelectionBox(null)
    setSelectedTokenIds([])
    setSelectedTokenId('')
    setSelectedAssetId('')
    setSelectedSceneItemId('')
  }

  const movePan = (event: any) => {
    if (!panning) return
    setViewport(prev => ({
      ...prev,
      x: panning.originX + event.evt.clientX - panning.x,
      y: panning.originY + event.evt.clientY - panning.y,
    }))
  }

  const moveSelection = () => {
    if (!selectionBox) return
    const point = getBoardPointer()
    if (!point) return
    setSelectionBox(prev => prev ? { ...prev, endX: point.x, endY: point.y } : prev)
  }

  const moveBoardInteraction = (event: any) => {
    if (selectionBox) {
      moveSelection()
      return
    }
    movePan(event)
  }

  const endPan = () => {
    setPanning(null)
    const container = stageRef.current?.container()
    if (container) container.style.cursor = 'grab'
  }

  const endSelection = () => {
    if (!selectionBox) return
    const bounds = normalizeSelectionBox(selectionBox)
    const dragThreshold = 4 / viewport.zoom
    const selectedIds = bounds.width < dragThreshold && bounds.height < dragThreshold
      ? []
      : board.tokens
        .filter(token => (isSN || canMoveToken(token) || canEditToken(token)) && isTokenInsideSelection(token, bounds))
        .map(token => token.id)

    setSelectedTokenIds(selectedIds)
    setSelectionBox(null)
    const container = stageRef.current?.container()
    if (container) container.style.cursor = 'grab'
  }

  const endBoardInteraction = () => {
    if (selectionBox) {
      endSelection()
      return
    }
    endPan()
  }

  const resetView = () => setViewport({ x: size.width / 2, y: size.height / 2, zoom: 1 })

  const handleTokenImage = async (tokenId: string, file?: File) => {
    if (!file) return
    const data = await readImageFile(file)
    setCropEditor({
      tokenId,
      image: data.src,
      cropX: 0,
      cropY: 0,
      cropZoom: 1,
    })
  }

  const selectedTokenPortraitUrl = selectedToken
    ? getCharacterPortraitUrl(members.find(member => (
      member.characterId === selectedToken.characterId
      || member.character?.id === selectedToken.characterId
      || member.userId === selectedToken.ownerUserId
    ))?.character)
    : ''

  const applyCharacterPortraitToToken = (token: BoardToken) => {
    if (!selectedTokenPortraitUrl) return
    setCropEditor({
      tokenId: token.id,
      image: selectedTokenPortraitUrl,
      cropX: 0,
      cropY: 0,
      cropZoom: 1,
    })
  }

  useEffect(() => {
    if (cropEditor) return
    if ((!selectedToken || !canMoveToken(selectedToken)) && (!isSN || !selectedTokens.length)) return

    const handleDirectionKey = (event: KeyboardEvent) => {
      const direction = TOKEN_DIRECTION_KEYS[event.key]
      if (!direction) return

      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return

      event.preventDefault()
      if (selectedToken && canMoveToken(selectedToken)) {
        updateTokenDirection(selectedToken, direction)
        return
      }
      updateSelectedTokenDirection(direction)
    }

    window.addEventListener('keydown', handleDirectionKey)
    return () => window.removeEventListener('keydown', handleDirectionKey)
  }, [cropEditor, selectedToken, selectedTokenId, selectedTokenIds, selectedTokens.length, isSN])

  useEffect(() => {
    if (cropEditor || presetPickerOpen || scenePortraitPickerOpen) return

    const handleBoardShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return

      const withModifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const isPlus = event.key === '+' || event.key === '=' || event.code === 'NumpadAdd'
      const isMinus = event.key === '-' || event.code === 'NumpadSubtract'

      if (withModifier && isPlus) {
        event.preventDefault()
        resizeActiveSelection(8)
        return
      }

      if (withModifier && isMinus) {
        event.preventDefault()
        resizeActiveSelection(-8)
        return
      }

      if (withModifier && key === 'c') {
        event.preventDefault()
        copyActiveSelection()
        return
      }

      if (withModifier && key === 'v') {
        event.preventDefault()
        pasteClipboard()
        return
      }

      if (event.key === 'Delete') {
        event.preventDefault()
        deleteActiveSelection()
      }
    }

    window.addEventListener('keydown', handleBoardShortcut)
    return () => window.removeEventListener('keydown', handleBoardShortcut)
  }, [
    cropEditor,
    presetPickerOpen,
    scenePortraitPickerOpen,
    selectedToken,
    selectedTokenIds,
    selectedAsset,
    selectedAssetId,
    selectedSceneItem,
    selectedSceneItemId,
    selectedTokens,
    boardClipboard,
    board,
  ])

  useEffect(() => {
    const container = stageRef.current?.container()
    if (!container) return
    container.style.cursor = panning ? 'grabbing' : 'grab'
  }, [panning])

  return (
    <div className="battle-board" ref={containerRef}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onWheel={handleWheel}
        onContextMenu={(event: any) => event.evt.preventDefault()}
        onPointerDown={startBoardInteraction}
        onPointerMove={moveBoardInteraction}
        onPointerUp={endBoardInteraction}
        onPointerLeave={endBoardInteraction}
        onPointerCancel={endBoardInteraction}
      >
        <Layer ref={boardLayerRef}>
          <Group x={viewport.x} y={viewport.y} scaleX={viewport.zoom} scaleY={viewport.zoom}>
            <GridBackdrop width={size.width} height={size.height} grid={board.grid} viewport={viewport} />
            {underGridAssets.map(asset => (
              <AssetNode
                key={asset.id}
                asset={asset}
                selected={asset.id === selectedAssetId}
                canMove={canMoveAsset(asset) && interactionMode !== 'pan' && (!isCoarsePointer || interactionMode === 'token-drag')}
                viewportZoom={viewport.zoom}
                onSelect={() => {
                  setPanelTab('assets')
                  if (!isCoarsePointer) setPanelOpen(true)
                  setSelectedTokenIds([])
                  setSelectedTokenId('')
                  setSelectedSceneItemId('')
                  setSelectedAssetId(asset.id)
                }}
                snapPosition={(x, y) => ({ x: snap(x), y: snap(y) })}
                onDragEnd={(x, y) => updateAsset(asset.id, { x, y })}
              />
            ))}
            {board.grid.visible && (
              <GridLines width={size.width} height={size.height} grid={board.grid} viewport={viewport} />
            )}
            {visibleSceneItems.map(item => (
              <SceneItemNode
                key={item.id}
                item={item}
                selected={item.id === selectedSceneItemId}
                canMove={canMoveSceneItem(item) && interactionMode !== 'pan' && (!isCoarsePointer || interactionMode === 'token-drag')}
                viewportZoom={viewport.zoom}
                onSelect={() => {
                  setPanelTab('scene')
                  if (!isCoarsePointer) setPanelOpen(true)
                  setSelectedTokenIds([])
                  setSelectedTokenId('')
                  setSelectedAssetId('')
                  setSelectedSceneItemId(item.id)
                }}
                snapPosition={(x, y) => ({ x: snap(x), y: snap(y) })}
                onDragEnd={(x, y) => updateSceneItem(item.id, { x, y })}
              />
            ))}
            {selectionBounds && (
              <Rect
                x={selectionBounds.x}
                y={selectionBounds.y}
                width={selectionBounds.width}
                height={selectionBounds.height}
                fill="rgba(128, 230, 213, 0.12)"
                stroke="rgba(128, 230, 213, 0.92)"
                strokeWidth={1.5 / viewport.zoom}
                dash={[8 / viewport.zoom, 5 / viewport.zoom]}
                listening={false}
              />
            )}
            {sortedTokens.map(token => {
              const tone = resolveTokenTone(token, isSN, user.id)
              return (
                <TokenNode
                  key={token.id}
                  token={token}
                  selected={token.id === selectedTokenId || selectedTokenIdSet.has(token.id)}
                  canMove={canMoveToken(token) && interactionMode !== 'pan' && (!isCoarsePointer || interactionMode === 'token-drag')}
                  viewportZoom={viewport.zoom}
                  tone={tone}
                  attentionPulse={tone.attention ? attentionPulse : 0}
                  animationCandidates={presetTokenAnimationCandidates.get(token.id)}
                  animateSpine={liveAnimatedPresetTokenIdSet.has(token.id)}
                  onSelect={() => {
                    setPanelTab('tokens')
                    if (!isCoarsePointer) setPanelOpen(true)
                    setSelectedAssetId('')
                    setSelectedSceneItemId('')
                    setSelectedTokenIds([])
                    setSelectedTokenId(token.id)
                  }}
                  onDragStart={() => {
                    const draggingIds = selectedTokenIdSet.has(token.id) ? selectedTokenIds : [token.id]
                    startTokenDragAnimation(draggingIds)
                    if (!selectedTokenIdSet.has(token.id)) setSelectedTokenIds([])
                  }}
                  snapPosition={(x, y) => ({ x: snap(x), y: snap(y) })}
                  onDragMove={(x, y) => {
                    const previewPositions = getTokenMovePreviewPositions(token.id, x, y)
                    onTokenDragMove?.(previewPositions)
                    if (previewPositions.length > 1) queueLocalTokenDragPreview(previewPositions)
                  }}
                  onDragEnd={(x, y) => {
                    onTokenDragMove?.(getTokenMovePreviewPositions(token.id, x, y), { force: true })
                    moveTokenWithSelection(token.id, x, y)
                    endTokenDragAnimation([token.id])
                  }}
                />
              )
            })}
            {overGridAssets.map(asset => (
              <AssetNode
                key={asset.id}
                asset={asset}
                selected={asset.id === selectedAssetId}
                canMove={canMoveAsset(asset) && interactionMode !== 'pan' && (!isCoarsePointer || interactionMode === 'token-drag')}
                viewportZoom={viewport.zoom}
                onSelect={() => {
                  setPanelTab('assets')
                  if (!isCoarsePointer) setPanelOpen(true)
                  setSelectedTokenIds([])
                  setSelectedTokenId('')
                  setSelectedSceneItemId('')
                  setSelectedAssetId(asset.id)
                }}
                snapPosition={(x, y) => ({ x: snap(x), y: snap(y) })}
                onDragEnd={(x, y) => updateAsset(asset.id, { x, y })}
              />
            ))}
          </Group>
        </Layer>
      </Stage>

      <div className="battle-board-toolbar">
        <button className="btn btn-sm" onClick={() => setPanelOpen(open => !open)}>
          {panelOpen ? '收起管理' : 'TOKEN管理'}
        </button>
        {isSN && (
          <>
            <button className="btn btn-sm" onClick={addToken}>新建TOKEN</button>
            <button className="btn btn-sm" onClick={openPresetTokenPicker}>新建预设TOKEN</button>
            <label className="btn btn-sm" style={{ marginBottom: 0 }}>
              导入图片
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={event => {
                  const file = event.currentTarget.files?.[0]
                  if (file) void addAsset(file)
                  event.currentTarget.value = ''
                }}
              />
            </label>
          </>
        )}
        <button className="btn btn-sm btn-ghost" onClick={() => setViewport(prev => ({ ...prev, zoom: clamp(prev.zoom * 1.12, 0.35, 2.5) }))}>放大</button>
        <button className="btn btn-sm btn-ghost" onClick={() => setViewport(prev => ({ ...prev, zoom: clamp(prev.zoom * 0.88, 0.35, 2.5) }))}>缩小</button>
        <button className="btn btn-sm btn-ghost" onClick={resetView}>居中</button>
        <div className="battle-board-modebar" role="group" aria-label="棋盘触控模式">
          {([
            ['select', '选择'],
            ['token-drag', '拖动'],
            ['box-select', '框选'],
            ['pan', '平移'],
          ] as Array<[BoardInteractionMode, string]>).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`btn btn-sm ${interactionMode === mode ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setInteractionMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="battle-board-zoom">{Math.round(viewport.zoom * 100)}%</span>
      </div>

      {selectedTokens.length > 0 && (
        <div className="battle-selection-toolbar">
          <div className="battle-selection-head">
            <strong>框选 {selectedTokens.length} 个TOKEN</strong>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedTokenIds([])}>清除</button>
          </div>
          {isSN ? (
            <>
              <div className="battle-selection-row">
                <label>尺寸</label>
                <input
                  className="input"
                  type="number"
                  min={24}
                  max={180}
                  placeholder="多种"
                  value={selectedBatchSizeValue}
                  onChange={event => {
                    if (!event.target.value) return
                    updateSelectedTokenSize(Number(event.target.value))
                  }}
                />
              </div>
              <div className="battle-selection-row">
                <label>朝向</label>
                <div className="battle-selection-buttons">
                  {(['up', 'left', 'right', 'down'] as TokenDirection[]).map(direction => (
                    <button
                      key={direction}
                      className={`btn btn-sm ${selectedBatchDirection === direction ? 'btn-primary' : ''}`}
                      onClick={() => updateSelectedTokenDirection(direction)}
                    >
                      {TOKEN_DIRECTION_LABELS[direction]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="battle-selection-row">
                <label>移动</label>
                <div className="battle-selection-buttons">
                  <button className="btn btn-sm" onClick={() => moveSelectedTokensBy(0, -board.grid.size)}>上</button>
                  <button className="btn btn-sm" onClick={() => moveSelectedTokensBy(-board.grid.size, 0)}>左</button>
                  <button className="btn btn-sm" onClick={() => moveSelectedTokensBy(board.grid.size, 0)}>右</button>
                  <button className="btn btn-sm" onClick={() => moveSelectedTokensBy(0, board.grid.size)}>下</button>
                </div>
              </div>
            </>
          ) : (
            <span className="battle-selection-note">已框选目标，批量操作仅 SN 可用。</span>
          )}
        </div>
      )}

      {panelOpen && (
        <div className="battle-board-manager">
          <div className="battle-board-manager-header">
            <strong>战术棋盘管理</strong>
            <button className="btn btn-ghost btn-sm" onClick={() => setPanelOpen(false)}>关闭</button>
          </div>

          <div className="battle-board-tabs">
            <button className={`btn btn-sm ${panelTab === 'tokens' ? 'btn-primary' : ''}`} onClick={() => setPanelTab('tokens')}>TOKEN</button>
            <button className={`btn btn-sm ${panelTab === 'assets' ? 'btn-primary' : ''}`} onClick={() => setPanelTab('assets')}>图片</button>
            <button className={`btn btn-sm ${panelTab === 'scene' ? 'btn-primary' : ''}`} onClick={() => setPanelTab('scene')}>场景</button>
            <button className={`btn btn-sm ${panelTab === 'grid' ? 'btn-primary' : ''}`} onClick={() => setPanelTab('grid')}>网格</button>
          </div>

          {panelTab === 'tokens' && (
            <div className="battle-board-panel-body">
              {isSN && (
                <div className="battle-field">
                  <label>新TOKEN归属</label>
                  <select className="input" value={tokenOwnerId} onChange={event => setTokenOwnerId(event.target.value ? Number(event.target.value) : '')}>
                    <option value="">当前用户</option>
                    {members.map(member => (
                      <option key={member.id} value={member.userId}>
                        {member.user?.username || '玩家'}{member.character ? ` / ${member.character.name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {isSN && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={addToken} style={{ width: '100%' }}>新建TOKEN</button>
                  <button className="btn btn-sm" onClick={openPresetTokenPicker} style={{ width: '100%' }}>新建预设TOKEN</button>
                </>
              )}
              <div className="battle-list">
                {board.tokens.length === 0 && <p className="battle-empty">暂无TOKEN</p>}
                {board.tokens.map(token => {
                  const tone = resolveTokenTone(token, isSN, user.id)
                  return (
                  <button
                    key={token.id}
                    className={`battle-list-item ${selectedTokenId === token.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedAssetId('')
                      setSelectedSceneItemId('')
                      setSelectedTokenIds([])
                      setSelectedTokenId(token.id)
                    }}
                  >
                    <span
                      className="token-dot"
                      style={{ background: tone.core, borderColor: tone.border, boxShadow: `0 0 12px ${tone.core}` }}
                    />
                    <span className="battle-token-label"><b>{token.name}</b><em>{token.spine ? '预设' : tone.badge}</em></span>
                    <small>{token.locked ? '已锁定' : canMoveToken(token) ? '可移动' : '只读'}</small>
                  </button>
                  )
                })}
              </div>

              {selectedToken && (
                <div className="battle-editor token-inspector">
                  <div className="token-inspector-tabs">
                    <button
                      className={`btn btn-sm ${tokenInspectorTab === 'style' ? 'btn-primary' : 'btn-ghost'}`}
                      type="button"
                      onClick={() => setTokenInspectorTab('style')}
                    >
                      TOKEN样式
                    </button>
                    <button
                      className={`btn btn-sm ${tokenInspectorTab === 'attributes' ? 'btn-primary' : 'btn-ghost'}`}
                      type="button"
                      onClick={() => setTokenInspectorTab('attributes')}
                    >
                      TOKEN属性
                    </button>
                  </div>

                  {tokenInspectorTab === 'style' && (
                  <section className="token-inspector-section">
                    <div className="token-inspector-section-head">
                      <strong>TOKEN样式</strong>
                      <span>外观、显示和操纵设置</span>
                    </div>

                    <label>名称</label>
                    <input
                      className="input"
                      value={selectedToken.name}
                      disabled={!canEditToken(selectedToken)}
                      onChange={event => updateToken(selectedToken.id, { name: event.target.value })}
                    />
                    <div className="battle-row">
                      <div>
                        <label>尺寸</label>
                        <input
                          className="input"
                          type="number"
                          min={24}
                          max={180}
                          value={selectedToken.size}
                          disabled={!canEditToken(selectedToken)}
                          onChange={event => updateToken(selectedToken.id, { size: Number(event.target.value) })}
                        />
                      </div>
                      <div>
                        <label>图层</label>
                        <input
                          className="input"
                          type="number"
                          value={selectedToken.layer}
                          disabled={!canEditToken(selectedToken)}
                          onChange={event => updateToken(selectedToken.id, { layer: Number(event.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="battle-row">
                      <div>
                        <label>颜色</label>
                        <input
                          className="input"
                          type="color"
                          value={selectedToken.color}
                          disabled={!canEditToken(selectedToken)}
                          onChange={event => updateToken(selectedToken.id, { color: event.target.value })}
                        />
                      </div>
                      <div>
                        <label>状态</label>
                        <button
                          className={`btn btn-sm ${selectedToken.locked ? 'btn-danger' : ''}`}
                          disabled={!canEditToken(selectedToken)}
                          onClick={() => updateToken(selectedToken.id, { locked: !selectedToken.locked })}
                          style={{ width: '100%' }}
                        >
                          {selectedToken.locked ? '已锁定' : '可拖动'}
                        </button>
                      </div>
                    </div>

                    {selectedToken.spine && (
                      <div className="battle-field spine-token-editor">
                        <div className="battle-asset-scale-head">
                          <label>预设TOKEN</label>
                          <span>{selectedToken.spine.presetId || selectedToken.name}</span>
                        </div>
                        <div className="battle-row">
                          <div>
                            <label>动画</label>
                            <select
                              className="input"
                              value={selectedToken.spine.animation}
                              disabled={!canEditToken(selectedToken)}
                              onChange={event => updateToken(selectedToken.id, {
                                spine: { ...selectedToken.spine!, animation: event.target.value },
                              })}
                            >
                              {PRESET_TOKEN_ANIMATIONS.map(animation => (
                                <option key={animation} value={animation}>{animation}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label>显示倍率</label>
                            <input
                              className="input"
                              type="number"
                              min={0.8}
                              max={6}
                              step={0.05}
                              value={selectedToken.spine.viewportScale}
                              disabled={!canEditToken(selectedToken)}
                              onChange={event => updateToken(selectedToken.id, {
                                spine: { ...selectedToken.spine!, viewportScale: Number(event.target.value) },
                              })}
                            />
                          </div>
                        </div>
                        <div className="battle-row">
                          <div>
                            <label>水平偏移</label>
                            <input
                              className="input"
                              type="number"
                              value={selectedToken.spine.offsetX}
                              disabled={!canEditToken(selectedToken)}
                              onChange={event => updateToken(selectedToken.id, {
                                spine: { ...selectedToken.spine!, offsetX: Number(event.target.value) },
                              })}
                            />
                          </div>
                          <div>
                            <label>垂直偏移</label>
                            <input
                              className="input"
                              type="number"
                              value={selectedToken.spine.offsetY}
                              disabled={!canEditToken(selectedToken)}
                              onChange={event => updateToken(selectedToken.id, {
                                spine: { ...selectedToken.spine!, offsetY: Number(event.target.value) },
                              })}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <label>TOKEN图片</label>
                    <div className="battle-token-image-actions">
                      <button
                        className="btn btn-sm"
                        type="button"
                        disabled={!canEditToken(selectedToken) || !selectedTokenPortraitUrl}
                        onClick={() => applyCharacterPortraitToToken(selectedToken)}
                      >
                        使用角色立绘
                      </button>
                      <span>{selectedTokenPortraitUrl ? '可直接载入当前归属角色的立绘' : '当前角色没有可用立绘'}</span>
                    </div>
                    <input
                      className="input"
                      type="file"
                      accept="image/*"
                      disabled={!canEditToken(selectedToken)}
                      onChange={event => {
                        const file = event.currentTarget.files?.[0]
                        void handleTokenImage(selectedToken.id, file)
                        event.currentTarget.value = ''
                      }}
                    />
                    {selectedToken.image && (
                      <div className="token-crop-preview">
                        <img
                          src={selectedToken.image}
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            transform: `translate(${selectedToken.cropX}px, ${selectedToken.cropY}px) scale(${selectedToken.cropZoom})`,
                          }}
                        />
                      </div>
                    )}
                    {selectedToken.image && (
                      <button
                        className="btn btn-sm"
                        disabled={!canEditToken(selectedToken)}
                        onClick={() => setCropEditor({
                          tokenId: selectedToken.id,
                          image: selectedToken.image || '',
                          cropX: selectedToken.cropX,
                          cropY: selectedToken.cropY,
                          cropZoom: selectedToken.cropZoom,
                        })}
                      >
                        打开裁切窗口
                      </button>
                    )}

                    {isSN && (
                      <div className="battle-field">
                        <label>SN允许操纵</label>
                        <div className="battle-check-list">
                          {members.map(member => {
                            const checked = selectedToken.allowedUserIds.includes(member.userId)
                            return (
                              <label key={member.id} className="battle-check">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const allowedUserIds = checked
                                      ? selectedToken.allowedUserIds.filter(id => id !== member.userId)
                                      : [...selectedToken.allowedUserIds, member.userId]
                                    updateToken(selectedToken.id, { allowedUserIds })
                                  }}
                                />
                                <span>{member.user?.username || '玩家'}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div className="battle-actions">
                      <button className="btn btn-sm" disabled={!canEditToken(selectedToken)} onClick={() => updateToken(selectedToken.id, { layer: selectedToken.layer - 1 })}>下移图层</button>
                      <button className="btn btn-sm" disabled={!canEditToken(selectedToken)} onClick={() => updateToken(selectedToken.id, { layer: selectedToken.layer + 1 })}>上移图层</button>
                      <button className="btn btn-danger btn-sm" disabled={!canEditToken(selectedToken)} onClick={() => removeToken(selectedToken.id)}>删除</button>
                    </div>
                  </section>
                  )}

                  {tokenInspectorTab === 'attributes' && (
                  <section className="token-inspector-section token-inspector-section-attributes">
                    <div className="token-inspector-section-head">
                      <strong>TOKEN属性</strong>
                      <span>阵营、朝向和扩展属性</span>
                    </div>

                    <div className="battle-row">
                      <div>
                        <label>敌我属性</label>
                        <select
                          className="input"
                          value={selectedToken.disposition}
                          disabled={!canEditToken(selectedToken)}
                          onChange={event => {
                            const disposition = event.target.value as BoardToken['disposition']
                            updateToken(selectedToken.id, {
                              disposition,
                              attention: disposition === 'neutral' ? true : selectedToken.attention,
                              threatLevel: disposition === 'enemy' ? selectedToken.threatLevel : 'normal',
                            })
                          }}
                        >
                          <option value="player">我方</option>
                          <option value="enemy">敌方</option>
                          <option value="neutral">中立</option>
                        </select>
                      </div>
                      <div>
                        <label>{selectedToken.disposition === 'enemy' ? '威胁等级' : '提示状态'}</label>
                        {selectedToken.disposition === 'enemy' ? (
                          <select
                            className="input"
                            value={selectedToken.threatLevel}
                            disabled={!canEditToken(selectedToken)}
                            onChange={event => updateToken(selectedToken.id, { threatLevel: event.target.value as BoardToken['threatLevel'] })}
                          >
                            <option value="normal">普通</option>
                            <option value="high">高危</option>
                          </select>
                        ) : (
                          <button
                            className={`btn btn-sm ${selectedToken.attention ? 'btn-danger' : ''}`}
                            disabled={!canEditToken(selectedToken) || selectedToken.disposition !== 'neutral'}
                            onClick={() => updateToken(selectedToken.id, { attention: !selectedToken.attention })}
                            style={{ width: '100%' }}
                          >
                            {selectedToken.attention ? '提示开启' : '提示关闭'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="battle-field">
                      <div className="battle-asset-scale-head">
                        <label>朝向</label>
                        <span>方向键可调整：{TOKEN_DIRECTION_LABELS[selectedToken.direction]}</span>
                      </div>
                      <div className="battle-direction-pad">
                        <button
                          className={`btn btn-sm ${selectedToken.direction === 'up' ? 'btn-primary' : ''}`}
                          disabled={!canMoveToken(selectedToken)}
                          onClick={() => updateTokenDirection(selectedToken, 'up')}
                        >
                          上
                        </button>
                        <button
                          className={`btn btn-sm ${selectedToken.direction === 'left' ? 'btn-primary' : ''}`}
                          disabled={!canMoveToken(selectedToken)}
                          onClick={() => updateTokenDirection(selectedToken, 'left')}
                        >
                          左
                        </button>
                        <button
                          className={`btn btn-sm ${selectedToken.direction === 'right' ? 'btn-primary' : ''}`}
                          disabled={!canMoveToken(selectedToken)}
                          onClick={() => updateTokenDirection(selectedToken, 'right')}
                        >
                          右
                        </button>
                        <button
                          className={`btn btn-sm ${selectedToken.direction === 'down' ? 'btn-primary' : ''}`}
                          disabled={!canMoveToken(selectedToken)}
                          onClick={() => updateTokenDirection(selectedToken, 'down')}
                        >
                          下
                        </button>
                      </div>
                    </div>

                    <div className="battle-field token-vitals-editor">
                      <div className="battle-asset-scale-head">
                        <label>属性条</label>
                        <span>显示在 TOKEN 下方</span>
                      </div>
                      {[
                        { key: 'hp', maxKey: 'hpMax', label: '生命值', color: '#e85249' },
                        { key: 'sp', maxKey: 'spMax', label: '技力', color: '#9be58d' },
                        { key: 'stamina', maxKey: 'staminaMax', label: '耐力', color: '#4ea7ff' },
                      ].map(stat => (
                        <div className="token-vital-editor-row" key={stat.key}>
                          <span style={{ borderColor: stat.color }}>{stat.label}</span>
                          <input
                            className="input"
                            type="number"
                            min={0}
                            value={selectedToken[stat.key as 'hp' | 'sp' | 'stamina']}
                            disabled={!canEditToken(selectedToken)}
                            onChange={event => updateToken(selectedToken.id, {
                              [stat.key]: clamp(Number(event.target.value) || 0, 0, 9999),
                            } as Partial<BoardToken>)}
                          />
                          <em>/</em>
                          <input
                            className="input"
                            type="number"
                            min={1}
                            value={selectedToken[stat.maxKey as 'hpMax' | 'spMax' | 'staminaMax']}
                            disabled={!canEditToken(selectedToken)}
                            onChange={event => {
                              const maxValue = clamp(Number(event.target.value) || 1, 1, 9999)
                              const currentKey = stat.key as 'hp' | 'sp' | 'stamina'
                              updateToken(selectedToken.id, {
                                [stat.maxKey]: maxValue,
                                [currentKey]: clamp(selectedToken[currentKey], 0, maxValue),
                              } as Partial<BoardToken>)
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                  )}
                </div>
              )}
            </div>
          )}

          {panelTab === 'assets' && (
            <div className="battle-board-panel-body">
              {isSN && (
                <label className="btn btn-primary btn-sm" style={{ width: '100%', marginBottom: 0 }}>
                  导入棋盘图片
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={event => {
                      const file = event.currentTarget.files?.[0]
                      if (file) void addAsset(file)
                      event.currentTarget.value = ''
                    }}
                  />
                </label>
              )}
              <div className="battle-list">
                {board.assets.length === 0 && <p className="battle-empty">暂无图片</p>}
                {board.assets.map(asset => (
                  <button
                    key={asset.id}
                    className={`battle-list-item ${selectedAssetId === asset.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedTokenIds([])
                      setSelectedTokenId('')
                      setSelectedSceneItemId('')
                      setSelectedAssetId(asset.id)
                    }}
                  >
                    <span>{asset.name}</span>
                    <small>{asset.locked ? '已锁定' : canMoveAsset(asset) ? '可移动' : '只读'}</small>
                  </button>
                ))}
              </div>

              {selectedAsset && (
                <div className="battle-editor">
                  <label>图片名称</label>
                  <input
                    className="input"
                    value={selectedAsset.name}
                    disabled={!canEditAsset(selectedAsset)}
                    onChange={event => updateAsset(selectedAsset.id, { name: event.target.value })}
                  />
                  <div className="battle-field">
                    <div className="battle-asset-scale-head">
                      <label>图片缩放</label>
                      <span>{selectedAssetScale}%</span>
                    </div>
                    <input
                      className="input"
                      type="range"
                      min={5}
                      max={300}
                      step={1}
                      value={selectedAssetScale}
                      disabled={!canEditAsset(selectedAsset)}
                      onChange={event => updateAssetScale(selectedAsset.id, Number(event.target.value), false)}
                      onMouseUp={event => updateAssetScale(selectedAsset.id, Number(event.currentTarget.value))}
                      onTouchEnd={event => updateAssetScale(selectedAsset.id, Number(event.currentTarget.value))}
                    />
                    <div className="battle-scale-actions">
                      <button className="btn btn-sm" disabled={!canEditAsset(selectedAsset)} onClick={() => updateAssetScale(selectedAsset.id, selectedAssetScale - 10)}>-10%</button>
                      <button className="btn btn-sm" disabled={!canEditAsset(selectedAsset)} onClick={() => updateAssetScale(selectedAsset.id, 100)}>100%</button>
                      <button className="btn btn-sm" disabled={!canEditAsset(selectedAsset)} onClick={() => updateAssetScale(selectedAsset.id, selectedAssetScale + 10)}>+10%</button>
                    </div>
                  </div>
                  <div className="battle-row">
                    <div>
                      <label>宽度</label>
                      <input
                        className="input"
                        type="number"
                        min={40}
                        value={selectedAsset.width}
                        disabled={!canEditAsset(selectedAsset)}
                        onChange={event => updateAssetSize(selectedAsset.id, Number(event.target.value), selectedAsset.height)}
                      />
                    </div>
                    <div>
                      <label>高度</label>
                      <input
                        className="input"
                        type="number"
                        min={40}
                        value={selectedAsset.height}
                        disabled={!canEditAsset(selectedAsset)}
                        onChange={event => updateAssetSize(selectedAsset.id, selectedAsset.width, Number(event.target.value))}
                      />
                    </div>
                  </div>
                  <div className="battle-row">
                    <div>
                      <label>图层</label>
                      <input
                        className="input"
                        type="number"
                        value={selectedAsset.layer}
                        disabled={!canEditAsset(selectedAsset)}
                        onChange={event => updateAsset(selectedAsset.id, { layer: Number(event.target.value) })}
                      />
                    </div>
                    <div>
                      <label>透明度</label>
                      <input
                        className="input"
                        type="number"
                        min={0.1}
                        max={1}
                        step={0.1}
                        value={selectedAsset.opacity}
                        disabled={!canEditAsset(selectedAsset)}
                        onChange={event => updateAsset(selectedAsset.id, { opacity: Number(event.target.value) })}
                      />
                    </div>
                  </div>
                  <button
                    className={`btn btn-sm ${selectedAsset.locked ? 'btn-danger' : ''}`}
                    disabled={!canEditAsset(selectedAsset)}
                    onClick={() => updateAsset(selectedAsset.id, { locked: !selectedAsset.locked })}
                    style={{ width: '100%' }}
                  >
                    {selectedAsset.locked ? '已锁定' : '可拖动'}
                  </button>
                  <div className="battle-actions">
                    <button className="btn btn-sm" disabled={!canEditAsset(selectedAsset)} onClick={() => updateAsset(selectedAsset.id, { layer: selectedAsset.layer - 1 })}>下移图层</button>
                    <button className="btn btn-sm" disabled={!canEditAsset(selectedAsset)} onClick={() => updateAsset(selectedAsset.id, { layer: selectedAsset.layer + 1 })}>上移图层</button>
                    <button className="btn btn-danger btn-sm" disabled={!canEditAsset(selectedAsset)} onClick={() => removeAsset(selectedAsset.id)}>删除</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {panelTab === 'scene' && (
            <div className="battle-board-panel-body scene-panel">
              <div className="scene-layer-switch">
                <div>
                  <strong>场景层</strong>
                  <span>{board.scene.enabled ? '已覆盖在地图上方' : '当前不显示'}</span>
                </div>
                <label className="scene-toggle" title="显示或隐藏场景层">
                  <input
                    type="checkbox"
                    checked={board.scene.enabled}
                    disabled={!isSN}
                    onChange={event => updateScene({ enabled: event.target.checked })}
                  />
                  <span aria-hidden="true" />
                </label>
              </div>

              {isSN ? (
                <div className="scene-add-actions">
                  <label className="btn btn-primary btn-sm">
                    导入背景图
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={event => {
                        const file = event.currentTarget.files?.[0]
                        if (file) void addSceneImage(file, 'background')
                        event.currentTarget.value = ''
                      }}
                    />
                  </label>
                  <button className="btn btn-sm" onClick={() => setScenePortraitPickerOpen(true)}>选择角色 / NPC</button>
                  <label className="btn btn-sm">
                    上传自定义立绘
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={event => {
                        const file = event.currentTarget.files?.[0]
                        if (file) void addSceneImage(file, 'portrait')
                        event.currentTarget.value = ''
                      }}
                    />
                  </label>
                </div>
              ) : (
                <p className="battle-empty scene-readonly-note">只有SN可以切换和编辑场景层。</p>
              )}

              <div className="battle-list scene-item-list">
                {board.scene.items.length === 0 && <p className="battle-empty">暂无场景素材</p>}
                {[...board.scene.items].sort((a, b) => b.layer - a.layer).map(item => (
                  <button
                    key={item.id}
                    className={`battle-list-item scene-list-item ${selectedSceneItemId === item.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedTokenIds([])
                      setSelectedTokenId('')
                      setSelectedAssetId('')
                      setSelectedSceneItemId(item.id)
                    }}
                  >
                    <img src={item.src} alt="" loading="lazy" />
                    <span>
                      <b>{item.name}</b>
                      <em>{item.kind === 'background' ? '背景' : item.kind === 'npc' ? 'NPC' : '角色立绘'}</em>
                    </span>
                    <small>{!item.visible ? '已隐藏' : item.locked ? '已锁定' : isSN ? '可编辑' : '只读'}</small>
                  </button>
                ))}
              </div>

              {selectedSceneItem && (
                <div className="battle-editor scene-item-editor">
                  <label>素材名称</label>
                  <input
                    className="input"
                    value={selectedSceneItem.name}
                    disabled={!canEditSceneItem(selectedSceneItem)}
                    onChange={event => updateSceneItem(selectedSceneItem.id, { name: event.target.value })}
                  />
                  <div className="battle-row">
                    <div>
                      <label>素材类型</label>
                      <select
                        className="input"
                        value={selectedSceneItem.kind}
                        disabled={!canEditSceneItem(selectedSceneItem)}
                        onChange={event => updateSceneItem(selectedSceneItem.id, { kind: event.target.value as BoardSceneItemKind })}
                      >
                        <option value="background">背景</option>
                        <option value="portrait">角色立绘</option>
                        <option value="npc">NPC</option>
                      </select>
                    </div>
                    <div>
                      <label>图层</label>
                      <input
                        className="input"
                        type="number"
                        value={selectedSceneItem.layer}
                        disabled={!canEditSceneItem(selectedSceneItem)}
                        onChange={event => updateSceneItem(selectedSceneItem.id, { layer: Number(event.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="battle-field">
                    <div className="battle-asset-scale-head">
                      <label>素材缩放</label>
                      <span>{selectedSceneItemScale}%</span>
                    </div>
                    <input
                      className="input"
                      type="range"
                      min={5}
                      max={400}
                      step={1}
                      value={selectedSceneItemScale}
                      disabled={!canEditSceneItem(selectedSceneItem)}
                      onChange={event => updateSceneItemScale(selectedSceneItem.id, Number(event.target.value), false)}
                      onMouseUp={event => updateSceneItemScale(selectedSceneItem.id, Number(event.currentTarget.value))}
                      onTouchEnd={event => updateSceneItemScale(selectedSceneItem.id, Number(event.currentTarget.value))}
                    />
                    <div className="battle-scale-actions">
                      <button className="btn btn-sm" disabled={!canEditSceneItem(selectedSceneItem)} onClick={() => updateSceneItemScale(selectedSceneItem.id, selectedSceneItemScale - 10)}>-10%</button>
                      <button className="btn btn-sm" disabled={!canEditSceneItem(selectedSceneItem)} onClick={() => updateSceneItemScale(selectedSceneItem.id, 100)}>100%</button>
                      <button className="btn btn-sm" disabled={!canEditSceneItem(selectedSceneItem)} onClick={() => updateSceneItemScale(selectedSceneItem.id, selectedSceneItemScale + 10)}>+10%</button>
                    </div>
                  </div>
                  <div className="battle-row">
                    <div>
                      <label>宽度</label>
                      <input
                        className="input"
                        type="number"
                        min={40}
                        value={selectedSceneItem.width}
                        disabled={!canEditSceneItem(selectedSceneItem)}
                        onChange={event => updateSceneItemSize(selectedSceneItem.id, Number(event.target.value), selectedSceneItem.height)}
                      />
                    </div>
                    <div>
                      <label>高度</label>
                      <input
                        className="input"
                        type="number"
                        min={40}
                        value={selectedSceneItem.height}
                        disabled={!canEditSceneItem(selectedSceneItem)}
                        onChange={event => updateSceneItemSize(selectedSceneItem.id, selectedSceneItem.width, Number(event.target.value))}
                      />
                    </div>
                  </div>
                  <div className="battle-row">
                    <div>
                      <label>X 坐标</label>
                      <input
                        className="input"
                        type="number"
                        value={Math.round(selectedSceneItem.x)}
                        disabled={!canEditSceneItem(selectedSceneItem)}
                        onChange={event => updateSceneItem(selectedSceneItem.id, { x: Number(event.target.value) })}
                      />
                    </div>
                    <div>
                      <label>Y 坐标</label>
                      <input
                        className="input"
                        type="number"
                        value={Math.round(selectedSceneItem.y)}
                        disabled={!canEditSceneItem(selectedSceneItem)}
                        onChange={event => updateSceneItem(selectedSceneItem.id, { y: Number(event.target.value) })}
                      />
                    </div>
                  </div>
                  <label>透明度</label>
                  <input
                    className="input"
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={selectedSceneItem.opacity}
                    disabled={!canEditSceneItem(selectedSceneItem)}
                    onChange={event => updateSceneItem(selectedSceneItem.id, { opacity: Number(event.target.value) }, false)}
                    onMouseUp={event => updateSceneItem(selectedSceneItem.id, { opacity: Number(event.currentTarget.value) })}
                    onTouchEnd={event => updateSceneItem(selectedSceneItem.id, { opacity: Number(event.currentTarget.value) })}
                  />
                  <div className="scene-item-toggles">
                    <label className="battle-check">
                      <input
                        type="checkbox"
                        checked={selectedSceneItem.visible}
                        disabled={!canEditSceneItem(selectedSceneItem)}
                        onChange={event => updateSceneItem(selectedSceneItem.id, { visible: event.target.checked })}
                      />
                      <span>显示素材</span>
                    </label>
                    <label className="battle-check">
                      <input
                        type="checkbox"
                        checked={selectedSceneItem.locked}
                        disabled={!canEditSceneItem(selectedSceneItem)}
                        onChange={event => updateSceneItem(selectedSceneItem.id, { locked: event.target.checked })}
                      />
                      <span>锁定位置</span>
                    </label>
                  </div>
                  <div className="battle-actions">
                    <button className="btn btn-sm" disabled={!canEditSceneItem(selectedSceneItem)} onClick={() => updateSceneItem(selectedSceneItem.id, { layer: selectedSceneItem.layer - 1 })}>下移</button>
                    <button className="btn btn-sm" disabled={!canEditSceneItem(selectedSceneItem)} onClick={() => updateSceneItem(selectedSceneItem.id, { layer: selectedSceneItem.layer + 1 })}>上移</button>
                    <button className="btn btn-danger btn-sm" disabled={!canEditSceneItem(selectedSceneItem)} onClick={() => removeSceneItem(selectedSceneItem.id)}>删除</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {panelTab === 'grid' && (
            <div className="battle-board-panel-body">
              {!isSN && (
                <p className="battle-empty" style={{ padding: 0, textAlign: 'left' }}>
                  只有SN可以编辑网格设置。
                </p>
              )}
              <div className="battle-row">
                <div>
                  <label>格子大小</label>
                  <input className="input" type="number" min={24} max={160} value={board.grid.size}
                    disabled={!isSN}
                    onChange={event => updateGrid({ size: Number(event.target.value) })} />
                </div>
                <div>
                  <label>线条粗细</label>
                  <input className="input" type="number" min={1} max={8} value={board.grid.lineWidth}
                    disabled={!isSN}
                    onChange={event => updateGrid({ lineWidth: Number(event.target.value) })} />
                </div>
              </div>
              <label className="battle-check">
                <input type="checkbox" checked={board.grid.visible} disabled={!isSN} onChange={event => updateGrid({ visible: event.target.checked })} />
                <span>显示网格线</span>
              </label>
              <label>网格颜色</label>
              <input className="input" type="color" value={board.grid.color} disabled={!isSN} onChange={event => updateGrid({ color: event.target.value })} />
              <label>线条样式</label>
              <div className="battle-segment">
                <button className={`btn btn-sm ${board.grid.lineStyle === 'solid' ? 'btn-primary' : ''}`} disabled={!isSN} onClick={() => updateGrid({ lineStyle: 'solid' })}>实线</button>
                <button className={`btn btn-sm ${board.grid.lineStyle === 'dashed' ? 'btn-primary' : ''}`} disabled={!isSN} onClick={() => updateGrid({ lineStyle: 'dashed' })}>虚线</button>
              </div>
              <label className="battle-check" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={board.snapToGrid} disabled={!isSN} onChange={event => updateBoard(prev => ({ ...prev, snapToGrid: event.target.checked }))} />
                <span>拖动时吸附网格</span>
              </label>
            </div>
          )}
        </div>
      )}

      <PresetTokenPicker
        open={presetPickerOpen}
        presets={filteredPresetTokens}
        search={presetSearch}
        loading={presetTokensLoading}
        error={presetTokensError}
        onSearch={setPresetSearch}
        onSelect={addPresetToken}
        onSelectBatch={addPresetTokensBatch}
        onClose={() => setPresetPickerOpen(false)}
      />

      <ScenePortraitPicker
        open={scenePortraitPickerOpen}
        options={filteredScenePortraitOptions}
        search={scenePortraitSearch}
        onSearch={setScenePortraitSearch}
        onSelect={option => { void addScenePortraitOption(option) }}
        onClose={() => setScenePortraitPickerOpen(false)}
      />

      {cropEditor && (
        <TokenCropModal
          token={board.tokens.find(token => token.id === cropEditor.tokenId) || selectedToken || normalizeToken({ id: cropEditor.tokenId })}
          draft={cropEditor}
          onCancel={() => setCropEditor(null)}
          onApply={nextDraft => {
            updateToken(nextDraft.tokenId, {
              image: nextDraft.image,
              cropX: nextDraft.cropX,
              cropY: nextDraft.cropY,
              cropZoom: nextDraft.cropZoom,
            })
            setCropEditor(null)
          }}
        />
      )}
    </div>
  )
}

