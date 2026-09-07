export type TraitType = 'primary' | 'secondary' | 'infection' | 'social'

export type TraitBudgetInput = {
  traitPointsBase?: number
  traitPointsLimit?: number
  socialDiceCount?: number
  socialPointsRolled?: number
}

export function getInfectionTraitSlots(infectionValue: unknown) {
  return Math.max(0, Math.floor((Number(infectionValue) || 0) / 20))
}

export const DEFAULT_TRAIT_BUDGET = {
  traitPointsBase: 40,
  traitPointsLimit: 80,
  socialDiceCount: 0,
  socialPointsRolled: 0,
}

function finiteInteger(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : fallback
}

function normalizeEffectSelections(value: unknown) {
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

export function normalizeTraitName(value: unknown) {
  return String(value || '').replace(/\*/g, '').replace(/\s+/g, '').trim()
}

export function inferTraitType(trait: any): TraitType {
  const category = String(trait?.subcategory || trait?.category || '')
  if (['种族', '文化', '工作'].includes(category)) return 'primary'
  if (category.includes('社交')) return 'social'
  if (category.includes('感染')) return 'infection'
  if (['primary', 'secondary', 'infection', 'social'].includes(trait?.type)) return trait.type
  return 'secondary'
}

export function normalizeCharacterTrait(trait: any, index = 0) {
  const type = inferTraitType(trait)
  const category = String(trait?.category || trait?.subcategory || '')
  return {
    name: String(trait?.name || '').trim(),
    description: String(trait?.description || ''),
    effect: String(trait?.effect || ''),
    cost: finiteInteger(trait?.cost),
    category,
    type,
    subcategory: String(trait?.subcategory || category),
    parentName: String(trait?.parentName || ''),
    pointType: type === 'social' ? 'social' : type === 'infection' ? 'none' : 'trait',
    effectSelections: normalizeEffectSelections(trait?.effectSelections),
    source: String(trait?.source || 'manual'),
    isModifier: Boolean(trait?.isModifier || trait?.parentName),
    sortOrder: finiteInteger(trait?.sortOrder, index),
  }
}

export function normalizeTraitBudget(input: TraitBudgetInput | null | undefined) {
  return {
    traitPointsBase: Math.max(0, finiteInteger(input?.traitPointsBase, DEFAULT_TRAIT_BUDGET.traitPointsBase)),
    traitPointsLimit: Math.max(0, finiteInteger(input?.traitPointsLimit, DEFAULT_TRAIT_BUDGET.traitPointsLimit)),
    socialDiceCount: Math.max(0, finiteInteger(input?.socialDiceCount, DEFAULT_TRAIT_BUDGET.socialDiceCount)),
    socialPointsRolled: Math.max(0, finiteInteger(input?.socialPointsRolled, DEFAULT_TRAIT_BUDGET.socialPointsRolled)),
  }
}

export function rollSocialPoints(diceCount: number) {
  const count = Math.max(0, finiteInteger(diceCount))
  let total = 0
  for (let index = 0; index < count; index++) total += Math.floor(Math.random() * 6) + 1
  return total
}

export function calculateTraitBudget(traits: any[], budgetInput?: TraitBudgetInput | null) {
  const budget = normalizeTraitBudget(budgetInput)
  const normalized = traits.map(normalizeCharacterTrait).filter(trait => trait.name)
  const traitCosts = normalized.filter(trait => trait.pointType === 'trait' && trait.type !== 'infection').map(trait => trait.cost)
  const socialCosts = normalized.filter(trait => trait.pointType === 'social').map(trait => trait.cost)
  const traitSpent = traitCosts.filter(cost => cost > 0).reduce((sum, cost) => sum + cost, 0)
  const traitGained = Math.abs(traitCosts.filter(cost => cost < 0).reduce((sum, cost) => sum + cost, 0))
  const socialSpent = socialCosts.filter(cost => cost > 0).reduce((sum, cost) => sum + cost, 0)
  const socialGained = Math.abs(socialCosts.filter(cost => cost < 0).reduce((sum, cost) => sum + cost, 0))

  return {
    ...budget,
    traitSpent,
    traitGained,
    traitRemaining: budget.traitPointsBase + traitGained - traitSpent,
    traitLimitRemaining: budget.traitPointsLimit - traitSpent,
    socialSpent,
    socialGained,
    socialRemaining: budget.socialPointsRolled + socialGained - socialSpent,
  }
}

function parseRequirements(value: unknown) {
  if (Array.isArray(value)) return value.map(String)
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export function validateTraitSelection(
  traits: any[],
  budgetInput: TraitBudgetInput | null | undefined,
  rules: any[],
  infectionValue: unknown = 0,
) {
  const seenNames = new Set<string>()
  const normalized = traits
    .map(normalizeCharacterTrait)
    .filter(trait => trait.name)
    .filter(trait => {
      const key = normalizeTraitName(trait.name)
      if (seenNames.has(key)) return false
      seenNames.add(key)
      return true
    })
  const budget = calculateTraitBudget(normalized, budgetInput)
  const names = new Set(normalized.map(trait => normalizeTraitName(trait.name)))
  const rulesByName = new Map(rules.map(rule => [normalizeTraitName(rule.name), rule]))
  const errors: string[] = []
  const infectionSlots = getInfectionTraitSlots(infectionValue)
  const infectionCount = normalized.filter(trait => trait.type === 'infection').length
  if (infectionCount > infectionSlots) {
    errors.push(`当前感染值只能选择 ${infectionSlots} 项感染特质，当前已选择 ${infectionCount} 项`)
  }

  for (const subcategory of ['种族', '文化', '工作']) {
    const count = normalized.filter(trait => trait.type === 'primary' && trait.subcategory === subcategory).length
    if (count > 1) errors.push(`主要特质“${subcategory}”只能选择一个`)
  }

  for (const trait of normalized) {
    const rule = rulesByName.get(normalizeTraitName(trait.name))
    const parentName = trait.parentName || rule?.parentName || ''
    if (parentName && !names.has(normalizeTraitName(parentName))) {
      errors.push(`修正因子“${trait.name}”需要先选择上级特质“${parentName}”`)
    }

    const requirements = parseRequirements(rule?.requires)
    for (const requiredName of requirements) {
      if (requiredName === '@modifier') {
        const hasModifier = normalized.some(item => (
          normalizeTraitName(item.parentName) === normalizeTraitName(trait.name)
        ))
        if (!hasModifier) errors.push(`特质“${trait.name}”必须同时选择至少一个修正因子`)
      } else if (!names.has(normalizeTraitName(requiredName))) {
        errors.push(`特质“${trait.name}”绑定了特质“${requiredName}”，需要同时选择`)
      }
    }
  }

  if (budget.traitSpent > budget.traitPointsLimit) {
    errors.push(`特质点正向消耗为 ${budget.traitSpent}，超过 ${budget.traitPointsLimit} 点消耗上限`)
  }
  if (budget.traitRemaining < 0) errors.push(`特质点不足，还缺少 ${Math.abs(budget.traitRemaining)} 点`)
  if (budget.socialRemaining < 0) errors.push(`社交点不足，还缺少 ${Math.abs(budget.socialRemaining)} 点`)

  return { normalized, budget, errors: Array.from(new Set(errors)) }
}
