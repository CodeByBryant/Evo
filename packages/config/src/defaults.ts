import type { GenePath, GeneRange, WorldConfig } from '@evo/contracts'

/** Recursively freezes plain objects so shared defaults cannot be mutated by accident. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

/**
 * Default world configuration (time in seconds, energy in arbitrary units).
 *
 * These values are provisional: they describe a small, viable foraging world and are tuned by the
 * engine's scenario tests. Determinism tests pin their configuration explicitly, so changing a
 * default never alters a golden hash.
 */
export const DEFAULT_WORLD_CONFIG: Readonly<WorldConfig> = deepFreeze({
  timestep: 0.1,
  maxPopulation: 1000,
  extinctionPolicy: 'stop',
  environment: { width: 500, height: 500 },
  organisms: {
    initialCount: 20,
    initialEnergy: 50,
    maxEnergy: 100,
    radius: 5,
    maxSpeed: 20,
    maxTurnRate: 3,
    sensorRadius: 60,
    wanderJitter: 1.5,
    basalCost: 0.5,
    movementCost: 0.005,
    turningCost: 0.05,
    sensorCost: 0.1,
    learningCost: 0.02,
    hue: 0.55,
    maxAge: 600,
    maturityAge: 90,
    senescenceAge: 510,
    juvenileSizeScale: 0.5,
    juvenileSpeedScale: 0.7,
    juvenileMetabolicScale: 0.7
  },
  resources: {
    initialCount: 100,
    maxCount: 200,
    spawnRate: 2,
    energyValue: 30,
    radius: 3,
    region: null
  },
  reproduction: {
    minEnergy: 60,
    offspringInvestment: 12.5,
    overheadFraction: 0.6,
    cooldown: 30,
    searchRadius: 50
  },
  history: { maxEvents: 10_000, eventDetail: 'essential', maxHistoricalOrganisms: 10_000 },
  genetics: {
    mutationRateScale: 1,
    mutationStrengthScale: 1,
    blendAlpha: 0.25,
    brain: {
      hiddenSize: 8,
      memorySize: 4,
      innatePrior: true,
      initialWeightStd: 0.3,
      weightMutationRate: 0.05,
      weightMutationStd: 0.1
    },
    learning: {
      learningRate: 0.05,
      discountFactor: 0.95,
      eligibilityTraceDecay: 0.9,
      explorationRate: 0.1,
      riskTolerance: 0.5,
      noveltyPreference: 0.5,
      persistence: 0.5
    },
    learningInheritance: { mode: 'partial', fraction: 0.15 },
    genes: {}
  },
  learning: {
    controller: 'brain',
    enabled: true,
    algorithm: 'actorCritic',
    rewardWeights: { feeding: 1, reproduction: 0.5, energyCost: 5 },
    weightLimit: 4,
    baselineRate: 0.01,
    valueRateScale: 1,
    foodHorizon: 30
  }
} satisfies WorldConfig)

const range = (min: number, max: number, mutationStd = 0.05): GeneRange => ({
  min,
  max,
  mutationRate: 0.1,
  mutationStd
})

/**
 * Default bounds and mutation parameters for every gene (docs/genetics/genome.md). The ranges of
 * `maturityAge`, `senescenceAge` and `maxAge` are disjoint and ordered so that
 * `maturityAge < senescenceAge < maxAge` holds for every genome by construction. Like the world
 * defaults these are provisional and tuned by the engine's scenario tests.
 */
export const DEFAULT_GENE_RANGES: Readonly<Record<GenePath, Readonly<GeneRange>>> = deepFreeze({
  'physical.radius': range(2.5, 10),
  'physical.maxSpeed': range(10, 40),
  'physical.maxTurnRate': range(1.5, 6),
  'physical.maturityAge': range(45, 180),
  'physical.senescenceAge': range(255, 560),
  'physical.maxAge': range(570, 1200),
  'physical.hue': range(0, 1),
  'sensory.sensorRadius': range(30, 120),
  'metabolic.basalCost': range(0.3, 0.8),
  'metabolic.movementCost': range(0.003, 0.008),
  'metabolic.turningCost': range(0.03, 0.08),
  'behavioral.wanderJitter': range(0.75, 3),
  'reproduction.minEnergy': range(40, 90),
  'reproduction.offspringInvestment': range(6, 25),
  'reproduction.cooldown': range(15, 60),
  'reproduction.searchRadius': range(25, 100),
  'learning.learningRate': range(0.001, 0.5, 0.1),
  'learning.discountFactor': range(0, 1),
  'learning.eligibilityTraceDecay': range(0, 1),
  'learning.explorationRate': range(0, 1),
  'learning.riskTolerance': range(0, 1),
  'learning.noveltyPreference': range(0, 1),
  'learning.persistence': range(0, 1)
})
