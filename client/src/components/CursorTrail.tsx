import { useEffect, useRef } from 'react'

const color = {
  cyan: '128, 230, 213',
  amber: '235, 164, 72',
}

const MAX_DPR = 1.5
const IDLE_DELAY = 900

const line = (
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  alpha: number,
  lineWidth = 1,
) => {
  context.globalAlpha = alpha
  context.strokeStyle = stroke
  context.lineWidth = lineWidth
  context.beginPath()
  context.moveTo(x1, y1)
  context.lineTo(x2, y2)
  context.stroke()
}

export default function CursorTrail() {
  const radarRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = radarRef.current
    if (!canvas) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches
    if (prefersReducedMotion || coarsePointer) return

    const context = canvas.getContext('2d')
    if (!context) return

    let frameId = 0
    let idleTimer = 0
    let width = 0
    let height = 0
    let dpr = 1
    let active = false
    let x = window.innerWidth / 2
    let y = window.innerHeight / 2
    let targetX = x
    let targetY = y

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const setActive = (nextActive: boolean) => {
      active = nextActive
      canvas.classList.toggle('is-active', nextActive)
    }

    const draw = (time: number) => {
      x += (targetX - x) * 0.58
      y += (targetY - y) * 0.58
      context.clearRect(0, 0, width, height)

      if (!active) {
        frameId = 0
        return
      }

      const pulse = 0.5 + Math.sin(time * 0.006) * 0.5
      const drawX = Math.round(x) + 0.5
      const drawY = Math.round(y) + 0.5
      const notch = 26 + pulse * 8

      context.save()
      line(context, drawX, 0, drawX, height, `rgba(${color.cyan}, 0.9)`, 0.26 + pulse * 0.08)
      line(context, 0, drawY, width, drawY, `rgba(${color.cyan}, 0.9)`, 0.26 + pulse * 0.08)
      line(context, drawX - 9, 0, drawX - 9, height, `rgba(${color.cyan}, 0.55)`, 0.045)
      line(context, drawX + 9, 0, drawX + 9, height, `rgba(${color.cyan}, 0.55)`, 0.045)
      line(context, 0, drawY - 9, width, drawY - 9, `rgba(${color.cyan}, 0.55)`, 0.045)
      line(context, 0, drawY + 9, width, drawY + 9, `rgba(${color.cyan}, 0.55)`, 0.045)

      line(context, drawX - notch, drawY, drawX - 8, drawY, `rgba(${color.amber}, 0.85)`, 0.58, 1.2)
      line(context, drawX + 8, drawY, drawX + notch, drawY, `rgba(${color.amber}, 0.85)`, 0.58, 1.2)
      line(context, drawX, drawY - notch, drawX, drawY - 8, `rgba(${color.amber}, 0.85)`, 0.58, 1.2)
      line(context, drawX, drawY + 8, drawX, drawY + notch, `rgba(${color.amber}, 0.85)`, 0.58, 1.2)

      context.shadowColor = `rgba(${color.cyan}, 0.24)`
      context.shadowBlur = 7
      context.globalAlpha = 0.25 + pulse * 0.12
      context.strokeStyle = `rgba(${color.cyan}, 0.82)`
      context.lineWidth = 1
      context.strokeRect(drawX - 16, drawY - 16, 32, 32)
      context.restore()

      frameId = window.requestAnimationFrame(draw)
    }

    const startAnimation = () => {
      if (!frameId) frameId = window.requestAnimationFrame(draw)
    }

    const queueIdle = () => {
      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => {
        setActive(false)
        context.clearRect(0, 0, width, height)
      }, IDLE_DELAY)
    }

    const handlePointerMove = (event: PointerEvent) => {
      targetX = event.clientX
      targetY = event.clientY
      if (!active) {
        x = targetX
        y = targetY
        setActive(true)
      }
      queueIdle()
      startAnimation()
    }

    const handlePointerLeave = () => {
      setActive(false)
      context.clearRect(0, 0, width, height)
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.addEventListener('mouseleave', handlePointerLeave)
    document.addEventListener('visibilitychange', handlePointerLeave)

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId)
      window.clearTimeout(idleTimer)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('mouseleave', handlePointerLeave)
      document.removeEventListener('visibilitychange', handlePointerLeave)
      setActive(false)
    }
  }, [])

  return <canvas ref={radarRef} className="prts-radar-cursor-layer" aria-hidden="true" />
}
