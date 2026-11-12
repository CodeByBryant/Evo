import { BRAIN_INPUT_GROUPS } from '@evo/contracts'
import type {
  BrainInputGroup,
  EntityId,
  EvolutionSample,
  EvolutionSeries,
  WorldConfig,
  WorldEvent
} from '@evo/contracts'
import { developAnatomy } from '../development/develop'
import type { OrganismState, OrganismStore } from '../entities/OrganismStore'
import { bodyPlanDistance } from '../genetics/BodyDistance'
import { architectureOf, genomeToVector } from '../genetics/GenomeFactory'
import type { GeneSpec } from '../genetics/GeneSpecs'
import { brainLayoutOf } from '../learning/BrainLayout'
import { innatePriorWeights } from '../learning/InnatePrior'
import type { LineageStore } from '../lineage/LineageStore'
import type { SpeciesRegistry } from '../species/SpeciesRegistry'
import { BehaviourLedger, behaviourDiversity } from './behaviour'
import type { IntakeKind } from './behaviour'
import { brainDiversity, groupUsage, learnedGap, priorDistance } from './brainDrift'
import type { InputGroup } from './brainDrift'
import { columnStatistics, evolutionaryRate, StasisDetector } from './rate'
import { NoveltyTracker, bodyComplexity, bodySignature } from './signatures'
import { effectiveTypes, mean, stridedSample } from './stats'

/** Species younger than this many ticks count as young for the turnover indicator. */
const YOUNG_SPECIES_TICKS = 5_000
/** The cap on creatures in a pairwise measure. */
const PAIR_CAP = 100

/** What the recorder reads from a world. All read-only. */
export interface ObservatorySources {
  readonly config: WorldConfig
  readonly organisms: OrganismStore
  readonly lineage: LineageStore
  readonly species: SpeciesRegistry
  /** The body gene specs (for body-plan distances). */
  readonly bodySpecs: readonly GeneSpec[]
  /** The index of the carrion food kind, or -1 when the world has none. */
  readonly carrionKind: number
}

/**
 * The evolution observatory (ADR 0024). Watches a world and, every `sampleEvery` ticks, records
 * indicators of whether it is still changing: new body plans that take hold, how many ways creatures
 * make a living, how far brains have moved from the innate prior (and onto the new senses), how fast
 * trait means move, and how lineages and species turn over. It **only reads**: it holds its own
 * copies of what it needs, draws no random number, is not hashed and nothing in the simulation reads
 * it back, so a world with it on or off has the same state hash.
 */
export class ObservatoryRecorder {
  private readonly ledger: BehaviourLedger
  private readonly novelty = new NoveltyTracker()
  private readonly stasis = new StasisDetector()
  private readonly generation = new Map<EntityId, number>()
  private readonly samples: EvolutionSample[] = []
  private baseline: EvolutionSample | null = null
  private readonly prior: number[]
  private readonly layout
  private previousMeans: number[] | null = null
  private previousSds: number[] | null = null
  private previousDrift = 0
  private previousSpeciesEver = 0

  constructor(private readonly sources: ObservatorySources) {
    const { config } = sources
    this.ledger = new BehaviourLedger(
      Math.min(config.environment.width, config.environment.height) / 2
    )
    const architecture = architectureOf(config.genetics.brain)
    this.layout = brainLayoutOf(architecture)
    this.prior = innatePriorWeights(architecture)
  }

  /** Folds one tick's events in, and watches what each creature is doing every `behaviourEvery` ticks. */
  afterTick(tick: number, events: readonly WorldEvent[]): void {
    const { config } = this.sources
    for (const event of events) {
      switch (event.type) {
        case 'organism-born': {
          let generation = 0
          for (const parent of event.parentIds) {
            generation = Math.max(generation, (this.generation.get(parent) ?? 0) + 1)
          }
          this.generation.set(event.organismId, generation)
          break
        }
        case 'organism-died':
          this.ledger.forget(event.organismId)
          this.generation.delete(event.organismId)
          break
        case 'resource-bitten':
          this.ledger.recordIntake(
            event.organismId,
            event.kind === this.sources.carrionKind ? 'carrion' : 'plant',
            event.intake
          )
          break
        case 'resource-consumed':
          // Eating by touch (feeding off) takes the whole item; with bites this event only finishes one.
          if (!config.feeding.enabled) {
            this.ledger.recordIntake(
              event.organismId,
              event.kind === this.sources.carrionKind ? 'carrion' : 'plant',
              event.energyGained
            )
          }
          break
        case 'organism-bitten':
          this.ledger.recordIntake(event.predatorId, 'flesh', event.intake)
          this.ledger.recordBite(event.predatorId)
          break
        default:
          break
      }
    }
    const { observatory, organisms: organismConfig, timestep } = config
    if (tick % observatory.behaviourEvery === 0) {
      const maxTurn = organismConfig.maxTurnRate * timestep
      for (const o of this.sources.organisms.values()) {
        const speed = Math.sqrt(o.vx * o.vx + o.vy * o.vy) / organismConfig.maxSpeed
        const turn = maxTurn > 0 ? o.lastTurnMagnitude / maxTurn : 0
        this.ledger.observeMotion(
          o.id,
          speed,
          turn,
          o.x,
          o.y,
          observatory.behaviourEvery * timestep
        )
      }
    }
    if (tick % observatory.sampleEvery === 0) this.sample(tick)
  }

  /** Records one sample now. */
  sample(tick: number): void {
    const { config, organisms, lineage, species, bodySpecs } = this.sources
    const living: OrganismState[] = organisms.values()
    const n = living.length

    const signatures = new Map<string, number>()
    const bodies: (readonly number[])[] = []
    const complexity: { parts: number; types: number }[] = []
    const partTypes = new Set<string>()
    const weights: (readonly number[])[] = []
    const drifts: number[] = []
    const gaps: number[] = []
    const usageSums = new Map<BrainInputGroup, number>()
    const rows: number[][] = []
    const descriptors: number[][] = []
    let generationSum = 0
    let generationMax = 0

    for (const o of living) {
      const anatomy = developAnatomy(o.genome.body.genes, config.anatomy)
      const key = bodySignature(anatomy.parts)
      signatures.set(key, (signatures.get(key) ?? 0) + 1)
      bodies.push(o.genome.body.genes)
      const c = bodyComplexity(anatomy.parts)
      complexity.push(c)
      for (const part of anatomy.parts) if (part.functional) partTypes.add(part.type)

      const w = o.genome.brain.weights
      weights.push(w)
      const drift = priorDistance(w, this.prior)
      drifts.push(drift)
      const usage = groupUsage(w, this.layout)
      for (const group of BRAIN_INPUT_GROUPS) {
        usageSums.set(group, (usageSums.get(group) ?? 0) + usage[group])
      }
      if (o.brain !== null) {
        gaps.push(learnedGap(w.slice(this.layout.learnOffset), o.brain.learned))
      }

      rows.push([...genomeToVector(o.genome), c.parts, c.types, drift])
      const d = this.ledger.descriptor(o.id)
      if (d !== undefined) descriptors.push(d)
      const g = this.generation.get(o.id) ?? 0
      generationSum += g
      if (g > generationMax) generationMax = g
    }

    const novelty = this.novelty.observe(signatures)
    const stats = columnStatistics(rows)
    const rate =
      this.previousMeans === null || this.previousSds === null
        ? 0
        : evolutionaryRate(this.previousMeans, stats.means, this.previousSds, stats.sds)
    this.previousMeans = stats.means
    this.previousSds = stats.sds

    const priorDrift = mean(drifts)
    const driftChange = this.samples.length === 0 ? 0 : Math.abs(priorDrift - this.previousDrift)
    this.previousDrift = priorDrift
    const stasis = this.stasis.push({
      newSignatures: novelty.newSignatures,
      newlyPersistent: novelty.newlyPersistent,
      rate,
      driftChange
    })

    const behaviour = behaviourDiversity(descriptors)
    const intake = this.ledger.intakeTotals()
    const intakeTotal = intake.plant + intake.flesh + intake.carrion
    const share = (kind: IntakeKind): number => (intakeTotal === 0 ? 0 : intake[kind] / intakeTotal)

    const speciesList = species.list()
    let young = 0
    for (const o of living) {
      const id = species.speciesOf(o.id)
      const record = id === undefined ? undefined : species.get(id)
      if (record !== undefined && tick - record.createdAtTick < YOUNG_SPECIES_TICKS) young += 1
    }
    let foundersAlive = 0
    for (const founder of lineage.founders())
      if (!lineage.isLineageExtinct(founder)) foundersAlive += 1

    const bodyDistances = stridedSample(bodies, PAIR_CAP)
    let bodySum = 0
    let bodyPairs = 0
    for (let i = 0; i < bodyDistances.length; i++) {
      for (let j = i + 1; j < bodyDistances.length; j++) {
        bodySum += bodyPlanDistance(
          bodyDistances[i] as readonly number[],
          bodyDistances[j] as readonly number[],
          bodySpecs
        )
        bodyPairs += 1
      }
    }

    const inputUsage = {} as Record<InputGroup, number>
    for (const group of BRAIN_INPUT_GROUPS) {
      inputUsage[group] = n === 0 ? 0 : (usageSums.get(group) ?? 0) / n
    }

    const sample: EvolutionSample = {
      tick,
      time: tick * config.timestep,
      population: n,
      newPlans: novelty.newSignatures,
      plansEver: novelty.everSeen,
      plansAlive: novelty.alive,
      newlyPersistentPlans: novelty.newlyPersistent,
      persistentPlans: novelty.persistent,
      effectivePlans: effectiveTypes(signatures.values()),
      bodySpread: bodyPairs === 0 ? 0 : bodySum / bodyPairs,
      partsMean: mean(complexity.map((c) => c.parts)),
      partsMax: complexity.reduce((m, c) => Math.max(m, c.parts), 0),
      partTypes: partTypes.size,
      priorDrift,
      brainSpread: brainDiversity(weights, config.genetics.brain.initialWeightStd, PAIR_CAP),
      learnedGap: mean(gaps),
      inputUsage,
      behaviourTypes: behaviour.types,
      behaviourSpread: behaviour.spread,
      intakePlant: share('plant'),
      intakeFlesh: share('flesh'),
      intakeCarrion: share('carrion'),
      rate,
      speciesAlive: species.active().length,
      speciesEver: speciesList.length,
      newSpecies: speciesList.length - this.previousSpeciesEver,
      youngSpeciesShare: n === 0 ? 0 : young / n,
      foundersAlive,
      meanGeneration: n === 0 ? 0 : generationSum / n,
      maxGeneration: generationMax,
      stasis,
      quietSamples: this.stasis.quietSamples
    }
    this.previousSpeciesEver = speciesList.length
    if (this.baseline === null) this.baseline = sample
    this.samples.push(sample)
    if (this.samples.length > config.observatory.maxSamples) this.samples.shift()
  }

  /** A copy of everything recorded so far. */
  series(): EvolutionSeries {
    return {
      sampleEvery: this.sources.config.observatory.sampleEvery,
      baseline:
        this.baseline === null
          ? null
          : { ...this.baseline, inputUsage: { ...this.baseline.inputUsage } },
      samples: this.samples.map((s) => ({ ...s, inputUsage: { ...s.inputUsage } }))
    }
  }
}
