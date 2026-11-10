import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import {
  BODY_SLOT_COUNT,
  OUTLINE_COUNT_INDEX,
  PART_TYPES,
  outlineRadiusIndex,
  slotGeneIndex,
  visualGeneIndex
} from '@evo/contracts'
import type { Genome, SlotField } from '@evo/contracts'
import { SLOT_SHARE, bodyPlanDistance } from '../../src/genetics/BodyDistance'
import { buildBodySpecs, founderBodyVector } from '../../src/genetics/BodyGenes'
import { genomeDistance } from '../../src/genetics/GeneticDistance'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import { fixture, founder } from './helpers'

const config = resolveWorldConfig()
const specs = buildBodySpecs(config.anatomy)
const base = founderBodyVector(config.anatomy)

/** The founder body with some slot genes changed. */
function body(changes: Array<[slot: number, field: SlotField, value: number]>): number[] {
  const out = base.slice()
  for (const [slot, field, value] of changes) out[slotGeneIndex(slot, field)] = value
  return out
}

const d = (a: readonly number[], b: readonly number[]): number => bodyPlanDistance(a, b, specs)
/** A slot the founder leaves empty, and one it fills. */
const free = Array.from({ length: BODY_SLOT_COUNT }, (_, slot) => slot).find(
  (slot) => base[slotGeneIndex(slot, 'present')] !== 1
) as number
const used = Array.from({ length: BODY_SLOT_COUNT }, (_, slot) => slot).find(
  (slot) => base[slotGeneIndex(slot, 'present')] === 1
) as number
const ONE_PART = SLOT_SHARE / BODY_SLOT_COUNT

describe('bodyPlanDistance', () => {
  it('has a free and a used slot to work with', () => {
    expect(free).toBeGreaterThanOrEqual(0)
    expect(used).toBeGreaterThanOrEqual(0)
  })

  it('is zero for the same body and symmetric', () => {
    expect(d(base, base)).toBe(0)
    const other = body([
      [free, 'present', 1],
      [used, 'size', 0.9]
    ])
    expect(d(base, other)).toBe(d(other, base))
    expect(d(base, other)).toBeGreaterThan(0)
  })

  it('ignores the latent genes of a slot that is empty in both bodies', () => {
    const latent = body([
      [free, 'type', PART_TYPES.indexOf('gyro')],
      [free, 'size', 1],
      [free, 's0', 0],
      [free, 'angle', 3]
    ])
    expect(d(base, latent)).toBe(0)
    // the negative: the same genes count once the slot holds a part in both
    const shownA = body([[free, 'present', 1]])
    const shownB = body([
      [free, 'present', 1],
      [free, 'size', 1]
    ])
    expect(d(shownA, shownB)).toBeGreaterThan(0)
  })

  it('ignores the colour genes of the body', () => {
    const painted = base.slice()
    painted[visualGeneIndex('pattern')] = 3
    painted[visualGeneIndex('accentHue')] = 0.7
    expect(d(base, painted)).toBe(0)
  })

  it('counts a part gained or lost as one whole slot', () => {
    expect(d(base, body([[free, 'present', 1]]))).toBeCloseTo(ONE_PART, 12)
    expect(d(base, body([[used, 'present', 0]]))).toBeCloseTo(ONE_PART, 12)
  })

  it('counts a different part type as one whole slot, however near the two types are in the list', () => {
    const type = base[slotGeneIndex(used, 'type')] as number
    const next = (type + 1) % PART_TYPES.length
    const far = (type + 8) % PART_TYPES.length
    expect(d(base, body([[used, 'type', next]]))).toBeCloseTo(ONE_PART, 12)
    expect(d(base, body([[used, 'type', far]]))).toBeCloseTo(ONE_PART, 12)
  })

  it('counts a change to a part that both bodies have as a fraction of a slot', () => {
    const size = specs[slotGeneIndex(used, 'size')]!
    const half = (base[slotGeneIndex(used, 'size')] as number) + (size.max - size.min) / 2
    const resized = d(base, body([[used, 'size', Math.min(size.max, half)]]))
    expect(resized).toBeGreaterThan(0)
    expect(resized).toBeLessThan(ONE_PART / 4)
    // hanging from a different parent is a difference too
    const moved = d(
      base,
      body([[used, 'parent', (base[slotGeneIndex(used, 'parent')] as number) + 1]])
    )
    expect(moved).toBeGreaterThan(0)
    expect(moved).toBeLessThan(ONE_PART)
  })

  it('counts the outline: a moved point a little, a point only one body has fully', () => {
    const moved = base.slice()
    moved[outlineRadiusIndex(0)] = (base[outlineRadiusIndex(0)] as number) === 1 ? 0.5 : 1
    expect(d(base, moved)).toBeGreaterThan(0)
    expect(d(base, moved)).toBeLessThan(1 - SLOT_SHARE)
    const count = base[OUTLINE_COUNT_INDEX] as number
    const more = base.slice()
    more[OUTLINE_COUNT_INDEX] = count + 1
    // one extra point out of count + 1, and the shared points unchanged
    expect(d(base, more)).toBeCloseTo((1 - SLOT_SHARE) / (count + 1), 12)
  })

  it('stays within [0, 1] for bodies that share nothing', () => {
    const all = base.slice()
    const none = base.slice()
    for (let slot = 0; slot < BODY_SLOT_COUNT; slot++) {
      all[slotGeneIndex(slot, 'present')] = 1
      none[slotGeneIndex(slot, 'present')] = 0
    }
    const value = d(all, none)
    expect(value).toBeGreaterThanOrEqual(SLOT_SHARE)
    expect(value).toBeLessThanOrEqual(1)
  })
})

describe('genomeDistance with a body table', () => {
  const f = fixture()
  const std = f.config.genetics.brain.initialWeightStd
  const withBody = (genome: Genome, genes: number[]): Genome =>
    genomeFromParts({
      id: genome.id,
      parentIds: genome.parentIds,
      vector: genomeToVector(genome),
      architecture: genome.brain.architecture,
      weights: genome.brain.weights,
      body: genes
    })
  const a = founder(f, 0, 1)

  it('reports the body-plan distance as `body` and the body colours as `appearance`', () => {
    const grown = withBody(a, body([[free, 'present', 1]]))
    const result = genomeDistance(a, grown, f.specs, std, specs)
    expect(result.body).toBeCloseTo(ONE_PART, 12)
    expect(result.appearance).toBe(0)

    const painted = base.slice()
    painted[visualGeneIndex('pattern')] = 3
    const recoloured = genomeDistance(a, withBody(a, painted), f.specs, std, specs)
    expect(recoloured.body).toBe(0)
    expect(recoloured.appearance).toBeGreaterThan(0)
  })

  it('reports no body distance without a body table', () => {
    const grown = withBody(a, body([[free, 'present', 1]]))
    expect(genomeDistance(a, grown, f.specs, std).body).toBe(0)
  })
})
