import { describe, expect, it } from 'vitest'
import { World } from '../../src/world/World'

// World.brainOf reports how far a creature's inherited brain is from the innate prior and how much
// its life has moved it (ADR 0024).

describe('brainOf drift', () => {
  it('a founder is a little off the prior and has learned nothing yet', () => {
    const world = World.create({ seed: 3 })
    const id = world.snapshot().organisms[0]!.id
    const drift = world.brainOf(id)!.drift
    expect(drift.fromPrior).toBeGreaterThan(0)
    expect(drift.fromPrior).toBeLessThan(0.1)
    expect(drift.learned).toBe(0)
  })

  it('a life that has learned has moved its weights; the inherited distance does not change with learning', () => {
    const world = World.create({ seed: 3 })
    const id = world.snapshot().organisms[0]!.id
    const before = world.brainOf(id)!.drift.fromPrior
    world.run(1500)
    if (world.snapshot().organisms.some((o) => o.id === id)) {
      const after = world.brainOf(id)!.drift
      expect(after.learned).toBeGreaterThan(0)
      // the genome is immutable: only the learned overlay moved
      expect(after.fromPrior).toBe(before)
    }
  })

  it('has no brain to report under the reflex controller (negative)', () => {
    const world = World.create({ seed: 3, config: { learning: { controller: 'reflex' } } })
    const id = world.snapshot().organisms[0]!.id
    expect(world.brainOf(id)).toBeUndefined()
  })

  it('learning off: the learned gap stays exactly 0', () => {
    const world = World.create({ seed: 3, config: { learning: { enabled: false } } })
    const id = world.snapshot().organisms[0]!.id
    world.run(500)
    if (world.snapshot().organisms.some((o) => o.id === id)) {
      expect(world.brainOf(id)!.drift.learned).toBe(0)
    }
  })
})
