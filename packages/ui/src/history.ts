import type { HistoryPoint } from '@evo/contracts'

/** Deaths per simulated minute, by cause, over a trailing window of the run. */
export interface DeathRates {
  readonly starved: number
  readonly aged: number
  readonly damaged: number
  readonly total: number
  /** Simulated seconds the rates were measured over (0 when there are not two samples). */
  readonly seconds: number
}

/** The trailing window death rates are measured over, in simulated seconds. */
export const DEATH_RATE_WINDOW = 120

/**
 * Death rates from the cumulative counters: the difference between the newest sample and the oldest
 * one inside the window, per simulated minute. It uses simulated time, not sample counts, so it is
 * the same however coarsely the history was sampled. Fewer than two samples gives zeros.
 */
export function deathRates(
  points: readonly HistoryPoint[],
  windowSeconds = DEATH_RATE_WINDOW
): DeathRates {
  const latest = points[points.length - 1]
  const zero: DeathRates = { starved: 0, aged: 0, damaged: 0, total: 0, seconds: 0 }
  if (latest === undefined) return zero
  const from = points.find((point) => point.time >= latest.time - windowSeconds)
  if (from === undefined) return zero
  const seconds = latest.time - from.time
  if (!(seconds > 0)) return zero
  const perMinute = (now: number, before: number): number =>
    (Math.max(0, now - before) / seconds) * 60
  const starved = perMinute(latest.starved, from.starved)
  const aged = perMinute(latest.aged, from.aged)
  const damaged = perMinute(latest.damaged, from.damaged)
  return { starved, aged, damaged, total: starved + aged + damaged, seconds }
}

/** The share of `part` in `total` as a fraction in `[0, 1]`, or 0 when there is no total. */
export function shareOf(part: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, part / total)) : 0
}
