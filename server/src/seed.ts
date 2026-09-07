import { PrismaClient } from '@prisma/client'
import { parseCharacterSheet, parseCombatClasses, parseArtsData } from './excelParser'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding rule data from Excel files...')

  // Parse character sheet for races, traits, etc.
  const charData = parseCharacterSheet()

  await prisma.$transaction([
    prisma.ruleArt.deleteMany(),
    prisma.ruleCombatClass.deleteMany(),
    prisma.ruleTrait.deleteMany(),
    prisma.ruleRace.deleteMany(),
  ])

  // Seed races
  if (charData.raceParams) {
    console.log(`  Races: ${charData.raceParams.length} entries`)
    for (const race of charData.raceParams) {
      await prisma.ruleRace.create({
        data: {
          name: race.name,
          description: race.description || '',
          attrBonuses: JSON.stringify(race.bonuses || {}),
          traitDiscounts: JSON.stringify(race.traitDiscounts || []),
        },
      })
    }
  }

  // Seed the unified trait rule catalog.
  let traitCount = 0
  if (charData.traitRules) {
    for (const trait of charData.traitRules) {
      if (!trait.name) continue
      await prisma.ruleTrait.create({
        data: {
          name: trait.name,
          description: trait.description || '',
          effect: trait.effect || '',
          cost: trait.cost || 0,
          category: trait.category || '',
          type: trait.type || 'secondary',
          subcategory: trait.subcategory || trait.category || '',
          costText: trait.costText || String(trait.cost || 0),
          parentName: trait.parentName || '',
          requires: JSON.stringify(trait.requires || []),
          isModifier: Boolean(trait.isModifier),
          source: trait.source || 'excel',
        },
      })
      traitCount++
    }
  }
  console.log(`  Traits: ${traitCount} entries`)

  // Seed combat classes
  const classes = parseCombatClasses()
  console.log(`  Combat classes: ${classes.length} entries`)
  for (const cls of classes) {
    await prisma.ruleCombatClass.create({
      data: {
        name: cls.name,
        branch: cls.branch || '',
        engName: cls.engName || '',
        branchTrait: cls.branchTrait || '',
        weaponType: cls.weaponType || '',
        spRecovery: cls.spRecovery || '',
        armors: JSON.stringify({
          hpAlgorithm: cls.algorithms?.hp || '',
          physResistAlg: cls.algorithms?.physResist || '',
          magicResistAlg: cls.algorithms?.magicResist || '',
        }),
        phases: JSON.stringify(cls.phases || []),
      },
    })
  }

  // Seed arts
  const arts = parseArtsData()
  let artsCount = 0
  for (const school of arts) {
    for (const spell of school.spells || []) {
      if (!spell.name) continue
      await prisma.ruleArt.create({
        data: {
          name: spell.name,
          school: school.name || '',
          phase: spell.phase || '精零',
          actionCost: spell.actionCost || '',
          spCost: spell.spCost || 0,
          range: spell.range || '',
          target: spell.target || '',
          effect: spell.effect || '',
        },
      })
      artsCount++
    }
  }
  console.log(`  Arts: ${artsCount} spells`)

  console.log('✅ Seed complete!')
}

main()
  .catch(e => { console.error('Seed error:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
