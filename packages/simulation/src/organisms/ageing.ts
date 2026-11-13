import type { AgeingConfig } from '@evo/contracts'

/** The ages that set a creature's own senescence (its genes, not the world's baseline). */
export interface AgeGenes {
  readonly senescenceAge: number
  readonly maxAge: number
}

/**
 * How far into old age a creature is (ADR 0027): `0` until its `senescenceAge`, `1` at its `maxAge`,
 * and above 1 beyond it. A pure function of age and its own genes, never stored.
 */
export function senescenceOf(age: number, genes: AgeGenes): number {
  if (age <= genes.senescenceAge) return 0
  return (age - genes.senescenceAge) / Math.max(genes.maxAge - genes.senescenceAge, 1)
}

/** What metabolism costs now, as a multiple of what it did (exactly 1 with ageing off or in prime). */
export function ageingCostFactor(ageing: AgeingConfig, age: number, genes: AgeGenes): number {
  if (!ageing.enabled) return 1
  const s = senescenceOf(age, genes)
  return s === 0 ? 1 : 1 + ageing.metabolismRise * Math.min(s, 2)
}

/** The share of top speed kept now (exactly 1 with ageing off or in prime). */
export function ageingSpeedFactor(ageing: AgeingConfig, age: number, genes: AgeGenes): number {
  if (!ageing.enabled) return 1
  const s = senescenceOf(age, genes)
  return s === 0 ? 1 : 1 - ageing.speedLoss * Math.min(s, 1)
}

/** What the energy needed to reproduce is multiplied by now (exactly 1 with ageing off or in prime). */
export function ageingFertilityFactor(ageing: AgeingConfig, age: number, genes: AgeGenes): number {
  if (!ageing.enabled) return 1
  const s = senescenceOf(age, genes)
  return s === 0 ? 1 : 1 + ageing.fertilityLoss * Math.min(s, 1)
}
