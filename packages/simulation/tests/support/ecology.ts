import type { EcologyConfigOverrides, WorldConfigOverrides } from '@evo/contracts'
import { FREE_FOOD } from './food'

/**
 * Mouth yields for food kinds a test makes up (ADR 0026: every form has to say what it yields for every
 * kind a world grows): every form takes them whole (1), except the jaw, which eats no plant.
 */
export function eats(names: readonly string[]): NonNullable<WorldConfigOverrides['anatomy']> {
  const forms = ['sprout', 'proboscis', 'mandible', 'radula', 'jaw'] as const
  return {
    mouthForms: Object.fromEntries(
      forms.map((form) => [form, Object.fromEntries(names.map((n) => [n, form === 'jaw' ? 0 : 1]))])
    ) as never
  }
}

const OFF = {
  health: { enabled: false },
  regions: { enabled: false },
  seasons: { enabled: false },
  hazards: { enabled: false },
  resourceKinds: { enabled: false },
  migration: { enabled: false },
  // The Phase 5 field was open (ADR 0022).
  obstacles: { enabled: false }
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
    migration: { ...OFF.migration, ...given.migration },
    obstacles: { ...OFF.obstacles, ...given.obstacles }
  }
  // Kinds a test makes up have to be edible by the forms it uses; the defaults already list their own.
  const custom = (given.resourceKinds?.kinds ?? [])
    .map((k) => k.name)
    .filter((n) => !['grass', 'fruit', 'fungus', 'nectar'].includes(n))
  const anatomy =
    custom.length === 0
      ? config.anatomy
      : {
          ...(config.anatomy ?? {}),
          mouthForms: { ...eats(custom).mouthForms, ...(config.anatomy?.mouthForms ?? {}) }
        }
  return {
    ...config,
    ...(anatomy === undefined ? {} : { anatomy }),
    // The Phase 5 food: free food at two a second on a 500 x 500 field (the spawn rate was lowered
    // when mate seeking arrived, ADR 0010; patches, plants and the bigger field came in ADR 0021).
    environment: { ...FREE_FOOD.environment, ...(config.environment ?? {}) },
    resources: {
      ...FREE_FOOD.resources,
      ...(config.resources ?? {}),
      distribution: {
        ...FREE_FOOD.resources?.distribution,
        ...(config.resources?.distribution ?? {})
      },
      plants: { ...FREE_FOOD.resources?.plants, ...(config.resources?.plants ?? {}) }
    },
    ecology,
    // Nothing eats anything but food in the Phase 5 world (ADR 0023); a config that mentions
    // `predation` decides for itself.
    predation: { enabled: false, ...(config.predation ?? {}) },
    learning: {
      ...(config.learning ?? {}),
      rewardWeights: { damage: 0, exploration: 0, ...(config.learning?.rewardWeights ?? {}) }
    }
  }
}
