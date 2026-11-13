import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { FounderPart, WorldConfig } from '@evo/contracts'
import type {
  IntentBuffer,
  PeerBuffer,
  PerceptionBuffer,
  PreyBuffer,
  ThreatBuffer
} from '../../src/buffers/types'
import { ObstacleField } from '../../src/ecology/ObstacleField'
import { OrganismStore } from '../../src/entities/OrganismStore'
import type { OrganismState } from '../../src/entities/OrganismStore'
import type { ResourceState } from '../../src/entities/ResourceStore'
import { ResourceStore } from '../../src/entities/ResourceStore'
import { founderBodyVector } from '../../src/genetics/BodyGenes'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import { bitesCreatures, canBite, peerRole } from '../../src/organisms/predation'
import { SpatialHash } from '../../src/spatial/SpatialHash'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'
import { DecisionSystem } from '../../src/systems/DecisionSystem'
import { PerceptionSystem } from '../../src/systems/PerceptionSystem'
import { World } from '../../src/world/World'
import { withoutEcology } from '../support/ecology'
import { organismFor } from '../support/organism'

// The prey and threat senses (ADR 0023, step two): the nearest creature this one could bite and the
// nearest that could bite it, seen by the same eyes and cover as any peer, and the same rule the
// bite itself uses, so what a creature is told it can bite is what it can bite.

const config: WorldConfig = resolveWorldConfig(
  withoutEcology({
    learning: { controller: 'brain' },
    ecology: { health: { enabled: true } },
    predation: { enabled: true }
  })
)
const ORIGIN = 100

function jawBody(cfg: WorldConfig): FounderPart[] {
  return cfg.anatomy.founder.map((p) =>
    p.type === 'mouth'
      ? { ...p, stats: [p.stats[0] ?? 0.5, p.stats[1] ?? 0.5, 0.9, 0.5, 0.5, 0.5] }
      : { ...p }
  )
}

function withJaw(o: OrganismState, cfg: WorldConfig): OrganismState {
  const genome = genomeFromParts({
    id: o.genome.id,
    parentIds: o.genome.parentIds,
    vector: genomeToVector(o.genome),
    architecture: o.genome.brain.architecture,
    weights: o.genome.brain.weights,
    body: founderBodyVector({ ...cfg.anatomy, founder: jawBody(cfg) })
  })
  return { ...o, genome }
}

const circle = (dx: number, dy: number, radius: number) => ({
  kind: 'boulder' as const,
  x: ORIGIN + dx,
  y: ORIGIN + dy,
  radius,
  blocksMovement: true,
  blocksSight: true
})

interface Look {
  /** Does the viewer have a jaw (default yes)? */
  readonly viewerJaw?: boolean
  /** Does the other creature have a jaw (default no)? */
  readonly otherJaw?: boolean
  readonly viewerAge?: number
  readonly otherAge?: number
  readonly at?: readonly [number, number]
  readonly kin?: 'parent' | 'child'
  readonly rocks?: readonly ReturnType<typeof circle>[]
  /** Predation sensing wired in (default yes); `false` is a world with predation off. */
  readonly sensing?: boolean
  readonly cfg?: WorldConfig
}

function look(options: Look = {}): { prey: number | null; threat: number | null } {
  const cfg = options.cfg ?? config
  let viewer = organismFor(cfg, 1, {
    x: ORIGIN,
    y: ORIGIN,
    heading: 0,
    age: options.viewerAge ?? 200
  })
  if (options.viewerJaw !== false) viewer = withJaw(viewer, cfg)
  const [dx, dy] = options.at ?? [30, 0]
  let other = organismFor(cfg, 2, {
    x: ORIGIN + dx,
    y: ORIGIN + dy,
    age: options.otherAge ?? 200,
    ...(options.kin === 'parent' ? { parentIds: [1] } : {})
  })
  if (options.otherJaw === true) other = withJaw(other, cfg)
  if (options.kin === 'child') viewer = { ...viewer, parentIds: [2] }
  const organisms = new OrganismStore()
  organisms.add(viewer)
  organisms.add(other)
  const foodIndex = new SpatialHash<ResourceState>(60, (r) => r)
  foodIndex.rebuild(new ResourceStore().values())
  const organismIndex = new SpatialHash<OrganismState>(60, (o) => o)
  organismIndex.rebuild(organisms.values())
  const food: PerceptionBuffer = new Map()
  const peers: PeerBuffer = new Map()
  const prey: PreyBuffer = new Map()
  const threat: ThreatBuffer = new Map()
  const field = ObstacleField.fromCircles(options.rocks ?? [])
  new PerceptionSystem(
    cfg,
    organisms,
    foodIndex,
    food,
    { organismIndex, buffer: peers },
    null,
    undefined,
    undefined,
    field.maxSightRadius > 0 ? { obstacles: field } : undefined,
    options.sensing === false ? undefined : { organismIndex, prey, threat }
  ).update(0)
  return {
    prey: prey.get(1)?.organismId ?? null,
    threat: threat.get(1)?.organismId ?? null
  }
}

describe('the rule: who could bite whom', () => {
  const at = (cfg: WorldConfig, id: number, jaw: boolean, extra: Partial<OrganismState> = {}) => {
    const base = organismFor(cfg, id, { x: ORIGIN, y: ORIGIN, age: 200, ...extra })
    return jaw ? withJaw(base, cfg) : base
  }

  it('only a body with a jaw bites creatures; the founder does not', () => {
    expect(bitesCreatures(at(config, 1, true).genome, config)).toBe(true)
    expect(bitesCreatures(at(config, 1, false).genome, config)).toBe(false)
  })

  it('canBite: not itself, not kin, not the dead, not something much bigger (negatives)', () => {
    const hunter = at(config, 1, true)
    expect(canBite(hunter, at(config, 2, false), config)).toBe(true)
    expect(canBite(hunter, hunter, config)).toBe(false)
    expect(canBite(hunter, at(config, 2, false, { parentIds: [1] }), config)).toBe(false)
    expect(canBite(hunter, at(config, 2, false, { health: 0 }), config)).toBe(false)
    // A juvenile hunter (half the radius) cannot take an adult (twice its size, above the 1.5 ratio).
    const juvenile = at(config, 1, true, { age: 0 })
    expect(canBite(juvenile, at(config, 2, false), config)).toBe(false)
    expect(canBite(hunter, at(config, 2, false, { age: 0 }), config)).toBe(true)
    // A body without a jaw bites nobody.
    expect(canBite(at(config, 1, false), at(config, 2, false), config)).toBe(false)
  })

  it('peerRole: prey for a hunter, a threat for a grazer, hunters of one size are prey to each other', () => {
    const hunter = at(config, 1, true)
    const grazer = at(config, 2, false)
    expect(peerRole(hunter, grazer, config)).toBe('prey')
    expect(peerRole(grazer, hunter, config)).toBe('threat')
    expect(peerRole(grazer, at(config, 3, false), config)).toBe('none')
    // Two hunters of one size meet as hunters: neither flees the other.
    expect(peerRole(hunter, at(config, 3, true), config)).toBe('prey')
    // A small hunter flees a big one, and the big one hunts it.
    const small = at(config, 4, true, { age: 0 })
    expect(peerRole(small, hunter, config)).toBe('threat')
    expect(peerRole(hunter, small, config)).toBe('prey')
  })
})

describe('what a creature sees', () => {
  it('a hunter sees a grazer ahead as prey, and not as a threat', () => {
    expect(look()).toEqual({ prey: 2, threat: null })
  })

  it('a grazer sees a hunter ahead as a threat, and nothing as prey; a founder never has prey (negative)', () => {
    expect(look({ viewerJaw: false, otherJaw: true })).toEqual({ prey: null, threat: 2 })
    expect(look({ viewerJaw: false, otherJaw: false })).toEqual({ prey: null, threat: null })
  })

  it('does not see behind it or out of range (the same eyes as for any peer)', () => {
    expect(look({ at: [-30, 0] }).prey).toBeNull()
    expect(look({ at: [400, 0] }).prey).toBeNull()
    expect(look({ at: [30, 0] }).prey).toBe(2)
  })

  it('kin are never prey or threat, parent or child', () => {
    expect(look({ kin: 'parent' })).toEqual({ prey: null, threat: null })
    expect(look({ kin: 'child' })).toEqual({ prey: null, threat: null })
    expect(look({ kin: 'parent', viewerJaw: false, otherJaw: true })).toEqual({
      prey: null,
      threat: null
    })
  })

  it('a creature too big to bite is not prey; a smaller one is (the size ratio)', () => {
    expect(look({ viewerAge: 0, otherAge: 200 }).prey).toBeNull()
    expect(look({ viewerAge: 200, otherAge: 0 }).prey).toBe(2)
  })

  it('a rock in between hides it, a rock off the line does not (cover works)', () => {
    expect(look({ rocks: [circle(15, 0, 6)] })).toEqual({ prey: null, threat: null })
    expect(look({ rocks: [circle(15, 20, 6)] }).prey).toBe(2)
    // And hides a threat the same way.
    expect(look({ viewerJaw: false, otherJaw: true, rocks: [circle(15, 0, 6)] }).threat).toBeNull()
  })

  it('with predation sensing off the buffers stay empty, whatever is in front (negative)', () => {
    expect(look({ sensing: false })).toEqual({ prey: null, threat: null })
  })

  it('picks the nearer of two prey and ignores the farther', () => {
    const cfg = config
    const viewer = withJaw(organismFor(cfg, 1, { x: ORIGIN, y: ORIGIN, age: 200 }), cfg)
    const near = organismFor(cfg, 2, { x: ORIGIN + 20, y: ORIGIN + 5, age: 200, heading: Math.PI })
    const far = organismFor(cfg, 3, { x: ORIGIN + 45, y: ORIGIN, age: 200, heading: Math.PI })
    const organisms = new OrganismStore()
    for (const o of [viewer, near, far]) organisms.add(o)
    const organismIndex = new SpatialHash<OrganismState>(60, (o) => o)
    organismIndex.rebuild(organisms.values())
    const foodIndex = new SpatialHash<ResourceState>(60, (r) => r)
    foodIndex.rebuild([])
    const prey: PreyBuffer = new Map()
    const threat: ThreatBuffer = new Map()
    new PerceptionSystem(
      cfg,
      organisms,
      foodIndex,
      new Map(),
      { organismIndex, buffer: new Map() },
      null,
      undefined,
      undefined,
      undefined,
      { organismIndex, prey, threat }
    ).update(0)
    expect(prey.get(1)?.organismId).toBe(2)
    // The other two are plain grazers, turned to face it: they see the hunter as a threat.
    expect(threat.get(2)?.organismId).toBe(1)
    expect(threat.get(3)?.organismId).toBe(1)
    expect(prey.get(2)).toBeNull()
  })
})

describe('in a world', () => {
  const worldWith = (predation: boolean, groups: boolean = false) =>
    World.create({
      seed: 3,
      config: withoutEcology({
        ecology: { health: { enabled: true } },
        predation: { enabled: predation },
        // the default hunter group is off here: these worlds are about founders without jaws
        anatomy: { startingBody: { groups: groups ? [{ archetype: 'hunter', share: 0.2 }] : [] } }
      })
    })

  it('every creature sees 48 numbers, and the prey and threat slots are zero with predation off', () => {
    const world = worldWith(false)
    world.run(200)
    const id = world.snapshot().organisms[0]!.id
    const inputs = world.brainOf(id)?.observation
    expect(inputs).toHaveLength(48)
    expect(inputs?.slice(40, 48)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('and stay zero with predation on while nobody has a jaw (founders are mandibles)', () => {
    const world = worldWith(true)
    world.run(200)
    for (const organism of world.snapshot().organisms) {
      const inputs = world.brainOf(organism.id)?.observation
      expect(inputs?.slice(40, 48)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    }
  })

  it('the two predation counters are part of the state hash (schema 12), and nothing else changes it', () => {
    const counters = (world: World) =>
      (world as unknown as { metricsCollector: Record<string, number> }).metricsCollector
    const base = worldWith(false)
    base.run(50)
    const same = worldWith(false)
    same.run(50)
    expect(same.stateHash()).toBe(base.stateHash())
    counters(same).predationBites = 1
    expect(same.stateHash()).not.toBe(base.stateHash())
    const killed = worldWith(false)
    killed.run(50)
    counters(killed).deathsByPredation = 1
    expect(killed.stateHash()).not.toBe(base.stateHash())
    expect(killed.stateHash()).not.toBe(same.stateHash())
  })

  it('a world with predation on is chunk-invariant (the sense is deterministic)', () => {
    const a = worldWith(true)
    a.run(400)
    const b = worldWith(true)
    for (let i = 0; i < 4; i++) b.run(100)
    expect(b.stateHash()).toBe(a.stateHash())
  })
})

describe('the reflex controller', () => {
  const decide = (extra: {
    prey?: { x: number; y: number }
    threat?: { x: number; y: number }
    food?: { x: number; y: number }
  }) => {
    const organisms = new OrganismStore()
    organisms.add(organismFor(config, 1, { x: 0, y: 0, heading: 0 }))
    const sighting = (p: { x: number; y: number }, id: number) => ({
      organismId: id,
      position: p,
      distanceSquared: p.x * p.x + p.y * p.y
    })
    const perception: PerceptionBuffer = new Map([
      [
        1,
        extra.food
          ? {
              resourceId: 9,
              position: extra.food,
              distanceSquared: extra.food.x * extra.food.x + extra.food.y * extra.food.y,
              kind: 0
            }
          : null
      ]
    ])
    const intents: IntentBuffer = new Map()
    const prey: PreyBuffer = new Map([[1, extra.prey ? sighting(extra.prey, 2) : null]])
    const threat: ThreatBuffer = new Map([[1, extra.threat ? sighting(extra.threat, 3) : null]])
    new DecisionSystem(
      config,
      organisms,
      perception,
      intents,
      new SeededRandom(deriveStreamWords(1, 'world')),
      prey,
      threat
    ).update()
    return intents.get(1)!
  }

  it('hunts: turns toward prey that is nearer than food, and takes the food when it is nearer', () => {
    expect(decide({ prey: { x: 0, y: 10 } }).turn).toBeCloseTo(Math.PI / 2, 6)
    expect(decide({ prey: { x: 0, y: 10 }, food: { x: 30, y: 0 } }).turn).toBeCloseTo(
      Math.PI / 2,
      6
    )
    expect(decide({ prey: { x: 0, y: 30 }, food: { x: 10, y: 0 } }).turn).toBeCloseTo(0, 6)
  })

  it('flees: turns directly away from a threat, ahead of everything else', () => {
    // A threat straight ahead: away is behind, a half turn.
    expect(Math.abs(decide({ threat: { x: 10, y: 0 } }).turn)).toBeCloseTo(Math.PI, 6)
    // Above it: away is below, a quarter turn to the right.
    expect(decide({ threat: { x: 0, y: 10 } }).turn).toBeCloseTo(-Math.PI / 2, 6)
    // Food and prey are ignored while something is chasing it.
    const chased = decide({ threat: { x: 0, y: 10 }, prey: { x: 20, y: 0 }, food: { x: 5, y: 0 } })
    expect(chased.turn).toBeCloseTo(-Math.PI / 2, 6)
    expect(chased.thrust).toBe(1)
  })

  it('without prey or a threat it is the old forager (negative)', () => {
    expect(decide({ food: { x: 10, y: 0 } }).turn).toBeCloseTo(0, 6)
    expect(decide({ food: { x: 0, y: 10 } }).turn).toBeCloseTo(Math.PI / 2, 6)
  })
})
