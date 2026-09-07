import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { EXCEL_DIR } from '../excelParser'

export function parseCombatClasses(filePath?: string) {
  const fp = filePath || path.join(EXCEL_DIR, 'v1.2.战斗职业（非法术部分）.xlsx')
  if (!fs.existsSync(fp)) {
    throw new Error(`Combat class file not found: ${fp}`)
  }

  const wb = XLSX.readFile(fp)
  const classes: any[] = []

  // Skip WPS reserved sheet
  const classSheets = wb.SheetNames.filter(s => s !== 'WpsReserved_CellImgList' && s !== '草稿')

  for (const sheetName of classSheets) {
    const sheet = wb.Sheets[sheetName]
    const classData = parseSingleClass(sheet, sheetName)
    if (classData) classes.push(classData)
  }

  return classes
}

function parseSingleClass(sheet: XLSX.WorkSheet, name: string) {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  const m: { [addr: string]: any } = {}

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = sheet[addr]
      if (cell && cell.v !== undefined) {
        m[addr] = cell.v
      }
    }
  }

  // Extract class metadata
  const className = m['B1'] || ''
  const engName = m['D1'] || ''
  const branchName = m['C4'] || name
  const branchTrait = m['B6'] || ''
  const weaponType = m['B7'] || ''
  const spRecovery = m['B10'] || ''
  const attackRange = m['B12'] || ''

  // Extract numerical data
  const hpMax = m['B16'] || 15
  const magicResist = m['B17'] || 3
  const physResist = m['B18'] || 3

  // HP/Resist algorithms
  const physResistAlg = m['B16'] || '通识技能×3+3'
  const magicResistAlg = m['B17'] || '通识技能×2.5+3'
  const hpAlg = m['B18'] || 'HP上限=生理耐受×3+（生理耐受/8+2）×升级次数'
  const read = (r: number, c: number) => m[XLSX.utils.encode_cell({ r, c })] || ''

  // Parse talents and skills by phase
  const phases: any[] = []
  const phaseRows: { [key: string]: number } = { '精英化阶段零': 2, '精英化阶段一': 6, '精英化阶段二': 10, '模组阶段': 14 }

  for (const [phaseName, rowOffset] of Object.entries(phaseRows)) {
    const talentName = m[XLSX.utils.encode_cell({ r: rowOffset + 1, c: 7 })] || '' // H
    const talentEffect = m[XLSX.utils.encode_cell({ r: rowOffset + 2, c: 7 })] || '' // H

    // Skills (技艺) are in columns L, Q, V, AA
    const skillColumns = [11, 16, 21, 26] // L, Q, V, AA

    const skills: any[] = []
    for (const nameCol of skillColumns) {
      const skillName = read(rowOffset, nameCol)
      if (skillName && !String(skillName).includes('行动消耗') && !String(skillName).includes('资源消耗')) {
        skills.push({
          name: String(skillName).trim(),
          actionCost: read(rowOffset + 1, nameCol + 1),
          spCost: Number(read(rowOffset + 2, nameCol + 1)) || 0,
          range: read(rowOffset + 1, nameCol + 4),
          target: read(rowOffset + 2, nameCol + 4),
          effect: read(rowOffset + 3, nameCol + 1),
        })
      }
    }

    // Passive skill
    const passiveName = read(rowOffset + 1, 32) // AG
    const passiveEffect = read(rowOffset + 2, 32) // AG

    phases.push({
      name: phaseName,
      talent: { name: talentName, effect: talentEffect },
      skills,
      passive: { name: passiveName, effect: passiveEffect },
    })
  }

  // Module phase skills
  const moduleSkills: any[] = []
  for (let i = 0; i < 4; i++) {
    const skillCols = [11, 16, 21, 26]
    const skillName = m[XLSX.utils.encode_cell({ r: 14, c: skillCols[i] })]
    if (skillName) {
      moduleSkills.push({
        name: String(skillName).trim(),
        actionCost: m[XLSX.utils.encode_cell({ r: 14, c: skillCols[i] - 1 })] || '',
        effect: m[XLSX.utils.encode_cell({ r: 16, c: skillCols[i] + 5 })] || '',
      })
    }
  }

  return {
    name: branchName,
    engName,
    branch: className,
    branchTrait,
    weaponType,
    spRecovery,
    attackRange,
    stats: { hpMax, magicResist, physResist },
    algorithms: { hp: hpAlg, physResist: physResistAlg, magicResist: magicResistAlg },
    phases,
    moduleSkills,
  }
}
