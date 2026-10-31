import { describe, expect, it } from 'vitest'
import type { WorldConfigOverrides } from '@evo/contracts'
import { World } from '../../src/index'

/**
 * The foraging gate (ADR 0007): an organism driven by the innate-prior brain must find food
 * about as well as the reflex forager it is meant to approximate. The setup removes everything
 * else: a single organism, no reproduction, plentiful static food, so the number of resources
 * eaten measures how well it steers.
 */
function eaten(config: WorldConfigOverrides, seed: number, ticks = 1500): number {
  const world = World.create({
    seed,
    config: {
      maxPopulation: 1,
      organisms: { initialCount: 1, initialEnergy: 100 },
      resources: { initialCount: 200, maxCount: 200, spawnRate: 0 },
      ...config
    }
  })
  world.run(ticks)
  return world.snapshot().metrics.resourcesConsumed
}

const SEEDS = [1, 2, 3, 4, 5, 6]
const total = (config: WorldConfigOverrides): number =>
  SEEDS.reduce((sum, seed) => sum + eaten(config, seed), 0)

describe('foraging with the innate-prior brain', () => {
  const reflex = total({ learning: { controller: 'reflex' } })

  it('finds food, at least in the same ballpark as the reflex forager', () => {
    const brain = total({ learning: { controller: 'brain' } })
    expect(reflex).toBeGreaterThan(0)
    expect(brain).toBeGreaterThanOrEqual(0.7 * reflex)
  })

  it('beats an unprimed random brain by a wide margin', () => {
    const random = total({
      learning: { controller: 'brain' },
      genetics: { brain: { innatePrior: false } }
    })
    const primed = total({ learning: { controller: 'brain' } })
    expect(primed).toBeGreaterThan(2 * random)
  })

  it('does not lose its foraging skill when learning is switched on', () => {
    const frozen = total({ learning: { controller: 'brain', enabled: false } })
    const learning = total({ learning: { controller: 'brain', enabled: true } })
    expect(learning).toBeGreaterThanOrEqual(0.8 * frozen)
  })
})
