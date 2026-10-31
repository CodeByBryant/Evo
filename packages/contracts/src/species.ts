/** Species identity: allocated from 0 in creation order and never reused. */
export type SpeciesId = number

/**
 * Relative importance of each gene group when comparing two genomes for speciation. Only the
 * ratios matter: the combined distance divides by the sum of the weights.
 */
export interface SpeciesDistanceWeights {
  physical: number
  sensory: number
  metabolic: number
  behavioral: number
  reproduction: number
  learning: number
  brain: number
}

/** A count of living members at one tick. */
export interface PopulationSample {
  tick: number
  count: number
}

/**
 * One species: a group of organisms whose genomes are close to the species' founding genome
 * (docs/simulation/species.md). Extinct species are kept so history stays queryable.
 */
export interface SpeciesRecord {
  id: SpeciesId
  /** The genome that founded the species; it never changes. */
  representativeGenomeId: number
  /** The species of the founding organism's mother; `null` for species founded at tick 0. */
  ancestorSpeciesId: SpeciesId | null
  /** Living organisms currently assigned to the species. */
  memberCount: number
  /** Samples taken every `species.sampleInterval` ticks; the oldest are dropped past the cap. */
  populationHistory: PopulationSample[]
  createdAtTick: number
  /** The last tick at which the species had a living member. */
  lastSeenTick: number
  /** The tick the last member died, or `null` while the species is alive. */
  extinctAtTick: number | null
}

export interface SpeciesConfig {
  /** `false` disables the registry entirely (no species ids, empty queries). */
  enabled: boolean
  /** Largest weighted genetic distance, in `[0, 1]`, at which a genome joins an existing species. */
  threshold: number
  distanceWeights: SpeciesDistanceWeights
  /** Ticks between population-history samples. */
  sampleInterval: number
  /** Samples retained per species; the oldest are dropped. `0` keeps none. */
  maxHistorySamples: number
  /** When `true`, organisms only reproduce with members of their own species. */
  reproductiveIsolation: boolean
}

export interface SpeciesConfigOverrides extends Partial<Omit<SpeciesConfig, 'distanceWeights'>> {
  distanceWeights?: Partial<SpeciesDistanceWeights>
}
