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
    rewardWeights: { feeding: 1, reproduction: 0.5, energyCost: 5, damage: 4, exploration: 0.05 },
    weightLimit: 4,
    baselineRate: 0.01,
    valueRateScale: 1,
    foodHorizon: 30
  },
  species: {
    enabled: true,
    threshold: 0.06,
    distanceWeights: {
      physical: 0.2,
      sensory: 0.2,
      metabolic: 0.2,
      behavioral: 0.1,
      reproduction: 0.05,
      learning: 0.05,
      brain: 0.3
    },
    sampleInterval: 500,
    maxHistorySamples: 1000,
    reproductiveIsolation: false
  },
  ecology: {
    health: {
      enabled: true,
      maxHealth: 100,
      regenRate: 2,
      regenEnergyCost: 0.5,
      regenMinEnergyFraction: 0.5
    },
    regions: {
      enabled: true,
      seedCount: 30,
      gridSize: 25,
      temperatureTolerance: 0.2,
      temperatureCost: 0.4,
      types: {
        meadow: {
          movementScale: 1,
          visibility: 1,
          temperature: 0,
          hazardExposure: 0,
          reproductionScale: 1
        },
        forest: {
          movementScale: 0.9,
          visibility: 0.9,
          temperature: -0.1,
          hazardExposure: 0,
          reproductionScale: 1.1
        },
        wetland: {
          movementScale: 0.85,
          visibility: 0.95,
          temperature: 0.1,
          hazardExposure: 0,
          reproductionScale: 1.2
        },
        desert: {
          movementScale: 0.95,
          visibility: 1,
          temperature: 0.5,
          hazardExposure: 0.2,
          reproductionScale: 0.8
        },
        cave: {
          movementScale: 0.9,
          visibility: 0.8,
          temperature: -0.3,
          hazardExposure: 0.1,
          reproductionScale: 0.9
        },
        volcanic: {
          movementScale: 0.9,
          visibility: 0.9,
          temperature: 0.6,
          hazardExposure: 1,
          reproductionScale: 0.6
        }
      }
    },
    seasons: {
      enabled: true,
      seasonLength: 200,
      seasons: {
        spring: {
          regeneration: 1.05,
          movementScale: 1,
          hazardIntensity: 0.9,
          reproductionScale: 1.1,
          temperature: 0,
          visibility: 1
        },
        summer: {
          regeneration: 1,
          movementScale: 1,
          hazardIntensity: 1,
          reproductionScale: 1,
          temperature: 0.1,
          visibility: 1
        },
        autumn: {
          regeneration: 1.05,
          movementScale: 1,
          hazardIntensity: 1,
          reproductionScale: 0.95,
          temperature: -0.05,
          visibility: 1
        },
        winter: {
          regeneration: 0.95,
          movementScale: 0.97,
          hazardIntensity: 1.1,
          reproductionScale: 0.9,
          temperature: -0.15,
          visibility: 0.97
        }
      }
    },
    hazards: {
      enabled: true,
      areaCount: 2,
      areaRadius: 25,
      areaDamage: 12,
      stormRate: 0.002,
      stormRadius: 35,
      stormDuration: 30,
      stormDamage: 6
    },
    resourceKinds: {
      enabled: true,
      kinds: [
        {
          name: 'grass',
          energyScale: 1,
          radiusScale: 1,
          spawnWeight: 5,
          detectability: 1,
          toxicity: 0,
          regions: ['meadow', 'forest', 'wetland', 'desert']
        },
        {
          name: 'fruit',
          energyScale: 1.85,
          radiusScale: 1,
          spawnWeight: 1.5,
          detectability: 1,
          toxicity: 0,
          regions: ['forest', 'wetland']
        },
        {
          name: 'fungus',
          energyScale: 2,
          radiusScale: 1,
          spawnWeight: 1.5,
          detectability: 0.85,
          toxicity: 6,
          regions: ['cave', 'wetland', 'forest', 'volcanic']
        },
        {
          name: 'nectar',
          energyScale: 1.425,
          radiusScale: 1,
          spawnWeight: 1.5,
          detectability: 1,
          toxicity: 0,
          regions: ['meadow', 'wetland', 'desert']
        }
      ]
    },
    migration: {
      enabled: true,
      dwellTime: 20
    }
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
