import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const clientDir = resolve(scriptDir, '..')
const rootDir = resolve(clientDir, '..')
const sourceDir = resolve(rootDir, 'enimies_animy')
const targetDir = resolve(clientDir, 'public', 'spine', 'presets')
const manifestPath = resolve(clientDir, 'public', 'spine', 'presetTokens.json')

function toPublicPath(filePath) {
  return `/${relative(resolve(clientDir, 'public'), filePath).replaceAll('\\', '/')}`
}

function extractAvatarName(filename) {
  const name = filename.replace(/\.[^.]+$/, '')
  const parts = name.split('_').map(part => part.trim()).filter(Boolean)
  return parts.at(-1) || ''
}

function isTexturePng(filename) {
  return extname(filename).toLowerCase() === '.png' && filename.startsWith('enemy_')
}

function isAvatarPng(filename) {
  return extname(filename).toLowerCase() === '.png' && !isTexturePng(filename)
}

mkdirSync(targetDir, { recursive: true })

const presets = readdirSync(sourceDir, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name, 'en'))
  .map(entry => {
    const sourcePresetDir = join(sourceDir, entry.name)
    const targetPresetDir = join(targetDir, entry.name)
    mkdirSync(targetPresetDir, { recursive: true })
    cpSync(sourcePresetDir, targetPresetDir, { recursive: true })

    const files = readdirSync(targetPresetDir, { withFileTypes: true })
      .filter(file => file.isFile())
      .map(file => file.name)
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))

    const skeleton = files.find(file => extname(file).toLowerCase() === '.skel')
    const atlas = files.find(file => extname(file).toLowerCase() === '.atlas')
    const avatar = files.find(isAvatarPng)
    const texture = files.find(isTexturePng)

    if (!skeleton || !atlas) return null

    return {
      id: entry.name,
      name: avatar ? extractAvatarName(avatar) : entry.name,
      skeleton: toPublicPath(join(targetPresetDir, skeleton)),
      atlas: toPublicPath(join(targetPresetDir, atlas)),
      texture: texture ? toPublicPath(join(targetPresetDir, texture)) : null,
      avatar: avatar ? toPublicPath(join(targetPresetDir, avatar)) : null,
      animation: 'Idle',
      viewportScale: 2.55,
      offsetX: 0,
      offsetY: -10,
    }
  })
  .filter(Boolean)

writeFileSync(manifestPath, `${JSON.stringify(presets, null, 2)}\n`, 'utf8')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
console.log(`Generated ${manifest.length} preset tokens.`)
