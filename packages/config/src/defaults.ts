import type { WorldConfig } from '@evo/contracts'

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
    maxAge: 600
  },
  resources: {
    initialCount: 100,
    maxCount: 200,
    spawnRate: 2,
    energyValue: 30,
    radius: 3
  },
  history: { maxEvents: 10_000, eventDetail: 'essential' }
} satisfies WorldConfig)
