import { describe, expect, it } from 'vitest'
import {
  FALLBACK_WORDS,
  RandomStreams,
  STREAM_NAMES,
  SeededRandom,
  deriveStreamWords,
  fnv1a32,
  splitmix32,
  streamDerivationBytes,
  utf8Encode,
  withFallback
} from '../src/index'
import type { StreamName } from '../src/index'

const hex = (value: number): string => value.toString(16).padStart(8, '0')

function take<T>(count: number, next: () => T): T[] {
  return Array.from({ length: count }, next)
}

function stream(seed: number, name: StreamName): SeededRandom {
  return new SeededRandom(deriveStreamWords(seed, name))
}

/** Test vectors from docs/simulation/determinism.md, section 10. */
describe('published test vectors', () => {
  it('xoshiro128** reference vector (state 1, 2, 3, 4)', () => {
    const random = new SeededRandom([1, 2, 3, 4])
    expect(take(5, () => random.nextUint32())).toEqual([11520, 0, 5927040, 70819200, 2031721883])
  })

  it('splitmix32 from state 0', () => {
    const next = splitmix32(0)
    expect(take(4, () => hex(next()))).toEqual(['92ca2f0e', '3cd6e3f3', '1b147dcc', '4c081dbf'])
  })

  it('FNV-1a 32', () => {
    expect(hex(fnv1a32(new Uint8Array()))).toBe('811c9dc5')
    expect(hex(fnv1a32(utf8Encode('a')))).toBe('e40c292c')
  })

  it('derives the input bytes exactly as specified', () => {
    const bytes = Array.from(streamDerivationBytes(0x01020304, 'world'))
    expect(bytes).toEqual([
      ...Array.from(utf8Encode('evo-rng-v1')),
      0,
      1,
      2,
      3,
      4,
      0,
      ...Array.from(utf8Encode('world'))
    ])
  })

  const derivation: [number, StreamName, string, string[], string[]][] = [
    [
      0,
      'world',
      'efd9722d',
      ['8b62ade1', 'bf255130', 'c5944491', '34017452'],
      ['c7a2bb45', '1bb1a33c', '86d23f16', '8f092bc7', '40d090b8']
    ],
    [
      12345,
      'world',
      'addaf902',
      ['b5db87a8', 'd0a8d56a', 'ef5000d3', 'ceee5ea3'],
      ['d6c1d151', '1ab681a1', 'faa57b3a', '9683ec97', '7716721f']
    ],
    [
      12345,
      'environment',
      '6f3eec1b',
      ['492c4d1e', '8dc897d6', 'de2ce6ed', 'f409a79d'],
      ['21585272', '994942d2', 'e732875e', '8f0ba0d6', 'de7d2e4a']
    ],
    [
      4294967295,
      'events',
      'db27b2e6',
      ['22508baa', '02d8d2a4', 'f08f4592', '4f1fdf14'],
      ['0e836a3f', 'a003b648', '9386b468', 'a8d03560', '10ea8822']
    ]
  ]

  it.each(derivation)('stream derivation for seed %d / %s', (seed, name, hash, words, outputs) => {
    expect(hex(fnv1a32(streamDerivationBytes(seed, name)))).toBe(hash)
    expect(deriveStreamWords(seed, name).map(hex)).toEqual(words)
    const random = stream(seed, name)
    expect(take(5, () => hex(random.nextUint32()))).toEqual(outputs)
  })

  it('stream hashes for seed 12345', () => {
    const hashes = STREAM_NAMES.map((name) => [
      name,
      hex(fnv1a32(streamDerivationBytes(12345, name)))
    ])
    expect(hashes).toEqual([
      ['world', 'addaf902'],
      ['genetics', '7414af4a'],
      ['reproduction', '69d29d14'],
      ['environment', '6f3eec1b'],
      ['learning', 'f025d548'],
      ['events', 'ba7b610b']
    ])
  })

  it('float() vector', () => {
    const random = stream(12345, 'world')
    expect(take(3, () => random.float())).toEqual([
      0.8388949193384299, 0.979087543397773, 0.4651862415849056
    ])
  })

  it('normal() vectors, and agreement with a platform Math.log reference', () => {
    const random = stream(12345, 'world')
    const values = take(6, () => random.normal())
    expect(values).toEqual([
      -0.08395824436766462, 0.9547267480700918, 0.45671744440420514, -0.09525980130307461,
      -0.8689923299360515, 1.5297792797712502
    ])
    const scaled = stream(0, 'environment')
    expect(take(4, () => scaled.normal(10, 2))).toEqual([
      11.022975575089307, 10.285749822714616, 9.212597100828681, 9.657366487438306
    ])
  })

  it('the all-zero state falls back to the fixed constant', () => {
    expect(withFallback([0, 0, 0, 0])).toEqual(FALLBACK_WORDS)
    expect(withFallback([0, 0, 0, 1])).toEqual([0, 0, 0, 1])
    const random = new SeededRandom(FALLBACK_WORDS)
    expect(take(3, () => hex(random.nextUint32()))).toEqual(['92dcf72a', '00544cb2', '3c7807cc'])
  })

  it('refuses to be constructed in the invalid all-zero state', () => {
    expect(() => new SeededRandom([0, 0, 0, 0])).toThrow(RangeError)
  })
})

describe('reproducibility and isolation', () => {
  it('the same seed and stream give the same sequence', () => {
    const a = stream(7, 'world')
    const b = stream(7, 'world')
    expect(take(1000, () => a.float())).toEqual(take(1000, () => b.float()))
  })

  it('different seeds give different sequences', () => {
    const a = stream(7, 'world')
    const b = stream(8, 'world')
    expect(take(10, () => a.nextUint32())).not.toEqual(take(10, () => b.nextUint32()))
  })

  it('different streams of one seed are independent sequences', () => {
    const a = stream(7, 'world')
    const b = stream(7, 'genetics')
    expect(take(10, () => a.nextUint32())).not.toEqual(take(10, () => b.nextUint32()))
  })

  it('drawing from one stream never changes another', () => {
    const untouched = new RandomStreams(99)
    const busy = new RandomStreams(99)
    for (let i = 0; i < 1000; i++) busy.get('world').float()
    expect(busy.get('environment').getState()).toEqual(untouched.get('environment').getState())
    expect(take(20, () => busy.get('genetics').nextUint32())).toEqual(
      take(20, () => untouched.get('genetics').nextUint32())
    )
  })
})

describe('float, integer, boolean, choose', () => {
  it('float stays in [0, 1)', () => {
    const random = stream(1, 'world')
    for (let i = 0; i < 20_000; i++) {
      const value = random.float()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('integer is inclusive at both ends and never leaves the range', () => {
    const random = stream(2, 'world')
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const value = random.integer(-3, 3)
      expect(value).toBeGreaterThanOrEqual(-3)
      expect(value).toBeLessThanOrEqual(3)
      seen.add(value)
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([-3, -2, -1, 0, 1, 2, 3])
  })

  it('integer handles single-value and full 32-bit ranges', () => {
    const random = stream(3, 'world')
    expect(random.integer(5, 5)).toBe(5)
    const wide = random.integer(0, 4_294_967_295)
    expect(wide).toBeGreaterThanOrEqual(0)
    expect(wide).toBeLessThanOrEqual(4_294_967_295)
  })

  it('integer is close to uniform (chi-square)', () => {
    const random = stream(4, 'world')
    const draws = 60_000
    const counts = [0, 0, 0, 0, 0, 0]
    for (let i = 0; i < draws; i++) {
      const bucket = random.integer(0, 5)
      counts[bucket] = (counts[bucket] ?? 0) + 1
    }
    const expected = draws / 6
    const chi = counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0)
    expect(chi).toBeLessThan(20.5) // 5 degrees of freedom, p ~ 0.001
  })

  it('integer rejects invalid ranges', () => {
    const random = stream(5, 'world')
    expect(() => random.integer(3, 2)).toThrow(RangeError)
    expect(() => random.integer(0.5, 2)).toThrow(RangeError)
    expect(() => random.integer(0, 2 ** 40)).toThrow(RangeError)
    expect(() => random.integer(Number.NaN, 1)).toThrow(RangeError)
  })

  it('boolean respects its probability', () => {
    const random = stream(6, 'world')
    expect(take(50, () => random.boolean(0)).some(Boolean)).toBe(false)
    expect(take(50, () => random.boolean(1)).every(Boolean)).toBe(true)
    const hits = take(20_000, () => random.boolean(0.3)).filter(Boolean).length
    expect(hits / 20_000).toBeGreaterThan(0.28)
    expect(hits / 20_000).toBeLessThan(0.32)
    expect(() => random.boolean(1.5)).toThrow(RangeError)
    expect(() => random.boolean(Number.NaN)).toThrow(RangeError)
  })

  it('choose picks members and rejects empty lists', () => {
    const random = stream(7, 'world')
    const items = ['a', 'b', 'c'] as const
    const picked = new Set(take(200, () => random.choose(items)))
    expect(picked).toEqual(new Set(items))
    expect(() => random.choose([])).toThrow(RangeError)
  })
})

describe('normal', () => {
  it('has the requested mean and standard deviation', () => {
    const random = stream(8, 'world')
    const values = take(100_000, () => random.normal(5, 2))
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
    expect(mean).toBeGreaterThan(4.97)
    expect(mean).toBeLessThan(5.03)
    expect(Math.sqrt(variance)).toBeGreaterThan(1.97)
    expect(Math.sqrt(variance)).toBeLessThan(2.03)
  })

  it('has roughly normal tails', () => {
    const random = stream(9, 'world')
    const values = take(100_000, () => random.normal())
    const beyondTwoSigma = values.filter((v) => Math.abs(v) > 2).length / values.length
    expect(beyondTwoSigma).toBeGreaterThan(0.04)
    expect(beyondTwoSigma).toBeLessThan(0.051)
  })

  it('caches the spare in the serializable state', () => {
    const random = stream(10, 'world')
    expect(random.getState().spare).toBeNull()
    random.normal()
    expect(random.getState().spare).not.toBeNull()
    random.normal()
    expect(random.getState().spare).toBeNull()
  })
})

describe('state save and restore', () => {
  it('continues the exact sequence, including a cached normal spare', () => {
    const original = stream(11, 'world')
    take(37, () => original.float())
    original.normal() // leaves a spare cached
    const saved = original.getState()
    const expected = take(50, () => original.normal())

    const restored = stream(999, 'genetics')
    restored.setState(saved)
    expect(take(50, () => restored.normal())).toEqual(expected)
  })

  it('rejects an invalid state', () => {
    const random = stream(12, 'world')
    expect(() => random.setState({ words: [0, 0, 0, 0], spare: null })).toThrow(RangeError)
    expect(() => random.setState({ words: [1.5, 0, 0, 1], spare: null })).toThrow(RangeError)
  })
})

describe('RandomStreams', () => {
  it('exposes every named stream in the canonical order', () => {
    expect(STREAM_NAMES).toEqual([
      'world',
      'genetics',
      'reproduction',
      'environment',
      'learning',
      'events'
    ])
    const streams = new RandomStreams(5)
    for (const name of STREAM_NAMES) {
      expect(streams.get(name).getState().words).toEqual(deriveStreamWords(5, name))
    }
  })

  it('validates the seed', () => {
    for (const bad of [-1, 1.5, 2 ** 32, Number.NaN]) {
      expect(() => new RandomStreams(bad)).toThrow(RangeError)
    }
    expect(() => new RandomStreams(0)).not.toThrow()
    expect(() => new RandomStreams(2 ** 32 - 1)).not.toThrow()
  })

  it('rejects unknown streams', () => {
    expect(() => new RandomStreams(1).get('nope' as StreamName)).toThrow(RangeError)
  })

  it('saves and restores every stream in order', () => {
    const a = new RandomStreams(21)
    for (const name of STREAM_NAMES) a.get(name).float()
    const states = a.getStates()
    expect(states).toHaveLength(STREAM_NAMES.length)

    const b = new RandomStreams(21)
    b.setStates(states)
    for (const name of STREAM_NAMES) {
      expect(b.get(name).nextUint32()).toBe(a.get(name).nextUint32())
    }
    expect(() => b.setStates(states.slice(1))).toThrow(RangeError)
  })
})
