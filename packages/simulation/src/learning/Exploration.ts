import { clamp } from '../math/scalar'

/**
 * Standard deviation of the exploration noise on every output this tick
 * (docs/learning/brain.md, "Exploration"). `previousExplore` is last tick's `explore` output in
 * `[-1, 1]`: the brain controls how much it explores by `1 + explore`, between 0 and 2 times the
 * gene's value. `persistence` keeps exploration from annealing with age: at 1 it is constant, at
 * 0 it falls linearly to nothing at `maxAge` (roadmap 5.6).
 */
export function explorationSigma(
  explorationRate: number,
  persistence: number,
  age: number,
  maxAge: number,
  previousExplore: number
): number {
  const ageFraction = maxAge > 0 ? clamp(age / maxAge, 0, 1) : 1
  const ageFactor = persistence + (1 - persistence) * (1 - ageFraction)
  return explorationRate * ageFactor * clamp(1 + previousExplore, 0, 2)
}
