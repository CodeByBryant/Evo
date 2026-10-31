import { describe, expect, it } from 'vitest'
import { run } from './toyTask'

const SEEDS = [1, 2, 3, 4, 5]

describe.each(['hebbian', 'actorCritic'] as const)('toy steering task: %s', (algorithm) => {
  it('improves with learning on', () => {
    const gains = SEEDS.map((seed) => {
      const result = run(algorithm, true, seed)
      return result.late - result.early
    })
    const mean = gains.reduce((a, b) => a + b, 0) / gains.length
    // The optimum is about 0.32; a random policy scores about 0.
    expect(mean).toBeGreaterThan(0.05)
    expect(gains.filter((gain) => gain > 0).length).toBeGreaterThanOrEqual(4)
  })

  it('does not improve with learning off, and changes no weight', () => {
    const results = SEEDS.map((seed) => run(algorithm, false, seed))
    const mean = results.reduce((sum, r) => sum + (r.late - r.early), 0) / results.length
    expect(Math.abs(mean)).toBeLessThan(0.03)
    for (const result of results) expect(result.weightChange).toBe(0)
  })
})
