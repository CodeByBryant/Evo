import { describe, expect, it } from 'vitest'
import { run } from './toyTask'

// Twenty seeds: the random founder brains change whenever the genome layout does, and five seeds
// proved too few to separate a modest but real improvement from luck (Phase 6 measurements:
// hebbian mean gain 0.10 with 19 of 20 seeds positive, actorCritic 0.046 with 15 of 20, and
// 0.001 for both with learning off).
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1)
const MIN_MEAN_GAIN = { hebbian: 0.05, actorCritic: 0.02 }

describe.each(['hebbian', 'actorCritic'] as const)('toy steering task: %s', (algorithm) => {
  it('improves with learning on', () => {
    const gains = SEEDS.map((seed) => {
      const result = run(algorithm, true, seed)
      return result.late - result.early
    })
    const mean = gains.reduce((a, b) => a + b, 0) / gains.length
    // The optimum is about 0.32; a random policy scores about 0.
    expect(mean).toBeGreaterThan(MIN_MEAN_GAIN[algorithm])
    expect(gains.filter((gain) => gain > 0).length).toBeGreaterThanOrEqual(12)
  })

  it('does not improve with learning off, and changes no weight', () => {
    const results = SEEDS.map((seed) => run(algorithm, false, seed))
    const mean = results.reduce((sum, r) => sum + (r.late - r.early), 0) / results.length
    expect(Math.abs(mean)).toBeLessThan(0.03)
    for (const result of results) expect(result.weightChange).toBe(0)
  })
})
