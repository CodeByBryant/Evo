import { describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveWorldConfig } from '@evo/config'
import { PART_TYPES, mouthFormOf } from '@evo/contracts'
import { World } from '../../src/index'

/**
 * How predation (ADR 0023) plays out in the default world, with the same population columns as the
 * other probes plus the question the whole feature turns on: **does carnivory arise?** Per seed it
 * samples every 2,500 ticks how many living creatures carry a jaw (a working mouth whose form is
 * `jaw`) and whether any ever did; it counts bites on creatures, deaths by predation, carcasses left
 * and carcasses eaten, and the usual part columns (types and lists at the end). A measurement, not a
 * test.
 *
 * Environment: `PRED_NAME` (label), `PRED_CONFIG` (JSON overrides, merged under `predation.enabled`),
 * `PRED_SEEDS` (default 1..8), `PRED_TICKS` (default 30000), `PRED_OFF=1` for the control (predation
 * off). One line goes to `<tmpdir>/evo-probe/predation-<name>.txt`.
 */
const NAME = process.env.PRED_NAME ?? 'on'
const OFF = process.env.PRED_OFF === '1'
const BASE = JSON.parse(process.env.PRED_CONFIG ?? '{}') as Record<string, unknown>
const SEEDS = (process.env.PRED_SEEDS ?? '1,2,3,4,5,6,7,8').split(',').map(Number)
const TICKS = Number(process.env.PRED_TICKS ?? 30_000)
const SAMPLE = 2_500
/** `PRED_HUNTERS=1` starts every world as hunters (the grazer with a jaw): the mechanism, not the evolution. */
const HUNTERS = process.env.PRED_HUNTERS === '1'

/** The grazer starter with its mouth turned into a jaw, forced as the world's only start. */
function hunterAnatomy(): Record<string, unknown> {
  const grazer = resolveWorldConfig().anatomy.starters.find((st) => st.name === 'grazer')
  if (grazer === undefined) throw new Error('no grazer starter')
  const hunter = {
    ...grazer,
    name: 'hunter',
    parts: grazer.parts.map((p) =>
      p.type === 'mouth' ? { ...p, stats: [0.5, 0.65, 0.9, 0.5, 0.5, 0.5] } : p
    )
  }
  return { starters: [hunter], startingBody: { mode: 'archetypes', archetype: 'hunter' } }
}

describe('predation probe', () => {
  it(
    `measures ${NAME}`,
    () => {
      let extinct = 0
      let popSum = 0
      let lowest = Infinity
      let starved = 0
      let deaths = 0
      let predated = 0
      let bites = 0
      let carcasses = 0
      let carrionBites = 0
      let jawSum = 0
      let jawSamples = 0
      let seedsWithJaw = 0
      let types = 0
      let lists = 0
      let milliseconds = 0
      for (const seed of SEEDS) {
        const config = {
          ...BASE,
          ...(HUNTERS ? { anatomy: hunterAnatomy() } : {}),
          predation: {
            ...((BASE['predation'] as object | undefined) ?? {}),
            enabled: !OFF
          }
        }
        const world = World.create({ seed, config: config as never })
        const carrion =
          !OFF && world.config.predation.carcass.enabled
            ? world.config.ecology.resourceKinds.kinds.length - 1
            : -1
        let sum = 0
        let samples = 0
        let everJaw = false
        const started = performance.now()
        for (let tick = 0; tick < TICKS; tick += SAMPLE) {
          for (let t = 0; t < SAMPLE; t++) {
            world.run(1)
            for (const e of world.events.eventsThisTick()) {
              if (e.type === 'resource-spawned' && e.kind === carrion) carcasses++
              else if (e.type === 'resource-bitten' && e.kind === carrion) carrionBites++
            }
          }
          const snapshot = world.snapshot()
          sum += snapshot.organisms.length
          samples++
          lowest = Math.min(lowest, snapshot.organisms.length)
          let jaws = 0
          for (const o of snapshot.organisms) {
            const parts = world.anatomyOf(o.id)?.anatomy.parts ?? []
            if (
              parts.some(
                (p) =>
                  p.type === 'mouth' && p.functional && mouthFormOf(p.stats[2] as number) === 'jaw'
              )
            ) {
              jaws++
            }
          }
          jawSum += jaws
          jawSamples++
          if (jaws > 0) everJaw = true
        }
        milliseconds += performance.now() - started
        const snapshot = world.snapshot()
        if (world.isExtinct) extinct++
        popSum += sum / samples
        const m = snapshot.metrics
        starved += m.deathsByStarvation
        predated += m.deathsByPredation
        bites += m.predationBites
        deaths += m.deathsByStarvation + m.deathsByAge + m.deathsByDamage + m.deathsByPredation
        if (everJaw) seedsWithJaw++
        const typeSet = new Set<string>()
        const plans = new Set<string>()
        for (const o of snapshot.organisms) {
          const parts = (world.anatomyOf(o.id)?.anatomy.parts ?? []).filter((p) => p.functional)
          for (const p of parts) typeSet.add(p.type)
          plans.add(
            parts
              .map((p) => p.type)
              .sort()
              .join(',')
          )
        }
        types += typeSet.size
        lists += plans.size
      }
      const n = SEEDS.length
      const line =
        `${NAME.padEnd(14)} seeds ${n} extinct ${extinct} pop ${(popSum / n).toFixed(1)} low ${Number.isFinite(lowest) ? lowest : 0} ` +
        `starved ${((100 * starved) / Math.max(1, deaths)).toFixed(0)}% predation ${((100 * predated) / Math.max(1, deaths)).toFixed(1)}% ` +
        `bites ${(bites / n).toFixed(0)} kills ${(predated / n).toFixed(0)} jaws alive ${(jawSum / jawSamples).toFixed(2)} seeds with a jaw ${seedsWithJaw}/${n} ` +
        `carcasses ${(carcasses / n).toFixed(0)} eaten ${(carrionBites / n).toFixed(0)} types end ${(types / n).toFixed(1)}/${PART_TYPES.length} lists ${(lists / n).toFixed(1)} ` +
        `ticks/s ${((n * TICKS) / (milliseconds / 1000)).toFixed(0)}`
      const dir = join(tmpdir(), 'evo-probe')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `predation-${NAME}.txt`), line + '\n')
    },
    6 * 60 * 60 * 1000
  )
})
