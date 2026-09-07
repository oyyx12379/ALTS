import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  getCharacter,
  getRulesCombatClasses,
  getRulesInfection,
  getRulesRaces,
  getRulesTraits,
  importCharacter,
  updateCharacter,
  uploadCharacterSheet,
} from '../api'
import CharacterProfileCard from '../components/CharacterProfileCard'
import {
  normalizeCharacterEquipmentV1,
  writeCharacterEquipmentV1,
  type CharacterEquipmentV1,
} from '../types/characterCard'
import {
  getElitePhaseIcon,
  getLevelIcon,
  getProfessionIcon,
  getSubProfessionIcon,
} from '../utils/characterVisuals'
import {
  PRIMARY_SUBCATEGORIES,
  TRAIT_TYPE_LABELS,
  calculateTraitBudget,
  getInfectionTraitSlots,
  getTraitSubcategory,
  inferTraitType,
  normalizeTraitBudget,
  normalizeTraitName,
  parseTraitRequirements,
  type CharacterTrait,
  type RuleTrait,
  type TraitType,
} from '../types/traits'
import {
  COMBAT_CLASS_DETAILS,
  type ArmorType,
  type HpTier,
} from '../data/combatClassDetails'
import {
  applyTraitCombatModifier,
  applyTraitModifiersToData,
  formatTraitModifier,
  getTraitChoiceGroups,
  getTraitEffectSummary,
  getTraitGrantedSkills,
  normalizeTraitEffectSelections,
  type TraitChoiceGroup,
  type TraitEffectSummary,
  type TraitEffectSelection,
} from '../types/traitEffects'

type OptionPickerState = {
  field: string
  title: string
  options: string[]
  onSelect?: (value: string) => void
} | null

type PendingTraitChoice = {
  trait: RuleTrait & { effectSelections?: TraitEffectSelection[] | string }
  groups: TraitChoiceGroup[]
  mode: 'add' | 'update'
}

type RuleCombatClass = {
  id: number
  name: string
  branch: string
  weaponType?: string
  armors?: string
  branchTrait?: string
}

const ARMOR_HP_BASE_RULES: Record<ArmorType, { baseMultiplier: number }> = {
  '轻甲': { baseMultiplier: 2.5 },
  '中甲': { baseMultiplier: 3 },
  '重甲': { baseMultiplier: 3.5 },
}

const HP_GROWTH_RULES: Record<HpTier, { growthDivisor: number; levelBonus: number }> = {
  '低': { growthDivisor: 8, levelBonus: 1 },
  '中': { growthDivisor: 6, levelBonus: 2 },
  '高': { growthDivisor: 4, levelBonus: 3 },
}

const COMBAT_NUMBER_FIELD_LABELS: Record<string, string> = {
  hpMax: '生命值',
  physResist: '物理抗性',
  magicResist: '法术抗性',
  spMax: '技力上限',
  spInit: '初动',
  spInitBonus: '初动补正',
  elemResist: '元素韧性',
  weight: '重量等级',
  staminaMax: '耐力上限',
}

const EQUIPMENT_TABS = [
  { key: 'weapon', label: '武器' },
  { key: 'armor', label: '防具' },
  { key: 'throwables', label: '投掷物' },
  { key: 'consumables', label: '消耗物' },
  { key: 'summons', label: '召唤物' },
] as const

type EquipmentTabKey = typeof EQUIPMENT_TABS[number]['key']

const EQUIPMENT_ATTRIBUTE_OPTIONS: Array<{ key: CharacterEquipmentV1['weapon']['attribute']; label: string }> = [
  { key: 'PS', label: '物理强度' },
  { key: 'INT', label: '经验智慧' },
  { key: 'MOB', label: '反应机动' },
  { key: 'OAA', label: '源石技艺适应性' },
]

const DEFENSE_SKILL_OPTIONS: CharacterEquipmentV1['armor']['defenseSkill'][] = ['格斗', '身法', '战术规划', '施术']

const STANDARD_COMBAT_CLASSES: RuleCombatClass[] = [
  { id: -101, branch: '术士', name: '中坚术士' },
  { id: -102, branch: '术士', name: '扩散术士' },
  { id: -103, branch: '术士', name: '本源术士' },
  { id: -201, branch: '医疗', name: '医师' },
  { id: -202, branch: '医疗', name: '群愈师' },
  { id: -203, branch: '医疗', name: '行医' },
]

function mergeCombatClassOptions(classes: RuleCombatClass[]) {
  const seen = new Set<string>()
  return [...classes, ...STANDARD_COMBAT_CLASSES].filter(cls => {
    const branch = String(cls.branch || '').trim()
    const name = String(cls.name || '').trim()
    if (!branch || !name) return false
    const key = `${branch}::${name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

type InfectionSymptomOption = {
  name: string
  bodyPart?: string
  description?: string
  modifier?: string
  outbreak?: string
}

type InfectionRules = {
  symptoms?: InfectionSymptomOption[]
  treatments?: string[]
}

const BASIC_FIELD_LABELS: Record<string, string> = {
  name: '姓名',
  player: '玩家',
  gender: '性别',
  age: '年龄',
  birthday: '生日',
  origin: '出身',
  race: '种族',
  profession: '职业',
  subProfession: '子职业',
}

const RACE_OPTION_COUNT = 32

const INFECTION_FIELD_LABELS: Record<string, string> = {
  immunity: '免疫力',
  initialValue: '初始感染值',
  currentValue: '感染值',
  stage: '感染阶段',
  symptoms: '固化症状',
  longTerm: '长期疗程',
}

const INFECTION_SYMPTOM_OPTIONS = [
  '无感染',
  '嗜睡症',
  '认知障碍',
  '感官失灵',
  '神经衰弱',
  '肌肉僵化',
  '躯壳结晶',
  '代谢失调',
  '组织萎缩',
  '肢体晶化',
  '肢体畸变',
  '协调障碍',
  '肌体无力',
  '术能失控',
  '异常发育',
  '造血障碍',
  '免疫缺陷',
]

const FALLBACK_INFECTION_TREATMENTS = [
  '早期感染阻断疗程',
  '深度感染阻断疗程',
  '结晶活性衰减疗程',
  '结晶活性抑制疗程',
]

const DEFAULT_INFECTION = {
  immunity: 5,
  initialValue: 0,
  currentValue: 0,
  stage: '未感染',
  symptoms: '',
  longTerm: '',
}

const ATTR_DEFINITIONS = [
  { abbr: 'PR', name: '生理耐受', color: '#ff6b6b' },
  { abbr: 'MOB', name: '反应机动', color: '#52c41a' },
  { abbr: 'PS', name: '物理强度', color: '#ff4d4f' },
  { abbr: 'SPR', name: '精神意志', color: '#722ed1' },
  { abbr: 'INT', name: '经验智慧', color: '#4096ff' },
  { abbr: 'OAA', name: '源石技艺适应性', color: '#ffa940' },
  { abbr: 'APP', name: '个人魅力', color: '#ff85c0' },
]

const SKILL_STREAMS = [
  {
    id: 'combat-ps',
    category: '物理强度',
    dataCategory: '力量',
    mainName: '力量',
    attribute: '物理强度',
    attrAbbr: 'PS',
    combat: true,
    commonSkill: '格斗',
    skills: ['格斗', '长兵', '软兵', '刀剑', '拳术', '钝器', '盾术'],
  },
  {
    id: 'combat-int',
    category: '战术',
    dataCategory: '战术',
    mainName: '战术',
    attribute: '经验智慧',
    attrAbbr: 'INT',
    combat: true,
    commonSkill: '战术规划',
    skills: ['战术规划', '支援技术', '兵械操作', '生物驯养'],
  },
  {
    id: 'combat-mob',
    category: '敏捷',
    dataCategory: '敏捷',
    mainName: '敏捷',
    attribute: '反应机动',
    attrAbbr: 'MOB',
    combat: true,
    commonSkill: '身法',
    skills: ['身法', '短兵', '暗器', '射击'],
  },
  {
    id: 'combat-oaa',
    category: '源石技艺理论',
    dataCategory: '源石技艺理论',
    mainName: '源石技艺理论',
    attribute: '源石技艺适应性',
    attrAbbr: 'OAA',
    combat: true,
    commonSkill: '施术',
    skills: ['施术'],
  },
  {
    id: 'emotion-app',
    category: '情感',
    dataCategory: '个人魅力',
    mainName: '情感',
    attribute: '个人魅力',
    attrAbbr: 'APP',
    combat: false,
    commonSkill: '',
    skills: ['声乐', '艺术', '心理'],
  },
  {
    id: 'social-app',
    category: '交涉',
    dataCategory: '个人魅力',
    mainName: '交涉',
    attribute: '个人魅力',
    attrAbbr: 'APP',
    combat: false,
    commonSkill: '',
    skills: ['游说', '取悦', '威吓'],
  },
  {
    id: 'knowledge-int',
    category: '教育',
    dataCategory: '经验智慧',
    mainName: '教育',
    attribute: '经验智慧',
    attrAbbr: 'INT',
    combat: false,
    commonSkill: '',
    skills: ['理工学', '医药学', '源石学', '社会学', '政法学', '经管学'],
  },
  {
    id: 'craft-int',
    category: '技术',
    dataCategory: '技术',
    mainName: '技术',
    attribute: '经验智慧',
    attrAbbr: 'INT',
    combat: false,
    commonSkill: '',
    skills: ['农林渔牧', '手工工艺', '机械工程', '电子工程'],
  },
  {
    id: 'finesse-mob',
    category: '灵巧',
    dataCategory: '灵巧',
    mainName: '灵巧',
    attribute: '反应机动',
    attrAbbr: 'MOB',
    combat: false,
    commonSkill: '',
    skills: ['妙手', '急救', '驾驶'],
  },
  {
    id: 'calm-spr',
    category: '镇定',
    dataCategory: '镇定',
    mainName: '镇定',
    attribute: '精神意志',
    attrAbbr: 'SPR',
    combat: false,
    commonSkill: '',
    skills: ['欺诈', '乔装', '潜行'],
  },
  {
    id: 'insight-spr',
    category: '洞察',
    dataCategory: '洞察',
    mainName: '洞察',
    attribute: '精神意志',
    attrAbbr: 'SPR',
    combat: false,
    commonSkill: '',
    skills: ['调查', '觉察', '追踪'],
  },
]

const ORIGINIUM_ARTS_GROUPS = [
  { category: '塑能转换类', skills: ['电流', '气流', '火焰'] },
  { category: '塑形重构类', skills: ['控水', '冰霜', '土石'] },
  { category: '咒法化形类', skills: ['动能'] },
  { category: '生理变化类', skills: ['恢复', '自然'] },
  { category: '传心感知类', skills: ['传心感知'] },
]

const ORIGINIUM_ARTS_SKILLS = ORIGINIUM_ARTS_GROUPS.flatMap(group => group.skills)

function getOriginiumArtsCategory(skillName: string) {
  return ORIGINIUM_ARTS_GROUPS.find(group => group.skills.includes(skillName))?.category || ''
}

function resolveAttributeMeta(attrName: string) {
  return ATTR_DEFINITIONS.find(attr => attr.abbr === attrName || attr.name === attrName) || {
    abbr: attrName,
    name: attrName,
    color: '#888',
  }
}

function getAttributeId(attr: any) {
  return resolveAttributeMeta(String(attr?.name || attr?.abbr || attr || '')).abbr
}

function getMedicalAttributeRows(attributes: any[] = []) {
  const rows = ATTR_DEFINITIONS.map(def => {
    const existing = attributes.find(attr => getAttributeId(attr) === def.abbr)
    return {
      name: existing?.name || def.name,
      abbr: existing?.abbr || def.abbr,
      base: existing?.base ?? 0,
      modifier: existing?.modifier ?? 0,
      growth: existing?.growth ?? 0,
    }
  })
  const extras = attributes.filter(attr => !ATTR_DEFINITIONS.some(def => def.abbr === getAttributeId(attr)))
  return [...rows, ...extras]
}

function getSkillValue(skill: any, field: 'value' | 'growth' | 'modifier') {
  if (!skill) return 0
  if (field === 'value') return Number(skill.value ?? skill.total ?? 0) || 0
  return Number(skill[field] ?? 0) || 0
}

function getAttributeTotal(attributes: any[] = [], attrName: string) {
  const attr = getMedicalAttributeRows(attributes).find(item => (
    item.name === attrName || item.abbr === attrName || getAttributeId(item) === attrName
  ))
  if (!attr) return 0
  return (Number(attr.base) || 0) + (Number(attr.modifier) || 0) + (Number(attr.growth) || 0)
}

function resolveArmorType(data: any): ArmorType | null {
  const candidates = [
    data?.combat?.armorType,
    COMBAT_CLASS_DETAILS[String(data?.subProfession || '')]?.armorType,
    COMBAT_CLASS_DETAILS[String(data?.profession || '')]?.armorType,
  ].filter(Boolean).map(String)
  return (Object.keys(ARMOR_HP_BASE_RULES) as ArmorType[]).find(type => (
    candidates.some(candidate => candidate.includes(type))
  )) || null
}

function resolveHpTier(data: any, combatClasses: RuleCombatClass[] = []): HpTier | null {
  const matchingRule = getMatchingCombatClass(data, combatClasses)
  const candidates = [
    data?.combat?.hpTier,
    COMBAT_CLASS_DETAILS[String(data?.subProfession || '')]?.hpTier,
    COMBAT_CLASS_DETAILS[String(data?.subProfession || '')]?.branchTrait,
    COMBAT_CLASS_DETAILS[String(data?.profession || '')]?.hpTier,
    COMBAT_CLASS_DETAILS[String(data?.profession || '')]?.branchTrait,
    matchingRule?.branchTrait,
  ].filter(Boolean).map(String)
  return (Object.keys(HP_GROWTH_RULES) as HpTier[]).find(tier => (
    candidates.some(candidate => (
      candidate.includes(`${tier}生命`)
      || candidate.includes(`${tier}血量`)
      || candidate === tier
    ))
  )) || null
}

function clampCharacterLevel(level: any) {
  return Math.min(15, Math.max(1, Number(level) || 1))
}

function getElitePhaseIndexByLevel(level: any) {
  const safeLevel = clampCharacterLevel(level)
  if (safeLevel >= 11) return 2
  if (safeLevel >= 6) return 1
  return 0
}

function getElitePhaseByLevel(level: any) {
  return `阶段${getElitePhaseIndexByLevel(level)}`
}

function getMatchingCombatClass(data: any, combatClasses: RuleCombatClass[] = []) {
  const profession = String(data?.profession || '')
  const subProfession = String(data?.subProfession || '')
  return combatClasses.find(cls => (
    (subProfession && cls.name === subProfession)
    || (profession && cls.branch === profession && cls.name === subProfession)
    || cls.name === profession
  ))
}

function isMeleeCombatClass(data: any, combatClasses: RuleCombatClass[] = []) {
  const matchingRule = getMatchingCombatClass(data, combatClasses)
  const candidates = [
    data?.combat?.weaponType,
    data?.combat?.weaponName,
    matchingRule?.weaponType,
    COMBAT_CLASS_DETAILS[String(data?.subProfession || '')]?.rangeType,
    COMBAT_CLASS_DETAILS[String(data?.subProfession || '')]?.weaponType,
    COMBAT_CLASS_DETAILS[String(data?.profession || '')]?.rangeType,
    COMBAT_CLASS_DETAILS[String(data?.profession || '')]?.weaponType,
  ].filter(Boolean).map(String)
  return candidates.some(candidate => candidate.includes('melee') || candidate.includes('近战'))
}

function getCombatClassDetail(data: any) {
  return (
    COMBAT_CLASS_DETAILS[String(data?.subProfession || '')]
    || COMBAT_CLASS_DETAILS[String(data?.profession || '')]
    || null
  )
}

function calculateResistByCommonSkill(data: any, field: 'physResist' | 'magicResist') {
  const detail = getCombatClassDetail(data)
  const formula = field === 'physResist' ? detail?.physResistFormula : detail?.magicResistFormula
  const defenseSkill = normalizeCharacterEquipmentV1(data?.rawData).armor.defenseSkill
  if (!formula || !defenseSkill) return null
  const skillValue = getCharacterSkillTotal(data, defenseSkill)
  const extraDefenseSkill = formula.addDefenseSkill ? skillValue : 0
  return Math.round(skillValue * formula.multiplier + formula.bonus + extraDefenseSkill)
}

function calculateCharacterHpMax(data: any, combatClasses: RuleCombatClass[] = []) {
  const armorType = resolveArmorType(data)
  const hpTier = resolveHpTier(data, combatClasses)
  if (!armorType || !hpTier) return null
  const physicalResistance = getAttributeTotal(data?.attributes || [], 'PR')
  const level = clampCharacterLevel(data?.level)
  const upgradeCount = Math.max(0, level - 1)
  const baseRule = ARMOR_HP_BASE_RULES[armorType]
  const growthRule = HP_GROWTH_RULES[hpTier]
  return Math.round(
    physicalResistance * baseRule.baseMultiplier
    + (physicalResistance / growthRule.growthDivisor) * upgradeCount
    + growthRule.levelBonus * upgradeCount,
  )
}

function calculateCharacterSp(data: any, combatClasses: RuleCombatClass[] = []) {
  const phaseIndex = getElitePhaseIndexByLevel(data?.level)
  const spirit = getAttributeTotal(data?.attributes || [], 'SPR')
  const spMax = 9 + phaseIndex * 3
  const eliteCoefficient = (2 + phaseIndex) / 3
  const bonus = Number(data?.combat?.spInitBonus ?? 0) || 0
  const rawInit = spirit * eliteCoefficient + bonus
  const spInit = Math.round(isMeleeCombatClass(data, combatClasses) ? rawInit * 0.5 : rawInit)
  return { spMax, spInit }
}

function calculateCharacterStaminaMax(data: any) {
  const phaseIndex = getElitePhaseIndexByLevel(data?.level)
  const physicalStrength = getAttributeTotal(data?.attributes || [], 'PS')
  const originiumArtsAdaptability = getAttributeTotal(data?.attributes || [], 'OAA')
  return Math.floor((physicalStrength + originiumArtsAdaptability) / 5) + phaseIndex * 2
}

function formatFormulaNumber(value: number) {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function getCombatExpectedValue(
  field: string,
  data: any,
  combatClasses: RuleCombatClass[] = [],
  traitEffects?: TraitEffectSummary,
) {
  const base = field === 'hpMax' ? calculateCharacterHpMax(data, combatClasses)
    : field === 'physResist' ? calculateResistByCommonSkill(data, 'physResist')
      : field === 'magicResist' ? calculateResistByCommonSkill(data, 'magicResist')
        : field === 'spMax' ? calculateCharacterSp(data, combatClasses).spMax
          : field === 'spInit' ? calculateCharacterSp(data, combatClasses).spInit
            : field === 'staminaMax' ? calculateCharacterStaminaMax(data)
              : null
  return base === null ? null : applyTraitCombatModifier(base, traitEffects?.combat[field])
}

function getCombatFormulaText(
  field: string,
  data: any,
  combatClasses: RuleCombatClass[] = [],
  traitEffects?: TraitEffectSummary,
) {
  if (field === 'hpMax') {
    const armorType = resolveArmorType(data)
    const hpTier = resolveHpTier(data, combatClasses)
    if (!armorType || !hpTier) return ''
    const physicalResistance = getAttributeTotal(data?.attributes || [], 'PR')
    const level = clampCharacterLevel(data?.level)
    const upgradeCount = Math.max(0, level - 1)
    const baseRule = ARMOR_HP_BASE_RULES[armorType]
    const growthRule = HP_GROWTH_RULES[hpTier]
    const result = getCombatExpectedValue(field, data, combatClasses, traitEffects)
    return `四舍五入：${armorType}基础 ${physicalResistance} × ${baseRule.baseMultiplier} + ${hpTier}血量成长 ${physicalResistance} ÷ ${growthRule.growthDivisor} × ${upgradeCount} + ${growthRule.levelBonus} × ${upgradeCount} = ${result}`
  }
  if (field === 'physResist' || field === 'magicResist') {
    const detail = getCombatClassDetail(data)
    const formula = field === 'physResist' ? detail?.physResistFormula : detail?.magicResistFormula
    const defenseSkill = normalizeCharacterEquipmentV1(data?.rawData).armor.defenseSkill
    if (!formula || !defenseSkill) return ''
    const skillValue = getCharacterSkillTotal(data, defenseSkill)
    const result = getCombatExpectedValue(field, data, combatClasses, traitEffects)
    const extraDefenseSkill = formula.addDefenseSkill ? ` + 持盾技能 ${skillValue}` : ''
    return `四舍五入：防具依赖技能 ${defenseSkill} ${skillValue} × ${formula.multiplier} + ${formula.bonus}${extraDefenseSkill} = ${result}`
  }
  if (field === 'spMax') {
    const phaseIndex = getElitePhaseIndexByLevel(data?.level)
    return `9 + 精英化阶段 ${phaseIndex} × 3 = ${getCombatExpectedValue(field, data, combatClasses, traitEffects)}`
  }
  if (field === 'spInit') {
    const phaseIndex = getElitePhaseIndexByLevel(data?.level)
    const spirit = getAttributeTotal(data?.attributes || [], 'SPR')
    const eliteCoefficient = (2 + phaseIndex) / 3
    const bonus = Number(data?.combat?.spInitBonus ?? 0) || 0
    const meleeModifier = isMeleeCombatClass(data, combatClasses) ? ' × 50%' : ''
    return `四舍五入：(${spirit} × ${formatFormulaNumber(eliteCoefficient)} + ${bonus})${meleeModifier} = ${getCombatExpectedValue(field, data, combatClasses, traitEffects)}`
  }
  if (field === 'staminaMax') {
    const phaseIndex = getElitePhaseIndexByLevel(data?.level)
    const physicalStrength = getAttributeTotal(data?.attributes || [], 'PS')
    const originiumArtsAdaptability = getAttributeTotal(data?.attributes || [], 'OAA')
    return `向下取整：(${physicalStrength} + ${originiumArtsAdaptability}) ÷ 5 + ${phaseIndex} × 2 = ${getCombatExpectedValue(field, data, combatClasses, traitEffects)}`
  }
  return ''
}

function getEliteSkillCap(elitePhase?: string) {
  const phase = String(elitePhase || '')
  if (/2|二/.test(phase)) return 10
  if (/1|一/.test(phase)) return 7
  return 4
}

function getCappedSkillValue(base: number, growth: number, modifier: number, cap: number) {
  return Math.min(base + growth, cap) + modifier
}

function getCombatStreamBase(skill: any) {
  return getSkillValue(skill, 'value') >= 3 ? 3 : 2
}

function getSkillBaseForStream(stream: (typeof SKILL_STREAMS)[number], skill: any, childSkills: any[]) {
  if (!stream.combat) return 0
  if (stream.commonSkill === skill.name) {
    const siblingBases = childSkills
      .filter(item => item.name !== stream.commonSkill)
      .map(item => getSkillValue(item, 'value'))
    return siblingBases.length > 0 ? Math.max(0, ...siblingBases) : getSkillValue(skill, 'value')
  }
  return getSkillValue(skill, 'value')
}

function getAllocatedSkillPoints(skill: any) {
  const storedValue = Math.max(0, Math.trunc(getSkillValue(skill, 'value')))
  const legacyGrowth = Math.max(0, Math.trunc(getSkillValue(skill, 'growth')))
  return storedValue || legacyGrowth
}

function createEmptySkill(name: string, category: string, isMain = false, maxValue = '0', baseValue = 0) {
  return {
    name,
    category,
    value: baseValue,
    growth: 0,
    modifier: 0,
    isMain,
    maxValue,
  }
}

function syncTraitGrantedSkills(skills: any[] = [], traits: CharacterTrait[] = []) {
  const grants = getTraitGrantedSkills(traits)
  const activeGrantKeys = new Set(grants.map(grant => `${grant.sourceTrait}::${grant.name}`))
  const nextSkills = skills.filter(skill => (
    !skill.sourceTrait || activeGrantKeys.has(`${skill.sourceTrait}::${skill.name}`)
  )).map(skill => ({ ...skill }))

  grants.forEach(grant => {
    const key = `${grant.sourceTrait}::${grant.name}`
    if (nextSkills.some(skill => `${skill.sourceTrait || ''}::${skill.name}` === key)) return
    if (nextSkills.some(skill => !skill.sourceTrait && skill.name === grant.name)) return
    nextSkills.push({
      ...createEmptySkill(grant.name, '附加技能', false, '特质授予', grant.initialValue),
      sourceTrait: grant.sourceTrait,
    })
  })

  return nextSkills
}

function isSameSkill(left: any, right: any) {
  if (left?.id && right?.id) return left.id === right.id
  return (
    String(left?.name || '') === String(right?.name || '') &&
    String(left?.category || '') === String(right?.category || '') &&
    Boolean(left?.isMain) === Boolean(right?.isMain)
  )
}

function findSkill(skills: any[], name: string, category: string | string[], isMain = false) {
  const categories = Array.isArray(category) ? category : [category]
  return skills.find(skill => (
    String(skill.name || '') === name &&
    categories.includes(String(skill.category || '')) &&
    Boolean(skill.isMain) === isMain
  )) || skills.find(skill => (
    String(skill.name || '') === name &&
    categories.includes(String(skill.category || ''))
  ))
}

function getSkillSheetRows(skills: any[] = []) {
  const used = new Set<any>()
  const streams = SKILL_STREAMS.map(stream => {
    const categoryAliases = [stream.dataCategory, stream.category]
    const mainSkill = findSkill(skills, stream.mainName, '', true)
      || findSkill(skills, stream.mainName, categoryAliases, true)
      || findSkill(skills, stream.mainName, categoryAliases, false)
      || createEmptySkill(stream.mainName, stream.combat ? '' : stream.dataCategory, true, stream.combat ? '战斗流派' : '5', stream.combat ? 2 : 0)
    used.add(mainSkill)

    const streamSkillNames = stream.id === 'combat-oaa'
      ? [
          ...stream.skills,
          ...ORIGINIUM_ARTS_SKILLS.filter(skillName => findSkill(skills, skillName, categoryAliases, false)),
        ]
      : stream.skills

    const childSkills = streamSkillNames.map(skillName => {
      const skill = findSkill(skills, skillName, categoryAliases, false)
        || createEmptySkill(
          skillName,
          stream.dataCategory,
          false,
          stream.commonSkill === skillName ? '通识' : getOriginiumArtsCategory(skillName) || '0',
        )
      used.add(skill)
      return skill
    })

    return { ...stream, mainSkill, childSkills }
  })

  const predefinedKeys = new Set(SKILL_STREAMS.flatMap(stream => [
    `main::${stream.mainName}`,
    `${stream.dataCategory}::${stream.mainName}`,
    `${stream.category}::${stream.mainName}`,
    ...(stream.id === 'combat-oaa' ? [...stream.skills, ...ORIGINIUM_ARTS_SKILLS] : stream.skills)
      .flatMap(skillName => [`${stream.dataCategory}::${skillName}`, `${stream.category}::${skillName}`]),
  ]))
  const extras = skills.filter(skill => {
    if (used.has(skill)) return false
    const key = skill.isMain ? `main::${skill.name}` : `${skill.category || ''}::${skill.name}`
    return !predefinedKeys.has(key)
  })

  return { streams, extras }
}

function normalizeNonCombatSkillAllocations(skills: any[] = [], attributes: any[] = [], skillCap: number) {
  const nextSkills = skills.map(skill => ({ ...skill }))
  const sheet = getSkillSheetRows(nextSkills)

  sheet.streams.filter(stream => !stream.combat).forEach(stream => {
    let remaining = Math.max(0, Math.trunc(getAttributeTotal(attributes, stream.attrAbbr)))
    stream.childSkills.forEach(childSkill => {
      const index = nextSkills.findIndex(skill => isSameSkill(skill, childSkill))
      if (index < 0) return
      const allocated = Math.min(getAllocatedSkillPoints(nextSkills[index]), skillCap, remaining)
      nextSkills[index] = { ...nextSkills[index], value: allocated, growth: 0 }
      remaining -= allocated
    })
  })

  return nextSkills
}

function getCharacterSkillTotal(data: any, skillName: string) {
  if (!skillName) return 0
  const skillCap = getEliteSkillCap(getElitePhaseByLevel(data?.level))
  const sheet = getSkillSheetRows(data?.skills || [])
  for (const stream of sheet.streams) {
    const childSkill = stream.childSkills.find(item => item.name === skillName)
    const targetSkill = childSkill || (stream.mainSkill.name === skillName ? stream.mainSkill : null)
    if (!targetSkill) continue
    const base = !stream.combat
      ? getAttributeTotal(data?.attributes || [], stream.attrAbbr)
      : childSkill
        ? getSkillBaseForStream(stream, targetSkill, stream.childSkills)
        : getSkillValue(targetSkill, 'value')
    const allocated = childSkill && !stream.combat
      ? getAllocatedSkillPoints(targetSkill)
      : getSkillValue(targetSkill, 'growth')
    return getCappedSkillValue(
      base,
      allocated,
      getSkillValue(targetSkill, 'modifier'),
      skillCap,
    )
  }
  const extra = sheet.extras.find(skill => skill.name === skillName)
  if (!extra) return 0
  if (extra.sourceTrait) {
    return getSkillValue(extra, 'value') + getSkillValue(extra, 'growth') + getSkillValue(extra, 'modifier')
  }
  return getCappedSkillValue(
    getSkillValue(extra, 'value'),
    getSkillValue(extra, 'growth'),
    getSkillValue(extra, 'modifier'),
    skillCap,
  )
}

function getWeaponDiceSides(data: any, equipment: CharacterEquipmentV1) {
  const detail = getCombatClassDetail(data)
  if (detail?.weaponDiceSides) return detail.weaponDiceSides
  const text = `${detail?.weaponType || ''} ${data?.combat?.weaponDice || ''}`
  const match = text.match(/D(\d+)/i)
  return Math.max(2, Number(match?.[1]) || equipment.weapon.diceSides || 4)
}

function createEquipmentEntry(prefix: string) {
  return { id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: '', effect: '' }
}

function resolveInfectionStage(value: unknown) {
  const numericValue = Number(value) || 0
  if (numericValue < 20) return '未感染'
  if (numericValue < 40) return '感染前期'
  if (numericValue < 60) return '感染中期'
  if (numericValue < 80) return '感染后期'
  return '感染末期'
}

function splitInfectionSymptoms(value: unknown) {
  return String(value || '')
    .split(/[、,，;；\n]/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 4)
}

function mergeInfectionSymptoms(symptoms: string[]) {
  return symptoms.map(item => item.trim()).filter(Boolean).slice(0, 4).join('、')
}

function OptionPickerModal({
  picker,
  currentValue,
  onClose,
  onSelect,
}: {
  picker: NonNullable<OptionPickerState>
  currentValue: string
  onClose: () => void
  onSelect: (field: string, value: string) => void
}) {
  const [query, setQuery] = useState('')
  const [previewOption, setPreviewOption] = useState(currentValue)
  const filtered = picker.options.filter(opt => opt.toLowerCase().includes(query.toLowerCase()))
  const requiresConfirmation = picker.field === 'subProfession'
  const detailOption = (
    previewOption && filtered.includes(previewOption)
      ? previewOption
      : filtered[0]
  )
  const detail = detailOption ? COMBAT_CLASS_DETAILS[detailOption] : null
  const showDetailPanel = requiresConfirmation && Boolean(detailOption)
  const getOptionIcon = (option: string) => {
    if (picker.field === 'profession') return getProfessionIcon(option)
    if (picker.field === 'subProfession') return getSubProfessionIcon(option)
    return null
  }
  const selectOption = (option: string) => {
    if (picker.onSelect) picker.onSelect(option)
    else onSelect(picker.field, option)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: showDetailPanel ? 940 : 640, maxWidth: 'calc(100vw - 32px)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h2 style={{ marginBottom: 0 }}>{picker.title}</h2>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={onClose}>×</button>
        </div>
        <input
          className="input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索选项"
          style={{ marginBottom: 14 }}
          autoFocus
        />
        <div className={`character-picker-layout ${showDetailPanel ? 'with-detail' : ''}`}>
          <div className="character-picker-options">
            {filtered.map(opt => {
              const icon = getOptionIcon(opt)
              return (
                <button
                  key={opt}
                  className={`btn btn-sm character-picker-option ${opt === currentValue ? 'btn-primary' : ''} ${opt === detailOption ? 'preview' : ''}`}
                  onMouseEnter={() => { if (!requiresConfirmation) setPreviewOption(opt) }}
                  onFocus={() => { if (!requiresConfirmation) setPreviewOption(opt) }}
                  onClick={() => {
                    if (requiresConfirmation) setPreviewOption(opt)
                    else selectOption(opt)
                  }}
                >
                  {icon && <img src={icon} alt="" aria-hidden="true" />}
                  <span>{opt}</span>
                </button>
              )
            })}
          </div>
          {showDetailPanel && (
            <aside className="character-class-detail-card">
              <div className="character-class-detail-head">
                <span>{detail?.parentClass || '职业分支'}</span>
                <strong>{detail?.name || detailOption}</strong>
              </div>
              {detail ? <dl>
                <div>
                  <dt>分支特性</dt>
                  <dd>{detail.branchTrait}</dd>
                </div>
                <div>
                  <dt>武器类型</dt>
                  <dd>{detail.weaponType}</dd>
                </div>
                <div>
                  <dt>SP回复</dt>
                  <dd>{detail.spRecovery}</dd>
                </div>
                <div>
                  <dt>攻击范围</dt>
                  <dd>
                    {detail.attackRangeImage ? (
                      <img
                        className="character-attack-range-image"
                        src={detail.attackRangeImage}
                        alt={`${detail.name}攻击范围`}
                      />
                    ) : detail.attackRangePattern ? (
                      <div
                        className="character-attack-range-grid"
                        style={{ gridTemplateColumns: `repeat(${detail.attackRangePattern.columns}, 22px)` }}
                        aria-label={`${detail.name}攻击范围`}
                      >
                        {detail.attackRangePattern.cells.map((cell, index) => (
                          <span
                            key={`${cell}-${index}`}
                            className={`character-attack-range-cell ${cell}`}
                          />
                        ))}
                      </div>
                    ) : (
                      detail.attackRange || '暂未录入'
                    )}
                  </dd>
                </div>
                <div className="character-class-detail-formulas">
                  <span><b>物抗算法</b>{detail.physResistAlgorithm}</span>
                  <span><b>法抗算法</b>{detail.magicResistAlgorithm}</span>
                  <span><b>生命值算法</b>{detail.hpAlgorithm}</span>
                </div>
              </dl> : (
                <div className="character-class-detail-missing">
                  当前战斗职业表未包含该子职业的说明数据。
                </div>
              )}
              <div className="character-class-detail-actions">
                <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>取消</button>
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  disabled={!detailOption}
                  onClick={() => { if (detailOption) selectOption(detailOption) }}
                >
                  确认选择 {detailOption}
                </button>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}

function TraitPickerModal({
  traits,
  selectedTraits,
  selectedType,
  selectedCategory,
  maxSelectable,
  onType,
  onCategory,
  onClose,
  onSelect,
}: {
  traits: RuleTrait[]
  selectedTraits: CharacterTrait[]
  selectedType: TraitType
  selectedCategory: string
  maxSelectable?: number
  onType: (type: TraitType) => void
  onCategory: (category: string) => void
  onClose: () => void
  onSelect: (trait: RuleTrait) => void
}) {
  const typedTraits = traits.filter(trait => inferTraitType(trait) === selectedType)
  const categories = Array.from(new Set(typedTraits.map(getTraitSubcategory).filter(Boolean)))
  const activeCategory = categories.includes(selectedCategory) ? selectedCategory : categories[0] || ''
  const categoryTraits = typedTraits.filter(trait => getTraitSubcategory(trait) === activeCategory)
  const selectedNames = new Set(selectedTraits.map(trait => normalizeTraitName(trait.name)))
  const selectedCount = selectedTraits.filter(trait => inferTraitType(trait) === selectedType).length

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal trait-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="trait-picker-head">
          <div>
            <h2>选择特质</h2>
            <span>
              规则库中的绑定特质会一并加入，修正因子需先选择上级特质。
              {selectedType === 'infection' && ` 当前感染值可选择 ${maxSelectable || 0} 项，已选择 ${selectedCount} 项。`}
            </span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>×</button>
        </div>
        <div className="trait-type-tabs">
          {(Object.keys(TRAIT_TYPE_LABELS) as TraitType[]).map(type => (
            <button
              key={type}
              type="button"
              className={`btn btn-sm ${selectedType === type ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                onType(type)
                const firstCategory = traits.find(trait => inferTraitType(trait) === type)
                onCategory(firstCategory ? getTraitSubcategory(firstCategory) : '')
              }}
            >
              {TRAIT_TYPE_LABELS[type]}
              <span>{traits.filter(trait => inferTraitType(trait) === type).length}</span>
            </button>
          ))}
        </div>
        <div className="trait-picker-layout">
          <div className="trait-category-list">
            {categories.map(category => (
              <button
                key={category}
                className={`btn btn-sm ${category === activeCategory ? 'btn-primary' : ''}`}
                onClick={() => onCategory(category)}
              >
                <span>{category}</span>
                <span>{typedTraits.filter(trait => getTraitSubcategory(trait) === category).length}</span>
              </button>
            ))}
          </div>
          <div className="trait-rule-list">
            {categoryTraits.map(trait => {
              const selected = selectedNames.has(normalizeTraitName(trait.name))
              const parentMissing = Boolean(trait.parentName) && !selectedNames.has(normalizeTraitName(trait.parentName))
              const slotsFull = selectedType === 'infection' && (maxSelectable || 0) <= selectedCount && !selected
              const costLabel = trait.costText || String(trait.cost ?? 0)
              const requirements = parseTraitRequirements(trait.requires).filter(item => item !== '@modifier')
              return (
                <button
                  key={trait.id}
                  className={`trait-rule-option ${selected ? 'selected' : ''}`}
                  disabled={parentMissing || slotsFull || (selected && inferTraitType(trait) !== 'primary')}
                  onClick={() => onSelect(trait)}
                >
                  <span className="trait-rule-title">
                    <strong>{trait.name}</strong>
                    {trait.isModifier && <em>修正因子</em>}
                    <b className={(trait.cost || 0) < 0 ? 'gain' : ''}>{costLabel} 点</b>
                  </span>
                  {trait.description && <span>{trait.description}</span>}
                  {trait.effect && <small>{trait.effect}</small>}
                  {parentMissing && <i>需要先选择：{trait.parentName}</i>}
                  {requirements.length > 0 && <i>绑定：{requirements.join('、')}</i>}
                  {selected && <i>已选择</i>}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function TraitEffectChoiceModal({
  trait,
  groups,
  initialSelections,
  onClose,
  onConfirm,
}: {
  trait: Pick<RuleTrait, 'name' | 'effect'>
  groups: TraitChoiceGroup[]
  initialSelections?: TraitEffectSelection[]
  onClose: () => void
  onConfirm: (selections: TraitEffectSelection[]) => void
}) {
  const [selections, setSelections] = useState<Record<string, string[]>>(() => (
    (initialSelections || []).reduce<Record<string, string[]>>((result, item) => {
      result[item.key] = [...(result[item.key] || []), item.target]
      return result
    }, {})
  ))
  const complete = groups.every(group => {
    const selected = selections[group.key] || []
    return selected.length === (group.selectionCount || 1) && selected.every(option => group.options.includes(option))
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal trait-picker-modal" onClick={event => event.stopPropagation()}>
        <div className="trait-picker-head">
          <div>
            <h2>选择特质修正</h2>
            <span>根据特质规则选择生效目标，选择结果会随角色卡保存。</span>
          </div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>×</button>
        </div>
        <div className="trait-rule-list">
          <strong>{trait.name}</strong>
          {groups.map(group => (
            <div key={group.key} className="originium-arts-group" style={{ marginTop: 12 }}>
              <span>{group.text}{(group.selectionCount || 1) > 1 && `（请选择 ${group.selectionCount} 项）`}</span>
              <div className="originium-arts-options">
                {group.options.map(option => {
                  const selected = (selections[group.key] || []).includes(option)
                  return (
                    <button
                      key={option}
                      type="button"
                      className={`originium-arts-option ${selected ? 'selected' : ''}`}
                      onClick={() => setSelections(current => {
                        const currentValues = current[group.key] || []
                        const requiredCount = group.selectionCount || 1
                        if (selected) return { ...current, [group.key]: currentValues.filter(value => value !== option) }
                        if (requiredCount === 1) return { ...current, [group.key]: [option] }
                        if (currentValues.length >= requiredCount) return current
                        return { ...current, [group.key]: [...currentValues, option] }
                      })}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>取消</button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!complete}
            onClick={() => onConfirm(groups.flatMap(group => (
              (selections[group.key] || []).map(target => ({ key: group.key, target }))
            )))}
          >
            确认选择
          </button>
        </div>
      </div>
    </div>
  )
}

function TraitEntryCard({
  trait,
  editing,
  onUpdate,
  onRemove,
  onChooseEffect,
}: {
  trait: CharacterTrait
  editing: boolean
  onUpdate: (field: string, value: any) => void
  onRemove: () => void
  onChooseEffect?: () => void
}) {
  const type = inferTraitType(trait)
  const subcategory = getTraitSubcategory(trait)
  if (editing) {
    return (
      <article className="trait-entry editing">
        <div className="trait-entry-edit-head">
          <input className="input" value={trait.name || ''} placeholder="特质名称"
            onChange={event => onUpdate('name', event.target.value)} />
          {onChooseEffect && <button className="btn btn-ghost btn-sm" type="button" onClick={onChooseEffect}>选择修正</button>}
          <button className="btn btn-danger btn-sm" type="button" onClick={onRemove}>删除</button>
        </div>
        <div className="trait-entry-edit-grid">
          <label>
            <span>类别</span>
            <select className="input" value={type} onChange={event => onUpdate('type', event.target.value)}>
              {(Object.keys(TRAIT_TYPE_LABELS) as TraitType[]).map(value => (
                <option key={value} value={value}>{TRAIT_TYPE_LABELS[value]}</option>
              ))}
            </select>
          </label>
          <label>
            <span>细分</span>
            {type === 'primary' ? (
              <select className="input" value={subcategory} onChange={event => onUpdate('subcategory', event.target.value)}>
                {PRIMARY_SUBCATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            ) : (
              <input className="input" value={subcategory} onChange={event => onUpdate('subcategory', event.target.value)} />
            )}
          </label>
          <label>
            <span>{type === 'infection' ? '感染特质额度' : type === 'social' ? '社交点消耗' : '特质点消耗'}</span>
            {type === 'infection' ? (
              <small>不消耗特质点，按感染值每 20 点获得 1 个选择额度</small>
            ) : (
              <>
                <input className="input" type="number" value={Number(trait.cost) || 0}
                  onChange={event => onUpdate('cost', Number(event.target.value))} />
                {trait.costText && !/^[-+]?\d+$/.test(trait.costText) && <small>规则值：{trait.costText}</small>}
              </>
            )}
          </label>
          <label>
            <span>上级特质</span>
            <input className="input" value={trait.parentName || ''} placeholder="非修正因子留空"
              onChange={event => onUpdate('parentName', event.target.value)} />
          </label>
        </div>
        <label className="trait-entry-textarea">
          <span>特质描述</span>
          <textarea className="input" value={trait.description || ''}
            onChange={event => onUpdate('description', event.target.value)} />
        </label>
        <label className="trait-entry-textarea">
          <span>特质效果</span>
          <textarea className="input" value={trait.effect || ''}
            onChange={event => onUpdate('effect', event.target.value)} />
        </label>
      </article>
    )
  }

  return (
    <article className="trait-entry">
      <div className="trait-entry-title">
        <strong>{trait.name || '未命名特质'}</strong>
        {trait.isModifier && <span className="badge badge-blue">修正因子</span>}
        {type === 'infection' ? (
          <span className="badge badge-blue">感染值额度</span>
        ) : (
          <span className={`badge ${(trait.cost || 0) < 0 ? 'badge-green' : 'badge-orange'}`}>
            {(trait.cost || 0) > 0 ? `-${trait.cost}` : `+${Math.abs(trait.cost || 0)}`} {type === 'social' ? '社交点' : '特质点'}
          </span>
        )}
      </div>
      {trait.parentName && <small className="trait-entry-parent">上级：{trait.parentName}</small>}
      {trait.description && <p>{trait.description}</p>}
      {trait.effect && <div className="trait-entry-effect">{trait.effect}</div>}
    </article>
  )
}

export default function CharacterDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [char, setChar] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<any>({})
  const [saveMsg, setSaveMsg] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [ruleRaces, setRuleRaces] = useState<any[]>([])
  const [combatClasses, setCombatClasses] = useState<RuleCombatClass[]>([])
  const [ruleTraits, setRuleTraits] = useState<RuleTrait[]>([])
  const [infectionRules, setInfectionRules] = useState<InfectionRules>({})
  const [optionPicker, setOptionPicker] = useState<OptionPickerState>(null)
  const [showTraitPicker, setShowTraitPicker] = useState(false)
  const [traitType, setTraitType] = useState<TraitType>('primary')
  const [traitCategory, setTraitCategory] = useState('')
  const [pendingTraitChoice, setPendingTraitChoice] = useState<PendingTraitChoice | null>(null)
  const [equipmentTab, setEquipmentTab] = useState<EquipmentTabKey>('weapon')
  const importFileRef = useRef<HTMLInputElement>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const saveMessageTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const saveRequestIdRef = useRef(0)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const savedEditSnapshotRef = useRef('')
  const latestEditDataRef = useRef(editData)
  latestEditDataRef.current = editData

  const loadChar = useCallback(async () => {
    try {
      const data = await getCharacter(Number(id))
      setChar(data)
      setEditData(JSON.parse(JSON.stringify(data))) // deep clone
      savedEditSnapshotRef.current = JSON.stringify(data)
      if ((location.state as any)?.startEditing) setEditing(true)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [id, location.state])

  useEffect(() => { loadChar() }, [loadChar])

  useEffect(() => {
    Promise.all([
      getRulesRaces().catch(() => []),
      getRulesCombatClasses().catch(() => []),
      getRulesTraits().catch(() => []),
      getRulesInfection().catch(() => ({})),
    ]).then(([races, classes, traits, infection]) => {
      setRuleRaces(races)
      setCombatClasses(classes)
      setRuleTraits(traits)
      setInfectionRules(infection)
      const firstCategory = traits.find((trait: RuleTrait) => inferTraitType(trait) === 'primary')
      const primaryCategory = firstCategory ? getTraitSubcategory(firstCategory) : ''
      if (primaryCategory) setTraitCategory(primaryCategory)
    })
  }, [])

  const buildCharacterPayload = useCallback((source: any) => {
    const nextEditData = {
      ...source,
      level: clampCharacterLevel(source.level),
      elitePhase: getElitePhaseByLevel(source.level),
    }
    const normalizedSkills = normalizeNonCombatSkillAllocations(
      syncTraitGrantedSkills(nextEditData.skills || [], nextEditData.traits || []),
      applyTraitModifiersToData(nextEditData, getTraitEffectSummary(nextEditData.traits || [], nextEditData.level)).attributes || [],
      getEliteSkillCap(nextEditData.elitePhase),
    )
    return {
      name: nextEditData.name, player: nextEditData.player, gender: nextEditData.gender,
      age: nextEditData.age, birthday: nextEditData.birthday, origin: nextEditData.origin,
      race: nextEditData.race, profession: nextEditData.profession,
      subProfession: nextEditData.subProfession,
      level: nextEditData.level, elitePhase: nextEditData.elitePhase,
      height: nextEditData.height, weight: nextEditData.weight,
      attributes: nextEditData.attributes,
      combat: nextEditData.combat,
      infection: nextEditData.infection,
      skills: normalizedSkills,
      traits: nextEditData.traits,
      traitBudget: nextEditData.traitBudget,
      rawData: nextEditData.rawData,
    }
  }, [])

  const persistCharacter = useCallback((source: any, automatic: boolean, snapshot = JSON.stringify(source)) => {
    const requestId = ++saveRequestIdRef.current
    const runSave = async () => {
      if (!automatic) setSaveMsg('正在保存...')
      else setSaveMsg('正在自动保存...')

      try {
        const updated = await updateCharacter(Number(id), buildCharacterPayload(source))
        if (requestId !== saveRequestIdRef.current) return

        setChar(updated)
        const latestSnapshot = JSON.stringify(latestEditDataRef.current)
        if (!automatic || latestSnapshot === snapshot) {
          const updatedSnapshot = JSON.stringify(updated)
          savedEditSnapshotRef.current = updatedSnapshot
          setEditData(JSON.parse(JSON.stringify(updated)))
        }

        if (!automatic) {
          setEditing(false)
          setSaveMsg('保存成功 ✓')
        } else if (latestSnapshot === snapshot) {
          setSaveMsg('已自动保存')
        }
        if (saveMessageTimerRef.current != null) window.clearTimeout(saveMessageTimerRef.current)
        saveMessageTimerRef.current = window.setTimeout(() => setSaveMsg(''), automatic ? 1400 : 2000)
      } catch (err: any) {
        if (requestId !== saveRequestIdRef.current) return
        setSaveMsg(`${automatic ? '自动保存失败' : '保存失败'}: ${err.response?.data?.error || err.message}`)
      }
    }

    const queuedSave = saveQueueRef.current.then(runSave, runSave)
    saveQueueRef.current = queuedSave.catch(() => undefined)
    return queuedSave
  }, [buildCharacterPayload, id])

  useEffect(() => {
    if (!editing || !char) return
    const snapshot = JSON.stringify(editData)
    if (snapshot === savedEditSnapshotRef.current) return

    if (autoSaveTimerRef.current != null) window.clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null
      void persistCharacter(latestEditDataRef.current, true, snapshot)
    }, 700)

    return () => {
      if (autoSaveTimerRef.current != null) {
        window.clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
    }
  }, [char, editData, editing, persistCharacter])

  useEffect(() => () => {
    if (autoSaveTimerRef.current != null) window.clearTimeout(autoSaveTimerRef.current)
    if (saveMessageTimerRef.current != null) window.clearTimeout(saveMessageTimerRef.current)
  }, [])

  const handleSave = () => {
    if (!editing) return
    if (autoSaveTimerRef.current != null) {
      window.clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    void persistCharacter(editData, false)
  }

  const handleImportCharacter = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportMsg('正在解析 Excel 文件...')
    try {
      const result = await uploadCharacterSheet(file)
      setImportMsg('正在导入角色卡数据...')
      const imported = await importCharacter(result.fileName)
      const characterId = imported.characterId || imported.character?.id
      setImportMsg('导入成功，正在打开角色卡...')
      if (characterId) navigate(`/characters/${characterId}`)
      setTimeout(() => setImportMsg(''), 2500)
    } catch (err: any) {
      setImportMsg(`导入失败：${err.response?.data?.error || err.message}`)
    } finally {
      setImporting(false)
      if (importFileRef.current) importFileRef.current.value = ''
    }
  }

  // === Edit helpers ===
  const updAttr = (attrName: string, field: string, val: number) => {
    const attrs = [...(editData.attributes || [])]
    const attrId = getAttributeId(attrName)
    const meta = resolveAttributeMeta(attrName)
    const idx = attrs.findIndex(attr => getAttributeId(attr) === attrId)
    const nextAttr = {
      name: meta.name,
      abbr: meta.abbr,
      base: 0,
      modifier: 0,
      growth: 0,
      ...(idx >= 0 ? attrs[idx] : {}),
      [field]: val,
    }
    if (idx >= 0) attrs[idx] = nextAttr
    else attrs.push(nextAttr)
    setEditData({
      ...editData,
      attributes: attrs,
      skills: normalizeNonCombatSkillAllocations(
        editData.skills || [],
        applyTraitModifiersToData({ ...editData, attributes: attrs }, getTraitEffectSummary(editData.traits || [], editData.level)).attributes || [],
        getEliteSkillCap(getElitePhaseByLevel(editData.level)),
      ),
    })
  }
  const updCombat = (field: string, val: any) => {
    setEditData({ ...editData, combat: { ...(editData.combat || {}), [field]: val } })
  }
  const updInfection = (field: string, val: any) => {
    const infection = { ...DEFAULT_INFECTION, ...(editData.infection || {}), [field]: val }
    if (field === 'currentValue') infection.stage = resolveInfectionStage(val)
    setEditData({ ...editData, infection })
  }
  const updInfectionSymptom = (idx: number, val: string) => {
    const symptoms = splitInfectionSymptoms(editData.infection?.symptoms)
    while (symptoms.length < 4) symptoms.push('')
    symptoms[idx] = val === '无感染' ? '' : val
    updInfection('symptoms', mergeInfectionSymptoms(symptoms))
  }
  const upsertSkillPatch = (targetSkill: any, patch: Record<string, any>) => {
    const skills = [...(editData.skills || [])]
    const idx = skills.findIndex(skill => isSameSkill(skill, targetSkill))
    const nextSkill = {
      ...createEmptySkill(targetSkill.name || '', targetSkill.category || '', Boolean(targetSkill.isMain), targetSkill.maxValue || '0'),
      ...(idx >= 0 ? skills[idx] : targetSkill),
      ...patch,
    }
    if (idx >= 0) skills[idx] = nextSkill
    else skills.push(nextSkill)
    setEditData({ ...editData, skills })
  }
  const upsertSkill = (targetSkill: any, field: string, val: any) => {
    upsertSkillPatch(targetSkill, { [field]: val })
  }
  const updateSkillPoints = (stream: (typeof SKILL_STREAMS)[number], targetSkill: any, val: number) => {
    const requested = Math.max(0, Math.trunc(Number(val) || 0))
    const currentSkillCap = getEliteSkillCap(getElitePhaseByLevel(editData.level))

    if (stream.combat) {
      const sheetStream = getSkillSheetRows(editData.skills || []).streams.find(item => item.id === stream.id)
      const base = targetSkill.isMain
        ? getCombatStreamBase(targetSkill)
        : getSkillBaseForStream(stream, targetSkill, sheetStream?.childSkills || [])
      upsertSkillPatch(targetSkill, { growth: Math.min(requested, Math.max(0, currentSkillCap - base)) })
      return
    }

    const sheetStream = getSkillSheetRows(editData.skills || []).streams.find(item => item.id === stream.id)
    const effectiveAttributes = applyTraitModifiersToData(editData, getTraitEffectSummary(editData.traits || [], editData.level)).attributes || []
    const pool = Math.max(0, Math.trunc(getAttributeTotal(effectiveAttributes, stream.attrAbbr)))
    const usedByOthers = (sheetStream?.childSkills || [])
      .filter(skill => !isSameSkill(skill, targetSkill))
      .reduce((sum, skill) => sum + getAllocatedSkillPoints(skill), 0)
    const available = Math.max(0, pool - usedByOthers)
    const allocated = Math.min(requested, currentSkillCap, available)
    upsertSkillPatch(targetSkill, { value: allocated, growth: 0 })
  }
  const updateCombatSkillBase = (targetSkill: any, val: number) => {
    const currentSkillCap = getEliteSkillCap(getElitePhaseByLevel(editData.level))
    const base = Math.min(currentSkillCap, Math.max(0, Math.trunc(Number(val) || 0)))
    const growth = Math.min(getSkillValue(targetSkill, 'growth'), Math.max(0, currentSkillCap - base))
    upsertSkillPatch(targetSkill, { value: base, growth })
  }
  const updateExtraSkillPoints = (targetSkill: any, val: number) => {
    const currentSkillCap = getEliteSkillCap(getElitePhaseByLevel(editData.level))
    const base = getSkillValue(targetSkill, 'value')
    const growth = Math.min(
      Math.max(0, Math.trunc(Number(val) || 0)),
      Math.max(0, currentSkillCap - base),
    )
    upsertSkillPatch(targetSkill, { growth })
  }
  const updateExtraSkillBase = (targetSkill: any, val: number) => {
    const currentSkillCap = getEliteSkillCap(getElitePhaseByLevel(editData.level))
    const base = Math.min(currentSkillCap, Math.max(0, Math.trunc(Number(val) || 0)))
    const growth = Math.min(getSkillValue(targetSkill, 'growth'), Math.max(0, currentSkillCap - base))
    upsertSkillPatch(targetSkill, { value: base, growth })
  }
  const addExtraSkill = () => {
    const skills = [
      ...(editData.skills || []),
      createEmptySkill('', '附加技能', false, '特殊'),
    ]
    setEditData({ ...editData, skills })
  }
  const chooseCombatSkillStream = (streamId: string) => {
    const skills = [...(editData.skills || [])]
    SKILL_STREAMS.filter(stream => stream.combat).forEach(stream => {
      const value = stream.id === streamId ? 3 : 2
      const idx = skills.findIndex(skill => (
        [stream.dataCategory, stream.category].includes(String(skill.name || '')) &&
        Boolean(skill.isMain)
      ))
      const nextSkill = {
        ...createEmptySkill(stream.dataCategory, '', true, '战斗流派', value),
        ...(idx >= 0 ? skills[idx] : {}),
        name: stream.dataCategory,
        category: '',
        isMain: true,
        value,
      }
      if (idx >= 0) skills[idx] = nextSkill
      else skills.push(nextSkill)
    })
    setEditData({ ...editData, skills })
  }
  const removeSkill = (targetSkill: any) => {
    const skills = (editData.skills || []).filter((skill: any) => !isSameSkill(skill, targetSkill))
    setEditData({ ...editData, skills })
  }
  const addOriginiumArtsSkill = (skillName: string) => {
    upsertSkill(
      createEmptySkill(skillName, '源石技艺理论', false, getOriginiumArtsCategory(skillName), 0),
      'value',
      0,
    )
  }
  const combatClassOptions = mergeCombatClassOptions(combatClasses)
  const raceOptions = ruleRaces.slice(0, RACE_OPTION_COUNT).map(r => r.name)
  const professionOptions = Array.from(new Set(combatClassOptions.map(cls => cls.branch).filter(Boolean)))
  const subProfessionOptions = combatClassOptions
    .filter(cls => !editData.profession || cls.branch === editData.profession)
    .map(cls => cls.name)
  const symptomOptions = INFECTION_SYMPTOM_OPTIONS
  const treatmentOptions = Array.from(new Set([
    ...(infectionRules.treatments || []),
    ...FALLBACK_INFECTION_TREATMENTS,
  ].filter(Boolean)))

  const openPicker = (field: string, title: string, options: string[], onSelect?: (value: string) => void) => {
    setOptionPicker({ field, title, options, onSelect })
  }

  const applyFieldOption = (field: string, value: string) => {
    setEditData({ ...editData, [field]: value })
  }

  const applyProfession = (value: string) => {
    const validSubProfession = combatClassOptions.find(cls => cls.branch === value && cls.name === editData.subProfession)
    setEditData({
      ...editData,
      profession: value,
      subProfession: validSubProfession ? editData.subProfession : '',
    })
  }

  const addTraitFromRule = (trait: RuleTrait, effectSelections: TraitEffectSelection[] = []) => {
    const choiceGroups = getTraitChoiceGroups(trait.effect)
    if (choiceGroups.length > 0 && choiceGroups.some(group => (
      effectSelections.filter(item => item.key === group.key && group.options.includes(item.target)).length !== (group.selectionCount || 1)
    ))) {
      setPendingTraitChoice({ trait, groups: choiceGroups, mode: 'add' })
      return
    }
    const nextTraits: CharacterTrait[] = [...(editData.traits || [])]
    const addRule = (rule: RuleTrait, trail = new Set<string>()) => {
      const nameKey = normalizeTraitName(rule.name)
      if (!nameKey || trail.has(nameKey)) return
      trail.add(nameKey)
      const type = inferTraitType(rule)
      const subcategory = getTraitSubcategory(rule)
      const duplicateIndex = nextTraits.findIndex(item => normalizeTraitName(item.name) === nameKey)
      if (duplicateIndex >= 0) return
      if (type === 'primary') {
        const previousIndex = nextTraits.findIndex(item => (
          inferTraitType(item) === 'primary' && getTraitSubcategory(item) === subcategory
        ))
        if (previousIndex >= 0) nextTraits.splice(previousIndex, 1)
      }
      nextTraits.push({
        ...rule,
        description: rule.description || '',
        effect: rule.effect || '',
        cost: Number(rule.cost) || 0,
        category: subcategory,
        subcategory,
        type,
        pointType: type === 'social' ? 'social' : type === 'infection' ? 'none' : 'trait',
        effectSelections: normalizeTraitName(rule.name) === normalizeTraitName(trait.name) ? effectSelections : [],
        parentName: rule.parentName || '',
        isModifier: Boolean(rule.isModifier || rule.parentName),
        source: 'rule',
      })
      for (const requiredName of parseTraitRequirements(rule.requires)) {
        if (requiredName === '@modifier') continue
        const requiredKey = normalizeTraitName(requiredName)
        const requiredBase = requiredKey.split('（')[0]
        const requiredRule = ruleTraits.find(item => normalizeTraitName(item.name) === requiredKey)
          || ruleTraits.find(item => {
            const candidate = normalizeTraitName(item.name)
            return candidate.startsWith(`${requiredBase}（`) && /名称|内容|目标/.test(candidate)
          })
        if (requiredRule) addRule({ ...requiredRule, name: requiredName }, trail)
      }
    }
    addRule(trait)
    setEditData({
      ...editData,
      traits: nextTraits,
      skills: syncTraitGrantedSkills(editData.skills || [], nextTraits),
    })
  }
  const openTraitEffectChoice = (trait: CharacterTrait) => {
    const groups = getTraitChoiceGroups(trait.effect)
    if (groups.length > 0) setPendingTraitChoice({ trait, groups, mode: 'update' })
  }
  const confirmTraitEffectChoice = (effectSelections: TraitEffectSelection[]) => {
    if (!pendingTraitChoice) return
    const pending = pendingTraitChoice
    setPendingTraitChoice(null)
    if (pending.mode === 'add') {
      addTraitFromRule(pending.trait as RuleTrait, effectSelections)
      return
    }
    const traits = [...(editData.traits || [])]
    const index = traits.findIndex(item => (
      (pending.trait.id && item.id === pending.trait.id)
      || (item.name === pending.trait.name && item.category === pending.trait.category)
    ))
    if (index >= 0) {
      traits[index] = { ...traits[index], effectSelections }
      setEditData({
        ...editData,
        traits,
        skills: syncTraitGrantedSkills(editData.skills || [], traits),
      })
    }
  }
  const addManualTrait = () => {
    const type: TraitType = 'secondary'
    const subcategory = TRAIT_TYPE_LABELS[type]
    const nextTrait: CharacterTrait = {
      id: -Date.now(),
      name: '',
      description: '',
      effect: '',
      cost: 0,
      costText: '',
      category: subcategory,
      subcategory,
      type,
      pointType: 'trait',
      effectSelections: [],
      parentName: '',
      isModifier: false,
      source: 'manual',
    }
    setEditData({ ...editData, traits: [...(editData.traits || []), nextTrait] })
  }
  const removeTrait = (idx: number) => {
    const removed = (editData.traits || [])[idx]
    const removedName = normalizeTraitName(removed?.name)
    const traits = (editData.traits || []).filter((trait: CharacterTrait, i: number) => (
      i !== idx && normalizeTraitName(trait.parentName) !== removedName
    ))
    setEditData({
      ...editData,
      traits,
      skills: syncTraitGrantedSkills(editData.skills || [], traits),
    })
  }
  const updTrait = (idx: number, field: string, val: any) => {
    const traits = [...(editData.traits || [])]
    if (traits[idx]) {
      traits[idx] = { ...traits[idx], [field]: val }
      if (field === 'type') {
        traits[idx].pointType = val === 'social' ? 'social' : 'trait'
        traits[idx].category = TRAIT_TYPE_LABELS[val as TraitType]
        traits[idx].subcategory = TRAIT_TYPE_LABELS[val as TraitType]
      }
      if (field === 'subcategory') traits[idx].category = val
      if (field === 'parentName') traits[idx].isModifier = Boolean(val)
    }
    setEditData({ ...editData, traits })
  }

  if (loading) return <div className="loading-page"><div className="spinner"/><span>加载角色卡...</span></div>
  if (!char) return <div className="loading-page"><span>角色不存在</span></div>

  const sourceData = editing ? editData : char
  const data = {
    ...sourceData,
    level: clampCharacterLevel(sourceData.level),
    elitePhase: getElitePhaseByLevel(sourceData.level),
  }
  const traitEffects = getTraitEffectSummary(data.traits || [], data.level)
  const effectiveData = applyTraitModifiersToData(data, traitEffects)
  const attrs = getMedicalAttributeRows(data.attributes || [])
  const effectiveAttrs = getMedicalAttributeRows(effectiveData.attributes || [])
  const combat = data.combat
  const infection = {
    ...DEFAULT_INFECTION,
    ...(data.infection || {}),
    stage: resolveInfectionStage(data.infection?.currentValue),
  }
  const infectionSymptoms = splitInfectionSymptoms(infection.symptoms)
  const skills = data.skills || []
  const skillSheet = getSkillSheetRows(skills)
  const skillCap = getEliteSkillCap(data.elitePhase)
  const skillAttributeGroups = ATTR_DEFINITIONS.map(attr => ({
    ...attr,
    streams: skillSheet.streams.filter(stream => stream.attrAbbr === attr.abbr),
  })).filter(group => group.streams.length > 0)
  const equipment = normalizeCharacterEquipmentV1(data.rawData)
  const weaponDiceSides = getWeaponDiceSides(data, equipment)
  const weaponAttributeValue = getAttributeTotal(effectiveAttrs, equipment.weapon.attribute)
  const weaponSkillOptions = skillSheet.streams
    .filter(stream => stream.attrAbbr === equipment.weapon.attribute)
    .flatMap(stream => stream.childSkills.map(skill => skill.name))
  const uniqueWeaponSkillOptions = Array.from(new Set(weaponSkillOptions))
  const weaponSkillValue = getCharacterSkillTotal(effectiveData, equipment.weapon.attackSkill)
  const weaponEfficiencyDice = `${weaponSkillValue}d${weaponDiceSides}+${weaponAttributeValue}`
  const weaponAssistDice = `${weaponSkillValue}d2`
  const armorType = resolveArmorType(data) || equipment.armor.armorType || ''
  const armorSkillValue = getCharacterSkillTotal(effectiveData, equipment.armor.defenseSkill)
  const traits: CharacterTrait[] = data.traits || []
  const traitBudget = normalizeTraitBudget(data.traitBudget)
  const traitBudgetSummary = calculateTraitBudget(traits, traitBudget)
  const infectionTraitSlots = getInfectionTraitSlots(data.infection?.currentValue)
  const infectionTraitCount = traits.filter(trait => inferTraitType(trait) === 'infection').length
  const currentCharmForSocial = Math.max(0, Math.trunc(getAttributeTotal(effectiveAttrs, 'APP')))
  const socialRollNeedsRefresh = editing && currentCharmForSocial !== traitBudget.socialDiceCount
  const selectedTraitNames = new Set(traits.map(trait => normalizeTraitName(trait.name)))
  const primaryMissing = PRIMARY_SUBCATEGORIES.filter(subcategory => !traits.some(trait => (
    inferTraitType(trait) === 'primary' && getTraitSubcategory(trait) === subcategory
  )))
  const traitWarnings = [
    ...primaryMissing.map(subcategory => `主要特质缺少“${subcategory}”`),
    ...traits.flatMap(trait => {
      const rule = ruleTraits.find(item => normalizeTraitName(item.name) === normalizeTraitName(trait.name))
      const parentName = trait.parentName || rule?.parentName || ''
      const messages: string[] = []
      if (parentName && !selectedTraitNames.has(normalizeTraitName(parentName))) {
        messages.push(`“${trait.name}”缺少上级特质“${parentName}”`)
      }
      for (const requiredName of parseTraitRequirements(rule?.requires)) {
        if (requiredName === '@modifier') {
          if (!traits.some(item => normalizeTraitName(item.parentName) === normalizeTraitName(trait.name))) {
            messages.push(`“${trait.name}”需要至少一个修正因子`)
          }
        } else if (!selectedTraitNames.has(normalizeTraitName(requiredName))) {
          messages.push(`“${trait.name}”绑定了“${requiredName}”`)
        }
      }
      return messages
    }),
    ...(traitBudgetSummary.traitRemaining < 0 ? [`特质点不足 ${Math.abs(traitBudgetSummary.traitRemaining)} 点`] : []),
    ...(traitBudgetSummary.traitLimitRemaining < 0 ? [`正向消耗超过上限 ${Math.abs(traitBudgetSummary.traitLimitRemaining)} 点`] : []),
    ...(traitBudgetSummary.socialRemaining < 0 ? [`社交点不足 ${Math.abs(traitBudgetSummary.socialRemaining)} 点`] : []),
    ...(infectionTraitCount > infectionTraitSlots
      ? [`当前感染值只能支持 ${infectionTraitSlots} 项感染特质，当前已选择 ${infectionTraitCount} 项`]
      : []),
    ...traitEffects.choices.map(({ traitName, group }) => `“${traitName}”需要为“${group.text}”选择生效目标`),
  ]
  const professionIcon = getProfessionIcon(data.profession)
  const subProfessionIcon = getSubProfessionIcon(data.subProfession)
  const elitePhaseIcon = getElitePhaseIcon(data.elitePhase)
  const levelIcon = getLevelIcon(data.level)

  const updateEquipment = (updater: (equipment: CharacterEquipmentV1) => CharacterEquipmentV1) => {
    const current = normalizeCharacterEquipmentV1(editData.rawData)
    const next = updater(current)
    setEditData({
      ...editData,
      rawData: writeCharacterEquipmentV1(editData.rawData, next),
    })
  }

  const generateSocialPoints = () => {
    let total = 0
    for (let index = 0; index < currentCharmForSocial; index++) total += Math.floor(Math.random() * 6) + 1
    setEditData({
      ...editData,
      traitBudget: {
        ...normalizeTraitBudget(editData.traitBudget),
        socialDiceCount: currentCharmForSocial,
        socialPointsRolled: total,
      },
    })
  }

  const updateWeapon = (patch: Partial<CharacterEquipmentV1['weapon']>) => {
    updateEquipment(current => ({
      ...current,
      weapon: { ...current.weapon, ...patch },
    }))
  }

  const updateArmor = (patch: Partial<CharacterEquipmentV1['armor']>) => {
    updateEquipment(current => ({
      ...current,
      armor: { ...current.armor, ...patch },
    }))
  }

  const addEquipmentListItem = (listKey: 'throwables' | 'consumables') => {
    updateEquipment(current => ({
      ...current,
      [listKey]: [...current[listKey], createEquipmentEntry(listKey)],
    }))
  }

  const updateEquipmentListItem = (
    listKey: 'throwables' | 'consumables',
    itemId: string,
    patch: { name?: string; effect?: string },
  ) => {
    updateEquipment(current => ({
      ...current,
      [listKey]: current[listKey].map(item => (
        item.id === itemId ? { ...item, ...patch } : item
      )),
    }))
  }

  const removeEquipmentListItem = (listKey: 'throwables' | 'consumables', itemId: string) => {
    updateEquipment(current => ({
      ...current,
      [listKey]: current[listKey].filter(item => item.id !== itemId),
    }))
  }

  return (
    <>
      <div className="top-header">
        <button className="btn btn-ghost" onClick={() => navigate('/characters')}>← 返回</button>
        <span className="page-title">{data.name || '未命名角色'}</span>
        <div className="character-identity-strip">
          <span className="character-icon-badge character-icon-badge-profession">
            {professionIcon && <img src={professionIcon} alt="" aria-hidden="true" />}
            <span>{data.profession || '未知职业'}</span>
          </span>
          {data.subProfession && (
            <span className="character-icon-badge character-icon-badge-subclass">
              {subProfessionIcon && <img src={subProfessionIcon} alt="" aria-hidden="true" />}
              <span>{data.subProfession}</span>
            </span>
          )}
          <span className="character-icon-badge character-icon-badge-elite">
            <img src={elitePhaseIcon} alt="" aria-hidden="true" />
            <span>{data.elitePhase || '阶段零'}</span>
          </span>
          <span className="character-icon-badge character-icon-badge-level">
            <img src={levelIcon} alt="" aria-hidden="true" />
            <span>Lv.{data.level || 1}</span>
          </span>
        </div>
        <div className="spacer" />
        {importMsg && (
          <span style={{
            fontSize: 13,
            color: importMsg.includes('成功')
              ? 'var(--color-green)'
              : importMsg.includes('失败')
                ? 'var(--color-red)'
                : 'var(--color-orange)',
            marginRight: 12,
          }}>
            {importMsg}
          </span>
        )}
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => importFileRef.current?.click()} disabled={importing}>
          {importing ? '导入中...' : '导入 Excel'}
        </button>
        <input
          ref={importFileRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={handleImportCharacter}
        />
        {saveMsg && <span style={{
          fontSize: 13,
          color: saveMsg.includes('失败')
            ? 'var(--color-red)'
            : saveMsg.includes('正在')
              ? 'var(--color-orange)'
              : 'var(--color-green)',
          marginRight: 12,
        }}>{saveMsg}</span>}
        {editing ? (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              if (JSON.stringify(editData) === savedEditSnapshotRef.current) setEditing(false)
              else handleSave()
            }}
          >
            完成编辑
          </button>
        ) : (
          <button className="btn btn-sm" onClick={() => {
            const nextEditData = JSON.parse(JSON.stringify(char))
            savedEditSnapshotRef.current = JSON.stringify(nextEditData)
            setEditData(nextEditData)
            setEditing(true)
          }}>✏️ 编辑</button>
        )}
      </div>

      <div className="page-content">

        <CharacterProfileCard
          data={data}
          editing={editing}
          onChange={setEditData}
        />

        {/* Row 1: Basic + Attributes */}
        <div className="grid-2" style={{ marginBottom: 24 }}>
          {/* Basic Info */}
          <div className="card">
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--color-orange)' }}>📋 基础档案</h3>
            {editing ? (
              <div className="grid-2 gap-2">
                {['name', 'player', 'gender', 'age', 'birthday', 'origin', 'race', 'profession', 'subProfession', 'height', 'weight'].map(f => (
                  <div key={f}><label>{BASIC_FIELD_LABELS[f] || f}</label>
                    {f === 'race' ? (
                      <button
                        className="input"
                        style={{ textAlign: 'left', cursor: 'pointer' }}
                        onClick={() => openPicker('race', '选择种族', raceOptions)}
                      >
                        {editData.race || '请选择种族'}
                      </button>
                    ) : f === 'profession' ? (
                      <button
                        className="input"
                        style={{ textAlign: 'left', cursor: 'pointer' }}
                        onClick={() => openPicker('profession', '选择职业', professionOptions, applyProfession)}
                      >
                        {editData.profession || '请选择职业'}
                      </button>
                    ) : f === 'subProfession' ? (
                      <button
                        className="input"
                        style={{ textAlign: 'left', cursor: 'pointer' }}
                        onClick={() => openPicker('subProfession', '选择子职业', subProfessionOptions)}
                        disabled={subProfessionOptions.length === 0}
                      >
                        {editData.subProfession || (editData.profession ? '请选择子职业' : '请先选择职业')}
                      </button>
                    ) : (
                      <input className="input" value={editData[f] || ''}
                        onChange={e => setEditData({ ...editData, [f]: e.target.value })} />
                    )}
                  </div>
                ))}
                <div><label>精英化阶段</label>
                  <input className="input" value={getElitePhaseByLevel(editData.level)} readOnly />
                </div>
                <div><label>等级</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={15}
                    value={clampCharacterLevel(editData.level)}
                    onChange={e => setEditData({
                      ...editData,
                      level: clampCharacterLevel(e.target.value),
                      elitePhase: getElitePhaseByLevel(e.target.value),
                    })}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                {[['姓名', data.name], ['玩家', data.player], ['性别', data.gender],
                  ['年龄', data.age], ['生日', data.birthday], ['出身', data.origin],
                  ['种族', data.race], ['职业', data.profession],
                  ['子职业', data.subProfession], ['精英化阶段', data.elitePhase], ['等级', `Lv.${data.level}`],
                  ['身高', data.height], ['体重', data.weight],
                ].map(([label, val]) => (
                  <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{val || '-'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Attributes */}
          <div className="card">
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: 'var(--color-orange)' }}>📊 综合体检测试</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 14 }}>总值 = 基础 + 手动修正 + 成长 + 特质修正</p>
            <div className="medical-attr-table">
              <div className="medical-attr-row medical-attr-head">
                <span>属性</span>
                <span>总值</span>
                <span>基础</span>
                <span>修正</span>
                <span>成长</span>
              </div>
              {attrs.length === 0 ? (
                <p className="character-structure-empty">等待 Excel 导入或手动补充属性数据</p>
              ) : attrs.map((attr: any, i: number) => {
                const meta = resolveAttributeMeta(attr.name)
                const base = Number(attr.base) || 0
                const modifier = Number(attr.modifier) || 0
                const growth = Number(attr.growth) || 0
                const traitModifier = traitEffects.attributes[meta.abbr] || 0
                const total = base + modifier + growth + traitModifier
                return (
                  <div key={attr.name || i} className="medical-attr-row">
                    <span className="medical-attr-name">
                      <b style={{ color: meta.color }}>{meta.name}</b>
                      <em>{meta.abbr}</em>
                    </span>
                    <span className="medical-attr-total" style={{ color: meta.color }}>
                      {total}{traitModifier !== 0 && <small>特质 {formatTraitModifier(traitModifier)}</small>}
                    </span>
                    {editing ? (
                      <>
                        <input className="input" type="number" value={base}
                          onChange={e => updAttr(attr.name, 'base', Number(e.target.value))} title="基础" />
                        <input className="input" type="number" value={modifier}
                          onChange={e => updAttr(attr.name, 'modifier', Number(e.target.value))}
                          title={`手动修正${traitModifier ? `；特质修正 ${formatTraitModifier(traitModifier)}` : ''}`} />
                        <input className="input" type="number" value={growth}
                          onChange={e => updAttr(attr.name, 'growth', Number(e.target.value))} title="成长" />
                      </>
                    ) : (
                      <>
                        <span>{base}</span>
                        <span>{modifier}{traitModifier !== 0 && <small> + 特质 {formatTraitModifier(traitModifier)}</small>}</span>
                        <span>{growth}</span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Row 2: Combat + Infection */}
        <div className="grid-2" style={{ marginBottom: 24 }}>
          {/* Combat */}
          {combat && (
            <div className="card">
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--color-orange)' }}>⚔️ 战斗数据</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {editing ? (
                  <>
                    {['hpMax', 'physResist', 'magicResist', 'spMax', 'spInitBonus', 'spInit', 'elemResist', 'weight', 'staminaMax'].map(f => {
                      const expectedValue = getCombatExpectedValue(f, effectiveData, combatClasses, traitEffects)
                      const formulaText = getCombatFormulaText(f, effectiveData, combatClasses, traitEffects)
                      const storedValue = Number(editData.combat?.[f] ?? 0)
                      const traitModifier = traitEffects.combat[f]
                      const value = applyTraitCombatModifier(storedValue, traitModifier)
                      const traitNote = traitModifier && (traitModifier.flat || traitModifier.percent)
                        ? `特质修正：${traitModifier.flat ? formatTraitModifier(traitModifier.flat) : ''}${traitModifier.percent ? ` ${formatTraitModifier(traitModifier.percent)}%` : ''}`
                        : ''
                      const differsFromFormula = expectedValue !== null && value !== expectedValue
                      return (
                      <div key={f} className={formulaText ? 'combat-derived-field' : undefined}>
                        <label className="combat-field-label">
                          <span>{COMBAT_NUMBER_FIELD_LABELS[f] || f}</span>
                          {differsFromFormula && (
                            <em>偏离公式值 {expectedValue}</em>
                          )}
                        </label>
                        <input
                          className={`input ${differsFromFormula ? 'combat-input-mismatch' : ''}`}
                          type="number"
                          value={storedValue}
                          onChange={e => updCombat(f, Number(e.target.value))}
                        />
                        {traitNote && <span className="combat-formula-note">{traitNote}；当前最终值 {value}</span>}
                        {formulaText && (
                          <span className="combat-formula-note">{formulaText}</span>
                        )}
                      </div>
                      )
                    })}
                  </>
                ) : (
                  <>
                    {[['生命值', 'hpMax', '#ff6b6b'], ['物理抗性', 'physResist', '#ffa940'],
                      ['法术抗性', 'magicResist', '#4096ff'], ['技力上限', 'spMax', '#13c2c2'],
                      ['初动补正', 'spInitBonus', '#9f7aea'], ['初动', 'spInit', '#722ed1'],
                      ['元素韧性', 'elemResist', '#52c41a'],
                      ['重量等级', 'weight', '#aaa'], ['耐力上限', 'staminaMax', '#ffa940'],
                    ].map(([label, field, color]) => {
                      const value = applyTraitCombatModifier(Number(combat[field] ?? 0), traitEffects.combat[field])
                      return (
                      <div key={label as string} style={{ textAlign: 'center', padding: 10, background: 'var(--bg-panel)', borderRadius: 8 }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: color as string }}>{value || '-'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
                      </div>
                      )
                    })}
                  </>
                )}
              </div>
            </div>
          )}

          <div className="card character-equipment-card">
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--color-orange)' }}>🧰 武器和装备</h3>
            <div className="equipment-tabs">
              {EQUIPMENT_TABS.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  className={`btn btn-sm ${equipmentTab === tab.key ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setEquipmentTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {equipmentTab === 'weapon' && (
              <div className="equipment-panel">
                <div className="grid-2 gap-2">
                  <div>
                    <label>武器名称</label>
                    <input className="input" value={equipment.weapon.name} disabled={!editing}
                      onChange={e => updateWeapon({ name: e.target.value })} />
                  </div>
                  <div>
                    <label>所属分支</label>
                    <input className="input" value={equipment.weapon.branch} disabled={!editing}
                      onChange={e => updateWeapon({ branch: e.target.value })} />
                  </div>
                  <div>
                    <label>防御技能</label>
                    <select className="input" value={equipment.weapon.hasDefenseSkill ? 'yes' : 'no'} disabled={!editing}
                      onChange={e => updateWeapon({ hasDefenseSkill: e.target.value === 'yes' })}>
                      <option value="no">无</option>
                      <option value="yes">有</option>
                    </select>
                  </div>
                  <div>
                    <label>武器骰面</label>
                    <input className="input" value={`D${weaponDiceSides}`} readOnly />
                  </div>
                  <div>
                    <label>攻击类型</label>
                    <select className="input" value={equipment.weapon.attackType} disabled={!editing}
                      onChange={e => updateWeapon({ attackType: e.target.value as CharacterEquipmentV1['weapon']['attackType'] })}>
                      <option value="melee">近战</option>
                      <option value="ranged">远程</option>
                    </select>
                  </div>
                  <div>
                    <label>伤害类型</label>
                    <select className="input" value={equipment.weapon.damageType} disabled={!editing}
                      onChange={e => updateWeapon({ damageType: e.target.value as CharacterEquipmentV1['weapon']['damageType'] })}>
                      <option value="physical">物理</option>
                      <option value="arts">法术</option>
                    </select>
                  </div>
                  <div>
                    <label>依赖属性</label>
                    <select className="input" value={equipment.weapon.attribute} disabled={!editing}
                      onChange={e => updateWeapon({
                        attribute: e.target.value as CharacterEquipmentV1['weapon']['attribute'],
                        attackSkill: '',
                      })}>
                      {EQUIPMENT_ATTRIBUTE_OPTIONS.map(option => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>属性值</label>
                    <input className="input" value={weaponAttributeValue} readOnly />
                  </div>
                  <div>
                    <label>攻击技能</label>
                    <select className="input" value={equipment.weapon.attackSkill} disabled={!editing}
                      onChange={e => updateWeapon({ attackSkill: e.target.value })}>
                      <option value="">请选择技能</option>
                      {uniqueWeaponSkillOptions.map(skillName => (
                        <option key={skillName} value={skillName}>{skillName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>技能值</label>
                    <input className="input" value={weaponSkillValue} readOnly />
                  </div>
                  <div>
                    <label>效能骰</label>
                    <input className="input" value={weaponEfficiencyDice} readOnly />
                  </div>
                  <div>
                    <label>辅助骰</label>
                    <input className="input" value={weaponAssistDice} readOnly />
                  </div>
                </div>
                <div>
                  <label>武器描述</label>
                  <textarea className="input equipment-textarea" value={equipment.weapon.description} disabled={!editing}
                    onChange={e => updateWeapon({ description: e.target.value })} />
                </div>
              </div>
            )}

            {equipmentTab === 'armor' && (
              <div className="equipment-panel">
                <div className="grid-2 gap-2">
                  <div>
                    <label>防具名称</label>
                    <input className="input" value={equipment.armor.name} disabled={!editing}
                      onChange={e => updateArmor({ name: e.target.value })} />
                  </div>
                  <div>
                    <label>防具类型</label>
                    <input className="input" value={armorType || '未识别'} readOnly />
                  </div>
                  <div>
                    <label>依赖技能</label>
                    <select className="input" value={equipment.armor.defenseSkill} disabled={!editing}
                      onChange={e => updateArmor({ defenseSkill: e.target.value as CharacterEquipmentV1['armor']['defenseSkill'] })}>
                      {DEFENSE_SKILL_OPTIONS.map(skillName => (
                        <option key={skillName} value={skillName}>{skillName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>技能值</label>
                    <input className="input" value={armorSkillValue} readOnly />
                  </div>
                </div>
                <div>
                  <label>防具描述</label>
                  <textarea className="input equipment-textarea" value={equipment.armor.description} disabled={!editing}
                    onChange={e => updateArmor({ description: e.target.value })} />
                </div>
              </div>
            )}

            {(equipmentTab === 'throwables' || equipmentTab === 'consumables') && (
              <div className="equipment-panel">
                {editing && (
                  <button className="btn btn-sm" type="button" onClick={() => addEquipmentListItem(equipmentTab)}>
                    ＋ 添加{equipmentTab === 'throwables' ? '投掷物' : '消耗物'}
                  </button>
                )}
                {(equipment[equipmentTab].length === 0) ? (
                  <p className="character-structure-empty">暂无条目</p>
                ) : equipment[equipmentTab].map(item => (
                  <div key={item.id} className="equipment-list-entry">
                    <input className="input" placeholder="名称" value={item.name} disabled={!editing}
                      onChange={e => updateEquipmentListItem(equipmentTab, item.id, { name: e.target.value })} />
                    <textarea className="input equipment-textarea" placeholder="使用效果" value={item.effect} disabled={!editing}
                      onChange={e => updateEquipmentListItem(equipmentTab, item.id, { effect: e.target.value })} />
                    {editing && (
                      <button className="btn btn-danger btn-sm" type="button" onClick={() => removeEquipmentListItem(equipmentTab, item.id)}>
                        删除
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {equipmentTab === 'summons' && (
              <div className="equipment-panel">
                <p className="character-structure-empty">召唤物接口预留，后续可接入独立召唤物模板与棋盘 TOKEN。</p>
              </div>
            )}
          </div>

          {/* Infection */}
          <div className="card">
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--color-orange)' }}>🦠 临床诊断分析</h3>
              {editing ? (
                <div className="grid-2 gap-2">
                  {['immunity', 'initialValue', 'currentValue'].map(f => (
                    <div key={f}><label>{INFECTION_FIELD_LABELS[f]}</label>
                      <input className="input" type="number" value={infection[f as keyof typeof DEFAULT_INFECTION] ?? 0}
                        min={0}
                        max={f === 'currentValue' ? 100 : undefined}
                        onChange={e => updInfection(f, Number(e.target.value))} />
                    </div>
                  ))}
                  <div><label>{INFECTION_FIELD_LABELS.stage}</label>
                    <input className="input" value={resolveInfectionStage(infection.currentValue)} readOnly />
                  </div>
                  <div className="infection-symptom-editor"><label>{INFECTION_FIELD_LABELS.symptoms}</label>
                    <div className="infection-symptom-grid">
                      {Array.from({ length: 4 }).map((_, idx) => {
                        const value = infectionSymptoms[idx] || ''
                        return (
                          <div key={idx} className="infection-symptom-slot">
                            <span>症状 {idx + 1}</span>
                            <div className="input-with-action">
                              <input className="input" value={value}
                                placeholder={idx === 0 ? '选择或输入固化症状' : '可选'}
                                onChange={e => updInfectionSymptom(idx, e.target.value)} />
                              <button className="btn btn-sm" onClick={() => openPicker(
                                `symptoms-${idx}`,
                                `选择固化症状 ${idx + 1}`,
                                symptomOptions,
                                selected => updInfectionSymptom(idx, selected),
                              )}>选择</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div><label>{INFECTION_FIELD_LABELS.longTerm}</label>
                    <div className="input-with-action">
                      <input className="input" value={editData.infection?.longTerm || ''}
                        onChange={e => updInfection('longTerm', e.target.value)} />
                      <button className="btn btn-sm" onClick={() => openPicker(
                        'longTerm',
                        '选择长期疗程',
                        treatmentOptions,
                        value => updInfection('longTerm', value),
                      )}>选择</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                  {[['免疫力', infection.immunity], ['初始感染值', infection.initialValue],
                    ['感染值', infection.currentValue], ['感染阶段', resolveInfectionStage(infection.currentValue)],
                    ['固化症状', infectionSymptoms.length > 0 ? infectionSymptoms.join(' / ') : '无'],
                    ['长期疗程', infection.longTerm || '无'],
                  ].map(([label, val]) => (
                    <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-color)' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{label}</span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{val || '-'}</span>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>

        {/* Skills */}
        <div className="card skill-sheet-card">
          <div className="skill-sheet-header">
            <div>
              <h3>📚 技能表单</h3>
              <p>非战斗流派的基础值等于所属属性，每个流派的加点池独立等于该属性；单项加点上限为 {skillCap}，特质修正不计入上限。战斗流派沿用基础值 + 加点 + 修正规则。</p>
            </div>
            {editing && <button className="btn btn-sm" onClick={addExtraSkill}>＋ 附加技能</button>}
          </div>

          <div className="skill-attribute-grid">
            {skillAttributeGroups.map(group => {
              const attrTotal = getAttributeTotal(effectiveAttrs, group.abbr)
              return (
                <details key={group.abbr} className="skill-attribute-group">
                  <summary className="skill-attribute-title">
                    <span className="skill-attribute-name" style={{ color: group.color }}>{group.name}</span>
                    <span>{group.abbr} · 基础属性 {attrTotal} · {group.streams.length} 个流派</span>
                  </summary>
                  <div className="skill-stream-stack">
                    {group.streams.map(stream => {
                      const streamBase = stream.combat
                        ? getCombatStreamBase(stream.mainSkill)
                        : attrTotal
                      const streamGrowth = stream.combat ? getSkillValue(stream.mainSkill, 'growth') : 0
                      const streamManualModifier = getSkillValue(stream.mainSkill, 'modifier')
                      const streamTraitModifier = traitEffects.skills[stream.mainSkill.name] || 0
                      const streamModifier = streamManualModifier + streamTraitModifier
                      const streamTotal = stream.combat
                        ? getCappedSkillValue(streamBase, streamGrowth, streamModifier, skillCap)
                        : streamBase + streamModifier
                      const streamAllocated = stream.combat
                        ? 0
                        : stream.childSkills.reduce((sum, skill) => sum + getAllocatedSkillPoints(skill), 0)
                      const streamPool = stream.combat ? 0 : attrTotal
                      return (
                        <section key={stream.id} className={`skill-stream ${stream.combat ? 'combat' : ''}`}>
                          <div className="skill-stream-title">
                            <div>
                              <strong>{stream.category}</strong>
                              <span>{stream.combat ? '战斗技能流派' : '技能流派'}</span>
                            </div>
                            <div className="skill-stream-meta">
                              {stream.combat && <span className="badge badge-red">战斗</span>}
                              {stream.combat && streamBase >= 3 && <span className="badge badge-green">基础值 3</span>}
                              {editing && stream.combat && streamBase < 3 && (
                                <button className="btn btn-sm" onClick={() => chooseCombatSkillStream(stream.id)}>选择为 3</button>
                              )}
                              {!stream.combat && (
                                <span className={`badge ${streamAllocated > streamPool ? 'badge-red' : 'badge-green'}`}>
                                  加点 {streamAllocated}/{streamPool}
                                </span>
                              )}
                              <span className="badge badge-blue">技能值 {streamTotal}</span>
                            </div>
                          </div>
                          {editing && stream.id === 'combat-oaa' && (
                            <div className="originium-arts-picker">
                              {ORIGINIUM_ARTS_GROUPS.map(group => (
                                <div key={group.category} className="originium-arts-group">
                                  <span>{group.category}</span>
                                  <div className="originium-arts-options">
                                    {group.skills.map(skillName => {
                                      const selected = stream.childSkills.some(skill => skill.name === skillName)
                                      return (
                                        <button
                                          key={skillName}
                                          type="button"
                                          className={`originium-arts-option ${selected ? 'selected' : ''}`}
                                          disabled={selected}
                                          onClick={() => addOriginiumArtsSkill(skillName)}
                                        >
                                          {skillName}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="skill-main-row">
                            <span>流派</span>
                            {editing ? (
                              <>
                                <input className="input" type="number" value={streamBase}
                                  readOnly
                                  onChange={e => upsertSkill(stream.mainSkill, 'value', Number(e.target.value))} />
                                <input className="input" type="number" value={streamGrowth}
                                  readOnly={!stream.combat}
                                  onChange={e => updateSkillPoints(stream, stream.mainSkill, Number(e.target.value))} />
                                <input className="input" type="number" value={streamManualModifier}
                                  onChange={e => upsertSkill(stream.mainSkill, 'modifier', Number(e.target.value))}
                                  title={`手动修正${streamTraitModifier ? `；特质修正 ${formatTraitModifier(streamTraitModifier)}` : ''}`} />
                                <b>{streamTotal}</b>
                                <span>{skillCap}</span>
                              </>
                            ) : (
                              <>
                                <span>{streamBase}</span>
                                <span>{streamGrowth}</span>
                                <span>{streamModifier}{streamTraitModifier !== 0 && <small>（特质 {formatTraitModifier(streamTraitModifier)}）</small>}</span>
                                <b>{streamTotal}</b>
                                <span>{skillCap}</span>
                              </>
                            )}
                          </div>
                          <div className="skill-row skill-row-head">
                            <span>技能</span>
                            <span>基础值</span>
                            <span>加点</span>
                            <span>修正</span>
                            <span>技能值</span>
                            <span>上限</span>
                          </div>
                          {stream.childSkills.map(skill => {
                            const isCommon = stream.commonSkill === skill.name
                            const isOriginiumArtsSkill = stream.id === 'combat-oaa' && ORIGINIUM_ARTS_SKILLS.includes(skill.name)
                            const skillBase = getSkillBaseForStream(stream, skill, stream.childSkills)
                            const skillGrowth = stream.combat
                              ? getSkillValue(skill, 'growth')
                              : getAllocatedSkillPoints(skill)
                            const skillManualModifier = getSkillValue(skill, 'modifier')
                            const skillTraitModifier = traitEffects.skills[skill.name] || 0
                            const skillModifier = skillManualModifier + skillTraitModifier
                            const skillTotal = getCappedSkillValue(skillBase, skillGrowth, skillModifier, skillCap)
                            return (
                              <div key={`${stream.id}-${skill.name}`} className="skill-row">
                                <span className="skill-name">
                                  {isCommon && <em>◎</em>}
                                  {skill.name}
                                  {isOriginiumArtsSkill && <small>{getOriginiumArtsCategory(skill.name)}</small>}
                                  {editing && isOriginiumArtsSkill && (
                                    <button
                                      type="button"
                                      className="skill-inline-remove"
                                      aria-label={`删除${skill.name}`}
                                      onClick={() => removeSkill(skill)}
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                                {editing ? (
                                  <>
                                    <input className="input" type="number" value={skillBase}
                                      readOnly={!stream.combat || isCommon}
                                      onChange={e => updateCombatSkillBase(skill, Number(e.target.value))} />
                                    <input className="input" type="number" value={skillGrowth}
                                      onChange={e => updateSkillPoints(stream, skill, Number(e.target.value))} />
                                    <input className="input" type="number" value={skillManualModifier}
                                      onChange={e => upsertSkill(skill, 'modifier', Number(e.target.value))}
                                      title={`手动修正${skillTraitModifier ? `；特质修正 ${formatTraitModifier(skillTraitModifier)}` : ''}`} />
                                    <b className={skillTotal < 0 ? 'skill-fail' : ''}>{skillTotal}</b>
                                    <span>{skillCap}</span>
                                  </>
                                ) : (
                                  <>
                                    <span>{skillBase}</span>
                                    <span>{skillGrowth}</span>
                                    <span>{skillModifier}{skillTraitModifier !== 0 && <small>（特质 {formatTraitModifier(skillTraitModifier)}）</small>}</span>
                                    <b className={skillTotal < 0 ? 'skill-fail' : ''}>{skillTotal}</b>
                                    <span>{skillCap}</span>
                                  </>
                                )}
                              </div>
                            )
                          })}
                        </section>
                      )
                    })}
                  </div>
                </details>
              )
            })}
          </div>

          <section className="skill-extra-section">
            <div className="skill-extra-title">
              <strong>附加技能</strong>
              <span>语言、模组技能、特质附属技能等无固定基础属性的技能</span>
            </div>
            {skillSheet.extras.length === 0 ? (
              <p className="character-structure-empty">暂无附加技能</p>
            ) : (
              <div className="skill-extra-list">
                {skillSheet.extras.map((skill, index) => (
                  <div key={skill.id || index} className="skill-extra-row">
                    {(() => {
                      const skillBase = getSkillValue(skill, 'value')
                      const skillGrowth = getSkillValue(skill, 'growth')
                      const skillManualModifier = getSkillValue(skill, 'modifier')
                      const skillTraitModifier = traitEffects.skills[skill.name] || 0
                      const skillModifier = skillManualModifier + skillTraitModifier
                      const skillTotal = skill.sourceTrait
                        ? skillBase + skillGrowth + skillModifier
                        : getCappedSkillValue(skillBase, skillGrowth, skillModifier, skillCap)
                      return editing ? (
                        <>
                          <input className="input" value={skill.name || ''} placeholder="技能名称"
                            onChange={e => upsertSkill(skill, 'name', e.target.value)} />
                          <input className="input" value={skill.category || ''} placeholder="分类"
                            onChange={e => upsertSkill(skill, 'category', e.target.value)} />
                          <input className="input" type="number" value={skillBase}
                            onChange={e => updateExtraSkillBase(skill, Number(e.target.value))} />
                          <input className="input" type="number" value={skillGrowth}
                            onChange={e => updateExtraSkillPoints(skill, Number(e.target.value))} />
                          <input className="input" type="number" value={skillManualModifier}
                            onChange={e => upsertSkill(skill, 'modifier', Number(e.target.value))}
                            title={`手动修正${skillTraitModifier ? `；特质修正 ${formatTraitModifier(skillTraitModifier)}` : ''}`} />
                          <b className={skillTotal < 0 ? 'skill-fail' : ''}>{skillTotal}</b>
                          <span>{skill.sourceTrait ? '特质授予' : skillCap}</span>
                          <button className="btn btn-danger btn-sm" onClick={() => removeSkill(skill)}>删除</button>
                        </>
                      ) : (
                        <>
                          <strong>{skill.name || `附加技能 ${index + 1}`}{skill.sourceTrait && <small>（{skill.sourceTrait}）</small>}</strong>
                          <span>{skill.category || '附加技能'}</span>
                          <span>{skillBase}</span>
                          <span>{skillGrowth}</span>
                          <span>{skillModifier}{skillTraitModifier !== 0 && <small>（特质 {formatTraitModifier(skillTraitModifier)}）</small>}</span>
                          <b className={skillTotal < 0 ? 'skill-fail' : ''}>{skillTotal}</b>
                          <span>{skill.sourceTrait ? '特质授予' : skillCap}</span>
                        </>
                      )
                    })()}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Traits */}
        <section className="card character-traits-card">
          <div className="character-traits-head">
            <div>
              <h3>特质</h3>
              <span>主要、次要和感染特质使用特质点；社交特质使用社交点。</span>
            </div>
            {editing && (
              <div className="character-traits-actions">
                <button className="btn btn-ghost btn-sm" type="button" onClick={addManualTrait}>手动编写</button>
                <button className="btn btn-primary btn-sm" type="button" onClick={() => setShowTraitPicker(true)}>选择特质</button>
              </div>
            )}
          </div>

          <div className="trait-budget-grid">
            <div className={traitBudgetSummary.traitRemaining < 0 ? 'invalid' : ''}>
              <span>剩余特质点</span>
              <strong>{traitBudgetSummary.traitRemaining}</strong>
              <small>{traitBudgetSummary.traitPointsBase} 基础 + {traitBudgetSummary.traitGained} 获得 - {traitBudgetSummary.traitSpent} 消耗</small>
            </div>
            <div className={traitBudgetSummary.traitLimitRemaining < 0 ? 'invalid' : ''}>
              <span>特质点消耗上限</span>
              <strong>{traitBudgetSummary.traitSpent} / {traitBudgetSummary.traitPointsLimit}</strong>
              <small>负值特质不会提高 80 点消耗上限</small>
            </div>
            <div className={traitBudgetSummary.socialRemaining < 0 ? 'invalid' : ''}>
              <span>剩余社交点</span>
              <strong>{traitBudgetSummary.socialRemaining}</strong>
              <small>{traitBudgetSummary.socialDiceCount}D6 = {traitBudgetSummary.socialPointsRolled}，+ {traitBudgetSummary.socialGained} - {traitBudgetSummary.socialSpent}</small>
              {socialRollNeedsRefresh && (
                <button className="btn btn-ghost btn-sm trait-social-roll" type="button" onClick={generateSocialPoints}>
                  按当前个人魅力 {currentCharmForSocial}D6 生成
                </button>
              )}
            </div>
          </div>

          {traitWarnings.length > 0 && (
            <div className="trait-warning-list">
              {Array.from(new Set(traitWarnings)).map(message => <span key={message}>{message}</span>)}
            </div>
          )}

          {(Object.keys(TRAIT_TYPE_LABELS) as TraitType[]).map(type => {
            const typeTraits = traits.filter(trait => inferTraitType(trait) === type)
            return (
              <section key={type} className="trait-type-section">
                <div className="trait-type-heading">
                  <strong>{TRAIT_TYPE_LABELS[type]}</strong>
                  <span>{type === 'infection' ? `${typeTraits.length} / ${infectionTraitSlots}` : typeTraits.length}</span>
                </div>
                {type === 'primary' ? (
                  <div className="trait-primary-grid">
                    {PRIMARY_SUBCATEGORIES.map(subcategory => {
                      const trait = typeTraits.find(item => getTraitSubcategory(item) === subcategory)
                      const index = trait ? traits.indexOf(trait) : -1
                      return (
                        <div key={subcategory} className="trait-primary-slot">
                          <b>{subcategory}</b>
                          {trait ? (
                            <TraitEntryCard trait={trait} editing={editing}
                              onUpdate={(field, value) => updTrait(index, field, value)}
                              onRemove={() => removeTrait(index)}
                              onChooseEffect={getTraitChoiceGroups(trait.effect).length > 0 ? () => openTraitEffectChoice(trait) : undefined} />
                          ) : (
                            <span className="trait-empty-slot">尚未选择</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : typeTraits.length > 0 ? (
                  <div className="trait-entry-grid">
                    {typeTraits.map(trait => {
                      const index = traits.indexOf(trait)
                      return (
                        <TraitEntryCard key={trait.id || `${trait.name}-${index}`} trait={trait} editing={editing}
                          onUpdate={(field, value) => updTrait(index, field, value)}
                          onRemove={() => removeTrait(index)}
                          onChooseEffect={getTraitChoiceGroups(trait.effect).length > 0 ? () => openTraitEffectChoice(trait) : undefined} />
                      )
                    })}
                  </div>
                ) : (
                  <span className="trait-empty-section">暂无{TRAIT_TYPE_LABELS[type]}</span>
                )}
              </section>
            )
          })}
        </section>

      </div>
      {optionPicker && (
        <OptionPickerModal
          picker={optionPicker}
          currentValue={editData[optionPicker.field] || ''}
          onClose={() => setOptionPicker(null)}
          onSelect={applyFieldOption}
        />
      )}
      {showTraitPicker && (
        <TraitPickerModal
          traits={ruleTraits}
          selectedTraits={editData.traits || []}
          selectedType={traitType}
          selectedCategory={traitCategory}
          maxSelectable={traitType === 'infection' ? getInfectionTraitSlots(editData.infection?.currentValue) : undefined}
          onType={setTraitType}
          onCategory={setTraitCategory}
          onClose={() => setShowTraitPicker(false)}
          onSelect={addTraitFromRule}
        />
      )}
      {pendingTraitChoice && (
        <TraitEffectChoiceModal
          trait={pendingTraitChoice.trait}
          groups={pendingTraitChoice.groups}
          initialSelections={normalizeTraitEffectSelections(pendingTraitChoice.trait.effectSelections)}
          onClose={() => setPendingTraitChoice(null)}
          onConfirm={confirmTraitEffectChoice}
        />
      )}
    </>
  )
}
