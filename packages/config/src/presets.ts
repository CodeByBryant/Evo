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
    description:
      'The default world: patches of renewable plants over regions, seasons, hazards and several kinds of food.',
    overrides: {}
  },
  {
    name: 'lush',
    label: 'Lush',
    description: 'Plentiful food. Populations grow large and species have room to diverge.',
    overrides: {
      resources: {
        spawnRate: 0.4,
        maxCount: 640,
        plants: { maxPlants: 80, photosynthesis: 2 }
      }
    }
  },
  {
    name: 'harsh',
    label: 'Harsh',
    description: 'Scarcer food and twice the storms. Survival is hard and extinction is real.',
    overrides: {
      resources: { spawnRate: 0.22, plants: { maxPlants: 45 } },
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
    // The cluster founders build on one body; the parked cluster world keeps the founder plan.
    overrides: {
      environment: { layout: 'clusters', width: 500, height: 500 },
      // The cluster layout keeps its free food: its food scaling is tuned on this (ADR 0014).
      resources: {
        initialCount: 100,
        maxCount: 200,
        spawnRate: 2,
        distribution: { mode: 'uniform' },
        plants: { enabled: false }
      },
      anatomy: { startingBody: { mode: 'reference' } }
    }
  },
  {
    name: 'fixed-bodies',
    label: 'Fixed bodies',
    description:
      'Every creature keeps the founder body: no part, outline or colour ever changes, so only brains and the other genes evolve.',
    // Anatomy off reads every body as the founder plan, so an archetype would only be paint.
    overrides: { anatomy: { enabled: false, startingBody: { mode: 'reference' } } }
  },
  {
    name: 'classic',
    label: 'Classic',
    description:
      'One kind of food on an even field: no regions, seasons, hazards or health, and creatures eat by touching food.',
    overrides: {
      // The phase 3 world starts with the one founder body it always had.
      anatomy: { startingBody: { mode: 'reference' } },
      // ...on a 500 x 500 field of free food, an even spread, as it always was.
      environment: { width: 500, height: 500 },
      resources: {
        initialCount: 100,
        maxCount: 200,
        spawnRate: 2,
        distribution: { mode: 'uniform' },
        plants: { enabled: false }
      },
      // The phase 3 world: touch food and take it whole, with the phase 3 breeding and lifespans.
      // That way of eating wastes about a third of the food, so it cannot carry the restrained
      // breeding and shorter lives of the default world (3 of 8 worlds went extinct).
      feeding: { enabled: false },
      // ...and creatures see through each other, as they always did (ADR 0016 "Line of sight").
      perception: { organismsBlockSight: false },
      reproduction: { minEnergy: 60, cooldown: 30 },
      organisms: { maxAge: 600, senescenceAge: 510 },
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
