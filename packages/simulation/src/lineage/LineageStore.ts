import type { EntityId, GenomeId, LineageRecord } from '@evo/contracts'

/** The read-only view of a lineage store that the `World` exposes. */
export interface LineageQueries {
  /** Number of genomes ever registered. */
  readonly size: number
  /** The record for a genome, or `undefined` if it was never registered. */
  record(genomeId: GenomeId): LineageRecord | undefined
  /** The genome's parents, ascending (empty for a founder). */
  parentsOf(genomeId: GenomeId): GenomeId[]
  /** Every ancestor, transitively, ascending. A genome is not its own ancestor. */
  ancestorsOf(genomeId: GenomeId): GenomeId[]
  /** Every descendant, transitively, ascending. A genome is not its own descendant. */
  descendantsOf(genomeId: GenomeId): GenomeId[]
  /**
   * The most recent genome (greatest id) that is, or is an ancestor of, both `a` and `b`; `null`
   * if their ancestries never meet. A genome counts as an ancestor of itself here, so the common
   * ancestor of a genome and its own descendant is the genome.
   */
  commonAncestor(a: GenomeId, b: GenomeId): GenomeId | null
  /** Genomes with no parents, ascending. */
  founders(): GenomeId[]
  isFounder(genomeId: GenomeId): boolean
  /** `true` when neither the genome nor any descendant has a living organism. */
  isLineageExtinct(genomeId: GenomeId): boolean
}

interface Entry {
  readonly genomeId: GenomeId
  readonly parentGenomeIds: readonly GenomeId[]
  readonly organismIds: EntityId[]
  readonly createdAtTick: number
}

export interface LineageRegistration {
  genomeId: GenomeId
  /** Empty for a founder; otherwise already-registered genomes. */
  parentGenomeIds: readonly GenomeId[]
  organismId: EntityId
  tick: number
}

/**
 * A record of every genome that has ever existed and how they are related, kept after the
 * organisms that carried them die (roadmap 4.6). It is a derived record, not simulation state:
 * nothing reads it to decide what happens next, so it is not part of the state hash (the same
 * policy as `HistoryStore`). Entries hold only small integers and are never removed; the store
 * therefore grows with the number of births, and bounding it is a persistence and performance
 * concern for later phases.
 *
 * Ancestry in a sexual population is a DAG whose ancestor sets grow quickly, so the traversal
 * queries and `descendantCount` are computed on demand rather than maintained per birth.
 */
export class LineageStore implements LineageQueries {
  private readonly entries = new Map<GenomeId, Entry>()
  private readonly childrenOf = new Map<GenomeId, GenomeId[]>()
  private readonly founderIds: GenomeId[] = []
  /** Living organism -> the genome it carries. */
  private readonly livingOrganisms = new Map<EntityId, GenomeId>()
  /** Genomes with a living organism, with how many (always 0 or 1 today; counted for safety). */
  private readonly livingGenomes = new Map<GenomeId, number>()

  get size(): number {
    return this.entries.size
  }

  /** Records a new genome. Parents must already be registered; a genome is registered once. */
  register(registration: LineageRegistration): void {
    const { genomeId, parentGenomeIds, organismId, tick } = registration
    if (this.entries.has(genomeId)) {
      throw new RangeError(`genome ${genomeId} is already registered`)
    }
    for (const parentId of parentGenomeIds) {
      if (!this.entries.has(parentId)) {
        throw new RangeError(`parent genome ${parentId} of genome ${genomeId} is not registered`)
      }
    }
    const parents = [...parentGenomeIds].sort((a, b) => a - b)
    this.entries.set(genomeId, {
      genomeId,
      parentGenomeIds: parents,
      organismIds: [organismId],
      createdAtTick: tick
    })
    if (parents.length === 0) this.founderIds.push(genomeId)
    for (const parentId of parents) {
      const children = this.childrenOf.get(parentId)
      if (children) children.push(genomeId)
      else this.childrenOf.set(parentId, [genomeId])
    }
    this.livingOrganisms.set(organismId, genomeId)
    this.livingGenomes.set(genomeId, (this.livingGenomes.get(genomeId) ?? 0) + 1)
  }

  /** Marks an organism dead. Its genome's record stays; unknown or already-dead ids are ignored. */
  markDeath(organismId: EntityId): void {
    const genomeId = this.livingOrganisms.get(organismId)
    if (genomeId === undefined) return
    this.livingOrganisms.delete(organismId)
    const remaining = (this.livingGenomes.get(genomeId) ?? 1) - 1
    if (remaining <= 0) this.livingGenomes.delete(genomeId)
    else this.livingGenomes.set(genomeId, remaining)
  }

  record(genomeId: GenomeId): LineageRecord | undefined {
    const entry = this.entries.get(genomeId)
    if (!entry) return undefined
    return {
      genomeId: entry.genomeId,
      parentGenomeIds: [...entry.parentGenomeIds],
      organismIds: [...entry.organismIds],
      createdAtTick: entry.createdAtTick,
      descendantCount: this.descendantsOf(genomeId).length
    }
  }

  parentsOf(genomeId: GenomeId): GenomeId[] {
    return [...(this.entries.get(genomeId)?.parentGenomeIds ?? [])]
  }

  ancestorsOf(genomeId: GenomeId): GenomeId[] {
    return this.traverse(genomeId, (id) => this.entries.get(id)?.parentGenomeIds ?? [])
  }

  descendantsOf(genomeId: GenomeId): GenomeId[] {
    return this.traverse(genomeId, (id) => this.childrenOf.get(id) ?? [])
  }

  commonAncestor(a: GenomeId, b: GenomeId): GenomeId | null {
    if (!this.entries.has(a) || !this.entries.has(b)) return null
    const ofA = new Set<GenomeId>([a, ...this.ancestorsOf(a)])
    let best: GenomeId | null = null
    for (const candidate of [b, ...this.ancestorsOf(b)]) {
      if (ofA.has(candidate) && (best === null || candidate > best)) best = candidate
    }
    return best
  }

  founders(): GenomeId[] {
    return [...this.founderIds].sort((a, b) => a - b)
  }

  isFounder(genomeId: GenomeId): boolean {
    const entry = this.entries.get(genomeId)
    return entry !== undefined && entry.parentGenomeIds.length === 0
  }

  isLineageExtinct(genomeId: GenomeId): boolean {
    if (!this.entries.has(genomeId)) return true
    if (this.livingGenomes.has(genomeId)) return false
    for (const descendant of this.descendantsOf(genomeId)) {
      if (this.livingGenomes.has(descendant)) return false
    }
    return true
  }

  /** Depth-first walk collecting every reachable id exactly once, returned ascending. */
  private traverse(start: GenomeId, next: (id: GenomeId) => readonly GenomeId[]): GenomeId[] {
    const seen = new Set<GenomeId>()
    const stack: GenomeId[] = [...next(start)]
    while (stack.length > 0) {
      const id = stack.pop() as GenomeId
      if (seen.has(id)) continue
      seen.add(id)
      for (const following of next(id)) stack.push(following)
    }
    return [...seen].sort((a, b) => a - b)
  }
}
