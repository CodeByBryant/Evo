import type { WorldConfig } from '@evo/contracts'
import type { IdGenerator } from '../entities/IdGenerator'
import type { ResourceState, ResourceStore } from '../entities/ResourceStore'
import type { EcologyModel } from '../ecology/EcologyModel'
import type { ClusterLayout } from '../ecology/ClusterLayout'
import type { FoodField } from '../ecology/FoodField'
import type { HazardStore } from '../ecology/HazardStore'
import type { EventLog } from '../events/EventLog'
import type { RandomSource } from '../random/RandomSource'
import type { SeededRandom } from '../random/SeededRandom'

/** Attempts to find a position a kind can grow in before a spawn is dropped. */
const PLACEMENT_ATTEMPTS = 8
/**
 * Candidate sites a spawn draws in `noise` mode, always all of them (three draws each: x, y and an
 * acceptance number), so the number of draws never depends on where the pattern says food belongs.
 */
const NOISE_CANDIDATES = 8
/** Attempts to place one static damage area in a hazardous region. */
const HAZARD_PLACEMENT_ATTEMPTS = 16
/** Upper bound on storms spawned in one tick, whatever the configured rate. */
const MAX_STORMS_PER_TICK = 8

/**
 * Spawns resources and manages hazards. Owns the resource store's population growth, the hazard
 * store, and the two fractional accumulators (docs/simulation/update-order.md, stage 2):
 * `spawnRate * timestep * seasonal regeneration` new resources and `stormRate * seasonal intensity
 * * timestep` storms are expected per tick, and the fractional remainders carry deterministically
 * to later ticks.
 *
 * With every ecology feature off this is exactly the Phase 5 system: two `environment` draws per
 * resource, the whole world (or `resources.region`), the baseline energy. Kinds add one draw for
 * the kind and two per placement attempt; storms draw two values from the `events` stream.
 */
export class EnvironmentSystem {
  private spawnAccumulator = 0
  private stormAccumulator = 0

  constructor(
    private readonly config: WorldConfig,
    private readonly resources: ResourceStore,
    private readonly ids: IdGenerator,
    private readonly random: SeededRandom,
    private readonly events: EventLog,
    private readonly ecology: EcologyModel | null = null,
    private readonly hazards: HazardStore | null = null,
    private readonly stormRandom: RandomSource | null = null,
    /** Living organisms per cluster, for steering food toward them (cluster layout only). */
    private readonly livingPerCluster: (() => readonly number[]) | null = null,
    /** The pattern food follows in `noise` mode (ADR 0021); `null` spreads it evenly. */
    private readonly foodField: FoodField | null = null
  ) {}

  /** Simulated seconds at the current tick, for the drifting pattern. */
  private time = 0

  /** Living organisms per cluster, read once a tick (`update`), so every spawn sees the same counts. */
  private living: readonly number[] = []

  /** The carried fractional resource spawn; hashed, since it decides future spawns. */
  get spawnRemainder(): number {
    return this.spawnAccumulator
  }

  /** The carried fractional storm spawn; hashed for the same reason. */
  get stormRemainder(): number {
    return this.stormAccumulator
  }

  /** A point inside a uniformly chosen cluster (3 draws: cluster, distance, angle). */
  private clusterPoint(random: RandomSource): { x: number; y: number } {
    const layout = (this.ecology as EcologyModel).clusters as ClusterLayout
    const cluster = Math.min(layout.count - 1, Math.floor(random.float() * layout.count))
    return layout.pointIn(cluster, random.float(), random.float())
  }

  /**
   * A point inside a cluster chosen so that food is not stranded where nobody lives (ADR 0014
   * revision): every cluster with a living organism has weight 1 and an empty one has weight
   * `foodFloor`. It uses the same three draws as `clusterPoint`, and the same arithmetic as an
   * even spread when nobody has been counted yet (the initial food, placed before the organisms
   * exist).
   */
  private foodPoint(random: RandomSource): { x: number; y: number } {
    const layout = (this.ecology as EcologyModel).clusters as ClusterLayout
    const floor = this.config.environment.clusters.foodFloor
    const draw = random.float()
    const counted = this.living.length === layout.count
    let total = 0
    if (counted) {
      for (let c = 0; c < layout.count; c++) total += (this.living[c] as number) > 0 ? 1 : floor
    }
    let cluster: number
    if (!counted || !(total > 0)) {
      cluster = Math.min(layout.count - 1, Math.floor(draw * layout.count))
    } else {
      const target = draw * total
      let sum = 0
      cluster = layout.count - 1
      for (let c = 0; c < layout.count; c++) {
        sum += (this.living[c] as number) > 0 ? 1 : floor
        if (target < sum) {
          cluster = c
          break
        }
      }
    }
    return layout.pointIn(cluster, random.float(), random.float())
  }

  /**
   * Removes food stranded in clusters with no living organisms, lowest id first and at most
   * `strandedFoodPerTick` a tick, so it cannot sit on the global food cap forever. No draws.
   */
  private clearStrandedFood(): void {
    const limit = this.config.environment.clusters.strandedFoodPerTick
    const layout = (this.ecology as EcologyModel).clusters as ClusterLayout
    if (limit <= 0 || this.living.length !== layout.count) return
    if (!this.living.some((alive) => alive === 0)) return
    let removed = 0
    for (const resource of this.resources.values()) {
      const cluster = layout.clusterAt(resource.x, resource.y)
      if (cluster < 0 || (this.living[cluster] as number) > 0) continue
      this.resources.remove(resource.id)
      if (++removed >= limit) return
    }
  }

  /**
   * The first of `NOISE_CANDIDATES` random sites in `area` that the pattern accepts (and, when kinds
   * are on, where `kind` can grow), or `null` when none does and the spawn is dropped. Always draws
   * all candidates.
   */
  private noiseSite(
    area: { x: number; y: number; width: number; height: number },
    kind: number | null
  ): { x: number; y: number } | null {
    const field = this.foodField as FoodField
    const eco = this.ecology
    let found: { x: number; y: number } | null = null
    for (let i = 0; i < NOISE_CANDIDATES; i++) {
      const x = area.x + this.random.float() * area.width
      const y = area.y + this.random.float() * area.height
      const accept = this.random.float()
      if (found !== null) continue
      if (accept >= field.density(x, y, this.time)) continue
      if (kind !== null && eco !== null && !eco.kindGrowsAt(kind, x, y)) continue
      found = { x, y }
    }
    return found
  }

  private spawnOne(tick: number): void {
    // With no region the whole world is used and the draws are exactly Phase 4's.
    const { region } = this.config.resources
    const area = region ?? {
      x: 0,
      y: 0,
      width: this.config.environment.width,
      height: this.config.environment.height
    }
    const eco = this.ecology
    let kind = 0
    let x: number
    let y: number
    if (eco !== null && eco.clusters !== null) {
      // The cluster layout (docs/decisions/0014): food grows inside clusters only.
      if (eco.kindsOn) kind = eco.chooseKind(this.random.float())
      let point = this.foodPoint(this.random)
      for (let attempt = 1; eco.kindsOn && !eco.kindGrowsAt(kind, point.x, point.y); attempt++) {
        if (attempt >= PLACEMENT_ATTEMPTS) return
        point = this.foodPoint(this.random)
      }
      x = point.x
      y = point.y
    } else if (this.foodField !== null) {
      // The patchy field (ADR 0021): a fixed number of candidates, the first the pattern accepts.
      if (eco !== null && eco.kindsOn) kind = eco.chooseKind(this.random.float())
      const site = this.noiseSite(area, eco !== null && eco.kindsOn ? kind : null)
      if (site === null) return
      x = site.x
      y = site.y
    } else if (eco !== null && eco.kindsOn) {
      kind = eco.chooseKind(this.random.float())
      x = area.x + this.random.float() * area.width
      y = area.y + this.random.float() * area.height
      for (let attempt = 1; !eco.kindGrowsAt(kind, x, y); attempt++) {
        // A kind whose regions do not exist on this map never appears: the spawn is dropped.
        if (attempt >= PLACEMENT_ATTEMPTS) return
        x = area.x + this.random.float() * area.width
        y = area.y + this.random.float() * area.height
      }
    } else {
      x = area.x + this.random.float() * area.width
      y = area.y + this.random.float() * area.height
    }
    const id = this.ids.allocate()
    const energy = eco === null ? this.config.resources.energyValue : eco.kind(kind).energy
    const resource: ResourceState = { id, x, y, remaining: energy, kind }
    this.resources.add(resource)
    this.events.record({
      type: 'resource-spawned',
      tick,
      resourceId: id,
      kind,
      position: { x, y }
    })
  }

  /** Spawns the initial population at world creation. Called once, at tick 0, from `World`. */
  spawnInitial(tick: number): void {
    for (let i = 0; i < this.config.resources.initialCount; i++) this.spawnOne(tick)
  }

  /**
   * Places the static damage areas, once, at world creation, from the `terrain` stream: each gets
   * up to 16 attempts to land where the region's hazard exposure is above zero (anywhere when
   * regions are off); an area that finds no such spot is dropped.
   */
  placeStaticHazards(tick: number, terrain: RandomSource): void {
    const eco = this.ecology
    if (eco === null || this.hazards === null || !eco.hazardsOn) return
    const settings = this.config.ecology.hazards
    const { width, height } = this.config.environment
    for (let i = 0; i < settings.areaCount; i++) {
      for (let attempt = 0; attempt < HAZARD_PLACEMENT_ATTEMPTS; attempt++) {
        const spot =
          eco.clusters === null
            ? { x: terrain.float() * width, y: terrain.float() * height }
            : this.clusterPoint(terrain)
        const { x, y } = spot
        if (eco.regionsOn && !(eco.hazardExposure(x, y) > 0)) continue
        const hazard = this.hazards.add({
          kind: 'damage-area',
          x,
          y,
          radius: settings.areaRadius,
          damagePerSecond: settings.areaDamage,
          expiresAtTick: null
        })
        this.events.record({
          type: 'hazard-spawned',
          tick,
          hazardId: hazard.id,
          kind: hazard.kind,
          position: { x, y },
          radius: hazard.radius
        })
        break
      }
    }
  }

  private updateHazards(tick: number): void {
    const eco = this.ecology
    if (eco === null) return
    if (eco.seasonsOn && tick > 0) {
      const season = eco.seasonAt(tick)
      if (season !== null && season !== eco.seasonAt(tick - 1)) {
        this.events.record({ type: 'season-changed', tick, season })
      }
    }
    if (this.hazards === null || !eco.hazardsOn) return
    for (const hazard of this.hazards.removeExpired(tick)) {
      this.events.record({ type: 'hazard-expired', tick, hazardId: hazard.id, kind: hazard.kind })
    }
    const settings = this.config.ecology.hazards
    if (settings.stormRate > 0 && this.stormRandom !== null) {
      const dt = this.config.timestep
      this.stormAccumulator += settings.stormRate * eco.hazardIntensity(tick) * dt
      const count = Math.min(Math.floor(this.stormAccumulator), MAX_STORMS_PER_TICK)
      this.stormAccumulator -= count
      const { width, height } = this.config.environment
      for (let i = 0; i < count; i++) {
        const spot =
          eco.clusters === null
            ? { x: this.stormRandom.float() * width, y: this.stormRandom.float() * height }
            : this.clusterPoint(this.stormRandom)
        const { x, y } = spot
        const hazard = this.hazards.add({
          kind: 'storm',
          x,
          y,
          radius: settings.stormRadius,
          damagePerSecond: settings.stormDamage,
          expiresAtTick: tick + Math.ceil(settings.stormDuration / dt)
        })
        this.events.record({
          type: 'hazard-spawned',
          tick,
          hazardId: hazard.id,
          kind: hazard.kind,
          position: { x, y },
          radius: hazard.radius
        })
      }
    }
  }

  update(tick: number): void {
    this.time = tick * this.config.timestep
    this.updateHazards(tick)
    if (this.livingPerCluster !== null && this.ecology !== null && this.ecology.clusters !== null) {
      this.living = this.livingPerCluster()
      this.clearStrandedFood()
    }
    const regeneration = this.ecology === null ? 1 : this.ecology.regenerationScale(tick)
    this.spawnAccumulator += this.config.resources.spawnRate * this.config.timestep * regeneration
    const capacity = Math.max(0, this.config.resources.maxCount - this.resources.size)
    const toSpawn = Math.min(Math.floor(this.spawnAccumulator), capacity)
    this.spawnAccumulator -= toSpawn
    for (let i = 0; i < toSpawn; i++) this.spawnOne(tick)
  }
}
