import { GENE_DEFINITIONS } from '@evo/contracts'
import type { GeneKind, WorldConfig } from '@evo/contracts'
import { geneBaselines, resolveGeneRanges } from '@evo/config'

/**
 * One gene as the operators see it. A table of these (in a fixed order) is all the mutation,
 * recombination, validation and comparison code needs, so the operators are generic over the
 * table and tests can drive them with synthetic tables that contain integer, boolean, circular
 * and correlated genes the production table does not have.
 */
export interface GeneSpec {
  /** Dotted path such as `physical.maxSpeed`; the group is the part before the first dot. */
  readonly path: string
  readonly kind: GeneKind
  readonly min: number
  readonly max: number
  /** Probability in `[0, 1]` that the gene mutates in one birth (before the global scale). */
  readonly mutationRate: number
  /** Standard deviation: a fraction of the range width, or of the value when `relative`. */
  readonly mutationStd: number
  /** The founder value. */
  readonly baseline: number
  /** Mutation size is relative to the current value instead of the range width. */
  readonly relative: boolean
  /** Genes sharing a group receive one shared mutation draw (trait-shift). Floats/circular only. */
  readonly correlationGroup?: string
  /** Index, in the same table, of a gene this one must stay strictly above; `-1` if none. */
  readonly orderedAfter: number
}

/**
 * Gap kept between an ordered gene and the gene it must follow. Ages are in seconds, so this is
 * far below anything the simulation can observe while still keeping the order strict.
 */
export const ORDER_MARGIN = 1e-6

/** The production gene table for a world configuration, in canonical order. */
export function buildGeneSpecs(config: WorldConfig): GeneSpec[] {
  const baselines = geneBaselines(config)
  const ranges = resolveGeneRanges(config.genetics.genes, baselines)
  const indexOf = (path: string): number => GENE_DEFINITIONS.findIndex((d) => d.path === path)
  return GENE_DEFINITIONS.map((definition) => {
    const range = ranges[definition.path]
    return {
      path: definition.path,
      kind: definition.kind,
      min: range.min,
      max: range.max,
      mutationRate: range.mutationRate,
      mutationStd: range.mutationStd,
      baseline: baselines[definition.path],
      relative: definition.relative === true,
      orderedAfter: definition.orderedAfter === undefined ? -1 : indexOf(definition.orderedAfter)
    }
  })
}
