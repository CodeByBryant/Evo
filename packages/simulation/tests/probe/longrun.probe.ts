import { describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mouthFormOf } from '@evo/contracts'
import type { WorldConfigOverrides } from '@evo/contracts'
import { World } from '../../src/index'

/**
 * What a world looks like after a long run (ADR 0023 step three): the question that a 30,000-tick
 * probe cannot answer, because the failure it was written for (jaws taking over, 35 of 36 creatures at
 * 100,000 ticks, 82 percent of the energy still from plants) only shows late. Per seed, every
 * 10,000 ticks: population, how many creatures carry each mouth form, predation against starvation
 * deaths in that window, and where the living creatures' energy came from. A measurement, not a test.
 *
 * Environment: `LONG_NAME` (label), `LONG_SEEDS` (default 3246115366 then 1..7), `LONG_TICKS`
 * (default 100000), `LONG_CONFIG` (JSON overrides). Writes `<tmpdir>/evo-probe/longrun-<name>.txt`.
 */
const NAME = process.env.LONG_NAME ?? 'default'
const SEEDS = (process.env.LONG_SEEDS ?? '3246115366,1,2,3,4,5,6,7').split(',').map(Number)
const TICKS = Number(process.env.LONG_TICKS ?? 100_000)
const CONFIG = JSON.parse(process.env.LONG_CONFIG ?? '{}') as WorldConfigOverrides
const STEP = 10_000

describe('long run probe', () => {
  it(
    `measures ${NAME}`,
    () => {
      const lines: string[] = []
      let extinct = 0
      let jawShareSum = 0
      let formsAtLeastTwo = 0
      let jawAlive = 0
      for (const seed of SEEDS) {
        const world = World.create({ seed, config: CONFIG })
        let previous = { starved: 0, predated: 0 }
        let jaws = 0
        let population = 0
        let forms = 0
        for (let t = STEP; t <= TICKS; t += STEP) {
          const intake = { plant: 0, flesh: 0, carrion: 0 }
          const carrionKind = world.config.ecology.resourceKinds.kinds.findIndex(
            (k) => k.name === 'carrion'
          )
          for (let i = 0; i < STEP; i++) {
            world.step()
            for (const e of world.events.eventsThisTick()) {
              if (e.type === 'resource-bitten') {
                intake[e.kind === carrionKind ? 'carrion' : 'plant'] += e.intake
              } else if (e.type === 'organism-bitten') intake.flesh += e.intake
            }
          }
          const total = intake.plant + intake.flesh + intake.carrion
          const share = (v: number): string => (total === 0 ? '0.00' : (v / total).toFixed(2))
          const snapshot = world.snapshot()
          const counts = new Map<string, number>()
          for (const o of snapshot.organisms) {
            const mouth = (world.anatomyOf(o.id)?.anatomy.parts ?? []).find(
              (p) => p.type === 'mouth' && p.functional
            )
            const form = mouth === undefined ? 'none' : mouthFormOf(mouth.stats[2] as number)
            counts.set(form, (counts.get(form) ?? 0) + 1)
          }
          const m = snapshot.metrics
          const line =
            `seed ${seed} tick ${t} pop ${snapshot.organisms.length} ` +
            `forms ${[...counts.entries()].map(([k, v]) => `${k}:${v}`).join(' ')} | window: predation ${m.deathsByPredation - previous.predated} starved ${m.deathsByStarvation - previous.starved}` +
            ` | window intake plant/flesh/carrion ${share(intake.plant)}/${share(intake.flesh)}/${share(intake.carrion)}`
          lines.push(line)
          previous = { starved: m.deathsByStarvation, predated: m.deathsByPredation }
          jaws = counts.get('jaw') ?? 0
          population = snapshot.organisms.length
          forms = [...counts.entries()].filter(([form, n]) => form !== 'none' && n > 0).length
          if (world.isExtinct) break
        }
        if (world.isExtinct) extinct++
        jawShareSum += population === 0 ? 0 : jaws / population
        if (forms >= 2) formsAtLeastTwo++
        if (jaws > 0) jawAlive++
        lines.push(
          `-- seed ${seed}: ${world.isExtinct ? 'EXTINCT' : 'alive'}, jaws ${jaws} of ${population}, mouth forms alive ${forms}`
        )
      }
      const n = SEEDS.length
      lines.push(
        `SUMMARY ${NAME}: seeds ${n} extinct ${extinct} jaw share at end (mean) ${(jawShareSum / n).toFixed(2)} worlds with a jaw ${jawAlive}/${n} worlds with 2+ mouth forms ${formsAtLeastTwo}/${n}`
      )
      const dir = join(tmpdir(), 'evo-probe')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `longrun-${NAME}.txt`), lines.join('\n') + '\n')
    },
    6 * 60 * 60 * 1000
  )
})
