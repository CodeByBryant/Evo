import { validateSeed } from '@evo/config'
import { utf8Encode } from '../serialization/utf8'
import { FALLBACK_WORDS, SeededRandom } from './SeededRandom'
import type { RandomState } from './SeededRandom'

/**
 * The named random streams, in their fixed canonical order. Code must use this array (or a named
 * field); nothing iterates a registry by object key. Adding a draw to one stream never changes
 * another stream's sequence.
 */
export const STREAM_NAMES = [
  'world',
  'genetics',
  'reproduction',
  'environment',
  'learning',
  'events'
] as const

export type StreamName = (typeof STREAM_NAMES)[number]

const DERIVATION_PREFIX = 'evo-rng-v1'

/** FNV-1a, 32 bit, over raw bytes. */
export function fnv1a32(bytes: Uint8Array): number {
  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash = Math.imul(hash ^ byte, 0x01000193)
  }
  return hash >>> 0
}

/** The input bytes hashed to seed a stream (determinism.md, section 3.1, step 1). */
export function streamDerivationBytes(seed: number, name: string): Uint8Array {
  const prefix = utf8Encode(DERIVATION_PREFIX)
  const nameBytes = utf8Encode(name)
  const bytes = new Uint8Array(prefix.length + 1 + 4 + 1 + nameBytes.length)
  let offset = 0
  bytes.set(prefix, offset)
  offset += prefix.length
  bytes[offset++] = 0
  bytes[offset++] = (seed >>> 24) & 0xff
  bytes[offset++] = (seed >>> 16) & 0xff
  bytes[offset++] = (seed >>> 8) & 0xff
  bytes[offset++] = seed & 0xff
  bytes[offset++] = 0
  bytes.set(nameBytes, offset)
  return bytes
}

/** splitmix32: returns a function producing successive uint32 outputs from `state`. */
export function splitmix32(initial: number): () => number {
  let state = initial | 0
  return () => {
    state = (state + 0x9e3779b9) | 0
    let z = state
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
    return (z ^ (z >>> 16)) >>> 0
  }
}

/** Replaces the invalid all-zero xoshiro state with the fixed fallback constant. */
export function withFallback(
  words: readonly [number, number, number, number]
): readonly [number, number, number, number] {
  return words.every((word) => word === 0) ? FALLBACK_WORDS : words
}

/** Expands a 32-bit hash into four xoshiro state words (determinism.md, section 3.1). */
export function expandSeed(hash: number): readonly [number, number, number, number] {
  const next = splitmix32(hash)
  return withFallback([next(), next(), next(), next()])
}

/** Initial state words for `name` under the master `seed`. */
export function deriveStreamWords(
  seed: number,
  name: string
): readonly [number, number, number, number] {
  return expandSeed(fnv1a32(streamDerivationBytes(seed, name)))
}

/** All of a world's random streams, derived from one master seed. */
export class RandomStreams {
  readonly seed: number
  private readonly streams: readonly SeededRandom[]

  constructor(seed: number) {
    const check = validateSeed(seed)
    if (!check.ok) throw new RangeError(check.errors.join('; '))
    this.seed = seed
    this.streams = STREAM_NAMES.map((name) => new SeededRandom(deriveStreamWords(seed, name)))
  }

  get(name: StreamName): SeededRandom {
    const index = STREAM_NAMES.indexOf(name)
    if (index < 0) throw new RangeError(`unknown random stream "${name}"`)
    return this.streams[index] as SeededRandom
  }

  /** Every stream's state, in `STREAM_NAMES` order. */
  getStates(): readonly RandomState[] {
    return this.streams.map((stream) => stream.getState())
  }

  setStates(states: readonly RandomState[]): void {
    if (states.length !== this.streams.length) {
      throw new RangeError(`expected ${this.streams.length} stream states`)
    }
    this.streams.forEach((stream, index) => stream.setState(states[index] as RandomState))
  }
}
