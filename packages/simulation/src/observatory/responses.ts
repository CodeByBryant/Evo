import { ACTION_SIZE } from '@evo/contracts'
import { forwardHidden, readOutput } from '../learning/Brain'
import type { BrainLayout } from '../learning/BrainLayout'
import { buildObservation } from '../learning/ObservationBuilder'
import type { ObservationInput, Sighting } from '../learning/ObservationBuilder'
import { effectiveTypes, meanPairwise } from './stats'

/**
 * How brains **respond**, not what they happened to do (ADR 0024). Realised behaviour (speed, turning,
 * where a creature went) is mostly luck and circumstance: a world with mutation switched off already
 * shows nine effective types of it, so it cannot say whether evolution is making creatures behave
 * differently. A fixed battery of situations can: every brain is shown the same few, with empty
 * memory, and what it decides to do (thrust, turn, interact) is recorded. Two creatures differ here
 * only if their genes do, so the spread is a heritable behavioural diversity, and it rises when
 * mutation makes brains respond differently and stays put when it does not.
 */

const BASE: ObservationInput = {
  energy: 0.5,
  age: 0.3,
  x: 250,
  y: 250,
  vx: 0,
  vy: 0,
  heading: 0,
  maxSpeed: 20,
  sensorRadius: 60,
  worldWidth: 500,
  worldHeight: 500,
  food: null,
  peer: null,
  timeSinceFood: 0.3,
  previousReward: 0,
  previousAction: [0, 0, 0, 0, 0]
}

const at = (dx: number, dy: number): Sighting => ({ dx, dy, distanceSquared: dx * dx + dy * dy })

/** The situations, each described by what is different from "nothing in sight". */
export const RESPONSE_BATTERY: readonly ObservationInput[] = [
  BASE,
  { ...BASE, food: at(30, 18) },
  { ...BASE, food: at(40, -25) },
  { ...BASE, energy: 0.15, timeSinceFood: 0.9, food: at(45, 0) },
  { ...BASE, prey: at(35, 10) },
  { ...BASE, threat: at(25, -12) },
  { ...BASE, food: at(30, 18), threat: at(-20, 5) },
  { ...BASE, peer: at(30, 0) }
]

/** The action values read for each situation: thrust, turn and interact. */
const READ = [0, 1, 3] as const
export const RESPONSE_SIZE = RESPONSE_BATTERY.length * READ.length

/** One brain's responses to the whole battery, each value in `[-1, 1]`. */
export function responseVector(weights: readonly number[], layout: BrainLayout): number[] {
  const learned = weights.slice(layout.learnOffset)
  const memory = new Array<number>(layout.architecture.memorySize).fill(0)
  const out: number[] = []
  for (const situation of RESPONSE_BATTERY) {
    const { hidden } = forwardHidden(layout, weights, buildObservation(situation), memory)
    const action = readOutput(layout, learned, hidden)
    if (action.length !== ACTION_SIZE) throw new RangeError('unexpected action size')
    for (const index of READ) out.push(action[index] as number)
  }
  return out
}

/** A response's discretised identity (three bins a value), for counting types. */
export function responseSignature(response: readonly number[]): string {
  return response.map((v) => (v < -1 / 3 ? 0 : v < 1 / 3 ? 1 : 2)).join('')
}

export interface ResponseDiversity {
  /** Effective number of distinct response patterns (inverse Simpson over the signatures). */
  readonly types: number
  /** Mean pairwise root-mean-square difference of the responses, over its largest possible value (2). */
  readonly spread: number
}

export function responseDiversity(
  responses: readonly (readonly number[])[],
  cap = 100
): ResponseDiversity {
  const counts = new Map<string, number>()
  for (const r of responses) {
    const key = responseSignature(r)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const spread = meanPairwise(
    responses,
    (a, b) => {
      let squared = 0
      for (let i = 0; i < a.length; i++) {
        const d = (a[i] as number) - (b[i] as number)
        squared += d * d
      }
      return Math.sqrt(squared / a.length) / 2
    },
    cap
  )
  return { types: effectiveTypes(counts.values()), spread }
}
