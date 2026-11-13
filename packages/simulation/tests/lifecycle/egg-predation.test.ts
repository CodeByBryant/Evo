import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { FounderPart, WorldConfig, WorldConfigOverrides } from '@evo/contracts'
import type { LastBitten, PredationBuffer } from '../../src/buffers/types'
import { ObstacleField } from '../../src/ecology/ObstacleField'
import { EggStore } from '../../src/entities/EggStore'
import type { EggState } from '../../src/entities/EggStore'
import { OrganismStore } from '../../src/entities/OrganismStore'
import type { OrganismState } from '../../src/entities/OrganismStore'
import { ResourceStore } from '../../src/entities/ResourceStore'
import type { ResourceState } from '../../src/entities/ResourceStore'
import { EventLog } from '../../src/events/EventLog'
import { founderBodyVector } from '../../src/genetics/BodyGenes'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import { mouthsOf } from '../../src/organisms/mouths'
import { guardsOf } from '../../src/organisms/eggs'
import { bodyRadiusOf } from '../../src/organisms/traits'
import { SpatialHash } from '../../src/spatial/SpatialHash'
import { EggSystem } from '../../src/systems/EggSystem'
import { InteractionSystem } from '../../src/systems/InteractionSystem'
import { LineageStore } from '../../src/lineage/LineageStore'
import { IdGenerator } from '../../src/entities/IdGenerator'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'
import { organismFor } from '../support/organism'
import { withoutEcology } from '../support/ecology'

// Eggs are food for flesh-eating mouths and are defended by a parent beside them (ADR 0027).

const config = (extra: WorldConfigOverrides = {}): WorldConfig =>
  resolveWorldConfig(
    withoutEcology({
      ...extra,
      learning: { controller: 'reflex' },
      ecology: { health: { enabled: true } },
      predation: { enabled: true },
      reproduction: {
        sexes: { enabled: true },
        eggs: { enabled: true },
        ...extra.reproduction
      } as never
    })
  )

const founderOf = (cfg: WorldConfig): FounderPart[] => cfg.anatomy.founder.map((p) => ({ ...p }))

function withMouth(o: OrganismState, cfg: WorldConfig, jaw: boolean): OrganismState {
  const parts = founderOf(cfg).map((p) =>
    p.type === 'mouth' && jaw
      ? { ...p, stats: [p.stats[0] ?? 0.5, p.stats[1] ?? 0.5, 0.9, 0.5, 0.5, 0.5] }
      : p
  )
  const genome = genomeFromParts({
    id: o.genome.id,
    parentIds: o.genome.parentIds,
    vector: genomeToVector(o.genome),
    architecture: o.genome.brain.architecture,
    weights: o.genome.brain.weights,
    body: founderBodyVector({ ...cfg.anatomy, founder: parts })
  })
  return { ...o, genome }
}

interface Scene {
  readonly biter: OrganismState
  readonly parent: OrganismState
  readonly eggs: EggStore
  readonly events: EventLog
  readonly buffer: PredationBuffer
  readonly lastBitten: LastBitten
  tick(t?: number): void
}

interface Options {
  readonly jaw?: boolean
  /** Whether the egg's mother (id 2) stands beside it. */
  readonly parentAt?: 'beside' | 'far' | 'dead'
  readonly biterIsParent?: boolean
}

/** A biter (id 1) with its mouth 3 units from an egg (id 3) of mother 2 and father 4. */
function scene(cfg: WorldConfig, options: Options = {}): Scene {
  const biter = withMouth(
    organismFor(cfg, 1, { x: 100, y: 100, age: 200, energy: 50, sex: 1 }),
    cfg,
    options.jaw !== false
  )
  const [mouthPoint] = mouthsOf(biter.genome, cfg)
  const radius = bodyRadiusOf(biter.genome, cfg)
  const mouth = {
    x: biter.x + (mouthPoint?.x ?? 0) * radius,
    y: biter.y + (mouthPoint?.y ?? 0) * radius
  }
  const egg: EggState = {
    id: 3,
    x: mouth.x + 3,
    y: mouth.y,
    genome: organismFor(cfg, 9).genome,
    motherId: options.biterIsParent === true ? 1 : 2,
    fatherId: 4,
    speciesId: null,
    energy: 20,
    layTick: 0,
    hatchTick: 200
  }
  const parentX = options.parentAt === 'far' ? egg.x + 200 : egg.x + 2
  const parent = organismFor(cfg, 2, { x: parentX, y: egg.y, age: 200, energy: 50 })
  const organisms = new OrganismStore()
  organisms.add(biter)
  if (options.parentAt !== 'dead') organisms.add(parent)
  const eggs = new EggStore()
  eggs.add(egg)
  const resources = new ResourceStore()
  const resourceIndex = new SpatialHash<ResourceState>(60, (r) => r)
  resourceIndex.rebuild([])
  const organismIndex = new SpatialHash<OrganismState>(60, (o) => o)
  organismIndex.rebuild(organisms.values())
  const events = new EventLog(1000)
  const buffer: PredationBuffer = new Map()
  const lastBitten: LastBitten = new Map()
  const system = new InteractionSystem(
    cfg,
    organisms,
    resources,
    resourceIndex,
    events,
    undefined,
    null,
    new Map(),
    { organismIndex, buffer, lastBitten, obstacles: ObstacleField.empty(), eggs }
  )
  return {
    biter,
    parent,
    eggs,
    events,
    buffer,
    lastBitten,
    tick(t = 1) {
      events.beginTick()
      system.update(t)
    }
  }
}

const ofType = (s: Scene, type: string) => s.events.eventsThisTick().filter((e) => e.type === type)

describe('an unguarded egg is a meal for a jaw', () => {
  it('is eaten whole: gone, its energy in the gut at the trophic loss and the flesh yield', () => {
    const cfg = config()
    const s = scene(cfg, { parentAt: 'far' })
    s.tick()
    expect(s.eggs.size).toBe(0)
    const [event] = ofType(s, 'egg-eaten')
    expect(event).toMatchObject({ type: 'egg-eaten', eggId: 3, predatorId: 1, energyTaken: 20 })
    const expected = 20 * cfg.predation.trophicYield * cfg.predation.fleshYield.jaw
    expect(s.biter.gut).toBeCloseTo(expected, 9)
    expect(ofType(s, 'egg-guarded')).toEqual([])
  })

  it('a dead parent guards nothing: the egg is eaten', () => {
    const s = scene(config(), { parentAt: 'dead' })
    s.tick()
    expect(s.eggs.size).toBe(0)
  })

  it('a mouth with no flesh yield never takes an egg: the founder, a mandible (negative)', () => {
    const s = scene(config(), { jaw: false, parentAt: 'far' })
    s.tick()
    expect(s.eggs.size).toBe(1)
    expect(ofType(s, 'egg-eaten')).toEqual([])
    expect(s.biter.gut).toBe(0)
  })

  it("a creature never eats its own egg (negative: someone else's is eaten)", () => {
    const own = scene(config(), { parentAt: 'far', biterIsParent: true })
    own.tick()
    expect(own.eggs.size).toBe(1)
    const other = scene(config(), { parentAt: 'far' })
    other.tick()
    expect(other.eggs.size).toBe(0)
  })

  it('a full gut refuses the egg and it stays', () => {
    const cfg = config()
    const s = scene(cfg, { parentAt: 'far' })
    s.biter.gut = 1e9
    s.tick()
    expect(s.eggs.size).toBe(1)
  })

  it('eggs are not eaten when the world has no eggs switched on for the system (negative)', () => {
    const cfg = config()
    const s = scene(cfg, { parentAt: 'far' })
    // A system built without the egg store knows of no eggs.
    const organisms = new OrganismStore()
    organisms.add(s.biter)
    const index = new SpatialHash<OrganismState>(60, (o) => o)
    index.rebuild(organisms.values())
    const resourceIndex = new SpatialHash<ResourceState>(60, (r) => r)
    resourceIndex.rebuild([])
    const events = new EventLog(10)
    const system = new InteractionSystem(
      cfg,
      organisms,
      new ResourceStore(),
      resourceIndex,
      events,
      undefined,
      null,
      new Map(),
      {
        organismIndex: index,
        buffer: new Map(),
        lastBitten: new Map(),
        obstacles: ObstacleField.empty()
      }
    )
    events.beginTick()
    system.update(1)
    expect(s.eggs.size).toBe(1)
  })
})

describe('a parent beside its egg guards it', () => {
  it('stops the bite, leaves the egg, hurts the biter and counts it as the guard’s bite', () => {
    const cfg = config()
    const s = scene(cfg, { parentAt: 'beside' })
    s.tick()
    expect(s.eggs.size).toBe(1)
    const [event] = ofType(s, 'egg-guarded')
    expect(event).toMatchObject({ eggId: 3, guardId: 2, biterId: 1 })
    expect(s.biter.gut).toBe(0)
    expect(s.buffer.get(1)?.attackerId).toBe(2)
    expect(s.buffer.get(1)?.damage).toBeGreaterThan(0)
    expect(s.lastBitten.get(1)).toEqual({ attackerId: 2, tick: 1 })
    expect(ofType(s, 'egg-eaten')).toEqual([])
  })

  it('a parent farther than the guard radius does not guard (negative)', () => {
    const cfg = config()
    const s = scene(cfg, { parentAt: 'far' })
    const egg = s.eggs.get(3) as EggState
    const organisms = new OrganismStore()
    organisms.add(s.parent)
    expect(guardsOf(egg, organisms, cfg.reproduction.eggs.guardRadius)).toEqual([])
    const near = organismFor(cfg, 2, { x: egg.x + 5, y: egg.y })
    const nearStore = new OrganismStore()
    nearStore.add(near)
    expect(guardsOf(egg, nearStore, cfg.reproduction.eggs.guardRadius)).toHaveLength(1)
  })

  it('guarding costs the parent guardCost a second, and nothing without an egg beside it', () => {
    const cfg = config({
      reproduction: { eggs: { enabled: true, guardCost: 3 } } as never
    })
    const organisms = new OrganismStore()
    const parent = organismFor(cfg, 2, { x: 10, y: 10, energy: 50 })
    const stranger = organismFor(cfg, 5, { x: 10, y: 10, energy: 50 })
    organisms.add(parent)
    organisms.add(stranger)
    const eggs = new EggStore()
    eggs.add({
      id: 6,
      x: 12,
      y: 10,
      genome: organismFor(cfg, 9).genome,
      motherId: 2,
      fatherId: 4,
      speciesId: null,
      energy: 20,
      layTick: 0,
      hatchTick: 500
    })
    const system = new EggSystem(
      cfg,
      organisms,
      eggs,
      new IdGenerator(),
      new LineageStore(),
      new SeededRandom(deriveStreamWords(1, 'reproduction')),
      new EventLog(10),
      { assign: () => null, release: () => undefined, speciesOf: () => undefined }
    )
    system.update(1)
    expect(parent.energy).toBeCloseTo(50 - 3 * cfg.timestep, 9)
    expect(stranger.energy).toBe(50)
  })
})
