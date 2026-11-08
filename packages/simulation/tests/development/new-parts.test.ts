import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { AnatomyConfig, FounderPart, PartType, WorldConfig } from '@evo/contracts'
import type { MateBuffer } from '../../src/buffers/types'
import { OrganismStore } from '../../src/entities/OrganismStore'
import type { OrganismState } from '../../src/entities/OrganismStore'
import type { ResourceState } from '../../src/entities/ResourceStore'
import { capabilitiesOf, capabilityFactors } from '../../src/development/capabilities'
import { developAnatomy } from '../../src/development/develop'
import { founderBodyVector } from '../../src/genetics/BodyGenes'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import { ReproductionReadiness } from '../../src/organisms/reproductionReadiness'
import { SpatialHash } from '../../src/spatial/SpatialHash'
import { PerceptionSystem } from '../../src/systems/PerceptionSystem'
import { withoutEcology } from '../support/ecology'
import { organismFor } from '../support/organism'

/**
 * The six parts added after the original ten (ADR 0016): eyestalk, gyro, lipid, pheromone gland,
 * skeleton and join. Each is tested for its effect, for the absence of it without the part, and
 * for what it costs.
 */
const base = resolveWorldConfig().anatomy
const KINDS = 4
const MID = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]

const part = (type: PartType, extra: Partial<FounderPart> = {}): FounderPart => ({
  type,
  parent: 0,
  size: 0.3,
  angle: 0,
  offset: 0.5,
  orientation: 0,
  integrity: 1,
  stats: MID,
  ...extra
})
const withStat = (type: PartType, index: number, gene: number, extra: Partial<FounderPart> = {}) =>
  part(type, { stats: MID.map((v, i) => (i === index ? gene : v)), ...extra })

const founderParts = (): FounderPart[] => base.founder.map((p) => ({ ...p }))

/**
 * The genes are built under a roomy budget (the config rejects a founder that cannot develop
 * completely) and grown under `overrides`, so a tight `structuralBudget` can leave parts out.
 */
function body(parts: FounderPart[], overrides: Partial<AnatomyConfig> = {}) {
  const built = resolveWorldConfig({ anatomy: { founder: parts, structuralBudget: 12 } }).anatomy
  const config = { ...built, ...overrides }
  const anatomy = developAnatomy(founderBodyVector(built), config)
  return { config, anatomy, caps: capabilitiesOf(anatomy, config, 1, KINDS) }
}

const founder = body(founderParts())
const factors = (parts: FounderPart[]) => capabilityFactors(body(parts).caps, founder.caps)

describe('the founder is untouched by the new parts', () => {
  it('has a mating signal of exactly 1 and the same budget as configured', () => {
    expect(founder.caps.mateSignal).toBe(1)
    expect(capabilityFactors(founder.caps, founder.caps).mateSignal).toBe(1)
    expect(founder.anatomy.budget).toBe(12)
  })
})

describe('eyestalk: an eye carried on a stalk sees further', () => {
  const stalk = (extra: Partial<FounderPart> = {}) =>
    part('eyestalk', { angle: 0.3, orientation: 0, ...extra })
  /** slot 7 is the stalk, so `parent: 8` is the part in slot 7 */
  const eyeOn = (parent: number) => part('eye', { size: 0.5, parent, offset: 1, orientation: 0 })

  it('lifts the range of an eye hanging from it, more with a longer stalk', () => {
    const onBody = body([...founderParts(), stalk(), eyeOn(0)]).caps.senseRange
    const onStalk = body([...founderParts(), stalk(), eyeOn(8)]).caps.senseRange
    const onLong = body([
      ...founderParts(),
      stalk({ stats: [1, 0.5, 0.5, 0.5, 0.5, 0.5] }),
      eyeOn(8)
    ]).caps.senseRange
    const onShort = body([
      ...founderParts(),
      stalk({ stats: [0, 0.5, 0.5, 0.5, 0.5, 0.5] }),
      eyeOn(8)
    ]).caps.senseRange
    expect(onStalk).toBeGreaterThan(onBody)
    expect(onLong).toBeGreaterThan(onStalk)
    expect(onShort).toBeLessThan(onStalk)
    expect(onShort).toBeGreaterThan(onBody)
  })

  it('does not lift an eye carried by something else', () => {
    const onBody = body([...founderParts(), part('join', { angle: 0.3 }), eyeOn(0)]).caps.senseRange
    const onJoin = body([...founderParts(), part('join', { angle: 0.3 }), eyeOn(8)]).caps.senseRange
    expect(onJoin).toBe(onBody)
  })

  it('hangs the eye at the stalk’s tip', () => {
    const { anatomy } = body([...founderParts(), stalk(), eyeOn(8)])
    const carrier = anatomy.parts.find((p) => p.type === 'eyestalk')
    const eye = anatomy.parts[anatomy.parts.length - 1]
    expect(eye?.type).toBe('eye')
    expect(eye?.parent).toBe(carrier?.slot)
    expect(eye?.x).toBeCloseTo(carrier?.tipX ?? NaN, 9)
    expect(eye?.y).toBeCloseTo(carrier?.tipY ?? NaN, 9)
  })

  it('costs mass: a stalk alone weighs the body down and delivers nothing', () => {
    const alone = body([...founderParts(), stalk()])
    expect(alone.caps.mass).toBeGreaterThan(founder.caps.mass)
    expect(alone.caps.senseRange).toBe(founder.caps.senseRange)
  })
})

describe('join: a connector that lets parts hang in chains', () => {
  it('anchors a child at its tip and a grandchild at the child’s tip', () => {
    const { anatomy } = body([
      ...founderParts(),
      part('join', { angle: 0.3 }),
      part('join', { parent: 8, offset: 1 }),
      part('join', { parent: 9, offset: 1 })
    ])
    const joins = anatomy.parts.filter((p) => p.type === 'join')
    expect(joins).toHaveLength(3)
    expect(joins[1]?.x).toBeCloseTo(joins[0]?.tipX ?? NaN, 9)
    expect(joins[2]?.x).toBeCloseTo(joins[1]?.tipX ?? NaN, 9)
    expect(joins[0]?.tipX).not.toBeCloseTo(joins[0]?.x ?? NaN, 3)
  })

  it('changes no capability but mass and upkeep', () => {
    const joined = body([...founderParts(), part('join', { angle: 0.3 })])
    expect(joined.caps.mass).toBeGreaterThan(founder.caps.mass)
    expect(joined.caps.upkeep).toBeGreaterThan(founder.caps.upkeep)
    expect(joined.caps.forwardThrust).toBe(founder.caps.forwardThrust)
    expect(joined.caps.torque).toBe(founder.caps.torque)
    expect(joined.caps.senseRange).toBe(founder.caps.senseRange)
  })

  it('a child of a dormant parent is dormant', () => {
    // a lipid with no digestion is dormant; hang an eye from it
    const noStomach = founderParts().filter((p) => p.type !== 'stomach')
    const { anatomy } = body([
      ...noStomach,
      part('lipid', { angle: 3 }),
      part('eye', { parent: noStomach.length + 1, offset: 0.5 })
    ])
    const lipid = anatomy.parts.find((p) => p.type === 'lipid')
    const hung = anatomy.parts[anatomy.parts.length - 1]
    expect(lipid?.functional).toBe(false)
    expect(hung?.functional).toBe(false)
  })
})

describe('gyro: turning without thrust', () => {
  it('adds torque and nothing to forward or lateral thrust, and costs upkeep and mass', () => {
    const gyro = body([...founderParts(), part('gyro', { size: 0.3 })])
    expect(gyro.caps.torque).toBeGreaterThan(founder.caps.torque)
    expect(gyro.caps.forwardThrust).toBe(founder.caps.forwardThrust)
    expect(gyro.caps.lateralThrust).toBe(founder.caps.lateralThrust)
    expect(gyro.caps.upkeep).toBeGreaterThan(founder.caps.upkeep)
    expect(gyro.caps.mass).toBeGreaterThan(founder.caps.mass)
  })

  it('a more stable gyro turns more and costs more energy', () => {
    const steady = body([...founderParts(), withStat('gyro', 0, 1)])
    const loose = body([...founderParts(), withStat('gyro', 0, 0)])
    expect(steady.caps.torque).toBeGreaterThan(loose.caps.torque)
    expect(steady.caps.upkeep).toBeGreaterThan(loose.caps.upkeep)
  })

  it('without one, the founder turns exactly as before', () => {
    expect(factors(founderParts()).turn).toBe(1)
  })
})

describe('lipid: a store of energy that weighs the body down', () => {
  it('raises energy capacity and lowers speed through its mass', () => {
    const fat = factors([...founderParts(), part('lipid', { size: 0.5, angle: 3 })])
    expect(fat.energyCapacity).toBeGreaterThan(1)
    expect(fat.speed).toBeLessThan(1)
  })

  it('a bigger reserve holds more and weighs more', () => {
    const big = body([...founderParts(), withStat('lipid', 0, 1, { size: 0.5 })])
    const small = body([...founderParts(), withStat('lipid', 0, 0, { size: 0.5 })])
    expect(big.caps.energyCapacity).toBeGreaterThan(small.caps.energyCapacity)
    expect(big.caps.mass).toBeGreaterThan(small.caps.mass)
  })

  it('is dormant without digestion: no capacity, still a cost', () => {
    const noStomach = founderParts().filter((p) => p.type !== 'stomach')
    const without = body(noStomach)
    const withLipid = body([...noStomach, part('lipid', { size: 0.5, angle: 3 })])
    expect(withLipid.anatomy.parts.find((p) => p.type === 'lipid')?.functional).toBe(false)
    expect(withLipid.caps.energyCapacity).toBe(without.caps.energyCapacity)
    expect(withLipid.caps.mass).toBeGreaterThan(without.caps.mass)
    expect(withLipid.caps.upkeep).toBeGreaterThan(without.caps.upkeep)
  })
})

describe('pheromone gland: the mating signal carries further', () => {
  it('raises the signal, more with more potency, and never above the cap', () => {
    const one = body([...founderParts(), part('pheromone', { angle: 3 })]).caps.mateSignal
    const strong = body([...founderParts(), withStat('pheromone', 0, 1, { angle: 3 })]).caps
      .mateSignal
    const many = body([
      ...founderParts(),
      ...[0, 1, 2, 3].map((i) => withStat('pheromone', 0, 1, { size: 0.5, angle: 2 + i * 0.4 }))
    ]).caps.mateSignal
    expect(one).toBeGreaterThan(1)
    expect(strong).toBeGreaterThan(one)
    expect(many).toBe(base.effects.pheromoneCap)
  })

  it('costs upkeep and gives nothing else', () => {
    const gland = body([...founderParts(), part('pheromone', { angle: 3 })])
    expect(gland.caps.upkeep).toBeGreaterThan(founder.caps.upkeep)
    expect(gland.caps.forwardThrust).toBe(founder.caps.forwardThrust)
    expect(gland.caps.senseRange).toBe(founder.caps.senseRange)
  })

  describe('in the world', () => {
    const config: WorldConfig = resolveWorldConfig(
      withoutEcology({ learning: { controller: 'brain' } })
    )
    const adult = (id: number, x: number, glands: number): OrganismState => {
      const parts = founderParts()
      for (let i = 0; i < glands; i++) {
        parts.push(withStat('pheromone', 0, 1, { size: 0.5, angle: 2 + i * 0.4 }))
      }
      const o = organismFor(config, id, { x, y: 100, age: 300, energy: 95 })
      const genome = genomeFromParts({
        id: o.genome.id,
        parentIds: o.genome.parentIds,
        vector: genomeToVector(o.genome),
        architecture: o.genome.brain.architecture,
        weights: o.genome.brain.weights,
        body: founderBodyVector({ ...config.anatomy, founder: parts, structuralBudget: 12 })
      })
      return { ...o, genome }
    }
    const sensed = (organisms: OrganismState[]): MateBuffer => {
      const store = new OrganismStore()
      for (const o of organisms) store.add(o)
      const index = new SpatialHash<OrganismState>(60, (o) => o)
      index.rebuild(store.values())
      const resources = new SpatialHash<ResourceState>(60, (r) => r)
      resources.rebuild([])
      const buffer: MateBuffer = new Map()
      new PerceptionSystem(config, store, resources, new Map(), undefined, null, undefined, {
        organismIndex: index,
        buffer,
        radius: config.reproduction.mateSenseRadius,
        readiness: new ReproductionReadiness(config, null),
        compatible: () => true
      }).update(0)
      return buffer
    }
    const radius = config.reproduction.mateSenseRadius

    it('a partner just beyond the baseline range is heard only if it has a gland', () => {
      const searcher = adult(1, 100, 0)
      const beyond = 100 + radius * 1.3
      expect(sensed([searcher, adult(2, beyond, 0)]).get(1)).toBeNull()
      expect(sensed([searcher, adult(2, beyond, 2)]).get(1)).toMatchObject({ organismId: 2 })
    })

    it('a gland does not help beyond its own reach', () => {
      const searcher = adult(1, 100, 0)
      const tooFar = 100 + radius * (config.anatomy.effects.pheromoneCap + 0.2)
      expect(sensed([searcher, adult(2, tooFar, 4)]).get(1)).toBeNull()
    })

    it('a gland on the searcher does not extend what it hears (it is the sender’s signal)', () => {
      const beyond = 100 + radius * 1.3
      expect(sensed([adult(1, 100, 2), adult(2, beyond, 0)]).get(1)).toBeNull()
    })
  })
})

describe('skeleton: a frame that lets a body carry more', () => {
  const tight = { structuralBudget: 4 }

  it('adds budget for the slots after it', () => {
    const extra = part('flagellum', { size: 1, angle: 2.6, offset: 0.8 })
    const plain = body([...founderParts(), extra], tight)
    expect(plain.anatomy.undeveloped).toHaveLength(1)
    const framed = body(
      [part('skeleton', { size: 0.3, angle: 1 }), ...founderParts(), extra],
      tight
    )
    expect(framed.anatomy.undeveloped).toHaveLength(0)
    expect(framed.anatomy.budget).toBeCloseTo(4 + base.effects.skeletonBudget, 12)
  })

  it('does nothing for a part that comes before it', () => {
    const extra = part('flagellum', { size: 1, angle: 2.6, offset: 0.8 })
    const late = body([...founderParts(), extra, part('skeleton', { size: 0.3, angle: 1 })], tight)
    expect(late.anatomy.undeveloped).toHaveLength(1)
  })

  it('a stiffer skeleton gives more budget, and weighs more', () => {
    const stiff = body([withStat('skeleton', 0, 1), ...founderParts()], tight)
    const soft = body([withStat('skeleton', 0, 0), ...founderParts()], tight)
    expect(stiff.anatomy.budget).toBeGreaterThan(soft.anatomy.budget)
    expect(stiff.caps.mass).toBeGreaterThan(soft.caps.mass)
  })

  it('a body without one has exactly the configured budget', () => {
    expect(body(founderParts(), tight).anatomy.budget).toBe(4)
  })

  it('carries children along its length', () => {
    const { anatomy } = body([
      ...founderParts(),
      part('skeleton', { angle: 1 }),
      part('eye', { parent: 8, offset: 1 })
    ])
    const frame = anatomy.parts.find((p) => p.type === 'skeleton')
    const eye = anatomy.parts[anatomy.parts.length - 1]
    expect(eye?.x).toBeCloseTo(frame?.tipX ?? NaN, 9)
  })
})

describe('every new part type is a valid, finite body part', () => {
  it.each(['eyestalk', 'gyro', 'lipid', 'pheromone', 'skeleton', 'join'] as const)(
    '%s develops, is on or in the outline and keeps every capability finite',
    (type) => {
      for (const gene of [0, 0.5, 1]) {
        const { anatomy, caps } = body([
          ...founderParts(),
          part(type, { stats: [gene, gene, gene, gene, gene, gene], angle: 3 })
        ])
        const added = anatomy.parts[anatomy.parts.length - 1]
        expect(added?.type).toBe(type)
        for (const value of Object.values(caps).flat()) {
          if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true)
        }
        expect(anatomy.sizeUsed).toBeLessThanOrEqual(anatomy.budget)
      }
    }
  )
})
