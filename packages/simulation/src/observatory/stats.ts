/**
 * Small, pure statistics for the observatory (ADR 0024). Nothing here draws a random number or
 * touches the simulation, and only `+ - * /` and `sqrt` are used, so the results are the same on
 * every platform (the engine's determinism policy bans `exp` and `log`, which is why diversity is
 * the inverse Simpson index and not the exponential of the Shannon entropy).
 */

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  let sum = 0
  for (const value of values) sum += value
  return sum / values.length
}

/** Population standard deviation (0 for fewer than two values). */
export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  let squared = 0
  for (const value of values) squared += (value - m) * (value - m)
  return Math.sqrt(squared / values.length)
}

/**
 * Keeps at most `cap` items by taking every `ceil(n / cap)`-th one in order, so a pairwise measure
 * over a crowded world costs a bounded amount and the same population always gives the same subset
 * (no randomness, so a run is the same however it is sliced).
 */
export function stridedSample<T>(items: readonly T[], cap: number): T[] {
  if (cap <= 0) return []
  if (items.length <= cap) return items.slice()
  const stride = Math.ceil(items.length / cap)
  const kept: T[] = []
  for (let i = 0; i < items.length; i += stride) kept.push(items[i] as T)
  return kept
}

/** Mean of `distance` over all unordered pairs of the (strided) items; 0 for fewer than two. */
export function meanPairwise<T>(
  items: readonly T[],
  distance: (a: T, b: T) => number,
  cap = 200
): number {
  const subset = stridedSample(items, cap)
  if (subset.length < 2) return 0
  let sum = 0
  let pairs = 0
  for (let i = 0; i < subset.length; i++) {
    for (let j = i + 1; j < subset.length; j++) {
      sum += distance(subset[i] as T, subset[j] as T)
      pairs += 1
    }
  }
  return sum / pairs
}

/**
 * The effective number of types in a population: the inverse Simpson index, `1 / sum(p^2)` (a
 * Hill number of order 2). One type gives 1, `k` equally common types give `k`, and a rare type
 * adds little, so a bit of noise does not look like diversity. Zero for an empty population.
 */
export function effectiveTypes(counts: Iterable<number>): number {
  let total = 0
  let squares = 0
  for (const count of counts) {
    total += count
    squares += count * count
  }
  return total === 0 ? 0 : (total * total) / squares
}

/** Clamps to `[0, 1]`. */
export function unit(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}
