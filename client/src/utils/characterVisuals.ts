const LOGO_BASE = '/logo/'

const professionFileKeys: Record<string, string> = {
  先锋: '先锋',
  近卫: '近卫',
  重装: '重装',
  狙击: '狙击',
  术师: '术师',
  术士: '术师',
  医疗: '医疗',
  辅助: '辅助',
  特种: '特种',
}

const subProfessionFileKeys: Record<string, string> = {
  战术家: '战术家',
  尖兵: '尖兵',
  冲锋手: '冲锋手',
  无畏者: '无畏者',
  术战者: '术战者',
  武者: '武者',
  强攻手: '强攻手',
  剑豪: '剑豪',
  速射手: '速射手',
  神射手: '神射手',
  炮手: '炮手',
  守护者: '守护者',
  铁卫: '铁卫',
  驭法铁卫: '驭法铁卫',
  处决者: '处决者',
  怪杰: '怪杰',
  巫役: '巫役',
  吟游者: '吟游者',
  护佑者: '护佑者',
  中坚术师: '中坚术师',
  中坚术士: '中坚术师',
  扩散术师: '扩散术师',
  扩散术士: '扩散术师',
  本源术师: '本源术师',
  本源术士: '本源术师',
  医师: '医师',
  群愈师: '群愈师',
  行医: '行医',
}

function assetPath(fileName: string) {
  return encodeURI(`${LOGO_BASE}${fileName}`)
}

function normalizeText(value?: string | number | null) {
  return String(value ?? '').trim()
}

function resolveElitePhase(value?: string | number | null) {
  const text = normalizeText(value)
  if (/[2二]/.test(text)) return '2'
  if (/[1一]/.test(text)) return '1'
  return '0'
}

export function getProfessionIcon(profession?: string | null, variant: 'withText' | 'white' = 'white') {
  const key = professionFileKeys[normalizeText(profession)]
  if (!key) return null
  return assetPath(variant === 'withText' ? `图标_职业_${key}_带文字.png` : `图标_职业_${key}_大图_白.png`)
}

export function getSubProfessionIcon(subProfession?: string | null) {
  const key = subProfessionFileKeys[normalizeText(subProfession)]
  if (!key) return null
  return assetPath(`职业分支图标_${key}.png`)
}

export function getElitePhaseIcon(elitePhase?: string | number | null, variant: 'large' | 'card' = 'card') {
  const phase = resolveElitePhase(elitePhase)
  if (variant === 'card' && phase !== '0') return assetPath(`精英_${phase}_卡片.png`)
  return assetPath(`精英_${phase}_大图.png`)
}

export function getLevelIcon(level?: string | number | null) {
  const levelText = normalizeText(level || 1).replace(/[^\d]/g, '') || '1'
  const fontSize = levelText.length > 2 ? 36 : levelText.length > 1 ? 46 : 52
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="72" viewBox="0 0 96 72">
  <defs>
    <radialGradient id="level-bg" cx="50%" cy="48%" r="54%">
      <stop offset="0%" stop-color="#101412"/>
      <stop offset="62%" stop-color="#050606"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <linearGradient id="level-ring" x1="18" y1="10" x2="78" y2="62" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#fff436"/>
      <stop offset="52%" stop-color="#b8b900"/>
      <stop offset="100%" stop-color="#514f00"/>
    </linearGradient>
    <filter id="level-glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="2.4" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0.92 0 1 0 0 0.9 0 0 1 0 0.1 0 0 0 0.72 0"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="digit-shadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="2" dy="2" stdDeviation="0.6" flood-color="#0b1012" flood-opacity="0.95"/>
      <feDropShadow dx="-1" dy="-1" stdDeviation="0.25" flood-color="#8fe8ff" flood-opacity="0.55"/>
    </filter>
  </defs>
  <circle cx="48" cy="37" r="31" fill="url(#level-bg)"/>
  <path d="M17 45a32 32 0 1 1 62 0" fill="none" stroke="#222400" stroke-width="8" stroke-linecap="round" opacity="0.72"/>
  <path d="M18 45a31 31 0 1 1 60 0" fill="none" stroke="url(#level-ring)" stroke-width="5.2" stroke-linecap="round" filter="url(#level-glow)"/>
  <path d="M20 44a29 29 0 0 1 8-22" fill="none" stroke="#ffff68" stroke-width="2" stroke-linecap="round" opacity="0.78"/>
  <path d="M74 39a27 27 0 0 0-5-18" fill="none" stroke="#3a3d00" stroke-width="3" stroke-linecap="round" opacity="0.85"/>
  <text x="48" y="53" text-anchor="middle" font-family="Arial Black, Impact, system-ui, sans-serif" font-size="${fontSize}" font-weight="900" fill="#f6fbff" filter="url(#digit-shadow)">${levelText}</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
