export type DiceRoll = {
  expression: string
  count: number
  sides: number
  modifier: number
  rolls: number[]
  total: number
  criticalThreshold: number
  maxFaceCount: number
  minFaceCount: number
  criticalSuccess: boolean
  criticalFailure: boolean
}

export type DiceCriticalOutcome = 'normal' | 'critical-success' | 'critical-failure' | 'critical-both'

export function evaluateDiceCriticals(rolls: number[], sides: number) {
  const criticalThreshold = Math.ceil(rolls.length / 2)
  const maxFaceCount = rolls.filter(value => value === sides).length
  const minFaceCount = rolls.filter(value => value === 1).length
  const criticalSuccess = maxFaceCount >= criticalThreshold
  const criticalFailure = minFaceCount >= criticalThreshold

  return { criticalThreshold, maxFaceCount, minFaceCount, criticalSuccess, criticalFailure }
}

export function getDiceCriticalOutcome({ criticalSuccess, criticalFailure }: Pick<DiceRoll, 'criticalSuccess' | 'criticalFailure'>): DiceCriticalOutcome {
  if (criticalSuccess && criticalFailure) return 'critical-both'
  if (criticalSuccess) return 'critical-success'
  if (criticalFailure) return 'critical-failure'
  return 'normal'
}

export function parseDiceExpression(input: string) {
  const normalized = input.trim().replace(/\s+/g, '').toUpperCase()
  const match = normalized.match(/^(\d*)D(\d+)([+-]\d+)?$/)
  if (!match) return null

  const count = match[1] ? Number(match[1]) : 1
  const sides = Number(match[2])
  const modifier = match[3] ? Number(match[3]) : 0
  if (!Number.isInteger(count) || !Number.isInteger(sides) || count < 1 || count > 100 || sides < 2 || sides > 1000) {
    return null
  }

  return { count, sides, modifier }
}

export function formatDiceExpression(count: number, sides: number, modifier = 0) {
  const modStr = modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : ''
  return `${count === 1 ? '' : count}D${sides}${modStr}`
}

export function rollDiceExpression(input: string): DiceRoll | null {
  const parsed = parseDiceExpression(input)
  if (!parsed) return null

  const rolls = Array.from({ length: parsed.count }, () => Math.floor(Math.random() * parsed.sides) + 1)
  const total = rolls.reduce((sum, value) => sum + value, 0) + parsed.modifier
  return {
    ...parsed,
    rolls,
    total,
    ...evaluateDiceCriticals(rolls, parsed.sides),
    expression: formatDiceExpression(parsed.count, parsed.sides, parsed.modifier),
  }
}
