import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import { REFERENCE_FIELD_SIZE, fieldScaling } from '../../src/world/fieldScaling'
import { effectiveConfig } from '../../src/world/clusterScaling'
import { World } from '../../src/world/World'

// A bigger field has more place (biomes, hazards) and the same population (ADR 0021).

const at = (width: number, height = width): ReturnType<typeof resolveWorldConfig> =>
  resolveWorldConfig({ environment: { width, height } })

describe('fieldScaling', () => {
  it('is the identity at the reference size: the same object back', () => {
    const config = at(REFERENCE_FIELD_SIZE)
    expect(fieldScaling(config)).toBe(config)
    expect(effectiveConfig(config)).toBe(config)
  })

  it('scales biomes, static hazards and storms with the area, and keeps the lookup cell size', () => {
    const base = at(500)
    const big = fieldScaling(at(700))
    const area = (700 * 700) / (500 * 500)
    expect(big.ecology.regions.seedCount).toBe(Math.round(base.ecology.regions.seedCount * area))
    expect(big.ecology.hazards.areaCount).toBe(Math.round(base.ecology.hazards.areaCount * area))
    expect(big.ecology.hazards.stormRate).toBeCloseTo(base.ecology.hazards.stormRate * area, 12)
    // 25 cells over 500 units is 20 units a cell; 700 units keeps 20 with 35 cells
    expect(big.ecology.regions.gridSize).toBe(35)
    const huge = fieldScaling(at(1000))
    expect(huge.ecology.regions.seedCount).toBe(base.ecology.regions.seedCount * 4)
    expect(huge.ecology.regions.gridSize).toBe(50)
  })

  it('does not touch the population: food supply, organism counts, the food pattern and the rest', () => {
    const base = at(500)
    const big = fieldScaling(at(1000))
    expect(big.resources).toEqual(base.resources)
    expect(big.organisms).toEqual(base.organisms)
    expect(big.maxPopulation).toBe(base.maxPopulation)
    expect(big.reproduction).toEqual(base.reproduction)
    expect(big.ecology.resourceKinds).toEqual(base.ecology.resourceKinds)
    expect(big.ecology.seasons).toEqual(base.ecology.seasons)
    expect(big.environment.width).toBe(1000)
  })

  it('never loses the last biome or hazard in a small world, and leaves a zero hazard count at zero', () => {
    const tiny = fieldScaling(at(100))
    expect(tiny.ecology.regions.seedCount).toBeGreaterThanOrEqual(1)
    expect(tiny.ecology.hazards.areaCount).toBeGreaterThanOrEqual(1)
    expect(tiny.ecology.regions.gridSize).toBeGreaterThanOrEqual(2)
    const none = resolveWorldConfig({
      environment: { width: 700, height: 700 },
      ecology: { hazards: { areaCount: 0 } }
    })
    expect(fieldScaling(none).ecology.hazards.areaCount).toBe(0)
  })

  it('uses the area for a field that is not square and the longer side for the lookup grid', () => {
    const base = at(500).ecology.regions.seedCount
    // 1000 x 125 is half the reference area; 1000 x 250 is exactly the reference area
    const half = fieldScaling(at(1000, 125))
    expect(half.ecology.regions.seedCount).toBe(Math.round(base * 0.5))
    expect(half.ecology.regions.gridSize).toBe(50)
    const same = fieldScaling(at(1000, 250))
    expect(same.ecology.regions.seedCount).toBe(base)
    expect(same.ecology.regions.gridSize).toBe(50) // not the identity: the field is not the reference field
  })

  it('leaves the cluster layout to its own scaling', () => {
    const clusters = resolveWorldConfig({
      environment: { layout: 'clusters', width: 700, height: 700 }
    })
    const effective = effectiveConfig(clusters)
    expect(effective.ecology.regions.seedCount).toBe(clusters.ecology.regions.seedCount)
    expect(effective.ecology.hazards.areaCount).toBe(clusters.ecology.hazards.areaCount)
  })
})

describe('a world on a bigger field', () => {
  it('runs with the scaled terrain, and a 500 world is bit-identical to one that never knew about scaling', () => {
    const big = World.create({ seed: 3, config: { environment: { width: 700, height: 700 } } })
    expect(big.config.ecology.regions.seedCount).toBe(59)
    expect(big.terrain()?.gridSize).toBe(35)
    big.run(300)
    expect(big.validate()).toEqual({ ok: true, errors: [] })
    const a = World.create({ seed: 3 })
    const b = World.create({ seed: 3, config: { environment: { width: 500, height: 500 } } })
    a.run(200)
    b.run(200)
    expect(b.stateHash()).toBe(a.stateHash())
  })

  it('keeps the food supply and the creature count of the 500 world (spread thinner, not more of them)', () => {
    const base = World.create({ seed: 4 })
    const big = World.create({ seed: 4, config: { environment: { width: 800, height: 800 } } })
    expect(big.snapshot().organisms.length).toBe(base.snapshot().organisms.length)
    expect(big.config.resources.spawnRate).toBe(base.config.resources.spawnRate)
    expect(big.config.resources.maxCount).toBe(base.config.resources.maxCount)
  })
})
