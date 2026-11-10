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
 *   PROBE_SEEDS    how many seeds (default 8)
 *   PROBE_SEED_FROM first seed (default 1), to spread seeds over several processes
 *   PROBE_TICKS    ticks per world (default 20000)
 *   PROBE_OUT      output path without extension (default: the system temp directory)
 *   PROBE_CONFIG   JSON merged over every preset's overrides, to sweep a setting, e.g.
 *                  '{"reproduction":{"minEnergy":80}}' (sections merge field by field)
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
const seedFrom = Number(process.env['PROBE_SEED_FROM'] ?? 1)
const ticks = Number(process.env['PROBE_TICKS'] ?? 20_000)
const SAMPLE_EVERY = 250
const GENE_EVERY = 2_500
const extra = JSON.parse(process.env['PROBE_CONFIG'] ?? '{}') as Record<string, unknown>
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
  /** Deaths by cause and life stage (juvenile: younger than `organisms.maturityAge`). */
  stages: Record<'juvenile' | 'mature', { starved: number; aged: number; damaged: number }>
  /** Median age at death in seconds, by cause (0 when there were none). */
  medianAgeStarved: number
  medianAgeAged: number
  /** Births per second per mature creature: compare with `1 / cooldown`, the most one can do. */
  birthRate: number
  /** The evolved reproduction and lifespan genes among the living, sampled over the run. */
  genes: Array<{
    tick: number
    cooldown: number
    minEnergy: number
    offspringInvestment: number
    maturityAge: number
    maxAge: number
  }>
  /** How the living bodies see over the run: the share that are not all-round, and their mean best reach. */
  vision: Array<{ tick: number; nonOmni: number; meanReach: number; meanEyes: number }>
  /**
   * How creatures move, sampled over the run: counts of creature-samples that are slow and turning
   * (idle-spinning: under a tenth of the top speed, turning over 1 rad/s), nearly still, slow and
   * moving. Taken from two snapshots one tick apart, so the turn rate is the real heading change.
   */
  motion: { spinning: number; still: number; slow: number; moving: number }
  ticksPerSecond: number
}

/** Merges `b` over `a`, section by section (plain objects merge, everything else is replaced). */
function mergeConfig(a: object, b: Record<string, unknown>): never {
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) }
  for (const [key, value] of Object.entries(b)) {
    const current = out[key]
    const bothObjects =
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof current === 'object' &&
      current !== null &&
      !Array.isArray(current)
    out[key] = bothObjects
      ? mergeConfig(current as object, value as Record<string, unknown>)
      : value
  }
  return out as never
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] as number
}

function runWorld(presetName: string, seed: number): Row {
  const preset = presetByName(presetName)
  if (preset === undefined) throw new Error(`unknown preset ${presetName}`)
  const world = World.create({ seed, config: mergeConfig(preset.overrides, extra) })
  const dt = world.config.timestep
  const maturity = world.config.organisms.maturityAge
  const born = new Map<number, number>()
  for (const o of world.snapshot().organisms) born.set(o.id, 0)
  const stages = {
    juvenile: { starved: 0, aged: 0, damaged: 0 },
    mature: { starved: 0, aged: 0, damaged: 0 }
  }
  const ageStarved: number[] = []
  const ageAged: number[] = []
  const genes: Row['genes'] = []
  const vision: Row['vision'] = []
  const motion: Row['motion'] = { spinning: 0, still: 0, slow: 0, moving: 0 }
  const maxSpeed = world.config.organisms.maxSpeed
  let headings: Map<number, number> | null = null
  let birthCount = 0
  let matureSeconds = 0
  let sum = 0
  let samples = 0
  let min = Infinity
  let max = 0
  const started = performance.now()
  for (let tick = 1; tick <= ticks && !world.isExtinct; tick++) {
    world.step()
    for (const event of world.events.eventsThisTick()) {
      if (event.type === 'organism-born') {
        born.set(event.organismId, event.tick)
        birthCount += 1
      } else if (event.type === 'organism-died') {
        const age = (event.tick - (born.get(event.organismId) ?? 0)) * dt
        const stage = age < maturity ? 'juvenile' : 'mature'
        if (event.cause === 'starvation') {
          stages[stage].starved += 1
          ageStarved.push(age)
        } else if (event.cause === 'age') {
          stages[stage].aged += 1
          ageAged.push(age)
        } else stages[stage].damaged += 1
        born.delete(event.organismId)
      }
    }
    if (headings !== null) {
      // One tick after a sample: the heading change since then is the turn rate.
      for (const o of world.snapshot().organisms) {
        const before = headings.get(o.id)
        if (before === undefined) continue
        const turn =
          Math.abs(Math.atan2(Math.sin(o.heading - before), Math.cos(o.heading - before))) / dt
        const speed = Math.sqrt(o.velocity.x * o.velocity.x + o.velocity.y * o.velocity.y)
        if (speed < 0.1 * maxSpeed) {
          if (turn > 1) motion.spinning++
          else motion.still++
        } else if (speed < 0.4 * maxSpeed) motion.slow++
        else motion.moving++
      }
      headings = null
    }
    if (tick % SAMPLE_EVERY === 0) {
      const snapshot = world.snapshot()
      headings = new Map(snapshot.organisms.map((o) => [o.id, o.heading]))
      const active = snapshot.population.active
      sum += active
      samples++
      min = Math.min(min, active)
      max = Math.max(max, active)
      matureSeconds +=
        snapshot.organisms.filter((o) => o.lifeStage !== 'juvenile').length * SAMPLE_EVERY * dt
      if (tick % GENE_EVERY === 0 && snapshot.organisms.length > 0) {
        const g = snapshot.organisms.map((o) => world.genomeOf(o.id)!)
        genes.push({
          tick,
          cooldown: mean(g.map((x) => x.reproduction.cooldown)),
          minEnergy: mean(g.map((x) => x.reproduction.minEnergy)),
          offspringInvestment: mean(g.map((x) => x.reproduction.offspringInvestment)),
          maturityAge: mean(g.map((x) => x.physical.maturityAge)),
          maxAge: mean(g.map((x) => x.physical.maxAge))
        })
        const views = snapshot.organisms.map((o) => world.anatomyOf(o.id)?.factors.vision)
        const seen = views.filter((v) => v !== undefined)
        const narrow = seen.filter((v) => !v.omni)
        vision.push({
          tick,
          nonOmni: seen.length === 0 ? 0 : narrow.length / seen.length,
          meanReach: mean(seen.map((v) => v.cones.reduce((a, c) => Math.max(a, c.reach), 0))),
          meanEyes: mean(seen.map((v) => v.cones.length))
        })
      }
    }
  }
  const seconds = (performance.now() - started) / 1000
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
    clusterAlive: world.clusterReport()?.clusters.map((c) => c.alive) ?? null,
    stages,
    medianAgeStarved: median(ageStarved),
    medianAgeAged: median(ageAged),
    birthRate: matureSeconds === 0 ? 0 : birthCount / matureSeconds,
    genes,
    vision,
    motion,
    ticksPerSecond: seconds === 0 ? 0 : snapshot.tick / seconds
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
    const detail: string[] = [
      '| preset | juvenile starved | mature starved | aged | median age starved / aged (s) | births per mature creature per s | ticks/s | cooldown gene first..last | minEnergy | investment | maxAge | idle-spinning | nearly still | moving |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
    ]
    const sight: string[] = [
      '| preset | not all-round (first..last sample) | mean best reach, relative to the founder (first..last) | mean eyes per body (first..last) |',
      '| --- | --- | --- | --- |'
    ]
    for (const name of names) {
      const mine: Row[] = []
      for (let seed = seedFrom; seed < seedFrom + seedCount; seed++) mine.push(runWorld(name, seed))
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
      const sum = (pick: (r: Row) => number): number => mine.reduce((a, r) => a + pick(r), 0)
      const share = (n: number): string => (deaths === 0 ? '-' : `${fixed((n / deaths) * 100, 1)}%`)
      const firstLast = (key: keyof Row['genes'][number]): string => {
        const a = mean(mine.map((r) => (r.genes[0]?.[key] as number | undefined) ?? 0))
        const b = mean(
          mine.map((r) => (r.genes[r.genes.length - 1]?.[key] as number | undefined) ?? 0)
        )
        return `${fixed(a, 1)}..${fixed(b, 1)}`
      }
      const motionTotal = sum(
        (r) => r.motion.spinning + r.motion.still + r.motion.slow + r.motion.moving
      )
      const motionShare = (key: keyof Row['motion']): string =>
        motionTotal === 0 ? '-' : `${fixed((sum((r) => r.motion[key]) / motionTotal) * 100, 1)}%`
      detail.push(
        `| ${name} | ${share(sum((r) => r.stages.juvenile.starved))} | ${share(sum((r) => r.stages.mature.starved))} | ${share(sum((r) => r.aged))} | ${fixed(mean(mine.map((r) => r.medianAgeStarved)), 0)} / ${fixed(mean(mine.map((r) => r.medianAgeAged)), 0)} | ${fixed(mean(mine.map((r) => r.birthRate)), 4)} | ${fixed(mean(mine.map((r) => r.ticksPerSecond)), 0)} | ${firstLast('cooldown')} | ${firstLast('minEnergy')} | ${firstLast('offspringInvestment')} | ${firstLast('maxAge')} | ${motionShare('spinning')} | ${motionShare('still')} | ${motionShare('moving')} |`
      )
      const ends = (
        key: 'nonOmni' | 'meanReach' | 'meanEyes',
        digits: number,
        pct = false
      ): string => {
        const at = (index: number): number =>
          mean(
            mine.map((r) => {
              const v = index === 0 ? r.vision[0] : r.vision[r.vision.length - 1]
              return (v?.[key] as number | undefined) ?? 0
            })
          )
        const f = (x: number): string => (pct ? `${fixed(x * 100, 0)}%` : fixed(x, digits))
        return `${f(at(0))}..${f(at(1))}`
      }
      sight.push(
        `| ${name} | ${ends('nonOmni', 0, true)} | ${ends('meanReach', 2)} | ${ends('meanEyes', 2)} |`
      )
      table.push(
        `| ${name} | ${aggregate.worlds} | ${aggregate.extinct} | ${fixed(aggregate.popMean, 1)} | ${aggregate.popMin}..${aggregate.popMax} | ${fixed(aggregate.starvationShare * 100, 1)}% | ${fixed(aggregate.foodRatio * 100, 0)}% | ${fixed(aggregate.energyWastedShare * 100, 0)}% | ${aggregate.emptyClusters ?? '-'} |`
      )
    }
    mkdirSync(join(out, '..'), { recursive: true })
    writeFileSync(
      `${out}.json`,
      JSON.stringify({ ticks, seeds: seedCount, aggregates, rows }, null, 1)
    )
    writeFileSync(
      `${out}.md`,
      `${table.join('\n')}\n\n${detail.join('\n')}\n\n${sight.join('\n')}\n`
    )
  })
})
