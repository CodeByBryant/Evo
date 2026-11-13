import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import { GENE_DEFINITIONS } from '@evo/contracts'
import type { GenePath, WorldConfigOverrides } from '@evo/contracts'
import { IdGenerator } from '../../src/entities/IdGenerator'
import { OrganismStore } from '../../src/entities/OrganismStore'
import type { OrganismState } from '../../src/entities/OrganismStore'
import { EventLog } from '../../src/events/EventLog'
import { buildGeneSpecs } from '../../src/genetics/GeneSpecs'
import { GenomeRecombiner } from '../../src/genetics/Recombination'
import { LineageStore } from '../../src/lineage/LineageStore'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'
import { SpatialHash } from '../../src/spatial/SpatialHash'
import { ReproductionSystem } from '../../src/systems/ReproductionSystem'
import { World } from '../../src/index'
import { organismFor, withGenes } from '../support/organism'

// Mate choice (ADR 0027): a partner has to accept too, and a creature has tastes.

const CHOICE: WorldConfigOverrides = {
  learning: { controller: 'reflex' },
  reproduction: { sexes: { enabled: true }, mateChoice: { enabled: true } }
}

interface Pair {
  readonly events: EventLog
  readonly organisms: OrganismStore
  readonly initiator: OrganismState
  readonly others: OrganismState[]
  tick(): void
}

type Genes = Partial<Record<GenePath, number>>

/**
 * A ready female (id 1) with ready males at the given distances (ids 2, 3, ...), all with the genes
 * and energy given. The female is the first to be looked at, so she is the initiator.
 */
function pair(
  extra: WorldConfigOverrides,
  options: {
    initiator?: Genes
    others?: { distance: number; genes?: Genes; energy?: number }[]
    initiatorEnergy?: number
    difference?: number
  } = {}
): Pair {
  const config = resolveWorldConfig({
    ...CHOICE,
    ...extra,
    reproduction: {
      ...(CHOICE.reproduction as object),
      ...(extra.reproduction as object | undefined)
    } as never
  })
  const initiator = withGenes(
    organismFor(config, 1, {
      x: 100,
      y: 100,
      age: 200,
      energy: options.initiatorEnergy ?? 100,
      sex: 0
    }),
    { 'reproduction.choosiness': 0, 'reproduction.preference': 0, ...options.initiator }
  )
  const others = (options.others ?? [{ distance: 5 }]).map((o, i) =>
    withGenes(
      organismFor(config, 2 + i, {
        x: 100 + o.distance,
        y: 100,
        age: 200,
        energy: o.energy ?? 100,
        sex: 1
      }),
      { 'reproduction.choosiness': 0, 'reproduction.preference': 0, ...o.genes }
    )
  )
  const organisms = new OrganismStore()
  organisms.add(initiator)
  for (const o of others) organisms.add(o)
  const index = new SpatialHash<OrganismState>(60, (o) => o)
  index.rebuild(organisms.values())
  const lineage = new LineageStore()
  for (const o of organisms.values()) {
    lineage.register({ genomeId: o.genome.id, parentGenomeIds: [], organismId: o.id, tick: 0 })
  }
  const genomeIds = new IdGenerator()
  for (let i = 0; i < 100; i++) genomeIds.allocate()
  const events = new EventLog(100)
  const system = new ReproductionSystem(
    config,
    organisms,
    index,
    (() => {
      const ids = new IdGenerator()
      for (let i = 0; i < 20; i++) ids.allocate()
      return ids
    })(),
    new GenomeRecombiner(buildGeneSpecs(config), config.genetics, () => genomeIds.allocate()),
    new SeededRandom(deriveStreamWords(1, 'genetics')),
    lineage,
    new SeededRandom(deriveStreamWords(1, 'reproduction')),
    events,
    undefined,
    undefined,
    undefined,
    () => options.difference ?? 0
  )
  return {
    events,
    organisms,
    initiator,
    others,
    tick() {
      events.beginTick()
      system.update(1)
    }
  }
}

/** What the female (id 1) tried; the males look too, afterwards, and are not what these tests ask about. */
const attempts = (p: Pair) =>
  p.events.eventsThisTick().filter((e) => e.type === 'reproduction-attempted' && e.organismId === 1)

describe('a creature that is not choosy accepts anyone', () => {
  it('pairs with the nearest ready partner and a child is born', () => {
    const p = pair({})
    p.tick()
    expect(attempts(p)).toMatchObject([{ succeeded: true, partnerId: 2 }])
    expect(p.organisms.size).toBe(3)
  })
})

describe('choosiness and condition', () => {
  // A fully choosy creature (choosiness 1) wants a score of `threshold` (0.5): a candidate with half
  // its spare energy. One just ready (75 of 100, condition 0) is turned down, a full one is taken.
  const choosy = { 'reproduction.choosiness': 1 } as Genes

  it('turns a poor candidate down, pays the search cost and waits, and nothing is born', () => {
    const p = pair({}, { initiator: choosy, others: [{ distance: 5, energy: 75.5 }] })
    const cfg = resolveWorldConfig(CHOICE)
    p.tick()
    expect(attempts(p)).toMatchObject([{ succeeded: false, failureReason: 'rejected' }])
    expect(p.initiator.energy).toBeCloseTo(100 - cfg.reproduction.mateChoice.searchCost, 9)
    expect(p.initiator.reproductionCooldownRemaining).toBe(cfg.reproduction.mateChoice.retryDelay)
    expect(p.others[0]?.energy).toBe(75.5)
    expect(p.organisms.size).toBe(2)
  })

  it('takes a candidate in full condition (negative)', () => {
    const p = pair({}, { initiator: choosy, others: [{ distance: 5, energy: 100 }] })
    p.tick()
    expect(attempts(p)).toMatchObject([{ succeeded: true, partnerId: 2 }])
  })

  it('a candidate that is not choosy never costs the initiator anything when it is accepted', () => {
    const p = pair({}, { others: [{ distance: 5, energy: 75.5 }] })
    const before = p.initiator.energy
    p.tick()
    // She paid the reproduction cost only, not a search cost.
    const cost = p.initiator.energy
    expect(attempts(p)).toMatchObject([{ succeeded: true }])
    expect(before - cost).toBeGreaterThan(10)
  })
})

describe('acceptance is mutual', () => {
  it('a choosy partner can refuse a creature that would have taken it', () => {
    // She is not choosy, and he is, and she is only just ready (condition 0).
    const p = pair(
      {},
      {
        initiatorEnergy: 75.5,
        others: [{ distance: 5, energy: 100, genes: { 'reproduction.choosiness': 1 } }]
      }
    )
    p.tick()
    expect(attempts(p)).toMatchObject([{ succeeded: false, failureReason: 'rejected' }])
  })

  it('both being easy to please pairs them (negative)', () => {
    const p = pair({}, { initiatorEnergy: 75.5, others: [{ distance: 5, energy: 100 }] })
    p.tick()
    expect(attempts(p)).toMatchObject([{ succeeded: true }])
  })
})

describe('preference for difference', () => {
  const wantsDifferent = {
    'reproduction.choosiness': 1,
    'reproduction.preference': 1
  } as Genes

  it('turns a clone down and takes a stranger', () => {
    const clone = pair({}, { initiator: wantsDifferent, difference: 0 })
    clone.tick()
    expect(attempts(clone)).toMatchObject([{ failureReason: 'rejected' }])
    const stranger = pair({}, { initiator: wantsDifferent, difference: 1 })
    stranger.tick()
    expect(attempts(stranger)).toMatchObject([{ succeeded: true }])
  })

  it('a creature with no taste for difference ignores it (negative)', () => {
    const p = pair(
      {},
      { initiator: { 'reproduction.choosiness': 1, 'reproduction.preference': 0 }, difference: 0 }
    )
    p.tick()
    expect(attempts(p)).toMatchObject([{ succeeded: true }])
  })
})

describe('the search', () => {
  const choosy = { 'reproduction.choosiness': 1 } as Genes
  const poor = { distance: 5, energy: 75.5 }
  const rich = { distance: 20, energy: 100 }

  it('looks at no more than `candidates` of the nearest', () => {
    const one = pair(
      { reproduction: { mateChoice: { enabled: true, candidates: 1 } } as never },
      {
        initiator: choosy,
        others: [poor, rich]
      }
    )
    one.tick()
    expect(attempts(one)).toMatchObject([{ failureReason: 'rejected' }])
    const two = pair(
      { reproduction: { mateChoice: { enabled: true, candidates: 2 } } as never },
      {
        initiator: choosy,
        others: [poor, rich]
      }
    )
    two.tick()
    expect(attempts(two)).toMatchObject([{ succeeded: true, partnerId: 3 }])
  })

  it('with nobody in range it is a plain failure with no cost (negative)', () => {
    const p = pair({}, { initiator: choosy, others: [{ distance: 500 }] })
    p.tick()
    expect(attempts(p)).toMatchObject([{ succeeded: false, failureReason: 'no-partner' }])
    expect(p.initiator.energy).toBe(100)
    expect(p.initiator.reproductionCooldownRemaining).toBe(0)
  })

  it('with mate choice off the genes are ignored: a choosy creature takes the nearest', () => {
    const p = pair(
      { reproduction: { mateChoice: { enabled: false } } as never },
      { initiator: choosy, others: [poor] }
    )
    p.tick()
    expect(attempts(p)).toMatchObject([{ succeeded: true }])
  })
})

describe('the genes', () => {
  it('are the two last scalar genes, start at the configured tastes and stay in [0, 1]', () => {
    const paths = GENE_DEFINITIONS.map((d) => d.path)
    expect(paths.slice(-2)).toEqual(['reproduction.choosiness', 'reproduction.preference'])
    const world = World.create({ seed: 2, config: CHOICE })
    expect(world.snapshot().organisms.length).toBeGreaterThan(0)
    const founder = organismFor(resolveWorldConfig(CHOICE), 1).genome.reproduction
    expect(founder.choosiness).toBeCloseTo(0.3, 12)
    expect(founder.preference).toBeCloseTo(0.3, 12)
    world.run(3000)
    // The world validates itself every tick when asked: ranges are part of what is checked.
    expect(world.validate().ok).toBe(true)
  })
})

describe('configuration', () => {
  it('is off by default, and needs two sexes', () => {
    expect(resolveWorldConfig().reproduction.mateChoice.enabled).toBe(false)
    expect(() => resolveWorldConfig({ reproduction: { mateChoice: { enabled: true } } })).toThrow(
      /requires reproduction.sexes.enabled/
    )
  })

  it('rejects out-of-range tastes, costs and counts, and unknown keys', () => {
    for (const mateChoice of [
      { choosiness: 1.1 },
      { preference: -0.1 },
      { threshold: 0 },
      { threshold: 1.5 },
      { searchCost: -1 },
      { retryDelay: -1 },
      { candidates: 0 },
      { candidates: 1.5 },
      { enabled: 'yes' },
      { taste: 1 }
    ]) {
      expect(() => resolveWorldConfig({ reproduction: { mateChoice } as never })).toThrow()
    }
  })
})

describe('in a world', () => {
  const FROZEN: WorldConfigOverrides = {
    genetics: { mutationRateScale: 0, mutationStrengthScale: 0 }
  }

  it('with every creature easy to please it is the world without mate choice, bit for bit', () => {
    const run = (enabled: boolean): string => {
      const world = World.create({
        seed: 5,
        config: {
          ...FROZEN,
          reproduction: {
            sexes: { enabled: true },
            mateChoice: { enabled, choosiness: 0, preference: 0 }
          }
        }
      })
      world.run(2500)
      expect(world.snapshot().metrics.reproductionSuccesses).toBeGreaterThan(3)
      return world.stateHash()
    }
    expect(run(true)).toBe(run(false))
  })

  it('choosy creatures turn partners down, and the world is deterministic and chunk-invariant', () => {
    const config: WorldConfigOverrides = {
      reproduction: {
        sexes: { enabled: true },
        mateChoice: { enabled: true, choosiness: 0.9, preference: 0.5 }
      }
    }
    const a = World.create({ seed: 6, config })
    let rejected = 0
    for (let t = 0; t < 3000; t++) {
      a.step()
      rejected += a.events
        .eventsThisTick()
        .filter((e) => e.type === 'reproduction-attempted' && e.failureReason === 'rejected').length
    }
    expect(rejected).toBeGreaterThan(0)
    const b = World.create({ seed: 6, config })
    b.run(1000)
    b.run(2000)
    expect(b.stateHash()).toBe(a.stateHash())
  })
})
