import { useEffect, useMemo, useState } from 'react'

type DiceTotalSlotProps = {
  rollKey: number
  result: number | null
  label?: string
  minTotal?: number
  maxTotal?: number
  criticalSuccess?: boolean
  criticalFailure?: boolean
}

const REEL_ITEM_COUNT = 24

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function getValueTone(value: number, min: number, max: number) {
  if (value === min || value === max) return 'rare'
  const center = (min + max) / 2
  const stableRadius = Math.max(1, (max - min) * 0.16)
  return Math.abs(value - center) <= stableRadius ? 'stable' : ''
}

export default function DiceTotalSlot({
  rollKey,
  result,
  label = 'DICE TOTAL',
  minTotal,
  maxTotal,
  criticalSuccess = false,
  criticalFailure = false,
}: DiceTotalSlotProps) {
  const [phase, setPhase] = useState<'idle' | 'charging' | 'spinning' | 'locked'>('idle')
  const [displayResult, setDisplayResult] = useState<number | null>(result)

  const valueRange = useMemo(() => {
    const fallback = result ?? 0
    const min = Math.min(minTotal ?? fallback, maxTotal ?? fallback, fallback)
    const max = Math.max(minTotal ?? fallback, maxTotal ?? fallback, fallback)
    return { min, max }
  }, [maxTotal, minTotal, result])

  const reelValues = useMemo(() => {
    const finalValue = result ?? valueRange.min
    const sequence = [finalValue]
    for (let index = 1; index < REEL_ITEM_COUNT; index += 1) {
      sequence.push(randomInt(valueRange.min, valueRange.max))
    }
    return sequence
  }, [rollKey, result, valueRange])

  useEffect(() => {
    if (result === null || rollKey === 0) return
    setDisplayResult(null)
    setPhase('charging')

    const chargeTimer = window.setTimeout(() => setPhase('spinning'), 320)
    const lockTimer = window.setTimeout(() => {
      setDisplayResult(result)
      setPhase('locked')
    }, 1780)
    const idleTimer = window.setTimeout(() => setPhase('idle'), 2420)

    return () => {
      window.clearTimeout(chargeTimer)
      window.clearTimeout(lockTimer)
      window.clearTimeout(idleTimer)
    }
  }, [rollKey, result])

  const rare = displayResult === valueRange.min || displayResult === valueRange.max
  const criticalLabel = criticalSuccess && criticalFailure
    ? '大成功 / 大失败'
    : criticalSuccess
      ? '大成功'
      : criticalFailure
        ? '大失败'
        : null
  const criticalClass = criticalSuccess && criticalFailure
    ? 'critical-both'
    : criticalSuccess
      ? 'critical-success'
      : criticalFailure
        ? 'critical-failure'
        : ''

  return (
    <div className={`dice-total-slot ${phase} ${rare ? 'rare-result' : ''} ${criticalClass}`}>
      <div className="dice-total-slot-hud">
        <div className="dice-total-charge"><span /></div>
        <div className="dice-total-status" />
      </div>
      <div className="dice-total-window">
        <div className="dice-total-ticks" />
        <div className="dice-total-flash" />
        <div className="dice-total-shock" />
        <div className="dice-total-line" />
        <div key={rollKey} className={`dice-total-reel ${phase === 'spinning' ? 'spinning' : ''}`}>
          {reelValues.map((value, index) => (
            <div
              key={`${value}-${index}`}
              className={`dice-total-value ${getValueTone(value, valueRange.min, valueRange.max)}`}
            >
              {value}
            </div>
          ))}
        </div>
      </div>
      <div className="dice-total-meta">
        <span>{label}</span>
        <div className="dice-total-result">
          {criticalLabel && <strong className="dice-critical-label">{criticalLabel}</strong>}
          <b>{displayResult ?? '--'}</b>
        </div>
      </div>
    </div>
  )
}
