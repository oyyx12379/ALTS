import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { EXCEL_DIR } from '../excelParser'

export function parseArtsData(filePath?: string) {
  const fp = filePath || path.join(EXCEL_DIR, 'v1.2源石技艺.xlsx')
  if (!fs.existsSync(fp)) {
    throw new Error(`Arts file not found: ${fp}`)
  }

  const wb = XLSX.readFile(fp)
  const schools: any[] = []

  const artSheets = wb.SheetNames.filter(s =>
    s !== 'WpsReserved_CellImgList' && s !== '草稿' && s !== '空表格' &&
    s !== '法术职业' && s !== 'v1.2更新记录'
  )

  for (const sheetName of artSheets) {
    const schoolData = parseArtsSchool(wb.Sheets[sheetName], sheetName)
    if (schoolData) schools.push(schoolData)
  }

  return schools
}

function parseArtsSchool(sheet: XLSX.WorkSheet, name: string) {
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

  const schoolName = m['B1'] || name
  const engName = m['G1'] || ''

  // Parse spells by phase (row 3: 精零, row 7: 精一, row 11: 精二)
  const spells: any[] = []
  const phaseRows = [
    { startRow: 2, name: '精零' },
    { startRow: 6, name: '精一' },
    { startRow: 10, name: '精二' },
  ]

  for (const phase of phaseRows) {
    const skillCols = [1, 6, 11, 16, 21, 26, 31] // B, G, L, Q, V, AA, AF
    for (const col of skillCols) {
      const nameCell = m[XLSX.utils.encode_cell({ r: phase.startRow, c: col })]
      if (nameCell && String(nameCell).trim() && !String(nameCell).includes('行动消耗') && !String(nameCell).includes('资源消耗')) {
        spells.push({
          name: String(nameCell).trim(),
          school: schoolName,
          phase: phase.name,
          actionCost: m[XLSX.utils.encode_cell({ r: phase.startRow - 1, c: col + 1 })] || '',
          spCost: m[XLSX.utils.encode_cell({ r: phase.startRow, c: col + 1 })] || 0,
          range: m[XLSX.utils.encode_cell({ r: phase.startRow - 1, c: col + 3 })] || '',
          target: m[XLSX.utils.encode_cell({ r: phase.startRow, c: col + 3 })] || '',
          effect: m[XLSX.utils.encode_cell({ r: phase.startRow + 1, c: col + 4 })] || '',
        })
      }
    }
  }

  return {
    name: schoolName,
    engName,
    spells,
  }
}
