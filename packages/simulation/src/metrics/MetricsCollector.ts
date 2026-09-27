import type { MetricsSnapshot, WorldEvent } from '@evo/contracts'

/**
 * Derives counters purely from events, never from direct calls by other systems - the "metrics"
 * stage in docs/simulation/update-order.md is the only writer of this state, reading only the
 * events emitted during the tick just processed.
 */
export class MetricsCollector {
  private organismsBorn = 0
  private deathsByStarvation = 0
  private deathsByAge = 0
  private resourcesSpawned = 0
  private resourcesConsumed = 0
  private energyConsumed = 0
  private energyWasted = 0
  private extinctTick: number | null = null

  /** Folds one tick's events into the running counters. */
  recordEvents(events: readonly WorldEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'organism-born':
          this.organismsBorn += 1
          break
        case 'organism-died':
          switch (event.cause) {
            case 'starvation':
              this.deathsByStarvation += 1
              break
            case 'age':
              this.deathsByAge += 1
              break
            case 'damage':
            case 'environment':
              // Not produced by the Phase 2 engine; no counters exist for them yet.
              break
          }
          break
        case 'resource-spawned':
          this.resourcesSpawned += 1
          break
        case 'resource-consumed':
          this.resourcesConsumed += 1
          this.energyConsumed += event.energyGained
          this.energyWasted += event.energyWasted
          break
        case 'organism-moved':
        case 'energy-changed':
        case 'reproduction-attempted':
          break
      }
    }
  }

  /**
   * Records the active population for this tick. `extinctionTick` is set the first time the
   * population reaches zero and is never cleared: the Phase 2 engine has no way to create an
   * organism outside of `World.create`, so population can only ever fall, never recover.
   */
  updatePopulation(activeCount: number, tick: number): void {
    if (activeCount === 0 && this.extinctTick === null) {
      this.extinctTick = tick
    }
  }

  get extinctionTick(): number | null {
    return this.extinctTick
  }

  snapshot(): MetricsSnapshot {
    return {
      organismsBorn: this.organismsBorn,
      deathsByStarvation: this.deathsByStarvation,
      deathsByAge: this.deathsByAge,
      resourcesSpawned: this.resourcesSpawned,
      resourcesConsumed: this.resourcesConsumed,
      energyConsumed: this.energyConsumed,
      energyWasted: this.energyWasted
    }
  }
}
