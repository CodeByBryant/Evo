import { describe, it } from 'vitest'
import { appendFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { World } from '../../src/index'

/**
 * The population band of the long-run gates (ecology-stability-*, brain-long-run-*): for each seed,
 * 50,000 ticks of the default world sampled every 1,000 after a 10,000-tick burn-in, the mean,
 * minimum and maximum, and whether it went extinct. A measurement, not a test; `BAND_SEEDS` is a
 * comma list, one line per seed goes to `<tmpdir>/evo-probe/band.txt`.
 */
const SEEDS = (process.env.BAND_SEEDS ?? '1,2,3,4').split(',').map(Number)
describe('band probe', () => {
  it(
    'measures the band',
    () => {
      for (const seed of SEEDS) {
        const world = World.create({ seed })
        const samples: number[] = []
        for (let i = 0; i < 50; i++) {
          world.run(1000)
          if (i >= 10) samples.push(world.snapshot().population.active)
        }
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length
        const dir = join(tmpdir(), 'evo-probe')
        mkdirSync(dir, { recursive: true })
        appendFileSync(
          join(dir, 'band.txt'),
          `seed ${seed} extinct ${world.isExtinct} mean ${mean.toFixed(1)} min ${Math.min(...samples)} max ${Math.max(...samples)} born ${world.snapshot().metrics.organismsBorn}\n`
        )
      }
    },
    6 * 60 * 60 * 1000
  )
})
