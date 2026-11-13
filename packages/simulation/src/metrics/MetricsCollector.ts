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
  private deathsByDamage = 0
  private deathsByPredation = 0
  private predationBites = 0
  private resourcesSpawned = 0
  private resourcesConsumed = 0
  private reproductionAttempts = 0
  private reproductionSuccesses = 0
  private reproductionFailures = 0
  private energyConsumed = 0
  private energyWasted = 0
  private damageTaken = 0
  private eggsLaid = 0
  private eggsHatched = 0
  private eggsEaten = 0
  private clutchesLost = 0
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
              this.deathsByDamage += 1
              break
            case 'predation':
              this.deathsByPredation += 1
              break
            case 'environment':
              // Never produced: heat and storms are damage (docs/ecology/ecology.md).
              break
          }
          break
        case 'resource-spawned':
          this.resourcesSpawned += 1
          break
        case 'resource-bitten':
          // Energy that entered a gut; what a poor mouth could not use is lost.
          this.energyConsumed += event.intake
          this.energyWasted += Math.max(0, event.chunk - event.intake)
          break
        case 'organism-bitten':
          // Energy moved between creatures; it enters a gut, and the rest is the trophic loss.
          this.predationBites += 1
          this.energyConsumed += event.intake
          this.energyWasted += Math.max(0, event.energyTaken - event.intake)
          break
        case 'resource-consumed':
          this.resourcesConsumed += 1
          this.energyConsumed += event.energyGained
          this.energyWasted += event.energyWasted
          break
        case 'reproduction-attempted':
          this.reproductionAttempts += 1
          if (event.succeeded) this.reproductionSuccesses += 1
          else this.reproductionFailures += 1
          break
        case 'organism-damaged':
          this.damageTaken += event.amount
          break
        case 'egg-laid':
          this.eggsLaid += 1
          break
        case 'egg-hatched':
          this.eggsHatched += 1
          break
        case 'egg-eaten':
          this.eggsEaten += 1
          this.energyConsumed += event.intake
          this.energyWasted += Math.max(0, event.energyTaken - event.intake)
          break
        case 'clutch-lost':
          this.clutchesLost += 1
          break
        case 'egg-guarded':
        case 'organism-moved':
        case 'energy-changed':
        case 'season-changed':
        case 'hazard-spawned':
        case 'hazard-expired':
          break
      }
    }
  }

  /**
   * Records the active population for this tick. `extinctionTick` is set the first time the
   * population reaches zero and is never cleared: reproduction always requires at least one
   * existing organism as a parent, so a population of zero can never produce more, under any
   * extinction policy this engine implements.
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
      deathsByDamage: this.deathsByDamage,
      deathsByPredation: this.deathsByPredation,
      predationBites: this.predationBites,
      resourcesSpawned: this.resourcesSpawned,
      resourcesConsumed: this.resourcesConsumed,
      reproductionAttempts: this.reproductionAttempts,
      reproductionSuccesses: this.reproductionSuccesses,
      reproductionFailures: this.reproductionFailures,
      energyConsumed: this.energyConsumed,
      energyWasted: this.energyWasted,
      damageTaken: this.damageTaken,
      eggsLaid: this.eggsLaid,
      eggsHatched: this.eggsHatched,
      eggsEaten: this.eggsEaten,
      clutchesLost: this.clutchesLost
    }
  }
}
