import { Router, Response } from 'express'
import { prisma } from '../index'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { resolveInfectionStage } from '../parsers/characterSheetParser'
import {
  normalizeTraitBudget,
  rollSocialPoints,
  validateTraitSelection,
} from '../traits'

const router = Router()

const CHARACTER_INCLUDE = {
  attributes: true,
  combat: true,
  infection: true,
  traits: true,
  skills: true,
  arts: true,
  equipments: true,
  traitBudget: true,
}

// Get all characters for current user
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const characters = await prisma.character.findMany({
      where: { userId: req.userId },
      include: CHARACTER_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    })
    res.json(characters)
  } catch (err) {
    res.status(500).json({ error: '获取角色列表失败' })
  }
})

// Create a blank character for current user
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const data = req.body || {}
    const character = await prisma.character.create({
      data: {
        userId: req.userId!,
        name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : '未命名角色',
        player: typeof data.player === 'string' ? data.player : '',
        gender: typeof data.gender === 'string' ? data.gender : '',
        age: typeof data.age === 'string' ? data.age : '',
        birthday: typeof data.birthday === 'string' ? data.birthday : '',
        origin: typeof data.origin === 'string' ? data.origin : '',
        race: typeof data.race === 'string' ? data.race : '',
        profession: typeof data.profession === 'string' ? data.profession : '',
        subProfession: typeof data.subProfession === 'string' ? data.subProfession : '',
        height: typeof data.height === 'string' ? data.height : '',
        weight: typeof data.weight === 'string' ? data.weight : '',
        elitePhase: typeof data.elitePhase === 'string' ? data.elitePhase : '阶段零',
        level: Number(data.level) || 1,
        rawData: typeof data.rawData === 'string' ? data.rawData : data.rawData ? JSON.stringify(data.rawData) : '{}',
        traitBudget: {
          create: {
            traitPointsBase: 40,
            traitPointsLimit: 80,
            socialDiceCount: 5,
            socialPointsRolled: rollSocialPoints(5),
          },
        },
        attributes: {
          create: ['PR', 'MOB', 'PS', 'SPR', 'INT', 'OAA', 'APP'].map(name => ({
            name,
            base: 5,
            modifier: 0,
            growth: 0,
          })),
        },
        combat: { create: {} },
        infection: { create: {} },
      },
      include: CHARACTER_INCLUDE,
    })
    res.status(201).json(character)
  } catch (err: any) {
    res.status(500).json({ error: `创建角色失败: ${err.message}` })
  }
})

// Get single character
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const character = await prisma.character.findFirst({
      where: { id: Number(req.params.id), userId: req.userId },
      include: CHARACTER_INCLUDE,
    })
    if (!character) {
      res.status(404).json({ error: '角色不存在' })
      return
    }
    if (!character.traitBudget) {
      const charm = character.attributes.find(attribute => attribute.name === 'APP')
      const socialDiceCount = Math.max(0, (charm?.base || 0) + (charm?.modifier || 0) + (charm?.growth || 0))
      const traitBudget = await prisma.characterTraitBudget.create({
        data: {
          characterId: character.id,
          traitPointsBase: 40,
          traitPointsLimit: 80,
          socialDiceCount,
          socialPointsRolled: rollSocialPoints(socialDiceCount),
        },
      })
      res.json({ ...character, traitBudget })
      return
    }
    res.json(character)
  } catch (err) {
    res.status(500).json({ error: '获取角色失败' })
  }
})

// Update character
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const charId = Number(req.params.id)
    const existing = await prisma.character.findUnique({ where: { id: charId } })
    if (!existing || existing.userId !== req.userId) {
      res.status(403).json({ error: '无权修改此角色' })
      return
    }

    const data = req.body
    let normalizedTraits: ReturnType<typeof validateTraitSelection>['normalized'] | null = null
    if (Array.isArray(data.traits)) {
      const [rules, existingBudget, existingInfection] = await Promise.all([
        prisma.ruleTrait.findMany(),
        prisma.characterTraitBudget.findUnique({ where: { characterId: charId } }),
        prisma.characterInfection.findUnique({ where: { characterId: charId } }),
      ])
      const validation = validateTraitSelection(
        data.traits,
        data.traitBudget || existingBudget,
        rules,
        data.infection?.currentValue ?? existingInfection?.currentValue ?? 0,
      )
      if (validation.errors.length) {
        res.status(400).json({ error: validation.errors.join('；'), details: validation.errors })
        return
      }
      normalizedTraits = validation.normalized
    }
    const updated = await prisma.character.update({
      where: { id: charId },
      data: {
        name: data.name,
        player: data.player,
        gender: data.gender,
        age: data.age,
        birthday: data.birthday,
        race: data.race,
        profession: data.profession,
        subProfession: data.subProfession,
        origin: data.origin,
        level: data.level,
        elitePhase: data.elitePhase,
        height: data.height,
        weight: data.weight,
        rawData: typeof data.rawData === 'string' ? data.rawData : data.rawData ? JSON.stringify(data.rawData) : undefined,
      },
    })

    if (data.traitBudget) {
      const budget = normalizeTraitBudget(data.traitBudget)
      await prisma.characterTraitBudget.upsert({
        where: { characterId: charId },
        update: budget,
        create: { characterId: charId, ...budget },
      })
    }

    // Update attributes
    if (data.attributes) {
      for (const attr of data.attributes) {
        if (attr.id && attr.id > 0) {
          await prisma.characterAttribute.update({
            where: { id: attr.id },
            data: {
              base: attr.base,
              modifier: attr.modifier,
              growth: attr.growth,
            },
          })
        } else {
          await prisma.characterAttribute.create({
            data: {
              characterId: charId,
              name: attr.name,
              base: attr.base || 5,
              modifier: attr.modifier || 0,
              growth: attr.growth || 0,
            },
          })
        }
      }
    }

    // Update combat data
    if (data.combat) {
      await prisma.characterCombat.upsert({
        where: { characterId: charId },
        update: data.combat,
        create: { characterId: charId, ...data.combat },
      })
    }

    // Update infection data
    if (data.infection) {
      const infection = {
        ...data.infection,
        stage: resolveInfectionStage(data.infection.currentValue),
      }
      await prisma.characterInfection.upsert({
        where: { characterId: charId },
        update: infection,
        create: { characterId: charId, ...infection },
      })
    }

    // Sync skills
    if (data.skills) {
      await prisma.characterSkill.deleteMany({ where: { characterId: charId } })
      for (const skill of data.skills) {
        await prisma.characterSkill.create({
          data: {
            characterId: charId,
            name: skill.name,
            category: skill.category || '',
            value: skill.value || 0,
            growth: skill.growth || 0,
            modifier: skill.modifier || 0,
            isMain: skill.isMain || false,
            maxValue: skill.maxValue || '0',
            sourceTrait: skill.sourceTrait || '',
          },
        })
      }
    }

    // Sync traits
    if (normalizedTraits) {
      await prisma.$transaction(async tx => {
        await tx.characterTrait.deleteMany({ where: { characterId: charId } })
        if (normalizedTraits.length > 0) {
          await tx.characterTrait.createMany({
            data: normalizedTraits.map(trait => ({
              characterId: charId,
              name: trait.name,
              description: trait.description || '',
              effect: trait.effect || '',
              effectSelections: JSON.stringify(trait.effectSelections || []),
              cost: trait.cost || 0,
              category: trait.category || '',
              type: trait.type,
              subcategory: trait.subcategory,
              parentName: trait.parentName,
              pointType: trait.pointType,
              source: trait.source,
              isModifier: trait.isModifier,
              sortOrder: trait.sortOrder,
            })),
          })
        }
      })
    }

    const result = await prisma.character.findUnique({
      where: { id: charId },
      include: CHARACTER_INCLUDE,
    })
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: `更新失败: ${err.message}` })
  }
})

// Delete character
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const charId = Number(req.params.id)
    const existing = await prisma.character.findUnique({ where: { id: charId } })
    if (!existing || existing.userId !== req.userId) {
      res.status(403).json({ error: '无权删除此角色' })
      return
    }
    await prisma.character.delete({ where: { id: charId } })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: '删除失败' })
  }
})

export default router
