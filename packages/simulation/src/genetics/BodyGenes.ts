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
import type { AnatomyConfig } from '@evo/contracts'
import { DEFAULT_ANATOMY } from '@evo/config'
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
  const out = new Array<number>(BODY_GENE_COUNT).fill(0)
  for (let slot = 0; slot < BODY_SLOT_COUNT; slot++) {
    const part = anatomy.founder[slot]
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
  out[visualGeneIndex('pattern')] = anatomy.founderLook.pattern
  out[visualGeneIndex('accentHue')] = anatomy.founderLook.accentHue
  out[OUTLINE_COUNT_INDEX] = anatomy.founderOutline.count
  for (let i = 0; i < OUTLINE_MAX_POINTS; i++) {
    out[outlineRadiusIndex(i)] = anatomy.founderOutline.radii[i] as number
    out[outlineAngleIndex(i)] = anatomy.founderOutline.angles[i] as number
  }
  return out
}

/** The founder body of the default configuration (used where a genome is built without a config). */
export const DEFAULT_BODY_GENES: readonly number[] = Object.freeze(
  founderBodyVector(DEFAULT_ANATOMY)
)

/**
 * The body gene table in canonical order, in the same shape the generic mutation, recombination,
 * validation and distance code already uses for the scalar genes. Presence, type and parent
 * mutate at their own rates; every other slot gene (size, placement, integrity, stats) shares the
 * continuous rate; the visual genes and the outline their own.
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
    return {
      path: definition.path,
      kind: definition.kind,
      min: definition.min,
      max: definition.max,
      mutationRate,
      mutationStd: mutation.continuousStd,
      baseline: baseline[index] as number,
      relative: false,
      orderedAfter: -1
    }
  })
}
