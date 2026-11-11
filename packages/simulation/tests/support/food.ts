import type { WorldConfigOverrides } from '@evo/contracts'

/**
 * The world's food as it was before patches, plants and the bigger field (ADR 0021): free food
 * spread evenly over a 500 x 500 field, 100 items to start, 200 at most, two a second. Tests that
 * are about the spawning mechanics, the Phase 3 pins and the cluster scaling spread this into their
 * config so they keep measuring what they were written to measure.
 */
export const FREE_FOOD: WorldConfigOverrides = {
  environment: { width: 500, height: 500 },
  resources: {
    initialCount: 100,
    maxCount: 200,
    spawnRate: 2,
    distribution: { mode: 'uniform' },
    plants: { enabled: false }
  }
}
