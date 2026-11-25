import type { WorldConfigOverrides } from '@evo/contracts'

/**
 * The settings a person can change in the interface (Step 6), as data: where each lives in the
 * configuration, how it is labelled and grouped, and the range the editor offers. The same table decides
 * what a shared link may carry: a link names settings by their dotted path, and only the paths listed
 * here are ever read from one, so an address can never inject arbitrary configuration.
 *
 * The ranges are inside what `resolveWorldConfig` accepts (a test sets every minimum and maximum, one at
 * a time, against the defaults), so the editor and the validation cannot disagree. Rules that tie two
 * settings together (`initialCount` against `maxCount`) are not in the table: validation reports them by
 * path when a combination is applied.
 */

export type SettingValue = number | boolean

export type SettingGroup = 'food' | 'seeds' | 'evolution' | 'energy' | 'senses' | 'life'

export const SETTING_GROUPS: readonly { readonly name: SettingGroup; readonly label: string }[] = [
  { name: 'food', label: 'Population and food' },
  { name: 'seeds', label: 'Seeds' },
  { name: 'evolution', label: 'Evolution' },
  { name: 'energy', label: 'Energy' },
  { name: 'senses', label: 'Senses' },
  { name: 'life', label: 'Life and world' }
]

export interface SettingDescriptor {
  /** Where the setting lives in the configuration, dotted: `resources.seeds.energy`. */
  readonly path: string
  readonly label: string
  readonly group: SettingGroup
  /** `integer` and `number` have a range; `boolean` is a switch. */
  readonly kind: 'number' | 'integer' | 'boolean'
  readonly min?: number
  readonly max?: number
  /** The editor's step for a number. */
  readonly step?: number
  readonly unit?: string
  readonly hint: string
}

const number = (
  path: string,
  label: string,
  group: SettingGroup,
  min: number,
  max: number,
  step: number,
  hint: string,
  unit?: string
): SettingDescriptor => ({
  path,
  label,
  group,
  kind: 'number',
  min,
  max,
  step,
  hint,
  ...(unit === undefined ? {} : { unit })
})

const integer = (
  path: string,
  label: string,
  group: SettingGroup,
  min: number,
  max: number,
  step: number,
  hint: string,
  unit?: string
): SettingDescriptor => ({
  ...number(path, label, group, min, max, step, hint, unit),
  kind: 'integer'
})

const toggle = (
  path: string,
  label: string,
  group: SettingGroup,
  hint: string
): SettingDescriptor => ({
  path,
  label,
  group,
  kind: 'boolean',
  hint
})

export const SETTINGS: readonly SettingDescriptor[] = [
  integer(
    'organisms.initialCount',
    'Starting creatures',
    'food',
    1,
    200,
    1,
    'How many founders a world starts with.'
  ),
  number(
    'resources.spawnRate',
    'Plants a second',
    'food',
    0,
    2,
    0.05,
    'How fast new plants appear.',
    '/s'
  ),
  integer(
    'resources.plants.maxPlants',
    'Most plants',
    'food',
    5,
    200,
    1,
    'The cap on plants alive at once.'
  ),
  number(
    'resources.plants.photosynthesis',
    'Photosynthesis',
    'food',
    0,
    5,
    0.1,
    'Energy a plant gains a second, up to its store.',
    '/s'
  ),
  number(
    'resources.energyValue',
    'Energy of a food item',
    'food',
    5,
    100,
    1,
    'What one item of food is worth.'
  ),

  toggle(
    'resources.seeds.enabled',
    'Seeds',
    'seeds',
    'Full plants drop seeds, a hard food (ADR 0032).'
  ),
  toggle(
    'resources.seeds.germinate',
    'Germination',
    'seeds',
    'An uneaten seed grows into a plant (lost worlds when measured).'
  ),
  number(
    'resources.seeds.interval',
    'Seed interval',
    'seeds',
    5,
    120,
    5,
    'Seconds between seeds from one full plant.',
    's'
  ),
  number(
    'resources.seeds.energy',
    'Seed energy',
    'seeds',
    5,
    60,
    1,
    'Energy a seed takes from its plant.'
  ),

  number(
    'genetics.mutationRateScale',
    'Mutation rate',
    'evolution',
    0,
    5,
    0.1,
    'Scales how often a gene mutates; 0 freezes evolution.',
    'x'
  ),
  number(
    'genetics.mutationStrengthScale',
    'Mutation strength',
    'evolution',
    0,
    5,
    0.1,
    'Scales how far a mutation moves a gene.',
    'x'
  ),
  number(
    'genetics.brain.weightMutationRate',
    'Brain mutation rate',
    'evolution',
    0,
    0.5,
    0.01,
    'The chance a brain weight mutates in a birth.'
  ),
  number(
    'anatomy.mutation.presenceRate',
    'Part gain and loss',
    'evolution',
    0,
    0.1,
    0.005,
    'The chance a body slot gains or loses a part in a birth.'
  ),
  number(
    'anatomy.mutation.typeRate',
    'Part type change',
    'evolution',
    0,
    0.1,
    0.005,
    'The chance a part changes type in a birth.'
  ),
  number(
    'anatomy.mutation.continuousRate',
    'Part stat change',
    'evolution',
    0,
    0.5,
    0.01,
    'The chance a part stat mutates in a birth.'
  ),
  number(
    'anatomy.effects.limbEfficiency',
    'Tail part efficiency',
    'evolution',
    0.05,
    1,
    0.05,
    'What a part hung on a tail delivers (ADR 0030); 1 is no cut.'
  ),
  toggle(
    'anatomy.scavenger.enabled',
    'Scavenger mouth',
    'evolution',
    'A carrion-only mouth form (ADR 0031; it did not survive when measured).'
  ),

  number(
    'organisms.basalCost',
    'Basal cost',
    'energy',
    0,
    2,
    0.05,
    'Energy a creature burns a second just to live.',
    '/s'
  ),
  number(
    'organisms.movementCost',
    'Movement cost',
    'energy',
    0,
    0.05,
    0.001,
    'Energy per unit of speed.'
  ),
  number(
    'organisms.turningCost',
    'Turning cost',
    'energy',
    0,
    0.5,
    0.01,
    'Energy per unit of turning.'
  ),
  number(
    'organisms.sensorCost',
    'Sensing cost',
    'energy',
    0,
    1,
    0.01,
    'Energy a creature pays for its senses.'
  ),
  number(
    'organisms.learningCost',
    'Learning cost',
    'energy',
    0,
    0.2,
    0.01,
    'Energy a creature pays for learning.'
  ),
  number(
    'reproduction.offspringInvestment',
    'Offspring investment',
    'energy',
    1,
    40,
    0.5,
    'Energy each parent puts into a child.'
  ),
  number(
    'reproduction.cooldown',
    'Breeding cooldown',
    'energy',
    5,
    120,
    5,
    'Seconds before a creature can breed again.',
    's'
  ),

  number(
    'organisms.sensorRadius',
    'Sensor radius',
    'senses',
    10,
    200,
    5,
    'How far a creature sees, before its eyes scale it.'
  ),
  number(
    'reproduction.mateSenseRadius',
    'Mate signal range',
    'senses',
    50,
    700,
    10,
    'How far a ready mate can be sensed.'
  ),
  number(
    'reproduction.searchRadius',
    'Mate search range',
    'senses',
    10,
    200,
    5,
    'How far a creature looks for a partner at close range.'
  ),

  toggle(
    'reproduction.eggs.enabled',
    'Eggs',
    'life',
    'Offspring are carried, laid and hatched (ADR 0027).'
  ),
  toggle('ageing.enabled', 'Ageing', 'life', 'Creatures decline and can die of old age.'),
  toggle('predation.enabled', 'Predation', 'life', 'Jaws can bite creatures (ADR 0023).'),
  number(
    'predation.biteDamage',
    'Bite damage',
    'life',
    1,
    50,
    1,
    'Damage a bite on a creature does.'
  ),
  number(
    'ecology.hazards.stormRate',
    'Storm rate',
    'life',
    0,
    0.02,
    0.001,
    'Storms a second.',
    '/s'
  ),
  number(
    'ecology.seasons.seasonLength',
    'Season length',
    'life',
    20,
    1000,
    10,
    'Seconds each season lasts.',
    's'
  )
]

const byPath = new Map(SETTINGS.map((s) => [s.path, s] as const))

/** The descriptor for a dotted path, or `undefined` when it is not an editable setting. */
export function settingByPath(path: string): SettingDescriptor | undefined {
  return byPath.get(path)
}

/** What `path` holds in a configuration (any plain object tree), or `undefined` when a step is missing. */
export function valueAt(config: unknown, path: string): unknown {
  let cursor: unknown = config
  for (const key of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return undefined
    cursor = (cursor as Record<string, unknown>)[key]
  }
  return cursor
}

/** A copy of `overrides` with `path` set to `value` (the nested object that path implies). Never mutates its input. */
export function applyDotted(overrides: object, path: string, value: SettingValue): object {
  const [head, ...rest] = path.split('.') as [string, ...string[]]
  const base = overrides as Record<string, unknown>
  if (rest.length === 0) return { ...base, [head]: value }
  const next = base[head]
  const child = typeof next === 'object' && next !== null ? (next as object) : {}
  return { ...base, [head]: applyDotted(child, rest.join('.'), value) }
}

/** A change set (dotted path to value) as the nested overrides `World.create` takes. */
export function changesToOverrides(
  changes: Readonly<Record<string, SettingValue>>
): WorldConfigOverrides {
  let overrides: object = {}
  for (const [path, value] of Object.entries(changes)) {
    if (settingByPath(path) !== undefined) overrides = applyDotted(overrides, path, value)
  }
  return overrides as WorldConfigOverrides
}

/**
 * Which editable settings differ between two resolved configurations, as a change set. Compared against
 * the **preset's** resolved configuration, not the bare defaults: a value equal to the default but not to
 * the preset has to stay in a link, or the link would rebuild a different world.
 */
export function diffAgainst(baseline: unknown, current: unknown): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {}
  for (const setting of SETTINGS) {
    const was = valueAt(baseline, setting.path)
    const now = valueAt(current, setting.path)
    if ((typeof now === 'number' || typeof now === 'boolean') && now !== was)
      out[setting.path] = now
  }
  return out
}

/**
 * Reads a setting's value from text (an address parameter or an input), or `undefined` when it does not
 * fit: not a number, not whole for an integer, outside the offered range, or not a switch. Never throws,
 * and never clamps: a link that asks for something out of range is ignored, not quietly changed.
 */
export function parseSettingValue(
  setting: SettingDescriptor,
  text: string
): SettingValue | undefined {
  if (setting.kind === 'boolean') {
    if (text === '1' || text === 'true') return true
    if (text === '0' || text === 'false') return false
    return undefined
  }
  if (!/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(text)) return undefined
  const value = Number(text)
  if (!Number.isFinite(value)) return undefined
  if (setting.kind === 'integer' && !Number.isInteger(value)) return undefined
  if (setting.min !== undefined && value < setting.min) return undefined
  if (setting.max !== undefined && value > setting.max) return undefined
  return value
}

/** A value as it goes in an address: `1` and `0` for switches, the shortest form for numbers. */
export function formatSettingValue(value: SettingValue): string {
  if (typeof value === 'boolean') return value ? '1' : '0'
  return String(value)
}
