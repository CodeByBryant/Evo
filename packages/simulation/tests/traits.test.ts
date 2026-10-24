import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import {
  basalCostOf,
  maxEnergyOf,
  reproductionCostOf,
  reproductionThresholdOf,
  sensorCostOf,
  sizeFactor
} from '../src/organisms/traits'
import { organismFor, withGenes } from './support/organism'

const config = resolveWorldConfig()
const founder = organismFor(config, 1).genome

describe('derived traits at the founder baseline equal their Phase 3 values exactly', () => {
  it('size factor is exactly 1', () => {
    expect(sizeFactor(founder, config)).toBe(1)
  })

  it('energy capacity is organisms.maxEnergy', () => {
    expect(maxEnergyOf(founder, config)).toBe(config.organisms.maxEnergy)
  })

  it('basal cost is organisms.basalCost', () => {
    expect(basalCostOf(founder, config)).toBe(config.organisms.basalCost)
  })

  it('sensor cost is organisms.sensorCost', () => {
    expect(sensorCostOf(founder, config)).toBe(config.organisms.sensorCost)
  })

  it('reproduction cost is 20 and the threshold is the 60 minEnergy', () => {
    expect(reproductionCostOf(founder, config)).toBe(20)
    expect(reproductionThresholdOf(founder, config)).toBe(60)
  })

  it('stays exact for non-default baselines too', () => {
    const custom = resolveWorldConfig({
      organisms: { radius: 3, maxEnergy: 70, sensorRadius: 80, basalCost: 0.7, sensorCost: 0.15 }
    })
    const genome = organismFor(custom, 1).genome
    expect(sizeFactor(genome, custom)).toBe(1)
    expect(maxEnergyOf(genome, custom)).toBe(70)
    expect(basalCostOf(genome, custom)).toBe(0.7)
    expect(sensorCostOf(genome, custom)).toBe(0.15)
  })
})

describe('capability is not free', () => {
  it('a body twice as wide holds four times the energy and burns four times as much', () => {
    const big = withGenes(organismFor(config, 1), { 'physical.radius': 10 }).genome
    expect(sizeFactor(big, config)).toBe(4)
    expect(maxEnergyOf(big, config)).toBe(4 * config.organisms.maxEnergy)
    expect(basalCostOf(big, config)).toBe(4 * big.metabolic.basalCost)
  })

  it('a smaller body holds and burns proportionally less', () => {
    const small = withGenes(organismFor(config, 1), { 'physical.radius': 2.5 }).genome
    expect(sizeFactor(small, config)).toBe(0.25)
    expect(maxEnergyOf(small, config)).toBe(config.organisms.maxEnergy / 4)
  })

  it('a longer sensor costs proportionally more to run', () => {
    const far = withGenes(organismFor(config, 1), { 'sensory.sensorRadius': 120 }).genome
    expect(sensorCostOf(far, config)).toBe(2 * config.organisms.sensorCost)
    const near = withGenes(organismFor(config, 1), { 'sensory.sensorRadius': 30 }).genome
    expect(sensorCostOf(near, config)).toBe(0.5 * config.organisms.sensorCost)
  })

  it('a parent pays its own investment plus the transfer overhead', () => {
    const generous = withGenes(organismFor(config, 1), {
      'reproduction.offspringInvestment': 25
    }).genome
    expect(reproductionCostOf(generous, config)).toBe(40)
    const overheadFree = resolveWorldConfig({ reproduction: { overheadFraction: 0 } })
    expect(reproductionCostOf(generous, overheadFree)).toBe(25)
  })
})

describe('reproductionThresholdOf', () => {
  it('is the minEnergy gene when it already covers the cost', () => {
    const genome = withGenes(organismFor(config, 1), { 'reproduction.minEnergy': 80 }).genome
    expect(reproductionThresholdOf(genome, config)).toBe(80)
  })

  it('never falls below the cost, so paying cannot drive energy negative', () => {
    const genome = withGenes(organismFor(config, 1), {
      'reproduction.minEnergy': 10,
      'reproduction.offspringInvestment': 25
    }).genome
    expect(reproductionThresholdOf(genome, config)).toBe(40)
  })
})
