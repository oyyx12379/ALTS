import { useState } from 'react'

const DICE = [2, 4, 6, 8, 10, 12, 20]

interface RollResult {
  id: number
  expression: string
  total: number
  rolls: number[]
  time: string
}

export default function DiceRoller() {
  const [expression, setExpression] = useState('1D20')
  const [results, setResults] = useState<RollResult[]>([])
  const [rolling, setRolling] = useState(false)
  const [nextId, setNextId] = useState(1)

  const roll = (sides: number, count: number = 1, modifier: number = 0) => {
    const rolls: number[] = []
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * sides) + 1)
    }
    const total = rolls.reduce((a, b) => a + b, 0) + modifier
    const modStr = modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : ''
    const expression = count > 1 ? `${count}D${sides}${modStr}` : `D${sides}${modStr}`
    const result: RollResult = {
      id: nextId,
      expression,
      total,
      rolls,
      time: new Date().toLocaleTimeString(),
    }
    setNextId(id => id + 1)
    setResults(prev => [result, ...prev].slice(0, 50))
    setRolling(false)
  }

  const parseAndRoll = () => {
    setRolling(true)
    // Parse expression like "2D6+3", "1D20-5", "D8"
    const match = expression.toUpperCase().match(/^(\d*)D(\d+)([+-]\d+)?$/)
    if (match) {
      const count = parseInt(match[1]) || 1
      const sides = parseInt(match[2])
      const modifier = parseInt(match[3] || '0')
      if (sides >= 2 && count <= 100) {
        setTimeout(() => roll(sides, count, modifier), 150)
        return
      }
    }
    setRolling(false)
  }

  const quickRoll = (sides: number) => {
    setRolling(true)
    setTimeout(() => roll(sides, 1, 0), 150)
  }

  return (
    <>
      <div className="top-header">
        <span className="page-title">骰子工具</span>
      </div>

      <div className="page-content">
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          {/* Quick Roll */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--color-orange)' }}>
              ◇ 快速投掷
            </h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {DICE.map(sides => (
                <button
                  key={sides}
                  className="btn btn-lg"
                  onClick={() => quickRoll(sides)}
                  disabled={rolling}
                  style={{
                    width: 80, height: 80, flexDirection: 'column',
                    fontSize: 28, fontWeight: 700,
                    borderColor: 'var(--color-orange)',
                  }}
                >
                  D{sides}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Roll */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--color-orange)' }}>
              🎯 自定义检定
            </h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label>骰子表达式</label>
                <input
                  className="input"
                  value={expression}
                  onChange={e => setExpression(e.target.value)}
                  placeholder="如: 2D6+3, 1D20-5, D8"
                  onKeyDown={e => { if (e.key === 'Enter') parseAndRoll() }}
                />
              </div>
              <button className="btn btn-primary btn-lg" onClick={parseAndRoll} disabled={rolling}>
                {rolling ? '🎲 投掷中...' : '🎲 投掷'}
              </button>
            </div>
            <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              支持格式: D20 / 2D6+3 / 1D20-5 / 3D8
            </p>
          </div>

          {/* Results */}
          <div className="card">
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--color-orange)' }}>
              📜 投掷记录
            </h3>
            {results.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>暂无记录，试试投掷骰子吧</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {results.map(r => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px',
                    background: 'var(--bg-panel)', borderRadius: 8,
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-orange)', minWidth: 80 }}>
                      {r.expression}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {r.rolls.map((roll, i) => (
                        <span key={i} style={{
                          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'var(--bg-card)', borderRadius: 6,
                          fontSize: 14, fontWeight: 600, border: '1px solid var(--border-color)',
                        }}>
                          {roll}
                        </span>
                      ))}
                    </div>
                    <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-orange)', marginLeft: 'auto' }}>
                      {r.total}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
