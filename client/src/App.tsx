import { Suspense, lazy, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import FloatingWindow from './components/FloatingWindow'
import CursorTrail from './components/CursorTrail'
import BackgroundMusic from './components/BackgroundMusic'
import { useFloatingWindows } from './stores/floatingWindows'
import './styles/global.css'

const Home = lazy(() => import('./pages/Home'))
const Login = lazy(() => import('./pages/Login'))
const BootMotionDemo = lazy(() => import('./pages/BootMotionDemo'))
const Characters = lazy(() => import('./pages/Characters'))
const CharacterDetail = lazy(() => import('./pages/CharacterDetail'))
const Rooms = lazy(() => import('./pages/Rooms'))
const RoomDetail = lazy(() => import('./pages/RoomDetail'))
const Rulebook = lazy(() => import('./pages/Rulebook'))
const QuickRef = lazy(() => import('./pages/QuickRef'))
const PdfReader = lazy(() => import('./components/PdfReader'))
const MusicPlayer = lazy(() => import('./components/MusicPlayer'))
const TerminalGuide = lazy(() => import('./components/TerminalGuide'))

function RouteLoading() {
  return (
    <div className="loading-page">
      <div className="spinner" />
      <span>加载中...</span>
    </div>
  )
}

function FloatingWindows() {
  const { windows } = useFloatingWindows()
  const winComponents: Record<string, React.ReactNode> = {
    'pdf-reader': <PdfReader />,
    'music-player': <MusicPlayer />,
    'terminal-guide': <TerminalGuide />,
  }
  return (
    <>
      {windows.filter(w => w.isOpen).map(win => (
        <FloatingWindow key={win.id} win={win}>
          <Suspense fallback={<RouteLoading />}>
            {winComponents[win.id] || <div style={{ padding: 20 }}>未知窗口</div>}
          </Suspense>
        </FloatingWindow>
      ))}
    </>
  )
}

export default function App() {
  const [user, setUser] = useState<any>(() => {
    const stored = localStorage.getItem('user')
    if (stored) {
      try { return JSON.parse(stored) } catch {}
    }
    return null
  })

  const handleLogin = (userData: any, token: string) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  if (!user) {
    return (
      <BrowserRouter>
        <CursorTrail />
        <BackgroundMusic />
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/boot-motion-demo" element={<BootMotionDemo />} />
            <Route path="/login" element={<Login onLogin={handleLogin} />} />
            <Route path="*" element={<Navigate to="/login" />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <CursorTrail />
      <BackgroundMusic />
      <Sidebar user={user} onLogout={handleLogout} />
      <div className="main-content">
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<Home user={user} />} />
            <Route path="/boot-motion-demo" element={<BootMotionDemo />} />
            <Route path="/characters" element={<Characters />} />
            <Route path="/characters/:id" element={<CharacterDetail />} />
            <Route path="/dice" element={<Navigate to="/" replace />} />
            <Route path="/rooms" element={<Rooms />} />
            <Route path="/rooms/:id" element={<RoomDetail user={user} />} />
            <Route path="/rulebook" element={<Rulebook />} />
            <Route path="/quickref" element={<QuickRef />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>

      {/* Floating Windows */}
      <FloatingWindows />
    </BrowserRouter>
  )
}
