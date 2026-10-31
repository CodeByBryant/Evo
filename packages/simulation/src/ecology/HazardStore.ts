import type { HazardKind } from '@evo/contracts'

export interface HazardState {
  readonly id: number
  readonly kind: HazardKind
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly damagePerSecond: number
  /** The first tick at which the hazard no longer exists, or `null` for a permanent one. */
  readonly expiresAtTick: number | null
}

export type NewHazard = Omit<HazardState, 'id'>

/**
 * The active hazards in ascending id order, with their own id counter (hazard ids are independent
 * of entity and genome ids). Simulation state: storms appear and expire, so it is hashed.
 */
export class HazardStore {
  private readonly byId = new Map<number, HazardState>()
  private nextHazardId = 0

  /** The id the next hazard will receive. */
  get nextId(): number {
    return this.nextHazardId
  }

  get size(): number {
    return this.byId.size
  }

  add(hazard: NewHazard): HazardState {
    const state: HazardState = { id: this.nextHazardId, ...hazard }
    this.nextHazardId += 1
    this.byId.set(state.id, state)
    return state
  }

  /** The hazards in ascending id order (ids are allocated increasing and a `Map` keeps insertion order). */
  values(): HazardState[] {
    return Array.from(this.byId.values())
  }

  /** Removes and returns hazards whose expiry tick has been reached, in ascending id order. */
  removeExpired(tick: number): HazardState[] {
    const expired: HazardState[] = []
    for (const hazard of this.byId.values()) {
      if (hazard.expiresAtTick !== null && hazard.expiresAtTick <= tick) expired.push(hazard)
    }
    for (const hazard of expired) this.byId.delete(hazard.id)
    return expired
  }
}
