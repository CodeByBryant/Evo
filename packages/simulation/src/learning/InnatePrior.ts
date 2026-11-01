import type { BrainArchitecture } from '@evo/contracts'
import { brainLayoutOf } from './BrainLayout'
import type { BrainLayout } from './BrainLayout'

/** Hidden units the template needs: two steering units and three presence units. */
export const INNATE_PRIOR_MIN_HIDDEN = 5

// Observation indices the template reads.
const FOOD_PRESENT = 8
const FOOD_BEARING_COS = 9
const FOOD_BEARING_SIN = 10
// The nearest eligible partner, seen only while the organism is itself ready (ADR 0010).
const MATE_PRESENT = 33
const MATE_BEARING_COS = 34
const MATE_BEARING_SIN = 35
const MATE_STEER = 3
const MATE_THRUST = 20

// Output indices.
const THRUST = 0
const TURN = 1
const INTERACT = 3

/**
 * The innate prior (ADR 0007): a hand-wired brain that approximates the Phase 4 forager, so a
 * world of founders behaves sensibly before any selection or learning has happened. All other
 * weights are zero; founders add small Gaussian noise on top (see `GenomeFactory`).
 *
 * - Two steering units compute `softsign(5 sin(bearing) + 0.25 (present - cos(bearing)))`: they
 *   saturate toward the side the food is on, and lean left when it is directly behind. Each
 *   drives `turn` with weight 3.
 * - Three presence units compute `softsign(20 present)` and each drives `thrust` with weight 3.
 * - `thrust` has bias 1 (half speed with nothing in sight, as the reflex wanderer); `interact`
 *   has bias 2, so the organism always tries to eat; `strafe` and `explore` start neutral.
 *
 * Wandering is not wired: with nothing in sight the organism drifts forward and exploration
 * noise supplies the heading jitter.
 */
export function innatePriorWeights(architecture: BrainArchitecture): number[] {
  const layout: BrainLayout = brainLayoutOf(architecture)
  const { inputSize, hiddenSize } = architecture
  if (hiddenSize < INNATE_PRIOR_MIN_HIDDEN) {
    throw new RangeError(
      `the innate prior needs at least ${INNATE_PRIOR_MIN_HIDDEN} hidden units, got ${hiddenSize}`
    )
  }
  const weights = new Array<number>(layout.total).fill(0)
  const input = (hidden: number, index: number, value: number): void => {
    weights[layout.inputToHidden.offset + hidden * inputSize + index] = value
  }
  for (const steering of [0, 1]) {
    input(steering, FOOD_BEARING_SIN, 5)
    input(steering, FOOD_PRESENT, 0.25)
    input(steering, FOOD_BEARING_COS, -0.25)
  }
  for (const presence of [2, 3, 4]) input(presence, FOOD_PRESENT, 20)
  // Mate seeking (ADR 0010): the same two steering units also turn toward an eligible partner,
  // and the first presence unit drives thrust. The mate slots are zero unless this organism is
  // itself ready and a ready partner is in range, so these terms never pull a forager off food.
  for (const steering of [0, 1]) {
    input(steering, MATE_BEARING_SIN, MATE_STEER)
    input(steering, MATE_PRESENT, MATE_STEER * 0.05)
    input(steering, MATE_BEARING_COS, -MATE_STEER * 0.05)
  }
  input(2, MATE_PRESENT, MATE_THRUST)

  const output = (out: number, hidden: number, value: number): void => {
    weights[layout.hiddenToOutput.offset + out * hiddenSize + hidden] = value
  }
  for (const steering of [0, 1]) output(TURN, steering, 3)
  for (const presence of [2, 3, 4]) output(THRUST, presence, 3)
  weights[layout.outputBias.offset + THRUST] = 1
  weights[layout.outputBias.offset + INTERACT] = 2
  return weights
}
