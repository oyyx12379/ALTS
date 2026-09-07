import { useEffect, useMemo, useRef, useState } from 'react'

const bootLogs = [
  '[00.000] ALTS/P.R.T.S. link request accepted',
  '[00.137] checking Rhodes tactical archive...',
  '[00.282] loading operator identity matrix',
  '[00.431] mounting Terra-grid navigation layer',
  '[00.612] synchronizing character sheet schema',
  '[00.806] validating infection diagnosis module',
  '[01.023] loading ARKLINK tactical token service',
  '[01.251] binding encrypted session channel',
  '[01.479] calibrating cursor radar overlay',
  '[01.740] SYSTEM ON sequence armed',
  '[02.106] clearance confirmed: ARKLINK TERMINAL SERVICE',
]

const bootSteps = [
  'AUTH',
  'ARCHIVE',
  'GRID',
  'TOKEN',
  'SESSION',
  'SYSTEM',
]

export default function BootMotionDemo() {
  const [phase, setPhase] = useState<'idle' | 'booting' | 'push' | 'ready'>('idle')
  const [progress, setProgress] = useState(0)
  const [logCount, setLogCount] = useState(0)
  const timers = useRef<number[]>([])

  const visibleLogs = useMemo(() => bootLogs.slice(0, logCount), [logCount])

  const clearTimers = () => {
    timers.current.forEach(timer => window.clearTimeout(timer))
    timers.current = []
  }

  const startBoot = () => {
    clearTimers()
    setPhase('booting')
    setProgress(0)
    setLogCount(0)

    bootLogs.forEach((_, index) => {
      timers.current.push(window.setTimeout(() => {
        setLogCount(index + 1)
        setProgress(Math.min(100, Math.round(((index + 1) / bootLogs.length) * 100)))
      }, 180 + index * 210))
    })

    timers.current.push(window.setTimeout(() => {
      setProgress(100)
      setPhase('push')
    }, 2850))

    timers.current.push(window.setTimeout(() => {
      setPhase('ready')
    }, 3900))
  }

  const resetDemo = () => {
    clearTimers()
    setPhase('idle')
    setProgress(0)
    setLogCount(0)
  }

  useEffect(() => () => clearTimers(), [])

  return (
    <main className={`boot-demo ${phase}`}>
      <div className="boot-demo-grid" />
      <div className="boot-demo-scanline" />

      <section className="boot-login-layer">
        <div className="boot-login-panel">
          <div className="boot-brand-mark">A</div>
          <div>
            <h1>ALTS</h1>
            <p>ARKLINK Terminal Service</p>
          </div>
          <div className="boot-login-form">
            <label>
              <span>ID</span>
              <input value="operator.demo" readOnly />
            </label>
            <label>
              <span>KEY</span>
              <input value="************" readOnly />
            </label>
            <button onClick={startBoot} disabled={phase === 'booting' || phase === 'push'}>
              {phase === 'idle' ? 'LOGIN / BOOT' : 'SEQUENCE RUNNING'}
            </button>
          </div>
        </div>
      </section>

      <section className="boot-terminal-layer">
        <div className="boot-terminal">
          <div className="boot-terminal-head">
            <span>SYSTEM BOOT LOG</span>
            <b>{progress.toString().padStart(3, '0')}%</b>
          </div>
          <div className="boot-log-list">
            {visibleLogs.map((log, index) => (
              <p key={log} style={{ animationDelay: `${index * 28}ms` }}>{log}</p>
            ))}
            {phase === 'booting' && <p className="boot-cursor">_</p>}
          </div>
          <div className="boot-progress-wrap">
            <div className="boot-progress-label">
              <span>SYSTEM ON</span>
              <span>{progress}%</span>
            </div>
            <div className="boot-progress-track">
              <div style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="boot-step-row">
            {bootSteps.map((step, index) => (
              <span key={step} className={progress >= ((index + 1) / bootSteps.length) * 100 ? 'active' : ''}>
                {step}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="boot-home-layer">
        <div className="boot-home-shell">
          <aside>
            <div className="boot-home-logo">A</div>
            {['HOME', 'CARD', 'ROOM', 'DICE'].map(item => <span key={item}>{item}</span>)}
          </aside>
          <div className="boot-home-main">
            <header>
              <strong>ALTS · ARKLINK Terminal Service</strong>
              <span>SYSTEM ONLINE</span>
            </header>
            <div className="boot-home-content">
              <div>
                <small>TACTICAL SESSION</small>
                <b>OPERATION DASHBOARD</b>
                <p>角色卡、战斗棋盘、规则档案与房间系统已完成联机。</p>
              </div>
              <div className="boot-home-cards">
                <span>CHARACTER</span>
                <span>BATTLE GRID</span>
                <span>RULEBOOK</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <button className="boot-demo-reset" onClick={resetDemo}>RESET DEMO</button>
    </main>
  )
}
