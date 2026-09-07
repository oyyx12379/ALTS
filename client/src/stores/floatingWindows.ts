import { create } from 'zustand'

export interface FloatingWindowState {
  id: string
  title: string
  isOpen: boolean
  minimized: boolean
  x: number
  y: number
  width: number
  height: number
}

interface Store {
  windows: FloatingWindowState[]
  openWindow: (id: string, title: string, defaults?: Partial<FloatingWindowState>) => void
  closeWindow: (id: string) => void
  toggleMinimize: (id: string) => void
  updatePosition: (id: string, x: number, y: number) => void
  updateSize: (id: string, width: number, height: number) => void
  bringToFront: (id: string) => void
}

export const useFloatingWindows = create<Store>((set) => ({
  windows: [],

  openWindow: (id, title, defaults) => set(state => {
    const existing = state.windows.find(w => w.id === id)
    if (existing) {
      return {
        windows: state.windows.map(w =>
          w.id === id ? { ...w, isOpen: true, minimized: false } : w
        ),
      }
    }
    const win: FloatingWindowState = {
      id,
      title,
      isOpen: true,
      minimized: false,
      x: defaults?.x ?? 100 + state.windows.length * 40,
      y: defaults?.y ?? 80 + state.windows.length * 30,
      width: defaults?.width ?? 800,
      height: defaults?.height ?? 600,
    }
    return { windows: [...state.windows, win] }
  }),

  closeWindow: (id) => set(state => ({
    windows: state.windows.map(w => w.id === id ? { ...w, isOpen: false } : w),
  })),

  toggleMinimize: (id) => set(state => ({
    windows: state.windows.map(w => w.id === id ? { ...w, minimized: !w.minimized } : w),
  })),

  updatePosition: (id, x, y) => set(state => ({
    windows: state.windows.map(w => w.id === id ? { ...w, x, y } : w),
  })),

  updateSize: (id, width, height) => set(state => ({
    windows: state.windows.map(w => w.id === id ? {
      ...w, width: Math.max(300, width), height: Math.max(200, height),
    } : w),
  })),

  bringToFront: (id) => set(state => {
    const idx = state.windows.findIndex(w => w.id === id)
    if (idx === -1) return state
    const item = state.windows[idx]
    const updated = [...state.windows]
    updated.splice(idx, 1)
    updated.push(item)
    return { windows: updated }
  }),
}))
