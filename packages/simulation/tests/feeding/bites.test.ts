import { describe, expect, it } from 'vitest'
import { DEFAULT_WORLD_CONFIG, resolveWorldConfig } from '@evo/config'
import type { FeedingConfig, FounderPart, WorldConfig, WorldConfigOverrides } from '@evo/contracts'
import type { DamageBuffer, IntentBuffer } from '../../src/buffers/types'
import { OrganismStore } from '../../src/entities/OrganismStore'
import type { OrganismState } from '../../src/entities/OrganismStore'
import { ResourceStore } from '../../src/entities/ResourceStore'
import type { ResourceState } from '../../src/entities/ResourceStore'
import { EventLog } from '../../src/events/EventLog'
import { EcologyModel } from '../../src/ecology/EcologyModel'
import { founderBodyVector } from '../../src/genetics/BodyGenes'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import { mouthsOf } from '../../src/organisms/mouths'
import { bodyRadiusOf, gutCapacityOf } from '../../src/organisms/traits'
import { SpatialHash } from '../../src/spatial/SpatialHash'
import { DigestionSystem } from '../../src/systems/DigestionSystem'
import { InteractionSystem } from '../../src/systems/InteractionSystem'
import { MovementSystem } from '../../src/systems/MovementSystem'
import { organismFor } from '../support/organism'
import { eats, withoutEcology } from '../support/ecology'

/**
 * Bites (ADR 0017): a working mouth, food in front of it within reach, the intent to interact and a
 * bite off cooldown. Food keeps its remaining energy between bites, a bite goes into a gut, and the
 * gut empties into energy at the speed of the digestion parts.
 */
const FEEDING: Partial<FeedingConfig> = {
  biteRadius: 0.6,
  biteCone: 1,
  biteSize: 12,
  biteInterval: 0.4,
  gutCapacity: 40,
  absorption: 6,
  chewSlow: 0.15
}

const config = (extra: WorldConfigOverrides = {}): WorldConfig =>
  resolveWorldConfig(
    withoutEcology({
      ...extra,
      learning: { controller: 'reflex' },
      feeding: { ...FEEDING, ...extra.feeding }
    })
  )

/** A resource of the plain kind, 30 energy by default. */
const food = (id: number, x: number, y: number, remaining = 30, kind = 0): ResourceState => ({
  id,
  x,
  y,
  remaining,
  kind
})

/** The organism with a different body: its parts replace the founder's. */
function withBody(
  organism: OrganismState,
  config: WorldConfig,
  parts: FounderPart[]
): OrganismState {
  const genome = genomeFromParts({
    id: organism.genome.id,
    parentIds: organism.genome.parentIds,
    vector: genomeToVector(organism.genome),
    architecture: organism.genome.brain.architecture,
    weights: organism.genome.brain.weights,
    body: founderBodyVector({ ...config.anatomy, founder: parts })
  })
  return { ...organism, genome }
}

const founderOf = (cfg: WorldConfig): FounderPart[] => cfg.anatomy.founder.map((p) => ({ ...p }))

interface Scene {
  readonly cfg: WorldConfig
  readonly organism: OrganismState
  readonly resources: ResourceStore
  readonly events: EventLog
  readonly damage: DamageBuffer
  /** Runs one tick of interaction then digestion, as the world does. */
  tick(): void
  /** Only the biting half of a tick. */
  interact(): void
  /** Only the digesting half of a tick. */
  digest(): void
  /** The mouth of the organism in the world. */
  readonly mouth: { x: number; y: number }
}

function scene(
  cfg: WorldConfig,
  foodAt: (mouth: { x: number; y: number }) => ResourceState[],
  overrides: Partial<OrganismState> = {},
  intents?: IntentBuffer,
  ecology: EcologyModel | null = null,
  parts?: FounderPart[]
): Scene {
  const base = organismFor(cfg, 1, { x: 100, y: 100, age: 200, energy: 50, ...overrides })
  const organism = parts === undefined ? base : withBody(base, cfg, parts)
  const organisms = new OrganismStore()
  organisms.add(organism)
  const [mouthPoint] = mouthsOf(organism.genome, cfg)
  const radius = bodyRadiusOf(organism.genome, cfg)
  const mouth = {
    x: organism.x + (mouthPoint?.x ?? 0) * radius,
    y: organism.y + (mouthPoint?.y ?? 0) * radius
  }
  const resources = new ResourceStore()
  for (const item of foodAt(mouth)) resources.add(item)
  const events = new EventLog(1000)
  const damage: DamageBuffer = new Map()
  let now = 0
  const interaction = new InteractionSystem(
    cfg,
    organisms,
    resources,
    new SpatialHash<ResourceState>(60, (r) => r),
    events,
    intents,
    ecology,
    damage
  )
  const digestion = new DigestionSystem(cfg, organisms, events)
  const index = (interaction as unknown as { resourceIndex: SpatialHash<ResourceState> })
    .resourceIndex
  return {
    cfg,
    organism,
    resources,
    events,
    damage,
    mouth,
    tick() {
      this.interact()
      this.digest()
    },
    interact() {
      now += 1
      events.beginTick()
      index.rebuild(resources.values())
      interaction.update(now)
    },
    digest() {
      digestion.update(now)
    }
  }
}

const bitten = (s: Scene) => s.events.list().filter((e) => e.type === 'resource-bitten')

describe('where a bite lands', () => {
  it('bites food in front of the mouth: it loses health, the gut gains, the item stays', () => {
    const s = scene(config(), (m) => [food(9, m.x + 1, m.y)])
    s.interact()
    const item = s.resources.get(9)
    expect(item?.remaining).toBe(18)
    expect(s.organism.gut).toBe(12)
    expect(s.organism.biteCooldown).toBeCloseTo(0.4, 12)
    expect(bitten(s)).toHaveLength(1)
    expect(bitten(s)[0]).toMatchObject({ type: 'resource-bitten', chunk: 12, intake: 12 })
    // The energy has not arrived yet: it is in the gut.
    expect(s.organism.energy).toBe(50)
  })

  it('does not eat food that is only touching the back of the body', () => {
    const radius = (() => {
      const probe = scene(config(), () => [])
      return bodyRadiusOf(probe.organism.genome, probe.cfg)
    })()
    // Right on the body (the old rule would eat it), but behind: the mouth is at the front.
    const s = scene(config(), (m) => [food(9, m.x - 2 * radius, m.y)])
    s.interact()
    expect(s.resources.get(9)?.remaining).toBe(30)
    expect(s.organism.gut).toBe(0)
    expect(bitten(s)).toHaveLength(0)
  })

  it('does not eat food beside the body even when it is within the mouth’s reach', () => {
    // Inside the circle around the mouth but at about 70 degrees from the front: outside a
    // 1 radian (57 degree) cone, inside a 1.4 radian one.
    const place = (m: { x: number; y: number }) => [food(9, m.x - 3.32, m.y + 4.8)]
    const narrow = scene(config(), place)
    narrow.interact()
    expect(narrow.resources.get(9)?.remaining).toBe(30)
    const wide = scene(config({ feeding: { biteCone: 1.4 } as FeedingConfig }), place)
    wide.interact()
    expect(wide.resources.get(9)?.remaining).toBe(18)
  })

  it('does not reach food beyond the mouth’s bite radius, and a wider radius does', () => {
    const far = (m: { x: number; y: number }) => [food(9, m.x + 8, m.y)]
    const near = scene(config(), far)
    near.interact()
    expect(near.resources.get(9)?.remaining).toBe(30)
    const reaching = scene(config({ feeding: { biteRadius: 2 } as FeedingConfig }), far)
    reaching.interact()
    expect(reaching.resources.get(9)?.remaining).toBe(18)
  })

  it('needs the intent to interact', () => {
    const no: IntentBuffer = new Map([[1, { turn: 0, thrust: 0, strafe: 0, interact: false }]])
    const s = scene(config(), (m) => [food(9, m.x + 1, m.y)], {}, no)
    s.interact()
    expect(s.resources.get(9)?.remaining).toBe(30)
    const yes: IntentBuffer = new Map([[1, { turn: 0, thrust: 0, strafe: 0, interact: true }]])
    const t = scene(config(), (m) => [food(9, m.x + 1, m.y)], {}, yes)
    t.interact()
    expect(t.resources.get(9)?.remaining).toBe(18)
  })

  it('turns with the body: food that is in front after a turn is bitten', () => {
    // Heading a quarter turn: the mouth is now above the body.
    const s = scene(config(), (m) => [food(9, m.x, m.y + 1)], { heading: Math.PI / 2 })
    // The helper placed the mouth for heading 0; recompute where it really is.
    const radius = bodyRadiusOf(s.organism.genome, s.cfg)
    const [mp] = mouthsOf(s.organism.genome, s.cfg)
    const turned = {
      x: s.organism.x - (mp?.y ?? 0) * radius,
      y: s.organism.y + (mp?.x ?? 0) * radius
    }
    s.resources.remove(9)
    s.resources.add(food(10, turned.x, turned.y + 1))
    s.interact()
    expect(s.resources.get(10)?.remaining).toBe(18)
  })
})

describe('food has health: it takes several bites', () => {
  it('a 30 energy item takes three bites (12, 12, 6) and is gone after the last', () => {
    const s = scene(config(), (m) => [food(9, m.x + 1, m.y)], { energy: 10 })
    const seen: number[] = []
    for (let i = 0; i < 400 && s.resources.has(9); i++) {
      s.interact()
      for (const e of s.events.eventsThisTick()) {
        if (e.type === 'resource-bitten') seen.push(e.remaining)
      }
      // keep the gut empty so only the bites decide
      s.organism.gut = 0
    }
    expect(seen).toEqual([18, 6, 0])
    expect(s.resources.has(9)).toBe(false)
  })

  it('the last bite emits one resource-consumed and no energy of its own', () => {
    const s = scene(config(), (m) => [food(9, m.x + 1, m.y, 5)])
    s.interact()
    const events = s.events.eventsThisTick()
    expect(events.map((e) => e.type)).toEqual(['resource-bitten', 'resource-consumed'])
    expect(events[1]).toMatchObject({ energyGained: 0, energyWasted: 0 })
  })

  it('bites are spaced by the cooldown', () => {
    const s = scene(config(), (m) => [food(9, m.x + 1, m.y, 1000)])
    const ticks: number[] = []
    for (let i = 1; i <= 60; i++) {
      s.interact()
      s.organism.gut = 0
      if (bitten(s).length > ticks.length) ticks.push(i)
    }
    expect(ticks.length).toBeGreaterThan(2)
    const spacing = Math.floor(0.4 / s.cfg.timestep)
    for (let i = 1; i < ticks.length; i++) {
      expect((ticks[i] as number) - (ticks[i - 1] as number)).toBeGreaterThanOrEqual(spacing)
    }
    // And not every tick.
    expect(ticks.length).toBeLessThan(60)
  })

  it('a tougher kind comes off in smaller bites', () => {
    const cfg = resolveWorldConfig({
      learning: { controller: 'reflex' },
      feeding: FEEDING,
      anatomy: eats(['tough']),
      ecology: {
        resourceKinds: {
          enabled: true,
          kinds: [
            {
              name: 'tough',
              energyScale: 1,
              radiusScale: 1,
              spawnWeight: 1,
              detectability: 1,
              toxicity: 0,
              hardness: 3,
              regions: []
            }
          ]
        }
      }
    })
    const s = scene(cfg, (m) => [food(9, m.x + 1, m.y)], {}, undefined, new EcologyModel(cfg, null))
    s.interact()
    expect(s.resources.get(9)?.remaining).toBe(26)
  })
})

describe('the gut', () => {
  it('a gut with no real room for a bite refuses it and the food stays', () => {
    const probe = scene(config(), () => [])
    const capacity = gutCapacityOf(probe.organism.genome, probe.cfg)
    const s = scene(config(), (m) => [food(9, m.x + 1, m.y)], { gut: capacity - 2 })
    s.interact()
    expect(s.resources.get(9)?.remaining).toBe(30)
    expect(bitten(s)).toHaveLength(0)
  })

  it('a gut with room for more than half a bite takes what fits', () => {
    const probe = scene(config(), () => [])
    const capacity = gutCapacityOf(probe.organism.genome, probe.cfg)
    const s = scene(config(), (m) => [food(9, m.x + 1, m.y)], { gut: capacity - 8 })
    s.interact()
    expect(s.resources.get(9)?.remaining).toBe(22)
    expect(s.organism.gut).toBeLessThanOrEqual(capacity)
  })

  it('empties into energy at the absorption rate, and no faster', () => {
    const s = scene(config(), () => [], { gut: 20, energy: 10 })
    s.digest()
    const dt = s.cfg.timestep
    expect(s.organism.energy).toBeCloseTo(10 + 6 * dt, 12)
    expect(s.organism.gut).toBeCloseTo(20 - 6 * dt, 12)
  })

  it('a body with no room left for energy keeps its food in the gut', () => {
    const probe = scene(config(), () => [])
    const max = 100 // organisms.maxEnergy at the baseline body
    const s = scene(config(), () => [], { gut: 20, energy: max })
    s.digest()
    expect(s.organism.energy).toBe(max)
    expect(s.organism.gut).toBe(20)
    expect(probe.organism.gut).toBe(0)
  })

  it('a faster absorption config drains it faster', () => {
    const slow = scene(config(), () => [], { gut: 20, energy: 10 })
    const fast = scene(config({ feeding: { absorption: 12 } as FeedingConfig }), () => [], {
      gut: 20,
      energy: 10
    })
    slow.digest()
    fast.digest()
    expect(fast.organism.energy - 10).toBeCloseTo(2 * (slow.organism.energy - 10), 12)
  })
})

describe('the mouth', () => {
  it('a body without a mouth cannot bite', () => {
    const cfg = config()
    const noMouth = founderOf(cfg).filter((p) => p.type !== 'mouth')
    const s = scene(cfg, () => [food(9, 100, 100)], {}, undefined, null, noMouth)
    s.interact()
    expect(s.resources.get(9)?.remaining).toBe(30)
    expect(bitten(s)).toHaveLength(0)
  })

  it('the mouth form decides the yield from the same bite', () => {
    const cfg = resolveWorldConfig(
      withoutEcology({
        learning: { controller: 'reflex' },
        feeding: FEEDING,
        ecology: { resourceKinds: DEFAULT_WORLD_CONFIG.ecology.resourceKinds }
      })
    )
    const intakeOf = (form: number, kind = 0) => {
      const parts = founderOf(cfg).map((p) =>
        p.type === 'mouth' ? { ...p, stats: [0.5, 0.5, form, 0.5, 0.5, 0.5] } : p
      )
      const s = scene(
        cfg,
        (m) => [food(9, m.x + 1, m.y, 30, kind)],
        {},
        undefined,
        new EcologyModel(cfg, null),
        parts
      )
      s.interact()
      return s.organism.gut
    }
    // Grass (kind 0): mandible 1, sprout 1.3, radula 0.9, jaw 0 (a carnivore, ADR 0023); a sprout is poor on fungus (kind 2).
    expect(intakeOf(0.5)).toBe(12)
    expect(intakeOf(0.05)).toBeCloseTo(12 * 1.3, 12)
    expect(intakeOf(0.7)).toBeCloseTo(12 * 0.9, 12)
    // The jaw takes nothing from a plant and does not bite one (ADR 0023): the gut stays empty.
    expect(intakeOf(0.95)).toBe(0)
    expect(intakeOf(0.05, 2)).toBeLessThan(intakeOf(0.5, 2) / (1 / 0.6) + 1e-9 + 12)
    expect(intakeOf(0.05, 2)).toBeCloseTo((12 / 1.5) * 0.6, 12)
  })
})

describe('a body with two mouths', () => {
  it('takes the yield of the mouth that bites, not the blend over both (ADR 0026)', () => {
    const cfg = resolveWorldConfig(
      withoutEcology({
        learning: { controller: 'reflex' },
        feeding: FEEDING,
        ecology: { resourceKinds: DEFAULT_WORLD_CONFIG.ecology.resourceKinds }
      })
    )
    const sproutMouth = (p: FounderPart): FounderPart =>
      p.type === 'mouth' ? { ...p, stats: [0.5, 0.5, 0.05, 0.5, 0.5, 0.5] } : p
    const intake = (extra: boolean): number => {
      const parts = founderOf(cfg).map(sproutMouth)
      const mouth = parts.find((p) => p.type === 'mouth')!
      // a jaw beside the sprout: it bites nothing off a plant, but used to drag the blended yield down
      if (extra)
        parts.push({ ...mouth, angle: mouth.angle + 3, stats: [0.5, 0.5, 0.95, 0.5, 0.5, 0.5] })
      const s = scene(
        cfg,
        (m) => [food(9, m.x + 1, m.y, 30, 0)],
        {},
        undefined,
        new EcologyModel(cfg, null),
        parts
      )
      s.interact()
      return s.organism.gut
    }
    expect(intake(false)).toBeCloseTo(12 * 1.3, 12)
    // A second mouth doubles the body's bite size (it sums over mouths), so the chunk is 24; what it
    // takes in is the sprout's 1.3 of it, not the blend over both mouths (0.65).
    expect(intake(true)).toBeCloseTo(24 * 1.3, 12)
    expect(intake(true)).not.toBeCloseTo(24 * 0.65, 6)
  })
})

describe('toxins', () => {
  it('a whole toxic item adds up to its old damage, split over its bites', () => {
    const cfg = resolveWorldConfig({
      learning: { controller: 'reflex' },
      feeding: FEEDING,
      anatomy: eats(['toxic']),
      ecology: {
        resourceKinds: {
          enabled: true,
          kinds: [
            {
              name: 'toxic',
              energyScale: 1,
              radiusScale: 1,
              spawnWeight: 1,
              detectability: 1,
              toxicity: 6,
              regions: []
            }
          ]
        }
      }
    })
    const s = scene(
      cfg,
      (m) => [food(9, m.x + 1, m.y)],
      { energy: 10 },
      undefined,
      new EcologyModel(cfg, null)
    )
    let total = 0
    for (let i = 0; i < 400 && s.resources.has(9); i++) {
      s.interact()
      total += s.damage.get(1) ?? 0
      s.organism.gut = 0
    }
    expect(total).toBeCloseTo(6, 10)
  })
})

describe('chewing', () => {
  it('slows a creature while a bite is on cooldown, and not otherwise', () => {
    const cfg = config()
    const run = (biteCooldown: number) => {
      const organism = organismFor(cfg, 1, { x: 50, y: 50, age: 200, biteCooldown })
      const organisms = new OrganismStore()
      organisms.add(organism)
      const intents: IntentBuffer = new Map([
        [1, { turn: 0, thrust: 1, strafe: 0, interact: true }]
      ])
      const events = new EventLog(10)
      events.beginTick()
      new MovementSystem(cfg, organisms, intents, events).update(1)
      return Math.hypot(organism.vx, organism.vy)
    }
    const free = run(0)
    const chewing = run(0.3)
    expect(free).toBeGreaterThan(0)
    expect(chewing).toBeCloseTo(free * 0.15, 12)
  })
})

describe('feeding off is the original behavior', () => {
  it('touching food eats it whole, in one tick, with no gut', () => {
    const cfg = config({ feeding: { enabled: false } as FeedingConfig })
    const s = scene(cfg, (m) => [food(9, m.x - 1, m.y)])
    s.interact()
    expect(s.resources.has(9)).toBe(false)
    expect(s.organism.gut).toBe(0)
    expect(s.events.eventsThisTick().map((e) => e.type)).toEqual(['resource-consumed'])
  })
})

describe('a plant hub (ADR 0021)', () => {
  const plantConfig = (): WorldConfig =>
    config({ resources: { plants: { enabled: true, hubHardness: 3 } } } as WorldConfigOverrides)

  it('is tougher than its nodes and free food: a bite takes a third as much from it', () => {
    const hub = scene(plantConfig(), (m) => [{ ...food(9, m.x + 1, m.y, 90), slot: 0, parent: 0 }])
    hub.interact()
    expect(hub.resources.get(9)?.remaining).toBe(86) // 12 / 3 = 4 off a hub of 90
    expect(hub.organism.gut).toBe(4)
    // a node and free food of the same size take the full chunk
    const node = scene(plantConfig(), (m) => [{ ...food(9, m.x + 1, m.y, 90), slot: 2, parent: 0 }])
    node.interact()
    expect(node.resources.get(9)?.remaining).toBe(78)
    const free = scene(plantConfig(), (m) => [food(9, m.x + 1, m.y, 90)])
    free.interact()
    expect(free.resources.get(9)?.remaining).toBe(78)
  })
})
