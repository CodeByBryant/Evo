import { MAX_SEED } from '@evo/contracts'

export interface UrlState {
  readonly seed?: number
  readonly preset?: string
}

/** Reads `#seed=123&preset=lush`. Anything malformed is ignored, never thrown. */
export function parseHash(hash: string): UrlState {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const out: { seed?: number; preset?: string } = {}
  const seed = params.get('seed')
  if (seed !== null && /^\d{1,10}$/.test(seed)) {
    const value = Number(seed)
    if (Number.isSafeInteger(value) && value <= MAX_SEED) out.seed = value
  }
  const preset = params.get('preset')
  if (preset !== null && /^[a-z][a-z0-9-]{0,40}$/.test(preset)) out.preset = preset
  return out
}

/** The hash that reproduces a world: `#seed=123&preset=lush`. */
export function formatHash(seed: number, preset: string): string {
  return `#seed=${seed}&preset=${preset}`
}

/** A random seed in `[0, MAX_SEED]` from the given source of random 32-bit unsigned integers. */
export function randomSeedFrom(random32: () => number): number {
  return random32() % (MAX_SEED + 1)
}
