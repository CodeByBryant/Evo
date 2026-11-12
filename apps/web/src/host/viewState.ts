import { ACTION_LABELS, OBSERVATION_LABELS, PART_STATS } from '@evo/contracts'
import type {
  ClusterReport,
  EntityId,
  GeneRow,
  HistoryPoint,
  InspectorAnatomy,
  InspectorBrain,
  InspectorView,
  LabelledValue,
  OrganismSnapshot,
  PresetOption,
  RenderLayers,
  RunStatus,
  SpeciesRow,
  SpeedSetting,
  ViewState,
  WorldSnapshot
} from '@evo/contracts'
import { speciesColor } from '@evo/renderer'
import { partCostOf } from '@evo/simulation'
import type { World } from '@evo/simulation'

/** Samples of a species' history sent to the interface. */
const SPECIES_HISTORY_POINTS = 60

const GENE_GROUPS = ['physical', 'metabolic', 'behavioral', 'reproduction', 'learning'] as const

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

/**
 * One sample of the run's history. The living-species count comes from the snapshot's organisms
 * (distinct species ids), which is exact and needs no copy of the registry.
 */
export function historyPointOf(snapshot: WorldSnapshot): HistoryPoint {
  const living = new Set<number>()
  for (const organism of snapshot.organisms) {
    if (organism.speciesId !== null) living.add(organism.speciesId)
  }
  return {
    tick: snapshot.tick,
    time: snapshot.time,
    count: snapshot.population.active,
    species: living.size,
    food: snapshot.resources.length,
    starved: snapshot.metrics.deathsByStarvation,
    aged: snapshot.metrics.deathsByAge,
    damaged: snapshot.metrics.deathsByDamage,
    predated: snapshot.metrics.deathsByPredation
  }
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

/** What a working eye sees (the same reach as the renderer's sight arc), or `null` for any other part. */
function sightOf(
  part: { readonly slot: number; readonly type: string },
  cones: readonly { readonly slot: number; readonly half: number; readonly reach: number }[],
  sensorRadius: number
): { half: number; reach: number } | null {
  if (part.type !== 'eye') return null
  const cone = cones.find((c) => c.slot === part.slot)
  return cone === undefined ? null : { half: cone.half, reach: cone.reach * sensorRadius }
}

/** The anatomy tab's data: outline, parts and what the body does relative to the founder. */
export function buildAnatomy(world: World, id: EntityId): InspectorAnatomy | null {
  const view = world.anatomyOf(id)
  if (view === undefined) return null
  const { anatomy, capabilities, factors } = view
  const outline: number[] = []
  for (const point of anatomy.outline.points) outline.push(point.x, point.y)
  return {
    outline,
    parts: anatomy.parts.map((part) => {
      const cost = partCostOf(part, world.config.anatomy)
      return {
        slot: part.slot,
        type: part.type,
        parent: part.parent,
        size: part.size,
        x: part.x,
        y: part.y,
        tipX: part.tipX,
        tipY: part.tipY,
        orientation: part.orientation,
        functional: part.functional,
        sight: sightOf(part, factors.vision.cones, world.config.organisms.sensorRadius),
        integrity: part.integrity,
        mass: cost.mass,
        upkeep: cost.upkeep,
        stats: PART_STATS[part.type].map((spec) => ({
          key: spec.key,
          label: spec.label,
          value: part.statValues[spec.key] as number,
          unit: spec.unit
        }))
      }
    }),
    undeveloped: anatomy.undeveloped,
    sizeUsed: anatomy.sizeUsed,
    budget: world.config.anatomy.structuralBudget,
    capabilities: [
      { label: 'speed', value: factors.speed },
      { label: 'strafe', value: factors.strafe },
      { label: 'turning', value: factors.turn },
      { label: 'sense range', value: factors.senseRange },
      { label: 'reach', value: factors.reach },
      { label: 'digestion', value: factors.digestion },
      { label: 'energy capacity', value: factors.energyCapacity },
      { label: 'toxin damage', value: factors.toxinDamage },
      { label: 'damage taken', value: factors.damageTaken },
      { label: 'temperature tolerance', value: factors.temperatureTolerance },
      { label: 'regeneration', value: factors.regeneration },
      { label: 'mass', value: capabilities.mass },
      { label: 'upkeep (energy/s)', value: capabilities.upkeep },
      { label: 'extra upkeep (energy/s)', value: factors.upkeepDelta }
    ]
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
      cooldown: organism.reproductionCooldownRemaining,
      gut: organism.gut,
      gutCapacity: organism.gutCapacity
    },
    genome: genes,
    anatomy: buildAnatomy(world, id),
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
  readonly startingBody: string | null
  readonly startingGroups: ViewState['startingGroups']
  readonly presets: readonly PresetOption[]
  readonly speed: SpeedSetting
  readonly achievedTicksPerSecond: number
  readonly history: readonly HistoryPoint[]
  readonly species: { rows: readonly SpeciesRow[]; extinct: number }
  readonly clusters: ClusterReport | null
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
    startingBody: inputs.startingBody,
    startingGroups: inputs.startingGroups,
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
    history: inputs.history,
    species: inputs.species.rows,
    activeSpecies: inputs.species.rows.length,
    extinctSpecies: inputs.species.extinct,
    clusters: inputs.clusters,
    layers: inputs.layers,
    following: inputs.following,
    selected: inputs.selected,
    selectedId: inputs.selectedId
  }
}
