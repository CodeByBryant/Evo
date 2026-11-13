import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { WorldConfigOverrides, WorldEvent } from '@evo/contracts'
import { EventLog } from '../../src/events/EventLog'
import { OrganismStore } from '../../src/entities/OrganismStore'
import { MetabolismSystem } from '../../src/systems/MetabolismSystem'
import { World } from '../../src/index'
import { organismFor } from '../support/organism'
import { BEFORE_LIFE } from '../support/life'

/** The life cycle (ADR 0027): two sexes, a carried clutch, an egg, a hatchling. */
const LIFE: WorldConfigOverrides = {
  reproduction: { sexes: { enabled: true }, eggs: { enabled: true } }
}
const DT = 0.1

interface Run {
  world: World
  events: WorldEvent[]
  /** The sex of every creature seen, by id. */
  sexes: Map<number, number>
}

/** Runs a world and collects every event and every creature's sex, tick by tick. */
function run(config: WorldConfigOverrides, seed: number, ticks: number): Run {
  const world = World.create({ seed, config, validateEveryTicks: 50 })
  const events: WorldEvent[] = []
  const sexes = new Map<number, number>()
  const note = (): void => {
    for (const organism of world.snapshot().organisms) sexes.set(organism.id, organism.sex)
  }
  note()
  for (let t = 0; t < ticks; t++) {
    world.step()
    events.push(...world.events.eventsThisTick())
    note()
  }
  return { world, events, sexes }
}

const ofType = <T extends WorldEvent['type']>(
  events: readonly WorldEvent[],
  type: T
): Extract<WorldEvent, { type: T }>[] =>
  events.filter((event): event is Extract<WorldEvent, { type: T }> => event.type === type)

describe('configuration', () => {
  it('eggs need two sexes (the female lays)', () => {
    expect(() =>
      resolveWorldConfig({ reproduction: { sexes: { enabled: false }, eggs: { enabled: true } } })
    ).toThrow(/requires reproduction.sexes.enabled/)
    expect(() => resolveWorldConfig(LIFE)).not.toThrow()
  })

  it('rejects bad times, radii and costs, and unknown keys', () => {
    for (const eggs of [
      { incubation: 0 },
      { hatch: -1 },
      { guardRadius: 0 },
      { carryCost: -0.1 },
      { guardCost: -1 },
      { guardDamage: -1 },
      { enabled: 'yes' }
    ]) {
      expect(() => resolveWorldConfig({ reproduction: { eggs } as never })).toThrow()
    }
    expect(() => resolveWorldConfig({ reproduction: { sexes: { enabled: 1 } } as never })).toThrow()
    expect(() => resolveWorldConfig({ reproduction: { eggs: { nest: true } } as never })).toThrow()
  })

  it('is on by default: the measured life cycle (ADR 0027)', () => {
    const config = resolveWorldConfig()
    expect(config.reproduction.sexes.enabled).toBe(true)
    expect(config.reproduction.eggs.enabled).toBe(true)
  })
})

describe('switched off', () => {
  it('has no eggs, no clutches and every creature is sex 0', () => {
    const { world, events } = run(BEFORE_LIFE, 3, 1500)
    expect(ofType(events, 'egg-laid')).toHaveLength(0)
    expect(ofType(events, 'clutch-lost')).toHaveLength(0)
    const snapshot = world.snapshot()
    expect(snapshot.eggs).toEqual([])
    expect(snapshot.organisms.every((o) => o.sex === 0 && o.carrying === null)).toBe(true)
    expect(snapshot.metrics.eggsLaid).toBe(0)
  })
})

describe('two sexes', () => {
  it('founders alternate sex, draw-free', () => {
    const world = World.create({ seed: 5, config: LIFE })
    const sexes = world.snapshot().organisms.map((o) => o.sex)
    expect(sexes.slice(0, 6)).toEqual([0, 1, 0, 1, 0, 1])
    expect(sexes.filter((s) => s === 0).length).toBe(Math.ceil(sexes.length / 2))
  })

  it('only a female and a male conceive; the female is the mother', () => {
    const { events, sexes } = run(LIFE, 1, 4000)
    const conceptions = ofType(events, 'reproduction-attempted').filter((e) => e.succeeded)
    expect(conceptions.length).toBeGreaterThan(3)
    for (const attempt of conceptions) {
      const pair = [attempt.organismId, attempt.partnerId as number].map((id) => sexes.get(id))
      expect([...pair].sort()).toEqual([0, 1])
    }
    for (const laid of ofType(events, 'egg-laid')) {
      expect(sexes.get(laid.motherId)).toBe(0)
      expect(sexes.get(laid.fatherId)).toBe(1)
    }
  })

  it('negative: with one sex, same-sex pairs do occur (every creature is sex 0)', () => {
    const { events, sexes } = run(BEFORE_LIFE, 1, 3000)
    const births = ofType(events, 'organism-born').filter((e) => e.parentIds.length === 2)
    expect(births.length).toBeGreaterThan(3)
    expect([...sexes.values()].every((s) => s === 0)).toBe(true)
  })

  it('an instant birth with two sexes draws the newborn sex about evenly', () => {
    const { events, sexes } = run(
      { reproduction: { sexes: { enabled: true }, eggs: { enabled: false } } },
      2,
      6000
    )
    const born = ofType(events, 'organism-born').filter((e) => e.parentIds.length === 2)
    expect(born.length).toBeGreaterThan(25)
    const females = born.filter((e) => sexes.get(e.organismId) === 0).length
    expect(females / born.length).toBeGreaterThan(0.25)
    expect(females / born.length).toBeLessThan(0.75)
  })
})

describe('incubation, laying and hatching', () => {
  const lifeRun = run(LIFE, 1, 4500)

  it('lays exactly one egg per conception after exactly `incubation`, at the mother', () => {
    const { events } = lifeRun
    const laid = ofType(events, 'egg-laid')
    expect(laid.length).toBeGreaterThan(3)
    const incubation = Math.ceil(resolveWorldConfig(LIFE).reproduction.eggs.incubation / DT)
    for (const egg of laid) {
      const conception = ofType(events, 'reproduction-attempted').find(
        (e) =>
          e.succeeded &&
          [e.organismId, e.partnerId].includes(egg.motherId) &&
          [e.organismId, e.partnerId].includes(egg.fatherId) &&
          e.tick === egg.tick - incubation
      )
      expect(conception).toBeDefined()
      expect(conception?.childId).toBeNull()
    }
  })

  it('hatches exactly `hatch` after it was laid, not one tick earlier', () => {
    const { events, world } = lifeRun
    const hatch = Math.ceil(resolveWorldConfig(LIFE).reproduction.eggs.hatch / DT)
    const hatched = ofType(events, 'egg-hatched')
    expect(hatched.length).toBeGreaterThan(2)
    for (const h of hatched) {
      const laid = ofType(events, 'egg-laid').find((e) => e.eggId === h.eggId)
      expect(laid).toBeDefined()
      expect((laid?.tick ?? 0) + hatch).toBe(h.tick)
    }
    expect(world.snapshot().metrics.eggsHatched).toBe(hatched.length)
  })

  it('a hatchling is born with its parents, and the birth event comes with the hatch', () => {
    const { events } = lifeRun
    for (const h of ofType(events, 'egg-hatched')) {
      const born = ofType(events, 'organism-born').find((e) => e.organismId === h.organismId)
      expect(born?.tick).toBe(h.tick)
      expect(born?.parentIds).toEqual([h.motherId, h.fatherId])
    }
  })

  it('shows the clutch while carried and the egg while it lies; males never carry', () => {
    const world = World.create({ seed: 1, config: LIFE })
    let sawCarrying = false
    let sawEgg = false
    for (let t = 0; t < 4000; t++) {
      world.step()
      const snapshot = world.snapshot()
      for (const o of snapshot.organisms) {
        if (o.carrying !== null) {
          sawCarrying = true
          expect(o.sex).toBe(0)
        }
      }
      for (const egg of snapshot.eggs) {
        sawEgg = true
        expect(egg.progress).toBeGreaterThanOrEqual(0)
        expect(egg.progress).toBeLessThan(1)
      }
    }
    expect(sawCarrying).toBe(true)
    expect(sawEgg).toBe(true)
  })

  it('counts every egg against the population cap', () => {
    const world = World.create({
      seed: 2,
      config: { ...LIFE, maxPopulation: 26 },
      validateEveryTicks: 1
    })
    let peak = 0
    for (let t = 0; t < 3500; t++) {
      world.step()
      const snapshot = world.snapshot()
      const carrying = snapshot.organisms.filter((o) => o.carrying !== null).length
      peak = Math.max(peak, snapshot.organisms.length + snapshot.eggs.length + carrying)
      expect(snapshot.organisms.length + snapshot.eggs.length + carrying).toBeLessThanOrEqual(26)
    }
    expect(peak).toBeGreaterThan(21)
  })

  it('a clutch is lost with its mother, and the loss is counted', () => {
    // Carrying is made ruinous so that carriers die before they lay.
    const ruinous = run(
      { reproduction: { sexes: { enabled: true }, eggs: { enabled: true, carryCost: 40 } } },
      1,
      4000
    )
    const lost = ofType(ruinous.events, 'clutch-lost')
    expect(lost.length).toBeGreaterThan(0)
    expect(ruinous.world.snapshot().metrics.clutchesLost).toBe(lost.length)
    // Negative: the normal cost loses few or none.
    const normal = ofType(lifeRun.events, 'clutch-lost').length
    expect(normal).toBeLessThan(lost.length)
  })

  it('is deterministic and the same stepped, chunked or run at once, across hatches', () => {
    const a = World.create({ seed: 4, config: LIFE })
    a.run(3000)
    const b = World.create({ seed: 4, config: LIFE })
    for (let t = 0; t < 3000; t++) b.step()
    const c = World.create({ seed: 4, config: LIFE })
    c.run(1234)
    c.run(1766)
    expect(a.snapshot().metrics.eggsHatched).toBeGreaterThan(0)
    expect(b.stateHash()).toBe(a.stateHash())
    expect(c.stateHash()).toBe(a.stateHash())
  })
})

describe('the hash covers the life cycle', () => {
  it('differs with sexes on and off, and with eggs on and off', () => {
    const hash = (config: WorldConfigOverrides): string => {
      const world = World.create({ seed: 6, config })
      world.run(1500)
      return world.stateHash()
    }
    const off = hash(BEFORE_LIFE)
    const sexes = hash({
      ...BEFORE_LIFE,
      reproduction: { ...BEFORE_LIFE.reproduction, sexes: { enabled: true } }
    })
    const eggs = hash({
      ...BEFORE_LIFE,
      reproduction: {
        ...BEFORE_LIFE.reproduction,
        sexes: { enabled: true },
        eggs: { enabled: true }
      }
    })
    expect(new Set([off, sexes, eggs]).size).toBe(3)
  })
})

describe('carrying costs energy', () => {
  it('a pregnant female pays `carryCost` per second on top; a male and an empty female pay none', () => {
    const config = resolveWorldConfig({
      ...LIFE,
      reproduction: { sexes: { enabled: true }, eggs: { enabled: true, carryCost: 2 } },
      learning: { controller: 'reflex' }
    })
    const pregnancy = organismFor(config, 9).genome
    const energyAfter = (overrides: Parameters<typeof organismFor>[2]): number => {
      const organisms = new OrganismStore()
      organisms.add(organismFor(config, 1, { energy: 50, ...overrides }))
      new MetabolismSystem(config, organisms, new EventLog(10), null).update(1)
      return (organisms.get(1) as { energy: number }).energy
    }
    const empty = energyAfter({ sex: 0 })
    const carrying = energyAfter({
      sex: 0,
      pregnancy: { genome: pregnancy, fatherId: 2, speciesId: null, energy: 20, layTick: 50 }
    })
    expect(empty - carrying).toBeCloseTo(2 * DT, 10)
    expect(energyAfter({ sex: 1 })).toBe(empty)
  })
})
