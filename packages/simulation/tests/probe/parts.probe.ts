import { describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PART_TYPES } from '@evo/contracts'
import type { WorldConfigOverrides } from '@evo/contracts'
import { World } from '../../src/index'

/**
 * Which parts evolution actually reaches: for each part type, the share of living bodies that carry
 * at least one working part of it, sampled over a run, with and without `anatomy.mutation.openTypes`
 * (and the rates that went with each). Also the population, births, how many different part lists
 * the living carry, and whether the world died out. A measurement, not a test; the report goes to
 * `<tmpdir>/evo-probe/<PARTS_OUT or parts.txt>`.
 *
 * Environment: `PARTS_SEEDS` (default `1,2,3,4`), `PARTS_TICKS` (default 30000).
 */
const SEEDS = (process.env.PARTS_SEEDS ?? '1,2,3,4').split(',').map(Number)
const TICKS = Number(process.env.PARTS_TICKS ?? 30_000)
const SAMPLE = 2_500

const VARIANTS: Array<{ name: string; config: WorldConfigOverrides }> = [
  {
    name: 'before (neighbour steps, latent slots, 0.004)',
    config: { anatomy: { mutation: { openTypes: false, presenceRate: 0.004, typeRate: 0.004 } } }
  },
  { name: 'now (open types, 0.01)', config: {} }
]

describe('parts probe', () => {
  it('reports the share of bodies carrying each part type', () => {
    const lines: string[] = []
    for (const variant of VARIANTS) {
      const carrying = new Map<string, number>(PART_TYPES.map((type) => [type, 0]))
      const everSeen = new Set<string>()
      let bodies = 0
      let extinct = 0
      let population = 0
      let born = 0
      let plans = 0
      for (const seed of SEEDS) {
        const world = World.create({ seed, config: variant.config })
        for (let tick = 0; tick < TICKS; tick += SAMPLE) {
          world.run(SAMPLE)
          for (const organism of world.snapshot().organisms) {
            const parts = world.anatomyOf(organism.id)?.anatomy.parts ?? []
            const types = new Set(parts.filter((p) => p.functional).map((p) => p.type))
            for (const type of types) {
              carrying.set(type, (carrying.get(type) ?? 0) + 1)
              everSeen.add(type)
            }
            bodies++
          }
        }
        const snapshot = world.snapshot()
        if (world.isExtinct) extinct++
        population += snapshot.organisms.length
        born += snapshot.metrics.organismsBorn
        plans += new Set(
          snapshot.organisms.map((o) =>
            (world.anatomyOf(o.id)?.anatomy.parts ?? []).map((p) => p.type).join(',')
          )
        ).size
      }
      lines.push(
        `${variant.name}: ${SEEDS.length} seeds x ${TICKS} ticks, extinct ${extinct}, ` +
          `mean final population ${(population / SEEDS.length).toFixed(1)}, births ${(born / SEEDS.length).toFixed(0)}, ` +
          `distinct part lists at the end ${(plans / SEEDS.length).toFixed(1)}, part types ever carried ${everSeen.size} of ${PART_TYPES.length}`
      )
      lines.push(
        '  ' +
          PART_TYPES.map(
            (type) =>
              `${type} ${(((carrying.get(type) ?? 0) / Math.max(1, bodies)) * 100).toFixed(1)}%`
          ).join('  ')
      )
    }
    const dir = join(tmpdir(), 'evo-probe')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, process.env.PARTS_OUT ?? 'parts.txt'), lines.join('\n') + '\n')
  })
})
