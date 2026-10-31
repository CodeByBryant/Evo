import type { WorldConfig } from '@evo/contracts'
import type { IdGenerator } from '../entities/IdGenerator'
import type { ResourceState, ResourceStore } from '../entities/ResourceStore'
import type { EcologyModel } from '../ecology/EcologyModel'
import type { HazardStore } from '../ecology/HazardStore'
import type { EventLog } from '../events/EventLog'
import type { RandomSource } from '../random/RandomSource'
import type { SeededRandom } from '../random/SeededRandom'

/** Attempts to find a position a kind can grow in before a spawn is dropped. */
const PLACEMENT_ATTEMPTS = 8
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
    private readonly stormRandom: RandomSource | null = null
  ) {}

  /** The carried fractional resource spawn; hashed, since it decides future spawns. */
  get spawnRemainder(): number {
    return this.spawnAccumulator
  }

  /** The carried fractional storm spawn; hashed for the same reason. */
  get stormRemainder(): number {
    return this.stormAccumulator
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
    if (eco !== null && eco.kindsOn) {
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
        const x = terrain.float() * width
        const y = terrain.float() * height
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
        const x = this.stormRandom.float() * width
        const y = this.stormRandom.float() * height
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
    this.updateHazards(tick)
    const regeneration = this.ecology === null ? 1 : this.ecology.regenerationScale(tick)
    this.spawnAccumulator += this.config.resources.spawnRate * this.config.timestep * regeneration
    const capacity = Math.max(0, this.config.resources.maxCount - this.resources.size)
    const toSpawn = Math.min(Math.floor(this.spawnAccumulator), capacity)
    this.spawnAccumulator -= toSpawn
    for (let i = 0; i < toSpawn; i++) this.spawnOne(tick)
  }
}
