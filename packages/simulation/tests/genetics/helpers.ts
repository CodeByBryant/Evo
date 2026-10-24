import { resolveWorldConfig } from '@evo/config'
import type { Genome, GenomeId, WorldConfig, WorldConfigOverrides } from '@evo/contracts'
import { buildGeneSpecs } from '../../src/genetics/GeneSpecs'
import type { GeneSpec } from '../../src/genetics/GeneSpecs'
import { createFounderGenome, genomeFromParts } from '../../src/genetics/GenomeFactory'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'

/** A seeded `genetics` stream. */
export function geneticsStream(seed: number): SeededRandom {
  return new SeededRandom(deriveStreamWords(seed, 'genetics'))
}

export interface Fixture {
  config: WorldConfig
  specs: GeneSpec[]
}

export function fixture(overrides?: WorldConfigOverrides): Fixture {
  const config = resolveWorldConfig(overrides)
  return { config, specs: buildGeneSpecs(config) }
}

export function founder(f: Fixture, id: GenomeId, seed: number): Genome {
  return createFounderGenome(id, f.specs, f.config.genetics.brain, geneticsStream(seed))
}

/** A genome whose every scalar gene sits at `pick(spec)` and whose weights are all `weight`. */
export function genomeWith(
  f: Fixture,
  id: GenomeId,
  pick: (spec: GeneSpec) => number,
  weight: number,
  parentIds: readonly GenomeId[] = []
): Genome {
  const base = founder(f, id, 1)
  return genomeFromParts({
    id,
    parentIds,
    vector: f.specs.map(pick),
    architecture: base.brain.architecture,
    weights: base.brain.weights.map(() => weight)
  })
}

/** A same-seed pair of streams that have consumed the same number of draws is in the same state. */
export function sameState(a: SeededRandom, b: SeededRandom): boolean {
  return JSON.stringify(a.getState()) === JSON.stringify(b.getState())
}

/** Builds a synthetic spec table (the production table has no integer, boolean or correlated gene). */
export function synthetic(
  rows: ReadonlyArray<Partial<GeneSpec> & Pick<GeneSpec, 'path' | 'kind' | 'min' | 'max'>>
): GeneSpec[] {
  return rows.map((row) => ({
    mutationRate: 1,
    mutationStd: 0.1,
    baseline: (row.min + row.max) / 2,
    relative: false,
    orderedAfter: -1,
    ...row
  }))
}
