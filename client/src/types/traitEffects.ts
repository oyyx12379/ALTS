import type { CharacterTrait } from './traits'

export type TraitEffectSelection = {
  key: string
  target: string
}

export type TraitChoiceGroup = {
  key: string
  options: string[]
  amount: number
  percent: boolean
  text: string
  selectionCount?: number
  perLevel?: boolean
  kind?: 'adjustment' | 'grantSkill' | 'target'
}

export type TraitGrantedSkill = {
  name: string
  initialValue: number
  sourceTrait: string
}

export type TraitCombatModifier = {
  flat: number
  percent: number
}

export type TraitEffectSummary = {
  attributes: Record<string, number>
  skills: Record<string, number>
  combat: Record<string, TraitCombatModifier>
  choices: Array<{ traitName: string; group: TraitChoiceGroup }>
  grantedSkills: TraitGrantedSkill[]
}

type TraitTarget =
  | { kind: 'attribute'; key: string }
  | { kind: 'skill'; key: string }
  | { kind: 'combat'; key: string }

const ATTRIBUTE_TARGETS: Record<string, string> = {
  生理耐受: 'PR',
  反应机动: 'MOB',
  物理强度: 'PS',
  精神意志: 'SPR',
  经验智慧: 'INT',
  源石技艺适应性: 'OAA',
  个人魅力: 'APP',
}

const SKILL_TARGETS = [
  '源石技艺理论', '战术规划', '支援技术', '兵械操作', '生物驯养',
  '农林渔牧', '手工工艺', '机械工程', '电子工程',
  '源石学', '社会学', '政法学', '经管学', '理工学', '医药学',
  '物理强度', '力量', '战术', '敏捷', '情感', '交涉', '教育', '技术', '灵巧', '镇定', '洞察',
  '格斗', '长兵', '软兵', '刀剑', '拳术', '钝器', '盾术',
  '身法', '短兵', '暗器', '射击', '施术',
  '声乐', '艺术', '心理', '游说', '取悦', '威吓',
  '妙手', '急救', '驾驶', '欺诈', '乔装', '潜行', '调查', '觉察', '追踪',
  '电流', '气流', '火焰', '控水', '冰霜', '土石', '动能', '恢复', '自然', '传心感知',
]

const NON_COMBAT_STREAMS = ['情感', '交涉', '教育', '技术', '灵巧', '镇定', '洞察']
const STREAM_SKILLS: Record<string, string[]> = {
  情感: ['声乐', '艺术', '心理'],
  交涉: ['游说', '取悦', '威吓'],
  教育: ['理工学', '医药学', '源石学', '社会学', '政法学', '经管学'],
  技术: ['农林渔牧', '手工工艺', '机械工程', '电子工程'],
  灵巧: ['妙手', '急救', '驾驶'],
  镇定: ['欺诈', '乔装', '潜行'],
  洞察: ['调查', '觉察', '追踪'],
  力量: ['格斗', '长兵', '软兵', '刀剑', '拳术', '钝器', '盾术'],
  战术: ['战术规划', '支援技术', '兵械操作', '生物驯养'],
  敏捷: ['身法', '短兵', '暗器', '射击'],
  源石技艺理论: ['施术'],
}

const COMBAT_TARGETS: Record<string, string> = {
  元素韧性上限: 'elemResist',
  生命值上限: 'hpMax',
  技力上限: 'spMax',
  SP上限: 'spMax',
  耐力上限: 'staminaMax',
  物理抗性: 'physResist',
  法术抗性: 'magicResist',
  元素韧性: 'elemResist',
  初动补正: 'spInitBonus',
  初动: 'spInit',
  生命值: 'hpMax',
  重量等级: 'weight',
  重量: 'weight',
}

const TARGETS: Record<string, TraitTarget> = {
  ...Object.fromEntries(Object.entries(ATTRIBUTE_TARGETS).map(([name, key]) => [name, { kind: 'attribute', key }])),
  ...Object.fromEntries(SKILL_TARGETS.filter(name => !ATTRIBUTE_TARGETS[name]).map(name => [name, { kind: 'skill', key: name }])),
  ...Object.fromEntries(Object.entries(COMBAT_TARGETS).map(([name, key]) => [name, { kind: 'combat', key }])),
}

const TARGET_NAMES = Object.keys(TARGETS).sort((left, right) => right.length - left.length)
const TARGET_PATTERN = TARGET_NAMES.map(escapeRegex).join('|')
const CHOICE_PATTERN = new RegExp(`(${TARGET_PATTERN}(?:\\s*/\\s*(?:${TARGET_PATTERN}))+?)\\s*([+＋-－])\\s*(\\d+)\\s*([%％]?)`, 'g')
const DIRECT_PATTERN = new RegExp(`(${TARGET_PATTERN})\\s*([+＋-－])\\s*(\\d+)\\s*([%％]?)`, 'g')
const LEVEL_PATTERN = new RegExp(`(?:获得(?:${TARGET_PATTERN})资质[：:]\\s*)?等级提升时[，,]\\s*(${TARGET_PATTERN})\\s*([+＋-－])\\s*(\\d+)\\s*([%％]?)`, 'g')
const STREAM_QUALIFICATION_PATTERN = new RegExp(`获得((?:${TARGET_PATTERN})(?:\\s*/\\s*(?:${TARGET_PATTERN}))+?)资质[^。\\n]*?等级提升时`, 'g')
const GRANTED_SKILL_PATTERN = /获得附加技能[：:]([^，,\n]+?)[，,]\s*初始技能值为\s*(\d+)/g
const CONDITIONAL_PREFIX = /(等级提升时|每(?:次|当|在|进入)|当.+时|若.+则|临时|战斗开始时|长\/短休|短\/长休|进行.+时|获得.+资质)/

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isConditionalAt(effect: string, index: number) {
  const lineStart = Math.max(
    effect.lastIndexOf('\n', index),
    effect.lastIndexOf('。', index),
    effect.lastIndexOf('；', index),
    effect.lastIndexOf(';', index),
  ) + 1
  return CONDITIONAL_PREFIX.test(effect.slice(lineStart, index))
}

function parseSignedAmount(sign: string, rawAmount: string) {
  const amount = Number(rawAmount) || 0
  return sign === '-' || sign === '－' ? -amount : amount
}

function applyAdjustment(summary: TraitEffectSummary, targetName: string, amount: number, percent: boolean) {
  const target = TARGETS[targetName]
  if (!target) return
  if (target.kind === 'attribute') {
    summary.attributes[target.key] = (summary.attributes[target.key] || 0) + amount
    return
  }
  if (target.kind === 'skill') {
    summary.skills[target.key] = (summary.skills[target.key] || 0) + amount
    return
  }
  const combat = summary.combat[target.key] || { flat: 0, percent: 0 }
  if (percent) combat.percent += amount
  else combat.flat += amount
  summary.combat[target.key] = combat
}

function createSummary(): TraitEffectSummary {
  return { attributes: {}, skills: {}, combat: {}, choices: [], grantedSkills: [] }
}

export function normalizeTraitEffectSelections(value: unknown): TraitEffectSelection[] {
  const source = Array.isArray(value)
    ? value
    : (() => {
      try { return JSON.parse(String(value || '[]')) } catch { return [] }
    })()
  if (!Array.isArray(source)) return []
  return source
    .filter(item => item && typeof item === 'object')
    .map(item => ({ key: String(item.key || ''), target: String(item.target || '') }))
    .filter(item => item.key && item.target)
}

export function getTraitChoiceGroups(effect: unknown) {
  const text = String(effect || '')
  const groups: TraitChoiceGroup[] = []
  for (const match of text.matchAll(CHOICE_PATTERN)) {
    if (match.index == null || isConditionalAt(text, match.index)) continue
    const options = match[1].split('/').map(option => option.trim()).filter(option => Boolean(TARGETS[option]))
    if (options.length < 2) continue
    const amount = parseSignedAmount(match[2], match[3])
    const percent = Boolean(match[4])
    groups.push({
      key: `${match.index}:${options.join('/')}:${amount}:${percent ? 'percent' : 'flat'}`,
      options,
      amount,
      percent,
      text: match[0],
      selectionCount: 1,
      kind: 'adjustment',
    })
  }
  for (const match of text.matchAll(/选择一个教育类技能[，,]该技能\s*([+＋-－])\s*(\d+)/g)) {
    groups.push({
      key: `education-skill:${match.index}:${match[1]}${match[2]}`,
      options: STREAM_SKILLS.教育,
      amount: parseSignedAmount(match[1], match[2]),
      percent: false,
      text: match[0],
      selectionCount: 1,
      kind: 'adjustment',
    })
  }
  for (const match of text.matchAll(/选择一个交涉类技能[，,]该技能\s*([+＋-－])\s*(\d+)/g)) {
    groups.push({
      key: `social-skill:${match.index}:${match[1]}${match[2]}`,
      options: STREAM_SKILLS.交涉,
      amount: parseSignedAmount(match[1], match[2]),
      percent: false,
      text: match[0],
      selectionCount: 1,
      kind: 'adjustment',
    })
  }
  for (const match of text.matchAll(/选择一个非战斗属性的副属性[^。\n]*?等级提升时[，,]该副属性\s*([+＋-－])\s*(\d+)/g)) {
    groups.push({
      key: `non-combat-stream:${match.index}:${match[1]}${match[2]}`,
      options: NON_COMBAT_STREAMS,
      amount: parseSignedAmount(match[1], match[2]),
      percent: false,
      text: match[0],
      selectionCount: 1,
      perLevel: true,
      kind: 'adjustment',
    })
  }
  for (const match of text.matchAll(STREAM_QUALIFICATION_PATTERN)) {
    const options = match[1].split('/').map(option => option.trim()).filter(option => Boolean(TARGETS[option]))
    if (options.length < 2) continue
    groups.push({
      key: `stream-qualification:${match.index}:${options.join('/')}`,
      options,
      amount: 1,
      percent: false,
      text: match[0],
      selectionCount: 1,
      perLevel: true,
      kind: 'adjustment',
    })
  }
  for (const match of text.matchAll(/选择任意五项不重复的基础属性[^。\n]*?属性值\s*([+＋-－])\s*(\d+)/g)) {
    groups.push({
      key: `five-attributes:${match.index}:${match[1]}${match[2]}`,
      options: Object.keys(ATTRIBUTE_TARGETS),
      amount: parseSignedAmount(match[1], match[2]),
      percent: false,
      text: match[0],
      selectionCount: 5,
      kind: 'adjustment',
    })
  }
  for (const match of text.matchAll(GRANTED_SKILL_PATTERN)) {
    const options = match[1].split('/').map(option => option.trim()).filter(Boolean)
    if (options.length < 2) continue
    groups.push({
      key: `granted-skill:${match.index}:${options.join('/')}:${match[2]}`,
      options,
      amount: Number(match[2]) || 0,
      percent: false,
      text: match[0],
      selectionCount: 1,
      kind: 'grantSkill',
    })
  }
  return groups
}

export function getTraitEffectSummary(traits: Array<Partial<CharacterTrait>> = [], level: unknown = 1) {
  const summary = createSummary()
  const upgradeCount = Math.max(0, Math.trunc(Number(level) || 1) - 1)

  traits.forEach(trait => {
    const effect = String(trait.effect || '')
    const choices = getTraitChoiceGroups(effect)
    const choiceRanges = choices.map(group => {
      const index = Number(group.key.split(':', 1)[0])
      return [index, index + group.text.length] as const
    })
    const selections = normalizeTraitEffectSelections(trait.effectSelections)

    choices.forEach(group => {
      const selected = selections.filter(item => item.key === group.key && group.options.includes(item.target))
      const requiredCount = group.selectionCount || 1
      if (selected.length === requiredCount) {
        if (group.kind === 'adjustment') {
          selected.forEach(item => applyAdjustment(summary, item.target, group.amount * (group.perLevel ? upgradeCount : 1), group.percent))
        }
      } else {
        summary.choices.push({ traitName: String(trait.name || '未命名特质'), group })
      }
    })

    for (const match of effect.matchAll(LEVEL_PATTERN)) {
      if (match.index == null || choiceRanges.some(([start, end]) => match.index! >= start && match.index! < end)) continue
      applyAdjustment(summary, match[1], parseSignedAmount(match[2], match[3]) * upgradeCount, Boolean(match[4]))
    }

    for (const match of effect.matchAll(DIRECT_PATTERN)) {
      if (match.index == null || isConditionalAt(effect, match.index)) continue
      if (choiceRanges.some(([start, end]) => match.index! >= start && match.index! < end)) continue
      applyAdjustment(summary, match[1], parseSignedAmount(match[2], match[3]), Boolean(match[4]))
    }
  })

  return summary
}

export function getTraitGrantedSkills(traits: Array<Partial<CharacterTrait>> = []) {
  const grants: TraitGrantedSkill[] = []
  traits.forEach(trait => {
    const effect = String(trait.effect || '')
    const selections = normalizeTraitEffectSelections(trait.effectSelections)
    const groups = getTraitChoiceGroups(effect)
    for (const match of effect.matchAll(GRANTED_SKILL_PATTERN)) {
      const options = match[1].split('/').map(option => option.trim()).filter(Boolean)
      const choice = groups.find(group => group.kind === 'grantSkill' && group.text === match[0])
      const names = options.length > 1
        ? selections.filter(item => item.key === choice?.key).map(item => item.target)
        : options
      names.forEach(name => grants.push({
        name,
        initialValue: Number(match[2]) || 0,
        sourceTrait: String(trait.name || ''),
      }))
    }
  })
  return grants
}

export function formatTraitModifier(value: number) {
  return `${value >= 0 ? '+' : ''}${value}`
}

export function applyTraitCombatModifier(value: number, modifier?: TraitCombatModifier) {
  if (!modifier) return value
  return Math.round((value + modifier.flat) * (1 + modifier.percent / 100))
}

export function applyTraitModifiersToData(data: any, summary: TraitEffectSummary) {
  return {
    ...data,
    attributes: (data?.attributes || []).map((attribute: any) => {
      const key = Object.entries(ATTRIBUTE_TARGETS).find(([name, abbr]) => (
        name === attribute?.name || abbr === attribute?.abbr || abbr === attribute?.name
      ))?.[1]
      return key && summary.attributes[key]
        ? { ...attribute, modifier: (Number(attribute.modifier) || 0) + summary.attributes[key] }
        : { ...attribute }
    }),
    skills: (data?.skills || []).map((skill: any) => (
      summary.skills[skill?.name]
        ? { ...skill, modifier: (Number(skill.modifier) || 0) + summary.skills[skill.name] }
        : { ...skill }
    )),
  }
}
