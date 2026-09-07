import type { ChangeEvent } from 'react'
import {
  normalizeCharacterCardVNext,
  writeCharacterCardVNext,
  type CharacterCardVNext,
  type CharacterElitePhaseEntry,
  type CharacterTextBlock,
} from '../types/characterCard'
import {
  getElitePhaseIcon,
  getProfessionIcon,
  getSubProfessionIcon,
} from '../utils/characterVisuals'

type CharacterCardStructureProps = {
  data: any
  editing: boolean
  onChange: (nextData: any) => void
}

const FIELD_PLACEHOLDER = '等待 Excel 识别或手动补充'

const phaseLabels: Record<string, string> = {
  '0': '精英化阶段 0',
  '1': '精英化阶段 1',
  '2': '精英化阶段 2',
}

function resolveInfectionStage(value: unknown) {
  const numericValue = Number(value) || 0
  if (numericValue < 20) return '未感染'
  if (numericValue < 40) return '感染前期'
  if (numericValue < 60) return '感染中期'
  if (numericValue < 80) return '感染后期'
  return '感染末期'
}

function formatInfectionSymptoms(value: unknown) {
  const symptoms = String(value || '')
    .split(/[、,，;；\n]/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 4)
  return symptoms.length > 0 ? symptoms.join(' / ') : '-'
}

function TextValue({ value }: { value?: string }) {
  return <span className={value ? '' : 'character-structure-empty'}>{value || FIELD_PLACEHOLDER}</span>
}

function updateCard(data: any, card: CharacterCardVNext, onChange: (nextData: any) => void) {
  onChange({
    ...data,
    rawData: writeCharacterCardVNext(data.rawData, card),
  })
}

function EditableLine({
  label,
  value,
  editing,
  onChange,
}: {
  label: string
  value?: string
  editing: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="character-structure-line">
      <span>{label}</span>
      {editing ? (
        <input className="input" value={value || ''} placeholder={FIELD_PLACEHOLDER} onChange={event => onChange(event.target.value)} />
      ) : (
        <TextValue value={value} />
      )}
    </label>
  )
}

function EditableText({
  label,
  value,
  editing,
  onChange,
}: {
  label: string
  value?: string
  editing: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="character-structure-field">
      <span>{label}</span>
      {editing ? (
        <textarea className="input" value={value || ''} placeholder={FIELD_PLACEHOLDER} onChange={event => onChange(event.target.value)} />
      ) : (
        <p><TextValue value={value} /></p>
      )}
    </label>
  )
}

function TextBlockList({
  title,
  items,
  editing,
  onChange,
}: {
  title: string
  items: CharacterTextBlock[]
  editing: boolean
  onChange: (items: CharacterTextBlock[]) => void
}) {
  const list = items || []

  return (
    <div className="character-structure-list-block">
      <div className="character-structure-subtitle">
        <strong>{title}</strong>
        {editing && (
          <button className="btn btn-ghost btn-sm" onClick={() => onChange([...list, { title: '', content: '' }])}>添加</button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="character-structure-empty">{FIELD_PLACEHOLDER}</p>
      ) : (
        list.map((item, index) => (
          <div key={index} className="character-structure-entry">
            {editing ? (
              <>
                <input
                  className="input"
                  value={item.title || ''}
                  placeholder={`${title}名称`}
                  onChange={event => {
                    const next = [...list]
                    next[index] = { ...item, title: event.target.value }
                    onChange(next)
                  }}
                />
                <textarea
                  className="input"
                  value={item.content || ''}
                  placeholder={`${title}描述`}
                  onChange={event => {
                    const next = [...list]
                    next[index] = { ...item, content: event.target.value }
                    onChange(next)
                  }}
                />
                <button className="btn btn-danger btn-sm" onClick={() => onChange(list.filter((_, i) => i !== index))}>删除</button>
              </>
            ) : (
              <>
                <strong>{item.title || `${title} ${index + 1}`}</strong>
                <p><TextValue value={item.content} /></p>
              </>
            )}
          </div>
        ))
      )}
    </div>
  )
}

export default function CharacterCardStructure({ data, editing, onChange }: CharacterCardStructureProps) {
  const card = normalizeCharacterCardVNext(data.rawData)

  const setCard = (updater: (card: CharacterCardVNext) => CharacterCardVNext) => {
    updateCard(data, updater(card), onChange)
  }

  const updateMain = <T extends keyof CharacterCardVNext['mainCard']>(
    key: T,
    value: CharacterCardVNext['mainCard'][T],
  ) => {
    setCard(prev => ({ ...prev, mainCard: { ...prev.mainCard, [key]: value } }))
  }

  const updateCombat = <T extends keyof CharacterCardVNext['combatCard']>(
    key: T,
    value: CharacterCardVNext['combatCard'][T],
  ) => {
    setCard(prev => ({ ...prev, combatCard: { ...prev.combatCard, [key]: value } }))
  }

  const updatePhase = (phase: CharacterElitePhaseEntry) => {
    updateCombat('elitePhases', card.combatCard.elitePhases.map(item => item.phase === phase.phase ? phase : item))
  }

  const handlePortraitUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      updateMain('portrait', {
        ...card.mainCard.portrait,
        imageUrl: String(reader.result || ''),
      })
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  return (
    <section className="character-structure card">
      <div className="character-structure-header">
        <div>
          <span>CHARACTER CARD STRUCTURE</span>
          <h3>角色卡结构接口 vNext</h3>
        </div>
        <span className="badge badge-blue">主卡 / 战斗卡</span>
      </div>

      <div className="character-structure-grid">
        <section className="character-structure-section">
          <h4>主卡 · 基础档案与肖像</h4>
          <div className="character-structure-two">
            <div className="character-portrait-slot">
              {card.mainCard.portrait.imageUrl ? (
                <img src={card.mainCard.portrait.imageUrl} alt={data.name || '角色肖像'} />
              ) : (
                <span>角色肖像</span>
              )}
            </div>
            <div>
              {editing && (
                <label className="character-portrait-upload">
                  <span>上传肖像</span>
                  <input type="file" accept="image/*" onChange={handlePortraitUpload} />
                </label>
              )}
              <EditableLine label="肖像 URL" value={card.mainCard.portrait.imageUrl} editing={editing}
                onChange={value => updateMain('portrait', { ...card.mainCard.portrait, imageUrl: value })} />
              <EditableText label="肖像备注" value={card.mainCard.portrait.notes} editing={editing}
                onChange={value => updateMain('portrait', { ...card.mainCard.portrait, notes: value })} />
            </div>
          </div>
        </section>

        <section className="character-structure-section">
          <h4>主卡 · 临床诊断分析</h4>
          <div className="character-structure-facts">
            <span>免疫力 <b>{data.infection?.immunity ?? '-'}</b></span>
            <span>初始感染值 <b>{data.infection?.initialValue ?? '-'}</b></span>
            <span>感染值 <b>{data.infection?.currentValue ?? '-'}</b></span>
            <span>感染阶段 <b>{resolveInfectionStage(data.infection?.currentValue)}</b></span>
            <span>固化症状 <b>{formatInfectionSymptoms(data.infection?.symptoms)}</b></span>
            <span>长期疗程 <b>{data.infection?.longTerm || '-'}</b></span>
          </div>
        </section>

        <section className="character-structure-section character-structure-wide">
          <h4>主卡 · 主要特质</h4>
          <div className="character-trait-profile-grid">
            {card.mainCard.traitProfiles.map((trait, index) => (
              <div key={trait.category} className="character-trait-profile">
                <strong>{trait.category}</strong>
                <EditableLine label="名称" value={trait.name} editing={editing}
                  onChange={value => {
                    const next = [...card.mainCard.traitProfiles]
                    next[index] = { ...trait, name: value }
                    updateMain('traitProfiles', next)
                  }} />
                <EditableText label="介绍" value={trait.description} editing={editing}
                  onChange={value => {
                    const next = [...card.mainCard.traitProfiles]
                    next[index] = { ...trait, description: value }
                    updateMain('traitProfiles', next)
                  }} />
                <EditableText label="属性改动" value={trait.attributeChanges} editing={editing}
                  onChange={value => {
                    const next = [...card.mainCard.traitProfiles]
                    next[index] = { ...trait, attributeChanges: value }
                    updateMain('traitProfiles', next)
                  }} />
              </div>
            ))}
          </div>
        </section>

        <section className="character-structure-section">
          <h4>主卡 · 职业表接口</h4>
          <div className="character-class-visual-row">
            <span className="character-class-visual profession">
              {getProfessionIcon(card.mainCard.professionTable.branch || data.profession) && (
                <img src={getProfessionIcon(card.mainCard.professionTable.branch || data.profession) || ''} alt="" aria-hidden="true" />
              )}
              <b>{card.mainCard.professionTable.branch || data.profession || '职业未设置'}</b>
            </span>
            {data.subProfession && (
              <span className="character-class-visual subclass">
                {getSubProfessionIcon(data.subProfession) && <img src={getSubProfessionIcon(data.subProfession) || ''} alt="" aria-hidden="true" />}
                <b>{data.subProfession}</b>
              </span>
            )}
          </div>
          <EditableLine label="分支" value={card.mainCard.professionTable.branch || data.profession} editing={editing}
            onChange={value => updateMain('professionTable', { ...card.mainCard.professionTable, branch: value })} />
          <EditableLine label="攻击范围" value={card.mainCard.professionTable.attackRange || data.combat?.attackRange} editing={editing}
            onChange={value => updateMain('professionTable', { ...card.mainCard.professionTable, attackRange: value })} />
          <EditableLine label="武器类型" value={card.mainCard.professionTable.weaponType || data.combat?.weaponType} editing={editing}
            onChange={value => updateMain('professionTable', { ...card.mainCard.professionTable, weaponType: value })} />
          <EditableLine label="SP 回复" value={card.mainCard.professionTable.spRecovery} editing={editing}
            onChange={value => updateMain('professionTable', { ...card.mainCard.professionTable, spRecovery: value })} />
          <EditableText label="分支特性" value={card.mainCard.professionTable.branchTrait} editing={editing}
            onChange={value => updateMain('professionTable', { ...card.mainCard.professionTable, branchTrait: value })} />
        </section>

        <section className="character-structure-section">
          <h4>主卡 · 信誉系统</h4>
          <EditableLine label="经济" value={card.mainCard.reputation.economy} editing={editing}
            onChange={value => updateMain('reputation', { ...card.mainCard.reputation, economy: value })} />
          <EditableLine label="资源" value={card.mainCard.reputation.resources} editing={editing}
            onChange={value => updateMain('reputation', { ...card.mainCard.reputation, resources: value })} />
          <EditableLine label="人脉" value={card.mainCard.reputation.contacts} editing={editing}
            onChange={value => updateMain('reputation', { ...card.mainCard.reputation, contacts: value })} />
          <EditableLine label="头衔" value={card.mainCard.reputation.titles} editing={editing}
            onChange={value => updateMain('reputation', { ...card.mainCard.reputation, titles: value })} />
        </section>

        <section className="character-structure-section character-structure-wide">
          <h4>主卡 · 档案资料</h4>
          <div className="character-structure-three">
            <EditableText label="客观履历" value={card.mainCard.archive.objectiveHistory} editing={editing}
              onChange={value => updateMain('archive', { ...card.mainCard.archive, objectiveHistory: value })} />
            <EditableText label="个人信念" value={card.mainCard.archive.personalBelief} editing={editing}
              onChange={value => updateMain('archive', { ...card.mainCard.archive, personalBelief: value })} />
            <EditableText label="携带物" value={card.mainCard.archive.belongings} editing={editing}
              onChange={value => updateMain('archive', { ...card.mainCard.archive, belongings: value })} />
          </div>
        </section>

        <section className="character-structure-section character-structure-wide">
          <div className="character-structure-subtitle">
            <h4>主卡 · 模组经历表</h4>
            {editing && (
              <button className="btn btn-ghost btn-sm" onClick={() => updateMain('moduleExperiences', [
                ...card.mainCard.moduleExperiences,
                { moduleName: '', experience: '', reward: '' },
              ])}>添加经历</button>
            )}
          </div>
          {card.mainCard.moduleExperiences.length === 0 ? (
            <p className="character-structure-empty">{FIELD_PLACEHOLDER}</p>
          ) : (
            <div className="character-module-list">
              {card.mainCard.moduleExperiences.map((item, index) => (
                <div key={index} className="character-structure-entry">
                  {editing ? (
                    <>
                      <input className="input" value={item.moduleName} placeholder="模组名称" onChange={event => {
                        const next = [...card.mainCard.moduleExperiences]
                        next[index] = { ...item, moduleName: event.target.value }
                        updateMain('moduleExperiences', next)
                      }} />
                      <textarea className="input" value={item.experience} placeholder="经历" onChange={event => {
                        const next = [...card.mainCard.moduleExperiences]
                        next[index] = { ...item, experience: event.target.value }
                        updateMain('moduleExperiences', next)
                      }} />
                      <textarea className="input" value={item.reward} placeholder="收获" onChange={event => {
                        const next = [...card.mainCard.moduleExperiences]
                        next[index] = { ...item, reward: event.target.value }
                        updateMain('moduleExperiences', next)
                      }} />
                      <button className="btn btn-danger btn-sm" onClick={() => updateMain('moduleExperiences', card.mainCard.moduleExperiences.filter((_, i) => i !== index))}>删除</button>
                    </>
                  ) : (
                    <>
                      <strong>{item.moduleName || `模组经历 ${index + 1}`}</strong>
                      <p>{item.experience || FIELD_PLACEHOLDER}</p>
                      <small>{item.reward || FIELD_PLACEHOLDER}</small>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="character-structure-section character-structure-wide">
          <h4>战斗卡 · 主职 / 子职</h4>
          <div className="character-structure-two">
            {[
              ['mainClass', '主职'],
              ['subClass', '子职'],
            ].map(([key, label]) => {
              const item = card.combatCard[key as 'mainClass' | 'subClass']
              const classNameValue = item.name || (key === 'mainClass' ? data.profession : data.subProfession)
              const classIcon = key === 'mainClass'
                ? getProfessionIcon(classNameValue)
                : getSubProfessionIcon(classNameValue)
              return (
                <div key={key} className="character-combat-class">
                  <strong className="character-combat-class-title">
                    {classIcon && <img src={classIcon} alt="" aria-hidden="true" />}
                    <span>{label}</span>
                  </strong>
                  <EditableLine label="名称" value={item.name || (key === 'mainClass' ? data.profession : data.subProfession)} editing={editing}
                    onChange={value => updateCombat(key as 'mainClass' | 'subClass', { ...item, name: value })} />
                  <EditableLine label="攻击范围" value={item.attackRange} editing={editing}
                    onChange={value => updateCombat(key as 'mainClass' | 'subClass', { ...item, attackRange: value })} />
                  <EditableLine label="武器类型" value={item.weaponType} editing={editing}
                    onChange={value => updateCombat(key as 'mainClass' | 'subClass', { ...item, weaponType: value })} />
                  <EditableLine label="SP 回复" value={item.spRecovery} editing={editing}
                    onChange={value => updateCombat(key as 'mainClass' | 'subClass', { ...item, spRecovery: value })} />
                  <EditableText label="分支特性" value={item.branchTrait} editing={editing}
                    onChange={value => updateCombat(key as 'mainClass' | 'subClass', { ...item, branchTrait: value })} />
                  <EditableText label="详细介绍" value={item.description} editing={editing}
                    onChange={value => updateCombat(key as 'mainClass' | 'subClass', { ...item, description: value })} />
                </div>
              )
            })}
          </div>
        </section>

        <section className="character-structure-section character-structure-wide">
          <h4>战斗卡 · 精英化阶段能力</h4>
          <div className="character-phase-grid">
            {card.combatCard.elitePhases.map(phase => (
              <div key={phase.phase} className="character-phase-card">
                <h5 className="character-phase-title">
                  <img src={getElitePhaseIcon(phase.phase)} alt="" aria-hidden="true" />
                  <span>{phaseLabels[phase.phase]}</span>
                </h5>
                <TextBlockList title="天赋" items={phase.talents} editing={editing}
                  onChange={items => updatePhase({ ...phase, talents: items })} />
                <TextBlockList title="行动" items={phase.actions} editing={editing}
                  onChange={items => updatePhase({ ...phase, actions: items })} />
                <TextBlockList title="源石技艺" items={phase.arts} editing={editing}
                  onChange={items => updatePhase({ ...phase, arts: items })} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}
