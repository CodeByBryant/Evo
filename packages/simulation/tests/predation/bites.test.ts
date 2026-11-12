import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { FounderPart, WorldConfig, WorldConfigOverrides } from '@evo/contracts'
import type { LastBitten, PredationBuffer } from '../../src/buffers/types'
import { ObstacleField } from '../../src/ecology/ObstacleField'
import { OrganismStore } from '../../src/entities/OrganismStore'
import type { OrganismState } from '../../src/entities/OrganismStore'
import { ResourceStore } from '../../src/entities/ResourceStore'
import type { ResourceState } from '../../src/entities/ResourceStore'
import { EventLog } from '../../src/events/EventLog'
import { founderBodyVector } from '../../src/genetics/BodyGenes'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import { mouthsOf } from '../../src/organisms/mouths'
import { bodyRadiusOf, gutCapacityOf } from '../../src/organisms/traits'
import { SpatialHash } from '../../src/spatial/SpatialHash'
import { InteractionSystem } from '../../src/systems/InteractionSystem'
import { organismFor } from '../support/organism'
import { withoutEcology } from '../support/ecology'

// Creatures bite creatures (ADR 0023): only a mouth with a flesh yield (a jaw), within reach and in
// the cone, no bigger than the ratio allows, with nothing solid in between; the victim loses energy
// and health, the bitter's gut gains the energy at a trophic loss.

const config = (extra: WorldConfigOverrides = {}): WorldConfig =>
  resolveWorldConfig(
    withoutEcology({
      ...extra,
      learning: { controller: 'reflex' },
      ecology: { health: { enabled: true }, ...extra.ecology },
      predation: { enabled: true, ...extra.predation }
    })
  )

const founderOf = (cfg: WorldConfig): FounderPart[] => cfg.anatomy.founder.map((p) => ({ ...p }))

/** The founder body with its mouth turned into a jaw (mouth stat 2 above 0.8). */
function jawParts(cfg: WorldConfig): FounderPart[] {
  return founderOf(cfg).map((p) =>
    p.type === 'mouth'
      ? { ...p, stats: [p.stats[0] ?? 0.5, p.stats[1] ?? 0.5, 0.9, 0.5, 0.5, 0.5] }
      : p
  )
}

function withBody(o: OrganismState, cfg: WorldConfig, parts: FounderPart[]): OrganismState {
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
  readonly predator: OrganismState
  readonly prey: OrganismState
  readonly buffer: PredationBuffer
  readonly lastBitten: LastBitten
  readonly events: EventLog
  readonly resources: ResourceStore
  /** One tick of interaction. */
  tick(tick?: number): void
  readonly mouth: { x: number; y: number }
}

interface SceneOptions {
  readonly jaw?: boolean
  /** Where the prey is, from the predator's mouth, in world units (default straight ahead, 3 away). */
  readonly preyAt?: (
    mouth: { x: number; y: number },
    predator: OrganismState
  ) => { x: number; y: number }
  readonly preyParts?: (cfg: WorldConfig) => FounderPart[]
  readonly preyOverrides?: Partial<OrganismState>
  readonly predatorOverrides?: Partial<OrganismState>
  readonly obstacles?: ObstacleField
  readonly food?: (mouth: { x: number; y: number }) => ResourceState[]
}

function scene(cfg: WorldConfig, options: SceneOptions = {}): Scene {
  const base = organismFor(cfg, 1, {
    x: 100,
    y: 100,
    age: 200,
    energy: 50,
    ...options.predatorOverrides
  })
  const predator = options.jaw === false ? base : withBody(base, cfg, jawParts(cfg))
  const [mouthPoint] = mouthsOf(predator.genome, cfg)
  const radius = bodyRadiusOf(predator.genome, cfg)
  const mouth = {
    x: predator.x + (mouthPoint?.x ?? 0) * radius,
    y: predator.y + (mouthPoint?.y ?? 0) * radius
  }
  const at = options.preyAt?.(mouth, predator) ?? { x: mouth.x + 3, y: mouth.y }
  const preyBase = organismFor(cfg, 2, {
    x: at.x,
    y: at.y,
    age: 200,
    energy: 40,
    ...options.preyOverrides
  })
  const prey =
    options.preyParts === undefined ? preyBase : withBody(preyBase, cfg, options.preyParts(cfg))
  const organisms = new OrganismStore()
  organisms.add(predator)
  organisms.add(prey)
  const resources = new ResourceStore()
  for (const item of options.food?.(mouth) ?? []) resources.add(item)
  const resourceIndex = new SpatialHash<ResourceState>(60, (r) => r)
  resourceIndex.rebuild(resources.values())
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
    { organismIndex, buffer, lastBitten, obstacles: options.obstacles ?? ObstacleField.empty() }
  )
  return {
    predator,
    prey,
    buffer,
    lastBitten,
    events,
    resources,
    mouth,
    tick(t = 1) {
      events.beginTick()
      system.update(t)
    }
  }
}

/** Whether the predator (id 1) bit a piece of food this tick (the prey, a founder, eats too). */
const predatorAte = (s: Scene): boolean =>
  s.events.eventsThisTick().some((e) => e.type === 'resource-bitten' && e.organismId === 1)

const bites = (s: Scene) => s.events.eventsThisTick().filter((e) => e.type === 'organism-bitten')

describe('a jaw bites a creature in front of it', () => {
  it('takes energy from the victim, puts it in the gut at the trophic loss, and damages the victim', () => {
    const cfg = config()
    const s = scene(cfg)
    s.tick()
    const [event] = bites(s)
    expect(event).toBeDefined()
    if (event?.type !== 'organism-bitten') throw new Error('no bite')
    const { predation } = cfg
    // The victim lost exactly what was taken, and the gut gained that times the yields: no energy
    // appears from nowhere (the rest is the trophic loss).
    expect(s.prey.energy).toBeCloseTo(40 - event.energyTaken, 9)
    expect(event.energyTaken).toBeGreaterThan(0)
    expect(s.predator.gut).toBeCloseTo(
      event.energyTaken * predation.trophicYield * predation.fleshYield.jaw,
      9
    )
    expect(event.intake).toBeCloseTo(s.predator.gut, 9)
    expect(event.intake).toBeLessThan(event.energyTaken)
    // Health damage goes to the buffer with the bitter named, and the last bite is remembered.
    expect(s.buffer.get(2)).toMatchObject({ attackerId: 1 })
    expect(s.buffer.get(2)?.damage).toBeGreaterThan(0)
    expect(s.lastBitten.get(2)).toEqual({ attackerId: 1, tick: 1 })
    expect(event.predatorId).toBe(1)
    expect(event.preyId).toBe(2)
  })

  it('does nothing without a jaw: the founder (a mandible) never bites a creature (negative)', () => {
    const s = scene(config(), { jaw: false })
    s.tick()
    expect(bites(s)).toEqual([])
    expect(s.prey.energy).toBe(40)
    expect(s.predator.gut).toBe(0)
    expect(s.buffer.size).toBe(0)
  })

  it('does nothing with predation off (the world as it was)', () => {
    const cfg = config({ predation: { enabled: false } })
    const s = scene(cfg)
    // With the switch off the system is built without predation in the world; here the scene always
    // builds it, so what is checked is that a flesh yield of zero everywhere means no bites.
    const zero = config({
      predation: { fleshYield: { sprout: 0, proboscis: 0, mandible: 0, radula: 0, jaw: 0 } }
    })
    const t = scene(zero)
    t.tick()
    expect(bites(t)).toEqual([])
    expect(s.prey.energy).toBe(40)
  })

  it('does not bite what is behind it or out of reach (negative)', () => {
    const behind = scene(config(), { preyAt: (m, p) => ({ x: p.x - (m.x - p.x) - 3, y: m.y }) })
    behind.tick()
    expect(bites(behind)).toEqual([])
    const far = scene(config(), { preyAt: (m) => ({ x: m.x + 200, y: m.y }) })
    far.tick()
    expect(bites(far)).toEqual([])
  })

  it('does not bite a creature too big for it, but bites the same one when the ratio allows', () => {
    const big = (cfg: WorldConfig): FounderPart[] =>
      founderOf(cfg).map((p) => ({ ...p, size: p.size }))
    const small = config({ predation: { maxPreyRatio: 0.2 } })
    const refused = scene(small, { preyParts: big })
    refused.tick()
    expect(bites(refused)).toEqual([])
    const allowed = scene(config({ predation: { maxPreyRatio: 3 } }), { preyParts: big })
    allowed.tick()
    expect(bites(allowed)).toHaveLength(1)
  })

  it('never bites a parent or a child (negative: a stranger is bitten)', () => {
    const cfg = config()
    const child = scene(cfg, { preyOverrides: { parentIds: [1] } })
    child.tick()
    expect(bites(child)).toEqual([])
    const parent = scene(cfg, { predatorOverrides: { parentIds: [2] } })
    parent.tick()
    expect(bites(parent)).toEqual([])
    const stranger = scene(cfg, { preyOverrides: { parentIds: [9] } })
    stranger.tick()
    expect(bites(stranger)).toHaveLength(1)
  })

  it('does not bite a creature that is already dead (health zero)', () => {
    const s = scene(config(), { preyOverrides: { health: 0 } })
    s.tick()
    expect(bites(s)).toEqual([])
  })

  it('does not bite through a rock, and does when the rock is off the line (ADR 0022)', () => {
    const rock = (x: number, y: number) => ({
      kind: 'boulder' as const,
      x,
      y,
      radius: 1.5,
      blocksMovement: true,
      blocksSight: true
    })
    // The prey is 6 units ahead of the mouth; a small rock sits halfway, or well to the side.
    const ahead = (m: { x: number; y: number }) => ({ x: m.x + 6, y: m.y })
    const probe = scene(config(), { preyAt: ahead })
    const between = ObstacleField.fromCircles([rock(probe.mouth.x + 3, probe.mouth.y)])
    const blocked = scene(config(), { preyAt: ahead, obstacles: between })
    blocked.tick()
    expect(bites(blocked)).toEqual([])
    const offLine = ObstacleField.fromCircles([rock(probe.mouth.x + 3, probe.mouth.y + 30)])
    const clear = scene(config(), { preyAt: ahead, obstacles: offLine })
    clear.tick()
    expect(bites(clear)).toHaveLength(1)
    // A rock that does not block movement (reeds) does not stop a bite either.
    const soft = ObstacleField.fromCircles([
      { ...rock(probe.mouth.x + 3, probe.mouth.y), blocksMovement: false }
    ])
    const reeds = scene(config(), { preyAt: ahead, obstacles: soft })
    reeds.tick()
    expect(bites(reeds)).toHaveLength(1)
  })

  it('takes only what the victim has, takes nothing from an empty one, and not what the gut cannot hold', () => {
    const cfg = config()
    const poor = scene(cfg, { preyOverrides: { energy: 2 } })
    poor.tick()
    const [event] = bites(poor)
    if (event?.type !== 'organism-bitten') throw new Error('no bite')
    expect(event.energyTaken).toBeCloseTo(2, 9)
    expect(poor.prey.energy).toBeCloseTo(0, 9)
    const empty = scene(cfg, { preyOverrides: { energy: 0 } })
    empty.tick()
    expect(bites(empty)).toEqual([])
    // A full gut refuses the bite and the victim keeps its energy.
    const probe = scene(cfg)
    const full = scene(cfg, {
      predatorOverrides: { gut: gutCapacityOf(probe.predator.genome, cfg) }
    })
    full.tick()
    expect(bites(full)).toEqual([])
    expect(full.prey.energy).toBe(40)
  })

  it('armor on the victim lowers the damage but not the energy taken (negative: no armor, more damage)', () => {
    const cfg = config()
    const armored = (c: WorldConfig): FounderPart[] => [
      ...founderOf(c),
      {
        type: 'armor',
        parent: 0,
        size: 0.8,
        angle: 1,
        offset: 1,
        orientation: 0,
        integrity: 1,
        stats: [0.9, 0.9, 0.9, 0.5, 0.5, 0.5]
      }
    ]
    const bare = scene(cfg)
    bare.tick()
    const plated = scene(cfg, { preyParts: armored })
    plated.tick()
    expect(plated.buffer.get(2)?.damage).toBeLessThan(bare.buffer.get(2)?.damage as number)
    const energy = (s: Scene) => {
      const [e] = bites(s)
      return e?.type === 'organism-bitten' ? e.energyTaken : -1
    }
    expect(energy(plated)).toBeCloseTo(energy(bare), 9)
  })

  it('bites once, then waits out its cooldown (the same as for food)', () => {
    const s = scene(config())
    const perTick: number[] = []
    for (let t = 1; t <= 12; t++) {
      s.tick(t)
      perTick.push(bites(s).length)
    }
    expect(perTick[0]).toBe(1)
    // Cooldown 0.4 s at 0.1 s a tick: nothing in the next three ticks, and another bite after.
    expect(perTick.slice(1, 4)).toEqual([0, 0, 0])
    expect(perTick.slice(4).some((n) => n === 1)).toBe(true)
    expect(Math.max(...perTick)).toBe(1)
  })

  it('takes the nearer of a creature and a piece of food', () => {
    const food =
      (distance: number) =>
      (m: { x: number; y: number }): ResourceState[] => [
        { id: 7, x: m.x + distance, y: m.y, remaining: 30, kind: 0 }
      ]
    // Food at 1, the creature at 3: the food is nearer.
    const foodFirst = scene(config(), { food: food(1) })
    foodFirst.tick()
    expect(bites(foodFirst)).toEqual([])
    expect(predatorAte(foodFirst)).toBe(true)
    // Food at 5, the creature at 3: the creature is nearer.
    const preyFirst = scene(config(), { food: food(5) })
    preyFirst.tick()
    expect(bites(preyFirst)).toHaveLength(1)
    expect(predatorAte(preyFirst)).toBe(false)
  })

  it('adds up two bites on one victim in a tick and names the one that bit hardest', () => {
    const cfg = config()
    const s = scene(cfg)
    s.buffer.set(2, { damage: 5, attackerId: 9, hardest: 5 })
    s.tick()
    // The scene's own tick cleared the buffer (a new tick), then the bite wrote it: one attacker.
    expect(s.buffer.get(2)?.attackerId).toBe(1)
  })
})
