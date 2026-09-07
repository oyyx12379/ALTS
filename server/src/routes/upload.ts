import { Router, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { parseCharacterSheet, parseCombatClasses, parseArtsData } from '../excelParser'
import { resolveInfectionStage } from '../parsers/characterSheetParser'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { prisma } from '../index'
import { normalizeCharacterTrait, rollSocialPoints } from '../traits'

const router = Router()

// Configure multer for Excel uploads
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (_req, file, cb) => {
    const uniqueName = Date.now() + '-' + encodeURIComponent(file.originalname)
    cb(null, uniqueName)
  },
})
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (ext === '.xlsx' || ext === '.xls') {
      cb(null, true)
    } else {
      cb(new Error('仅支持Excel文件(.xlsx/.xls)'))
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
})

// Upload and parse character sheet
router.post('/character-sheet', authMiddleware, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '请上传角色卡文件' })
      return
    }

    const result = parseCharacterSheet(req.file.path)
    res.json({ success: true, data: result, fileName: req.file.filename })
  } catch (err: any) {
    console.error('Parse error:', err)
    res.status(500).json({ error: `解析失败: ${err.message}` })
  }
})

// Import character sheet data and create character in DB
router.post('/import-character', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { fileName } = req.body
    if (!fileName) {
      res.status(400).json({ error: '请指定角色卡文件名' })
      return
    }

    const filePath = path.join(__dirname, '../../uploads', fileName)
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: '文件不存在，请重新上传' })
      return
    }

    const parsed = parseCharacterSheet(filePath)
    const mc = parsed.mainCard
    if (!mc) {
      res.status(400).json({ error: '无法读取角色卡主数据' })
      return
    }

    const socialDiceCount = Math.max(0, Math.trunc(Number(
      mc.attributes?.find((attribute: any) => attribute.abbr === 'APP')?.total || 5,
    )))

    // Create character in DB
    const character = await prisma.character.create({
      data: {
        userId: req.userId!,
        name: mc.basicInfo.name || '未命名角色',
        player: mc.basicInfo.player || '',
        gender: mc.basicInfo.gender || '',
        age: String(mc.basicInfo.age || ''),
        birthday: String(mc.basicInfo.birthday || ''),
        origin: mc.basicInfo.origin || '',
        race: mc.basicInfo.race || '',
        profession: mc.basicInfo.profession || '',
        subProfession: mc.basicInfo.subProfession || '',
        height: String(mc.basicInfo.height || ''),
        weight: String(mc.basicInfo.weight || ''),
        elitePhase: mc.basicInfo.elitePhase || '阶段零',
        level: Number(mc.basicInfo.currentLevel) || 1,
        rawData: JSON.stringify(parsed),
        traitBudget: {
          create: {
            traitPointsBase: 40,
            traitPointsLimit: 80,
            socialDiceCount,
            socialPointsRolled: rollSocialPoints(socialDiceCount),
          },
        },
      },
    })

    // Create attributes
    if (mc.attributes) {
      for (const attr of mc.attributes) {
        await prisma.characterAttribute.create({
          data: {
            characterId: character.id,
            name: attr.abbr,
            base: Number(attr.base) || 5,
            modifier: Number(attr.modifier) || 0,
            growth: Number(attr.growth) || 0,
          },
        })
      }
    }

    // Create skills
    if (mc.skills) {
      for (const skill of mc.skills) {
        await prisma.characterSkill.create({
          data: {
            characterId: character.id,
            name: skill.name,
            category: skill.category || '',
            value: Number(skill.total) || 0,
            growth: Number(skill.growth) || 0,
            modifier: Number(skill.modifier) || 0,
            isMain: skill.isMain || false,
            maxValue: String(skill.max || '0'),
            sourceTrait: '',
          },
        })
      }
    }

    // Create combat data
    await prisma.characterCombat.create({
      data: {
        characterId: character.id,
        hpMax: Number(mc.derived?.hp?.max) || 15,
        physResist: Number(mc.derived?.physResist) || 3,
        magicResist: Number(mc.derived?.magicResist) || 3,
        resistCommonSkill: '',
        spMax: Number(mc.derived?.sp?.max) || 9,
        spInit: Number(mc.derived?.sp?.init) || 0,
        spInitBonus: 0,
        elemResist: Number(mc.derived?.elemResist) || 6,
        weight: Number(mc.derived?.weight) || 1,
        staminaMax: Number(mc.derived?.stamina) || 2,
        weaponName: mc.combat?.weaponName || '',
        weaponDice: mc.combat?.weaponDice || 'D6',
        weaponType: mc.combat?.weaponType || '',
        armorType: mc.combat?.armorType || '中甲',
        attackRange: mc.combat?.attackRange || '',
      },
    })

    // Create infection data
    const currentInfectionValue = Number(mc.infection?.currentValue) || 0
    await prisma.characterInfection.create({
      data: {
        characterId: character.id,
        immunity: Number(mc.infection?.immunity) || 5,
        initialValue: Number(mc.infection?.initialValue) || 0,
        currentValue: currentInfectionValue,
        stage: resolveInfectionStage(currentInfectionValue),
        symptoms: mc.infection?.symptoms || '',
        tempOutbreak: mc.infection?.tempOutbreak || '',
        longTerm: mc.infection?.longTerm || '',
      },
    })

    const selectedTraits = (Array.isArray(parsed.traits) ? parsed.traits : [])
      .map((trait: any, index: number) => normalizeCharacterTrait(trait, index))
      .filter((trait: any) => trait.name)

    const seenTraits = new Set<string>()
    for (const trait of selectedTraits) {
      const key = `${trait.category || ''}:${trait.name}`
      if (seenTraits.has(key)) continue
      seenTraits.add(key)
      await prisma.characterTrait.create({
        data: {
          characterId: character.id,
          name: trait.name,
          description: trait.description || '',
          effect: trait.effect || '',
          effectSelections: JSON.stringify(trait.effectSelections || []),
          cost: Number(trait.cost) || 0,
          category: trait.category || '',
          type: trait.type,
          subcategory: trait.subcategory,
          parentName: trait.parentName,
          pointType: trait.pointType,
          source: 'excel',
          isModifier: trait.isModifier,
          sortOrder: trait.sortOrder,
        },
      })
    }

    res.json({ success: true, characterId: character.id, character })
  } catch (err: any) {
    console.error('Import error:', err)
    res.status(500).json({ error: `导入失败: ${err.message}` })
  }
})

// Parse rules data (combat classes, arts, etc.)
router.get('/parse-rules', async (_req, res: Response) => {
  try {
    const combatClasses = parseCombatClasses()
    const artsData = parseArtsData()

    // Also parse race params from the character sheet
    const { raceParams, traitRules, combatQuickRef, dropdownLists } = parseCharacterSheet()

    res.json({
      combatClasses,
      arts: artsData,
      races: raceParams,
      traits: traitRules,
      combatQuickRef,
      dropdownLists,
    })
  } catch (err: any) {
    res.status(500).json({ error: `解析失败: ${err.message}` })
  }
})

export default router
