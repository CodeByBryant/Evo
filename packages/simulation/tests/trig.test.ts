import { describe, expect, it } from 'vitest'
import { MAX_TRIG_ARGUMENT, atan2, cos, ln, sin } from '../src/index'
import { SeededRandom, deriveStreamWords } from '../src/index'

/** Deterministic sample source so failures are reproducible. */
function sampler(): SeededRandom {
  return new SeededRandom(deriveStreamWords(20260920, 'trig-tests'))
}

const HALF_PI = Math.PI / 2

describe('sin and cos', () => {
  it('match the platform within 1e-15 across the whole supported range', () => {
    const random = sampler()
    let worst = 0
    for (let i = 0; i < 30_000; i++) {
      const scale = [1, 10, 1000, MAX_TRIG_ARGUMENT][i % 4] as number
      const x = (random.float() * 2 - 1) * scale
      worst = Math.max(worst, Math.abs(sin(x) - Math.sin(x)), Math.abs(cos(x) - Math.cos(x)))
    }
    expect(worst).toBeLessThan(1e-15)
  })

  it('stay accurate next to multiples of pi/2, where reduction is hardest', () => {
    const random = sampler()
    for (let i = 0; i < 4000; i++) {
      const k = random.integer(-200_000, 200_000)
      const x = k * HALF_PI + (random.float() * 2 - 1) * 1e-6
      expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThan(1e-15)
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThan(1e-15)
    }
  })

  it('are exact at the easy points', () => {
    expect(sin(0)).toBe(0)
    expect(cos(0)).toBe(1)
    expect(Object.is(sin(-0), -0)).toBe(true)
    expect(sin(1e-30)).toBe(1e-30)
    expect(sin(Math.PI)).toBeCloseTo(0, 15)
    expect(cos(Math.PI)).toBeCloseTo(-1, 15)
    expect(sin(HALF_PI)).toBeCloseTo(1, 15)
    expect(cos(HALF_PI)).toBeCloseTo(0, 15)
  })

  it('are odd and even functions', () => {
    const random = sampler()
    for (let i = 0; i < 500; i++) {
      const x = (random.float() * 2 - 1) * 100
      expect(sin(-x)).toBe(-sin(x))
      expect(cos(-x)).toBe(cos(x))
    }
  })

  it('satisfy sin^2 + cos^2 = 1', () => {
    const random = sampler()
    for (let i = 0; i < 2000; i++) {
      const x = (random.float() * 2 - 1) * 1000
      expect(Math.abs(sin(x) ** 2 + cos(x) ** 2 - 1)).toBeLessThan(4e-16)
    }
  })

  it('reject arguments outside the supported domain', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, MAX_TRIG_ARGUMENT + 1, -2e6]) {
      expect(() => sin(bad)).toThrow(RangeError)
      expect(() => cos(bad)).toThrow(RangeError)
    }
    expect(() => sin(MAX_TRIG_ARGUMENT)).not.toThrow()
  })
})

describe('atan2', () => {
  it('matches the platform within 1e-15 for arbitrary points', () => {
    const random = sampler()
    let worst = 0
    for (let i = 0; i < 30_000; i++) {
      const scale = [1, 1e-8, 1e8, 1e150][i % 4] as number
      const y = (random.float() * 2 - 1) * scale
      const x = (random.float() * 2 - 1) * scale
      worst = Math.max(worst, Math.abs(atan2(y, x) - Math.atan2(y, x)))
    }
    expect(worst).toBeLessThan(1e-15)
  })

  it('matches on wildly different magnitudes of x and y', () => {
    const random = sampler()
    for (let i = 0; i < 3000; i++) {
      const y = (random.float() * 2 - 1) * 10 ** random.integer(-100, 100)
      const x = (random.float() * 2 - 1) * 10 ** random.integer(-100, 100)
      if (x === 0 && y === 0) continue
      expect(Math.abs(atan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-15)
    }
  })

  it('handles axes, quadrants and signed zeros', () => {
    expect(atan2(0, 1)).toBe(0)
    expect(Object.is(atan2(-0, 1), -0)).toBe(true)
    expect(atan2(0, -1)).toBeCloseTo(Math.PI, 15)
    expect(atan2(-0, -1)).toBeCloseTo(-Math.PI, 15)
    expect(atan2(1, 0)).toBeCloseTo(HALF_PI, 15)
    expect(atan2(-1, 0)).toBeCloseTo(-HALF_PI, 15)
    expect(atan2(1, 1)).toBeCloseTo(Math.PI / 4, 15)
    expect(atan2(1, -1)).toBeCloseTo((3 * Math.PI) / 4, 15)
    expect(atan2(-1, -1)).toBeCloseTo((-3 * Math.PI) / 4, 15)
    expect(atan2(-1, 1)).toBeCloseTo(-Math.PI / 4, 15)
  })

  it('inverts sin and cos', () => {
    const random = sampler()
    for (let i = 0; i < 1000; i++) {
      const theta = (random.float() * 2 - 1) * Math.PI * 0.999
      expect(Math.abs(atan2(sin(theta), cos(theta)) - theta)).toBeLessThan(1e-15)
    }
  })

  it('rejects non-finite arguments', () => {
    expect(() => atan2(Number.NaN, 1)).toThrow(RangeError)
    expect(() => atan2(1, Infinity)).toThrow(RangeError)
  })
})

describe('ln', () => {
  it('matches the platform to within 2e-16 relative error', () => {
    const random = sampler()
    let worst = 0
    for (let i = 0; i < 30_000; i++) {
      const x = 10 ** ((random.float() * 2 - 1) * 300)
      const expected = Math.log(x)
      worst = Math.max(worst, Math.abs(ln(x) - expected) / Math.max(1, Math.abs(expected)))
    }
    expect(worst).toBeLessThan(2e-16)
  })

  it('is accurate close to 1, where the logarithm is tiny', () => {
    for (const x of [1 + 1e-8, 1 + 1e-12, 1 - 1e-9, 1 + 2 ** -21, 1 - 2 ** -30, 0.5, 2, 0.75]) {
      expect(Math.abs(ln(x) - Math.log(x)) / Math.abs(Math.log(x))).toBeLessThan(2e-15)
    }
  })

  it('handles exact and extreme values', () => {
    expect(ln(1)).toBe(0)
    expect(ln(Math.E)).toBeCloseTo(1, 15)
    expect(ln(2)).toBeCloseTo(0.6931471805599453, 15)
    expect(ln(Number.MIN_VALUE)).toBeCloseTo(Math.log(Number.MIN_VALUE), 10)
    expect(ln(Number.MAX_VALUE)).toBeCloseTo(Math.log(Number.MAX_VALUE), 10)
  })

  it('satisfies ln(a*b) = ln(a) + ln(b)', () => {
    const random = sampler()
    for (let i = 0; i < 500; i++) {
      const a = 1 + random.float() * 100
      const b = 1 + random.float() * 100
      expect(Math.abs(ln(a * b) - (ln(a) + ln(b)))).toBeLessThan(1e-14)
    }
  })

  it('rejects arguments outside its domain', () => {
    for (const bad of [0, -0, -1, Number.NaN, Infinity, -Infinity]) {
      expect(() => ln(bad)).toThrow(RangeError)
    }
  })
})
