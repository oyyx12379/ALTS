export type TraitType = 'primary' | 'secondary' | 'infection' | 'social'

export type RuleTrait = {
  id: number
  name: string
  description?: string
  effect?: string
  cost?: number
  costText?: string
  category?: string
  type?: TraitType
  subcategory?: string
  parentName?: string
  requires?: string | string[]
  isModifier?: boolean
  source?: string
}

export type CharacterTrait = RuleTrait & {
  pointType?: 'trait' | 'social' | 'none'
  sortOrder?: number
  effectSelections?: import('./traitEffects').TraitEffectSelection[] | string
}

export type TraitBudget = {
  traitPointsBase: number
  traitPointsLimit: number
  socialDiceCount: number
  socialPointsRolled: number
}

export const TRAIT_TYPE_LABELS: Record<TraitType, string> = {
  primary: '主要特质',
  secondary: '次要特质',
  infection: '感染特质',
  social: '社交特质',
}

export const PRIMARY_SUBCATEGORIES = ['种族', '文化', '工作'] as const

export function inferTraitType(trait: Partial<CharacterTrait>): TraitType {
  const category = String(trait.subcategory || trait.category || '')
  if (PRIMARY_SUBCATEGORIES.includes(category as typeof PRIMARY_SUBCATEGORIES[number])) return 'primary'
  if (category.includes('社交')) return 'social'
  if (category.includes('感染')) return 'infection'
  if (trait.type && TRAIT_TYPE_LABELS[trait.type]) return trait.type
  return 'secondary'
}

export function getTraitSubcategory(trait: Partial<CharacterTrait>) {
  return String(trait.subcategory || trait.category || TRAIT_TYPE_LABELS[inferTraitType(trait)])
}

export function normalizeTraitName(value: unknown) {
  return String(value || '').replace(/\*/g, '').replace(/\s+/g, '').trim()
}

export function getInfectionTraitSlots(infectionValue: unknown) {
  return Math.max(0, Math.floor((Number(infectionValue) || 0) / 20))
}

export function parseTraitRequirements(value: RuleTrait['requires']) {
  if (Array.isArray(value)) return value.map(String)
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export function normalizeTraitBudget(value: Partial<TraitBudget> | null | undefined): TraitBudget {
  return {
    traitPointsBase: Number.isFinite(Number(value?.traitPointsBase)) ? Number(value?.traitPointsBase) : 40,
    traitPointsLimit: Number.isFinite(Number(value?.traitPointsLimit)) ? Number(value?.traitPointsLimit) : 80,
    socialDiceCount: Math.max(0, Number(value?.socialDiceCount) || 0),
    socialPointsRolled: Math.max(0, Number(value?.socialPointsRolled) || 0),
  }
}

export function calculateTraitBudget(traits: CharacterTrait[], budgetValue?: Partial<TraitBudget> | null) {
  const budget = normalizeTraitBudget(budgetValue)
  const costs = traits.map(trait => ({
    type: inferTraitType(trait),
    cost: Number(trait.cost) || 0,
  }))
  const traitCosts = costs.filter(item => item.type === 'primary' || item.type === 'secondary').map(item => item.cost)
  const socialCosts = costs.filter(item => item.type === 'social').map(item => item.cost)
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
