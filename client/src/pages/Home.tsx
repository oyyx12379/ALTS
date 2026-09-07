import { useNavigate } from 'react-router-dom'
import { useFloatingWindows } from '../stores/floatingWindows'

export default function Home({ user }: { user: any }) {
  const navigate = useNavigate()
  const { openWindow } = useFloatingWindows()

  const openTerminalGuide = () => {
    const width = 680
    const height = 620
    openWindow('terminal-guide', '终端使用说明 v0.1', {
      width,
      height,
      x: 84,
      y: Math.max(72, window.innerHeight - height - 28),
    })
  }

  const shortcuts = [
    { title: '我的角色', desc: '管理、导入和查看你的角色卡', icon: 'C', path: '/characters', color: '#ffa940' },
    { title: '游戏房间', desc: '加入或创建跑团房间', icon: 'R', path: '/rooms', color: '#52c41a' },
  ]

  return (
    <>
      <div className="top-header">
        <span className="page-title">ALTS / ARKLINK Terminal Service / 控制台</span>
        <div className="spacer" />
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          欢迎，{user.username}
          <span className="badge badge-orange" style={{ marginLeft: 8 }}>
            {user.role === 'SN' ? '苦难陈述者' : '玩家'}
          </span>
        </span>
      </div>

      <div className="page-content home-page">
        <button
          className="terminal-guide-launcher"
          type="button"
          onClick={openTerminalGuide}
          aria-label="打开终端使用说明 v0.1"
        >
          <span>?</span>
          <strong>终端使用说明 v0.1</strong>
        </button>

        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>快速开始</h2>
            <div className="grid-3">
              {shortcuts.map(s => (
                <button
                  key={s.path}
                  className="card card-glow"
                  style={{ cursor: 'pointer', textAlign: 'left' }}
                  onClick={() => navigate(s.path)}
                  type="button"
                >
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    marginBottom: 16,
                    background: `${s.color}22`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    fontWeight: 800,
                    color: s.color,
                  }}>
                    {s.icon}
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{s.title}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{s.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>ALTS / ARKLINK Terminal Service</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8 }}>
              PRTS 授权下的外勤任务链路终端服务，用于行动接入、战术同步与干员状态管理。<br />
              游戏内角色通过 ALTS 接收任务、同步战术地图并执行行动；游戏外玩家通过 ARKLINK 链路接入并操控角色。<br />
              当前已接入角色档案、规则书、战术棋盘、TOKEN 管理、房间通信与音乐控制模块。
            </p>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>快速流程</h3>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { step: '1', text: '导入 Excel 角色卡或创建新角色' },
                { step: '2', text: '加入或创建游戏房间' },
                { step: '3', text: '在进入房间前选择角色，开始冒险' },
              ].map(s => (
                <div key={s.step} style={{
                  flex: 1,
                  minWidth: 180,
                  padding: 16,
                  background: 'var(--bg-panel)',
                  borderRadius: 8,
                }}>
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'var(--color-orange)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    marginBottom: 8,
                  }}>
                    {s.step}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
