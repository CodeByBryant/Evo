import { describe, expect, it } from 'vitest'
import { FoodField } from '../../src/ecology/FoodField'
import { World } from '../../src/world/World'
import type { SeededRandom } from '../../src/random/SeededRandom'

// The patchy field (ADR 0021): a pure pattern of where food is likely, and a spawn that always
// draws the same number of numbers however the pattern answers.

const SETTINGS = { scale: 120, contrast: 1, floor: 0.05, turnover: 1200 }

/** Density on a grid, for statistics over the field. */
function grid(field: FoodField, time = 0, step = 10, size = 500): number[] {
  const out: number[] = []
  for (let y = step / 2; y < size; y += step) {
    for (let x = step / 2; x < size; x += step) out.push(field.density(x, y, time))
  }
  return out
}

const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length
const cv = (v: number[]): number => {
  const m = mean(v)
  return Math.sqrt(mean(v.map((x) => (x - m) ** 2))) / m
}
function correlation(a: number[], b: number[]): number {
  const ma = mean(a)
  const mb = mean(b)
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i++) {
    num += ((a[i] as number) - ma) * ((b[i] as number) - mb)
    da += ((a[i] as number) - ma) ** 2
    db += ((b[i] as number) - mb) ** 2
  }
  return num / Math.sqrt(da * db)
}

describe('FoodField', () => {
  it('stays within [floor, 1] everywhere, including far outside the world and at negative times', () => {
    const field = new FoodField(3, SETTINGS)
    for (const [x, y, t] of [
      [0, 0, 0],
      [499, 499, 5000],
      [-1234.5, 9876.5, -300],
      [1e6, -1e6, 1e5]
    ] as const) {
      const d = field.density(x, y, t)
      expect(Number.isFinite(d)).toBe(true)
      expect(d).toBeGreaterThanOrEqual(SETTINGS.floor)
      expect(d).toBeLessThanOrEqual(1)
    }
    for (const d of grid(field)) {
      expect(d).toBeGreaterThanOrEqual(SETTINGS.floor)
      expect(d).toBeLessThanOrEqual(1)
    }
  })

  it('is a pure function of the seed: same seed same pattern, another seed another pattern', () => {
    const a = grid(new FoodField(7, SETTINGS))
    expect(grid(new FoodField(7, SETTINGS))).toEqual(a)
    expect(correlation(a, grid(new FoodField(8, SETTINGS)))).toBeLessThan(0.5)
    // the same call twice is the same number
    const field = new FoodField(7, SETTINGS)
    expect(field.density(123.4, 56.7, 89)).toBe(field.density(123.4, 56.7, 89))
  })

  it('has patches and gaps: much more varied than a flat field, which has none', () => {
    const patchy = grid(new FoodField(5, SETTINGS))
    expect(cv(patchy)).toBeGreaterThan(0.35)
    expect(Math.max(...patchy)).toBeGreaterThan(0.9)
    expect(Math.min(...patchy)).toBeLessThan(0.2)
    // contrast 0 is flat: every site equally likely
    const flat = grid(new FoodField(5, { ...SETTINGS, contrast: 0 }))
    expect(cv(flat)).toBeLessThan(1e-9)
    expect(flat.every((d) => d === 1)).toBe(true)
    // a middle contrast sits between the two
    const mid = cv(grid(new FoodField(5, { ...SETTINGS, contrast: 0.5 })))
    expect(mid).toBeGreaterThan(1e-3)
    expect(mid).toBeLessThan(cv(patchy))
  })

  it('patches have the size asked for: bigger scale, bigger patches', () => {
    // neighbours 20 units apart agree more when the features are bigger
    const near = (scale: number): number => {
      const f = new FoodField(2, { ...SETTINGS, scale })
      const a: number[] = []
      const b: number[] = []
      for (let x = 10; x < 480; x += 7) {
        for (let y = 10; y < 480; y += 7) {
          a.push(f.density(x, y, 0))
          b.push(f.density(x + 20, y, 0))
        }
      }
      return correlation(a, b)
    }
    expect(near(240)).toBeGreaterThan(near(40))
  })

  it('drifts: the pattern decorrelates with time, and a zero turnover freezes it', () => {
    const field = new FoodField(4, SETTINGS)
    const t0 = grid(field, 0)
    const soon = correlation(t0, grid(field, 60))
    const later = correlation(t0, grid(field, 3600))
    expect(soon).toBeGreaterThan(0.9)
    expect(later).toBeLessThan(0.5)
    const frozen = new FoodField(4, { ...SETTINGS, turnover: 0 })
    expect(grid(frozen, 0)).toEqual(grid(frozen, 1e6))
  })
})

describe('spawning with the patchy field', () => {
  const small = { organisms: { initialCount: 0 }, resources: { initialCount: 150, maxCount: 400 } }
  const noise = (extra: object = {}): object => ({
    ...small,
    resources: { ...small.resources, distribution: { mode: 'noise', ...extra } }
  })

  /** Food counts per 50 x 50 cell. */
  function clumpiness(world: World): number {
    const cells = new Array<number>(100).fill(0)
    for (const r of world.snapshot().resources) {
      cells[Math.floor(r.position.y / 50) * 10 + Math.floor(r.position.x / 50)]! += 1
    }
    return cv(cells.map((c) => c + 1e-9))
  }

  it('makes food clumped where a uniform spread is not (16 seeds)', () => {
    let patchy = 0
    let flat = 0
    for (let seed = 1; seed <= 16; seed++) {
      patchy += clumpiness(World.create({ seed, config: noise() as never }))
      flat += clumpiness(World.create({ seed, config: small as never }))
    }
    expect(patchy / 16).toBeGreaterThan(1.4 * (flat / 16))
  })

  it('puts every item inside the world, and in a region its kind grows in', () => {
    const world = World.create({ seed: 9, config: noise() as never })
    const { width, height } = world.config.environment
    for (const r of world.snapshot().resources) {
      expect(r.position.x).toBeGreaterThanOrEqual(0)
      expect(r.position.x).toBeLessThanOrEqual(width)
      expect(r.position.y).toBeGreaterThanOrEqual(0)
      expect(r.position.y).toBeLessThanOrEqual(height)
      const grows = world.config.ecology.resourceKinds.kinds[r.kind]!.regions
      expect(grows).toContain(world.regionTypeAt(r.position.x, r.position.y))
    }
    expect(world.snapshot().resources.length).toBeGreaterThan(50)
  })

  it('takes the same number of draws whatever the pattern accepts', () => {
    // initial food only (no organisms, no ticks): the stream state depends on draws, not outcomes
    const state = (extra: object): unknown => {
      const world = World.create({ seed: 5, config: noise(extra) as never })
      const streams = (world as unknown as { randomStreams: { get(n: string): SeededRandom } })
        .randomStreams
      return streams.get('environment').getState()
    }
    const base = state({ contrast: 1 })
    expect(state({ contrast: 0 })).toEqual(base)
    expect(state({ contrast: 0.5, floor: 0.9, scale: 30 })).toEqual(base)
  })

  it('uniform mode is exactly the old two draws a spawn: another mode does not change it', () => {
    const a = World.create({ seed: 5, config: small as never })
    const b = World.create({
      seed: 5,
      config: {
        ...small,
        resources: { ...small.resources, distribution: { mode: 'uniform', contrast: 0.2 } }
      } as never
    })
    expect(b.snapshot().resources).toEqual(a.snapshot().resources)
  })

  it('is deterministic: stepped and chunked runs agree, and the same seed gives the same food', () => {
    const config = { ...(noise() as object), organisms: { initialCount: 10 } } as never
    const whole = World.create({ seed: 3, config })
    whole.run(600)
    const chunked = World.create({ seed: 3, config })
    chunked.run(250)
    chunked.run(350)
    expect(chunked.stateHash()).toBe(whole.stateHash())
    expect(World.create({ seed: 3, config }).snapshot().resources).toEqual(
      World.create({ seed: 3, config }).snapshot().resources
    )
  })

  it('the pattern drifts: food spawned later follows the pattern of its time, not the first one', () => {
    // with no eaters and a long run the spawn sites move as the pattern turns over
    const config = {
      organisms: { initialCount: 0 },
      resources: {
        initialCount: 0,
        maxCount: 3000,
        spawnRate: 50,
        distribution: { mode: 'noise', turnover: 60 }
      },
      ecology: { resourceKinds: { enabled: false } }
    } as never
    const world = World.create({ seed: 11, config })
    world.run(100)
    const early = new Set(world.snapshot().resources.map((r) => r.id))
    world.run(3000)
    const lateOnly = world.snapshot().resources.filter((r) => !early.has(r.id))
    const cell = (r: { position: { x: number; y: number } }): number =>
      Math.floor(r.position.y / 50) * 10 + Math.floor(r.position.x / 50)
    const count = (items: { position: { x: number; y: number } }[]): number[] => {
      const c = new Array<number>(100).fill(0)
      for (const r of items) c[cell(r)]! += 1
      return c
    }
    const first = count(world.snapshot().resources.filter((r) => early.has(r.id)))
    const later = count(lateOnly)
    expect(correlation(first, later)).toBeLessThan(0.6)
  })
})
