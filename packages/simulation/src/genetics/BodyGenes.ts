import {
  BODY_GENE_COUNT,
  BODY_GENE_DEFINITIONS,
  BODY_SLOT_COUNT,
  OUTLINE_COUNT_INDEX,
  OUTLINE_MAX_POINTS,
  PART_TYPES,
  SLOT_FIELDS,
  VISUAL_FIELDS,
  outlineAngleIndex,
  outlineRadiusIndex,
  slotGeneIndex,
  visualGeneIndex
} from '@evo/contracts'
import type { AnatomyConfig, FounderPart, StartingBody } from '@evo/contracts'
import { DEFAULT_ANATOMY } from '@evo/config'
import type { RandomSource } from '../random/RandomSource'
import type { GeneSpec } from './GeneSpecs'

/** Latent values for a slot with no founder part: harmless defaults that mutation can wake up. */
const EMPTY_SLOT = {
  type: 0,
  parent: 0,
  size: 0.5,
  angle: 0,
  offset: 0.5,
  orientation: 0,
  integrity: 1,
  s0: 0.5,
  s1: 0.5,
  s2: 0.5,
  s3: 0.5,
  s4: 0.5,
  s5: 0.5
}

/**
 * The body vector of a founder: slot `i` holds `founder[i]` (present), the remaining slots are
 * empty but carry latent values, and the three visual genes come from `founderLook`. The same
 * vector for every founder, so founders differ only in their brains (docs/decisions/0012).
 */
export function founderBodyVector(anatomy: AnatomyConfig): number[] {
  return bodyVectorOf({
    parts: anatomy.founder,
    look: anatomy.founderLook,
    outline: anatomy.founderOutline
  })
}

/** A body plan: what the founder, and every starting body (`anatomy.starters`), is made of. */
export interface BodyPlan {
  readonly parts: readonly FounderPart[]
  readonly look: { readonly pattern: number; readonly accentHue: number }
  readonly outline: {
    readonly count: number
    readonly radii: readonly number[]
    readonly angles: readonly number[]
  }
}

/** The body gene vector of a plan: slot `i` holds `parts[i]`, the rest are empty with latent values. */
export function bodyVectorOf(plan: BodyPlan): number[] {
  const out = new Array<number>(BODY_GENE_COUNT).fill(0)
  for (let slot = 0; slot < BODY_SLOT_COUNT; slot++) {
    const part = plan.parts[slot]
    const values = part
      ? {
          present: 1,
          type: PART_TYPES.indexOf(part.type),
          parent: part.parent,
          size: part.size,
          angle: part.angle,
          offset: part.offset,
          orientation: part.orientation,
          integrity: part.integrity,
          s0: part.stats[0] ?? 0.5,
          s1: part.stats[1] ?? 0.5,
          s2: part.stats[2] ?? 0.5,
          s3: part.stats[3] ?? 0.5,
          s4: part.stats[4] ?? 0.5,
          s5: part.stats[5] ?? 0.5
        }
      : { present: 0, ...EMPTY_SLOT }
    for (const field of SLOT_FIELDS) out[slotGeneIndex(slot, field)] = values[field]
  }
  out[visualGeneIndex('pattern')] = plan.look.pattern
  out[visualGeneIndex('accentHue')] = plan.look.accentHue
  out[OUTLINE_COUNT_INDEX] = plan.outline.count
  for (let i = 0; i < OUTLINE_MAX_POINTS; i++) {
    out[outlineRadiusIndex(i)] = plan.outline.radii[i] as number
    out[outlineAngleIndex(i)] = plan.outline.angles[i] as number
  }
  return out
}

/** A group of founders that start with a body of their own (ADR 0023), resolved from the config. */
export interface StartingGroupChoice {
  readonly name: string
  readonly share: number
  readonly body: number[]
}

/** The body a world's founders start with, and the name of the archetype it came from (`null` for the founder plan). */
export interface StartingBodyChoice {
  readonly name: string | null
  readonly body: number[]
  /** Founder groups with their own bodies, in config order (empty in `reference` mode). */
  readonly groups: readonly StartingGroupChoice[]
}

/**
 * Picks the body a world starts with (ADR 0020). `reference` is the founder plan and draws
 * nothing. `archetypes` always takes exactly one draw from `random`, whether or not an archetype is
 * forced, so forcing one gives the same streams as drawing it. The draw is over the **pool**: the
 * starters not marked `pool: false`, so a group-only body (the hunter) never shifts it. Throws on an
 * empty pool or an unknown forced name (validation catches both first).
 */
export function chooseStartingBody(
  anatomy: AnatomyConfig,
  random: RandomSource
): StartingBodyChoice {
  const { mode, archetype } = anatomy.startingBody
  if (mode === 'reference') return { name: null, body: founderBodyVector(anatomy), groups: [] }
  const starters = anatomy.starters
  if (starters.length === 0) throw new RangeError('anatomy.starters is empty')
  const pool = starters.filter((s) => s.pool !== false)
  if (pool.length === 0) throw new RangeError('anatomy.starters has no starter in the pool')
  const drawn = Math.min(pool.length - 1, Math.floor(random.float() * pool.length))
  const chosen = archetype === null ? pool[drawn] : starters.find((s) => s.name === archetype)
  if (chosen === undefined) throw new RangeError(`unknown starting body "${String(archetype)}"`)
  const bodyOf = (entry: StartingBody): number[] =>
    bodyVectorOf({ parts: entry.parts, look: entry.look, outline: entry.outline })
  const groups: StartingGroupChoice[] = []
  for (const group of anatomy.startingBody.groups) {
    const entry = starters.find((s) => s.name === group.archetype)
    if (entry === undefined) throw new RangeError(`unknown founder group "${group.archetype}"`)
    groups.push({ name: entry.name, share: group.share, body: bodyOf(entry) })
  }
  return { name: chosen.name, body: bodyOf(chosen), groups }
}

/**
 * Which founders belong to which group (ADR 0023): `result[i]` is the index of the group founder `i`
 * of `count` starts in, or `-1` for the base body. Group `g` takes `round(count x share)` founders (at
 * most what is left), spread **evenly** over the founders no earlier group took: of the `k` that
 * remain, the `j`-th is taken when `floor((j + 1) n / k) > floor(j n / k)`. Integer arithmetic and no
 * random draw, so the same config gives the same assignment on every platform and a world's other
 * streams are untouched.
 */
export function assignFounderGroups(count: number, shares: readonly number[]): readonly number[] {
  const assigned = new Array<number>(count).fill(-1)
  shares.forEach((share, g) => {
    const open: number[] = []
    for (let i = 0; i < count; i++) if (assigned[i] === -1) open.push(i)
    const n = Math.min(open.length, Math.round(count * share))
    const k = open.length
    for (let j = 0; j < k; j++) {
      if (Math.floor(((j + 1) * n) / k) > Math.floor((j * n) / k)) assigned[open[j] as number] = g
    }
  })
  return assigned
}

/** The founder body of the default configuration (used where a genome is built without a config). */
export const DEFAULT_BODY_GENES: readonly number[] = Object.freeze(
  founderBodyVector(DEFAULT_ANATOMY)
)

/** What a slot draws afresh when it wakes up (`anatomy.mutation.openTypes`). */
const WOKEN_FIELDS = [
  'type',
  'size',
  'angle',
  'offset',
  'orientation',
  's0',
  's1',
  's2',
  's3',
  's4',
  's5'
]

/**
 * The body gene table in canonical order, in the same shape the generic mutation, recombination,
 * validation and distance code already uses for the scalar genes. Presence, type and parent
 * mutate at their own rates; every other slot gene (size, placement, integrity, stats) shares the
 * continuous rate; the visual genes and the outline their own. With `openTypes` the type gene
 * jumps instead of stepping and a woken slot is drawn afresh.
 */
export function buildBodySpecs(anatomy: AnatomyConfig): GeneSpec[] {
  const baseline = founderBodyVector(anatomy)
  const { mutation } = anatomy
  return BODY_GENE_DEFINITIONS.map((definition, index) => {
    const [, group, field] = definition.path.split('.') as [string, string, string]
    const visual = group === 'visual' && (VISUAL_FIELDS as readonly string[]).includes(field)
    const mutationRate = visual
      ? mutation.visualRate
      : group === 'outline'
        ? mutation.outlineRate
        : field === 'present'
          ? mutation.presenceRate
          : field === 'type'
            ? mutation.typeRate
            : field === 'parent'
              ? mutation.parentRate
              : mutation.continuousRate
    const spec: GeneSpec = {
      path: definition.path,
      kind: definition.kind,
      min: definition.min,
      max: definition.max,
      mutationRate,
      mutationStd: mutation.continuousStd,
      baseline: baseline[index] as number,
      relative: false,
      orderedAfter: -1,
      cosmetic: definition.cosmetic === true
    }
    if (!mutation.openTypes || !group.startsWith('slot')) return spec
    // Every part type can appear: a type change jumps to any type, and a slot that wakes up takes
    // a random type, size, placement and stats (its parent and integrity stay as they were).
    const slot = Number(group.slice('slot'.length))
    return {
      ...spec,
      ...(field === 'type' ? { jump: true } : {}),
      ...((WOKEN_FIELDS as readonly string[]).includes(field)
        ? { resetWith: slotGeneIndex(slot, 'present') }
        : {})
    }
  })
}
