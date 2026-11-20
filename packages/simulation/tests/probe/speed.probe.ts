import { describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { World } from '../../src/index'

/**
 * How fast the engine runs, and the proof that a speed-up changed nothing: fixed worlds run for a
 * fixed number of ticks, with the wall time per tick and the final state hash. A refactor that
 * claims to be behaviour-preserving must print the same hashes before and after (a hash is the
 * whole state, ADR 0006's canonical hash) and a lower ms/tick. Run it alone on an idle machine:
 * every other process on the box is noise.
 *
 * Environment: `SPEED_TICKS` (default 6000), `SPEED_REPEAT` (default 2, the best of is reported).
 * Output: `<tmpdir>/evo-probe/speed.txt`.
 */
const TICKS = Number(process.env.SPEED_TICKS ?? 6_000)
const REPEAT = Number(process.env.SPEED_REPEAT ?? 2)
const WORLDS: Array<{ name: string; seed: number; config?: object }> = [
  { name: 'default seed 3', seed: 3 },
  { name: 'default seed 4120846439', seed: 4120846439 },
  { name: 'reflex controller seed 5', seed: 5, config: { learning: { controller: 'reflex' } } }
]

describe('speed probe', () => {
  it('times fixed worlds and prints their hashes', () => {
    const lines: string[] = [`ticks per world ${TICKS}, best of ${REPEAT}`]
    for (const w of WORLDS) {
      let best = Infinity
      let hash = ''
      let population = 0
      for (let r = 0; r < REPEAT; r++) {
        const world = World.create({ seed: w.seed, config: (w.config ?? {}) as never })
        const t0 = performance.now()
        world.run(TICKS)
        const ms = (performance.now() - t0) / TICKS
        best = Math.min(best, ms)
        hash = world.stateHash()
        population = world.snapshot().organisms.length
      }
      lines.push(
        `${w.name}: ${best.toFixed(3)} ms/tick (${Math.round(1000 / best)} ticks/s), population ${population}, hash ${hash}`
      )
    }
    const dir = join(tmpdir(), 'evo-probe')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, process.env.SPEED_OUT ?? 'speed.txt'), lines.join('\n') + '\n')
    console.log(lines.join('\n'))
  }, 600_000)
})
