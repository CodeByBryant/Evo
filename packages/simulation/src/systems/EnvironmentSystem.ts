import type { WorldConfig } from '@evo/contracts'
import type { IdGenerator } from '../entities/IdGenerator'
import type { ResourceState, ResourceStore } from '../entities/ResourceStore'
import type { EventLog } from '../events/EventLog'
import type { SeededRandom } from '../random/SeededRandom'

/**
 * Spawns resources. Owns the resource store's population growth and the fractional spawn
 * accumulator (docs/simulation/update-order.md, stage 2): `spawnRate * timestep` new resources
 * are expected per tick, and the fractional remainder carries deterministically to later ticks.
 */
export class EnvironmentSystem {
  private spawnAccumulator = 0

  constructor(
    private readonly config: WorldConfig,
    private readonly resources: ResourceStore,
    private readonly ids: IdGenerator,
    private readonly random: SeededRandom,
    private readonly events: EventLog
  ) {}

  private spawnOne(tick: number): void {
    const id = this.ids.allocate()
    const x = this.random.float() * this.config.environment.width
    const y = this.random.float() * this.config.environment.height
    const resource: ResourceState = { id, x, y, remaining: this.config.resources.energyValue }
    this.resources.add(resource)
    this.events.record({ type: 'resource-spawned', tick, resourceId: id, position: { x, y } })
  }

  /** Spawns the initial population at world creation. Called once, at tick 0, from `World`. */
  spawnInitial(tick: number): void {
    for (let i = 0; i < this.config.resources.initialCount; i++) this.spawnOne(tick)
  }

  update(tick: number): void {
    this.spawnAccumulator += this.config.resources.spawnRate * this.config.timestep
    const capacity = Math.max(0, this.config.resources.maxCount - this.resources.size)
    const toSpawn = Math.min(Math.floor(this.spawnAccumulator), capacity)
    this.spawnAccumulator -= toSpawn
    for (let i = 0; i < toSpawn; i++) this.spawnOne(tick)
  }
}
