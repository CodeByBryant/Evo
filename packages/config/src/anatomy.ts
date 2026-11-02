import { BODY_SLOT_COUNT, PART_TYPES } from '@evo/contracts'
import type { AnatomyConfig } from '@evo/contracts'
import { checkChoice, checkNumber, checkSection, isObject } from './checks'
import type { PlainObject } from './checks'

const TWO_PI = Math.PI * 2

/**
 * Default anatomy (docs/decisions/0012-anatomy.md). Every coefficient is provisional and is set
 * by measurement when anatomy goes live. The founder body plan has two rear flagella (forward
 * thrust, and torque because they sit off the axis), two side cilia (strafing), an eye, a mouth
 * and a stomach: seven parts with a total size of 3.5, so a budget of 6 leaves room to grow.
 */
export const DEFAULT_ANATOMY: AnatomyConfig = {
  enabled: false,
  structuralBudget: 6,
  bodyMass: 1,
  senseFloor: 0.25,
  mutation: {
    presenceRate: 0.004,
    typeRate: 0.004,
    continuousRate: 0.05,
    continuousStd: 0.05,
    visualRate: 0.02
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
    mender: { mass: 0.15, upkeep: 0.012, strength: 1 }
  },
  founder: [
    { type: 'flagellum', size: 0.6, angle: 2.6, offset: 0.8, orientation: 0, param: 0.5 },
    { type: 'flagellum', size: 0.6, angle: TWO_PI - 2.6, offset: 0.8, orientation: 0, param: 0.5 },
    {
      type: 'cilia',
      size: 0.4,
      angle: Math.PI / 2,
      offset: 1,
      orientation: Math.PI / 2,
      param: 0.5
    },
    {
      type: 'cilia',
      size: 0.4,
      angle: (3 * Math.PI) / 2,
      offset: 1,
      orientation: (3 * Math.PI) / 2,
      param: 0.5
    },
    { type: 'eye', size: 0.5, angle: 0, offset: 0.5, orientation: 0, param: 0.5 },
    { type: 'mouth', size: 0.5, angle: 0, offset: 1, orientation: 0, param: 0.5 },
    { type: 'stomach', size: 0.5, angle: Math.PI, offset: 0.2, orientation: 0, param: 0.5 }
  ],
  founderLook: { shape: 6, pattern: 0, accentHue: 0.1 }
}

const ANATOMY_KEYS = [
  'enabled',
  'structuralBudget',
  'bodyMass',
  'senseFloor',
  'mutation',
  'parts',
  'founder',
  'founderLook'
]
const MUTATION_KEYS = ['presenceRate', 'typeRate', 'continuousRate', 'continuousStd', 'visualRate']
const PART_KEYS = ['mass', 'upkeep', 'strength']
const FOUNDER_PART_KEYS = ['type', 'size', 'angle', 'offset', 'orientation', 'param']
const LOOK_KEYS = ['shape', 'pattern', 'accentHue']

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
    for (const key of ['presenceRate', 'typeRate', 'continuousRate', 'visualRate']) {
      checkRange(mutation, key, `anatomy.mutation.${key}`, 0, 1, true, errors)
    }
    checkNumber(
      mutation,
      'continuousStd',
      'anatomy.mutation.continuousStd',
      { positive: true },
      errors
    )
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

  const founder = anatomy['founder']
  if (founder === undefined) errors.push('anatomy.founder is required')
  else if (!Array.isArray(founder)) errors.push('anatomy.founder must be an array')
  else {
    if (founder.length > BODY_SLOT_COUNT) {
      errors.push(
        `anatomy.founder has ${founder.length} parts but a body has ${BODY_SLOT_COUNT} slots`
      )
    }
    let total = 0
    let allSizes = true
    founder.forEach((entry: unknown, index: number) => {
      const path = `anatomy.founder[${index}]`
      if (!isObject(entry)) {
        errors.push(`${path} must be an object`)
        allSizes = false
        return
      }
      for (const key of Object.keys(entry)) {
        if (!FOUNDER_PART_KEYS.includes(key)) errors.push(`unknown property "${path}.${key}"`)
      }
      checkChoice(entry, 'type', `${path}.type`, [...PART_TYPES], errors)
      const size = checkRange(entry, 'size', `${path}.size`, 0.1, 1, true, errors)
      if (size === undefined) allSizes = false
      else total += size
      checkRange(entry, 'angle', `${path}.angle`, 0, TWO_PI, false, errors)
      checkRange(entry, 'orientation', `${path}.orientation`, 0, TWO_PI, false, errors)
      checkRange(entry, 'offset', `${path}.offset`, 0, 1, true, errors)
      checkRange(entry, 'param', `${path}.param`, 0, 1, true, errors)
    })
    if (allSizes && budget !== undefined && total > budget) {
      errors.push(
        `anatomy.founder has a total size of ${total} but anatomy.structuralBudget is ${budget}; the founder body must develop completely`
      )
    }
  }

  const look = checkSection(anatomy, 'founderLook', LOOK_KEYS, errors, 'anatomy.founderLook')
  if (look) {
    const shape = checkNumber(look, 'shape', 'anatomy.founderLook.shape', { integer: true }, errors)
    if (shape !== undefined && (shape < 3 || shape > 8)) {
      errors.push('anatomy.founderLook.shape must be an integer from 3 to 8')
    }
    const pattern = checkNumber(
      look,
      'pattern',
      'anatomy.founderLook.pattern',
      { integer: true },
      errors
    )
    if (pattern !== undefined && (pattern < 0 || pattern > 3)) {
      errors.push('anatomy.founderLook.pattern must be an integer from 0 to 3')
    }
    checkRange(look, 'accentHue', 'anatomy.founderLook.accentHue', 0, 1, false, errors)
  }
}
