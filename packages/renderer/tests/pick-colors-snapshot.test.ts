import { describe, expect, it } from 'vitest'
import type { RenderOrganism, WorldSnapshot } from '@evo/contracts'
import {
  REGION_COLORS,
  buildRenderSnapshot,
  hexToNumber,
  hslToHex,
  pickOrganism,
  resourceColor,
  speciesColor,
  speciesHue
} from '../src/index'

const organism = (id: number, x: number, y: number, radius = 5): RenderOrganism => ({
  id,
  x,
  y,
  rotation: 0,
  radius,
  hue: 0,
  speciesColor: '#ffffff',
  speciesId: 0,
  lifeStage: 'mature',
  energyRatio: 1,
  healthRatio: 1,
  selected: false
})

describe('pickOrganism', () => {
  const organisms = [organism(1, 100, 100), organism(2, 108, 100), organism(3, 300, 300, 20)]

  it('picks the nearest organism whose body contains the point', () => {
    expect(pickOrganism(organisms, 101, 100, 1, 0)).toBe(1)
    expect(pickOrganism(organisms, 107, 100, 1, 0)).toBe(2)
    expect(pickOrganism(organisms, 310, 300, 1, 0)).toBe(3)
  })

  it('returns null for empty space', () => {
    expect(pickOrganism(organisms, 200, 200, 1, 0)).toBeNull()
    expect(pickOrganism([], 0, 0, 1)).toBeNull()
  })

  it('gives small organisms a pixel tolerance that shrinks as you zoom in', () => {
    // 20 world units from the centre: outside the radius of 5 plus 8 px of slack at zoom 1.
    expect(pickOrganism([organism(1, 0, 0)], 20, 0, 1, 8)).toBeNull()
    // Zoomed out, 8 px is many world units, so it is hit.
    expect(pickOrganism([organism(1, 0, 0)], 20, 0, 0.5, 8)).toBe(1)
    // A touch gets a larger tolerance.
    expect(pickOrganism([organism(1, 0, 0)], 20, 0, 1, 16)).toBe(1)
  })

  it('breaks exact ties toward the lower id', () => {
    const twins = [organism(7, 10, 0), organism(3, -10, 0)]
    expect(pickOrganism(twins, 0, 0, 1, 20)).toBe(3)
  })
})

describe('colors', () => {
  it('give a stable hue per species, spread across the wheel', () => {
    expect(speciesHue(0)).toBe(speciesHue(0))
    const hues = [0, 1, 2, 3, 4, 5, 6, 7].map((id) => speciesHue(id))
    for (const hue of hues) {
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
    }
    // consecutive species are never near each other
    for (let i = 1; i < hues.length; i++) {
      const gap = Math.abs((hues[i] as number) - (hues[i - 1] as number))
      expect(Math.min(gap, 360 - gap)).toBeGreaterThan(60)
    }
    expect(new Set(hues.map((h) => Math.round(h))).size).toBe(hues.length)
  })

  it('has a neutral color for no species', () => {
    expect(speciesColor(null)).toMatch(/^#[0-9a-f]{6}$/)
    expect(speciesHue(null)).toBe(210)
  })

  it('converts HSL to hex correctly at the primaries', () => {
    expect(hslToHex(0, 1, 0.5)).toBe('#ff0000')
    expect(hslToHex(120, 1, 0.5)).toBe('#00ff00')
    expect(hslToHex(240, 1, 0.5)).toBe('#0000ff')
    expect(hslToHex(360, 1, 0.5)).toBe('#ff0000')
    expect(hslToHex(-120, 1, 0.5)).toBe('#0000ff')
  })

  it('parses hex to a number and cycles resource colors', () => {
    expect(hexToNumber('#ff8000')).toBe(0xff8000)
    expect(resourceColor(0)).toBe(resourceColor(4))
    expect(resourceColor(-1)).toBe(resourceColor(3))
    for (const color of Object.values(REGION_COLORS)) expect(color).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('buildRenderSnapshot', () => {
  const world: WorldSnapshot = {
    seed: 1,
    tick: 42,
    time: 4.2,
    population: { active: 2, extinctionTick: null },
    organisms: [
      {
        id: 1,
        genomeId: 1,
        parentIds: [],
        speciesId: 0,
        position: { x: 10, y: 20 },
        velocity: { x: 0, y: 0 },
        heading: 1.5,
        radius: 5,
        age: 3,
        maxAge: 600,
        energy: 25,
        maxEnergy: 100,
        health: 50,
        maxHealth: 100,
        lifeStage: 'juvenile',
        reproductionCooldownRemaining: 0
      },
      {
        id: 2,
        genomeId: 2,
        parentIds: [1],
        speciesId: null,
        position: { x: 30, y: 40 },
        velocity: { x: 0, y: 0 },
        heading: 0,
        radius: 6,
        age: 10,
        maxAge: 600,
        energy: 500,
        maxEnergy: 100,
        health: 0,
        maxHealth: 0,
        lifeStage: 'mature',
        reproductionCooldownRemaining: 0
      }
    ],
    resources: [
      {
        id: 9,
        position: { x: 1, y: 2 },
        radius: 3,
        energyValue: 30,
        remaining: 15,
        kind: 2
      }
    ],
    hazards: [
      {
        id: 4,
        kind: 'storm',
        position: { x: 5, y: 6 },
        radius: 35,
        damagePerSecond: 6,
        expiresAtTick: 100
      }
    ],
    metrics: {
      organismsBorn: 0,
      deathsByStarvation: 0,
      deathsByAge: 0,
      deathsByDamage: 0,
      resourcesSpawned: 0,
      resourcesConsumed: 0,
      reproductionAttempts: 0,
      reproductionSuccesses: 0,
      reproductionFailures: 0,
      energyConsumed: 0,
      energyWasted: 0,
      damageTaken: 0
    }
  }

  const frame = buildRenderSnapshot(world, {
    worldWidth: 500,
    worldHeight: 400,
    season: 'winter',
    selectedId: 2
  })

  it('maps organisms to display data', () => {
    expect(frame.tick).toBe(42)
    expect(frame.worldWidth).toBe(500)
    expect(frame.season).toBe('winter')
    const first = frame.organisms[0] as RenderOrganism
    expect(first).toMatchObject({
      id: 1,
      x: 10,
      y: 20,
      rotation: 1.5,
      radius: 5,
      lifeStage: 'juvenile',
      energyRatio: 0.25,
      healthRatio: 0.5,
      selected: false
    })
    expect(first.speciesColor).toBe(speciesColor(0))
    expect(first.hue).toBe(speciesHue(0))
  })

  it('clamps ratios and survives a zero capacity', () => {
    const second = frame.organisms[1] as RenderOrganism
    expect(second.energyRatio).toBe(1)
    expect(second.healthRatio).toBe(0)
    expect(second.speciesId).toBeNull()
    expect(second.selected).toBe(true)
    expect(frame.selectedEntityId).toBe(2)
  })

  it('maps resources and hazards', () => {
    expect(frame.resources[0]).toEqual({
      id: 9,
      x: 1,
      y: 2,
      radius: 3,
      kind: 2,
      remainingRatio: 0.5
    })
    expect(frame.hazards[0]).toEqual({ id: 4, kind: 'storm', x: 5, y: 6, radius: 35 })
    expect(frame.effects).toEqual([])
  })

  it('does not alias the engine snapshot', () => {
    ;(world.organisms[0] as { position: { x: number } }).position.x = 999
    expect((frame.organisms[0] as RenderOrganism).x).toBe(10)
    ;(world.organisms[0] as { position: { x: number } }).position.x = 10
  })
})
