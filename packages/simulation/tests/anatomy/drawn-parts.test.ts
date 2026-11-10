import { describe, expect, it } from 'vitest'
import type { FounderPart, WorldConfig, WorldConfigOverrides } from '@evo/contracts'
import { resolveWorldConfig } from '@evo/config'
import type { OrganismState } from '../../src/entities/OrganismStore'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import { founderBodyVector } from '../../src/genetics/BodyGenes'
import { factorsOf } from '../../src/organisms/bodyFactors'
import { drawnPartsOf } from '../../src/organisms/traits'
import { World } from '../../src/world/World'
import { withoutEcology } from '../support/ecology'
import { organismFor } from '../support/organism'

/**
 * The parts handed to the renderer (ADR 0016): each knows its slot, the part it hangs from and,
 * for a working eye, what it sees, so a child can ride its parent and the selected creature can
 * show its sight.
 */
const plain = (extra: WorldConfigOverrides = {}): WorldConfig =>
  resolveWorldConfig(withoutEcology({ feeding: { enabled: false }, ...extra }))

const withBody = (organism: OrganismState, config: WorldConfig, parts: FounderPart[]) => {
  const body = founderBodyVector({ ...config.anatomy, founder: parts })
  return {
    ...organism,
    genome: genomeFromParts({
      id: organism.genome.id,
      parentIds: organism.genome.parentIds,
      vector: genomeToVector(organism.genome),
      architecture: organism.genome.brain.architecture,
      weights: organism.genome.brain.weights,
      body
    })
  }
}

const part = (type: FounderPart['type'], over: Partial<FounderPart> = {}): FounderPart => ({
  type,
  parent: 0,
  size: 0.5,
  angle: 0,
  offset: 0.5,
  orientation: 0,
  integrity: 1,
  stats: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
  ...over
})

describe('drawnPartsOf: the founder', () => {
  const config = plain()
  const genome = organismFor(config, 1).genome
  const parts = drawnPartsOf(genome, config)

  it('hangs every part from the body and names its slot', () => {
    expect(parts.length).toBeGreaterThan(0)
    expect(parts.every((p) => p.parent === -1)).toBe(true)
    expect(new Set(parts.map((p) => p.slot)).size).toBe(parts.length)
  })

  it('gives an eye its sight and nothing else: the founder sees a 135 degree cone', () => {
    const eyes = parts.filter((p) => p.type === 'eye')
    expect(eyes).toHaveLength(1)
    const fov = 0.5 + 0.3211 * (6.28 - 0.5)
    expect(eyes[0]?.sight?.half).toBeCloseTo(fov / 2, 9)
    // reach: the sensor radius times sqrt(6.28 / fov), about 98 units
    expect(eyes[0]?.sight?.reach).toBeCloseTo(
      config.organisms.sensorRadius * Math.sqrt(6.28 / fov),
      9
    )
    expect(parts.filter((p) => p.type !== 'eye').every((p) => p.sight === null)).toBe(true)
  })
})

describe('drawnPartsOf: parents', () => {
  const config = plain()
  // slot 0..: the founder's parts, then a stalk (founder slot n) and an eye hanging from it
  const base = config.anatomy.founder.map((p) => ({ ...p }))
  const stalkSlot = base.length
  const chain: FounderPart[] = [
    ...base,
    part('eyestalk', { angle: 0, stats: [0.5, 0.5, 0, 0, 0, 0] }),
    // `parent` k means the part in founder slot k - 1
    part('eye', { parent: stalkSlot + 1, offset: 1 })
  ]
  const o = withBody(organismFor(config, 1), config, chain)
  const parts = drawnPartsOf(o.genome, config)

  it('points a child at its parent by index in the same array', () => {
    const stalkIndex = parts.findIndex((p) => p.type === 'eyestalk')
    const eyes = parts.filter((p) => p.type === 'eye')
    expect(stalkIndex).toBeGreaterThanOrEqual(0)
    expect(eyes.some((p) => p.parent === stalkIndex)).toBe(true)
  })

  it('always puts the parent before the child (one forward pass places every part)', () => {
    parts.forEach((p, index) => {
      expect(p.parent).toBeLessThan(index)
      expect(p.parent).toBeGreaterThanOrEqual(-1)
    })
  })

  it('negative: parts of the plain founder have no parent but the body', () => {
    const plainParts = drawnPartsOf(organismFor(config, 2).genome, config)
    expect(plainParts.some((p) => p.parent >= 0)).toBe(false)
  })
})

describe('drawnPartsOf: sight', () => {
  const config = plain()
  const narrowEye = (fovGene: number): FounderPart[] => [
    ...config.anatomy.founder.filter((p) => p.type !== 'eye').map((p) => ({ ...p })),
    part('eye', { offset: 0.8, stats: [0.5, 0.5, fovGene, 0.5, 0.5, 0.5] })
  ]
  const gene = (radians: number): number => (radians - 0.5) / (6.28 - 0.5)

  it('matches the body: the half-angle and reach of the eye are those of its cone', () => {
    const o = withBody(organismFor(config, 1), config, narrowEye(gene(1.2)))
    const eye = drawnPartsOf(o.genome, config).find((p) => p.type === 'eye')
    const cone = factorsOf(o.genome, config).vision.cones[0]
    expect(eye?.sight?.half).toBeCloseTo(0.6, 9)
    expect(eye?.sight?.half).toBe(cone?.half)
    expect(eye?.sight?.reach).toBeCloseTo((cone?.reach ?? 0) * config.organisms.sensorRadius, 9)
    // a narrow eye sees further than the sensor
    expect(eye?.sight?.reach ?? 0).toBeGreaterThan(config.organisms.sensorRadius)
  })

  it('negative: an eye with no integrity has no sight (it is not working)', () => {
    const parts = narrowEye(gene(1.2)).map((p) => (p.type === 'eye' ? { ...p, integrity: 0 } : p))
    const o = withBody(organismFor(config, 1), config, parts)
    const eye = drawnPartsOf(o.genome, config).find((p) => p.type === 'eye')
    expect(eye).toBeDefined()
    expect(eye?.sight).toBeNull()
  })
})

describe('drawnPartsOf: evolved bodies', () => {
  it('keep every invariant over many bodies from a heavily mutating world', () => {
    // A founder that already carries a stalk with an eye hanging from it, so riders are inherited
    // and mutated, not waited for.
    const base = resolveWorldConfig({}).anatomy.founder.map((p) => ({ ...p }))
    const stalkSlot = base.length
    const founder: FounderPart[] = [
      ...base,
      part('eyestalk', { stats: [0.5, 0.5, 0, 0, 0, 0] }),
      part('eye', { parent: stalkSlot + 1, offset: 1, stats: [0.5, 0.5, 0.4, 0.5, 0.5, 0.5] })
    ]
    const world = World.create({
      seed: 41,
      config: {
        organisms: { initialCount: 24 },
        anatomy: {
          founder,
          mutation: { presenceRate: 0.2, typeRate: 0.2, parentRate: 0.2, continuousRate: 0.3 }
        },
        genetics: { mutationRateScale: 4 }
      }
    })
    world.run(1_500)
    let eyes = 0
    let riders = 0
    for (const o of world.snapshot().organisms) {
      const parts = o.parts
      const cones = world.anatomyOf(o.id)?.factors.vision.cones ?? []
      let sighted = 0
      parts.forEach((p, index) => {
        expect(p.parent).toBeLessThan(index)
        expect(p.parent).toBeGreaterThanOrEqual(-1)
        if (p.parent >= 0) riders++
        if (p.type !== 'eye') expect(p.sight).toBeNull()
        else if (p.sight !== null) {
          sighted++
          eyes++
          expect(p.sight.half).toBeGreaterThan(0)
          expect(p.sight.half).toBeLessThanOrEqual(Math.PI)
          expect(p.sight.reach).toBeGreaterThan(0)
          expect(Number.isFinite(p.sight.reach)).toBe(true)
        }
      })
      // exactly one drawn sight per working eye
      expect(sighted).toBe(cones.length)
    }
    expect(eyes).toBeGreaterThan(0)
    // the world has to have kept hanging parts, or the ordering check above proves nothing
    expect(riders).toBeGreaterThan(0)
  })
})
