import type { EcologyConfigOverrides, WorldConfigOverrides } from '@evo/contracts'

const OFF = {
  health: { enabled: false },
  regions: { enabled: false },
  seasons: { enabled: false },
  hazards: { enabled: false },
  resourceKinds: { enabled: false },
  migration: { enabled: false }
} as const

/**
 * The Phase 5 world: every ecology feature off and the two reward terms that arrived with it
 * (`damage`, `exploration`) at zero. The ecology is on by default since Phase 6 (ADR 0009), so
 * tests that pin Phase 5 numbers or measure learning on their own wrap their config in this.
 * Anything the config sets explicitly wins, and a feature the config mentions without an
 * `enabled` flag stays off.
 */
export function withoutEcology(config: WorldConfigOverrides = {}): WorldConfigOverrides {
  const given: EcologyConfigOverrides = config.ecology ?? {}
  const ecology: EcologyConfigOverrides = {
    health: { ...OFF.health, ...given.health },
    regions: { ...OFF.regions, ...given.regions },
    seasons: { ...OFF.seasons, ...given.seasons },
    hazards: { ...OFF.hazards, ...given.hazards },
    resourceKinds: { ...OFF.resourceKinds, ...given.resourceKinds },
    migration: { ...OFF.migration, ...given.migration }
  }
  return {
    ...config,
    ecology,
    learning: {
      ...(config.learning ?? {}),
      rewardWeights: { damage: 0, exploration: 0, ...(config.learning?.rewardWeights ?? {}) }
    }
  }
}
