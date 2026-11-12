import { mouthFormOf } from '@evo/contracts'
import type { AnatomyPart } from '@evo/contracts'

/**
 * A body plan's identity for novelty counting (ADR 0024): the sorted types of its **functional**
 * parts, the form of its mouth, and how many functional parts it has (binned, so one extra part of a
 * kind already carried is not a new plan). Colour, size and placement never count, as for species.
 */
export function bodySignature(parts: readonly AnatomyPart[]): string {
  const working = parts.filter((part) => part.functional)
  const types = working.map((part) => part.type).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const mouth = working.find((part) => part.type === 'mouth')
  const form = mouth === undefined ? 'none' : mouthFormOf(mouth.stats[2] ?? 0.5)
  const bin = working.length <= 4 ? 'small' : working.length <= 8 ? 'medium' : 'large'
  return `${types.join(',')}|${form}|${bin}`
}

/** What a body adds up to, for the complexity trend. */
export interface BodyComplexity {
  /** Functional parts. */
  readonly parts: number
  /** Distinct functional part types. */
  readonly types: number
}

export function bodyComplexity(parts: readonly AnatomyPart[]): BodyComplexity {
  const working = parts.filter((part) => part.functional)
  return { parts: working.length, types: new Set(working.map((part) => part.type)).size }
}

/** One sample's view of novelty. */
export interface NoveltySample {
  /** Signatures never seen before at this sample. */
  readonly newSignatures: number
  /** Signatures ever seen. */
  readonly everSeen: number
  /** Signatures that have **taken hold** (below) for the first time at this sample. */
  readonly newlyPersistent: number
  /** Signatures that have taken hold, ever. */
  readonly persistent: number
  /** Signatures alive now. */
  readonly alive: number
}

/** A signature has taken hold after this many consecutive samples alive, having reached the share below. */
export const PERSISTENT_SAMPLES = 3
export const PERSISTENT_SHARE = 0.02

/**
 * Persistent novelty, after Bedau's activity statistics: a new plan that appears for a moment and is
 * gone does not count; one that is alive for `PERSISTENT_SAMPLES` samples in a row and has made up
 * `PERSISTENT_SHARE` of the population at some sample has **taken hold**. Pure bookkeeping over
 * the sample sequence it is shown; it never sees the simulation.
 */
export class NoveltyTracker {
  private readonly seen = new Set<string>()
  private readonly streak = new Map<string, number>()
  private readonly reachedShare = new Set<string>()
  private readonly counted = new Set<string>()

  observe(populations: ReadonlyMap<string, number>): NoveltySample {
    let total = 0
    for (const count of populations.values()) total += count
    let newSignatures = 0
    let newlyPersistent = 0
    const nextStreak = new Map<string, number>()
    for (const [signature, count] of populations) {
      if (count <= 0) continue
      if (!this.seen.has(signature)) {
        this.seen.add(signature)
        newSignatures += 1
      }
      nextStreak.set(signature, (this.streak.get(signature) ?? 0) + 1)
      if (total > 0 && count / total >= PERSISTENT_SHARE) this.reachedShare.add(signature)
      if (
        !this.counted.has(signature) &&
        (nextStreak.get(signature) as number) >= PERSISTENT_SAMPLES &&
        this.reachedShare.has(signature)
      ) {
        this.counted.add(signature)
        newlyPersistent += 1
      }
    }
    this.streak.clear()
    for (const [signature, run] of nextStreak) this.streak.set(signature, run)
    return {
      newSignatures,
      everSeen: this.seen.size,
      newlyPersistent,
      persistent: this.counted.size,
      alive: nextStreak.size
    }
  }
}
