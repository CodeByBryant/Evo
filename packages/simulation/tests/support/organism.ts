import { GENE_DEFINITIONS } from '@evo/contracts'
import type { GenePath, WorldConfig } from '@evo/contracts'
import type { OrganismState } from '../../src/entities/OrganismStore'
import { buildGeneSpecs } from '../../src/genetics/GeneSpecs'
import {
  createFounderGenome,
  genomeFromParts,
  genomeToVector
} from '../../src/genetics/GenomeFactory'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'

/**
 * An organism whose genome carries `config`'s founder baseline, so a system under test sees the
 * same traits the test configured. The genome id equals the organism id and the brain weights
 * are drawn from a fixed `genetics` stream, so organisms are reproducible but not identical.
 */
export function organismFor(
  config: WorldConfig,
  id: number,
  overrides: Partial<OrganismState> = {}
): OrganismState {
  const genome = createFounderGenome(
    id,
    buildGeneSpecs(config),
    config.genetics.brain,
    new SeededRandom(deriveStreamWords(id + 1, 'genetics'))
  )
  return {
    id,
    genome,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    age: 0,
    energy: 50,
    parentIds: [],
    birthTick: 0,
    reproductionCooldownRemaining: 0,
    lastTurnMagnitude: 0,
    ...overrides
  }
}

/** The same organism with some scalar genes replaced (genome id and brain unchanged). */
export function withGenes(
  organism: OrganismState,
  changes: Partial<Record<GenePath, number>>
): OrganismState {
  const vector = genomeToVector(organism.genome).map((value, index) => {
    const path = (GENE_DEFINITIONS[index] as { path: GenePath }).path
    return changes[path] ?? value
  })
  const genome = genomeFromParts({
    id: organism.genome.id,
    parentIds: organism.genome.parentIds,
    vector,
    architecture: organism.genome.brain.architecture,
    weights: organism.genome.brain.weights
  })
  return { ...organism, genome }
}
