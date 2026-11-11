import type { WorldConfig } from '@evo/contracts'
import { ClusterLayout } from '../ecology/ClusterLayout'
import { REFERENCE_FIELD_SIZE, fieldScaling } from './fieldScaling'

/**
 * The configuration a world actually runs with (docs/decisions/0014). The field layout is scaled by
 * its area only when it is not the reference size (`fieldScaling`, ADR 0021). For the cluster layout the quantities tuned for the reference area
 * (`REFERENCE_FIELD_SIZE` squared) scale with the combined area of the clusters, so food density per
 * unit of habitable area is exactly the tuned density; the founder count is the species count
 * times their size; and the mating signal is capped below the width of the void so ready
 * organisms in different clusters never see each other across it.
 */
export function effectiveConfig(config: WorldConfig): WorldConfig {
  const { environment } = config
  if (environment.layout !== 'clusters') return fieldScaling(config)
  const clusters = environment.clusters
  const layout = new ClusterLayout(clusters)
  // The food numbers were tuned for the reference field, whatever size the default field has now
  // (ADR 0021): the cluster layout is unbounded and `environment.width x height` plays no part in it.
  const scale = layout.totalArea / (REFERENCE_FIELD_SIZE * REFERENCE_FIELD_SIZE)
  return {
    ...config,
    maxPopulation: Math.max(1, Math.round(config.maxPopulation * scale)),
    organisms: {
      ...config.organisms,
      initialCount: clusters.count * clusters.speciesPerCluster * clusters.organismsPerSpecies
    },
    resources: {
      ...config.resources,
      initialCount: Math.round(config.resources.initialCount * scale),
      maxCount: Math.max(1, Math.round(config.resources.maxCount * scale)),
      spawnRate: config.resources.spawnRate * scale
    },
    species: {
      ...config.species,
      threshold: Math.max(config.species.threshold, clusters.speciesThreshold)
    },
    reproduction: {
      ...config.reproduction,
      mateSenseRadius: Math.min(config.reproduction.mateSenseRadius, clusters.mateSignalCap)
    }
  }
}
