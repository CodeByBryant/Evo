import { describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PART_TYPES } from '@evo/contracts'
import { World } from '../../src/index'

/**
 * How each starting body (ADR 0020) fares in the default world: for each archetype (forced, so every
 * seed meets it) and for the founder plan, over several seeds, whether the world died out, how many
 * lived (mean and lowest, sampled every 2,500 ticks), how many deaths were starvation, how many
 * part types the living carried at the end (and over the run), how many different part lists they
 * carried, and how fast the world ran. A measurement, not a test.
 *
 * Environment: `STARTS` (comma list, default every archetype and `reference`), `STARTS_SEEDS`
 * (default 1..16), `STARTS_TICKS` (default 30000), `STARTS_PRESET` (config overrides as JSON,
 * default none). One line per start goes to `<tmpdir>/evo-probe/starts-<name>.txt`.
 */
const TICKS = Number(process.env.STARTS_TICKS ?? 30_000)
const SEEDS = (process.env.STARTS_SEEDS ?? Array.from({ length: 16 }, (_, i) => i + 1).join(','))
  .split(',')
  .map(Number)
const SAMPLE = 2_500
const OVERRIDES = JSON.parse(process.env.STARTS_CONFIG ?? '{}') as Record<string, unknown>

const reference = World.create({ seed: 1 }).config.anatomy
const NAMES = (
  process.env.STARTS ?? ['reference', ...reference.starters.map((s) => s.name)].join(',')
).split(',')

describe('starting bodies probe', () => {
  for (const name of NAMES) {
    it(
      `measures ${name}`,
      () => {
        const config = {
          ...OVERRIDES,
          anatomy:
            name === 'reference'
              ? { startingBody: { mode: 'reference' } }
              : { startingBody: { mode: 'archetypes', archetype: name } }
        }
        let extinct = 0
        let meanSum = 0
        let lowest = Infinity
        let starved = 0
        let deaths = 0
        let finalTypes = 0
        let everTypes = 0
        let plans = 0
        let milliseconds = 0
        for (const seed of SEEDS) {
          const world = World.create({ seed, config: config as never })
          const ever = new Set<string>()
          let sum = 0
          let samples = 0
          const started = performance.now()
          for (let tick = 0; tick < TICKS; tick += SAMPLE) {
            world.run(SAMPLE)
            const snapshot = world.snapshot()
            sum += snapshot.organisms.length
            samples++
            lowest = Math.min(lowest, snapshot.organisms.length)
            for (const o of snapshot.organisms) {
              for (const p of world.anatomyOf(o.id)?.anatomy.parts ?? []) {
                if (p.functional) ever.add(p.type)
              }
            }
          }
          milliseconds += performance.now() - started
          const snapshot = world.snapshot()
          if (world.isExtinct) extinct++
          meanSum += sum / samples
          starved += snapshot.metrics.deathsByStarvation
          deaths +=
            snapshot.metrics.deathsByStarvation +
            snapshot.metrics.deathsByAge +
            snapshot.metrics.deathsByDamage
          const types = new Set<string>()
          const lists = new Set<string>()
          for (const o of snapshot.organisms) {
            const parts = (world.anatomyOf(o.id)?.anatomy.parts ?? []).filter((p) => p.functional)
            for (const p of parts) types.add(p.type)
            lists.add(
              parts
                .map((p) => p.type)
                .sort()
                .join(',')
            )
          }
          finalTypes += types.size
          everTypes += ever.size
          plans += lists.size
        }
        const n = SEEDS.length
        const line =
          `${name.padEnd(15)} seeds ${n} extinct ${extinct} mean pop ${(meanSum / n).toFixed(1)} ` +
          `lowest ${Number.isFinite(lowest) ? lowest : 0} starved ${((100 * starved) / Math.max(1, deaths)).toFixed(0)}% ` +
          `types at end ${(finalTypes / n).toFixed(1)}/${PART_TYPES.length} ever ${(everTypes / n).toFixed(1)} ` +
          `part lists ${(plans / n).toFixed(1)} ticks/s ${((SEEDS.length * TICKS) / (milliseconds / 1000)).toFixed(0)}`
        const dir = join(tmpdir(), 'evo-probe')
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, `starts-${name}.txt`), line + '\n')
      },
      6 * 60 * 60 * 1000
    )
  }
})
