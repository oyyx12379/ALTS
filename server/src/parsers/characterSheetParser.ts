import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { EXCEL_DIR } from '../excelParser'

interface CellMap { [coord: string]: any }

type WorkbookWithFiles = XLSX.WorkBook & {
  files?: Record<string, { content?: Buffer; size?: number }>
}

type ParsedDrawingPic = {
  fromCol: number
  fromRow: number
  toCol: number
  toRow: number
  target: string
}

const PLACEHOLDER_PATTERN = /^【.*】$/

function cleanText(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value).replace(/\s*\n\s*/g, '\n').trim()
}

function readText(m: CellMap, addr: string, fallback = ''): string {
  const value = cleanText(m[addr])
  if (!value || PLACEHOLDER_PATTERN.test(value)) return fallback
  return value
}

function readNumber(m: CellMap, addr: string, fallback = 0): number {
  const value = m[addr]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = parseFloat(String(value ?? '').replace(/[^\d.-].*$/, ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

function readSlashMax(m: CellMap, addr: string, fallback = 0): number {
  const value = cleanText(m[addr])
  const match = value.match(/\/\s*(-?\d+(?:\.\d+)?)/)
  if (!match) return fallback
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback
}

export function resolveInfectionStage(value: unknown) {
  const numericValue = Number(value) || 0
  if (numericValue < 20) return '未感染'
  if (numericValue < 40) return '感染前期'
  if (numericValue < 60) return '感染中期'
  if (numericValue < 80) return '感染后期'
  return '感染末期'
}

export function parseCharacterSheet(filePath?: string) {
  const fp = filePath || path.join(EXCEL_DIR, 'v1.2.角色卡.Plus .xlsx')
  if (!fs.existsSync(fp)) {
    throw new Error(`Character sheet file not found: ${fp}`)
  }

  const wb = XLSX.readFile(fp, { bookFiles: true }) as WorkbookWithFiles
  const result: any = {
    sheets: wb.SheetNames,
    mainCard: null,
    traits: null,
    combatCard: null,
    mainTraitsDB: null,
    secondaryTraitsDB: null,
    infectionTraitsDB: null,
    traitRules: null,
    infectionData: null,
    raceParams: null,
    skillDB: null,
    dropdownLists: null,
    accessories: null,
    combatQuickRef: null,
  }

  // Parse main card
  if (wb.SheetNames.includes('主卡')) {
    result.mainCard = parseMainCard(wb.Sheets['主卡'], wb)
    result.characterCardVNext = result.mainCard.characterCardVNext
  }

  const traitParentMap = parseTraitParentMap(wb)

  if (wb.SheetNames.includes('特质表')) {
    result.traits = parseSelectedTraits(wb.Sheets['特质表'])
  }

  // Parse race parameters
  if (wb.SheetNames.includes('参数')) {
    result.raceParams = parseRaceParams(wb.Sheets['参数'])
  }

  // Parse trait database
  if (wb.SheetNames.includes('主要特质表')) {
    result.mainTraitsDB = parseTraitsTable(wb.Sheets['主要特质表'])
  }

  if (wb.SheetNames.includes('次要特质表')) {
    result.secondaryTraitsDB = parseSecondaryTraitsTable(wb.Sheets['次要特质表'], traitParentMap)
  }

  // Parse skills/talents database
  if (wb.SheetNames.includes('天赋.特质.技能数据库')) {
    result.skillDB = parseSkillDatabase(wb.Sheets['天赋.特质.技能数据库'])
  }

  // Parse dropdown lists
  if (wb.SheetNames.includes('下拉列表')) {
    result.dropdownLists = parseDropdownLists(wb.Sheets['下拉列表'])
  }

  // Parse combat quick reference
  if (wb.SheetNames.includes('战斗信息速查表')) {
    result.combatQuickRef = parseCombatQuickRef(wb.Sheets['战斗信息速查表'])
  }

  // Parse infection system
  if (wb.SheetNames.includes('感染系统')) {
    result.infectionData = parseInfectionSystem(wb.Sheets['感染系统'])
    result.infectionTraitsDB = parseInfectionTraits(result.infectionData)
  }

  result.traitRules = [
    ...(result.mainTraitsDB || []),
    ...(result.secondaryTraitsDB || []),
    ...(result.infectionTraitsDB || []),
  ]
  result.traits = mergeSelectedTraits(
    result.traits || [],
    result.mainCard?.characterCardVNext?.mainCard?.traitProfiles || [],
    result.traitRules,
  )

  return result
}

function getCellMap(sheet: XLSX.WorkSheet): CellMap {
  const map: CellMap = {}
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = sheet[addr]
      if (cell) {
        map[addr] = cell.v !== undefined ? cell.v : cell.w
      }
    }
  }
  return map
}

function getMimeType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.svg') return 'image/svg+xml'
  return 'image/png'
}

function resolveZipPath(fromFile: string, target: string) {
  const fromDir = path.posix.dirname(fromFile)
  return path.posix.normalize(path.posix.join(fromDir, target))
}

function parseRelationshipTargets(xml: string) {
  const targets: Record<string, string> = {}
  const relationshipPattern = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g
  for (const match of xml.matchAll(relationshipPattern)) {
    targets[match[1]] = match[2]
  }
  return targets
}

function parseDrawingPictures(drawingXml: string, relXml: string) {
  const relTargets = parseRelationshipTargets(relXml)
  const pics: ParsedDrawingPic[] = []
  const anchorPattern = /<xdr:twoCellAnchor[\s\S]*?<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?<xdr:to>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?<xdr:pic>[\s\S]*?<a:blip[^>]*r:embed="([^"]+)"[\s\S]*?<\/xdr:twoCellAnchor>/g

  for (const match of drawingXml.matchAll(anchorPattern)) {
    const target = relTargets[match[5]]
    if (!target || target === 'NULL') continue
    pics.push({
      fromCol: Number(match[1]),
      fromRow: Number(match[2]),
      toCol: Number(match[3]),
      toRow: Number(match[4]),
      target,
    })
  }

  return pics
}

function getMediaDataUri(files: WorkbookWithFiles['files'], mediaPath: string) {
  const media = files?.[mediaPath]
  return media?.content?.length ? `data:${getMimeType(mediaPath)};base64,${media.content.toString('base64')}` : ''
}

function parseCellImageTargets(wb: WorkbookWithFiles) {
  const files = wb.files || {}
  const xml = files['xl/cellimages.xml']?.content?.toString('utf8')
  const relXml = files['xl/_rels/cellimages.xml.rels']?.content?.toString('utf8')
  if (!xml || !relXml) return {}

  const relTargets = parseRelationshipTargets(relXml)
  const targets: Record<string, string> = {}
  const imagePattern = /<etc:cellImage>[\s\S]*?<xdr:cNvPr[^>]*\bname="([^"]+)"[^>]*>[\s\S]*?<a:blip[^>]*r:embed="([^"]+)"[\s\S]*?<\/etc:cellImage>/g
  for (const match of xml.matchAll(imagePattern)) {
    const target = relTargets[match[2]]
    if (target && target !== 'NULL') {
      targets[match[1]] = path.posix.normalize(path.posix.join('xl', target))
    }
  }
  return targets
}

function extractPortraitFromWorkbook(wb: WorkbookWithFiles, sheet?: XLSX.WorkSheet) {
  const files = wb.files || {}
  const mainDrawingPath = 'xl/drawings/drawing1.xml'
  const mainDrawingRelPath = 'xl/drawings/_rels/drawing1.xml.rels'
  const drawingXml = files[mainDrawingPath]?.content?.toString('utf8')
  const relXml = files[mainDrawingRelPath]?.content?.toString('utf8')

  // WPS stores cell images behind DISPIMG("ID_xxx", 1). If a portrait is
  // inserted as a cell image inside the portrait block, prefer the exact ID.
  if (sheet) {
    const cellImageTargets = parseCellImageTargets(wb)
    for (let r = 1; r <= 20; r++) {
      for (let c = 23; c <= 30; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        const cell = sheet[addr]
        const formula = String(cell?.f || cell?.v || '')
        const id = formula.match(/DISPIMG\("([^"]+)"/)?.[1]
        const mediaPath = id ? cellImageTargets[id] : ''
        const uri = mediaPath ? getMediaDataUri(files, mediaPath) : ''
        if (uri) return uri
      }
    }
  }

  if (drawingXml && relXml) {
    const pics = parseDrawingPictures(drawingXml, relXml)
    const portraitPic = pics
      .map(pic => ({
        pic,
        overlapCols: Math.max(0, Math.min(pic.toCol, 30) - Math.max(pic.fromCol, 23)),
        overlapRows: Math.max(0, Math.min(pic.toRow, 21) - Math.max(pic.fromRow, 1)),
      }))
      .filter(item => item.overlapCols * item.overlapRows >= 8)
      .sort((a, b) => (b.overlapCols * b.overlapRows) - (a.overlapCols * a.overlapRows))[0]?.pic

    if (portraitPic) {
      const mediaPath = resolveZipPath(mainDrawingPath, portraitPic.target)
      const uri = getMediaDataUri(files, mediaPath)
      if (uri) return uri
    }
  }

  return ''
}

function parseMainCard(sheet: XLSX.WorkSheet, wb: WorkbookWithFiles) {
  const m = getCellMap(sheet)

  // === Basic Info ===
  const basicInfo = {
    name: readText(m, 'D3'),
    player: readText(m, 'D4'),
    gender: readText(m, 'D5'),
    age: readText(m, 'H5'),
    birthday: readText(m, 'D6'),
    origin: readText(m, 'D7'),
    race: readText(m, 'D8'),
    profession: readText(m, 'D9'),
    subProfession: readText(m, 'H9'),
    height: readText(m, 'D10'),
    weight: readText(m, 'H10'),
    build: readText(m, 'J11'),
    elitePhase: readText(m, 'AR10', '阶段零'),
    currentLevel: readNumber(m, 'AX10', 1),
    baseLevel: readNumber(m, 'AX8', 1),
  }

  // === 7 Base Attributes ===
  const attrNames = ['生理耐受', '反应机动', '物理强度', '精神意志', '经验智慧', '源石技艺适应性', '个人魅力']
  const attrRows = [4, 5, 6, 7, 8, 9, 10]
  const attrs: any[] = attrNames.map((name, i) => ({
    name,
    abbr: ['PR', 'MOB', 'PS', 'SPR', 'INT', 'OAA', 'APP'][i],
    total: m[`Q${attrRows[i]}`] || 5,
    base: m[`S${attrRows[i]}`] || 5,
    modifier: m[`T${attrRows[i]}`] || 0,
    growth: m[`U${attrRows[i]}`] || 0,
  }))

  // === Derived Attributes ===
  const derived = {
    hp: { current: readNumber(m, 'AH24', 0), max: readSlashMax(m, 'AI24', readNumber(m, 'AK24', 15)) },
    physResist: readNumber(m, 'AK25', 3),
    magicResist: readNumber(m, 'AK26', 3),
    sp: { current: readNumber(m, 'AH27', 0), max: readNumber(m, 'AK27', 9), init: readNumber(m, 'AI27', 0) },
    elemResist: readNumber(m, 'AI29', 6),
    artPoints: { current: readNumber(m, 'AI30', 0), max: 3 },
    weight: readNumber(m, 'AI31', 1),
    stamina: readNumber(m, 'AI32', 2),
  }

  // === Skills ===
  const skills = parseSkills(m)

  // === Combat Info ===
  const combat = {
    branchTrait: readText(m, 'AF19'),
    weaponName: readText(m, 'AH33'),
    weaponDice: readText(m, 'AL35', readText(m, 'AW13').match(/D\d+/)?.[0] || 'D6'),
    damageType: readText(m, 'AL36'),
    attackType: readText(m, 'AH36'),
    attackRange: '',
    armorType: readText(m, 'AL45', '中甲'),
    spRecovery: readText(m, 'AR19'),
    weaponType: readText(m, 'AW13'),
    weaponNotes: readText(m, 'AW13'),
  }

  // === Infection ===
  const currentInfectionValue = readNumber(m, 'F14', 0)
  const infection = {
    immunity: readNumber(m, 'B14', 5),
    initialValue: readNumber(m, 'D14', 0),
    currentValue: currentInfectionValue,
    stage: readText(m, 'H14', resolveInfectionStage(currentInfectionValue)),
    symptoms: ['B16', 'B17', 'B18', 'C16', 'C17', 'C18'].map(addr => readText(m, addr)).filter(Boolean).join('；'),
    tempOutbreak: ['F16', 'F17', 'F18', 'G16', 'G17', 'G18'].map(addr => readText(m, addr)).filter(Boolean).join('；'),
    longTerm: ['B20', 'C20', 'D20', 'E20'].map(addr => readText(m, addr)).filter(Boolean).join('；'),
  }

  // === Growth Table ===
  const growth = {
    combatStyle: m['AG9'] || '',
    growthPoints: m['AG7'] || 0,
    educationGrowth: m['AH8'] || 0,
    attrSuccesses: m['AI8'] || 0,
    attrFailures: m['AJ8'] || 0,
  }

  const portrait = {
    imageUrl: extractPortraitFromWorkbook(wb, sheet),
    notes: '',
  }

  const characterCardVNext = {
    version: 1,
    mainCard: {
      portrait,
      traitProfiles: [
        { category: '种族', name: readText(m, 'L14'), description: '', attributeChanges: '' },
        { category: '文化', name: readText(m, 'R14'), description: '', attributeChanges: '' },
        { category: '工作', name: readText(m, 'X14'), description: '', attributeChanges: '' },
      ].filter(item => item.name),
      reputation: {
        economy: [readText(m, 'E48'), readText(m, 'E49')].filter(Boolean).join(' / '),
        resources: readText(m, 'E53'),
        contacts: readText(m, 'E56'),
        titles: readText(m, 'E60'),
        notes: '',
      },
      archive: {
        objectiveHistory: readText(m, 'C71'),
        personalBelief: [readText(m, 'C83'), readText(m, 'C87'), readText(m, 'C91')].filter(Boolean).join('\n'),
        belongings: readText(m, 'O73'),
        notes: '',
      },
      moduleExperiences: [],
      professionTable: {
        branch: readText(m, 'AI14') || basicInfo.subProfession,
        attackRange: '',
        weaponType: readText(m, 'AW13'),
        branchTrait: readText(m, 'AF19'),
        spRecovery: readText(m, 'AR19'),
        notes: '',
      },
    },
    combatCard: {
      mainClass: {
        name: basicInfo.profession,
        description: '',
        attackRange: '',
        branchTrait: readText(m, 'AF19'),
        weaponType: readText(m, 'AW13'),
        spRecovery: readText(m, 'AR19'),
      },
      subClass: {
        name: basicInfo.subProfession,
        description: '',
        attackRange: '',
        branchTrait: readText(m, 'AF19'),
        weaponType: readText(m, 'AW13'),
        spRecovery: readText(m, 'AR19'),
      },
      elitePhases: [
        { phase: '0', talents: [], actions: [], arts: [] },
        { phase: '1', talents: [], actions: [], arts: [] },
        { phase: '2', talents: [], actions: [], arts: [] },
      ],
    },
  }

  return { basicInfo, attributes: attrs, derived, skills, combat, infection, growth, portrait, characterCardVNext }
}

function parseSkills(m: CellMap) {
  // Skill structure from the main card
  // Columns: E-H for 力量 skills, J-M for 战术, Q-T for 敏捷, X-AA for 源石技艺
  // Then: personal charm skills, experience wisdom skills, etc.
  const skillDefs = [
    // [name, totalCell, growthCell, modCell, addCell, maxStr]
    // Row 26: ★ skills (main)
    { name: '力量', total: 'E26', growth: 'F26', mod: 'G26', add: 'H26', max: '3/3', isMain: true },
    { name: '战术', total: 'L26', growth: 'M26', mod: 'N26', add: 'O26', max: '2/2', isMain: true },
    { name: '敏捷', total: 'S26', growth: 'T26', mod: 'U26', add: 'V26', max: '2/2', isMain: true },
    { name: '源石技艺理论', total: 'Z26', growth: 'AA26', mod: 'AB26', add: 'AC26', max: '2/2', isMain: true },
    { name: '个人魅力', total: 'F34', growth: '', mod: '', add: '', max: '5', isMain: true },
    { name: '精神意志', total: 'AA31', growth: '', mod: '', add: '', max: '5', isMain: true },
    // Sub-skills (rows 27-40)
    { name: '格斗', total: 'E27', growth: 'F27', mod: 'G27', add: 'H27', max: '0', isMain: false, category: '力量' },
    { name: '长兵', total: 'E28', growth: 'F28', mod: 'G28', add: 'H28', max: '0', isMain: false, category: '力量' },
    { name: '软兵', total: 'E29', growth: 'F29', mod: 'G29', add: 'H29', max: '0', isMain: false, category: '力量' },
    { name: '刀剑', total: 'E30', growth: 'F30', mod: 'G30', add: 'H30', max: '0', isMain: false, category: '力量' },
    { name: '拳术', total: 'E31', growth: 'F31', mod: 'G31', add: 'H31', max: '0', isMain: false, category: '力量' },
    { name: '钝器', total: 'E32', growth: 'F32', mod: 'G32', add: 'H32', max: '0', isMain: false, category: '力量' },
    { name: '盾术', total: 'E33', growth: 'F33', mod: 'G33', add: 'H33', max: '0', isMain: false, category: '力量' },
    // 战术 sub-skills
    { name: '战术规划', total: 'L27', growth: 'M27', mod: 'N27', add: 'O27', max: '0', isMain: false, category: '战术' },
    { name: '支援技术', total: 'L28', growth: 'M28', mod: 'N28', add: 'O28', max: '0', isMain: false, category: '战术' },
    { name: '兵械操作', total: 'L29', growth: 'M29', mod: 'N29', add: 'O29', max: '0', isMain: false, category: '战术' },
    { name: '生物驯养', total: 'L30', growth: 'M30', mod: 'N30', add: 'O30', max: '0', isMain: false, category: '战术' },
    // 敏捷 sub-skills
    { name: '身法', total: 'S27', growth: 'T27', mod: 'U27', add: 'V27', max: '0', isMain: false, category: '敏捷' },
    { name: '短兵', total: 'S28', growth: 'T28', mod: 'U28', add: 'V28', max: '0', isMain: false, category: '敏捷' },
    { name: '暗器', total: 'S29', growth: 'T29', mod: 'U29', add: 'V29', max: '0', isMain: false, category: '敏捷' },
    { name: '射击', total: 'S30', growth: 'T30', mod: 'U30', add: 'V30', max: '0', isMain: false, category: '敏捷' },
    // 源石技艺 sub-skills
    { name: '施术', total: 'Z27', growth: 'AA27', mod: 'AB27', add: 'AC27', max: '0', isMain: false, category: '源石技艺理论' },
  ]

  // Extended skill definitions from the main card layout
  // Row 35+: personal charm sub-skills
  const charmSkills = [
    { name: '情感', total: 'E35', growth: 'F35', mod: 'G35', add: '', max: '5/5', isMain: false, category: '个人魅力' },
    { name: '声乐', total: 'E36', growth: 'F36', mod: 'G36', add: '', max: '0', isMain: false, category: '个人魅力' },
    { name: '艺术', total: 'E37', growth: 'F37', mod: 'G37', add: '', max: '0', isMain: false, category: '个人魅力' },
    { name: '心理', total: 'E38', growth: 'F38', mod: 'G38', add: '', max: '0', isMain: false, category: '个人魅力' },
    { name: '交涉', total: 'E39', growth: 'F39', mod: 'G39', add: '', max: '5/5', isMain: false, category: '个人魅力' },
    { name: '游说', total: 'E40', growth: 'F40', mod: 'G40', add: '', max: '0', isMain: false, category: '个人魅力' },
  ]

  // Experience wisdom sub-skills (rows 34-39 right side)
  const wisdomSkills = [
    { name: '教育', total: 'L31', growth: 'M31', mod: 'N31', add: '', max: '5/5', isMain: false, category: '经验智慧' },
    { name: '理工学', total: 'L32', growth: 'M32', mod: 'N32', add: '', max: '0', isMain: false, category: '经验智慧' },
    { name: '医药学', total: 'L33', growth: 'M33', mod: 'N33', add: '', max: '0', isMain: false, category: '经验智慧' },
    { name: '源石学', total: 'L34', growth: 'M34', mod: 'N34', add: '', max: '0', isMain: false, category: '经验智慧' },
    { name: '社会学', total: 'L35', growth: 'M35', mod: 'N35', add: '', max: '0', isMain: false, category: '经验智慧' },
    { name: '政法学', total: 'L36', growth: 'M36', mod: 'N36', add: '', max: '0', isMain: false, category: '经验智慧' },
    { name: '经管学', total: 'L37', growth: 'M37', mod: 'N37', add: '', max: '0', isMain: false, category: '经验智慧' },
  ]

  // Technology skills
  const techSkills = [
    { name: '技术', total: 'L38', growth: 'M38', mod: 'N38', add: '', max: '5/5', isMain: false, category: '技术' },
    { name: '农林渔牧', total: 'L39', growth: 'M39', mod: 'N39', add: '', max: '0', isMain: false, category: '技术' },
    { name: '手工工艺', total: 'L40', growth: 'M40', mod: 'N40', add: '', max: '0', isMain: false, category: '技术' },
  ]

  // Agility sub-skills
  const agiSkills = [
    { name: '灵巧', total: 'S31', growth: 'T31', mod: 'U31', add: '', max: '5/5', isMain: false, category: '灵巧' },
    { name: '妙手', total: 'S32', growth: 'T32', mod: 'U32', add: '', max: '0', isMain: false, category: '灵巧' },
    { name: '急救', total: 'S33', growth: 'T33', mod: 'U33', add: '', max: '0', isMain: false, category: '灵巧' },
    { name: '驾驶', total: 'S34', growth: 'T34', mod: 'U34', add: '', max: '0', isMain: false, category: '灵巧' },
  ]

  // Mental sub-skills
  const mentalSkills = [
    { name: '镇定', total: 'Z32', growth: 'AA32', mod: 'AB32', add: '', max: '5/5', isMain: false, category: '镇定' },
    { name: '欺诈', total: 'Z33', growth: 'AA33', mod: 'AB33', add: '', max: '0', isMain: false, category: '镇定' },
    { name: '乔装', total: 'Z34', growth: 'AA34', mod: 'AB34', add: '', max: '0', isMain: false, category: '镇定' },
    { name: '潜行', total: 'Z35', growth: 'AA35', mod: 'AB35', add: '', max: '0', isMain: false, category: '镇定' },
  ]

  // Insight sub-skills
  const insightSkills = [
    { name: '洞察', total: 'Z36', growth: 'AA36', mod: 'AB36', add: '', max: '5/5', isMain: false, category: '洞察' },
    { name: '调查', total: 'Z37', growth: 'AA37', mod: 'AB37', add: '', max: '0', isMain: false, category: '洞察' },
    { name: '觉察', total: 'Z38', growth: 'AA38', mod: 'AB38', add: '', max: '0', isMain: false, category: '洞察' },
    { name: '追踪', total: 'Z39', growth: 'AA39', mod: 'AB39', add: '', max: '0', isMain: false, category: '洞察' },
  ]

  const allSkillDefs = [...skillDefs, ...charmSkills, ...wisdomSkills, ...techSkills, ...agiSkills, ...mentalSkills, ...insightSkills]

  const skills: any[] = []
  for (const def of allSkillDefs) {
    const total = m[def.total]
    if (total !== undefined && total !== null && total !== '') {
      skills.push({
        name: def.name,
        total: typeof total === 'number' ? total : parseFloat(String(total)) || 0,
        growth: parseFloat(String(m[def.growth] || 0)) || 0,
        modifier: parseFloat(String(m[def.mod] || 0)) || 0,
        addPoints: parseFloat(String(m[def.add] || 0)) || 0,
        max: def.max,
        isMain: def.isMain || false,
        category: def.category || '',
      })
    }
  }

  return skills
}

function normalizeTraitLookupName(value: unknown) {
  return cleanText(value)
    .replace(/\*/g, '')
    .replace(/\s+/g, '')
    .replace(/_/g, '')
}

function parseTraitCost(value: unknown) {
  const costText = cleanText(value)
  return {
    cost: /^[-+]?\d+$/.test(costText) ? Number(costText) : 0,
    costText,
  }
}

function parseBoundTraitNames(effect: unknown) {
  const text = cleanText(effect)
  const names: string[] = []
  const pattern = /与(?:特质)?【([^】]+)】绑定/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    const name = cleanText(match[1])
    if (name && !names.includes(name)) names.push(name)
  }
  if (/与至少一个该特质的修正因子绑定/.test(text)) names.push('@modifier')
  return names
}

function parseTraitParentMap(wb: WorkbookWithFiles) {
  const parentMap = new Map<string, string>()
  const dropdown = wb.Sheets['下拉列表']
  if (!dropdown) return parentMap
  const m = getCellMap(dropdown)
  const names = wb.Workbook?.Names || []

  for (const item of names) {
    const ref = String(item.Ref || '')
    const rowMatch = ref.match(/下拉列表!\$W\$(\d+)/)
    if (!rowMatch || String(item.Name || '').startsWith('_xlnm.')) continue
    const row = Number(rowMatch[1])
    const parentName = readText(m, `V${row}`)
    if (!parentName) continue
    for (const column of ['W', 'X', 'Y', 'Z', 'AA']) {
      const childName = readText(m, `${column}${row}`)
      if (!childName || childName === '无') continue
      parentMap.set(normalizeTraitLookupName(childName), parentName)
    }
  }

  return parentMap
}

function parseSecondaryTraitsTable(sheet: XLSX.WorkSheet, parentMap: Map<string, string>) {
  const m = getCellMap(sheet)
  const traits: any[] = []
  for (let row = 2; row <= 400; row++) {
    const name = readText(m, `C${row}`)
    if (!name) continue
    const subcategory = readText(m, `B${row}`)
    const { cost, costText } = parseTraitCost(m[`F${row}`])
    const parentName = parentMap.get(normalizeTraitLookupName(name)) || ''
    const type = subcategory === '社交特质' ? 'social' : 'secondary'
    traits.push({
      sourceId: readText(m, `A${row}`),
      name,
      description: readText(m, `D${row}`),
      effect: readText(m, `E${row}`),
      cost,
      costText,
      category: subcategory,
      subcategory,
      type,
      pointType: type === 'social' ? 'social' : 'trait',
      parentName,
      isModifier: Boolean(parentName),
      requires: parseBoundTraitNames(m[`E${row}`]),
      source: 'excel',
    })
  }
  return traits
}

function parseInfectionTraits(infectionData: any) {
  return (infectionData?.symptoms || []).map((symptom: any, index: number) => ({
    sourceId: `infection-${index + 1}`,
    name: symptom.traitName || symptom.name,
    description: symptom.description || '',
    effect: symptom.modifier || '',
    cost: 0,
    costText: '',
    category: '感染特质',
    subcategory: symptom.bodyPart || '感染特质',
    type: 'infection',
    pointType: 'trait',
    parentName: '',
    isModifier: false,
    requires: [],
    source: 'excel',
  }))
}

function mergeSelectedTraits(selected: any[], primaryProfiles: any[], rules: any[]) {
  const ruleMap = new Map<string, any>()
  for (const rule of rules) ruleMap.set(normalizeTraitLookupName(rule.name), rule)
  const primary = primaryProfiles.map(profile => ({
    name: profile.name,
    description: profile.description || '',
    effect: profile.attributeChanges || '',
    cost: undefined,
    category: profile.category || '',
    subcategory: profile.category || '',
    type: 'primary',
    pointType: 'trait',
    parentName: '',
    isModifier: false,
    source: 'excel',
  }))
  const merged = [...primary, ...selected]
    .filter(trait => trait?.name)
    .map(trait => {
      const rule = ruleMap.get(normalizeTraitLookupName(trait.name))
      return {
        ...rule,
        ...trait,
        description: trait.description || rule?.description || '',
        effect: trait.effect || rule?.effect || '',
        cost: Number.isFinite(Number(trait.cost)) ? Number(trait.cost) : Number(rule?.cost) || 0,
        category: trait.category || rule?.category || '',
        subcategory: trait.subcategory || rule?.subcategory || trait.category || '',
        type: trait.type || rule?.type || 'secondary',
        pointType: trait.pointType || rule?.pointType || (rule?.type === 'social' ? 'social' : 'trait'),
        parentName: trait.parentName || rule?.parentName || '',
        isModifier: Boolean(trait.isModifier || rule?.isModifier),
        source: 'excel',
      }
    })

  const seen = new Set<string>()
  return merged.filter(trait => {
    const key = `${trait.type}:${trait.subcategory}:${normalizeTraitLookupName(trait.name)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function parseSelectedTraits(sheet: XLSX.WorkSheet) {
  const m = getCellMap(sheet)
  const traits: any[] = []
  let currentCategory = ''
  const ignoredNames = new Set(['特质名称', '修正因子', '无'])

  for (let row = 3; row <= 252; row++) {
    const categoryLabel = readText(m, `B${row}`)
    if (categoryLabel && !['修正因子', '我的特质'].includes(categoryLabel)) {
      currentCategory = categoryLabel.replace(/\s+/g, '')
    }

    const slotLabel = readText(m, `C${row}`)
    const isModifierSlot = slotLabel === '修正因子'
    const name = isModifierSlot ? readText(m, `D${row}`) : (slotLabel || readText(m, `D${row}`))
    if (!name || ignoredNames.has(name)) continue
    const { cost, costText } = parseTraitCost(m[`G${row}`])
    const type = currentCategory === '社交特质' ? 'social' : 'secondary'
    traits.push({
      name,
      description: readText(m, `E${row}`),
      effect: readText(m, `F${row}`),
      cost,
      costText,
      category: currentCategory,
      subcategory: currentCategory,
      type,
      pointType: type === 'social' ? 'social' : 'trait',
      isModifier: isModifierSlot,
      source: 'excel',
    })
  }

  return traits
}

function parseRaceParams(sheet: XLSX.WorkSheet) {
  // The 参数 sheet maps race/culture names to attribute/skill bonuses
  // Row 1: headers with attribute names (C1=生理耐受, D1=反应机动, ...)
  // Rows 2-100: race/culture/job names in column A, bonuses in subsequent columns
  const m = getCellMap(sheet)

  // Read header row
  const headers: string[] = []
  for (let c = 2; c <= 62; c++) { // C to BJ
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    headers[c] = m[addr] ? String(m[addr]) : ''
  }

  const races: any[] = []
  for (let r = 1; r <= 99; r++) {
    const nameCell = XLSX.utils.encode_cell({ r, c: 0 })
    const name = m[nameCell]
    if (!name || String(name).trim() === '') continue

    const race: any = { name: String(name).trim().replace(/\s*\n\s*/g, ''), bonuses: {} }
    for (let c = 1; c <= 61; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const val = m[addr]
      if (val !== undefined && val !== null && val !== 0 && val !== '') {
        const headerName = headers[c] || `col_${c}`
        race.bonuses[headerName] = val
      }
    }
    races.push(race)
  }

  return races
}

function parseTraitsTable(sheet: XLSX.WorkSheet) {
  const m = getCellMap(sheet)
  const traits: any[] = []

  // 3 sections: A-D (race traits), E-H (cultural traits), I-L (work traits)
  const sections = [
    { nameCol: 0, costCol: 1, descCol: 2, effectCol: 3, category: '种族' },
    { nameCol: 4, costCol: 5, descCol: 6, effectCol: 7, category: '文化' },
    { nameCol: 8, costCol: 9, descCol: 10, effectCol: 11, category: '工作' },
  ]

  for (let r = 2; r <= 57; r++) {
    for (const sec of sections) {
      const nameAddr = XLSX.utils.encode_cell({ r, c: sec.nameCol })
      const name = m[nameAddr]
      if (!name || String(name).trim() === '') continue

      const rawCost = m[XLSX.utils.encode_cell({ r, c: sec.costCol })]
      const { cost, costText } = parseTraitCost(rawCost)
      traits.push({
        name: String(name).trim(),
        cost,
        costText,
        description: m[XLSX.utils.encode_cell({ r, c: sec.descCol })] || '',
        effect: m[XLSX.utils.encode_cell({ r, c: sec.effectCol })] || '',
        category: sec.category,
        subcategory: sec.category,
        type: 'primary',
        pointType: 'trait',
        parentName: '',
        isModifier: false,
        requires: parseBoundTraitNames(m[XLSX.utils.encode_cell({ r, c: sec.effectCol })]),
        source: 'excel',
      })
    }
  }

  return traits
}

function parseSkillDatabase(sheet: XLSX.WorkSheet) {
  const m = getCellMap(sheet)
  const entries: any[] = []

  // Columns: A=天赋名称, B=天赋效果, C=特质名称, E=特质描述, G=特质效果, I=点数花费, J=技能名称, K=技能效果
  for (let r = 1; r <= 200; r++) {
    const name = m[XLSX.utils.encode_cell({ r, c: 2 })] // Column C = trait name
    if (!name || String(name).trim() === '') continue

    entries.push({
      name: String(name).trim(),
      description: m[XLSX.utils.encode_cell({ r, c: 4 })] || '',
      effect: m[XLSX.utils.encode_cell({ r, c: 6 })] || '',
      cost: m[XLSX.utils.encode_cell({ r, c: 8 })] || 0,
    })
  }

  return entries
}

function parseDropdownLists(sheet: XLSX.WorkSheet) {
  const m = getCellMap(sheet)
  const lists: any = {}

  // Combat skills list
  const combatSkills: string[] = []
  for (let r = 3; r <= 10; r++) {
    for (let c = 22; c <= 29; c++) { // V-AC
      const val = m[XLSX.utils.encode_cell({ r, c })]
      if (val && String(val).trim() && !String(val).startsWith('#')) {
        combatSkills.push(String(val).trim())
      }
    }
  }
  lists.combatSkills = [...new Set(combatSkills)]

  // Non-combat skills
  const nonCombatSkills: string[] = []
  for (let r = 9; r <= 13; r++) {
    const val = m[XLSX.utils.encode_cell({ r, c: 21 })] // V
    if (val) nonCombatSkills.push(String(val).trim())
  }
  lists.nonCombatSkills = nonCombatSkills

  // Arts categories
  const artsCategories: string[] = []
  for (let r = 15; r <= 31; r++) {
    const val = m[XLSX.utils.encode_cell({ r, c: 21 })] // V
    if (val) artsCategories.push(String(val).trim())
  }
  lists.artsCategories = artsCategories

  return lists
}

function parseCombatQuickRef(sheet: XLSX.WorkSheet) {
  const m = getCellMap(sheet)
  const actions: any[] = []
  const buffs: any[] = []
  const debuffs: any[] = []
  const terrains: any[] = []

  // Active actions (rows 1-17)
  for (let r = 1; r <= 22; r++) {
    const name = m[XLSX.utils.encode_cell({ r, c: 0 })]
    if (name) {
      actions.push({
        name: String(name).trim(),
        cost: m[XLSX.utils.encode_cell({ r, c: 1 })] || '',
        condition: m[XLSX.utils.encode_cell({ r, c: 2 })] || '',
        effect: m[XLSX.utils.encode_cell({ r, c: 3 })] || '',
      })
    }
  }

  // Status effects (positive: E-F col, negative: G-H col)
  for (let r = 1; r <= 22; r++) {
    const posName = m[XLSX.utils.encode_cell({ r, c: 4 })]
    if (posName && String(posName).trim()) {
      buffs.push({
        name: String(posName).trim(),
        effect: m[XLSX.utils.encode_cell({ r, c: 5 })] || '',
      })
    }
    const negName = m[XLSX.utils.encode_cell({ r, c: 6 })]
    if (negName && String(negName).trim()) {
      debuffs.push({
        name: String(negName).trim(),
        effect: m[XLSX.utils.encode_cell({ r, c: 7 })] || '',
      })
    }
  }

  // Terrain effects (G-H cols, rows 22-37)
  for (let r = 22; r <= 37; r++) {
    const name = m[XLSX.utils.encode_cell({ r, c: 6 })]
    if (name) {
      terrains.push({
        name: String(name).trim(),
        effect: m[XLSX.utils.encode_cell({ r, c: 7 })] || '',
      })
    }
  }

  return { actions, buffs, debuffs, terrains }
}

function parseInfectionSystem(sheet: XLSX.WorkSheet) {
  const m = getCellMap(sheet)
  const symptoms: any[] = []
  const treatments: string[] = []
  let currentBodyPart = ''

  for (let r = 2; r <= 17; r++) {
    const row = r - 1
    const name = m[`B${r}`]
    if (!name) continue
    currentBodyPart = readText(m, `A${r}`, currentBodyPart)
    symptoms.push({
      bodyPart: currentBodyPart,
      name: String(name).trim(),
      description: m[`C${r}`] || '',
      modifier: m[`D${r}`] || '',
      outbreak: m[`E${r}`] || '',
      outbreakEffect: m[`F${r}`] || '',
      traitName: m[`H${r}`] || String(name).trim(),
      outbreakTraitName: m[`I${r}`] || '',
      row,
    })
  }

  for (let r = 20; r <= 40; r++) {
    const value = m[`B${r}`]
    if (value && String(value).trim()) treatments.push(String(value).trim())
  }

  // Extract infection-related data
  return {
    stages: ['未感染', '感染前期', '感染中期', '感染后期', '感染末期'],
    symptoms,
    treatments,
    data: m,
  }
}
