import {
  BODY_GENE_COUNT,
  BODY_GENE_DEFINITIONS,
  BODY_SLOT_COUNT,
  PART_TYPES,
  SLOT_FIELDS,
  VISUAL_FIELDS,
  slotGeneIndex,
  visualGeneIndex
} from '@evo/contracts'
import type { AnatomyConfig } from '@evo/contracts'
import { DEFAULT_ANATOMY } from '@evo/config'
import type { GeneSpec } from './GeneSpecs'

/** Latent values for a slot with no founder part: harmless defaults that mutation can wake up. */
const EMPTY_SLOT = { type: 0, size: 0.5, angle: 0, offset: 0.5, orientation: 0, param: 0.5 }

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
          size: part.size,
          angle: part.angle,
          offset: part.offset,
          orientation: part.orientation,
          param: part.param
        }
      : { present: 0, ...EMPTY_SLOT }
    for (const field of SLOT_FIELDS) out[slotGeneIndex(slot, field)] = values[field]
  }
  out[visualGeneIndex('shape')] = anatomy.founderLook.shape
  out[visualGeneIndex('pattern')] = anatomy.founderLook.pattern
  out[visualGeneIndex('accentHue')] = anatomy.founderLook.accentHue
  return out
}

/** The founder body of the default configuration (used where a genome is built without a config). */
export const DEFAULT_BODY_GENES: readonly number[] = Object.freeze(
  founderBodyVector(DEFAULT_ANATOMY)
)

/**
 * The body gene table in canonical order, in the same shape the generic mutation, recombination,
 * validation and distance code already uses for the scalar genes. Presence and type mutate at
 * their own rates; every other slot gene shares the continuous rate; the visual genes their own.
 */
export function buildBodySpecs(anatomy: AnatomyConfig): GeneSpec[] {
  const baseline = founderBodyVector(anatomy)
  const { mutation } = anatomy
  return BODY_GENE_DEFINITIONS.map((definition, index) => {
    const field = definition.path.split('.')[2] as string
    const visual = (VISUAL_FIELDS as readonly string[]).includes(field)
    const mutationRate = visual
      ? mutation.visualRate
      : field === 'present'
        ? mutation.presenceRate
        : field === 'type'
          ? mutation.typeRate
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
