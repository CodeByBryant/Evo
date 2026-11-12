import { describe, expect, it } from 'vitest'
import { BRAIN_INPUT_GROUPS } from '@evo/contracts'
import type { WorldConfigOverrides } from '@evo/contracts'
import { World } from '../../src/world/World'

// The observatory records indicators over time and changes nothing (ADR 0024).

const fast = (extra: WorldConfigOverrides = {}): WorldConfigOverrides => ({
  observatory: { sampleEvery: 200, behaviourEvery: 10 },
  ...extra
})

describe('the series', () => {
  it('starts with a baseline at tick 0 and samples every sampleEvery ticks', () => {
    const world = World.create({ seed: 3, config: fast() })
    world.run(1000)
    const series = world.observatory()!
    expect(series.sampleEvery).toBe(200)
    expect(series.samples.map((s) => s.tick)).toEqual([0, 200, 400, 600, 800, 1000])
    expect(series.baseline).toEqual(series.samples[0])
    expect(series.samples[1]!.time).toBeCloseTo(200 * world.config.timestep, 12)
  })

  it('describes the founders at tick 0: 20 creatures, every lineage alive, brains a little off the prior, the new senses wired', () => {
    const world = World.create({ seed: 3, config: fast() })
    const s = world.observatory()!.baseline!
    expect(s.population).toBe(20)
    expect(s.foundersAlive).toBe(20)
    expect(s.maxGeneration).toBe(0)
    expect(s.priorDrift).toBeGreaterThan(0)
    expect(s.priorDrift).toBeLessThan(1)
    for (const group of BRAIN_INPUT_GROUPS) expect(s.inputUsage[group]).toBeGreaterThan(0)
    // the default world starts with a hunter group on a nectar sipper's body: two body plans
    expect(s.plansAlive).toBe(2)
    expect(s.effectivePlans).toBeGreaterThan(1)
    expect(s.newPlans).toBe(2)
    expect(s.rate).toBe(0)
    expect(s.stasis).toBe(false)
  })

  it('keeps every share and count in its range over a run', () => {
    const world = World.create({ seed: 5, config: fast() })
    world.run(2000)
    for (const s of world.observatory()!.samples) {
      expect(s.population).toBeGreaterThanOrEqual(0)
      for (const v of [
        s.bodySpread,
        s.brainSpread,
        s.youngSpeciesShare,
        s.intakePlant,
        s.intakeFlesh,
        s.intakeCarrion
      ]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      const total = s.intakePlant + s.intakeFlesh + s.intakeCarrion
      expect(total === 0 || Math.abs(total - 1) < 1e-9).toBe(true)
      expect(s.plansEver).toBeGreaterThanOrEqual(s.plansAlive)
      expect(s.persistentPlans).toBeLessThanOrEqual(s.plansEver)
      expect(s.maxGeneration).toBeGreaterThanOrEqual(Math.floor(s.meanGeneration))
      expect(Number.isFinite(s.rate)).toBe(true)
    }
  })

  it('sees births: generations rise and species are counted', () => {
    const world = World.create({ seed: 3, config: fast() })
    world.run(3000)
    const last = world.observatory()!.samples.at(-1)!
    expect(world.snapshot().metrics.organismsBorn).toBeGreaterThan(20)
    expect(last.maxGeneration).toBeGreaterThan(0)
    expect(last.speciesEver).toBeGreaterThanOrEqual(1)
  })

  it('hands out copies: changing what it returned changes nothing (negative)', () => {
    const world = World.create({ seed: 3, config: fast() })
    world.run(400)
    const a = world.observatory()!
    ;(a.samples[0] as { population: number }).population = 999
    ;(a.samples[0]!.inputUsage as Record<string, number>)['food'] = 999
    const b = world.observatory()!
    expect(b.samples[0]!.population).toBe(20)
    expect(b.samples[0]!.inputUsage.food).toBeLessThan(10)
  })

  it('drops the oldest samples past maxSamples but keeps the baseline', () => {
    const world = World.create({
      seed: 3,
      config: fast({ observatory: { sampleEvery: 100, maxSamples: 4 } })
    })
    world.run(1000)
    const series = world.observatory()!
    expect(series.samples).toHaveLength(4)
    expect(series.samples[0]!.tick).toBe(700)
    expect(series.baseline!.tick).toBe(0)
  })
})

describe('switched off', () => {
  it('records nothing', () => {
    const world = World.create({ seed: 3, config: { observatory: { enabled: false } } })
    world.run(500)
    expect(world.observatory()).toBeNull()
  })
})

describe('it changes nothing', () => {
  it.each([1, 3, 7])('seed %i: the same state hash with the observatory on and off', (seed) => {
    const on = World.create({ seed, config: fast() })
    const off = World.create({ seed, config: { observatory: { enabled: false } } })
    on.run(3000)
    off.run(3000)
    expect(on.stateHash()).toBe(off.stateHash())
    expect(on.snapshot()).toEqual(off.snapshot())
  })

  it('also with the reflex controller and predation off', () => {
    const base = { learning: { controller: 'reflex' as const }, predation: { enabled: false } }
    const on = World.create({ seed: 4, config: { ...base, ...fast() } })
    const off = World.create({ seed: 4, config: { ...base, observatory: { enabled: false } } })
    on.run(2000)
    off.run(2000)
    expect(on.stateHash()).toBe(off.stateHash())
  })

  it('a run is the same series however it is sliced: single, chunked and stepped', () => {
    const make = () =>
      World.create({ seed: 2, config: fast({ observatory: { sampleEvery: 100 } }) })
    const single = make()
    single.run(1200)
    const chunked = make()
    for (let i = 0; i < 4; i++) chunked.run(300)
    const stepped = make()
    for (let i = 0; i < 1200; i++) stepped.step()
    expect(chunked.observatory()).toEqual(single.observatory())
    expect(stepped.observatory()).toEqual(single.observatory())
  })
})
