import type { WorldState } from '../../src/world/WorldState'
import type { World } from '../../src/world/World'

/**
 * Forking a world for an experiment (docs/development.md, "Probe budgets"). Arms of an experiment
 * that differ in a lever are bit-identical until the first body the lever could touch exists, so the
 * shared start is run once and each arm continues from a checkpoint of it.
 *
 * `runToFork` runs a control world, checking every new body (founders, newborns and hatchlings) with
 * `relevant`; it keeps a checkpoint every `every` ticks while none has been relevant, and stops at the
 * first relevant body. The returned checkpoint is therefore a state in which **no body has yet been one
 * the lever could touch**, so restoring it into a world with the lever on gives exactly the world that
 * had the lever on from the start (the proof is `tests/world/save-restore.test.ts`).
 */
export interface Fork {
  /** The latest checkpoint taken while nothing relevant had existed; `null` if a founder was relevant. */
  readonly checkpoint: WorldState | null
  /** The tick of that checkpoint. */
  readonly tick: number
  /** The tick the first relevant body appeared, or `null` if none did by `until`. */
  readonly firedAt: number | null
}

export function runToFork(
  world: World,
  options: {
    until: number
    every: number
    /** Whether the body of this creature is one the lever could change. */
    relevant: (world: World, organismId: number) => boolean
  }
): Fork {
  const { until, every, relevant } = options
  for (const o of world.snapshot().organisms) {
    if (relevant(world, o.id)) return { checkpoint: null, tick: 0, firedAt: 0 }
  }
  let checkpoint: WorldState = world.saveState()
  let checkpointTick = 0
  for (let tick = 1; tick <= until; tick++) {
    world.step()
    for (const event of world.events.eventsThisTick()) {
      if (event.type === 'organism-born' && relevant(world, event.organismId)) {
        return { checkpoint, tick: checkpointTick, firedAt: tick }
      }
    }
    if (tick % every === 0) {
      checkpoint = world.saveState()
      checkpointTick = tick
    }
  }
  return { checkpoint, tick: checkpointTick, firedAt: null }
}

/** Whether a creature has a part hung on another part: the bodies the limb levers (ADR 0029) can change. */
export function hasLimb(world: World, organismId: number): boolean {
  const view = world.anatomyOf(organismId)
  return view !== undefined && view.anatomy.parts.some((part) => part.parent >= 0)
}

/**
 * Whether a creature has a working mouth hung on another part: the only bodies `maxMouthOffset` can change
 * (it clamps a mouth's bite point and nothing else), so a fork for an arm that differs only in that
 * lever can run much longer than one for the levers that touch any hung part.
 */
export function hasLimbMouth(world: World, organismId: number): boolean {
  const view = world.anatomyOf(organismId)
  return (
    view !== undefined &&
    view.anatomy.parts.some((part) => part.type === 'mouth' && part.functional && part.parent >= 0)
  )
}
