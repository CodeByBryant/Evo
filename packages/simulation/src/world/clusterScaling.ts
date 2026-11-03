import type { WorldConfig } from '@evo/contracts'
import { ClusterLayout } from '../ecology/ClusterLayout'

/**
 * The configuration a world actually runs with (docs/decisions/0014). The field layout is returned
 * unchanged. For the cluster layout the quantities tuned for the reference area
 * (`environment.width x height`) scale with the combined area of the clusters, so food density per
 * unit of habitable area is exactly the tuned density; the founder count is the species count
 * times their size; and the mating signal is capped below the width of the void so ready
 * organisms in different clusters never see each other across it.
 */
export function effectiveConfig(config: WorldConfig): WorldConfig {
  const { environment } = config
  if (environment.layout !== 'clusters') return config
  const clusters = environment.clusters
  const layout = new ClusterLayout(clusters)
  const scale = layout.totalArea / (environment.width * environment.height)
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
