/**
 * The evolution observatory's output (ADR 0024): indicators of whether a world is still changing,
 * sampled over time. Derived from the simulation and never fed back into it; none of it is hashed.
 */

/** The input groups of the brain, in the order the series reports them. */
export const BRAIN_INPUT_GROUPS = [
  'self',
  'food',
  'peer',
  'hazard',
  'season',
  'mate',
  'home',
  'prey',
  'threat',
  'recall'
] as const
export type BrainInputGroup = (typeof BRAIN_INPUT_GROUPS)[number]

/** One sample of the indicators, over the creatures alive at `tick`. */
export interface EvolutionSample {
  readonly tick: number
  /** Simulated seconds. */
  readonly time: number
  readonly population: number

  /** Body plans (functional part types, mouth form, size bin) seen for the first time since the last sample. */
  readonly newPlans: number
  /** Body plans ever seen. */
  readonly plansEver: number
  /** Body plans alive now. */
  readonly plansAlive: number
  /** Body plans that took hold (three samples in a row, at least 2 percent of the population once) for the first time at this sample. */
  readonly newlyPersistentPlans: number
  /** Body plans that have taken hold, ever. */
  readonly persistentPlans: number
  /** Effective number of body plans alive (inverse Simpson index). */
  readonly effectivePlans: number

  /** Mean pairwise body-plan distance, 0 to 1. */
  readonly bodySpread: number
  /** Mean and largest number of functional parts. */
  readonly partsMean: number
  readonly partsMax: number
  /** Distinct functional part types among the living. */
  readonly partTypes: number

  /** Mean distance of the living brains from the innate prior (`||w - p|| / ||p||`). */
  readonly priorDrift: number
  /** Mean pairwise brain distance, 0 to 1. */
  readonly brainSpread: number
  /** Mean size of what a life has learned, relative to the weights it was born with. */
  readonly learnedGap: number
  /** Mean absolute input weight per input group. */
  readonly inputUsage: Readonly<Record<BrainInputGroup, number>>

  /**
   * How differently the living brains **respond** to the same fixed situations (heritable: only genes
   * make two brains differ here): effective number of response patterns, and the mean pairwise
   * difference of their responses, 0 to 1.
   */
  readonly responseTypes: number
  readonly responseSpread: number
  /**
   * Realised behaviour (speed, turning, resting, where each went): effective types and mean pairwise
   * difference. Descriptive only: a world with no mutation shows nearly as much, because it mostly
   * reflects circumstance.
   */
  readonly behaviourTypes: number
  readonly behaviourSpread: number
  /** Where the energy taken in so far by the creatures alive now came from; shares add to 1 (all 0 with no intake). */
  readonly intakePlant: number
  readonly intakeFlesh: number
  readonly intakeCarrion: number

  /** Movement of the trait means since the last sample, as a share of their ranges (0 when nothing moved). */
  readonly rate: number
  /** Species alive, species ever created, created since the last sample, and the population share in species younger than 5,000 ticks. */
  readonly speciesAlive: number
  readonly speciesEver: number
  readonly newSpecies: number
  readonly youngSpeciesShare: number
  /** Founder lineages with a living descendant, and the mean and largest generation alive. */
  readonly foundersAlive: number
  readonly meanGeneration: number
  readonly maxGeneration: number

  /** True once ten samples in a row have shown nothing new taking hold and nothing moving. */
  readonly stasis: boolean
  /** Samples in a row that have been quiet. */
  readonly quietSamples: number
}

/** What the observatory has recorded. */
export interface EvolutionSeries {
  /** Ticks between samples. */
  readonly sampleEvery: number
  /** The first sample (tick 0): the founders' own noise floor for the brain indicators. */
  readonly baseline: EvolutionSample | null
  /** Oldest first; the oldest are dropped past `observatory.maxSamples`. */
  readonly samples: readonly EvolutionSample[]
}
