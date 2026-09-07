export type CharacterTextBlock = {
  title?: string
  content: string
}

export type CharacterTraitProfile = {
  category: '种族' | '文化' | '工作'
  name: string
  description: string
  attributeChanges: string
}

export type CharacterModuleExperience = {
  moduleName: string
  experience: string
  reward: string
}

export type CharacterElitePhaseEntry = {
  phase: '0' | '1' | '2'
  talents: CharacterTextBlock[]
  actions: CharacterTextBlock[]
  arts: CharacterTextBlock[]
}

export type CharacterCardVNext = {
  version: 1
  mainCard: {
    portrait: {
      imageUrl: string
      notes: string
    }
    traitProfiles: CharacterTraitProfile[]
    reputation: {
      economy: string
      resources: string
      contacts: string
      titles: string
      notes: string
    }
    archive: {
      objectiveHistory: string
      personalBelief: string
      belongings: string
      notes: string
    }
    moduleExperiences: CharacterModuleExperience[]
    professionTable: {
      branch: string
      attackRange: string
      weaponType: string
      branchTrait: string
      spRecovery: string
      notes: string
    }
  }
  combatCard: {
    mainClass: {
      name: string
      description: string
      attackRange: string
      branchTrait: string
      weaponType: string
      spRecovery: string
    }
    subClass: {
      name: string
      description: string
      attackRange: string
      branchTrait: string
      weaponType: string
      spRecovery: string
    }
    elitePhases: CharacterElitePhaseEntry[]
  }
}

export type CharacterCardVisual = {
  portraitX: number
  portraitY: number
  portraitScale: number
}

export type CharacterEquipmentV1 = {
  weapon: {
    name: string
    branch: string
    hasDefenseSkill: boolean
    diceSides: number
    attackType: 'melee' | 'ranged'
    damageType: 'physical' | 'arts'
    attribute: 'PS' | 'INT' | 'MOB' | 'OAA'
    attackSkill: string
    description: string
  }
  armor: {
    name: string
    defenseSkill: '格斗' | '身法' | '战术规划' | '施术'
    armorType: string
    description: string
  }
  throwables: Array<{ id: string; name: string; effect: string }>
  consumables: Array<{ id: string; name: string; effect: string }>
  summons: Array<{ id: string; name: string; notes: string }>
}

export type CharacterRawData = Record<string, unknown> & {
  characterCardVNext?: CharacterCardVNext
  characterCardVisual?: Partial<CharacterCardVisual>
  characterEquipmentV1?: Partial<CharacterEquipmentV1>
  mainCard?: {
    portrait?: {
      imageUrl?: string
      notes?: string
    }
  }
}

export const DEFAULT_CHARACTER_CARD_VISUAL: CharacterCardVisual = {
  portraitX: 0,
  portraitY: 0,
  portraitScale: 1,
}

export const createEmptyCharacterEquipmentV1 = (): CharacterEquipmentV1 => ({
  weapon: {
    name: '',
    branch: '',
    hasDefenseSkill: false,
    diceSides: 4,
    attackType: 'melee',
    damageType: 'physical',
    attribute: 'PS',
    attackSkill: '',
    description: '',
  },
  armor: {
    name: '',
    defenseSkill: '格斗',
    armorType: '',
    description: '',
  },
  throwables: [],
  consumables: [],
  summons: [],
})

export const createEmptyCharacterCardVNext = (): CharacterCardVNext => ({
  version: 1,
  mainCard: {
    portrait: {
      imageUrl: '',
      notes: '',
    },
    traitProfiles: [
      { category: '种族', name: '', description: '', attributeChanges: '' },
      { category: '文化', name: '', description: '', attributeChanges: '' },
      { category: '工作', name: '', description: '', attributeChanges: '' },
    ],
    reputation: {
      economy: '',
      resources: '',
      contacts: '',
      titles: '',
      notes: '',
    },
    archive: {
      objectiveHistory: '',
      personalBelief: '',
      belongings: '',
      notes: '',
    },
    moduleExperiences: [],
    professionTable: {
      branch: '',
      attackRange: '',
      weaponType: '',
      branchTrait: '',
      spRecovery: '',
      notes: '',
    },
  },
  combatCard: {
    mainClass: {
      name: '',
      description: '',
      attackRange: '',
      branchTrait: '',
      weaponType: '',
      spRecovery: '',
    },
    subClass: {
      name: '',
      description: '',
      attackRange: '',
      branchTrait: '',
      weaponType: '',
      spRecovery: '',
    },
    elitePhases: [
      { phase: '0', talents: [], actions: [], arts: [] },
      { phase: '1', talents: [], actions: [], arts: [] },
      { phase: '2', talents: [], actions: [], arts: [] },
    ],
  },
})

export function parseCharacterRawData(rawData: unknown): CharacterRawData {
  if (!rawData) return {}
  if (typeof rawData === 'object') return rawData as CharacterRawData
  if (typeof rawData !== 'string') return {}
  try {
    const parsed = JSON.parse(rawData)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function normalizeCharacterCardVNext(rawData: unknown): CharacterCardVNext {
  const raw = parseCharacterRawData(rawData)
  const empty = createEmptyCharacterCardVNext()
  const saved = raw.characterCardVNext
  if (!saved) {
    return {
      ...empty,
      mainCard: {
        ...empty.mainCard,
        portrait: {
          ...empty.mainCard.portrait,
          ...raw.mainCard?.portrait,
        },
      },
    }
  }

  return {
    ...empty,
    ...saved,
    mainCard: {
      ...empty.mainCard,
      ...saved.mainCard,
      portrait: {
        ...empty.mainCard.portrait,
        ...raw.mainCard?.portrait,
        ...saved.mainCard?.portrait,
      },
      reputation: { ...empty.mainCard.reputation, ...saved.mainCard?.reputation },
      archive: { ...empty.mainCard.archive, ...saved.mainCard?.archive },
      professionTable: { ...empty.mainCard.professionTable, ...saved.mainCard?.professionTable },
      traitProfiles: saved.mainCard?.traitProfiles?.length
        ? saved.mainCard.traitProfiles
        : empty.mainCard.traitProfiles,
      moduleExperiences: saved.mainCard?.moduleExperiences || [],
    },
    combatCard: {
      ...empty.combatCard,
      ...saved.combatCard,
      mainClass: { ...empty.combatCard.mainClass, ...saved.combatCard?.mainClass },
      subClass: { ...empty.combatCard.subClass, ...saved.combatCard?.subClass },
      elitePhases: saved.combatCard?.elitePhases?.length
        ? saved.combatCard.elitePhases
        : empty.combatCard.elitePhases,
    },
  }
}

export function writeCharacterCardVNext(rawData: unknown, card: CharacterCardVNext): CharacterRawData {
  return {
    ...parseCharacterRawData(rawData),
    characterCardVNext: card,
  }
}

export function normalizeCharacterCardVisual(rawData: unknown): CharacterCardVisual {
  const saved = parseCharacterRawData(rawData).characterCardVisual || {}
  return {
    portraitX: Number(saved.portraitX ?? DEFAULT_CHARACTER_CARD_VISUAL.portraitX),
    portraitY: Number(saved.portraitY ?? DEFAULT_CHARACTER_CARD_VISUAL.portraitY),
    portraitScale: Number(saved.portraitScale ?? DEFAULT_CHARACTER_CARD_VISUAL.portraitScale),
  }
}

export function writeCharacterCardVisual(rawData: unknown, visual: CharacterCardVisual): CharacterRawData {
  return {
    ...parseCharacterRawData(rawData),
    characterCardVisual: visual,
  }
}

function normalizeEffectEquipmentList(input: unknown): CharacterEquipmentV1['throwables'] {
  if (!Array.isArray(input)) return []
  return input.map((item, index) => {
    const value = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    return {
      id: String(value.id || `equipment-${index}`),
      name: String(value.name || ''),
      effect: String(value.effect || ''),
    }
  })
}

function normalizeSummonEquipmentList(input: unknown): CharacterEquipmentV1['summons'] {
  if (!Array.isArray(input)) return []
  return input.map((item, index) => {
    const value = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    return {
      id: String(value.id || `summon-${index}`),
      name: String(value.name || ''),
      notes: String(value.notes || ''),
    }
  })
}

export function normalizeCharacterEquipmentV1(rawData: unknown): CharacterEquipmentV1 {
  const saved = (parseCharacterRawData(rawData).characterEquipmentV1 || {}) as Partial<CharacterEquipmentV1>
  const empty = createEmptyCharacterEquipmentV1()
  const weapon = (saved.weapon || {}) as Partial<CharacterEquipmentV1['weapon']>
  const armor = (saved.armor || {}) as Partial<CharacterEquipmentV1['armor']>
  const attackType = weapon.attackType === 'ranged' ? 'ranged' : 'melee'
  const damageType = weapon.damageType === 'arts' ? 'arts' : 'physical'
  const attribute = ['PS', 'INT', 'MOB', 'OAA'].includes(String(weapon.attribute)) ? weapon.attribute : empty.weapon.attribute
  const defenseSkill = ['格斗', '身法', '战术规划', '施术'].includes(String(armor.defenseSkill))
    ? armor.defenseSkill
    : empty.armor.defenseSkill

  return {
    weapon: {
      ...empty.weapon,
      ...weapon,
      hasDefenseSkill: Boolean(weapon.hasDefenseSkill),
      diceSides: Math.max(2, Number(weapon.diceSides) || empty.weapon.diceSides),
      attackType,
      damageType,
      attribute: attribute as CharacterEquipmentV1['weapon']['attribute'],
      name: String(weapon.name || ''),
      branch: String(weapon.branch || ''),
      attackSkill: String(weapon.attackSkill || ''),
      description: String(weapon.description || ''),
    },
    armor: {
      ...empty.armor,
      ...armor,
      defenseSkill: defenseSkill as CharacterEquipmentV1['armor']['defenseSkill'],
      name: String(armor.name || ''),
      armorType: String(armor.armorType || ''),
      description: String(armor.description || ''),
    },
    throwables: normalizeEffectEquipmentList(saved.throwables),
    consumables: normalizeEffectEquipmentList(saved.consumables),
    summons: normalizeSummonEquipmentList(saved.summons),
  }
}

export function writeCharacterEquipmentV1(rawData: unknown, equipment: CharacterEquipmentV1): CharacterRawData {
  return {
    ...parseCharacterRawData(rawData),
    characterEquipmentV1: equipment,
  }
}
