import type { WorldConfigOverrides } from '@evo/contracts'

/** A named starting point for a world: a set of overrides on the defaults. */
export interface WorldPreset {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly overrides: WorldConfigOverrides
}

/**
 * The presets a user can pick in the application. They are plain overrides, validated like any
 * other configuration (`resolveWorldConfig`); a test resolves every one and runs it.
 *
 * `balanced` is the default world and the one the engine is tuned and gated on. The others change
 * one thing each, so what they do is easy to see in the interface.
 */
export const PRESETS: readonly WorldPreset[] = [
  {
    name: 'balanced',
    label: 'Balanced',
    description: 'The default world: regions, seasons, hazards and several kinds of food.',
    overrides: {}
  },
  {
    name: 'lush',
    label: 'Lush',
    description: 'Plentiful food. Populations grow large and species have room to diverge.',
    overrides: { resources: { spawnRate: 2.6, maxCount: 320 } }
  },
  {
    name: 'harsh',
    label: 'Harsh',
    description: 'Scarcer food and twice the storms. Survival is hard and extinction is real.',
    overrides: {
      resources: { spawnRate: 1.5 },
      ecology: { hazards: { stormRate: 0.004, areaCount: 3 } }
    }
  },
  {
    name: 'rapid-evolution',
    label: 'Rapid evolution',
    description: 'Mutation three times as frequent and half again as strong: fast change.',
    overrides: { genetics: { mutationRateScale: 3, mutationStrengthScale: 1.5 } }
  },
  {
    name: 'clusters',
    label: 'Clusters',
    description:
      'The prototype world: six circular clusters with several biomes each, empty void between them, three species per cluster.',
    overrides: { environment: { layout: 'clusters' } }
  },
  {
    name: 'fixed-bodies',
    label: 'Fixed bodies',
    description:
      'Every creature keeps the founder body: no part, outline or colour ever changes, so only brains and the other genes evolve.',
    overrides: { anatomy: { enabled: false } }
  },
  {
    name: 'classic',
    label: 'Classic',
    description:
      'One kind of food on an even field: no regions, seasons, hazards or health, and creatures eat by touching food.',
    overrides: {
      resources: { spawnRate: 2 },
      // The phase 3 way of eating: touch food and take it whole.
      feeding: { enabled: false },
      ecology: {
        health: { enabled: false },
        regions: { enabled: false },
        seasons: { enabled: false },
        hazards: { enabled: false },
        resourceKinds: { enabled: false },
        migration: { enabled: false }
      }
    }
  }
]

export const DEFAULT_PRESET = 'balanced'

/** The preset with this name, or `undefined`. */
export function presetByName(name: string): WorldPreset | undefined {
  return PRESETS.find((preset) => preset.name === name)
}
