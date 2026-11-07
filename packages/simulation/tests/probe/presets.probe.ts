import { describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PRESETS, presetByName } from '@evo/config'
import { World } from '../../src/index'

/**
 * The preset probe: runs each preset over several seeds and reports how organisms die, how much
 * food is around and whether worlds survive, so ecology can be tuned from measurements and not
 * guesses (docs/decisions/0015, the starvation work).
 *
 *   PROBE_PRESETS  comma-separated preset names (default: all)
 *   PROBE_SEEDS    how many seeds, 1..N (default 8)
 *   PROBE_TICKS    ticks per world (default 20000)
 *   PROBE_OUT      output path without extension (default: the system temp directory)
 *
 * Writes `<out>.json` (one row per world, one aggregate per preset) and `<out>.md` (a table). Run
 * one preset per process to use several cores:
 *   PROBE_PRESETS=harsh PROBE_OUT=/tmp/harsh pnpm --filter @evo/simulation probe
 */
const names = (process.env['PROBE_PRESETS'] ?? PRESETS.map((p) => p.name).join(','))
  .split(',')
  .map((n) => n.trim())
  .filter((n) => n !== '')
const seedCount = Number(process.env['PROBE_SEEDS'] ?? 8)
const ticks = Number(process.env['PROBE_TICKS'] ?? 20_000)
const SAMPLE_EVERY = 250
const out = process.env['PROBE_OUT'] ?? join(tmpdir(), `evo-probe-${names.join('+')}`)

interface Row {
  preset: string
  seed: number
  ticks: number
  extinct: boolean
  extinctionTick: number | null
  popMean: number
  popMin: number
  popMax: number
  popFinal: number
  born: number
  starved: number
  aged: number
  damaged: number
  starvationShare: number
  foodFinal: number
  foodCap: number
  energyConsumed: number
  energyWasted: number
  clusterAlive: number[] | null
}

function runWorld(presetName: string, seed: number): Row {
  const preset = presetByName(presetName)
  if (preset === undefined) throw new Error(`unknown preset ${presetName}`)
  const world = World.create({ seed, config: preset.overrides })
  let sum = 0
  let samples = 0
  let min = Infinity
  let max = 0
  for (let done = 0; done < ticks && !world.isExtinct; done += SAMPLE_EVERY) {
    world.run(Math.min(SAMPLE_EVERY, ticks - done))
    const active = world.snapshot().population.active
    sum += active
    samples++
    min = Math.min(min, active)
    max = Math.max(max, active)
  }
  const snapshot = world.snapshot()
  const m = snapshot.metrics
  const deaths = m.deathsByStarvation + m.deathsByAge + m.deathsByDamage
  return {
    preset: presetName,
    seed,
    ticks: snapshot.tick,
    extinct: world.isExtinct,
    extinctionTick: snapshot.population.extinctionTick,
    popMean: samples === 0 ? 0 : sum / samples,
    popMin: Number.isFinite(min) ? min : 0,
    popMax: max,
    popFinal: snapshot.population.active,
    born: m.organismsBorn,
    starved: m.deathsByStarvation,
    aged: m.deathsByAge,
    damaged: m.deathsByDamage,
    starvationShare: deaths === 0 ? 0 : m.deathsByStarvation / deaths,
    foodFinal: snapshot.resources.length,
    foodCap: world.config.resources.maxCount,
    energyConsumed: m.energyConsumed,
    energyWasted: m.energyWasted,
    clusterAlive: world.clusterReport()?.clusters.map((c) => c.alive) ?? null
  }
}

const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
const fixed = (x: number, digits = 2): string => x.toFixed(digits)

describe('preset probe', () => {
  it('measures every preset', () => {
    const rows: Row[] = []
    const aggregates: Record<string, unknown> = {}
    const table: string[] = [
      '| preset | worlds | extinct | pop mean | pop min..max | starved share | food / cap | energy wasted | clusters empty |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'
    ]
    for (const name of names) {
      const mine: Row[] = []
      for (let seed = 1; seed <= seedCount; seed++) mine.push(runWorld(name, seed))
      rows.push(...mine)
      const deaths = mine.reduce((a, r) => a + r.starved + r.aged + r.damaged, 0)
      const starved = mine.reduce((a, r) => a + r.starved, 0)
      const consumed = mine.reduce((a, r) => a + r.energyConsumed, 0)
      const wasted = mine.reduce((a, r) => a + r.energyWasted, 0)
      const empty = mine.reduce(
        (a, r) => a + (r.clusterAlive?.filter((n) => n === 0).length ?? 0),
        0
      )
      const clustered = mine.some((r) => r.clusterAlive !== null)
      const aggregate = {
        worlds: mine.length,
        extinct: mine.filter((r) => r.extinct).length,
        popMean: mean(mine.map((r) => r.popMean)),
        popMin: Math.min(...mine.map((r) => r.popMin)),
        popMax: Math.max(...mine.map((r) => r.popMax)),
        starvationShare: deaths === 0 ? 0 : starved / deaths,
        foodRatio: mean(mine.map((r) => (r.foodCap > 0 ? r.foodFinal / r.foodCap : 0))),
        energyWastedShare: consumed + wasted === 0 ? 0 : wasted / (consumed + wasted),
        emptyClusters: clustered ? empty : null
      }
      aggregates[name] = aggregate
      table.push(
        `| ${name} | ${aggregate.worlds} | ${aggregate.extinct} | ${fixed(aggregate.popMean, 1)} | ${aggregate.popMin}..${aggregate.popMax} | ${fixed(aggregate.starvationShare * 100, 1)}% | ${fixed(aggregate.foodRatio * 100, 0)}% | ${fixed(aggregate.energyWastedShare * 100, 0)}% | ${aggregate.emptyClusters ?? '-'} |`
      )
    }
    mkdirSync(join(out, '..'), { recursive: true })
    writeFileSync(
      `${out}.json`,
      JSON.stringify({ ticks, seeds: seedCount, aggregates, rows }, null, 1)
    )
    writeFileSync(`${out}.md`, `${table.join('\n')}\n`)
  })
})
