import { describe, it } from 'vitest'
import { appendFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PART_TYPES } from '@evo/contracts'
import { World } from '../../src/index'
import { mouthsOf } from '../../src/organisms/mouths'

/**
 * Seeds (ADR 0032): what a world with seeds on does against one with them off, per seed and in total.
 * Per world: extinct, mean and lowest population, starved share of deaths, intake by food kind and the
 * share of the plant-class intake (everything but carrion and flesh) that is seeds, who eats seeds (by
 * mouth form), seeds dropped, germinated, rotted and left, plants alive and how many plants were born
 * (and so what share came from seeds), food clumpiness (the coefficient of variation of food per
 * 50 x 50 cell, sampled), and the variety columns (part types ever carried, distinct part lists at the
 * end, mouth forms alive at the end). A measurement, not a test.
 *
 * Environment: `SEEDS_NAME` (label), `SEEDS_CONFIG` (JSON overrides), `SEEDS_SEEDS` (default 1..8),
 * `SEEDS_TICKS` (default 30000). Appends to `<tmpdir>/evo-probe/seeds-<name>.txt`.
 */
const NAME = process.env.SEEDS_NAME ?? 'default'
const EXTRA = JSON.parse(process.env.SEEDS_CONFIG ?? '{}') as Record<string, unknown>
const SEEDS = (process.env.SEEDS_SEEDS ?? '1,2,3,4,5,6,7,8').split(',').map(Number)
const TICKS = Number(process.env.SEEDS_TICKS ?? 30_000)
const SAMPLE = 2_500
const CELL = 50

const f1 = (x: number): string => x.toFixed(1)
const pct = (x: number): string => `${Math.round(100 * x)}%`

describe('seeds probe', () => {
  it(`measures ${NAME}`, () => {
    const lines: string[] = []
    const totals = {
      extinct: 0,
      pop: 0,
      lowest: Infinity,
      starved: 0,
      deaths: 0,
      dropped: 0,
      germinated: 0,
      rotted: 0,
      seedShareWorlds: 0,
      worlds: 0
    }
    const typesEver = new Set<string>()
    const listsAtEnd: number[] = []
    const formsAtEnd: number[] = []
    const shares: string[] = []
    for (const seed of SEEDS) {
      const world = World.create({ seed, config: EXTRA as never })
      const kinds = world.config.ecology.resourceKinds.kinds.map((k) => k.name)
      const carrionKind = kinds.indexOf('carrion')
      const seedKind = kinds.indexOf('seed')
      const intake = new Map<number, number>()
      const seedByForm = new Map<string, number>()
      const formOf = new Map<number, string>()
      const knownHubs = new Set<number>()
      let plantsBorn = 0
      let starved = 0
      let deaths = 0
      let popSum = 0
      let samples = 0
      let lowest = Infinity
      const cv: number[] = []
      let plantsAlive = 0

      const formFor = (id: number): string => {
        const known = formOf.get(id)
        if (known !== undefined) return known
        const genome = world.genomeOf(id)
        const form =
          genome === undefined ? 'none' : (mouthsOf(genome, world.config)[0]?.form ?? 'none')
        formOf.set(id, form)
        return form
      }

      for (let tick = 1; tick <= TICKS; tick++) {
        world.step()
        if (world.isExtinct) break
        for (const e of world.events.eventsThisTick()) {
          if (e.type === 'resource-bitten') {
            intake.set(e.kind, (intake.get(e.kind) ?? 0) + e.intake)
            if (e.kind === seedKind && seedKind >= 0) {
              const form = formFor(e.organismId)
              seedByForm.set(form, (seedByForm.get(form) ?? 0) + e.intake)
            }
          } else if (e.type === 'organism-died') {
            deaths++
            if (e.cause === 'starvation') starved++
          }
        }
        if (tick % 100 === 0) {
          const resources = world.snapshot().resources
          plantsAlive = 0
          for (const r of resources) {
            if (r.slot === 0) {
              plantsAlive++
              if (!knownHubs.has(r.id)) {
                knownHubs.add(r.id)
                plantsBorn++
              }
            }
          }
        }
        if (tick % SAMPLE === 0) {
          const snap = world.snapshot()
          popSum += snap.organisms.length
          lowest = Math.min(lowest, snap.organisms.length)
          samples++
          const { width, height } = world.config.environment
          const cols = Math.ceil(width / CELL)
          const rows = Math.ceil(height / CELL)
          const counts = new Array<number>(cols * rows).fill(0)
          for (const r of snap.resources) {
            if (r.kind === carrionKind && carrionKind >= 0) continue
            const cx = Math.min(cols - 1, Math.floor(r.position.x / CELL))
            const cy = Math.min(rows - 1, Math.floor(r.position.y / CELL))
            counts[cy * cols + cx] = (counts[cy * cols + cx] as number) + 1
          }
          const mean = counts.reduce((a, b) => a + b, 0) / counts.length
          const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length
          cv.push(mean > 0 ? Math.sqrt(variance) / mean : 0)
          for (const o of snap.organisms) {
            for (const p of world.anatomyOf(o.id)?.anatomy.parts ?? []) {
              if (p.functional) typesEver.add(p.type)
            }
          }
        }
      }
      const snap = world.snapshot()
      const stats = world.seedStats
      let plantClass = 0
      for (const [kind, value] of intake) {
        if (kind === carrionKind && carrionKind >= 0) continue
        plantClass += value
      }
      const seedIntake = seedKind >= 0 ? (intake.get(seedKind) ?? 0) : 0
      const seedShare = plantClass > 0 ? seedIntake / plantClass : 0
      const lists = new Set(
        snap.organisms.map((o) =>
          (world.anatomyOf(o.id)?.anatomy.parts ?? [])
            .filter((p) => p.functional)
            .map((p) => p.type)
            .sort()
            .join(',')
        )
      )
      const forms = new Set(
        snap.organisms.map(
          (o) => mouthsOf(world.genomeOf(o.id) as never, world.config)[0]?.form ?? 'none'
        )
      )
      listsAtEnd.push(lists.size)
      formsAtEnd.push(forms.size)
      totals.worlds++
      if (world.isExtinct) totals.extinct++
      totals.pop += popSum / Math.max(1, samples)
      totals.lowest = Math.min(totals.lowest, world.isExtinct ? 0 : lowest)
      totals.starved += starved
      totals.deaths += deaths
      totals.dropped += stats.dropped
      totals.germinated += stats.germinated
      totals.rotted += stats.rotted
      if (seedShare >= 0.03 && seedShare <= 0.4) totals.seedShareWorlds++
      shares.push(`s${seed}:${pct(seedShare)}`)
      const byForm = [...seedByForm.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([f, v]) => `${f}${Math.round(v)}`)
        .join('/')
      lines.push(
        `${NAME} seed=${seed} ticks=${TICKS} extinct=${world.isExtinct} pop=${f1(popSum / Math.max(1, samples))} lowest=${world.isExtinct ? 0 : lowest} ` +
          `starved=${pct(deaths > 0 ? starved / deaths : 0)} seedShare=${pct(seedShare)} ` +
          `seeds(drop/germ/rot/left)=${stats.dropped}/${stats.germinated}/${stats.rotted}/${stats.alive} ` +
          `plants(alive/born)=${plantsAlive}/${plantsBorn} fromSeeds=${pct(plantsBorn > 0 ? stats.germinated / plantsBorn : 0)} ` +
          `cv=${f1(cv.reduce((a, b) => a + b, 0) / Math.max(1, cv.length))} lists=${lists.size} forms=${forms.size} ` +
          `seedEatersByForm=${byForm || '-'}`
      )
    }
    lines.push(
      `${NAME} TOTAL worlds=${totals.worlds} extinct=${totals.extinct} meanPop=${f1(totals.pop / totals.worlds)} lowest=${totals.lowest} ` +
        `starved=${pct(totals.deaths > 0 ? totals.starved / totals.deaths : 0)} seeds(drop/germ/rot)=${totals.dropped}/${totals.germinated}/${totals.rotted} ` +
        `worldsWithSeedShare3to40=${totals.seedShareWorlds}/${totals.worlds} partTypesEver=${typesEver.size}/${PART_TYPES.length} ` +
        `meanLists=${f1(listsAtEnd.reduce((a, b) => a + b, 0) / listsAtEnd.length)} meanForms=${f1(formsAtEnd.reduce((a, b) => a + b, 0) / formsAtEnd.length)} shares=${shares.join(' ')}`
    )
    const dir = join(tmpdir(), 'evo-probe')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, `seeds-${NAME}.txt`), lines.join('\n') + '\n')
    console.log(lines.join('\n'))
  }, 7_200_000)
})
