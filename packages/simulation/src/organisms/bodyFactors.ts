import type {
  AnatomyConfig,
  Capabilities,
  CapabilityFactors,
  Genome,
  WorldConfig
} from '@evo/contracts'
import { capabilitiesOf, capabilityFactors } from '../development/capabilities'
import { developAnatomy } from '../development/develop'
import { outlineScaleOf } from '../development/outline'
import { founderBodyVector } from '../genetics/BodyGenes'

/**
 * What a body can do relative to the founder body, for the systems to multiply into the
 * quantities they already use (docs/decisions/0015). Every factor is exactly 1 for the founder
 * body, and with `anatomy.enabled: false` every genome carries it, so reading these changes
 * nothing until a body differs.
 *
 * A body is developed once per immutable gene array and remembered, so reading a factor in a
 * system costs a lookup, not a development.
 */

/** The number of food kinds the capabilities are computed for (1 when kinds are off). */
export function kindCountOf(config: WorldConfig): number {
  const kinds = config.ecology.resourceKinds
  return kinds.enabled ? Math.max(1, kinds.kinds.length) : 1
}

interface FounderEntry {
  readonly kindCount: number
  readonly capabilities: Capabilities
}

const founders = new WeakMap<AnatomyConfig, FounderEntry>()

/** The founder body's capabilities (the thing every factor is measured against). */
export function founderCapabilitiesOf(config: WorldConfig): Capabilities {
  const kindCount = kindCountOf(config)
  const known = founders.get(config.anatomy)
  if (known !== undefined && known.kindCount === kindCount) return known.capabilities
  const capabilities = capabilitiesOf(
    developAnatomy(founderBodyVector(config.anatomy), config.anatomy),
    config.anatomy,
    1,
    kindCount
  )
  founders.set(config.anatomy, { kindCount, capabilities })
  return capabilities
}

interface Entry {
  readonly config: AnatomyConfig
  readonly kindCount: number
  readonly factors: CapabilityFactors
}

const bodies = new WeakMap<readonly number[], Entry>()

/**
 * The body's size factor: the outline's area relative to the founder outline's (its square-root
 * ratio squared). It is the mass the thrust has to move, so a bigger body is slower; exactly 1
 * for the founder outline.
 */
export function massScaleOf(genes: readonly number[], config: AnatomyConfig): number {
  const scale = outlineScaleOf(genes, config)
  return scale * scale
}

/** The capability factors of a genome's body, remembered per body-gene array. */
export function factorsOf(genome: Genome, config: WorldConfig): CapabilityFactors {
  const genes = genome.body.genes
  const kindCount = kindCountOf(config)
  const known = bodies.get(genes)
  if (known !== undefined && known.config === config.anatomy && known.kindCount === kindCount) {
    return known.factors
  }
  const capabilities = capabilitiesOf(
    developAnatomy(genes, config.anatomy),
    config.anatomy,
    massScaleOf(genes, config.anatomy),
    kindCount
  )
  const factors = capabilityFactors(capabilities, founderCapabilitiesOf(config))
  bodies.set(genes, { config: config.anatomy, kindCount, factors })
  return factors
}
