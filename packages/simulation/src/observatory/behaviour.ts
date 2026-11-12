import { effectiveTypes, meanPairwise, unit } from './stats'

/** The kinds of food a creature can take energy from (ADR 0024). */
export type IntakeKind = 'plant' | 'flesh' | 'carrion'

/** Descriptor dimensions, in order. All are in `[0, 1]`. */
export const BEHAVIOUR_DIMENSIONS = [
  'speed',
  'turn',
  'rest',
  'plant',
  'flesh',
  'carrion',
  'bite',
  'range'
] as const
export const BEHAVIOUR_SIZE = BEHAVIOUR_DIMENSIONS.length

/** How quickly a motion average forgets (per observation). */
export const BEHAVIOUR_ALPHA = 0.1
/** Below this share of top speed a creature counts as resting. */
const REST_SPEED = 0.05
/** Bites a second that read as 1 (a creature biting every cooldown). */
const BITE_RATE_SCALE = 2.5

interface Ledger {
  speed: number
  turn: number
  rest: number
  seen: number
  plant: number
  flesh: number
  carrion: number
  bites: number
  seconds: number
  startX: number
  startY: number
  farthest: number
}

/**
 * What each living creature has been **doing** (ADR 0024), in a few numbers a person can read: how
 * fast and how much it turns and rests (running averages, so recent behaviour counts), where its
 * energy comes from (lifetime shares of plants, flesh and carrion), how often it bites, and how far
 * it has ranged from where it was first seen. Hand-picked on purpose; diversity is relative to them.
 * Pure bookkeeping: the recorder feeds it and it never reaches the simulation.
 */
export class BehaviourLedger {
  private readonly ledgers = new Map<number, Ledger>()

  /** `rangeScale`: the distance that reads as 1 for ranging (half the world). */
  constructor(private readonly rangeScale: number) {}

  get size(): number {
    return this.ledgers.size
  }

  observeMotion(
    id: number,
    speedFraction: number,
    turnFraction: number,
    x: number,
    y: number,
    seconds: number
  ): void {
    let ledger = this.ledgers.get(id)
    if (ledger === undefined) {
      ledger = {
        speed: unit(speedFraction),
        turn: unit(turnFraction),
        rest: speedFraction < REST_SPEED ? 1 : 0,
        seen: 0,
        plant: 0,
        flesh: 0,
        carrion: 0,
        bites: 0,
        seconds: 0,
        startX: x,
        startY: y,
        farthest: 0
      }
      this.ledgers.set(id, ledger)
    } else {
      const a = BEHAVIOUR_ALPHA
      ledger.speed += a * (unit(speedFraction) - ledger.speed)
      ledger.turn += a * (unit(turnFraction) - ledger.turn)
      ledger.rest += a * ((speedFraction < REST_SPEED ? 1 : 0) - ledger.rest)
    }
    ledger.seen += 1
    ledger.seconds += seconds
    const dx = x - ledger.startX
    const dy = y - ledger.startY
    const away = Math.sqrt(dx * dx + dy * dy)
    if (away > ledger.farthest) ledger.farthest = away
  }

  recordIntake(id: number, kind: IntakeKind, energy: number): void {
    const ledger = this.ledgers.get(id)
    if (ledger === undefined || energy <= 0) return
    ledger[kind] += energy
  }

  recordBite(id: number): void {
    const ledger = this.ledgers.get(id)
    if (ledger !== undefined) ledger.bites += 1
  }

  forget(id: number): void {
    this.ledgers.delete(id)
  }

  /** The descriptor of one creature, or `undefined` if it has not been seen yet. */
  descriptor(id: number): number[] | undefined {
    const l = this.ledgers.get(id)
    if (l === undefined) return undefined
    const total = l.plant + l.flesh + l.carrion
    const share = (energy: number): number => (total === 0 ? 0 : energy / total)
    return [
      l.speed,
      l.turn,
      l.rest,
      share(l.plant),
      share(l.flesh),
      share(l.carrion),
      l.seconds === 0 ? 0 : unit(l.bites / l.seconds / BITE_RATE_SCALE),
      this.rangeScale <= 0 ? 0 : unit(l.farthest / this.rangeScale)
    ]
  }

  /** Total energy taken in by every creature still here, by kind. */
  intakeTotals(): Record<IntakeKind, number> {
    const totals: Record<IntakeKind, number> = { plant: 0, flesh: 0, carrion: 0 }
    for (const l of this.ledgers.values()) {
      totals.plant += l.plant
      totals.flesh += l.flesh
      totals.carrion += l.carrion
    }
    return totals
  }
}

/** A descriptor's discretised identity (three bins a dimension), for counting behavioural types. */
export function behaviourSignature(descriptor: readonly number[]): string {
  return descriptor.map((v) => (v < 1 / 3 ? 0 : v < 2 / 3 ? 1 : 2)).join('')
}

export interface BehaviourDiversity {
  /** Effective number of behavioural types (inverse Simpson over the signatures). */
  readonly types: number
  /** Mean pairwise Euclidean distance between descriptors, over the largest possible distance. */
  readonly spread: number
}

export function behaviourDiversity(
  descriptors: readonly (readonly number[])[]
): BehaviourDiversity {
  const counts = new Map<string, number>()
  for (const d of descriptors) {
    const key = behaviourSignature(d)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const spread = meanPairwise(descriptors, (a, b) => {
    let squared = 0
    for (let i = 0; i < a.length; i++) {
      const d = (a[i] as number) - (b[i] as number)
      squared += d * d
    }
    return Math.sqrt(squared / a.length)
  })
  return { types: effectiveTypes(counts.values()), spread }
}
