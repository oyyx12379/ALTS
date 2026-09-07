export type BgmScene = 'lobby' | 'room' | 'battle'

export type BgmTrack = {
  id: string
  title: string
  src: string
  scene?: BgmScene
  artist?: string
  group?: string
}

export const LOBBY_BGM_TRACKS: BgmTrack[] = [
  {
    id: 'life-flow',
    title: '生命流',
    artist: '塞壬唱片-MSR, BaoUner',
    src: '/music/塞壬唱片-MSR,BaoUner - 生命流.mp3',
    scene: 'lobby',
    group: '登录 / 大厅',
  },
]
