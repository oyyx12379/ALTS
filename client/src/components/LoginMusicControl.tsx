import { useState } from 'react'
import { useMusic } from '../stores/music'

export default function LoginMusicControl() {
  const [open, setOpen] = useState(false)
  const {
    status,
    volume,
    muted,
    error,
    setVolume,
    toggleMuted,
    togglePlay,
  } = useMusic()

  const audibleVolume = muted ? 0 : volume

  return (
    <div className={`login-music-control ${open ? 'open' : ''}`}>
      {open && (
        <div className="login-music-panel">
          <div className="login-music-title">
            <span>BGM</span>
            <strong>生命流</strong>
          </div>
          <div className="login-music-actions">
            <button className="btn btn-sm" type="button" onClick={togglePlay}>
              {status === 'playing' ? '暂停' : '播放'}
            </button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={toggleMuted}>
              {muted ? '取消静音' : '静音'}
            </button>
          </div>
          <div className="login-music-volume">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={audibleVolume}
              onChange={event => setVolume(Number(event.target.value))}
              aria-label="登录页背景音乐音量"
            />
            <span>{Math.round(audibleVolume * 100)}%</span>
          </div>
          {error && <p>{error}</p>}
        </div>
      )}

      <button
        className="login-music-toggle"
        type="button"
        aria-label="调节背景音乐音量"
        title="调节背景音乐音量"
        onClick={() => setOpen(value => !value)}
      >
        <span>{muted || volume === 0 ? '♪' : '♫'}</span>
      </button>
    </div>
  )
}
