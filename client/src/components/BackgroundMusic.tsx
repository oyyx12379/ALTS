import { useEffect, useMemo, useRef } from 'react'
import { useMusic } from '../stores/music'

const SEEK_TOLERANCE = 0.75

export default function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const retryRef = useRef(false)
  const {
    context,
    tracks,
    currentTrackId,
    status,
    volume,
    muted,
    playMode,
    currentTime,
    updatedAt,
    nextTrack,
    seek,
    play,
    setCurrentTime,
    setDuration,
    setError,
    clearError,
  } = useMusic()

  const currentTrack = useMemo(
    () => tracks.find(track => track.id === currentTrackId),
    [tracks, currentTrackId],
  )

  const updateDuration = (audio: HTMLAudioElement) => {
    setDuration(audio.duration)
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
    audio.muted = muted
  }, [volume, muted])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentTrack) return

    const nextSrc = new URL(currentTrack.src, window.location.origin).href
    if (audio.src !== nextSrc) {
      audio.src = currentTrack.src
      setDuration(0)
      audio.load()
    }

    audio.loop = playMode === 'single'
    clearError()

    if (status === 'playing') {
      retryRef.current = true
      void audio.play().then(() => {
        retryRef.current = false
      }).catch(() => {
        setError('浏览器阻止了自动播放，请点击页面任意位置后继续播放')
      })
    } else {
      audio.pause()
    }
  }, [currentTrack, status, playMode, setError, clearError])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentTrack) return

    const syncedTime = context === 'room' && status === 'playing'
      ? currentTime + Math.max(0, Date.now() - updatedAt) / 1000
      : currentTime

    if (Number.isFinite(syncedTime) && Math.abs(audio.currentTime - syncedTime) > SEEK_TOLERANCE) {
      audio.currentTime = Math.max(0, syncedTime)
    }
  }, [context, currentTrack, currentTrackId, status, updatedAt])

  useEffect(() => {
    const retryPlayback = () => {
      const audio = audioRef.current
      if (!audio || !retryRef.current || status !== 'playing') return
      void audio.play().then(() => {
        retryRef.current = false
        clearError()
      }).catch(() => {
        setError('浏览器仍未允许音乐播放，请在音乐窗口中手动点击播放')
      })
    }

    window.addEventListener('pointerdown', retryPlayback)
    window.addEventListener('keydown', retryPlayback)
    return () => {
      window.removeEventListener('pointerdown', retryPlayback)
      window.removeEventListener('keydown', retryPlayback)
    }
  }, [status, setError, clearError])

  return (
    <audio
      ref={audioRef}
      preload="metadata"
      onLoadedMetadata={event => updateDuration(event.currentTarget)}
      onLoadedData={event => updateDuration(event.currentTarget)}
      onDurationChange={event => updateDuration(event.currentTarget)}
      onCanPlay={event => updateDuration(event.currentTarget)}
      onTimeUpdate={event => {
        updateDuration(event.currentTarget)
        setCurrentTime(event.currentTarget.currentTime)
      }}
      onEnded={() => {
        if (playMode === 'single') {
          seek(0)
          play()
          return
        }
        nextTrack()
      }}
      onError={() => {
        if (currentTrack) setError(`音乐加载失败：${currentTrack.title}`)
      }}
    />
  )
}
