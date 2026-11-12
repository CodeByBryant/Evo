import { describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PART_TYPES } from '@evo/contracts'
import { presetByName } from '@evo/config'
import { World } from '../../src/index'

/**
 * How an obstacle setup (ADR 0022) plays out, with the same columns as the food probe plus how many
 * obstacle circles a world has and how much of the field they cover, and the *pinned* share: creatures
 * that stayed within a body-length of a rock's edge for a whole 20-tick window and barely moved (held
 * against it). A high pinned share is the case for an obstacle sense (Step 7). Over several seeds, whether worlds died out, how many
 * lived (mean and lowest, sampled every 2,500 ticks), how much of the deaths were starvation, how
 * many births per living creature per minute (mating), how much food and how many plants there
 * were, how clumped the food is (coefficient of variation of items per 50 x 50 cell), the idle-spin
 * share (creatures that barely moved but turned a lot over 20 ticks: the "spin, spin, spin" of the
 * owner's report), how many part types the living carried at the end and over the run and how many
 * different part lists they carried (does selection pressure raise part variety?), and how fast it
 * ran. A measurement, not a test.
 *
 * Environment: `OBS_NAME` (label), `OBS_CONFIG` (JSON config overrides) or `OBS_PRESET` (a preset
 * by name, which wins; `OBS_OFF=1` switches obstacles off in either, for the control), `OBS_SEEDS` (default
 * 1..8), `OBS_TICKS` (default 30000). One line goes to `<tmpdir>/evo-probe/food-<name>.txt`.
 */
const NAME = process.env.OBS_NAME ?? 'default'
const PRESET = process.env.OBS_PRESET
const CONFIG = (
  PRESET === undefined
    ? JSON.parse(process.env.OBS_CONFIG ?? '{}')
    : (presetByName(PRESET)?.overrides ?? {})
) as Record<string, unknown>
const OFF = process.env.OBS_OFF === '1'
const SEEDS = (process.env.OBS_SEEDS ?? '1,2,3,4,5,6,7,8').split(',').map(Number)
const TICKS = Number(process.env.OBS_TICKS ?? 30_000)
const SAMPLE = 2_500
const WINDOW = 20

const mean = (v: number[]): number => (v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length)
const cv = (v: number[]): number => {
  const m = mean(v)
  return m === 0 ? 0 : Math.sqrt(mean(v.map((x) => (x - m) ** 2))) / m
}

describe('obstacle probe', () => {
  it(
    `measures ${NAME}`,
    () => {
      let extinct = 0
      let popSum = 0
      let lowest = Infinity
      let starved = 0
      let deaths = 0
      let births = 0
      let lifeMinutes = 0
      let foodSum = 0
      let plantSum = 0
      let clump = 0
      let clumpN = 0
      let idle = 0
      let lost = 0
      let seen = 0
      let finalTypes = 0
      let everTypes = 0
      let lists = 0
      let milliseconds = 0
      let circles = 0
      let covered = 0
      let pinned = 0
      for (const seed of SEEDS) {
        const config = OFF
          ? {
              ...CONFIG,
              ecology: {
                ...((CONFIG['ecology'] as object | undefined) ?? {}),
                obstacles: { enabled: false }
              }
            }
          : CONFIG
        const world = World.create({ seed, config: config as never })
        const rocks = world.obstacles().filter((o) => o.blocksMovement)
        circles += world.obstacles().length
        let area = 0
        for (const o of world.obstacles()) area += Math.PI * o.radius * o.radius
        covered += area / (world.config.environment.width * world.config.environment.height)
        const { width, height } = world.config.environment
        const columns = Math.ceil(width / 50)
        const rows = Math.ceil(height / 50)
        const cells = columns * rows
        const ever = new Set<string>()
        let sum = 0
        let samples = 0
        const started = performance.now()
        for (let tick = 0; tick < TICKS; tick += SAMPLE) {
          world.run(SAMPLE - WINDOW)
          // a short window of snapshots, to see who barely moves but turns
          const first = new Map<number, { x: number; y: number; h: number; r: number }>()
          const turned = new Map<number, number>()
          const nearAll = new Map<number, boolean>()
          let previous = new Map<number, number>()
          for (let w = 0; w < WINDOW; w++) {
            world.run(1)
            const snapshot = world.snapshot()
            const heading = new Map<number, number>()
            for (const o of snapshot.organisms) {
              heading.set(o.id, o.heading)
              if (!first.has(o.id)) {
                first.set(o.id, { x: o.position.x, y: o.position.y, h: o.heading, r: o.radius })
              }
              let gap = Infinity
              for (const rock of rocks) {
                gap = Math.min(
                  gap,
                  Math.hypot(o.position.x - rock.x, o.position.y - rock.y) -
                    (rock.radius + o.radius)
                )
              }
              nearAll.set(o.id, (nearAll.get(o.id) ?? true) && gap < o.radius)
              const last = previous.get(o.id)
              if (last !== undefined) {
                let d = Math.abs(o.heading - last)
                if (d > Math.PI) d = 2 * Math.PI - d
                turned.set(o.id, (turned.get(o.id) ?? 0) + d)
              }
            }
            previous = heading
            if (w === WINDOW - 1) {
              for (const o of snapshot.organisms) {
                const start = first.get(o.id)
                if (start === undefined) continue
                const moved = Math.hypot(o.position.x - start.x, o.position.y - start.y)
                seen++
                if (nearAll.get(o.id) === true && moved < start.r) pinned++
                if (moved < start.r && (turned.get(o.id) ?? 0) > Math.PI / 2) {
                  idle++
                  // lost: nothing to eat within sensing range, so it is not feeding, it is waiting
                  let nearest = Infinity
                  for (const r of snapshot.resources) {
                    nearest = Math.min(
                      nearest,
                      Math.hypot(r.position.x - o.position.x, r.position.y - o.position.y)
                    )
                  }
                  if (nearest > world.config.organisms.sensorRadius) lost++
                }
              }
            }
          }
          const snapshot = world.snapshot()
          sum += snapshot.organisms.length
          samples++
          lowest = Math.min(lowest, snapshot.organisms.length)
          foodSum += snapshot.resources.length
          plantSum += snapshot.resources.filter((r) => r.slot === 0).length
          const counts = new Array<number>(cells).fill(0)
          for (const r of snapshot.resources) {
            const column = Math.min(columns - 1, Math.floor(r.position.x / 50))
            const row = Math.min(rows - 1, Math.floor(r.position.y / 50))
            counts[row * columns + column]! += 1
          }
          clump += cv(counts)
          clumpN++
          for (const o of snapshot.organisms) {
            for (const p of world.anatomyOf(o.id)?.anatomy.parts ?? []) {
              if (p.functional) ever.add(p.type)
            }
          }
        }
        milliseconds += performance.now() - started
        const snapshot = world.snapshot()
        if (world.isExtinct) extinct++
        popSum += sum / samples
        starved += snapshot.metrics.deathsByStarvation
        deaths +=
          snapshot.metrics.deathsByStarvation +
          snapshot.metrics.deathsByAge +
          snapshot.metrics.deathsByDamage
        births += snapshot.metrics.organismsBorn
        lifeMinutes += (sum / samples) * (snapshot.time / 60)
        const types = new Set<string>()
        const plans = new Set<string>()
        for (const o of snapshot.organisms) {
          const parts = (world.anatomyOf(o.id)?.anatomy.parts ?? []).filter((p) => p.functional)
          for (const p of parts) types.add(p.type)
          plans.add(
            parts
              .map((p) => p.type)
              .sort()
              .join(',')
          )
        }
        finalTypes += types.size
        everTypes += ever.size
        lists += plans.size
      }
      const n = SEEDS.length
      const line =
        `${NAME.padEnd(14)} seeds ${n} extinct ${extinct} pop ${(popSum / n).toFixed(1)} low ${Number.isFinite(lowest) ? lowest : 0} ` +
        `starved ${((100 * starved) / Math.max(1, deaths)).toFixed(0)}% births/creature-min ${(births / Math.max(1e-9, lifeMinutes)).toFixed(2)} ` +
        `rocks ${(circles / n).toFixed(0)} cover ${((100 * covered) / n).toFixed(1)}% pinned ${((100 * pinned) / Math.max(1, seen)).toFixed(2)}% ` +
        `food ${(foodSum / clumpN).toFixed(0)} plants ${(plantSum / clumpN).toFixed(1)} clump ${(clump / clumpN).toFixed(2)} ` +
        `idle-spin ${((100 * idle) / Math.max(1, seen)).toFixed(1)}% lost-spin ${((100 * lost) / Math.max(1, seen)).toFixed(1)}% types end ${(finalTypes / n).toFixed(1)}/${PART_TYPES.length} ever ${(everTypes / n).toFixed(1)} ` +
        `lists ${(lists / n).toFixed(1)} ticks/s ${((n * TICKS) / (milliseconds / 1000)).toFixed(0)}`
      const dir = join(tmpdir(), 'evo-probe')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `obstacles-${NAME}.txt`), line + '\n')
    },
    6 * 60 * 60 * 1000
  )
})
