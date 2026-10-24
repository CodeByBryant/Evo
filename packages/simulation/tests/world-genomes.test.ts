import { describe, expect, it } from 'vitest'
import { World } from '../src/index'
import { genomeToVector } from '../src/genetics/GenomeFactory'

/** The world wiring of genomes (docs/decisions/0006); Phase 3 behavior is pinned in world.test.ts. */
describe('founders carry genomes', () => {
  const world = World.create({ seed: 1, config: { organisms: { initialCount: 5 } } })
  const snapshot = world.snapshot()

  it('gives every founder its own genome, in birth order', () => {
    expect(snapshot.organisms.map((o) => o.genomeId)).toEqual([0, 1, 2, 3, 4])
  })

  it('makes the genome available by organism id', () => {
    for (const organism of snapshot.organisms) {
      expect(world.genomeOf(organism.id)?.id).toBe(organism.genomeId)
    }
    expect(world.genomeOf(9999)).toBeUndefined()
  })

  it('has no parents', () => {
    for (const organism of snapshot.organisms) {
      expect(world.genomeOf(organism.id)?.parentIds).toEqual([])
    }
  })

  it('starts every founder at the same scalar genes, but with its own brain', () => {
    const genomes = snapshot.organisms.map((o) => world.genomeOf(o.id)!)
    const first = genomeToVector(genomes[0]!)
    for (const genome of genomes) {
      expect(genomeToVector(genome)).toEqual(first)
    }
    const brains = new Set(genomes.map((g) => g.brain.weights.join(',')))
    expect(brains.size).toBe(5)
    expect(genomes[0]?.brain.weights).toHaveLength(249)
  })

  it('records the founder genome on its birth event', () => {
    const born = world.events.list().filter((e) => e.type === 'organism-born')
    expect(born.map((e) => (e.type === 'organism-born' ? e.genomeId : -1))).toEqual([0, 1, 2, 3, 4])
  })

  it('hands out immutable genomes', () => {
    const genome = world.genomeOf(snapshot.organisms[0]!.id)!
    expect(Object.isFrozen(genome)).toBe(true)
    expect(() => {
      ;(genome.physical as { maxSpeed: number }).maxSpeed = 1
    }).toThrow(TypeError)
  })
})

describe('config baselines reach the genes', () => {
  it('starts every founder at the configured baseline', () => {
    const world = World.create({
      seed: 3,
      config: {
        organisms: { initialCount: 4, maxSpeed: 27, sensorRadius: 90, radius: 3, hue: 0.2 },
        reproduction: { cooldown: 12, offspringInvestment: 9 }
      }
    })
    for (const organism of world.snapshot().organisms) {
      const genome = world.genomeOf(organism.id)!
      expect(genome.physical.maxSpeed).toBe(27)
      expect(genome.sensory.sensorRadius).toBe(90)
      expect(genome.physical.radius).toBe(3)
      expect(genome.physical.hue).toBe(0.2)
      expect(genome.reproduction.cooldown).toBe(12)
      expect(genome.reproduction.offspringInvestment).toBe(9)
    }
  })

  it('reports the organism’s own radius gene in the snapshot', () => {
    const world = World.create({ seed: 3, config: { organisms: { initialCount: 2, radius: 4 } } })
    for (const organism of world.snapshot().organisms) expect(organism.radius).toBe(4)
  })
})

describe('children get new genomes', () => {
  const world = World.create({
    seed: 42,
    config: {
      environment: { width: 100, height: 100 },
      organisms: {
        initialCount: 2,
        initialEnergy: 100,
        maturityAge: 0.05,
        senescenceAge: 1000,
        maxAge: 2000
      },
      resources: { initialCount: 0, spawnRate: 0 },
      reproduction: {
        minEnergy: 60,
        offspringInvestment: 10,
        overheadFraction: 0,
        cooldown: 5,
        searchRadius: 1000
      }
    }
  })
  world.run(1)
  const snapshot = world.snapshot()
  const child = snapshot.organisms[2]!

  it('allocates the next genome id and links it to both parent genomes', () => {
    expect(child.genomeId).toBe(2)
    expect(world.genomeOf(child.id)?.parentIds).toEqual([0, 1])
  })

  it('copies the mother’s genes while inheritance is not yet heritable', () => {
    const mother = world.genomeOf(snapshot.organisms[0]!.id)!
    const childGenome = world.genomeOf(child.id)!
    expect(genomeToVector(childGenome)).toEqual(genomeToVector(mother))
    expect(childGenome.brain.weights).toEqual(mother.brain.weights)
    expect(childGenome).not.toBe(mother)
  })

  it('records the child genome on its birth event', () => {
    const born = world.events
      .list()
      .find((e) => e.type === 'organism-born' && e.organismId === child.id)
    expect(born).toMatchObject({ genomeId: 2, parentIds: [0, 1] })
  })

  it('stays valid', () => {
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })
})

describe('genome identity over a long run', () => {
  const world = World.create({
    seed: 1,
    validateEveryTicks: 250,
    config: { history: { maxEvents: 200_000 } }
  })
  world.run(4000)

  it('never repeats a genome id among living organisms', () => {
    const ids = world.snapshot().organisms.map((o) => o.genomeId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps the genome id on the historical record of an organism that died', () => {
    const records = world.historicalOrganisms()
    expect(records.length).toBeGreaterThan(0)
    const birthGenomes = new Map<number, number>()
    for (const event of world.events.list()) {
      if (event.type === 'organism-born') birthGenomes.set(event.organismId, event.genomeId)
    }
    for (const record of records) {
      expect(Number.isInteger(record.genomeId)).toBe(true)
      expect(record.genomeId).toBe(birthGenomes.get(record.id))
    }
  })

  it('keeps every living genome valid', () => {
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })
})

describe('genomes are part of the state hash', () => {
  it('differs when only the founders’ brains differ', () => {
    const a = World.create({ seed: 1, config: { organisms: { initialCount: 3 } } })
    const b = World.create({
      seed: 1,
      config: { organisms: { initialCount: 3 }, genetics: { brain: { initialWeightStd: 0.5 } } }
    })
    expect(a.stateHash()).not.toBe(b.stateHash())
  })

  it('is reproducible for the same seed and configuration', () => {
    const a = World.create({ seed: 8, config: { organisms: { initialCount: 3 } } })
    const b = World.create({ seed: 8, config: { organisms: { initialCount: 3 } } })
    a.run(300)
    b.run(300)
    expect(a.stateHash()).toBe(b.stateHash())
  })
})
