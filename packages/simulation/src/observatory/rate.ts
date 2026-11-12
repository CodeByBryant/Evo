import { mean } from './stats'

/**
 * How fast a population's trait means are moving between two samples: the mean over dimensions of
 * `|change in mean| / scale`, where each dimension's scale is the width of its range (a gene's
 * min to max, or a stated bound for a derived trait). Dimensions with no scale are skipped. Exactly 0
 * when no mean moved. The first version divided by the population's own standard deviation, as
 * Haldane's rate does; the control run showed why that fails here: in a world with mutation switched
 * off the variation left is tiny, so ordinary selection moved the means by many "standard
 * deviations" and the frozen world read four times as fast as the evolving one (ADR 0024).
 */
export function evolutionaryRate(
  previousMeans: readonly number[],
  currentMeans: readonly number[],
  scales: readonly number[]
): number {
  const rates: number[] = []
  const n = Math.min(previousMeans.length, currentMeans.length, scales.length)
  for (let i = 0; i < n; i++) {
    const scale = scales[i] as number
    if (scale <= 0) continue
    rates.push(Math.abs((currentMeans[i] as number) - (previousMeans[i] as number)) / scale)
  }
  return mean(rates)
}

/** The mean of each column of `rows` (one row a creature). */
export function columnMeans(rows: readonly (readonly number[])[]): number[] {
  const width = rows.length === 0 ? 0 : (rows[0] as readonly number[]).length
  const means: number[] = []
  for (let c = 0; c < width; c++) means.push(mean(rows.map((row) => row[c] as number)))
  return means
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
export const STASIS_RATE = 0.001
export const STASIS_DRIFT = 0.0003

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
