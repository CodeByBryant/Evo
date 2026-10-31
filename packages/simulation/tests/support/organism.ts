import { GENE_DEFINITIONS } from '@evo/contracts'
import type { GenePath, WorldConfig } from '@evo/contracts'
import { IdGenerator } from '../../src/entities/IdGenerator'
import type { OrganismState, OrganismStore } from '../../src/entities/OrganismStore'
import type { EventLog } from '../../src/events/EventLog'
import { buildGeneSpecs } from '../../src/genetics/GeneSpecs'
import {
  createFounderGenome,
  genomeFromParts,
  genomeToVector
} from '../../src/genetics/GenomeFactory'
import { GenomeRecombiner } from '../../src/genetics/Recombination'
import { LineageStore } from '../../src/lineage/LineageStore'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'
import type { SpatialHash } from '../../src/spatial/SpatialHash'
import { ReproductionSystem } from '../../src/systems/ReproductionSystem'

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
    brain: null,
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

/** An id generator whose next id is `n`, as if `n` ids had already been handed out. */
export function idsFrom(n: number): IdGenerator {
  const ids = new IdGenerator()
  for (let i = 0; i < n; i++) ids.allocate()
  return ids
}

export interface ReproductionFixture {
  system: ReproductionSystem
  lineage: LineageStore
}

/**
 * A `ReproductionSystem` wired like the `World` wires it: a recombiner drawing genome ids from a
 * fresh counter (default 100), the `genetics` and `reproduction` streams, and a lineage store
 * already holding every organism in `organisms` as a founder.
 */
export function makeReproduction(
  config: WorldConfig,
  organisms: OrganismStore,
  index: SpatialHash<OrganismState>,
  ids: IdGenerator,
  events: EventLog,
  options: { genomeIdStart?: number; seed?: number } = {}
): ReproductionFixture {
  const lineage = new LineageStore()
  for (const organism of organisms.values()) {
    if (!lineage.record(organism.genome.id)) {
      lineage.register({
        genomeId: organism.genome.id,
        parentGenomeIds: [],
        organismId: organism.id,
        tick: 0
      })
    }
  }
  const genomeIds = idsFrom(options.genomeIdStart ?? 100)
  const seed = options.seed ?? 1
  const system = new ReproductionSystem(
    config,
    organisms,
    index,
    ids,
    new GenomeRecombiner(buildGeneSpecs(config), config.genetics, () => genomeIds.allocate()),
    new SeededRandom(deriveStreamWords(seed, 'genetics')),
    lineage,
    new SeededRandom(deriveStreamWords(seed, 'reproduction')),
    events
  )
  return { system, lineage }
}
