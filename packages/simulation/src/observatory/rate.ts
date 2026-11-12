import { mean, standardDeviation } from './stats'

/**
 * How fast a population's trait means are moving between two samples, in units of the population's
 * own spread (a Haldane-like standardised rate): the mean over dimensions of `|change in mean| /
 * pooled standard deviation`. Dimensions with no spread at either sample are skipped (nothing
 * varies there, so nothing can be said). Exactly 0 when no mean moved.
 */
export function evolutionaryRate(
  previousMeans: readonly number[],
  currentMeans: readonly number[],
  previousSd: readonly number[],
  currentSd: readonly number[]
): number {
  const rates: number[] = []
  const n = Math.min(previousMeans.length, currentMeans.length)
  for (let i = 0; i < n; i++) {
    const sdA = previousSd[i] as number
    const sdB = currentSd[i] as number
    const pooled = Math.sqrt((sdA * sdA + sdB * sdB) / 2)
    if (pooled <= 0) continue
    rates.push(Math.abs((currentMeans[i] as number) - (previousMeans[i] as number)) / pooled)
  }
  return mean(rates)
}

/** Means and standard deviations of each column of `rows` (one row a creature). */
export function columnStatistics(rows: readonly (readonly number[])[]): {
  means: number[]
  sds: number[]
} {
  const width = rows.length === 0 ? 0 : (rows[0] as readonly number[]).length
  const means: number[] = []
  const sds: number[] = []
  for (let c = 0; c < width; c++) {
    const column = rows.map((row) => row[c] as number)
    means.push(mean(column))
    sds.push(standardDeviation(column))
  }
  return { means, sds }
}

/** What counts as "nothing is happening" at one sample. */
export interface QuietSignals {
  readonly newSignatures: number
  readonly newlyPersistent: number
  readonly rate: number
  /** Change in the mean brain drift since the last sample (absolute). */
  readonly driftChange: number
}

export const STASIS_SAMPLES = 10
export const STASIS_RATE = 0.05
export const STASIS_DRIFT = 0.005

/**
 * The stasis indicator: true once `STASIS_SAMPLES` samples in a row have had no new body plan taking
 * hold or appearing, a trait rate under `STASIS_RATE` and a brain drift change under `STASIS_DRIFT`;
 * one busy sample resets it. An indicator, not a verdict: it says "nothing measurable moved", which
 * is what a settled world looks like and also what a very slow one looks like.
 */
export class StasisDetector {
  private quiet = 0

  push(signals: QuietSignals): boolean {
    const quietNow =
      signals.newSignatures === 0 &&
      signals.newlyPersistent === 0 &&
      signals.rate < STASIS_RATE &&
      signals.driftChange < STASIS_DRIFT
    this.quiet = quietNow ? this.quiet + 1 : 0
    return this.quiet >= STASIS_SAMPLES
  }

  get quietSamples(): number {
    return this.quiet
  }
}
