import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { createCharacter, deleteCharacter, getCharacters, updateCharacter } from '../api'
import {
  DEFAULT_CHARACTER_CARD_VISUAL,
  normalizeCharacterCardVNext,
  normalizeCharacterCardVisual,
  writeCharacterCardVisual,
  type CharacterCardVisual,
} from '../types/characterCard'
import {
  getElitePhaseIcon,
  getLevelIcon,
  getProfessionIcon,
  getSubProfessionIcon,
} from '../utils/characterVisuals'

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function normalizeVisual(rawData: unknown): CharacterCardVisual {
  const visual = normalizeCharacterCardVisual(rawData)
  return {
    portraitX: clamp(visual.portraitX, -180, 180),
    portraitY: clamp(visual.portraitY, -180, 180),
    portraitScale: clamp(visual.portraitScale, 0.45, 2.2),
  }
}

function getPortraitUrl(character: any) {
  return normalizeCharacterCardVNext(character.rawData).mainCard.portrait.imageUrl
}

function CharacterGalleryCard({
  character,
  selected,
  editMode,
  onOpen,
  onSelect,
  onDelete,
}: {
  character: any
  selected: boolean
  editMode: boolean
  onOpen: () => void
  onSelect: () => void
  onDelete: () => void
}) {
  const portraitUrl = getPortraitUrl(character)
  const visual = normalizeVisual(character.rawData)
  const professionIcon = getProfessionIcon(character.profession)
  const subProfessionIcon = getSubProfessionIcon(character.subProfession)
  const eliteIcon = getElitePhaseIcon(character.elitePhase)
  const levelIcon = getLevelIcon(character.level)
  const displayName = character.name || '未命名角色'
  const artStyle: CSSProperties = {
    width: `${360 * visual.portraitScale}px`,
    left: `calc(50% + ${visual.portraitX * 0.56}px)`,
    bottom: `${-12 + visual.portraitY * 0.56}px`,
  }

  const handleClick = () => {
    if (editMode) onSelect()
    else onOpen()
  }

  return (
    <article className={`character-gallery-card ${selected ? 'selected' : ''}`} onClick={handleClick}>
      <div className="character-gallery-hex" />
      {portraitUrl ? (
        <img className="character-gallery-art" src={portraitUrl} alt={`${displayName}立绘`} style={artStyle} />
      ) : (
        <div className="character-gallery-empty">
          <span>PORTRAIT</span>
          <b>未导入立绘</b>
        </div>
      )}
      <div className="character-gallery-scan" />

      <div className="character-gallery-class-icon" title={character.profession || '未设置职业'}>
        {professionIcon ? <img src={professionIcon} alt="" aria-hidden="true" /> : <span>{String(character.profession || '?').slice(0, 1)}</span>}
      </div>

      <div className="character-gallery-rank">
        <span className="character-gallery-elite">
          <img src={eliteIcon} alt="" aria-hidden="true" />
        </span>
        <span className="character-gallery-level">
          <img src={levelIcon} alt="" aria-hidden="true" />
          <b>Lv.{character.level || 1}</b>
        </span>
      </div>

      <div className="character-gallery-nameplate">
        <span>ALTS-{String(character.id || 0).padStart(3, '0')}</span>
        <strong>{displayName}</strong>
        <em>{[character.race, character.origin].filter(Boolean).join(' / ') || '档案待补全'}</em>
      </div>

      <div className="character-gallery-footer">
        <span>
          {subProfessionIcon && <img src={subProfessionIcon} alt="" aria-hidden="true" />}
          {character.subProfession || '未设置子职业'}
        </span>
        <button
          className="character-gallery-delete"
          type="button"
          onClick={event => {
            event.stopPropagation()
            onDelete()
          }}
        >
          删除
        </button>
      </div>

      {editMode && (
        <div className="character-gallery-edit-mask">
          <span>{selected ? '正在编辑立绘' : '选择此角色'}</span>
        </div>
      )}
    </article>
  )
}

export default function Characters() {
  const [chars, setChars] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createStatus, setCreateStatus] = useState('')
  const [editPortraitMode, setEditPortraitMode] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null)
  const [portraitSaveStatus, setPortraitSaveStatus] = useState('')
  const portraitSaveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const portraitStatusTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const portraitSaveVersionRef = useRef(0)
  const portraitPendingSaveRef = useRef<{
    characterId: number
    rawData: any
    version: number
  } | null>(null)
  const navigate = useNavigate()

  useEffect(() => { loadChars() }, [])

  const loadChars = async () => {
    try {
      setLoading(true)
      const data = await getCharacters()
      setChars(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    setCreating(true)
    setCreateStatus('')
    try {
      const created = await createCharacter({ name: '未命名角色' })
      const characterId = created?.id || created?.character?.id || created?.characterId
      if (!characterId) {
        throw new Error('创建接口未返回角色 ID，请确认后端服务已重启')
      }
      navigate(`/characters/${characterId}`, { state: { startEditing: true } })
    } catch (err: any) {
      setCreateStatus(`创建失败：${err.response?.data?.error || err.message}`)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`确定删除角色「${name || '未命名角色'}」？此操作不可撤销。`)) return
    try {
      await deleteCharacter(id)
      setChars(prev => prev.filter(character => character.id !== id))
      if (selectedCharacterId === id) setSelectedCharacterId(null)
    } catch (err) {
      console.error(err)
    }
  }

  const selectedCharacter = chars.find(character => character.id === selectedCharacterId) || null
  const selectedVisual = selectedCharacter ? normalizeVisual(selectedCharacter.rawData) : DEFAULT_CHARACTER_CARD_VISUAL

  async function persistPortraitVisual(
    pending: { characterId: number; rawData: any; version: number },
    automatic = true,
  ) {
    if (portraitSaveTimerRef.current != null) {
      window.clearTimeout(portraitSaveTimerRef.current)
      portraitSaveTimerRef.current = null
    }
    setPortraitSaveStatus(automatic ? '正在自动保存立绘...' : '正在保存立绘...')
    try {
      const updated = await updateCharacter(pending.characterId, { rawData: pending.rawData })
      if (portraitPendingSaveRef.current?.version !== pending.version) return
      portraitPendingSaveRef.current = null
      setChars(prev => prev.map(character => (
        character.id === pending.characterId ? { ...character, ...updated } : character
      )))
      setPortraitSaveStatus(automatic ? '立绘已自动保存' : '立绘设置已保存')
      if (portraitStatusTimerRef.current != null) window.clearTimeout(portraitStatusTimerRef.current)
      portraitStatusTimerRef.current = window.setTimeout(() => setPortraitSaveStatus(''), 1800)
    } catch (err: any) {
      if (portraitPendingSaveRef.current?.version !== pending.version) return
      setPortraitSaveStatus(`自动保存失败：${err.response?.data?.error || err.message}`)
    }
  }

  const schedulePortraitSave = (characterId: number, rawData: any) => {
    const pending = {
      characterId,
      rawData,
      version: ++portraitSaveVersionRef.current,
    }
    portraitPendingSaveRef.current = pending
    if (portraitSaveTimerRef.current != null) window.clearTimeout(portraitSaveTimerRef.current)
    setPortraitSaveStatus('等待自动保存...')
    portraitSaveTimerRef.current = window.setTimeout(() => {
      portraitSaveTimerRef.current = null
      void persistPortraitVisual(pending)
    }, 700)
  }

  const togglePortraitMode = () => {
    if (editPortraitMode && portraitPendingSaveRef.current) {
      void persistPortraitVisual(portraitPendingSaveRef.current)
    }
    setEditPortraitMode(prev => !prev)
    if (editPortraitMode) setSelectedCharacterId(null)
  }

  const selectCharacterForPortrait = (characterId: number) => {
    if (portraitPendingSaveRef.current && portraitPendingSaveRef.current.characterId !== characterId) {
      void persistPortraitVisual(portraitPendingSaveRef.current)
    }
    setSelectedCharacterId(characterId)
  }

  const updatePortraitVisual = (patch: Partial<CharacterCardVisual>) => {
    if (!selectedCharacter) return
    const nextVisual = normalizeVisual(writeCharacterCardVisual(selectedCharacter.rawData, { ...selectedVisual, ...patch }))
    const nextRawData = writeCharacterCardVisual(selectedCharacter.rawData, nextVisual)
    setChars(prev => prev.map(character => (
      character.id === selectedCharacter.id ? { ...character, rawData: nextRawData } : character
    )))
    schedulePortraitSave(selectedCharacter.id, nextRawData)
  }

  const resetPortraitVisual = () => {
    if (!selectedCharacter) return
    const nextRawData = writeCharacterCardVisual(selectedCharacter.rawData, DEFAULT_CHARACTER_CARD_VISUAL)
    setChars(prev => prev.map(character => (
      character.id === selectedCharacter.id ? { ...character, rawData: nextRawData } : character
    )))
    schedulePortraitSave(selectedCharacter.id, nextRawData)
  }

  const savePortraitVisual = () => {
    if (!selectedCharacter) return
    const pending = portraitPendingSaveRef.current || {
      characterId: selectedCharacter.id,
      rawData: selectedCharacter.rawData,
      version: ++portraitSaveVersionRef.current,
    }
    portraitPendingSaveRef.current = pending
    void persistPortraitVisual(pending, false)
  }

  useEffect(() => () => {
    if (portraitSaveTimerRef.current != null) window.clearTimeout(portraitSaveTimerRef.current)
    if (portraitStatusTimerRef.current != null) window.clearTimeout(portraitStatusTimerRef.current)
  }, [])

  return (
    <>
      <div className="top-header">
        <span className="page-title">角色卡</span>
        <div className="spacer" />
        <button
          className={`btn ${editPortraitMode ? 'btn-primary' : 'btn-ghost'}`}
          type="button"
          onClick={togglePortraitMode}
        >
          编辑立绘
        </button>
        <button className="btn btn-primary" type="button" onClick={handleCreate} disabled={creating}>
          {creating ? '创建中...' : '新建角色卡'}
        </button>
      </div>

      <div className="page-content character-gallery-page">
        {createStatus && (
          <div className="character-gallery-status">
            {createStatus}
          </div>
        )}

        {editPortraitMode && (
          <section className="character-portrait-editor-panel">
            <div>
              <strong>立绘画面编辑</strong>
              <span>{selectedCharacter ? `当前角色：${selectedCharacter.name || '未命名角色'}` : '选择下方角色卡后调整立绘位置和缩放'}</span>
            </div>
            <label>
              <span>水平位置</span>
              <input
                type="range"
                min="-180"
                max="180"
                value={selectedVisual.portraitX}
                disabled={!selectedCharacter}
                onChange={event => updatePortraitVisual({ portraitX: Number(event.target.value) })}
              />
              <b>{selectedVisual.portraitX}px</b>
            </label>
            <label>
              <span>垂直位置</span>
              <input
                type="range"
                min="-180"
                max="180"
                value={selectedVisual.portraitY}
                disabled={!selectedCharacter}
                onChange={event => updatePortraitVisual({ portraitY: Number(event.target.value) })}
              />
              <b>{selectedVisual.portraitY}px</b>
            </label>
            <label>
              <span>缩放倍率</span>
              <input
                type="range"
                min="0.45"
                max="2.2"
                step="0.05"
                value={selectedVisual.portraitScale}
                disabled={!selectedCharacter}
                onChange={event => updatePortraitVisual({ portraitScale: Number(event.target.value) })}
              />
              <b>{selectedVisual.portraitScale.toFixed(2)}x</b>
            </label>
            <div className="character-portrait-editor-actions">
              <span>{portraitSaveStatus}</span>
              <button className="btn btn-ghost btn-sm" type="button" disabled={!selectedCharacter} onClick={resetPortraitVisual}>重置</button>
              <button className="btn btn-primary btn-sm" type="button" disabled={!selectedCharacter} onClick={savePortraitVisual}>立即保存</button>
            </div>
          </section>
        )}

        {loading ? (
          <div className="loading-page">
            <div className="spinner" />
            <span>加载角色卡...</span>
          </div>
        ) : chars.length === 0 ? (
          <div className="character-gallery-empty-state">
            <span>ALTS</span>
            <p>暂无角色卡，点击上方按钮新建角色卡</p>
            <small>也可以在角色卡编辑页面右上角导入 Excel 角色卡</small>
          </div>
        ) : (
          <div className="character-gallery-grid">
            {chars.map(character => (
              <CharacterGalleryCard
                key={character.id}
                character={character}
                selected={selectedCharacterId === character.id}
                editMode={editPortraitMode}
                onOpen={() => navigate(`/characters/${character.id}`)}
                onSelect={() => selectCharacterForPortrait(character.id)}
                onDelete={() => handleDelete(character.id, character.name)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
