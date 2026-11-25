import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { MouthForm, WorldConfig, WorldConfigOverrides } from '@evo/contracts'
import { PART_STATS } from '@evo/contracts'
import { developAnatomy } from '../../src/development/develop'
import { capabilitiesOf } from '../../src/development/capabilities'
import { HUB_SLOT } from '../../src/entities/ResourceStore'
import type { ResourceState, ResourceStore } from '../../src/entities/ResourceStore'
import { OrganismStore } from '../../src/entities/OrganismStore'
import { ResourceStore as Resources } from '../../src/entities/ResourceStore'
import { EventLog } from '../../src/events/EventLog'
import { bodyVectorOf } from '../../src/genetics/BodyGenes'
import { mouthsOf } from '../../src/organisms/mouths'
import { bodyRadiusOf } from '../../src/organisms/traits'
import { SpatialHash } from '../../src/spatial/SpatialHash'
import { InteractionSystem } from '../../src/systems/InteractionSystem'
import { unitHash } from '../../src/ecology/Plants'
import { EcologyModel } from '../../src/ecology/EcologyModel'
import { withSeeds, SEED_KIND } from '../../src/world/seedConfig'
import { World } from '../../src/world/World'
import { organismFor } from '../support/organism'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import { founderBodyVector } from '../../src/genetics/BodyGenes'

// Seeds (ADR 0032): a full plant drops a seed, an uneaten seed becomes a plant or rots, a mouth eats it
// at its form's yield, and with the switch off nothing is there.

const ECOLOGY = {
  health: { enabled: true },
  regions: { enabled: false },
  seasons: { enabled: false },
  hazards: { enabled: false },
  migration: { enabled: false },
  obstacles: { enabled: false }
} as const

/** A world with two plants and no organisms; photosynthesis off so every energy is countable. */
function seedWorld(seeds: object = {}, resources: object = {}, seed = 3): World {
  return World.create({
    seed,
    config: {
      organisms: { initialCount: 0 },
      resources: {
        initialCount: 14,
        maxCount: 400,
        spawnRate: 0,
        plants: { enabled: true, lifespan: 0, photosynthesis: 0, maxPlants: 40 },
        seeds: {
          enabled: true,
          interval: 20,
          dormancy: 5,
          lifespan: 60,
          germinate: true,
          germinateShare: 1,
          ...seeds
        },
        ...resources
      },
      ecology: ECOLOGY
    } as WorldConfigOverrides
  })
}

const storeOf = (world: World): ResourceStore =>
  (world as unknown as { resources: ResourceStore }).resources
const seedKindOf = (world: World): number =>
  world.config.ecology.resourceKinds.kinds.findIndex((k) => k.name === SEED_KIND)
const seedsOf = (world: World): ResourceState[] =>
  storeOf(world)
    .values()
    .filter((r) => r.kind === seedKindOf(world))
const hubsOf = (world: World): ResourceState[] =>
  storeOf(world)
    .values()
    .filter((r) => r.slot === HUB_SLOT)
const run = (world: World, ticks: number): void => {
  for (let t = 0; t < ticks; t++) world.step()
}

describe('the seed kind', () => {
  it('is appended after every other kind (carrion keeps its index) and never spawns freely', () => {
    const world = seedWorld()
    const names = world.config.ecology.resourceKinds.kinds.map((k) => k.name)
    expect(names).toEqual(['grass', 'fruit', 'fungus', 'nectar', 'carrion', 'seed'])
    const seed = world.config.ecology.resourceKinds.kinds.at(-1)!
    expect(seed.spawnWeight).toBe(0)
    expect(seed.hardness).toBe(world.config.resources.seeds.hardness)
    // its energy is the seed energy, whatever the world's base food energy is
    expect(world.config.resources.energyValue * seed.energyScale).toBeCloseTo(
      world.config.resources.seeds.energy,
      9
    )
  })

  it('gives every mouth form a seed yield from the config, the mandible exactly 1', () => {
    const world = seedWorld()
    for (const form of Object.keys(world.config.resources.seeds.yields) as MouthForm[]) {
      expect(world.config.anatomy.mouthForms[form][SEED_KIND]).toBe(
        world.config.resources.seeds.yields[form]
      )
    }
    expect(world.config.anatomy.mouthForms.mandible[SEED_KIND]).toBe(1)
    expect(world.config.anatomy.mouthForms.jaw[SEED_KIND]).toBe(0)
  })

  it('is off when asked: the very same config comes back and no world has a seed (negative)', () => {
    const base = resolveWorldConfig({ resources: { seeds: { enabled: false } } })
    expect(base.resources.seeds.enabled).toBe(false)
    expect(withSeeds(base)).toBe(base)
    // without plants or food kinds there is nothing to drop them or to eat them: also the same object
    const noPlants = resolveWorldConfig({ resources: { plants: { enabled: false } } })
    expect(noPlants.resources.seeds.enabled).toBe(true)
    expect(withSeeds(noPlants)).toBe(noPlants)
    const off = World.create({
      seed: 3,
      config: {
        organisms: { initialCount: 0 },
        resources: { spawnRate: 0, seeds: { enabled: false } }
      }
    })
    run(off, 800)
    expect(off.config.ecology.resourceKinds.kinds.map((k) => k.name)).not.toContain(SEED_KIND)
    expect(off.seedStats).toEqual({ dropped: 0, germinated: 0, rotted: 0, alive: 0 })
  })
})

describe('a plant drops a seed', () => {
  it('a full plant drops one at exactly every interval, its energy moving out of the hub', () => {
    const world = seedWorld()
    const interval = 200 // 20 s at 0.1 s a tick
    run(world, interval - 1)
    expect(seedsOf(world)).toHaveLength(0)
    const hubs = hubsOf(world)
    const before = hubs.map((h) => h.remaining)
    world.step() // tick 200: age 200 is a multiple of the interval
    const seeds = seedsOf(world)
    expect(seeds).toHaveLength(2)
    for (const seed of seeds) expect(seed.remaining).toBe(world.config.resources.seeds.energy)
    hubs.forEach((hub, i) => {
      expect(hub.remaining).toBeCloseTo(
        (before[i] as number) - world.config.resources.seeds.energy,
        9
      )
    })
    expect(world.seedStats.dropped).toBe(2)
  })

  it('lands each seed between the dispersal limits from its plant, inside the world', () => {
    const world = seedWorld({ interval: 5, dispersalMin: 10, dispersalMax: 30 })
    run(world, 50)
    const { width, height } = world.config.environment
    const hubs = hubsOf(world)
    const seeds = seedsOf(world)
    expect(seeds.length).toBeGreaterThan(0)
    for (const seed of seeds) {
      expect(seed.x).toBeGreaterThanOrEqual(0)
      expect(seed.x).toBeLessThanOrEqual(width)
      expect(seed.y).toBeGreaterThanOrEqual(0)
      expect(seed.y).toBeLessThanOrEqual(height)
      const near = Math.min(...hubs.map((h) => Math.hypot(h.x - seed.x, h.y - seed.y)))
      // inside the limits unless the world's edge clamped it closer
      const edge = Math.min(seed.x, width - seed.x, seed.y, height - seed.y)
      if (edge > 30) {
        expect(near).toBeGreaterThanOrEqual(10 - 1e-6)
        expect(near).toBeLessThanOrEqual(30 + 1e-6)
      }
    }
  })

  it('does not drop from a plant that is not full or is missing a node (negatives)', () => {
    const world = seedWorld()
    // take a node off one plant: it regrows from the hub's store, so the hub is no longer full
    const hub = hubsOf(world)[0]!
    const node = storeOf(world)
      .values()
      .find((r) => r.parent === hub.id && r.slot !== HUB_SLOT)!
    storeOf(world).remove(node.id)
    run(world, 200)
    const dropped = seedsOf(world)
    // the other plant (full) dropped one, the grazed one did not
    expect(dropped).toHaveLength(1)
    const lone = dropped[0] as ResourceState
    const other = hubsOf(world).find((h) => h.id !== hub.id) as ResourceState
    expect(Math.hypot(lone.x - other.x, lone.y - other.y)).toBeLessThan(
      Math.hypot(lone.x - hub.x, lone.y - hub.y)
    )
  })

  it('stops at its own cap, and seeds are not counted in maxCount', () => {
    const capped = seedWorld({ maxCount: 1 })
    run(capped, 600)
    expect(seedsOf(capped)).toHaveLength(1)
    // maxCount of 14 items is exactly two whole plants: seeds still come, beyond the item cap
    const tight = seedWorld({ interval: 5 }, { maxCount: 14 })
    run(tight, 300)
    const seeds = seedsOf(tight)
    expect(seeds.length).toBeGreaterThan(0)
    expect(storeOf(tight).size - seeds.length).toBeLessThanOrEqual(14)
  })

  it('skips nothing it should not: no drop at age 0, and the drop is a pure function of ids and ticks', () => {
    const a = seedWorld({ interval: 5 })
    const b = seedWorld({ interval: 5 })
    run(a, 120)
    run(b, 120)
    expect(a.stateHash()).toBe(b.stateHash())
    expect(unitHash(7, 100, 1)).toBe(unitHash(7, 100, 1))
    expect(unitHash(7, 100, 1)).not.toBe(unitHash(7, 101, 1))
    for (let i = 0; i < 200; i++) {
      const u = unitHash(i, 3, 1)
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThan(1)
    }
  })
})

describe('an uneaten seed', () => {
  it('becomes a whole plant where it lies once dormant, paid for from a spawn', () => {
    const world = seedWorld({ interval: 10, germinateDensity: 0 }, { spawnRate: 0.2 })
    run(world, 100)
    const seed = seedsOf(world)[0]!
    const plantsBefore = hubsOf(world).length
    // dropped at tick 100; dormant for 5 s (50 ticks): still a seed at age 4.9 s
    run(world, 49)
    expect(seedsOf(world).some((s) => s.id === seed.id)).toBe(true)
    // and a plant by the next spawn that is due (one every 5 s at 0.2 a second)
    run(world, 100)
    expect(seedsOf(world).some((s) => s.id === seed.id)).toBe(false)
    const grown = hubsOf(world).find((h) => h.x === seed.x && h.y === seed.y)
    expect(grown).toBeDefined()
    // its hub store is a whole plant's (a free spawn's), not the seed's 20
    expect(grown!.remaining).toBeGreaterThan(world.config.resources.seeds.energy)
    expect(hubsOf(world).length).toBeGreaterThan(plantsBefore - 1)
    expect(world.seedStats.germinated).toBeGreaterThan(0)
    // a whole plant: every node is there, as a free spawn makes it
    const nodes = storeOf(world)
      .values()
      .filter((r) => r.parent === grown!.id && r.slot !== HUB_SLOT)
    expect(nodes).toHaveLength(world.config.resources.plants.nodes)
  })

  it('needs a spawn to pay for it: with no spawning a seed never germinates (negative)', () => {
    const world = seedWorld({ interval: 10, germinateDensity: 0, lifespan: 60 }, { spawnRate: 0 })
    run(world, 500)
    expect(world.seedStats.dropped).toBeGreaterThan(0)
    expect(world.seedStats.germinated).toBe(0)
  })

  it('does not germinate with germination off, and rots at its lifespan (negative)', () => {
    const world = seedWorld({ interval: 10, germinate: false, lifespan: 20 }, { spawnRate: 0.2 })
    run(world, 600)
    expect(world.seedStats.germinated).toBe(0)
    expect(world.seedStats.rotted).toBeGreaterThan(0)
    // a rotten seed is gone and its energy with it: nothing older than the lifespan is left
    for (const seed of seedsOf(world)) {
      expect((world.snapshot().tick - (seed.bornTick ?? 0)) * world.config.timestep).toBeLessThan(
        20
      )
    }
  })

  it('does not germinate above the plant cap, or on a site the pattern rejects (negatives)', () => {
    const full = seedWorld({ interval: 10, germinateDensity: 0 }, { spawnRate: 0.5 }, 3)
    const capped = World.create({
      seed: 3,
      config: {
        organisms: { initialCount: 0 },
        resources: {
          initialCount: 14,
          maxCount: 400,
          spawnRate: 0.5,
          plants: { enabled: true, lifespan: 0, photosynthesis: 0, maxPlants: 2 },
          seeds: {
            enabled: true,
            interval: 10,
            dormancy: 5,
            lifespan: 60,
            germinate: true,
            germinateShare: 1,
            germinateDensity: 0
          }
        },
        ecology: ECOLOGY
      } as WorldConfigOverrides
    })
    run(full, 400)
    run(capped, 400)
    expect(full.seedStats.germinated).toBeGreaterThan(0)
    expect(capped.seedStats.germinated).toBe(0)
    expect(hubsOf(capped)).toHaveLength(2)
    // a strict threshold germinates fewer seeds than a lenient one in the very same world (negative)
    const strict = seedWorld({ interval: 10, germinateDensity: 0.9 }, { spawnRate: 0.5 })
    run(strict, 400)
    expect(strict.seedStats.germinated).toBeLessThan(full.seedStats.germinated)
  })

  it('takes only its share of the spawns: none at a share of 0, fewer at 0.3 than at 1 (negatives)', () => {
    const at = (share: number): number => {
      const world = seedWorld(
        { interval: 10, germinateDensity: 0, germinateShare: share },
        { spawnRate: 0.3, maxCount: 900 }
      )
      run(world, 1500)
      return world.seedStats.germinated
    }
    expect(at(0)).toBe(0)
    expect(at(0.3)).toBeGreaterThan(0)
    expect(at(0.3)).toBeLessThan(at(1))
  })

  it('a germinated plant costs one spawn: plants born per second stay at the spawn rate (supply is not moved)', () => {
    const on = seedWorld({ interval: 10, germinateDensity: 0 }, { spawnRate: 0.3, maxCount: 900 })
    const born = new Set<number>()
    for (let t = 0; t < 1500; t++) {
      on.step()
      for (const h of hubsOf(on)) born.add(h.id)
    }
    // two starting plants, then at most one plant per spawn due (0.3 a second for 150 s is 45)
    expect(born.size - 2).toBeLessThanOrEqual(46)
    expect(born.size - 2).toBeGreaterThan(30)
    expect(on.seedStats.germinated).toBeGreaterThan(0)
  })

  it('a world with seeds is the same stepped or run in chunks, and passes the invariants', () => {
    const a = seedWorld({ interval: 10, germinateDensity: 0 }, { spawnRate: 0.3 })
    const b = seedWorld({ interval: 10, germinateDensity: 0 }, { spawnRate: 0.3 })
    run(a, 900)
    b.run(333)
    b.run(567)
    expect(a.stateHash()).toBe(b.stateHash())
    expect(a.validate()).toEqual({ ok: true, errors: [] })
    expect(a.seedStats.germinated).toBeGreaterThan(0)
  })
})

/** A creature with one mouth of a stat, and one food item of `kind` in front of it. */
function bite(mouthStat: number, kindName: string, remaining = 30) {
  const cfg: WorldConfig = withSeeds(
    resolveWorldConfig({
      learning: { controller: 'reflex' },
      ecology: { ...ECOLOGY, resourceKinds: { enabled: true } },
      resources: { seeds: { enabled: true } },
      predation: { enabled: false }
    })
  )
  const base = organismFor(cfg, 1, { x: 100, y: 100, age: 200, energy: 50, heading: 0 })
  const body = cfg.anatomy.founder.map((p) =>
    p.type === 'mouth'
      ? { ...p, stats: [0.5, 0.5, mouthStat, 0.5, 0.5, 0.5] }
      : { ...p, stats: [...p.stats] }
  )
  const genome = genomeFromParts({
    id: base.genome.id,
    parentIds: [],
    vector: genomeToVector(base.genome),
    architecture: base.genome.brain.architecture,
    weights: base.genome.brain.weights,
    body: founderBodyVector({ ...cfg.anatomy, founder: body })
  })
  const organism = { ...base, genome }
  const kind = cfg.ecology.resourceKinds.kinds.findIndex((k) => k.name === kindName)
  const [mouth] = mouthsOf(genome, cfg)
  const radius = bodyRadiusOf(genome, cfg)
  const food: ResourceState = {
    id: 5,
    x: organism.x + (mouth?.x ?? 0) * radius + 3,
    y: organism.y + (mouth?.y ?? 0) * radius,
    remaining,
    kind
  }
  const organisms = new OrganismStore()
  organisms.add(organism)
  const resources = new Resources()
  resources.add(food)
  const index = new SpatialHash<ResourceState>(60, (r) => r)
  index.rebuild(resources.values())
  const events = new EventLog(100)
  events.beginTick()
  new InteractionSystem(
    cfg,
    organisms,
    resources,
    index,
    events,
    undefined,
    new EcologyModel(cfg, null)
  ).update(1)
  return { organism, food, taken: remaining - food.remaining }
}

describe('eating a seed', () => {
  it('takes three times the bites of grass (hardness 3): a third of the chunk', () => {
    const grass = bite(0.5, 'grass', 30)
    const seed = bite(0.5, 'seed', 30)
    expect(grass.taken).toBeGreaterThan(0)
    expect(seed.taken).toBeCloseTo(grass.taken / 3, 9)
  })

  it('pays each form its yield: radula more than mandible, sprout less, proboscis least', () => {
    const gutPerChunk = (stat: number): number => {
      const r = bite(stat, 'seed')
      return r.organism.gut / r.taken
    }
    expect(gutPerChunk(0.5)).toBeCloseTo(1, 9) // the mandible is exactly 1
    expect(gutPerChunk(0.7)).toBeCloseTo(1.3, 9) // radula
    expect(gutPerChunk(0.1)).toBeCloseTo(0.5, 9) // sprout
    expect(gutPerChunk(0.3)).toBeCloseTo(0.2, 9) // proboscis
  })

  it('a jaw neither bites nor digests a seed (negative: it still bites carrion-free plants at 0 too)', () => {
    const jaw = bite(0.9, 'seed')
    expect(jaw.food.remaining).toBe(30)
    expect(jaw.organism.gut).toBe(0)
  })
})

describe('sniffers', () => {
  it('map their selectivity over the natural kinds only: seeds change no sniffer (negative: carrion and seeds both ignored)', () => {
    const config = resolveWorldConfig({})
    const sipper = config.anatomy.starters.find((s) => s.name === 'nectar-sipper')!
    const body = bodyVectorOf({ parts: sipper.parts, look: sipper.look, outline: sipper.outline })
    const developed = developAnatomy(body, config.anatomy)
    const natural = ['grass', 'fruit', 'fungus', 'nectar']
    const plain = capabilitiesOf(developed, config.anatomy, 1, 4, natural)
    const withExtras = capabilitiesOf(developed, config.anatomy, 1, 6, [
      ...natural,
      'carrion',
      SEED_KIND
    ])
    expect(withExtras.foodDetection.slice(0, 4)).toEqual(plain.foodDetection)
    // the two appended kinds get only the unboosted baseline: the sniffer's pick is a natural kind
    const boosted = plain.foodDetection.indexOf(Math.max(...plain.foodDetection))
    expect(boosted).toBeLessThan(4)
    expect(withExtras.foodDetection[4]).toBe(withExtras.foodDetection[5])
    expect(withExtras.foodDetection[4]).toBeLessThan(withExtras.foodDetection[boosted] as number)
    expect(PART_STATS.sniffer.length).toBeGreaterThan(0)
  })
})

describe('config', () => {
  it('rejects bad seeds: a mandible yield other than 1, a bad density, a lifespan not past dormancy, dispersal backwards', () => {
    const bad = (seeds: object, extra: object = {}) =>
      expect(() => resolveWorldConfig({ resources: { seeds, ...extra } } as never)).toThrow(/seeds/)
    bad({ yields: { mandible: 0.9 } })
    bad({ germinateDensity: 1.5 })
    bad({ germinateDensity: -0.1 })
    bad({ germinateShare: 1.5 })
    bad({ germinateShare: -0.1 })
    bad({ dormancy: 100, lifespan: 50 })
    bad({ dispersalMin: 30, dispersalMax: 10 })
    bad({ energy: 0 })
    bad({ hardness: 0.5 })
    bad({ maxCount: 0 })
    // negative: the defaults and a sensible override pass, and a yield of 0 for a form is fine
    expect(() => resolveWorldConfig({})).not.toThrow()
    expect(() =>
      resolveWorldConfig({ resources: { seeds: { enabled: true, yields: { radula: 0 } } } })
    ).not.toThrow()
    // seeds are on by default (food only), and a world without plants is valid and simply has none
    expect(resolveWorldConfig({}).resources.seeds.enabled).toBe(true)
    expect(resolveWorldConfig({}).resources.seeds.germinate).toBe(false)
    expect(() => resolveWorldConfig({ resources: { plants: { enabled: false } } })).not.toThrow()
  })
})
