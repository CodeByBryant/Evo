import { BODY_SLOT_COUNT, PART_TYPES, SLOT_FIELDS, slotGeneIndex } from '@evo/contracts'

/** A run of consecutive genes that crossover treats as one unit: `start` to `start + length - 1`. */
export interface LinkedGroup {
  readonly start: number
  readonly length: number
}

const MOUTH_TYPE = PART_TYPES.indexOf('mouth')

function holdsMouth(genes: readonly number[], slot: number): boolean {
  return (
    genes[slotGeneIndex(slot, 'present')] === 1 && genes[slotGeneIndex(slot, 'type')] === MOUTH_TYPE
  )
}

/**
 * The body slots that hold a mouth in at least one parent (ADR 0023 step four). Crossover inherits
 * such a slot whole from one parent: a mouth's type, placement and stats, above all its form (a
 * stat that is cut into five bands), go together instead of being blended with whatever the other
 * parent has in that slot. Slots without a mouth in either parent are untouched. In slot order.
 */
export function linkedMouthGroups(
  mother: readonly number[],
  father: readonly number[]
): readonly LinkedGroup[] {
  const groups: LinkedGroup[] = []
  for (let slot = 0; slot < BODY_SLOT_COUNT; slot++) {
    if (holdsMouth(mother, slot) || holdsMouth(father, slot)) {
      groups.push({ start: slotGeneIndex(slot, SLOT_FIELDS[0]), length: SLOT_FIELDS.length })
    }
  }
  return groups
}
