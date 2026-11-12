import type { MouthForm, ResourceKindConfig, WorldConfig } from '@evo/contracts'
import { MOUTH_FORMS } from '@evo/contracts'

/** The name of the resource kind a carcass is (ADR 0023). */
export const CARRION_KIND = 'carrion'

/**
 * The configuration a world with predation runs with (ADR 0023): a `carrion` food kind appended to
 * the resource kinds (it never spawns by itself: spawn weight zero) and a `carrion` yield added to
 * every mouth form, so a carcass is an ordinary bitable food item that a mandible or a jaw eats well
 * and a sprout hardly eats. With predation off, carcasses off or food kinds off, the same object
 * comes back, so those worlds are exactly what they were.
 */
export function withCarrion(config: WorldConfig): WorldConfig {
  const { predation } = config
  const kinds = config.ecology.resourceKinds
  if (!predation.enabled || !predation.carcass.enabled || !kinds.enabled) return config
  const carrion: ResourceKindConfig = {
    name: CARRION_KIND,
    energyScale: 1,
    radiusScale: predation.carcass.radius / config.resources.radius,
    spawnWeight: 0,
    detectability: 1,
    toxicity: 0,
    hardness: predation.carcass.hardness,
    regions: []
  }
  const mouthForms = { ...config.anatomy.mouthForms } as Record<MouthForm, Record<string, number>>
  for (const form of MOUTH_FORMS) {
    mouthForms[form] = {
      ...config.anatomy.mouthForms[form],
      [CARRION_KIND]: predation.carcass.yields[form]
    }
  }
  return {
    ...config,
    ecology: {
      ...config.ecology,
      resourceKinds: { ...kinds, kinds: [...kinds.kinds, carrion] }
    },
    anatomy: { ...config.anatomy, mouthForms }
  }
}
