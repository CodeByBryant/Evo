import { describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { presetByName } from '@evo/config'
import { BRAIN_INPUT_GROUPS } from '@evo/contracts'
import type { EvolutionSample, WorldConfigOverrides } from '@evo/contracts'
import { World } from '../../src/index'

/**
 * The evolution observatory's indicators (ADR 0024) for one world setup, over seeds: the numbers
 * that say whether a world is still changing, with the first half of the run set against the second
 * so a **trend** is visible and not only an endpoint. A measurement, not a test.
 *
 * Environment: `EVO_NAME` (label), `EVO_PRESET` (a preset name), `EVO_CONFIG` (JSON overrides merged
 * over it), `EVO_SEEDS` (default 1..8), `EVO_TICKS` (default 30000). One summary line goes to
 * `<tmpdir>/evo-probe/evolution-<name>.txt` and the mean series (one row per sample, averaged over
 * seeds) to `evolution-<name>.csv`.
 */
const NAME = process.env.EVO_NAME ?? 'default'
const PRESET = process.env.EVO_PRESET
const EXTRA = JSON.parse(process.env.EVO_CONFIG ?? '{}') as WorldConfigOverrides
const SEEDS = (process.env.EVO_SEEDS ?? '1,2,3,4,5,6,7,8').split(',').map(Number)
const TICKS = Number(process.env.EVO_TICKS ?? 30_000)

const merge = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...a }
  for (const key of Object.keys(b)) {
    const x = out[key]
    const y = b[key]
    out[key] =
      x !== null &&
      y !== null &&
      typeof x === 'object' &&
      typeof y === 'object' &&
      !Array.isArray(y)
        ? merge(x as Record<string, unknown>, y as Record<string, unknown>)
        : y
  }
  return out
}

const avg = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length

describe('evolution probe', () => {
  it(
    `measures ${NAME}`,
    () => {
      const preset = PRESET === undefined ? {} : (presetByName(PRESET)?.overrides ?? {})
      const config = merge(preset as Record<string, unknown>, EXTRA as Record<string, unknown>)
      const perSeed: EvolutionSample[][] = []
      let extinct = 0
      for (const seed of SEEDS) {
        const world = World.create({ seed, config: config as WorldConfigOverrides })
        world.run(TICKS)
        if (world.isExtinct) extinct++
        perSeed.push([...(world.observatory()?.samples ?? [])])
      }
      const half = TICKS / 2
      const first = (seed: EvolutionSample[]) => seed.filter((s) => s.tick > 0 && s.tick <= half)
      const second = (seed: EvolutionSample[]) => seed.filter((s) => s.tick > half)
      const field = (
        pick: (s: EvolutionSample) => number,
        part: (s: EvolutionSample[]) => EvolutionSample[]
      ) => avg(perSeed.map((seed) => avg(part(seed).map(pick))))
      const last = (pick: (s: EvolutionSample) => number) =>
        avg(
          perSeed.map((seed) =>
            seed.length === 0 ? 0 : pick(seed[seed.length - 1] as EvolutionSample)
          )
        )
      const base = (pick: (s: EvolutionSample) => number) =>
        avg(perSeed.map((seed) => (seed.length === 0 ? 0 : pick(seed[0] as EvolutionSample))))
      const sum = (
        pick: (s: EvolutionSample) => number,
        part: (s: EvolutionSample[]) => EvolutionSample[]
      ) => avg(perSeed.map((seed) => part(seed).reduce((t, s) => t + pick(s), 0)))
      const f = (v: number, d = 2) => v.toFixed(d)
      const stasisShare = avg(
        perSeed.map((seed) =>
          seed.length === 0 ? 0 : seed.filter((s) => s.stasis).length / seed.length
        )
      )
      const stasisEver = perSeed.filter((seed) => seed.some((s) => s.stasis)).length

      const line = [
        `${NAME.padEnd(18)} seeds ${SEEDS.length} extinct ${extinct}`,
        `pop ${f(
          field((s) => s.population, second),
          1
        )}`,
        `| new plans 1st/2nd half ${f(
          sum((s) => s.newPlans, first),
          1
        )}/${f(
          sum((s) => s.newPlans, second),
          1
        )}`,
        `persistent plans ${f(
          last((s) => s.persistentPlans),
          1
        )} (ever ${f(
          last((s) => s.plansEver),
          1
        )})`,
        `effective plans ${f(field((s) => s.effectivePlans, first))}/${f(field((s) => s.effectivePlans, second))}`,
        `body spread ${f(
          field((s) => s.bodySpread, second),
          3
        )} parts ${f(field((s) => s.partsMean, second))} types ${f(
          last((s) => s.partTypes),
          1
        )}`,
        `| prior drift ${f(
          base((s) => s.priorDrift),
          3
        )} -> ${f(
          last((s) => s.priorDrift),
          3
        )} brain spread ${f(
          field((s) => s.brainSpread, second),
          3
        )} learned ${f(
          field((s) => s.learnedGap, second),
          3
        )}`,
        `prey input ${f(
          base((s) => s.inputUsage.prey),
          3
        )} -> ${f(
          last((s) => s.inputUsage.prey),
          3
        )} threat ${f(
          base((s) => s.inputUsage.threat),
          3
        )} -> ${f(
          last((s) => s.inputUsage.threat),
          3
        )}`,
        `| response types ${f(field((s) => s.responseTypes, first))}/${f(field((s) => s.responseTypes, second))} spread ${f(
          field((s) => s.responseSpread, first),
          3
        )}/${f(
          field((s) => s.responseSpread, second),
          3
        )}`,
        `| behaviour types ${f(field((s) => s.behaviourTypes, first))}/${f(field((s) => s.behaviourTypes, second))} spread ${f(
          field((s) => s.behaviourSpread, second),
          3
        )}`,
        `intake plant/flesh/carrion ${f(last((s) => s.intakePlant))}/${f(last((s) => s.intakeFlesh))}/${f(last((s) => s.intakeCarrion))}`,
        `| rate 1st/2nd ${f(
          field((s) => s.rate, first),
          3
        )}/${f(
          field((s) => s.rate, second),
          3
        )} stasis ${f(stasisShare)} (worlds ${stasisEver}/${SEEDS.length})`,
        `| species ever ${f(
          last((s) => s.speciesEver),
          1
        )} alive ${f(
          last((s) => s.speciesAlive),
          1
        )} young ${f(field((s) => s.youngSpeciesShare, second))} founders ${f(
          last((s) => s.foundersAlive),
          1
        )} gen ${f(
          last((s) => s.maxGeneration),
          1
        )}`
      ].join(' ')

      const dir = join(tmpdir(), 'evo-probe')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `evolution-${NAME}.txt`), line + '\n')
      const header = [
        'tick',
        'population',
        'newPlans',
        'persistentPlans',
        'effectivePlans',
        'bodySpread',
        'partsMean',
        'priorDrift',
        'brainSpread',
        'responseTypes',
        'responseSpread',
        ...BRAIN_INPUT_GROUPS.map((g) => `use_${g}`),
        'behaviourTypes',
        'behaviourSpread',
        'rate',
        'speciesAlive',
        'maxGeneration'
      ]
      const rows: string[] = [header.join(',')]
      const length = Math.min(...perSeed.map((seed) => seed.length))
      for (let i = 0; i < length; i++) {
        const at = (pick: (s: EvolutionSample) => number) =>
          avg(perSeed.map((seed) => pick(seed[i] as EvolutionSample)))
        rows.push(
          [
            (perSeed[0]?.[i] as EvolutionSample).tick,
            ...[
              (s: EvolutionSample) => s.population,
              (s: EvolutionSample) => s.newPlans,
              (s: EvolutionSample) => s.persistentPlans,
              (s: EvolutionSample) => s.effectivePlans,
              (s: EvolutionSample) => s.bodySpread,
              (s: EvolutionSample) => s.partsMean,
              (s: EvolutionSample) => s.priorDrift,
              (s: EvolutionSample) => s.brainSpread,
              (s: EvolutionSample) => s.responseTypes,
              (s: EvolutionSample) => s.responseSpread,
              ...BRAIN_INPUT_GROUPS.map((g) => (s: EvolutionSample) => s.inputUsage[g]),
              (s: EvolutionSample) => s.behaviourTypes,
              (s: EvolutionSample) => s.behaviourSpread,
              (s: EvolutionSample) => s.rate,
              (s: EvolutionSample) => s.speciesAlive,
              (s: EvolutionSample) => s.maxGeneration
            ].map((pick) => at(pick).toFixed(4))
          ].join(',')
        )
      }
      writeFileSync(join(dir, `evolution-${NAME}.csv`), rows.join('\n') + '\n')
    },
    6 * 60 * 60 * 1000
  )
})
