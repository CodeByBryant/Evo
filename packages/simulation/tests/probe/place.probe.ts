import { describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WorldConfigOverrides } from '@evo/contracts'
import { World } from '../../src/index'

/**
 * Does remembering where it last fed make creatures forage better (ADR 0025)? Over seeds, one line:
 * worlds that died out, population (mean, lowest), starved share of deaths, food taken in per
 * creature-minute (`resource-bitten` intake, not carrion), births per creature-minute, the share of
 * creatures remembering a site at each sample, how often a bite lands within 40 units of the site
 * the creature remembered just before it (a return to a patch), and the recall group's mean input
 * weight (the observatory's `inputUsage`). A measurement, not a test.
 *
 * Environment: `PLACE_NAME` (label), `PLACE_CONFIG` (JSON overrides), `PLACE_SEEDS` (default 1..8),
 * `PLACE_TICKS` (default 30000). One line goes to `<tmpdir>/evo-probe/place-<name>.txt`.
 */
const NAME = process.env.PLACE_NAME ?? 'default'
const CONFIG = JSON.parse(process.env.PLACE_CONFIG ?? '{}') as WorldConfigOverrides
const SEEDS = (process.env.PLACE_SEEDS ?? '1,2,3,4,5,6,7,8').split(',').map(Number)
const TICKS = Number(process.env.PLACE_TICKS ?? 30_000)
const SAMPLE = 500
const RETURN_RADIUS = 40

const mean = (v: number[]): number => (v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length)

interface Brainy {
  organisms: {
    values(): Array<{
      id: number
      brain: { recallX: number; recallY: number; recallTick: number } | null
    }>
  }
}

describe('place memory probe', () => {
  it(`measures ${NAME}`, () => {
    let extinct = 0
    const pops: number[] = []
    const lows: number[] = []
    const starved: number[] = []
    const intake: number[] = []
    const births: number[] = []
    const remembering: number[] = []
    const returns: number[] = []
    const usage: number[] = []
    for (const seed of SEEDS) {
      const world = World.create({ seed, config: CONFIG })
      const dt = world.config.timestep
      const carrionKind = world.config.ecology.resourceKinds.kinds.findIndex(
        (k) => k.name === 'carrion'
      )
      const internals = world as unknown as Brainy
      let intakeTotal = 0
      let creatureTicks = 0
      let bites = 0
      let returnBites = 0
      const samples: number[] = []
      let rememberSamples = 0
      let rememberTotal = 0
      // The site each creature remembered at the start of the tick (before this tick's bites).
      let sites = new Map<number, { x: number; y: number } | null>()
      for (let t = 1; t <= TICKS; t++) {
        world.step()
        for (const e of world.events.eventsThisTick()) {
          if (e.type === 'resource-bitten' && e.kind !== carrionKind && e.intake > 0) {
            intakeTotal += e.intake
            bites++
            const site = sites.get(e.organismId)
            if (site) {
              const dx = e.position.x - site.x
              const dy = e.position.y - site.y
              if (dx * dx + dy * dy <= RETURN_RADIUS * RETURN_RADIUS) returnBites++
            }
          }
        }
        const living = internals.organisms.values()
        creatureTicks += living.length
        sites = new Map()
        for (const o of living) {
          const b = o.brain
          sites.set(o.id, b !== null && b.recallTick >= 0 ? { x: b.recallX, y: b.recallY } : null)
        }
        if (t % SAMPLE === 0) {
          samples.push(living.length)
          rememberSamples += living.length
          rememberTotal += [...sites.values()].filter((s) => s !== null).length
        }
      }
      if (world.isExtinct) extinct++
      const m = world.snapshot().metrics
      const deaths = m.deathsByStarvation + m.deathsByAge + m.deathsByDamage + m.deathsByPredation
      pops.push(mean(samples))
      lows.push(Math.min(...samples))
      starved.push(deaths === 0 ? 0 : m.deathsByStarvation / deaths)
      const minutes = (creatureTicks * dt) / 60
      intake.push(minutes === 0 ? 0 : intakeTotal / minutes)
      births.push(minutes === 0 ? 0 : m.organismsBorn / minutes)
      remembering.push(rememberSamples === 0 ? 0 : rememberTotal / rememberSamples)
      returns.push(bites === 0 ? 0 : returnBites / bites)
      const series = world.observatory()
      const last = series?.samples.at(-1)
      usage.push(
        last === undefined ? 0 : ((last.inputUsage as Record<string, number>)['recall'] ?? 0)
      )
    }
    const f = (v: number[], d = 2): string => mean(v).toFixed(d)
    const line =
      `${NAME.padEnd(20)} seeds ${SEEDS.length} extinct ${extinct} pop ${f(pops, 1)} lowest ${Math.min(...lows)} ` +
      `| starved share ${f(starved)} | intake/creature-min ${f(intake, 1)} | births/creature-min ${f(births, 3)} ` +
      `| remembering ${f(remembering)} | bites within ${RETURN_RADIUS} of remembered site ${f(returns)} | recall input weight ${f(usage, 3)}`
    const dir = join(tmpdir(), 'evo-probe')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `place-${NAME}.txt`), line + '\n')
    console.log(line)
  }, 3_600_000)
})
