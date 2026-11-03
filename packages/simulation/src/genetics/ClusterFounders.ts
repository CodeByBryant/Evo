import {
  OUTLINE_COUNT_INDEX,
  OUTLINE_MAX_POINTS,
  outlineAngleIndex,
  outlineRadiusIndex,
  visualGeneIndex
} from '@evo/contracts'
import type { ClusterConfig } from '@evo/contracts'
import type { RandomSource } from '../random/RandomSource'
import type { GeneSpec } from './GeneSpecs'

/** One founder species of the cluster layout: where it starts and the genes its founders share. */
export interface FounderPlan {
  readonly cluster: number
  /** The founder group the registry keeps together: `cluster * speciesPerCluster + species`. */
  readonly group: number
  /** Index of the species inside its cluster. */
  readonly species: number
  /** The scalar gene values (spec order). */
  readonly vector: number[]
  /** The body gene values. */
  readonly body: number[]
}

/**
 * The scalar genes whose founder values differ between clusters and species (docs/decisions/0014):
 * the ones that change what a creature looks like and how it moves, senses and spends energy.
 * Life stages and reproduction stay at the baseline so every founder is a viable animal.
 */
const IDENTITY_GENES: ReadonlySet<string> = new Set([
  'physical.radius',
  'physical.maxSpeed',
  'physical.maxTurnRate',
  'sensory.sensorRadius',
  'metabolic.basalCost',
  'metabolic.movementCost',
  'metabolic.turningCost',
  'behavioral.wanderJitter',
  'learning.learningRate',
  'learning.discountFactor',
  'learning.eligibilityTraceDecay',
  'learning.explorationRate',
  'learning.riskTolerance',
  'learning.noveltyPreference',
  'learning.persistence'
])

/** Distance between species of one cluster on the colour wheel, in turns. */
const SPECIES_HUE_STEP = 0.04

const unit = (value: number): number => value - Math.floor(value)

function fit(spec: GeneSpec, value: number): number {
  if (spec.kind === 'circular') {
    const width = spec.max - spec.min
    return spec.min + (width === 0 ? 0 : (((value - spec.min) % width) + width) % width)
  }
  const clamped = Math.min(spec.max, Math.max(spec.min, value))
  return spec.kind === 'int' || spec.kind === 'bool' ? Math.round(clamped) : clamped
}

/**
 * Plans the founders of the cluster layout, cluster by cluster and species by species, drawing
 * only from `random` (the `genetics` stream). Each cluster draws an **archetype**: every identity
 * gene moves by `clusterSpread` of its range in a random direction; each species then moves a
 * smaller `speciesSpread` around the archetype. The same offsets apply to the body outline, so
 * clusters differ in the shape of their creatures. The hue gene is set, not drawn: a cluster is a
 * colour family and its species are neighbouring shades.
 */
export function planClusterFounders(
  specs: readonly GeneSpec[],
  founderBody: readonly number[],
  bodySpecs: readonly GeneSpec[],
  clusters: Pick<ClusterConfig, 'count' | 'speciesPerCluster' | 'clusterSpread' | 'speciesSpread'>,
  random: RandomSource
): FounderPlan[] {
  const outlineIndices: number[] = [OUTLINE_COUNT_INDEX]
  for (let i = 0; i < OUTLINE_MAX_POINTS; i++) {
    outlineIndices.push(outlineRadiusIndex(i), outlineAngleIndex(i))
  }
  const plans: FounderPlan[] = []
  const hueIndex = specs.findIndex((spec) => spec.path === 'physical.hue')
  const pattern = visualGeneIndex('pattern')
  const accent = visualGeneIndex('accentHue')

  for (let cluster = 0; cluster < clusters.count; cluster++) {
    // The archetype: a fixed distance in a random direction on each identity gene.
    const archetype = specs.map((spec) => {
      if (!IDENTITY_GENES.has(spec.path)) return 0
      const direction = random.float() < 0.5 ? -1 : 1
      return (
        direction * clusters.clusterSpread * (0.5 + 0.5 * random.float()) * (spec.max - spec.min)
      )
    })
    const bodyArchetype = outlineIndices.map((index) => {
      const spec = bodySpecs[index] as GeneSpec
      const direction = random.float() < 0.5 ? -1 : 1
      return (
        direction * clusters.clusterSpread * (0.5 + 0.5 * random.float()) * (spec.max - spec.min)
      )
    })

    for (let species = 0; species < clusters.speciesPerCluster; species++) {
      const vector = specs.map((spec, i) => {
        if (!IDENTITY_GENES.has(spec.path)) return spec.baseline
        const wiggle = (random.float() * 2 - 1) * clusters.speciesSpread * (spec.max - spec.min)
        return fit(spec, spec.baseline + (archetype[i] as number) + wiggle)
      })
      const hue = unit(
        cluster / clusters.count +
          (species - (clusters.speciesPerCluster - 1) / 2) * SPECIES_HUE_STEP
      )
      if (hueIndex >= 0) vector[hueIndex] = fit(specs[hueIndex] as GeneSpec, hue)

      const body = [...founderBody]
      outlineIndices.forEach((index, k) => {
        const spec = bodySpecs[index] as GeneSpec
        const wiggle = (random.float() * 2 - 1) * clusters.speciesSpread * (spec.max - spec.min)
        body[index] = fit(
          spec,
          (founderBody[index] as number) + (bodyArchetype[k] as number) + wiggle
        )
      })
      body[pattern] = fit(bodySpecs[pattern] as GeneSpec, (cluster + species) % 4)
      body[accent] = fit(bodySpecs[accent] as GeneSpec, unit(hue + 0.5))
      plans.push({
        cluster,
        group: cluster * clusters.speciesPerCluster + species,
        species,
        vector,
        body
      })
    }
  }
  return plans
}
