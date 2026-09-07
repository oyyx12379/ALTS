import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { login as apiLogin, register as apiRegister } from '../api'
import LoginMusicControl from '../components/LoginMusicControl'

const bootLogs = [
  '[00.000] AUTH ACCEPTED / ALTS terminal session opened',
  '[00.126] verifying operator credential packet',
  '[00.284] loading Rhodes Island tactical archive',
  '[00.456] synchronizing character-card registry',
  '[00.642] mounting Terra-grid navigation layer',
  '[00.817] validating infection diagnosis module',
  '[01.035] linking ARKLINK tactical token service',
  '[01.246] checking room channel permissions',
  '[01.462] calibrating P.R.T.S. interface motion layer',
  '[01.731] SYSTEM ON sequence armed',
  '[02.118] clearance confirmed: ARKLINK TERMINAL SERVICE',
]

const bootSteps = ['AUTH', 'ARCHIVE', 'CARD', 'GRID', 'ROOM', 'SYSTEM']

export default function Login({ onLogin }: { onLogin: (user: any, token: string) => void }) {
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [bootPhase, setBootPhase] = useState<'idle' | 'booting' | 'push'>('idle')
  const [bootProgress, setBootProgress] = useState(0)
  const [bootLogCount, setBootLogCount] = useState(0)
  const timers = useRef<number[]>([])

  const visibleBootLogs = useMemo(() => bootLogs.slice(0, bootLogCount), [bootLogCount])

  const clearBootTimers = () => {
    timers.current.forEach(timer => window.clearTimeout(timer))
    timers.current = []
  }

  const runBootSequence = (userData: any, token: string) => {
    clearBootTimers()
    setBootPhase('booting')
    setBootProgress(0)
    setBootLogCount(0)

    bootLogs.forEach((_, index) => {
      timers.current.push(window.setTimeout(() => {
        setBootLogCount(index + 1)
        setBootProgress(Math.min(100, Math.round(((index + 1) / bootLogs.length) * 100)))
      }, 160 + index * 205))
    })

    timers.current.push(window.setTimeout(() => {
      setBootProgress(100)
      setBootPhase('push')
    }, 2750))

    timers.current.push(window.setTimeout(() => {
      onLogin(userData, token)
    }, 3650))
  }

  useEffect(() => () => clearBootTimers(), [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (bootPhase !== 'idle') return
    setError('')
    setLoading(true)
    try {
      const fn = isRegister ? apiRegister : apiLogin
      const result = await fn(username, password)
      runBootSequence(result.user, result.token)
    } catch (err: any) {
      setError(err.response?.data?.error || '操作失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const submitText = bootPhase !== 'idle'
    ? '系统启动中...'
    : loading
      ? '认证中...'
      : isRegister
        ? '注册'
        : '登录'

  return (
    <div className="login-screen" style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div className="login-mark" style={{
            width: 80, height: 80, margin: '0 auto 20px',
            background: 'linear-gradient(135deg, #ffa940, #d47a1a)',
            borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40, fontWeight: 900, color: '#fff',
            boxShadow: '0 0 40px rgba(255,169,64,0.3)',
          }}>
            A
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: 4, marginBottom: 4 }}>
            ALTS
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            ARKLINK Terminal Service · 明日方舟TRPG
          </p>
        </div>

        <div className="card card-glow">
          <h2 style={{ marginBottom: 24, fontSize: 20, textAlign: 'center' }}>
            {isRegister ? '创建账号' : '登录'}
          </h2>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label>用户名</label>
              <input
                className="input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="请输入用户名"
                required
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label>密码</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="请输入密码"
                required
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.3)',
                borderRadius: 4, padding: '8px 14px', marginBottom: 16, color: '#ff4d4f', fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading || bootPhase !== 'idle'}>
              {submitText}
            </button>
          </form>

          <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
            {isRegister ? '已有账号？' : '没有账号？'}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setIsRegister(!isRegister); setError('') }}
              disabled={loading || bootPhase !== 'idle'}
              style={{ color: 'var(--color-orange)' }}
            >
              {isRegister ? '去登录' : '去注册'}
            </button>
          </div>
        </div>
      </div>
      <LoginMusicControl />
      {bootPhase !== 'idle' && (
        <div className={`login-boot-overlay boot-demo ${bootPhase}`}>
          <div className="boot-demo-grid" />
          <div className="boot-demo-scanline" />
          <section className="boot-terminal-layer">
            <div className="boot-terminal">
              <div className="boot-terminal-head">
                <span>SYSTEM BOOT LOG</span>
                <b>{bootProgress.toString().padStart(3, '0')}%</b>
              </div>
              <div className="boot-log-list">
                {visibleBootLogs.map((log, index) => (
                  <p key={log} style={{ animationDelay: `${index * 28}ms` }}>{log}</p>
                ))}
                {bootPhase === 'booting' && <p className="boot-cursor">_</p>}
              </div>
              <div className="boot-progress-wrap">
                <div className="boot-progress-label">
                  <span>SYSTEM ON</span>
                  <span>{bootProgress}%</span>
                </div>
                <div className="boot-progress-track">
                  <div style={{ width: `${bootProgress}%` }} />
                </div>
              </div>
              <div className="boot-step-row">
                {bootSteps.map((step, index) => (
                  <span key={step} className={bootProgress >= ((index + 1) / bootSteps.length) * 100 ? 'active' : ''}>
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
                    <p>正在进入真实主控界面。</p>
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
        </div>
      )}
    </div>
  )
}
