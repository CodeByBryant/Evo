import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { FounderPart, StartingBody, WorldConfig, WorldConfigOverrides } from '@evo/contracts'
import type { LastBitten, PredationBuffer } from '../../src/buffers/types'
import { Carcasses } from '../../src/ecology/Carcasses'
import { EcologyModel } from '../../src/ecology/EcologyModel'
import { HazardStore } from '../../src/ecology/HazardStore'
import { IdGenerator } from '../../src/entities/IdGenerator'
import { OrganismStore } from '../../src/entities/OrganismStore'
import { ResourceStore } from '../../src/entities/ResourceStore'
import { EventLog } from '../../src/events/EventLog'
import { HistoryStore } from '../../src/history/HistoryStore'
import { LineageStore } from '../../src/lineage/LineageStore'
import { factorsOf } from '../../src/organisms/bodyFactors'
import { DeathSystem } from '../../src/systems/DeathSystem'
import { HealthSystem } from '../../src/systems/HealthSystem'
import { World } from '../../src/world/World'
import { CARRION_KIND, withCarrion } from '../../src/world/predationConfig'
import { withoutEcology } from '../support/ecology'
import { organismFor } from '../support/organism'

// The rest of predation (ADR 0023): bite damage reaching health, a death labelled predation, what a
// dead body leaves, and whole worlds of hunters.

const config = (extra: WorldConfigOverrides = {}): WorldConfig =>
  resolveWorldConfig(
    withoutEcology({
      ...extra,
      ecology: { health: { enabled: true }, ...extra.ecology },
      predation: { enabled: true, ...extra.predation }
    })
  )

describe('HealthSystem with bites', () => {
  function health(cfg: WorldConfig, bites: PredationBuffer) {
    const organisms = new OrganismStore()
    organisms.add(organismFor(cfg, 1, { energy: 50 }))
    const events = new EventLog(100)
    events.beginTick()
    const system = new HealthSystem(
      cfg,
      organisms,
      new HazardStore(),
      new Map(),
      new Map(),
      events,
      new EcologyModel(cfg, null),
      bites
    )
    return { system, organisms, events }
  }

  it('takes the damage of the bites as the victim already had it reduced, and names the biter', () => {
    const cfg = config()
    const { system, organisms, events } = health(
      cfg,
      new Map([[1, { damage: 7, attackerId: 5, hardest: 7 }]])
    )
    const before = (organisms.get(1) as { health: number }).health
    system.update(1)
    expect((organisms.get(1) as { health: number }).health).toBeCloseTo(before - 7, 9)
    expect(events.eventsThisTick()).toMatchObject([
      { type: 'organism-damaged', organismId: 1, amount: 7, source: 'bite', attackerId: 5 }
    ])
  })

  it('does nothing without bites, and without the buffer (negative)', () => {
    const cfg = config()
    const none = health(cfg, new Map())
    none.system.update(1)
    expect(none.events.eventsThisTick()).toEqual([])
    const organisms = new OrganismStore()
    organisms.add(organismFor(cfg, 1))
    const events = new EventLog(10)
    events.beginTick()
    new HealthSystem(
      cfg,
      organisms,
      new HazardStore(),
      new Map(),
      new Map(),
      events,
      new EcologyModel(cfg, null)
    ).update(1)
    expect(events.eventsThisTick()).toEqual([])
  })

  it('calls bite damage on top of toxin damage "both" (more than one source)', () => {
    const cfg = config()
    const organisms = new OrganismStore()
    organisms.add(organismFor(cfg, 1, { energy: 50 }))
    const events = new EventLog(10)
    events.beginTick()
    new HealthSystem(
      cfg,
      organisms,
      new HazardStore(),
      new Map([[1, 2]]),
      new Map(),
      events,
      new EcologyModel(cfg, null),
      new Map([[1, { damage: 3, attackerId: 4, hardest: 3 }]])
    ).update(1)
    expect(events.eventsThisTick()[0]).toMatchObject({ source: 'both', amount: 5, attackerId: 4 })
  })
})

describe('DeathSystem with predation', () => {
  const WINDOW = 30

  function death(
    cfg: WorldConfig,
    energy: number,
    healthValue: number,
    age: number,
    bitten: LastBitten | undefined
  ) {
    const organisms = new OrganismStore()
    organisms.add(organismFor(cfg, 1, { energy, health: healthValue, age }))
    const events = new EventLog(10)
    events.beginTick()
    const history = new HistoryStore(10)
    const system = new DeathSystem(
      organisms,
      events,
      history,
      new LineageStore(),
      undefined,
      undefined,
      bitten === undefined ? undefined : { lastBitten: bitten, windowTicks: WINDOW }
    )
    return { system, organisms, events, history }
  }

  it('labels a starved or worn-down victim of a recent bite as killed by predation, with the killer', () => {
    const cfg = config()
    for (const [energy, hp] of [
      [0, 50],
      [30, 0]
    ] as const) {
      const bitten: LastBitten = new Map([[1, { attackerId: 8, tick: 90 }]])
      const { system, events, history, organisms } = death(cfg, energy, hp, 100, bitten)
      system.update(100)
      expect(organisms.has(1)).toBe(false)
      expect(events.eventsThisTick()[0]).toMatchObject({ cause: 'predation', killerId: 8 })
      expect(history.list()[0]).toMatchObject({ deathCause: 'predation', killedBy: 8 })
      expect(bitten.has(1)).toBe(false)
    }
  })

  it('leaves it starvation or damage when the bite was long ago, or with no predation (negatives)', () => {
    const cfg = config()
    const old: LastBitten = new Map([[1, { attackerId: 8, tick: 10 }]])
    const stale = death(cfg, 0, 50, 100, old)
    stale.system.update(100)
    expect(stale.events.eventsThisTick()[0]).toMatchObject({ cause: 'starvation' })
    expect(stale.events.eventsThisTick()[0]).not.toHaveProperty('killerId')
    expect(old.has(1)).toBe(false) // pruned: a bite older than the window explains nothing
    const off = death(cfg, 0, 50, 100, undefined)
    off.system.update(100)
    expect(off.events.eventsThisTick()[0]).toMatchObject({ cause: 'starvation' })
    const hurt = death(cfg, 30, 0, 100, undefined)
    hurt.system.update(100)
    expect(hurt.events.eventsThisTick()[0]).toMatchObject({ cause: 'damage' })
  })

  it('does not call old age predation, and does not touch a creature that is alive', () => {
    const cfg = config({ organisms: { maturityAge: 1, senescenceAge: 5, maxAge: 10 } })
    const bitten: LastBitten = new Map([[1, { attackerId: 8, tick: 99 }]])
    const old = death(cfg, 50, 50, 10, bitten)
    old.system.update(100)
    expect(old.events.eventsThisTick()[0]).toMatchObject({ cause: 'age' })
    const alive = death(cfg, 50, 50, 1, new Map([[1, { attackerId: 8, tick: 99 }]]))
    alive.system.update(100)
    expect(alive.organisms.has(1)).toBe(true)
  })

  it('hands every death to the carcass hook after the creature has been removed', () => {
    const cfg = config()
    const organisms = new OrganismStore()
    organisms.add(organismFor(cfg, 1, { energy: 0 }))
    organisms.add(organismFor(cfg, 2, { energy: 0 }))
    const events = new EventLog(10)
    events.beginTick()
    const seen: Array<[number, string, boolean]> = []
    new DeathSystem(
      organisms,
      events,
      new HistoryStore(10),
      new LineageStore(),
      undefined,
      undefined,
      undefined,
      (o, cause) => seen.push([o.id, cause, organisms.has(o.id)])
    ).update(3)
    expect(seen).toEqual([
      [1, 'starvation', false],
      [2, 'starvation', false]
    ])
  })
})

describe('carcasses', () => {
  // Carcasses are a food kind, so these worlds have the resource kinds on (`withoutEcology` turns them off).
  const full = (extra: WorldConfigOverrides = {}): WorldConfig =>
    withCarrion(
      config({ ...extra, ecology: { resourceKinds: { enabled: true }, ...extra.ecology } })
    )

  it('adds a carrion kind that never spawns and a carrion yield to every mouth form, only with predation', () => {
    const cfg = full()
    const names = cfg.ecology.resourceKinds.kinds.map((k) => k.name)
    expect(names.at(-1)).toBe(CARRION_KIND)
    expect(cfg.ecology.resourceKinds.kinds.at(-1)?.spawnWeight).toBe(0)
    for (const form of ['sprout', 'proboscis', 'mandible', 'radula', 'jaw'] as const) {
      expect(cfg.anatomy.mouthForms[form][CARRION_KIND]).toBe(cfg.predation.carcass.yields[form])
    }
    // Predation off, carcasses off, or kinds off: the very same object (negatives).
    const base = resolveWorldConfig({ predation: { enabled: false } })
    expect(withCarrion(base)).toBe(base)
    const noCarcass = config({ predation: { carcass: { enabled: false } } })
    expect(withCarrion(noCarcass)).toBe(noCarcass)
    const noKinds = config({ ecology: { resourceKinds: { enabled: false } } })
    expect(withCarrion(noKinds)).toBe(noKinds)
  })

  it('makes a mandible get no carcass yield while jaws keep a positive yield', () => {
    const cfg = full()
    const kind = cfg.ecology.resourceKinds.kinds.length - 1
    const founder = organismFor(cfg, 1)
    expect(factorsOf(founder.genome, cfg).dietEfficiency[kind]).toBeCloseTo(0, 9)
    expect(cfg.predation.carcass.yields.jaw).toBeGreaterThan(0)
  })

  function carcasses(extra: WorldConfigOverrides = {}) {
    const cfg = full(extra)
    const resources = new ResourceStore()
    const ids = new IdGenerator()
    const events = new EventLog(100)
    events.beginTick()
    const kind = cfg.ecology.resourceKinds.kinds.length - 1
    return {
      cfg,
      resources,
      ids,
      events,
      system: new Carcasses(cfg, resources, ids, events, kind),
      kind
    }
  }

  it('leaves one carcass worth the fraction of the energy and gut, where it died', () => {
    const { cfg, resources, system, events, kind } = carcasses()
    const dead = organismFor(cfg, 1, { x: 30, y: 40, energy: 20, gut: 10 })
    system.drop(dead, 5)
    const [item] = resources.values()
    expect(item).toMatchObject({ x: 30, y: 40, kind, bornTick: 5 })
    expect(item?.remaining).toBeCloseTo(cfg.predation.carcass.energyFraction * 30, 9)
    expect(events.eventsThisTick()).toMatchObject([
      { type: 'resource-spawned', kind, position: { x: 30, y: 40 } }
    ])
  })

  it('leaves nothing for a body worth less than the minimum, and not past the cap (negatives)', () => {
    const { cfg, resources, system } = carcasses({ predation: { carcass: { maxCount: 2 } } })
    system.drop(organismFor(cfg, 1, { energy: 1, gut: 0 }), 1)
    expect(resources.size).toBe(0)
    for (let i = 2; i <= 5; i++) system.drop(organismFor(cfg, i, { energy: 50 }), i)
    expect(resources.size).toBe(2)
    // A body at zero energy with a full gut still leaves its gut.
    const gutty = carcasses()
    gutty.system.drop(organismFor(gutty.cfg, 1, { energy: 0, gut: 30 }), 1)
    expect(gutty.resources.size).toBe(1)
  })

  it('numbers carcasses from the shared allocator in the order of the deaths', () => {
    const { cfg, resources, system, ids } = carcasses()
    ids.allocate()
    system.drop(organismFor(cfg, 1, { energy: 50 }), 1)
    system.drop(organismFor(cfg, 2, { energy: 50 }), 1)
    expect(resources.values().map((r) => r.id)).toEqual([1, 2])
    expect(ids.allocate()).toBe(3)
  })

  it('rots away after its lifespan and not before, and the count frees room for new ones', () => {
    const { cfg, resources, system } = carcasses({
      predation: { carcass: { lifespan: 10, maxCount: 1 } }
    })
    system.drop(organismFor(cfg, 1, { energy: 50 }), 0)
    system.update(50)
    expect(resources.size).toBe(1)
    system.update(100)
    expect(resources.size).toBe(0)
    system.drop(organismFor(cfg, 2, { energy: 50 }), 100)
    expect(resources.size).toBe(1)
    // A lifespan of zero never rots.
    const forever = carcasses({ predation: { carcass: { lifespan: 0 } } })
    forever.system.drop(organismFor(forever.cfg, 1, { energy: 50 }), 0)
    forever.system.update(1_000_000)
    expect(forever.resources.size).toBe(1)
  })
})

/** A world of hunters: the grazer body with its mouth turned into a jaw, forced as the only start. */
function hunterWorld(extra: WorldConfigOverrides = {}, seed = 1): World {
  const base = resolveWorldConfig()
  const grazer = base.anatomy.starters.find((s) => s.name === 'grazer') as StartingBody
  const hunter: StartingBody = {
    ...grazer,
    name: 'hunter',
    description: 'A jaw.',
    parts: grazer.parts.map((p): FounderPart =>
      p.type === 'mouth' ? { ...p, stats: [0.5, 0.65, 0.9, 0.5, 0.5, 0.5] } : p
    )
  }
  return World.create({
    seed,
    config: {
      ...extra,
      anatomy: {
        starters: [hunter],
        startingBody: { mode: 'archetypes', archetype: 'hunter', groups: [] }
      },
      predation: { enabled: true, ...extra.predation }
    }
  })
}

describe('a world of hunters', () => {
  it('bites, kills, leaves carcasses, and stays valid', () => {
    const world = hunterWorld()
    world.run(2000)
    const m = world.snapshot().metrics
    expect(m.predationBites).toBeGreaterThan(0)
    expect(m.deathsByPredation).toBeGreaterThan(0)
    expect(world.validate().ok).toBe(true)
    const carrion = world.config.ecology.resourceKinds.kinds.length - 1
    const events = world.events.list()
    expect(events.some((e) => e.type === 'resource-spawned' && e.kind === carrion)).toBe(true)
  })

  it('moves energy between creatures without creating any: every bite gains less than it took', () => {
    const world = hunterWorld({ history: { maxEvents: 600_000 } })
    world.run(1500)
    let bites = 0
    for (const e of world.events.list()) {
      if (e.type !== 'organism-bitten') continue
      bites++
      expect(e.intake).toBeGreaterThan(0)
      expect(e.intake).toBeLessThan(e.energyTaken)
      expect(e.energyTaken).toBeGreaterThan(0)
    }
    expect(bites).toBeGreaterThan(0)
  })

  it('counts a death by predation only with a killer, and a killer that was a creature', () => {
    const world = hunterWorld({ history: { maxEvents: 600_000 } })
    world.run(2000)
    const kills = world.events
      .list()
      .filter((e) => e.type === 'organism-died' && e.cause === 'predation')
    expect(kills.length).toBeGreaterThan(0)
    for (const e of kills) {
      expect(e.type === 'organism-died' && e.killerId).not.toBeUndefined()
      expect(e.type === 'organism-died' && e.killerId).not.toBe(
        e.type === 'organism-died' && e.organismId
      )
    }
  })

  it('a run in one go, in chunks and tick by tick end in the same state', () => {
    const one = hunterWorld({}, 4)
    const chunks = hunterWorld({}, 4)
    const steps = hunterWorld({}, 4)
    one.run(700)
    chunks.run(300)
    chunks.run(400)
    for (let i = 0; i < 700; i++) steps.run(1)
    expect(chunks.stateHash()).toBe(one.stateHash())
    expect(steps.stateHash()).toBe(one.stateHash())
  })
})

describe('the switch', () => {
  it('a world with predation on but no jaw is the world without it, carcasses aside', () => {
    // With no founder group the world starts without jaws; with carcasses off the only difference
    // is the code path, which must change nothing until a jaw is born by mutation (400 ticks, seed 5).
    const nobody = { startingBody: { groups: [] } }
    const off = World.create({
      seed: 5,
      config: { predation: { enabled: false }, anatomy: nobody }
    })
    const on = World.create({
      seed: 5,
      config: { predation: { enabled: true, carcass: { enabled: false } }, anatomy: nobody }
    })
    off.run(400)
    on.run(400)
    expect(on.snapshot().metrics.predationBites).toBe(0)
    expect(on.stateHash()).toBe(off.stateHash())
  })

  it('predation needs feeding and health (validation)', () => {
    expect(() =>
      resolveWorldConfig({ predation: { enabled: true }, feeding: { enabled: false } })
    ).toThrow(/needs feeding/)
    expect(() =>
      resolveWorldConfig({
        predation: { enabled: true },
        ecology: { health: { enabled: false } }
      })
    ).toThrow(/needs ecology.health/)
  })
})
