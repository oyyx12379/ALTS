import { useEffect, useMemo, useState } from 'react'
import { useMusic, type PlayMode } from '../stores/music'
import type { BgmTrack } from '../music/bgmTracks'

const formatTime = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '00:00'
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || ''))
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(file)
})

export default function MusicPlayer() {
  const [groupName, setGroupName] = useState('默认分组')
  const [adding, setAdding] = useState(false)
  const [draftProgress, setDraftProgress] = useState<number | null>(null)
  const {
    context,
    roomIsSN,
    tracks,
    currentTrackId,
    status,
    volume,
    muted,
    playMode,
    currentTime,
    duration,
    error,
    addTrack,
    removeTrack,
    selectTrack,
    togglePlay,
    nextTrack,
    previousTrack,
    setVolume,
    toggleMuted,
    setPlayMode,
    seek,
    setError,
  } = useMusic()

  const canControl = context !== 'room' || roomIsSN
  const currentTrack = useMemo(
    () => tracks.find(track => track.id === currentTrackId),
    [tracks, currentTrackId],
  )
  const groupedTracks = useMemo(() => {
    const groups = new Map<string, BgmTrack[]>()
    tracks.forEach(track => {
      const key = track.group || '未分组'
      groups.set(key, [...(groups.get(key) || []), track])
    })
    return Array.from(groups.entries())
  }, [tracks])
  const hasKnownDuration = Number.isFinite(duration) && duration > 0
  const progress = hasKnownDuration ? Math.min(duration, currentTime) : 0
  const displayProgress = draftProgress ?? progress
  const progressMax = hasKnownDuration ? duration : Math.max(1, currentTime)
  const displayCurrentTime = hasKnownDuration ? displayProgress : currentTime

  useEffect(() => {
    setDraftProgress(null)
  }, [currentTrackId])

  const commitSeek = (value = draftProgress) => {
    if (value == null || !currentTrack || !canControl) return
    const nextTime = Math.max(0, Math.min(progressMax, value))
    setDraftProgress(null)
    seek(nextTime)
  }

  const addAudioFile = async (file?: File) => {
    if (!file || !canControl) return
    setAdding(true)
    try {
      const src = await fileToDataUrl(file)
      const track: BgmTrack = {
        id: `room-track-${Date.now()}`,
        title: file.name.replace(/\.[^.]+$/, ''),
        src,
        scene: context === 'room' ? 'room' : 'lobby',
        group: groupName.trim() || '默认分组',
      }
      addTrack(track)
      selectTrack(track.id)
    } catch {
      setError('音乐文件读取失败，请更换一个音频文件重试')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="music-player">
      <section className="music-now">
        <span>{context === 'room' ? '房间音乐控制台' : '大厅背景音乐'}</span>
        <strong>{currentTrack?.title || '未选择音乐'}</strong>
        <small>{currentTrack?.artist || currentTrack?.group || '等待曲目配置'}</small>
        {context === 'room' && (
          <em className={canControl ? 'music-role sn' : 'music-role'}>
            {canControl ? 'SN 控制中' : '接收 SN 播放指令'}
          </em>
        )}
      </section>

      <div className="music-progress">
        <input
          type="range"
          min={0}
          max={progressMax}
          step={0.1}
          value={displayProgress}
          disabled={!currentTrack || !canControl}
          onPointerDown={() => setDraftProgress(progress)}
          onChange={event => setDraftProgress(Number(event.target.value))}
          onPointerUp={event => commitSeek(Number(event.currentTarget.value))}
          onMouseUp={event => commitSeek(Number(event.currentTarget.value))}
          onTouchEnd={event => commitSeek(Number(event.currentTarget.value))}
          onPointerCancel={() => setDraftProgress(null)}
          onKeyUp={event => commitSeek(Number(event.currentTarget.value))}
          onBlur={event => commitSeek(Number(event.currentTarget.value))}
        />
        <div>
          <span>{formatTime(displayCurrentTime)}</span>
          <span>{hasKnownDuration ? formatTime(duration) : '--:--'}</span>
        </div>
      </div>

      <div className="music-controls">
        <button className="btn btn-sm" disabled={!tracks.length || !canControl} onClick={previousTrack}>上一首</button>
        <button className="btn btn-primary btn-sm" disabled={!tracks.length || !canControl} onClick={togglePlay}>
          {status === 'playing' ? '暂停' : '播放'}
        </button>
        <button className="btn btn-sm" disabled={!tracks.length || !canControl} onClick={nextTrack}>下一首</button>
      </div>

      <div className="music-mode">
        {(['single', 'list'] as PlayMode[]).map(mode => (
          <button
            key={mode}
            className={`btn btn-sm ${playMode === mode ? 'btn-primary' : ''}`}
            disabled={!canControl}
            onClick={() => setPlayMode(mode)}
          >
            {mode === 'single' ? '单曲循环' : '列表循环'}
          </button>
        ))}
      </div>

      <div className="music-volume">
        <button className="btn btn-ghost btn-sm" disabled={!canControl} onClick={toggleMuted}>
          {muted ? '静音' : '音量'}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          disabled={!canControl}
          onChange={event => setVolume(Number(event.target.value))}
        />
        <span>{Math.round((muted ? 0 : volume) * 100)}%</span>
      </div>

      <div className="music-add-row">
        <input
          className="input"
          value={groupName}
          disabled={!canControl}
          onChange={event => setGroupName(event.target.value)}
          placeholder="音乐分组"
        />
        <label className={`btn btn-sm music-file ${!canControl || adding ? 'disabled' : ''}`}>
          {adding ? '读取中' : '添加曲目'}
          <input
            type="file"
            accept="audio/*"
            hidden
            disabled={!canControl || adding}
            onChange={event => {
              void addAudioFile(event.currentTarget.files?.[0])
              event.currentTarget.value = ''
            }}
          />
        </label>
      </div>

      <div className="music-list">
        {tracks.length === 0 ? (
          <p className="music-empty">
            房间音乐等待 SN 添加曲目。登录页和大厅会默认循环播放《生命流》。
          </p>
        ) : (
          groupedTracks.map(([group, groupTracks]) => (
            <section key={group} className="music-group">
              <h4>{group}</h4>
              {groupTracks.map(track => (
                <div key={track.id} className={`music-track ${track.id === currentTrackId ? 'active' : ''}`}>
                  <button disabled={!canControl} onClick={() => selectTrack(track.id)}>
                    <strong>{track.title}</strong>
                    <small>{track.artist || track.scene || group}</small>
                  </button>
                  {canControl && context === 'room' && (
                    <button className="music-track-remove" onClick={() => removeTrack(track.id)}>删除</button>
                  )}
                </div>
              ))}
            </section>
          ))
        )}
      </div>

      {error && <p className="music-error">{error}</p>}
    </div>
  )
}
