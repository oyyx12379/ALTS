import type { ChangeEvent, CSSProperties } from 'react'
import {
  normalizeCharacterCardVNext,
  normalizeCharacterCardVisual,
  writeCharacterCardVNext,
  writeCharacterCardVisual,
  DEFAULT_CHARACTER_CARD_VISUAL,
  type CharacterCardVisual,
} from '../types/characterCard'
import {
  getElitePhaseIcon,
  getLevelIcon,
  getProfessionIcon,
  getSubProfessionIcon,
} from '../utils/characterVisuals'

type CharacterProfileCardProps = {
  data: any
  editing: boolean
  onChange: (nextData: any) => void
}

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

export default function CharacterProfileCard({ data, editing, onChange }: CharacterProfileCardProps) {
  const card = normalizeCharacterCardVNext(data.rawData)
  const visual = normalizeVisual(data.rawData)
  const portraitUrl = card.mainCard.portrait.imageUrl
  const professionIcon = getProfessionIcon(data.profession)
  const subProfessionIcon = getSubProfessionIcon(data.subProfession)
  const eliteIcon = getElitePhaseIcon(data.elitePhase)
  const levelIcon = getLevelIcon(data.level)
  const displayName = data.name || '未命名角色'

  const artStyle: CSSProperties = {
    width: `${590 * visual.portraitScale}px`,
    left: `calc(50% + ${visual.portraitX}px)`,
    bottom: `${-26 + visual.portraitY}px`,
  }

  const updateVisual = (patch: Partial<CharacterCardVisual>) => {
    const nextVisual = normalizeVisual(writeCharacterCardVisual(data.rawData, { ...visual, ...patch }))
    onChange({
      ...data,
      rawData: writeCharacterCardVisual(data.rawData, nextVisual),
    })
  }

  const resetVisual = () => {
    onChange({
      ...data,
      rawData: writeCharacterCardVisual(data.rawData, DEFAULT_CHARACTER_CARD_VISUAL),
    })
  }

  const handlePortraitUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      onChange({
        ...data,
        rawData: writeCharacterCardVNext(data.rawData, {
          ...card,
          mainCard: {
            ...card.mainCard,
            portrait: {
              ...card.mainCard.portrait,
              imageUrl: String(reader.result || ''),
            },
          },
        }),
      })
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  return (
    <section className="operator-profile-shell">
      <div className="operator-profile-card" aria-label={`${displayName} 角色卡`}>
        <div className="operator-profile-hex" />
        {portraitUrl ? (
          <img className="operator-profile-art" src={portraitUrl} alt={`${displayName} 立绘`} style={artStyle} />
        ) : (
          <div className="operator-profile-empty-art">
            <span>PORTRAIT</span>
            <b>等待角色肖像导入</b>
          </div>
        )}
        <div className="operator-profile-scan" />
        <div className="operator-profile-ri" aria-hidden="true"><span>RI</span></div>

        <header className="operator-profile-nameplate">
          <span>OPERATOR RECORD / ALTS-{String(data.id || '000').padStart(3, '0')}</span>
          <strong>{displayName}</strong>
          <em>{data.player ? `PLAYER / ${data.player}` : 'ARKLINK TERMINAL SERVICE'}</em>
        </header>

        <div className="operator-profile-info">
          <div className="operator-profile-meta-row">
            <span className="operator-profile-pill operator-profile-class">
              {professionIcon && <img src={professionIcon} alt="" aria-hidden="true" />}
              <b>{data.profession || '未知职业'}</b>
            </span>
            <span className="operator-profile-level">
              <img src={levelIcon} alt="" aria-hidden="true" />
              <b>Lv.{data.level || 1}</b>
            </span>
          </div>

          <div className="operator-profile-data-line">
            <span>ELITE PHASE</span>
            <b>
              <img src={eliteIcon} alt="" aria-hidden="true" />
              {data.elitePhase || '阶段零'}
            </b>
          </div>
          <div className="operator-profile-data-line">
            <span>SUBCLASS</span>
            <b>
              {subProfessionIcon && <img src={subProfessionIcon} alt="" aria-hidden="true" />}
              {data.subProfession || '未设置'}
            </b>
          </div>
          <div className="operator-profile-data-line">
            <span>RACE / ORIGIN</span>
            <b>{[data.race, data.origin].filter(Boolean).join(' / ') || '待补全'}</b>
          </div>
          <div className="operator-profile-data-line">
            <span>PROFILE STATUS</span>
            <b>{portraitUrl ? 'PORTRAIT LINKED' : 'NO PORTRAIT'}</b>
          </div>
        </div>
      </div>

      {editing && (
        <div className="operator-profile-controls card">
          <div>
            <strong>立绘画面调整</strong>
            <span>仅影响上方角色卡展示，不改变原始图片文件。</span>
          </div>
          <label className="character-portrait-upload operator-profile-upload">
            <span>上传肖像</span>
            <input type="file" accept="image/*" onChange={handlePortraitUpload} />
          </label>
          <label>
            <span>水平位置</span>
            <input
              type="range"
              min="-180"
              max="180"
              value={visual.portraitX}
              onChange={event => updateVisual({ portraitX: Number(event.target.value) })}
            />
            <b>{visual.portraitX}px</b>
          </label>
          <label>
            <span>垂直位置</span>
            <input
              type="range"
              min="-180"
              max="180"
              value={visual.portraitY}
              onChange={event => updateVisual({ portraitY: Number(event.target.value) })}
            />
            <b>{visual.portraitY}px</b>
          </label>
          <label>
            <span>缩放倍率</span>
            <input
              type="range"
              min="0.45"
              max="2.2"
              step="0.05"
              value={visual.portraitScale}
              onChange={event => updateVisual({ portraitScale: Number(event.target.value) })}
            />
            <b>{visual.portraitScale.toFixed(2)}x</b>
          </label>
          <button className="btn btn-ghost btn-sm" type="button" onClick={resetVisual}>重置画面</button>
        </div>
      )}
    </section>
  )
}
