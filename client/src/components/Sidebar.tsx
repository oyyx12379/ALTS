import { useLocation, useNavigate } from 'react-router-dom'
import { useFloatingWindows } from '../stores/floatingWindows'

const items = [
  { path: '/', icon: 'A', label: '首页' },
  { path: '/characters', icon: 'C', label: '角色' },
  { path: '/rooms', icon: 'R', label: '房间' },
  { path: '/rulebook', icon: 'B', label: '规则' },
  { path: '/quickref', icon: 'Q', label: '速查' },
]

export default function Sidebar({ onLogout }: { user: any; onLogout: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { openWindow } = useFloatingWindows()

  return (
    <div className="sidebar">
      <div className="sidebar-logo" onClick={() => navigate('/')} title="ALTS / ARKLINK Terminal Service">
        A
      </div>

      {items.map(item => (
        <button
          key={item.path}
          className={`sidebar-item ${location.pathname === item.path ? 'active' : ''}`}
          onClick={() => navigate(item.path)}
          title={item.label}
          type="button"
        >
          <span className="icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}

      <div style={{ flex: 1 }} />

      <button
        className="sidebar-item"
        onClick={() => openWindow('music-player', '背景音乐', { width: 360, height: 500 })}
        title="背景音乐"
        type="button"
        style={{ color: 'var(--text-secondary)' }}
      >
        <span className="icon">M</span>
        <span>音乐</span>
      </button>

      <button
        className="sidebar-item"
        onClick={() => openWindow('pdf-reader', 'PDF 规则书', { width: 900, height: 650 })}
        title="PDF 规则书"
        type="button"
        style={{ color: 'var(--text-secondary)' }}
      >
        <span className="icon">P</span>
        <span>PDF</span>
      </button>

      <button
        className="sidebar-item"
        onClick={onLogout}
        title="退出登录"
        type="button"
        style={{ color: '#ff4d4f' }}
      >
        <span className="icon">X</span>
        <span>退出</span>
      </button>
    </div>
  )
}
