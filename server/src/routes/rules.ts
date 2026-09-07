import { Router, Response } from 'express'
import { prisma } from '../index'
import { parseCharacterSheet } from '../excelParser'

const router = Router()

// Get all rule data (races, traits, combat classes, arts)
router.get('/races', async (_req, res: Response) => {
  const races = await prisma.ruleRace.findMany({ orderBy: { id: 'asc' } })
  res.json(races)
})

router.get('/cultures', async (_req, res: Response) => {
  const cultures = await prisma.ruleCulture.findMany({ orderBy: { id: 'asc' } })
  res.json(cultures)
})

router.get('/traits', async (_req, res: Response) => {
  const traits = await prisma.ruleTrait.findMany({ orderBy: { id: 'asc' } })
  res.json(traits)
})

router.get('/infection', async (_req, res: Response) => {
  try {
    const parsed = parseCharacterSheet()
    res.json(parsed.infectionData || { stages: [], symptoms: [], treatments: [] })
  } catch (err: any) {
    res.status(500).json({ error: `获取感染系统失败: ${err.message}` })
  }
})

router.get('/combat-classes', async (_req, res: Response) => {
  const classes = await prisma.ruleCombatClass.findMany({ orderBy: { id: 'asc' } })
  res.json(classes)
})

router.get('/arts', async (_req, res: Response) => {
  const arts = await prisma.ruleArt.findMany({ orderBy: { id: 'asc' } })
  res.json(arts)
})

export default router
