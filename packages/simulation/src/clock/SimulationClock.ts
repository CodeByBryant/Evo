/** Read-only view of the clock, as exposed in snapshots and events. */
export interface ClockState {
  readonly tick: number
  /** Simulated seconds: `tick * deltaTime`. */
  readonly time: number
  readonly deltaTime: number
}

/**
 * Fixed-timestep simulation time.
 *
 * `tick` counts steps and only ever increases by exactly one. `time` is always computed as
 * `tick * deltaTime` (never accumulated), so it carries no drift and depends on nothing but the
 * tick. No wall-clock source is read anywhere.
 */
export class SimulationClock implements ClockState {
  readonly deltaTime: number
  private currentTick = 0

  constructor(deltaTime: number) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      throw new RangeError('deltaTime must be a finite number greater than zero')
    }
    this.deltaTime = deltaTime
  }

  get tick(): number {
    return this.currentTick
  }

  get time(): number {
    return this.currentTick * this.deltaTime
  }

  /** Advances exactly one tick. */
  advance(): void {
    if (this.currentTick >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError('tick counter exhausted')
    }
    this.currentTick += 1
  }

  /** Restores a previously saved tick (used by load); ticks never move backwards during a run. */
  restore(tick: number): void {
    if (!Number.isSafeInteger(tick) || tick < 0) {
      throw new RangeError('tick must be a nonnegative safe integer')
    }
    this.currentTick = tick
  }

  state(): ClockState {
    return { tick: this.tick, time: this.time, deltaTime: this.deltaTime }
  }
}
