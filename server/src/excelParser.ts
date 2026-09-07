import fs from 'fs'
import path from 'path'

export const EXCEL_DIR = path.join(__dirname, '../excel-data')

export function getExcelFiles(): { name: string; path: string }[] {
  if (!fs.existsSync(EXCEL_DIR)) return []
  return fs.readdirSync(EXCEL_DIR)
    .filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'))
    .map(f => ({ name: f, path: path.join(EXCEL_DIR, f) }))
}

export { parseCharacterSheet } from './parsers/characterSheetParser'
export { parseCombatClasses } from './parsers/combatClassParser'
export { parseArtsData } from './parsers/artsParser'
