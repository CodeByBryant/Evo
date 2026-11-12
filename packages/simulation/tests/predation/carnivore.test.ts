import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { FounderPart, WorldConfig, WorldConfigOverrides } from '@evo/contracts'
import type { PerceptionBuffer } from '../../src/buffers/types'
import { OrganismStore } from '../../src/entities/OrganismStore'
import type { OrganismState } from '../../src/entities/OrganismStore'
import { ResourceStore } from '../../src/entities/ResourceStore'
import type { ResourceState } from '../../src/entities/ResourceStore'
import { EventLog } from '../../src/events/EventLog'
import { founderBodyVector } from '../../src/genetics/BodyGenes'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import { mouthsOf } from '../../src/organisms/mouths'
import { bodyRadiusOf } from '../../src/organisms/traits'
import { SpatialHash } from '../../src/spatial/SpatialHash'
import { InteractionSystem } from '../../src/systems/InteractionSystem'
import { PerceptionSystem } from '../../src/systems/PerceptionSystem'
import { withCarrion } from '../../src/world/predationConfig'
import { World } from '../../src/world/World'
import { withoutEcology } from '../support/ecology'
import { organismFor } from '../support/organism'

// The jaw is a carnivore (ADR 0023, step three): it takes nothing from plants, so it neither bites
// nor sees them, and lives on creatures and carrion. Every other mouth is unchanged.

const config = (extra: WorldConfigOverrides = {}): WorldConfig =>
  withCarrion(
    resolveWorldConfig(
      withoutEcology({
        ...extra,
        learning: { controller: 'reflex' },
        // Food kinds on: the per-kind yields are what make a jaw a carnivore.
        ecology: { health: { enabled: true }, resourceKinds: { enabled: true }, ...extra.ecology },
        predation: { enabled: true, ...extra.predation }
      })
    )
  )

const GRASS = 0

function body(cfg: WorldConfig, jaw: boolean): FounderPart[] {
  return cfg.anatomy.founder.map((p) =>
    p.type === 'mouth'
      ? { ...p, stats: [0.5, 0.5, jaw ? 0.9 : 0.5, 0.5, 0.5, 0.5] }
      : { ...p, stats: [...p.stats] }
  )
}

function creature(cfg: WorldConfig, jaw: boolean, overrides: Partial<OrganismState> = {}) {
  const base = organismFor(cfg, 1, {
    x: 100,
    y: 100,
    age: 200,
    energy: 50,
    heading: 0,
    ...overrides
  })
  const genome = genomeFromParts({
    id: base.genome.id,
    parentIds: [],
    vector: genomeToVector(base.genome),
    architecture: base.genome.brain.architecture,
    weights: base.genome.brain.weights,
    body: founderBodyVector({ ...cfg.anatomy, founder: body(cfg, jaw) })
  })
  return { ...base, genome }
}

/** One creature and one piece of food of a kind, a few units in front of its mouth. */
function eat(jaw: boolean, kind: number) {
  const cfg = config()
  const organism = creature(cfg, jaw)
  const [mouth] = mouthsOf(organism.genome, cfg)
  const radius = bodyRadiusOf(organism.genome, cfg)
  const mx = organism.x + (mouth?.x ?? 0) * radius
  const my = organism.y + (mouth?.y ?? 0) * radius
  const food: ResourceState = { id: 5, x: mx + 3, y: my, remaining: 30, kind }
  const organisms = new OrganismStore()
  organisms.add(organism)
  const resources = new ResourceStore()
  resources.add(food)
  const index = new SpatialHash<ResourceState>(60, (r) => r)
  index.rebuild(resources.values())
  const events = new EventLog(100)
  events.beginTick()
  new InteractionSystem(cfg, organisms, resources, index, events).update(1)
  return { organism, food, events, cfg }
}

const carrionOf = (cfg: WorldConfig): number =>
  cfg.ecology.resourceKinds.kinds.findIndex((k) => k.name === 'carrion')

describe('what a mouth bites', () => {
  it('a jaw does not bite a plant: the plant is untouched and the gut stays empty', () => {
    const { organism, food, events } = eat(true, GRASS)
    expect(food.remaining).toBe(30)
    expect(organism.gut).toBe(0)
    expect(events.eventsThisTick().some((e) => e.type === 'resource-bitten')).toBe(false)
  })

  it('a jaw bites carrion: it is meat', () => {
    const cfg = config()
    const { organism, food, events } = eat(true, carrionOf(cfg))
    expect(food.remaining).toBeLessThan(30)
    expect(organism.gut).toBeGreaterThan(0)
    expect(events.eventsThisTick().some((e) => e.type === 'resource-bitten')).toBe(true)
  })

  it('a mandible still bites the same plant (negative: only the jaw changed)', () => {
    const { organism, food } = eat(false, GRASS)
    expect(food.remaining).toBeLessThan(30)
    expect(organism.gut).toBeGreaterThan(0)
  })
})

describe('what a creature sees as food', () => {
  function see(jaw: boolean, kind: number, occluding: boolean): number | null {
    const cfg = config()
    const viewer = creature(cfg, jaw)
    const organisms = new OrganismStore()
    organisms.add(viewer)
    const resources = new ResourceStore()
    resources.add({ id: 7, x: viewer.x + 25, y: viewer.y, remaining: 30, kind })
    const index = new SpatialHash<ResourceState>(60, (r) => r)
    index.rebuild(resources.values())
    const buffer: PerceptionBuffer = new Map()
    new PerceptionSystem(
      cfg,
      organisms,
      index,
      buffer,
      undefined,
      null,
      undefined,
      undefined,
      occluding ? {} : undefined
    ).update(0)
    return buffer.get(1)?.resourceId ?? null
  }

  it.each([false, true])(
    'a jaw does not see a plant but sees carrion; a mandible sees both (occluding search: %s)',
    (occluding) => {
      const carrion = carrionOf(config())
      expect(see(true, GRASS, occluding)).toBeNull()
      expect(see(true, carrion, occluding)).toBe(7)
      expect(see(false, GRASS, occluding)).toBe(7)
      expect(see(false, carrion, occluding)).toBe(7)
    }
  )
})

describe('in a world', () => {
  /** Plant bites by creatures whose every working mouth is a jaw, and bites on creatures by anyone. */
  function watch(seed: number, extra: WorldConfigOverrides, ticks: number) {
    const world = World.create({ seed, config: extra })
    const carrion = world.config.ecology.resourceKinds.kinds.findIndex((k) => k.name === 'carrion')
    const jawOnly = new Map<number, boolean>()
    let plantBitesByJaws = 0
    let carrionBitesByJaws = 0
    let creatureBites = 0
    for (let t = 0; t < ticks; t++) {
      world.step()
      for (const e of world.events.eventsThisTick()) {
        if (e.type === 'organism-bitten') creatureBites += 1
        if (e.type !== 'resource-bitten') continue
        let pure = jawOnly.get(e.organismId)
        if (pure === undefined) {
          const genome = world.genomeOf(e.organismId)
          const mouths = genome === undefined ? [] : mouthsOf(genome, world.config)
          pure = mouths.length > 0 && mouths.every((m) => m.form === 'jaw')
          jawOnly.set(e.organismId, pure)
        }
        if (!pure) continue
        if (e.kind === carrion) carrionBitesByJaws += 1
        else plantBitesByJaws += 1
      }
    }
    return { plantBitesByJaws, carrionBitesByJaws, creatureBites }
  }

  it('hunters never take energy from a plant, and still hunt (and with the old yield of 1 they did)', () => {
    const meat = watch(3, {}, 4000)
    expect(meat.plantBitesByJaws).toBe(0)
    expect(meat.creatureBites + meat.carrionBitesByJaws).toBeGreaterThan(0)
    const omnivore = watch(
      3,
      { anatomy: { mouthForms: { jaw: { grass: 1, fruit: 1, fungus: 1, nectar: 1 } } } },
      4000
    )
    expect(omnivore.plantBitesByJaws).toBeGreaterThan(0)
  }, 120_000)

  it('is the same world however it is sliced', () => {
    const a = World.create({ seed: 3 })
    a.run(900)
    const b = World.create({ seed: 3 })
    for (let i = 0; i < 3; i++) b.run(300)
    expect(b.stateHash()).toBe(a.stateHash())
  })
})
