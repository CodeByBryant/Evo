import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { AgeingConfig, WorldConfigOverrides } from '@evo/contracts'
import { OrganismStore } from '../../src/entities/OrganismStore'
import { EventLog } from '../../src/events/EventLog'
import { HistoryStore } from '../../src/history/HistoryStore'
import { LineageStore } from '../../src/lineage/LineageStore'
import {
  ageingCostFactor,
  ageingFertilityFactor,
  ageingSpeedFactor,
  senescenceOf
} from '../../src/organisms/ageing'
import { ReproductionReadiness } from '../../src/organisms/reproductionReadiness'
import type { RandomSource } from '../../src/random/RandomSource'
import { DeathSystem } from '../../src/systems/DeathSystem'
import { MetabolismSystem } from '../../src/systems/MetabolismSystem'
import { World } from '../../src/index'
import { organismFor } from '../support/organism'

// Ageing (ADR 0027): decline past `senescenceAge` and a chance of dying that rises with age,
// instead of a hard cutoff at `maxAge`.

const AGES = { senescenceAge: 100, maxAge: 200 }
const ON: AgeingConfig = {
  enabled: true,
  metabolismRise: 0.5,
  speedLoss: 0.3,
  fertilityLoss: 0.5,
  hazard: 0.04,
  ceiling: 2
}

describe('senescence', () => {
  it('is 0 until senescenceAge, 1 at maxAge and above 1 beyond it', () => {
    expect(senescenceOf(0, AGES)).toBe(0)
    expect(senescenceOf(100, AGES)).toBe(0)
    expect(senescenceOf(150, AGES)).toBeCloseTo(0.5, 12)
    expect(senescenceOf(200, AGES)).toBeCloseTo(1, 12)
    expect(senescenceOf(300, AGES)).toBeCloseTo(2, 12)
  })

  it('never divides by zero when the two ages meet', () => {
    expect(Number.isFinite(senescenceOf(500, { senescenceAge: 300, maxAge: 300 }))).toBe(true)
  })
})

describe('the decline', () => {
  it('is exactly 1 with ageing off, whatever the age (negative)', () => {
    const off = { ...ON, enabled: false }
    for (const age of [0, 150, 400]) {
      expect(ageingCostFactor(off, age, AGES)).toBe(1)
      expect(ageingSpeedFactor(off, age, AGES)).toBe(1)
      expect(ageingFertilityFactor(off, age, AGES)).toBe(1)
    }
  })

  it('is exactly 1 in prime, with ageing on', () => {
    expect(ageingCostFactor(ON, 100, AGES)).toBe(1)
    expect(ageingSpeedFactor(ON, 100, AGES)).toBe(1)
    expect(ageingFertilityFactor(ON, 100, AGES)).toBe(1)
  })

  it('costs more, slows and needs more energy to breed as a creature ages, within bounds', () => {
    expect(ageingCostFactor(ON, 150, AGES)).toBeCloseTo(1.25, 12)
    expect(ageingCostFactor(ON, 200, AGES)).toBeCloseTo(1.5, 12)
    // The cost rise is capped at s = 2, speed and fertility at s = 1.
    expect(ageingCostFactor(ON, 900, AGES)).toBeCloseTo(2, 12)
    expect(ageingSpeedFactor(ON, 150, AGES)).toBeCloseTo(0.85, 12)
    expect(ageingSpeedFactor(ON, 900, AGES)).toBeCloseTo(0.7, 12)
    expect(ageingFertilityFactor(ON, 150, AGES)).toBeCloseTo(1.25, 12)
    expect(ageingFertilityFactor(ON, 900, AGES)).toBeCloseTo(1.5, 12)
  })

  it('an old creature pays more in metabolism than a young one, and none extra with ageing off', () => {
    const energyLoss = (enabled: boolean, age: number): number => {
      const config = resolveWorldConfig({
        learning: { controller: 'reflex' },
        ageing: { enabled }
      })
      const old = organismFor(config, 1, { energy: 50, age })
      const organisms = new OrganismStore()
      organisms.add(old)
      const before = old.energy
      new MetabolismSystem(config, organisms, new EventLog(10), null).update(1)
      return before - old.energy
    }
    const maxAge = organismFor(resolveWorldConfig(), 1).genome.physical.maxAge
    const youngCost = energyLoss(true, 120)
    expect(energyLoss(true, maxAge)).toBeGreaterThan(youngCost * 1.25)
    // Negative: with ageing off an old creature costs what a prime one does.
    expect(energyLoss(false, maxAge)).toBeCloseTo(energyLoss(false, 120), 12)
  })

  it('an old creature needs more energy to be ready to reproduce', () => {
    const config = resolveWorldConfig({ ageing: { enabled: true } })
    const readiness = new ReproductionReadiness(config, null)
    const genes = organismFor(config, 1).genome.physical
    const prime = organismFor(config, 1, { age: genes.maturityAge + 1 })
    const old = organismFor(config, 2, { age: genes.maxAge })
    expect(readiness.thresholdFor(old, 0)).toBeGreaterThan(readiness.thresholdFor(prime, 0))
    const off = new ReproductionReadiness(resolveWorldConfig({ ageing: { enabled: false } }), null)
    expect(off.thresholdFor(old, 0)).toBe(off.thresholdFor(prime, 0))
  })
})

describe('death of old age is a chance, not a cutoff', () => {
  const config = resolveWorldConfig({ learning: { controller: 'reflex' } })

  /** Runs the death system once over one creature of `age`; returns whether it died and the draws made. */
  function dies(
    ageing: AgeingConfig | undefined,
    age: number,
    draw = 0.5
  ): { died: boolean; draws: number } {
    const organisms = new OrganismStore()
    const lineage = new LineageStore()
    const creature = organismFor(config, 1, { age, energy: 50, health: 100 })
    organisms.add(creature)
    lineage.register({ genomeId: creature.genome.id, parentGenomeIds: [], organismId: 1, tick: 0 })
    let draws = 0
    const random: RandomSource = {
      float: () => {
        draws += 1
        return draw
      }
    } as RandomSource
    new DeathSystem(
      organisms,
      new EventLog(10),
      new HistoryStore(10),
      lineage,
      undefined,
      undefined,
      undefined,
      undefined,
      ageing === undefined ? undefined : { config: ageing, timestep: config.timestep, random }
    ).update(1)
    return { died: !organisms.has(1), draws }
  }
  const { maxAge, senescenceAge } = organismFor(config, 1).genome.physical

  it('without ageing the creature dies at maxAge exactly, as before (negative)', () => {
    expect(dies(undefined, maxAge - 0.01).died).toBe(false)
    expect(dies(undefined, maxAge).died).toBe(true)
  })

  it('with ageing there is no cutoff at maxAge: a lucky draw survives it', () => {
    expect(dies(ON, maxAge, 0.99).died).toBe(false)
  })

  it('an unlucky draw kills an old creature, and the chance rises with age', () => {
    const mid = (senescenceAge + maxAge) / 2
    // hazard x s x dt: at the middle s = 0.5, so the chance a tick is 0.04 x 0.5 x 0.1.
    expect(dies(ON, mid, 0.0019).died).toBe(true)
    expect(dies(ON, mid, 0.0021).died).toBe(false)
    expect(dies(ON, maxAge, 0.0039).died).toBe(true)
    expect(dies(ON, maxAge, 0.0041).died).toBe(false)
  })

  it('draws nothing for a creature in its prime (negative)', () => {
    expect(dies(ON, senescenceAge - 1, 0).draws).toBe(0)
    expect(dies(ON, senescenceAge - 1, 0).died).toBe(false)
    expect(dies(ON, senescenceAge + 1, 0.99).draws).toBe(1)
  })

  it('death is certain at ceiling times maxAge', () => {
    expect(dies(ON, maxAge * ON.ceiling, 0.99).died).toBe(true)
    expect(dies(ON, maxAge * ON.ceiling - 1, 0.99).died).toBe(false)
  })
})

describe('in a world', () => {
  const SHORT: WorldConfigOverrides = {
    organisms: { maxAge: 120, senescenceAge: 80, maturityAge: 30 }
  }

  it('creatures outlive their maxAge with ageing on and never without it', () => {
    const oldest = (enabled: boolean): number => {
      const world = World.create({
        seed: 3,
        config: { ...SHORT, ageing: { enabled, hazard: 0.005 } }
      })
      let max = 0
      for (let t = 0; t < 2500; t++) {
        world.step()
        if (t % 50 === 0) {
          for (const o of world.snapshot().organisms) max = Math.max(max, o.age / o.maxAge)
        }
      }
      return max
    }
    expect(oldest(true)).toBeGreaterThan(1)
    expect(oldest(false)).toBeLessThanOrEqual(1)
  })

  it('is deterministic and the same stepped or chunked', () => {
    const config = { ...SHORT, ageing: { enabled: true } }
    const a = World.create({ seed: 4, config })
    a.run(1500)
    const b = World.create({ seed: 4, config })
    b.run(700)
    b.run(800)
    expect(b.stateHash()).toBe(a.stateHash())
  })
})

describe('configuration', () => {
  it('is on by default: the measured ageing (ADR 0027)', () => {
    expect(resolveWorldConfig().ageing.enabled).toBe(true)
  })

  it('rejects bad values and unknown keys', () => {
    for (const ageing of [
      { enabled: 'yes' },
      { metabolismRise: -1 },
      { speedLoss: 1 },
      { fertilityLoss: -0.1 },
      { hazard: -1 },
      { ceiling: 1 },
      { cure: true }
    ]) {
      expect(() => resolveWorldConfig({ ageing: ageing as never })).toThrow()
    }
    expect(() => resolveWorldConfig({ ageing: { enabled: true, hazard: 0 } })).not.toThrow()
  })
})
