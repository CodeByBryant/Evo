import type { MouthForm, ResourceKindConfig, WorldConfig } from '@evo/contracts'
import { MOUTH_FORMS } from '@evo/contracts'

/** The name of the resource kind a seed is (ADR 0032). */
export const SEED_KIND = 'seed'

/**
 * The configuration a world with seeds runs with (ADR 0032), as `withCarrion` is for carcasses: a
 * `seed` food kind appended **after** every other kind (carrion keeps its index, so a world without
 * seeds, and the colours and probes that count from the end, are exactly what they were) that never
 * spawns by itself (spawn weight zero), and a seed yield added to every mouth form. With seeds off, or
 * without plants or food kinds for them to come from, the same object comes back, so those worlds are
 * exactly what they were.
 */
export function withSeeds(config: WorldConfig): WorldConfig {
  const { seeds, plants } = config.resources
  const kinds = config.ecology.resourceKinds
  if (!seeds.enabled || !plants.enabled || !kinds.enabled) return config
  const seed: ResourceKindConfig = {
    name: SEED_KIND,
    // A seed's energy is `seeds.energy`, whatever the world's base food energy is.
    energyScale: seeds.energy / config.resources.energyValue,
    radiusScale: seeds.radius / config.resources.radius,
    spawnWeight: 0,
    detectability: 1,
    toxicity: 0,
    hardness: seeds.hardness,
    regions: []
  }
  const mouthForms = { ...config.anatomy.mouthForms } as Record<MouthForm, Record<string, number>>
  for (const form of MOUTH_FORMS) {
    mouthForms[form] = { ...config.anatomy.mouthForms[form], [SEED_KIND]: seeds.yields[form] }
  }
  return {
    ...config,
    ecology: {
      ...config.ecology,
      resourceKinds: { ...kinds, kinds: [...kinds.kinds, seed] }
    },
    anatomy: { ...config.anatomy, mouthForms }
  }
}
