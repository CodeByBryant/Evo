import { ACTION_LABELS, OBSERVATION_LABELS } from '@evo/contracts'
import type {
  EntityId,
  GeneRow,
  InspectorBrain,
  InspectorView,
  LabelledValue,
  OrganismSnapshot,
  PopulationPoint,
  PresetOption,
  RenderLayers,
  RunStatus,
  SpeciesRow,
  SpeedSetting,
  ViewState,
  WorldSnapshot
} from '@evo/contracts'
import { speciesColor } from '@evo/renderer'
import type { World } from '@evo/simulation'

/** Samples of a species' history sent to the interface. */
const SPECIES_HISTORY_POINTS = 60

const GENE_GROUPS = [
  'physical',
  'sensory',
  'metabolic',
  'behavioral',
  'reproduction',
  'learning'
] as const

const labelled = (labels: readonly string[], values: readonly number[]): LabelledValue[] =>
  labels.map((label, i) => ({ label, value: values[i] ?? 0 }))

/** The living species as rows (largest first); extinct ones are only counted. Copies, so call sparingly. */
export function buildSpeciesRows(world: World): { rows: SpeciesRow[]; extinct: number } {
  const active = world.species.active()
  const rows = active
    .map<SpeciesRow>((species) => ({
      id: species.id,
      color: speciesColor(species.id),
      members: species.memberCount,
      createdAtTick: species.createdAtTick,
      extinctAtTick: species.extinctAtTick,
      ancestorId: species.ancestorSpeciesId,
      history: species.populationHistory.slice(-SPECIES_HISTORY_POINTS).map((s) => s.count)
    }))
    .sort((a, b) => b.members - a.members || a.id - b.id)
  return { rows, extinct: world.species.size - active.length }
}

/** How many genomes lie above and below this one in the family tree (can be slow late in a long run). */
export function lineageCounts(
  world: World,
  genomeId: number
): { ancestors: number; descendants: number } {
  return {
    ancestors: world.lineage.ancestorsOf(genomeId).length,
    descendants: world.lineage.descendantsOf(genomeId).length
  }
}

/** The inspector's data for one living organism, or `null` if it is not in the snapshot. */
export function buildInspector(
  world: World,
  snapshot: WorldSnapshot,
  id: EntityId,
  lineage: { ancestors: number; descendants: number }
): InspectorView | null {
  const organism: OrganismSnapshot | undefined = snapshot.organisms.find((o) => o.id === id)
  if (organism === undefined) return null
  const genome = world.genomeOf(id)
  const genes: GeneRow[] = []
  if (genome !== undefined) {
    for (const group of GENE_GROUPS) {
      for (const [name, value] of Object.entries(genome[group])) {
        if (typeof value === 'number') genes.push({ group, name, value })
      }
    }
  }
  const brain = world.brainOf(id)
  const inspectorBrain: InspectorBrain | null =
    brain === undefined
      ? null
      : {
          inputs: labelled(OBSERVATION_LABELS, brain.observation),
          outputs: labelled(ACTION_LABELS, brain.output),
          actions: labelled(ACTION_LABELS, brain.action),
          value: brain.value,
          reward: [
            { label: 'feeding', value: brain.reward.feeding },
            { label: 'reproduction', value: brain.reward.reproduction },
            { label: 'energyCost', value: brain.reward.energyCost },
            { label: 'damage', value: brain.reward.damage },
            { label: 'exploration', value: brain.reward.exploration }
          ],
          rewardTotal: brain.reward.total,
          updates: brain.telemetry.updates,
          weightChange: brain.telemetry.weightChange
        }
  return {
    id,
    speciesId: organism.speciesId,
    speciesColor: speciesColor(organism.speciesId),
    overview: {
      lifeStage: organism.lifeStage,
      age: organism.age,
      maxAge: organism.maxAge,
      energy: organism.energy,
      maxEnergy: organism.maxEnergy,
      health: organism.health,
      maxHealth: organism.maxHealth,
      x: organism.position.x,
      y: organism.position.y,
      cooldown: organism.reproductionCooldownRemaining
    },
    genome: genes,
    brain: inspectorBrain,
    lineage: {
      parentIds: organism.parentIds,
      genomeId: organism.genomeId,
      ancestorGenomes: lineage.ancestors,
      descendantGenomes: lineage.descendants,
      speciesAncestry: organism.speciesId === null ? [] : world.species.ancestry(organism.speciesId)
    },
    environment: {
      regionType: world.regionTypeAt(organism.position.x, organism.position.y),
      season: world.season,
      migration: world.migrationOf(id) ?? null
    }
  }
}

export interface ViewInputs {
  readonly snapshot: WorldSnapshot
  readonly season: ViewState['season']
  readonly status: RunStatus
  readonly seed: number
  readonly preset: string
  readonly presets: readonly PresetOption[]
  readonly speed: SpeedSetting
  readonly achievedTicksPerSecond: number
  readonly populationHistory: readonly PopulationPoint[]
  readonly species: { rows: readonly SpeciesRow[]; extinct: number }
  readonly layers: RenderLayers
  readonly following: boolean
  readonly selected: InspectorView | null
  readonly selectedId: EntityId | null
}

/** Assembles what the interface shows. Pure: everything it needs is passed in. */
export function buildViewState(inputs: ViewInputs): ViewState {
  const { snapshot } = inputs
  return {
    status: inputs.status,
    seed: inputs.seed,
    preset: inputs.preset,
    presets: inputs.presets,
    speed: inputs.speed,
    achievedTicksPerSecond: inputs.achievedTicksPerSecond,
    tick: snapshot.tick,
    time: snapshot.time,
    season: inputs.season,
    population: snapshot.population.active,
    resources: snapshot.resources.length,
    extinctionTick: snapshot.population.extinctionTick,
    metrics: snapshot.metrics,
    populationHistory: inputs.populationHistory,
    species: inputs.species.rows,
    activeSpecies: inputs.species.rows.length,
    extinctSpecies: inputs.species.extinct,
    layers: inputs.layers,
    following: inputs.following,
    selected: inputs.selected,
    selectedId: inputs.selectedId
  }
}
