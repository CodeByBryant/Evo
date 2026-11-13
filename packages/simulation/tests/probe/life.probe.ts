import { describe, it } from 'vitest'
import { appendFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mouthFormOf } from '@evo/contracts'
import { World } from '../../src/index'

/**
 * How the life cycle (ADR 0027) plays out: viability columns (extinct worlds, mean and lowest
 * population, starved share of deaths) and the egg columns (laid, hatched, eaten, clutches lost, a
 * parent defending, hatch share, the share of energy that came from eggs, the share of eggs that
 * lay guarded, females and jaws at the end). A measurement, not a test.
 *
 * Environment: `LIFE_NAME` (label), `LIFE_CONFIG` (JSON overrides merged over the life cycle on),
 * `LIFE_OFF=1` (control: sexes and eggs off, then `LIFE_CONFIG` as given), `LIFE_SEEDS` (default 1..8),
 * `LIFE_TICKS` (default 30000). One line goes to `<tmpdir>/evo-probe/life-<name>.txt`.
 */
const NAME = process.env.LIFE_NAME ?? 'on'
const OFF = process.env.LIFE_OFF === '1'
const EXTRA = JSON.parse(process.env.LIFE_CONFIG ?? '{}') as {
  reproduction?: { eggs?: object } & Record<string, unknown>
} & Record<string, unknown>
const SEEDS = (process.env.LIFE_SEEDS ?? '1,2,3,4,5,6,7,8').split(',').map(Number)
const TICKS = Number(process.env.LIFE_TICKS ?? 30_000)
const SAMPLE = 2_500

describe('life-cycle probe', () => {
  it(`measures ${NAME}`, () => {
    let extinct = 0
    let popSum = 0
    let lowest = Infinity
    let starved = 0
    let deaths = 0
    let laid = 0
    let hatched = 0
    let eaten = 0
    let lost = 0
    let females = 0
    let creatures = 0
    let jawEnd = 0
    let ageDeaths = 0
    let choosinessSum = 0
    let preferenceSum = 0
    let rejectedAttempts = 0
    let attemptsAll = 0
    let successesAll = 0
    let seedsWithJaw = 0
    let guardedSamples = 0
    let eggSamples = 0
    let ms = 0
    let ticks = 0
    const perSeed: string[] = []
    for (const seed of SEEDS) {
      const reproduction = OFF
        ? { ...(EXTRA['reproduction'] ?? {}) }
        : {
            ...(EXTRA['reproduction'] ?? {}),
            sexes: { enabled: true },
            eggs: { enabled: true, ...(EXTRA.reproduction?.eggs ?? {}) }
          }
      const world = World.create({ seed, config: { ...EXTRA, reproduction } as never })
      let sum = 0
      let samples = 0
      const started = performance.now()
      for (let tick = 0; tick < TICKS; tick += SAMPLE) {
        for (let k = 0; k < SAMPLE; k++) {
          world.step()
          for (const e of world.events.eventsThisTick()) {
            if (e.type === 'reproduction-attempted') {
              attemptsAll++
              if (e.succeeded) successesAll++
              if (e.failureReason === 'rejected') rejectedAttempts++
            }
          }
        }
        const snapshot = world.snapshot()
        sum += snapshot.organisms.length
        samples++
        lowest = Math.min(lowest, snapshot.organisms.length)
        eggSamples += snapshot.eggs.length
        guardedSamples += snapshot.eggs.filter((e) => e.guarded).length
      }
      ms += performance.now() - started
      ticks += TICKS
      const end = world.snapshot()
      const m = end.metrics
      if (world.isExtinct) extinct++
      popSum += sum / samples
      starved += m.deathsByStarvation
      ageDeaths += m.deathsByAge
      for (const o of end.organisms) {
        const g = world.genomeOf(o.id)?.reproduction
        choosinessSum += g?.choosiness ?? 0
        preferenceSum += g?.preference ?? 0
      }
      deaths += m.deathsByStarvation + m.deathsByAge + m.deathsByDamage + m.deathsByPredation
      laid += m.eggsLaid
      hatched += m.eggsHatched
      eaten += m.eggsEaten
      lost += m.clutchesLost
      females += end.organisms.filter((o) => o.sex === 0).length
      creatures += end.organisms.length
      let jaws = 0
      for (const o of end.organisms) {
        const parts = world.anatomyOf(o.id)?.anatomy.parts ?? []
        if (
          parts.some(
            (p) => p.type === 'mouth' && p.functional && mouthFormOf(p.stats[2] as number) === 'jaw'
          )
        ) {
          jaws++
        }
      }
      jawEnd += jaws
      if (jaws > 0) seedsWithJaw++
      perSeed.push(`${seed}:${world.isExtinct ? 'X' : Math.round(sum / samples)}/${jaws}j`)
    }
    const n = SEEDS.length
    const line = [
      NAME,
      `seeds=${n}`,
      `extinct=${extinct}`,
      `pop=${(popSum / n).toFixed(1)}`,
      `lowest=${lowest}`,
      `starved=${((100 * starved) / Math.max(1, deaths)).toFixed(0)}%`,
      `laid=${(laid / n).toFixed(0)}`,
      `hatched=${(hatched / n).toFixed(0)}`,
      `hatch%=${((100 * hatched) / Math.max(1, laid)).toFixed(0)}`,
      `eaten=${(eaten / n).toFixed(1)}`,
      `lost=${(lost / n).toFixed(1)}`,
      `guarded%=${((100 * guardedSamples) / Math.max(1, eggSamples)).toFixed(0)}`,
      `eggsNow=${(eggSamples / (n * (TICKS / SAMPLE))).toFixed(1)}`,
      `females%=${((100 * females) / Math.max(1, creatures)).toFixed(0)}`,
      `ageDeaths=${((100 * ageDeaths) / Math.max(1, deaths)).toFixed(0)}%`,
      `taste=${(choosinessSum / Math.max(1, creatures)).toFixed(2)}/${(preferenceSum / Math.max(1, creatures)).toFixed(2)}`,
      `rejected%=${((100 * rejectedAttempts) / Math.max(1, attemptsAll)).toFixed(1)}`,
      `rejectedOfFound%=${((100 * rejectedAttempts) / Math.max(1, rejectedAttempts + successesAll)).toFixed(0)}`,
      `jawEnd=${(jawEnd / n).toFixed(1)}(${seedsWithJaw}/${n})`,
      `tps=${((1000 * ticks) / ms).toFixed(0)}`,
      perSeed.join(' ')
    ].join(' ')
    const dir = join(tmpdir(), 'evo-probe')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, `life-${NAME}.txt`), line + '\n')
    console.log(line)
  }, 3_600_000)
})
