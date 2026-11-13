import type { GenePath, GeneRange, WorldConfig } from '@evo/contracts'
import { DEFAULT_ANATOMY } from './anatomy'

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
  environment: {
    // 700 x 700 (ADR 0021): the same food and creatures spread over twice the area, with biomes and
    // hazards scaled to it (`fieldScaling`). `classic` and `clusters` keep 500 x 500.
    width: 700,
    height: 700,
    layout: 'field',
    clusters: {
      count: 6,
      radius: 500,
      spacing: 2500,
      speciesPerCluster: 3,
      organismsPerSpecies: 24,
      patches: 12,
      voidSpeedScale: 0.7,
      voidVisibility: 0.5,
      mateSignalCap: 200,
      speciesThreshold: 0.12,
      clusterSpread: 0.08,
      speciesSpread: 0.03,
      foodFloor: 0.05,
      strandedFoodPerTick: 4
    }
  },
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
    maxAge: 300,
    maturityAge: 90,
    senescenceAge: 250,
    juvenileSizeScale: 0.5,
    juvenileSpeedScale: 0.7,
    juvenileMetabolicScale: 0.7
  },
  resources: {
    // Items, not plants: a plant is a hub and six nodes (about 35 plants at the start).
    initialCount: 245,
    maxCount: 480,
    // Plants a second (ADR 0021; free food a second when `plants.enabled` is false, as in `classic`).
    spawnRate: 0.3,
    energyValue: 30,
    radius: 3,
    region: null,
    // Patches that fade and drift, about the size of a biome (ADR 0021).
    distribution: { mode: 'noise', scale: 120, contrast: 1, floor: 0.05, turnover: 1200 },
    // Renewable plants, tuned over 8 and 16 seeds against the free-food world they replace.
    plants: {
      enabled: true,
      nodes: 6,
      ring: 3,
      hubEnergyScale: 3,
      nodeEnergyScale: 0.6,
      hubHardness: 2,
      regrowRate: 2,
      photosynthesis: 1.5,
      lifespan: 300,
      maxPlants: 60
    }
  },
  reproduction: {
    minEnergy: 75,
    offspringInvestment: 12.5,
    overheadFraction: 0.6,
    cooldown: 45,
    searchRadius: 50,
    mateSenseRadius: 250
  },
  history: { maxEvents: 10_000, eventDetail: 'essential', maxHistoricalOrganisms: 10_000 },
  // The evolution observatory (ADR 0024): derived indicators, sampled every 50 simulated seconds.
  observatory: { enabled: true, sampleEvery: 500, behaviourEvery: 10, maxSamples: 1000 },
  genetics: {
    mutationRateScale: 1,
    mutationStrengthScale: 1,
    blendAlpha: 0.25,
    linkedMouths: false,
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
    // What makes a species: mostly the body plan, then the brain and the life-history genes; colour
    // counts for nothing (cosmetic genes are in no group). Measured over 3 seeds x 30,000 ticks
    // (`tests/probe/species.probe.ts`): 3 to 12 living species among about 50 creatures and about
    // 3% of births founding one. Until then (threshold 0.06, physical 0.2 with the hue in it,
    // metabolic 0.2, behavioral 0.1, reproduction 0.05, learning 0.05, brain 0.3, body 0) it was 29
    // to 37 species among 50 and one birth in five: any two brains differ by about 0.2, which alone
    // was at the old threshold. One part gained, lost or changed is 0.033 here, so about three such
    // differences, or fewer with drift in the rest, make a new species.
    // Moved to 0.12 once every part type became reachable (ADR 0016): with that much real body
    // variety, 0.1 gave 10 to 22 living species and 8% of births founding one; 0.12 gives 6 to 16 and
    // 2 to 5% (4 seeds x 30,000 ticks, about 60 creatures), and it is the cluster layout's own
    // threshold, so field and cluster worlds agree.
    threshold: 0.12,
    distanceWeights: {
      physical: 0.1,
      metabolic: 0.05,
      behavioral: 0.05,
      reproduction: 0.1,
      learning: 0.05,
      brain: 0.15,
      body: 0.5
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
          hardness: 1,
          regions: ['meadow', 'forest', 'wetland', 'desert']
        },
        {
          name: 'fruit',
          energyScale: 1.85,
          radiusScale: 1,
          spawnWeight: 1.5,
          detectability: 1,
          toxicity: 0,
          hardness: 1,
          regions: ['forest', 'wetland']
        },
        {
          name: 'fungus',
          energyScale: 2,
          radiusScale: 1,
          spawnWeight: 1.5,
          detectability: 0.85,
          toxicity: 6,
          hardness: 1.5,
          regions: ['cave', 'wetland', 'forest', 'volcanic']
        },
        {
          name: 'nectar',
          energyScale: 1.425,
          radiusScale: 1,
          spawnWeight: 1.5,
          detectability: 1,
          toxicity: 0,
          hardness: 0.6,
          regions: ['meadow', 'wetland', 'desert']
        }
      ]
    },
    migration: {
      enabled: true,
      dwellTime: 20
    },
    // Static obstacles, by biome (ADR 0022): sites per 10,000 square units of each region type,
    // set by the obstacle probe (docs/decisions/0022).
    obstacles: {
      enabled: true,
      maxCoverage: 0.04,
      clearance: 20,
      kinds: {
        boulder: {
          recipe: 'single',
          blocksMovement: true,
          blocksSight: true,
          radiusMin: 6,
          radiusMax: 14,
          membersMin: 1,
          membersMax: 1,
          density: {
            meadow: 0.125,
            forest: 0.2,
            wetland: 0.05,
            desert: 0.25,
            cave: 0.625,
            volcanic: 0.375
          }
        },
        tree: {
          recipe: 'single',
          blocksMovement: true,
          blocksSight: true,
          radiusMin: 6,
          radiusMax: 9,
          membersMin: 1,
          membersMax: 1,
          density: { meadow: 0.075, forest: 0.75, wetland: 0, desert: 0, cave: 0, volcanic: 0 }
        },
        ridge: {
          recipe: 'chain',
          blocksMovement: true,
          blocksSight: true,
          radiusMin: 6,
          radiusMax: 8,
          membersMin: 4,
          membersMax: 8,
          density: { meadow: 0, forest: 0, wetland: 0, desert: 0.1, cave: 0.2, volcanic: 0.3 }
        },
        pond: {
          recipe: 'single',
          blocksMovement: true,
          blocksSight: false,
          radiusMin: 14,
          radiusMax: 26,
          membersMin: 1,
          membersMax: 1,
          density: { meadow: 0.025, forest: 0, wetland: 0.15, desert: 0, cave: 0, volcanic: 0 }
        },
        reeds: {
          recipe: 'cluster',
          blocksMovement: false,
          blocksSight: true,
          radiusMin: 6,
          radiusMax: 7,
          membersMin: 3,
          membersMax: 5,
          density: { meadow: 0, forest: 0.05, wetland: 0.5, desert: 0, cave: 0, volcanic: 0 }
        }
      }
    }
  },
  anatomy: DEFAULT_ANATOMY,
  // Provisional, set by measurement in the starvation tuning (docs/decisions/0017). A grass item
  // (30 energy) takes three bites, a founder gut holds about one item and empties in 7 seconds.
  feeding: {
    enabled: true,
    biteRadius: 0.6,
    biteCone: 1,
    biteSize: 12,
    biteInterval: 0.4,
    gutCapacity: 40,
    absorption: 6,
    chewSlow: 0.15
  },
  // Predation (ADR 0023): on, with a small hunter group among the founders (`anatomy.startingBody.groups`)
  // and the jaw as good as the mandible on plants, tuned over 48 seeds. Only a jaw bites
  // creatures; every other mouth form yields nothing from them. A bite takes `biteEnergy` from the
  // victim and puts `trophicYield` of it in the predator's gut; a dead body leaves a carcass.
  predation: {
    enabled: true,
    biteDamage: 12,
    biteEnergy: 12,
    trophicYield: 0.6,
    maxPreyRatio: 1.5,
    fleshYield: { sprout: 0, proboscis: 0, mandible: 0, radula: 0, jaw: 1 },
    attackWindow: 3,
    carcass: {
      enabled: true,
      energyFraction: 0.6,
      minEnergy: 5,
      lifespan: 120,
      maxCount: 40,
      radius: 4,
      hardness: 1,
      yields: { sprout: 0.1, proboscis: 0.2, mandible: 0.8, radula: 0.6, jaw: 1.2 }
    }
  },
  // Another creature's body hides what is behind it (ADR 0016 "Line of sight"); a creature checks
  // at most six candidates for something in the way, so a crowded patch costs a bounded amount.
  perception: {
    organismsBlockSight: true,
    maxSightChecks: 6
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
 * `maturityAge`, `senescenceAge` and `maxAge` are kept ordered (`maturityAge < senescenceAge <
 * maxAge`) by the operators, which raise a gene's lower bound above the earlier gene's value, and
 * the upper edges strictly increase. The lifespan, `minEnergy` and `cooldown` ranges are wide
 * enough that the founder baselines (300 s, 75, 45 s) sit well inside them: a baseline at the edge
 * of its range is pulled back by mutation clamping (measured: a 300 s lifespan against a 570 s
 * floor drifted up within one run). Like the world defaults these are provisional and tuned by
 * measurement (docs/decisions/0018-population-tuning.md).
 */
export const DEFAULT_GENE_RANGES: Readonly<Record<GenePath, Readonly<GeneRange>>> = deepFreeze({
  'physical.radius': range(2.5, 10),
  'physical.maturityAge': range(45, 180),
  'physical.senescenceAge': range(150, 560),
  'physical.maxAge': range(270, 1200),
  'physical.hue': range(0, 1),
  'metabolic.basalCost': range(0.3, 0.8),
  'behavioral.wanderJitter': range(0.75, 3),
  'reproduction.minEnergy': range(40, 98),
  'reproduction.offspringInvestment': range(6, 25),
  'reproduction.cooldown': range(15, 120),
  'reproduction.searchRadius': range(25, 100),
  'learning.learningRate': range(0.001, 0.5, 0.1),
  'learning.discountFactor': range(0, 1),
  'learning.eligibilityTraceDecay': range(0, 1),
  'learning.explorationRate': range(0, 1),
  'learning.riskTolerance': range(0, 1),
  'learning.noveltyPreference': range(0, 1),
  'learning.persistence': range(0, 1)
})
