import {
  BODY_SLOT_COUNT,
  OUTLINE_MAX_POINTS,
  OUTLINE_MIN_POINTS,
  OUTLINE_MIN_RADIUS,
  MOUTH_FORMS,
  PART_STAT_COUNT,
  PART_TYPES
} from '@evo/contracts'
import type { AnatomyConfig } from '@evo/contracts'
import { checkChoice, checkNumber, checkSection, isObject } from './checks'
import { DEFAULT_STARTERS } from './starters'
import type { PlainObject } from './checks'

const TWO_PI = Math.PI * 2

/**
 * Default anatomy (docs/decisions/0012-anatomy.md). Every coefficient is provisional and is set
 * by measurement when anatomy goes live. The founder body plan has two rear flagella (forward
 * thrust, and torque because they sit off the axis), two side cilia (strafing), an eye, a mouth
 * and a stomach: seven parts with a total size of 3.5, so a budget of 6 leaves room to grow.
 */
const MID = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]

export const DEFAULT_ANATOMY: AnatomyConfig = {
  enabled: true,
  structuralBudget: 6,
  bodyMass: 1,
  senseFloor: 0.25,
  mutation: {
    // 0.004 each until every part type became reachable (`openTypes`); 2.5 times that now, still
    // rare: about one birth in nine changes which parts a body has.
    presenceRate: 0.01,
    typeRate: 0.01,
    openTypes: true,
    parentRate: 0.004,
    continuousRate: 0.05,
    continuousStd: 0.05,
    visualRate: 0.02,
    outlineRate: 0.03
  },
  parts: {
    flagellum: { mass: 0.3, upkeep: 0.01, strength: 1 },
    cilia: { mass: 0.1, upkeep: 0.004, strength: 0.35 },
    eye: { mass: 0.1, upkeep: 0.01, strength: 1 },
    sniffer: { mass: 0.08, upkeep: 0.008, strength: 1 },
    mouth: { mass: 0.15, upkeep: 0.006, strength: 1 },
    intestine: { mass: 0.2, upkeep: 0.008, strength: 1 },
    stomach: { mass: 0.25, upkeep: 0.006, strength: 1 },
    armor: { mass: 0.4, upkeep: 0.002, strength: 1 },
    membrane: { mass: 0.1, upkeep: 0.005, strength: 1 },
    mender: { mass: 0.15, upkeep: 0.012, strength: 1 },
    eyestalk: { mass: 0.1, upkeep: 0.004, strength: 1 },
    gyro: { mass: 0.15, upkeep: 0.01, strength: 1 },
    lipid: { mass: 0.35, upkeep: 0.002, strength: 1 },
    pheromone: { mass: 0.08, upkeep: 0.008, strength: 1 },
    skeleton: { mass: 0.3, upkeep: 0.002, strength: 1 },
    join: { mass: 0.05, upkeep: 0.001, strength: 1 }
  },
  // Provisional; tuned by measurement with the rest of the ecology (docs/decisions/0016).
  effects: {
    eyestalkLift: 0.5,
    gyroTorque: 1,
    lipidCapacity: 1.5,
    pheromoneSignal: 0.5,
    pheromoneCap: 2,
    skeletonBudget: 1,
    visionNarrowing: 1
  },
  // Every stat sits at the middle (0.5, a multiplier of 1) and every part has full integrity, so
  // the founder is the reference all capabilities are measured against. Surface parts sit on the
  // outline at `angle`; the eye, stomach (and other interior parts) sit at `offset` times the
  // outline radius there. `orientation` is relative to the anchor's outward direction.
  founder: [
    {
      type: 'flagellum',
      parent: 0,
      size: 0.6,
      angle: 2.6,
      offset: 0.8,
      // turned so the push points straight forward from this off-axis anchor (the outline's
      // outward direction there is 121 degrees, so the tail is turned by 1.0223 radians)
      orientation: 1.0223,
      integrity: 1,
      stats: MID
    },
    {
      type: 'flagellum',
      parent: 0,
      size: 0.6,
      angle: TWO_PI - 2.6,
      offset: 0.8,
      orientation: 5.2609,
      integrity: 1,
      stats: MID
    },
    {
      type: 'cilia',
      parent: 0,
      size: 0.4,
      angle: Math.PI / 2,
      offset: 1,
      orientation: 6.1576,
      integrity: 1,
      stats: MID
    },
    {
      type: 'cilia',
      parent: 0,
      size: 0.4,
      angle: (3 * Math.PI) / 2,
      offset: 1,
      orientation: 0.1256,
      integrity: 1,
      stats: MID
    },
    {
      type: 'eye',
      parent: 0,
      size: 0.5,
      angle: 0.5,
      offset: 0.8,
      // The outline's outward direction at this anchor is 0.9895 radians, so the eye is turned by
      // 2 pi - 0.9895 to look straight ahead along the heading.
      orientation: 5.29373,
      integrity: 1,
      // Every stat in the middle except the field of view: 0.3211 of its range is 135 degrees
      // (2.356 radians), a forward cone as wide as a creature can reasonably see. With the range
      // for angle trade (`visionNarrowing`) it reaches about 1.6 times as far as an all-round eye
      // and sees the same area, but only the area it faces (ADR 0016 "Directional vision").
      stats: [0.5, 0.5, 0.3211, 0.5, 0.5, 0.5]
    },
    {
      type: 'mouth',
      parent: 0,
      size: 0.5,
      angle: 0,
      offset: 1,
      orientation: 0,
      integrity: 1,
      stats: MID
    },
    {
      type: 'stomach',
      parent: 0,
      size: 0.5,
      angle: Math.PI,
      offset: 0.2,
      orientation: 0,
      integrity: 1,
      stats: MID
    }
  ],
  founderLook: { pattern: 0, accentHue: 0.1 },
  // Eight points, each in the middle of its sector, mirrored left to right: a snout at the front,
  // narrow flanks and a fuller rear, which drawn as a smooth curve reads as a small creature.
  founderOutline: {
    count: 8,
    radii: [
      0.95,
      0.8,
      0.72,
      0.88,
      0.88,
      0.72,
      0.8,
      0.95,
      ...new Array<number>(OUTLINE_MAX_POINTS - 8).fill(0.8)
    ],
    angles: new Array<number>(OUTLINE_MAX_POINTS).fill(0.5)
  },
  // Bodies a world can start with instead of the founder (ADR 0020).
  starters: DEFAULT_STARTERS,
  startingBody: {
    mode: 'archetypes',
    archetype: null,
    groups: [{ archetype: 'hunter', share: 0.1 }]
  },
  outlineDrag: 0.5,
  // Energy yield of each mouth form on each kind of food (ADR 0017). The mandible is the
  // generalist and exactly 1 everywhere, so the founder is the reference; the specialists beat it on
  // their own food and lose on the rest. The jaw is a **carnivore's** (ADR 0023): 0 on every plant, so
  // it neither bites nor sees plants and lives on creatures (`predation.fleshYield`) and carrion. It
  // was 0.55, then 1.0 to keep a lineage alive; at 1.0 jaws were omnivores that took over a world
  // (35 of 36 creatures at 100,000 ticks, 82 percent of the energy still from plants). A food kind
  // that is not listed counts as 1. All provisional.
  mouthForms: {
    sprout: { grass: 1.3, fruit: 1.1, fungus: 0.6, nectar: 0.9 },
    proboscis: { grass: 0.6, fruit: 1.15, fungus: 0.7, nectar: 1.5 },
    mandible: { grass: 1, fruit: 1, fungus: 1, nectar: 1 },
    radula: { grass: 0.9, fruit: 0.8, fungus: 1.4, nectar: 0.5 },
    jaw: { grass: 0, fruit: 0, fungus: 0, nectar: 0 }
  }
}

const ANATOMY_KEYS = [
  'enabled',
  'structuralBudget',
  'bodyMass',
  'senseFloor',
  'mutation',
  'parts',
  'effects',
  'founder',
  'founderLook',
  'founderOutline',
  'starters',
  'startingBody',
  'outlineDrag',
  'mouthForms'
]
const MUTATION_KEYS = [
  'presenceRate',
  'typeRate',
  'openTypes',
  'parentRate',
  'continuousRate',
  'continuousStd',
  'visualRate',
  'outlineRate'
]
const PART_KEYS = ['mass', 'upkeep', 'strength']
const EFFECT_KEYS = [
  'eyestalkLift',
  'gyroTorque',
  'lipidCapacity',
  'pheromoneSignal',
  'pheromoneCap',
  'skeletonBudget',
  'visionNarrowing'
]
const FOUNDER_PART_KEYS = [
  'type',
  'parent',
  'size',
  'angle',
  'offset',
  'orientation',
  'integrity',
  'stats'
]
const LOOK_KEYS = ['pattern', 'accentHue']
const STARTER_KEYS = ['name', 'description', 'parts', 'look', 'outline', 'pool']
const STARTING_BODY_KEYS = ['mode', 'archetype', 'groups']
const STARTING_GROUP_KEYS = ['archetype', 'share']
const STARTING_BODY_MODES = ['reference', 'archetypes']
const OUTLINE_KEYS = ['count', 'radii', 'angles']

/** The names of the food kinds when kinds are on, else none. */
function enabledKindNames(root: PlainObject): string[] {
  const ecology = root['ecology']
  const section = isObject(ecology) ? ecology['resourceKinds'] : undefined
  if (!isObject(section) || section['enabled'] !== true || !Array.isArray(section['kinds'])) {
    return []
  }
  const names: string[] = []
  for (const kind of section['kinds'] as unknown[]) {
    if (isObject(kind) && typeof kind['name'] === 'string') names.push(kind['name'])
  }
  return names
}

function checkRange(
  section: PlainObject,
  key: string,
  path: string,
  low: number,
  high: number,
  inclusiveHigh: boolean,
  errors: string[]
): number | undefined {
  const value = checkNumber(section, key, path, {}, errors)
  if (value === undefined) return undefined
  const ok = value >= low && (inclusiveHigh ? value <= high : value < high)
  if (!ok) {
    errors.push(`${path} must be from ${low} to ${high}${inclusiveHigh ? '' : ' (exclusive)'}`)
    return undefined
  }
  return value
}

/** Validates the top-level `anatomy` section of a complete configuration. Reports every problem. */
export function checkAnatomy(root: PlainObject, errors: string[]): void {
  const anatomy = checkSection(root, 'anatomy', ANATOMY_KEYS, errors)
  if (!anatomy) return

  if (anatomy['enabled'] === undefined) errors.push('anatomy.enabled is required')
  else if (typeof anatomy['enabled'] !== 'boolean') errors.push('anatomy.enabled must be a boolean')

  const budget = checkNumber(
    anatomy,
    'structuralBudget',
    'anatomy.structuralBudget',
    { positive: true },
    errors
  )
  checkNumber(anatomy, 'bodyMass', 'anatomy.bodyMass', { positive: true }, errors)
  const floor = checkNumber(anatomy, 'senseFloor', 'anatomy.senseFloor', {}, errors)
  if (floor !== undefined && (floor <= 0 || floor > 1)) {
    errors.push('anatomy.senseFloor must be greater than zero and at most one')
  }

  const mutation = checkSection(anatomy, 'mutation', MUTATION_KEYS, errors, 'anatomy.mutation')
  if (mutation) {
    for (const key of [
      'presenceRate',
      'typeRate',
      'parentRate',
      'continuousRate',
      'visualRate',
      'outlineRate'
    ]) {
      checkRange(mutation, key, `anatomy.mutation.${key}`, 0, 1, true, errors)
    }
    checkNumber(
      mutation,
      'continuousStd',
      'anatomy.mutation.continuousStd',
      { positive: true },
      errors
    )
    if (mutation.openTypes !== undefined && typeof mutation.openTypes !== 'boolean') {
      errors.push('anatomy.mutation.openTypes must be a boolean')
    }
  }

  const parts = checkSection(anatomy, 'parts', [...PART_TYPES], errors, 'anatomy.parts')
  if (parts) {
    for (const type of PART_TYPES) {
      const part = checkSection(parts, type, PART_KEYS, errors, `anatomy.parts.${type}`)
      if (!part) continue
      checkNumber(part, 'mass', `anatomy.parts.${type}.mass`, { nonnegative: true }, errors)
      checkNumber(part, 'upkeep', `anatomy.parts.${type}.upkeep`, { nonnegative: true }, errors)
      checkNumber(part, 'strength', `anatomy.parts.${type}.strength`, { positive: true }, errors)
    }
  }

  const effects = checkSection(anatomy, 'effects', EFFECT_KEYS, errors, 'anatomy.effects')
  if (effects) {
    for (const key of EFFECT_KEYS.filter((k) => k !== 'pheromoneCap')) {
      checkNumber(effects, key, `anatomy.effects.${key}`, { nonnegative: true }, errors)
    }
    const cap = checkNumber(effects, 'pheromoneCap', 'anatomy.effects.pheromoneCap', {}, errors)
    if (cap !== undefined && cap < 1) errors.push('anatomy.effects.pheromoneCap must be at least 1')
    const narrowing = effects['visionNarrowing']
    if (typeof narrowing === 'number' && narrowing > 1) {
      errors.push('anatomy.effects.visionNarrowing must be at most 1')
    }
  }

  checkParts(anatomy['founder'], 'anatomy.founder', budget, errors, 'founder body')

  checkLook(
    checkSection(anatomy, 'founderLook', LOOK_KEYS, errors, 'anatomy.founderLook'),
    'anatomy.founderLook',
    errors
  )

  checkNumber(anatomy, 'outlineDrag', 'anatomy.outlineDrag', { nonnegative: true }, errors)

  const forms = checkSection(anatomy, 'mouthForms', [...MOUTH_FORMS], errors, 'anatomy.mouthForms')
  if (forms) {
    for (const form of MOUTH_FORMS) {
      const kinds = forms[form]
      if (kinds === undefined) {
        errors.push(`anatomy.mouthForms.${form} is required`)
      } else if (!isObject(kinds)) {
        errors.push(`anatomy.mouthForms.${form} must be an object of food kind to yield`)
      } else {
        for (const [kind, value] of Object.entries(kinds)) {
          // Zero is allowed: a carnivore's jaw takes nothing from plants (ADR 0023). The mandible is 1.
          if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
            errors.push(`anatomy.mouthForms.${form}.${kind} must be a number, zero or more`)
          }
        }
      }
    }
    // With food kinds on, every form must say what it yields for every kind: an unlisted kind used
    // to be edible by everyone (a yield of 1), which hard diets turn into a trap (ADR 0026). The
    // carcass kind is added later, from `predation.carcass.yields`, so it is not listed here.
    for (const name of enabledKindNames(root)) {
      for (const form of MOUTH_FORMS) {
        const kinds = forms[form]
        if (isObject(kinds) && kinds[name] === undefined) {
          errors.push(
            `anatomy.mouthForms.${form} has no yield for the food kind "${name}" (list it, with 0 if the form cannot eat it)`
          )
        }
      }
    }
    const mandible = forms['mandible']
    if (isObject(mandible)) {
      for (const [kind, value] of Object.entries(mandible)) {
        if (value !== 1) {
          errors.push(
            `anatomy.mouthForms.mandible.${kind} must be exactly 1: the mandible is the founder's neutral generalist`
          )
        }
      }
    }
  }

  checkOutline(
    checkSection(anatomy, 'founderOutline', OUTLINE_KEYS, errors, 'anatomy.founderOutline'),
    'anatomy.founderOutline',
    errors
  )

  checkStarters(anatomy, errors, budget)
}

/**
 * Validates a body plan's part list: `anatomy.founder` or a starter's `parts`. `noun` is what the
 * messages call the body ("founder", "starting body"), so a total size over the budget reads right.
 */
function checkParts(
  parts: unknown,
  path: string,
  budget: number | undefined,
  errors: string[],
  noun: string
): void {
  if (parts === undefined) {
    errors.push(`${path} is required`)
    return
  }
  if (!Array.isArray(parts)) {
    errors.push(`${path} must be an array`)
    return
  }
  if (parts.length > BODY_SLOT_COUNT) {
    errors.push(`${path} has ${parts.length} parts but a body has ${BODY_SLOT_COUNT} slots`)
  }
  let total = 0
  let allSizes = true
  parts.forEach((entry: unknown, index: number) => {
    const at = `${path}[${index}]`
    if (!isObject(entry)) {
      errors.push(`${at} must be an object`)
      allSizes = false
      return
    }
    for (const key of Object.keys(entry)) {
      if (!FOUNDER_PART_KEYS.includes(key)) errors.push(`unknown property "${at}.${key}"`)
    }
    checkChoice(entry, 'type', `${at}.type`, [...PART_TYPES], errors)
    const size = checkRange(entry, 'size', `${at}.size`, 0.1, 1, true, errors)
    if (size === undefined) allSizes = false
    else total += size
    checkRange(entry, 'angle', `${at}.angle`, 0, TWO_PI, false, errors)
    checkRange(entry, 'orientation', `${at}.orientation`, 0, TWO_PI, false, errors)
    checkRange(entry, 'offset', `${at}.offset`, 0, 1, true, errors)
    checkRange(entry, 'integrity', `${at}.integrity`, 0.1, 1, true, errors)
    const parent = checkNumber(entry, 'parent', `${at}.parent`, { integer: true }, errors)
    if (parent !== undefined && (parent < 0 || parent > index)) {
      errors.push(
        `${at}.parent must be 0 (the body) or the number of an earlier part, 1 to ${index}`
      )
    }
    const stats = entry['stats']
    if (!Array.isArray(stats) || stats.length > PART_STAT_COUNT) {
      errors.push(`${at}.stats must be an array of at most ${PART_STAT_COUNT} numbers`)
    } else {
      stats.forEach((value: unknown, statIndex: number) => {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
          errors.push(`${at}.stats[${statIndex}] must be a number from 0 to 1`)
        }
      })
    }
  })
  if (allSizes && budget !== undefined && total > budget) {
    errors.push(
      `${path} has a total size of ${total} but anatomy.structuralBudget is ${budget}; the ${noun} must develop completely`
    )
  }
}

/** Validates a painted-genes section (`anatomy.founderLook` or a starter's `look`). */
function checkLook(look: PlainObject | undefined, path: string, errors: string[]): void {
  if (!look) return
  const pattern = checkNumber(look, 'pattern', `${path}.pattern`, { integer: true }, errors)
  if (pattern !== undefined && (pattern < 0 || pattern > 3)) {
    errors.push(`${path}.pattern must be an integer from 0 to 3`)
  }
  checkRange(look, 'accentHue', `${path}.accentHue`, 0, 1, false, errors)
}

/** Validates an outline section (`anatomy.founderOutline` or a starter's `outline`). */
function checkOutline(outline: PlainObject | undefined, path: string, errors: string[]): void {
  if (!outline) return
  const count = checkNumber(outline, 'count', `${path}.count`, { integer: true }, errors)
  if (count !== undefined && (count < OUTLINE_MIN_POINTS || count > OUTLINE_MAX_POINTS)) {
    errors.push(
      `${path}.count must be an integer from ${OUTLINE_MIN_POINTS} to ${OUTLINE_MAX_POINTS}`
    )
  }
  const list = (key: 'radii' | 'angles', low: number, high: number): void => {
    const values = outline[key]
    const at = `${path}.${key}`
    if (!Array.isArray(values) || values.length !== OUTLINE_MAX_POINTS) {
      errors.push(`${at} must be an array of ${OUTLINE_MAX_POINTS} numbers`)
      return
    }
    values.forEach((value: unknown, index: number) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) {
        errors.push(`${at}[${index}] must be a number from ${low} to ${high}`)
      }
    })
  }
  list('radii', OUTLINE_MIN_RADIUS, 1)
  list('angles', 0, 1)
}

/** Validates `anatomy.starters` and `anatomy.startingBody` (ADR 0020). */
function checkStarters(anatomy: PlainObject, errors: string[], budget: number | undefined): void {
  const names: string[] = []
  const starters = anatomy['starters']
  if (starters === undefined) errors.push('anatomy.starters is required')
  else if (!Array.isArray(starters)) errors.push('anatomy.starters must be an array')
  else {
    starters.forEach((entry: unknown, index: number) => {
      const path = `anatomy.starters[${index}]`
      if (!isObject(entry)) {
        errors.push(`${path} must be an object`)
        return
      }
      for (const key of Object.keys(entry)) {
        if (!STARTER_KEYS.includes(key)) errors.push(`unknown property "${path}.${key}"`)
      }
      const name = entry['name']
      if (typeof name !== 'string' || name.trim() === '') {
        errors.push(`${path}.name must be a non-empty string`)
      } else {
        if (names.includes(name)) errors.push(`${path}.name "${name}" is used twice`)
        names.push(name)
      }
      if (typeof entry['description'] !== 'string') {
        errors.push(`${path}.description must be a string`)
      }
      if (entry['pool'] !== undefined && typeof entry['pool'] !== 'boolean') {
        errors.push(`${path}.pool must be true or false`)
      }
      checkParts(entry['parts'], `${path}.parts`, budget, errors, 'starting body')
      checkLook(
        checkSection(entry, 'look', LOOK_KEYS, errors, `${path}.look`),
        `${path}.look`,
        errors
      )
      checkOutline(
        checkSection(entry, 'outline', OUTLINE_KEYS, errors, `${path}.outline`),
        `${path}.outline`,
        errors
      )
    })
  }

  const choice = checkSection(
    anatomy,
    'startingBody',
    STARTING_BODY_KEYS,
    errors,
    'anatomy.startingBody'
  )
  if (!choice) return
  checkChoice(choice, 'mode', 'anatomy.startingBody.mode', STARTING_BODY_MODES, errors)
  const archetype = choice['archetype']
  if (archetype !== null && typeof archetype !== 'string') {
    errors.push('anatomy.startingBody.archetype must be a starter name or null')
  } else if (typeof archetype === 'string' && !names.includes(archetype)) {
    errors.push(`anatomy.startingBody.archetype "${archetype}" is not one of anatomy.starters`)
  }
  if (choice['mode'] === 'archetypes' && Array.isArray(starters) && starters.length === 0) {
    errors.push('anatomy.startingBody.mode is "archetypes" but anatomy.starters is empty')
  }
  if (
    choice['mode'] === 'archetypes' &&
    Array.isArray(starters) &&
    starters.length > 0 &&
    !starters.some((entry) => isObject(entry) && entry['pool'] !== false)
  ) {
    errors.push('anatomy.starters has no starter in the pool (every one has pool: false)')
  }
  checkGroups(choice['groups'], names, errors)
}

/** The founder groups (ADR 0023): known starters, each share in (0, 0.5], and at most half of all founders. */
function checkGroups(groups: unknown, names: readonly string[], errors: string[]): void {
  const at = 'anatomy.startingBody.groups'
  if (!Array.isArray(groups)) {
    errors.push(`${at} must be an array`)
    return
  }
  let total = 0
  const used: string[] = []
  groups.forEach((entry: unknown, index: number) => {
    const path = `${at}[${index}]`
    if (!isObject(entry)) {
      errors.push(`${path} must be an object`)
      return
    }
    for (const key of Object.keys(entry)) {
      if (!STARTING_GROUP_KEYS.includes(key)) errors.push(`unknown property "${path}.${key}"`)
    }
    const archetype = entry['archetype']
    if (typeof archetype !== 'string' || !names.includes(archetype)) {
      errors.push(`${path}.archetype must be the name of a starter in anatomy.starters`)
    } else if (used.includes(archetype)) {
      errors.push(`${path}.archetype "${archetype}" is used by two groups`)
    } else {
      used.push(archetype)
    }
    const share = entry['share']
    if (typeof share !== 'number' || !Number.isFinite(share) || share <= 0 || share > 0.5) {
      errors.push(`${path}.share must be a number above 0 and at most 0.5`)
    } else {
      total += share
    }
  })
  if (total > 0.5) errors.push(`${at} shares add up to ${total}, which is more than 0.5`)
}
