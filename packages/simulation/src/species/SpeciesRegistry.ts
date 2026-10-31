import type {
  EntityId,
  Genome,
  PopulationSample,
  SpeciesConfig,
  SpeciesId,
  SpeciesRecord
} from '@evo/contracts'
import { genomeDistance, weightedDistance } from '../genetics/GeneticDistance'
import type { GeneSpec } from '../genetics/GeneSpecs'

/** The read-only view of the species registry that the `World` exposes. */
export interface SpeciesQueries {
  /** Number of species ever created, extinct ones included. */
  readonly size: number
  /** Every species ever created, ascending id. Returns copies. */
  list(): SpeciesRecord[]
  /** One species (a copy), or `undefined` if the id was never allocated. */
  get(id: SpeciesId): SpeciesRecord | undefined
  /** Species with at least one living member, ascending id. Returns copies. */
  active(): SpeciesRecord[]
  /** The species of a living organism, or `undefined` for an unknown, dead or unassigned one. */
  speciesOf(organismId: EntityId): SpeciesId | undefined
  /** Ancestor species, nearest first (the parent species, then its parent, ...). */
  ancestry(id: SpeciesId): SpeciesId[]
  /** Every species descended from `id`, transitively, ascending. */
  descendants(id: SpeciesId): SpeciesId[]
}

export interface SpeciesAssignment {
  organismId: EntityId
  genome: Genome
  /** The organism whose species the new species descends from if one is founded (the mother). */
  parentOrganismId: EntityId | null
  tick: number
}

interface Entry {
  readonly id: SpeciesId
  readonly representative: Genome
  readonly ancestorSpeciesId: SpeciesId | null
  memberCount: number
  readonly populationHistory: PopulationSample[]
  readonly createdAtTick: number
  lastSeenTick: number
  extinctAtTick: number | null
}

const copy = (entry: Entry): SpeciesRecord => ({
  id: entry.id,
  representativeGenomeId: entry.representative.id,
  ancestorSpeciesId: entry.ancestorSpeciesId,
  memberCount: entry.memberCount,
  populationHistory: entry.populationHistory.map((sample) => ({ ...sample })),
  createdAtTick: entry.createdAtTick,
  lastSeenTick: entry.lastSeenTick,
  extinctAtTick: entry.extinctAtTick
})

/**
 * Groups organisms into species by genetic distance (roadmap 6.1-6.4, ADR 0008,
 * docs/simulation/species.md). A genome joins the nearest *active* species whose founding genome
 * is within `species.threshold` (ties go to the lower id), otherwise it founds a new species.
 * Extinct species are never rejoined but are kept forever.
 *
 * Like `LineageStore` this is a derived record, not simulation state: it uses no randomness,
 * nothing reads it to decide what happens next (unless `reproductiveIsolation` is on, in which
 * case reproduction reads it, deterministically), and it is not part of the state hash. With
 * `species.enabled: false` every operation is a no-op and `assign` returns `null`.
 */
export class SpeciesRegistry implements SpeciesQueries {
  private readonly entries: Entry[] = []
  /** Ids of species with living members, ascending. */
  private readonly activeIds: SpeciesId[] = []
  /** Living organism -> its species. */
  private readonly speciesByOrganism = new Map<EntityId, SpeciesId>()

  constructor(
    private readonly config: SpeciesConfig,
    private readonly geneSpecs: readonly GeneSpec[],
    private readonly initialWeightStd: number
  ) {}

  get size(): number {
    return this.entries.length
  }

  /** Whether species are being tracked at all. */
  get enabled(): boolean {
    return this.config.enabled
  }

  /**
   * Assigns a new organism to a species, founding one if no active species is close enough.
   * Returns `null` when species are disabled.
   */
  assign(request: SpeciesAssignment): SpeciesId | null {
    if (!this.config.enabled) return null
    if (this.speciesByOrganism.has(request.organismId)) {
      throw new Error(`organism ${request.organismId} already has a species`)
    }

    let nearest: Entry | null = null
    let nearestDistance = Infinity
    for (const id of this.activeIds) {
      const entry = this.entries[id] as Entry
      const distance = weightedDistance(
        genomeDistance(request.genome, entry.representative, this.geneSpecs, this.initialWeightStd),
        this.config.distanceWeights
      )
      if (distance < nearestDistance) {
        nearest = entry
        nearestDistance = distance
      }
    }

    let species: Entry
    if (nearest !== null && nearestDistance <= this.config.threshold) {
      species = nearest
    } else {
      const parentSpecies =
        request.parentOrganismId === null
          ? undefined
          : this.speciesByOrganism.get(request.parentOrganismId)
      species = {
        id: this.entries.length,
        representative: request.genome,
        ancestorSpeciesId: parentSpecies ?? null,
        memberCount: 0,
        populationHistory: [],
        createdAtTick: request.tick,
        lastSeenTick: request.tick,
        extinctAtTick: null
      }
      this.entries.push(species)
      this.activeIds.push(species.id)
    }
    species.memberCount += 1
    species.lastSeenTick = request.tick
    this.speciesByOrganism.set(request.organismId, species.id)
    return species.id
  }

  /**
   * Removes a dead organism from its species. A species whose last member leaves is marked extinct
   * at `tick`. Unknown organisms (and the disabled registry) are ignored.
   */
  release(organismId: EntityId, tick: number): void {
    const id = this.speciesByOrganism.get(organismId)
    if (id === undefined) return
    this.speciesByOrganism.delete(organismId)
    const entry = this.entries[id] as Entry
    entry.memberCount -= 1
    if (entry.memberCount === 0) {
      entry.extinctAtTick = tick
      const index = this.activeIds.indexOf(id)
      this.activeIds.splice(index, 1)
    }
  }

  /**
   * End-of-tick bookkeeping: every active species was alive at the end of `tick`, and every
   * `sampleInterval` ticks its population is recorded (the oldest samples are dropped past
   * `maxHistorySamples`).
   */
  observe(tick: number): void {
    if (!this.config.enabled) return
    const sampling = tick % this.config.sampleInterval === 0
    for (const id of this.activeIds) {
      const entry = this.entries[id] as Entry
      entry.lastSeenTick = tick
      if (sampling && this.config.maxHistorySamples > 0) {
        entry.populationHistory.push({ tick, count: entry.memberCount })
        if (entry.populationHistory.length > this.config.maxHistorySamples) {
          entry.populationHistory.shift()
        }
      }
    }
  }

  list(): SpeciesRecord[] {
    return this.entries.map(copy)
  }

  get(id: SpeciesId): SpeciesRecord | undefined {
    const entry = this.entries[id]
    return entry === undefined ? undefined : copy(entry)
  }

  active(): SpeciesRecord[] {
    return this.activeIds.map((id) => copy(this.entries[id] as Entry))
  }

  speciesOf(organismId: EntityId): SpeciesId | undefined {
    return this.speciesByOrganism.get(organismId)
  }

  ancestry(id: SpeciesId): SpeciesId[] {
    const chain: SpeciesId[] = []
    let current = this.entries[id]?.ancestorSpeciesId ?? null
    while (current !== null) {
      chain.push(current)
      current = (this.entries[current] as Entry).ancestorSpeciesId
    }
    return chain
  }

  descendants(id: SpeciesId): SpeciesId[] {
    if (this.entries[id] === undefined) return []
    // A species' ancestor always has a smaller id, so one ascending pass finds the closure.
    const found = new Set<SpeciesId>([id])
    const result: SpeciesId[] = []
    for (let candidate = id + 1; candidate < this.entries.length; candidate++) {
      const ancestor = (this.entries[candidate] as Entry).ancestorSpeciesId
      if (ancestor !== null && found.has(ancestor)) {
        found.add(candidate)
        result.push(candidate)
      }
    }
    return result
  }

  /**
   * Consistency problems given the ids of the organisms that are alive. Empty when the registry
   * is sound: every living organism has an active species, member counts match, extinct species
   * have no members and a recorded extinction tick, and ancestors exist and are older.
   */
  problems(livingOrganismIds: readonly EntityId[]): string[] {
    if (!this.config.enabled) return []
    const problems: string[] = []
    const counted = new Map<SpeciesId, number>()
    for (const organismId of livingOrganismIds) {
      const id = this.speciesByOrganism.get(organismId)
      if (id === undefined) {
        problems.push(`organism ${organismId} has no species`)
        continue
      }
      counted.set(id, (counted.get(id) ?? 0) + 1)
    }
    if (this.speciesByOrganism.size !== livingOrganismIds.length) {
      problems.push(
        `species registry tracks ${this.speciesByOrganism.size} organisms but ${livingOrganismIds.length} are alive`
      )
    }
    for (const entry of this.entries) {
      const members = counted.get(entry.id) ?? 0
      if (entry.memberCount !== members) {
        problems.push(
          `species ${entry.id} memberCount ${entry.memberCount} but ${members} are alive`
        )
      }
      const isActive = this.activeIds.includes(entry.id)
      if (entry.memberCount > 0 && (!isActive || entry.extinctAtTick !== null)) {
        problems.push(`species ${entry.id} has members but is marked extinct`)
      }
      if (entry.memberCount === 0 && (isActive || entry.extinctAtTick === null)) {
        problems.push(`species ${entry.id} has no members but is not marked extinct`)
      }
      if (entry.ancestorSpeciesId !== null && entry.ancestorSpeciesId >= entry.id) {
        problems.push(`species ${entry.id} has an invalid ancestor ${entry.ancestorSpeciesId}`)
      }
    }
    return problems
  }
}
