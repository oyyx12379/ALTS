import { useState, useRef, useCallback, useEffect } from 'react'
import { useFloatingWindows } from '../stores/floatingWindows'
import type { FloatingWindowState } from '../stores/floatingWindows'

interface Props {
  win: FloatingWindowState
  children: React.ReactNode
}

export default function FloatingWindow({ win, children }: Props) {
  const { closeWindow, toggleMinimize, updatePosition, updateSize, bringToFront, windows } = useFloatingWindows()
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [compact, setCompact] = useState(false)
  const dragRef = useRef({ startX: 0, startY: 0, origX: 0, origY: 0 })
  const resizeRef = useRef({ startX: 0, startY: 0, origW: 0, origH: 0 })

  const zIndex = windows.indexOf(win) + 100

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => setCompact(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  // Drag
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.fw-resize-handle')) return
    bringToFront(win.id)
    setDragging(true)
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: win.x, origY: win.y }
  }, [bringToFront, win.id, win.x, win.y])

  // Resize
  const onResizeDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    bringToFront(win.id)
    setResizing(true)
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: win.width, origH: win.height }
  }, [bringToFront, win.id, win.width, win.height])

  useEffect(() => {
    if (!dragging && !resizing) return
    const onMove = (e: MouseEvent) => {
      if (dragging) {
        const dx = e.clientX - dragRef.current.startX
        const dy = e.clientY - dragRef.current.startY
        updatePosition(win.id, dragRef.current.origX + dx, dragRef.current.origY + dy)
      }
      if (resizing) {
        const dw = e.clientX - resizeRef.current.startX
        const dh = e.clientY - resizeRef.current.startY
        updateSize(win.id, resizeRef.current.origW + dw, resizeRef.current.origH + dh)
      }
    }
    const onUp = () => { setDragging(false); setResizing(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, resizing, updatePosition, updateSize, win.id])

  return (
    <div className="floating-window" style={{
      position: 'fixed',
      left: compact ? 10 : win.x,
      top: compact ? 'calc(env(safe-area-inset-top, 0px) + 64px)' : win.y,
      width: compact ? 'calc(100dvw - 20px)' : win.width,
      height: win.minimized ? 'auto' : compact ? 'min(68dvh, 560px)' : win.height,
      zIndex,
      background: 'var(--bg-card)',
      border: '1px solid var(--border-highlight)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      display: win.isOpen ? 'flex' : 'none',
      flexDirection: 'column',
      overflow: 'hidden',
      userSelect: dragging || resizing ? 'none' : 'auto',
      maxWidth: 'calc(100dvw - 20px)',
      maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 74px)',
    }}>
      {/* Title bar */}
      <div
        onMouseDown={onMouseDown}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', background: 'var(--bg-secondary)',
          cursor: 'move', flexShrink: 0, borderBottom: '1px solid var(--border-color)',
        }}>
        <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{win.title}</span>
        <button className="btn btn-ghost btn-sm"
          onClick={() => toggleMinimize(win.id)}
          style={{ padding: '2px 8px', fontSize: 12 }}>
          {win.minimized ? '□' : '_'}
        </button>
        <button className="btn btn-ghost btn-sm"
          onClick={() => closeWindow(win.id)}
          style={{ padding: '2px 8px', fontSize: 12, color: 'var(--color-red)' }}>
          ×
        </button>
      </div>

      {/* Content */}
      {!win.minimized && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </div>
      )}

      {/* Resize handle */}
      {!win.minimized && (
        <div
          className="fw-resize-handle"
          onMouseDown={compact ? undefined : onResizeDown}
          style={{
            position: 'absolute', right: 0, bottom: 0,
            width: 20, height: 20, cursor: 'nwse-resize',
            background: 'linear-gradient(135deg, transparent 50%, var(--border-color) 50%)',
            display: compact ? 'none' : 'block',
          }}
        />
      )}
    </div>
  )
}
