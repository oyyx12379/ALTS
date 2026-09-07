export type ArmorType = '轻甲' | '中甲' | '重甲'
export type HpTier = '低' | '中' | '高'
export type CombatRangeType = 'melee' | 'ranged'

export type CommonSkillResistFormula = {
  multiplier: number
  bonus: number
  addDefenseSkill?: boolean
}

export type CombatClassDetail = {
  name: string
  parentClass: string
  armorType: ArmorType
  hpTier: HpTier
  rangeType: CombatRangeType
  branchTrait: string
  weaponType: string
  spRecovery: string
  weaponDiceSides: number
  attackRange?: string
  attackRangeImage?: string
  attackRangePattern?: {
    columns: number
    cells: Array<'active' | 'empty'>
  }
  physResistAlgorithm: string
  magicResistAlgorithm: string
  physResistFormula: CommonSkillResistFormula
  magicResistFormula: CommonSkillResistFormula
  hpAlgorithm: string
}

const ARMOR_MULTIPLIER: Record<ArmorType, number> = {
  '轻甲': 2.5,
  '中甲': 3,
  '重甲': 3.5,
}

const HP_GROWTH: Record<HpTier, { divisor: number; bonus: number }> = {
  '低': { divisor: 8, bonus: 1 },
  '中': { divisor: 6, bonus: 2 },
  '高': { divisor: 4, bonus: 3 },
}

function hpAlgorithm(armorType: ArmorType, hpTier: HpTier) {
  const growth = HP_GROWTH[hpTier]
  return [
    'HP上限 = 护甲基础值 + 血量成长值',
    `${armorType}基础值 = 生理耐受 × ${ARMOR_MULTIPLIER[armorType]}`,
    `${hpTier}血量成长值 = 生理耐受 ÷ ${growth.divisor} × 升级次数 + ${growth.bonus} × 升级次数`,
  ].join('\n')
}

const RANGE_IMAGES = {
  melee: '/images/combat-ranges/melee.png',
  tacticalRanged: '/images/combat-ranges/tactical-ranged.png',
  duelist: '/images/combat-ranges/duelist.png',
  cleave: '/images/combat-ranges/cleave.png',
  artillery: '/images/combat-ranges/artillery.png',
  marksman: '/images/combat-ranges/marksman.png',
  bard: '/images/combat-ranges/bard.png',
  trickster: '/images/combat-ranges/trickster.png',
} as const

export const COMBAT_CLASS_DETAILS: Record<string, CombatClassDetail> = {
  '尖兵': {
    name: '尖兵',
    parentClass: '先锋',
    armorType: '中甲',
    hpTier: '中',
    rangeType: 'melee',
    branchTrait: '穿戴中甲，具有中生命值\n擅长打断，控制关键敌人同时辅助友方角色的承伤职业。',
    weaponType: '伤害骰面为D4的近战物理武器\n拥有防御技能，并且额外获得等同于防御技能值的物理抗性与法术抗性。\n通常是各种灵活的单手武器，从刀剑到斧锤兼有。\n使用者往往利用另一只手持握盾牌或调整平衡来抵御攻击，具有灵活的防御性能。',
    spRecovery: '你的回合结束时，获得2SP。\n之后可以选择自身的最多1SP转移给另一个视野内的友方单位。每进入一个新的精英化阶段，额外获得1SP且转移上限+1。',
    weaponDiceSides: 4,
    attackRangeImage: RANGE_IMAGES.melee,
    physResistAlgorithm: '通识技能 × 3 + 3',
    magicResistAlgorithm: '通识技能 × 2.5 + 3',
    physResistFormula: { multiplier: 3, bonus: 3 },
    magicResistFormula: { multiplier: 2.5, bonus: 3 },
    hpAlgorithm: hpAlgorithm('中甲', '中'),
  },
  '冲锋手': {
    name: '冲锋手', parentClass: '先锋', armorType: '中甲', hpTier: '中', rangeType: 'melee',
    branchTrait: '穿戴中甲，具有中生命值\n擅长通过快速移动对敌人造成大量伤害的近战输出职业。',
    weaponType: '伤害骰面为D6的近战物理武器\n通常是各类长柄武器，如长枪和戟。\n能够在中等距离发动灵活的突刺，将移动与伤害合为一体。',
    spRecovery: '你的回合结束时，获得1SP。如果你本回合主动移动过至少3个战术格，改为获得4SP。\n每进入一个新的精英化阶段，获得的SP+1。',
    weaponDiceSides: 6, attackRangeImage: RANGE_IMAGES.melee,
    physResistAlgorithm: '通识技能 × 3 + 3', magicResistAlgorithm: '通识技能 × 2.5 + 3',
    physResistFormula: { multiplier: 3, bonus: 3 }, magicResistFormula: { multiplier: 2.5, bonus: 3 },
    hpAlgorithm: hpAlgorithm('中甲', '中'),
  },
  '战术家': {
    name: '战术家', parentClass: '先锋', armorType: '轻甲', hpTier: '中', rangeType: 'ranged',
    branchTrait: '穿戴轻甲，具有中生命值\n擅长在范围内制造召唤物承受伤害，攻破阵线的职业。',
    weaponType: '伤害骰面为D6的远程物理武器\n通常是灵活轻量的远程武器，从飞刀到弩箭皆有。\n使用者往往需要利用轻便武器带来的优势，指挥召唤物协同作战。',
    spRecovery: '你的回合结束时，获得1SP，每进入一个新的精英化阶段，额外获得1SP。\n如果【战术点】处在战术家的攻击范围内，额外获得2SP。',
    weaponDiceSides: 6, attackRangeImage: RANGE_IMAGES.tacticalRanged,
    physResistAlgorithm: '通识技能 × 2.5 + 3', magicResistAlgorithm: '通识技能 × 2 + 3',
    physResistFormula: { multiplier: 2.5, bonus: 3 }, magicResistFormula: { multiplier: 2, bonus: 3 },
    hpAlgorithm: hpAlgorithm('轻甲', '中'),
  },
  '铁卫': {
    name: '铁卫', parentClass: '重装', armorType: '重甲', hpTier: '高', rangeType: 'melee',
    branchTrait: '穿戴重甲，具有高生命值\n擅长以坚固的阵线保护队友的承伤职业。',
    weaponType: '伤害骰面为D4的近战物理武器\n拥有防御技能，并且额外获得等同于防御技能值的物理抗性与法术抗性。\n通常是各类盾牌，以及用于辅助盾牌的轻便单手武器。\n能够行之有效地抵挡物理伤害。',
    spRecovery: '你的回合结束时，回复1SP。每进入一个新的精英化阶段，额外回复1SP。\n受到攻击时，回复1SP。',
    weaponDiceSides: 4, attackRangeImage: RANGE_IMAGES.melee,
    physResistAlgorithm: '通识技能 × 3.5 + 3', magicResistAlgorithm: '通识技能 × 3 + 3',
    physResistFormula: { multiplier: 3.5, bonus: 3 }, magicResistFormula: { multiplier: 3, bonus: 3 },
    hpAlgorithm: hpAlgorithm('重甲', '高'),
  },
  '守护者': {
    name: '守护者', parentClass: '重装', armorType: '重甲', hpTier: '高', rangeType: 'melee',
    branchTrait: '穿戴重甲，具有高生命值\n使用治疗能力维持生命值的承伤职业。',
    weaponType: '伤害骰面为D4的近战物理武器\n拥有防御技能，并且额外获得等同于防御技能值的物理抗性与法术抗性。\n通常是各类盾牌，以及用于治疗的道具。',
    spRecovery: '你的回合结束时，回复1SP。每进入一个新的精英化阶段，额外回复1SP。\n受到或使用【治疗】时，回复1SP。',
    weaponDiceSides: 4, attackRangeImage: RANGE_IMAGES.melee,
    physResistAlgorithm: '通识技能 × 3 + 3', magicResistAlgorithm: '通识技能 × 3.5 + 3',
    physResistFormula: { multiplier: 3, bonus: 3 }, magicResistFormula: { multiplier: 3.5, bonus: 3 },
    hpAlgorithm: hpAlgorithm('重甲', '高'),
  },
  '驭法铁卫': {
    name: '驭法铁卫', parentClass: '重装', armorType: '重甲', hpTier: '高', rangeType: 'melee',
    branchTrait: '穿戴重甲，具有高生命值\n擅长通过多变的法术保护队友的承伤职业。',
    weaponType: '伤害骰面为D4的近战物理武器\n通常是各类盾牌，以及用于辅助盾牌的施法媒介。能够行之有效地抵挡，甚至造成法术伤害。',
    spRecovery: '受到法术伤害时回复2SP，受到物理伤害时回复1SP。一轮最多以此法回复4SP。',
    weaponDiceSides: 4, attackRangeImage: RANGE_IMAGES.melee,
    physResistAlgorithm: '通识技能 × 2.5 + 3 + 持盾技能', magicResistAlgorithm: '通识技能 × 3.5 + 4 + 持盾技能',
    physResistFormula: { multiplier: 2.5, bonus: 3, addDefenseSkill: true },
    magicResistFormula: { multiplier: 3.5, bonus: 4, addDefenseSkill: true },
    hpAlgorithm: hpAlgorithm('重甲', '高'),
  },
  '无畏者': {
    name: '无畏者', parentClass: '近卫', armorType: '中甲', hpTier: '高', rangeType: 'melee',
    branchTrait: '穿戴中甲，具有高生命值\n擅长对单个目标造成大量伤害的近战输出职业。',
    weaponType: '伤害骰面为D6的近战物理武器\n通常是各式刀剑，也包括部分长兵。\n能够在较近距离发动兼具力量与速度的物理攻击，比起其他武器更注重使用者的躯体能力。',
    spRecovery: '你的回合结束时，恢复2SP。\n每进入一个新的精英化阶段，额外恢复1SP。',
    weaponDiceSides: 6, attackRangeImage: RANGE_IMAGES.duelist,
    physResistAlgorithm: '通识技能 × 3 + 3', magicResistAlgorithm: '通识技能 × 2.5 + 3',
    physResistFormula: { multiplier: 3, bonus: 3 }, magicResistFormula: { multiplier: 2.5, bonus: 3 },
    hpAlgorithm: hpAlgorithm('中甲', '高'),
  },
  '剑豪': {
    name: '剑豪', parentClass: '近卫', armorType: '中甲', hpTier: '高', rangeType: 'melee',
    branchTrait: '穿戴中甲，具有高生命值\n擅长短时间内造成多次攻击的近战输出职业。',
    weaponType: '伤害骰面为D6的近战物理武器\n通常是各式轻快或双持刀剑。\n能够在较近距离发动接二连三的物理攻击。',
    spRecovery: '普通攻击或轻击命中后，回复2SP。\n同一轮次内，至多以此法回复4SP。\n每进入一个新的精英化阶段，该上限增加2点。',
    weaponDiceSides: 6, attackRangeImage: RANGE_IMAGES.melee,
    physResistAlgorithm: '通识技能 × 3 + 3', magicResistAlgorithm: '通识技能 × 2.5 + 3',
    physResistFormula: { multiplier: 3, bonus: 3 }, magicResistFormula: { multiplier: 2.5, bonus: 3 },
    hpAlgorithm: hpAlgorithm('中甲', '高'),
  },
  '强攻手': {
    name: '强攻手', parentClass: '近卫', armorType: '中甲', hpTier: '高', rangeType: 'melee',
    branchTrait: '穿戴中甲，具有高生命值\n擅长对群体敌人造成伤害的近战输出职业。\n攻击会对攻击范围所有单位造成伤害。',
    weaponType: '伤害骰面为D6的近战物理武器\n通常是各类需要双手使用的长柄沉重近战武器，如重斧、链锯和爆破锤。\n能够在较近距离发动势大力沉的强悍物理攻击。',
    spRecovery: '你的回合结束时恢复1SP。\n每进入一个新的精英化阶段，额外恢复1SP。\n每回合的首次攻击每命中一个目标，就恢复1SP。',
    weaponDiceSides: 6, attackRangeImage: RANGE_IMAGES.cleave,
    physResistAlgorithm: '通识技能 × 3 + 3', magicResistAlgorithm: '通识技能 × 2.5 + 3',
    physResistFormula: { multiplier: 3, bonus: 3 }, magicResistFormula: { multiplier: 2.5, bonus: 3 },
    hpAlgorithm: hpAlgorithm('中甲', '高'),
  },
  '武者': {
    name: '武者', parentClass: '近卫', armorType: '中甲', hpTier: '高', rangeType: 'melee',
    branchTrait: '穿戴中甲，具有高生命值\nHP越低，输出能力越高的近战输出职业。\n同时，武者受到来自其他单位的治疗效果减半。',
    weaponType: '伤害骰面为D6的近战物理武器\n通常是各类注重技巧的长刀。\n能够在近距离发动有节奏的物理攻击。比起其他武器，更注重使用者的技巧和熟练度。',
    spRecovery: '每回合结束时，恢复1SP。\n同时，每有10点已损失HP，就额外恢复1SP，同一轮次内至多以此法回复4SP。每进入一个新的精英化阶段，每回合获得SP的上限+1。',
    weaponDiceSides: 6, attackRangeImage: RANGE_IMAGES.melee,
    physResistAlgorithm: '通识技能 × 3 + 3', magicResistAlgorithm: '通识技能 × 2.5 + 3',
    physResistFormula: { multiplier: 3, bonus: 3 }, magicResistFormula: { multiplier: 2.5, bonus: 3 },
    hpAlgorithm: hpAlgorithm('中甲', '高'),
  },
  '术战者': {
    name: '术战者', parentClass: '近卫', armorType: '中甲', hpTier: '中', rangeType: 'melee',
    branchTrait: '穿戴中甲，具有中生命值\n能够在近距离造成可观的法术伤害的职业。',
    weaponType: '伤害骰面为D6的近战法术武器。术战者武器的依赖技能必然是施术类技能。\n通常是各类能够同时起到施法媒介功能的近战武器，例如带刃的法杖，或由法术制成的刀剑。\n能够在近距离造成可观的法术伤害。',
    spRecovery: '每回合结束时，回复2SP。\n每进入一个新的精英化阶段，额外回复1SP。',
    weaponDiceSides: 6, attackRangeImage: RANGE_IMAGES.melee,
    physResistAlgorithm: '通识技能 × 2.5 + 3', magicResistAlgorithm: '通识技能 × 3 + 3',
    physResistFormula: { multiplier: 2.5, bonus: 3 }, magicResistFormula: { multiplier: 3, bonus: 3 },
    hpAlgorithm: hpAlgorithm('中甲', '中'),
  },
  '炮手': {
    name: '炮手', parentClass: '狙击', armorType: '轻甲', hpTier: '低', rangeType: 'ranged',
    branchTrait: '穿戴轻甲，具有低生命值\n擅长对群体敌人造成伤害的远程输出职业。',
    weaponType: '伤害骰面为D6的远程物理武器\n通常是各种沉重的发射器，如重弩和榴弹炮。\n能够在远距离进行火力支援，擅长破坏地形或对付成群的目标。',
    spRecovery: '你的回合结束时恢复1SP。\n每进入一个新的精英化阶段，额外恢复1SP。\n每回合的首次攻击每命中一个目标，就恢复1SP。',
    weaponDiceSides: 6, attackRangeImage: RANGE_IMAGES.artillery,
    physResistAlgorithm: '通识技能 × 2.5 + 3', magicResistAlgorithm: '通识技能 × 2.5 + 3',
    physResistFormula: { multiplier: 2.5, bonus: 3 }, magicResistFormula: { multiplier: 2.5, bonus: 3 },
    hpAlgorithm: hpAlgorithm('轻甲', '低'),
  },
  '神射手': {
    name: '神射手', parentClass: '狙击', armorType: '轻甲', hpTier: '低', rangeType: 'ranged',
    branchTrait: '穿戴轻甲，具有低生命值\n擅长远距离对关键敌人造成大量物理伤害的远程输出职业。',
    weaponType: '伤害骰面为D6的远程物理武器\n通常是各种精度较高而发射频率较低的双手远程武器，如十字弩与长弓。\n能够在极远距离对脆弱目标进行致命的打击。',
    spRecovery: '回合结束时，获得1SP。如果本回合你没有进行过移动预备，改为获得3SP。每进入一个新的精英化阶段，额外回复1SP。',
    weaponDiceSides: 6, attackRangeImage: RANGE_IMAGES.marksman,
    physResistAlgorithm: '通识技能 × 2.5 + 3', magicResistAlgorithm: '通识技能 × 2.5 + 3',
    physResistFormula: { multiplier: 2.5, bonus: 3 }, magicResistFormula: { multiplier: 2.5, bonus: 3 },
    hpAlgorithm: hpAlgorithm('轻甲', '低'),
  },
  '速射手': {
    name: '速射手', parentClass: '狙击', armorType: '轻甲', hpTier: '低', rangeType: 'ranged',
    branchTrait: '穿戴轻甲，具有低生命值\n擅长对敌人快速造成多次伤害的远程输出职业。',
    weaponType: '伤害骰面为D6的远程物理武器\n通常是各种轻便灵活、在中近距离下火力充足的远程武器，如轻弩和短弓。\n能够在中近距离发动接二连三的远程物理攻击，并灵活地与目标周旋。',
    spRecovery: '你的回合结束时，回复1SP。\n攻击命中后，回复1SP。同一轮次内，至多以此法回复3/4/5点SP（精零/精一/精二）。',
    weaponDiceSides: 6, attackRangeImage: RANGE_IMAGES.tacticalRanged,
    physResistAlgorithm: '通识技能 × 3 + 3', magicResistAlgorithm: '通识技能 × 2.5 + 3',
    physResistFormula: { multiplier: 3, bonus: 3 }, magicResistFormula: { multiplier: 2.5, bonus: 3 },
    hpAlgorithm: hpAlgorithm('轻甲', '低'),
  },
  '吟游者': {
    name: '吟游者', parentClass: '辅助', armorType: '轻甲', hpTier: '中', rangeType: 'ranged',
    branchTrait: '穿戴轻甲，具有中生命值\n擅长对范围内友方角色进行持续辅助和恢复的职业。',
    weaponType: '骰面为D4的远程法术武器。特别地，吟游者武器的依赖技能可以是声乐，即使该技能并不是战斗技能。\n通常来说是各类乐器或音乐设备，但也包括一些施法媒介。相比于其他施法媒介，更看重使用者的支援能力。',
    spRecovery: '你的回合结束时，获得2SP。\n每进入一个新的精英化阶段，获得的SP+1。',
    weaponDiceSides: 4, attackRangeImage: RANGE_IMAGES.bard,
    physResistAlgorithm: '通识技能 × 2.5 + 3', magicResistAlgorithm: '通识技能 × 2.5 + 3',
    physResistFormula: { multiplier: 2.5, bonus: 3 }, magicResistFormula: { multiplier: 2.5, bonus: 3 },
    hpAlgorithm: hpAlgorithm('轻甲', '中'),
  },
  '处决者': {
    name: '处决者', parentClass: '特种', armorType: '轻甲', hpTier: '中', rangeType: 'melee',
    branchTrait: '穿戴轻甲，具有中生命值\n擅长隐秘地突破阵线并寻求机会一击必杀的近战输出职业。',
    weaponType: '伤害骰面为D6的近战物理武器\n各种轻便且致命的轻武器，如匕首与短刀剑。能够发挥出使用者的灵活身段，突进到脆弱的目标附近以造成爆发式伤害。',
    spRecovery: '你的回合结束时，获得1SP。如果你处于【未察觉】状态，改为获得4SP。\n每进入一个新的精英化阶段，获得的SP+1。',
    weaponDiceSides: 6, attackRangeImage: RANGE_IMAGES.melee,
    physResistAlgorithm: '通识技能 × 2.5 + 3', magicResistAlgorithm: '通识技能 × 2.5 + 3',
    physResistFormula: { multiplier: 2.5, bonus: 3 }, magicResistFormula: { multiplier: 2.5, bonus: 3 },
    hpAlgorithm: hpAlgorithm('轻甲', '中'),
  },
  '怪杰': {
    name: '怪杰', parentClass: '特种', armorType: '轻甲', hpTier: '高', rangeType: 'ranged',
    branchTrait: '擅长同时对目标施加负面状态或伤害与正面状态的职业。',
    weaponType: '伤害骰面为D4的远程物理武器\n各种灵活多变的单手发射器。\n能够在中近距离制造花样繁多的辅助效果，并造成补充性的物理伤害。',
    spRecovery: '你的回合结束时，失去2HP，获得3SP。\n每进入一个新的精英化阶段，失去的HP+4，获得的SP+1。',
    weaponDiceSides: 4, attackRangeImage: RANGE_IMAGES.trickster,
    physResistAlgorithm: '通识技能 × 2.5 + 3', magicResistAlgorithm: '通识技能 × 3 + 3',
    physResistFormula: { multiplier: 2.5, bonus: 3 }, magicResistFormula: { multiplier: 3, bonus: 3 },
    hpAlgorithm: hpAlgorithm('轻甲', '高'),
  },
}

