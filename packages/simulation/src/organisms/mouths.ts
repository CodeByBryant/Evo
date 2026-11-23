import { mouthFormOf, scavengerFromOf } from '@evo/contracts'
import type { Genome, MouthForm, WorldConfig } from '@evo/contracts'
import { developAnatomy } from '../development/develop'

/** Where a working mouth sits on the body, in body radii (x forward, y left). */
export interface MouthPoint {
  readonly x: number
  readonly y: number
  /** The mouth's form (ADR 0017): what it can eat, and whether it bites creatures (ADR 0023). */
  readonly form: MouthForm
}

const known = new WeakMap<
  readonly number[],
  { readonly config: object; readonly mouths: readonly MouthPoint[] }
>()

/**
 * The working mouths of a body (ADR 0017), in slot order. A mouth is where food is bitten, not the
 * whole body. Positions are in units of the body radius, so the caller scales them by the
 * organism's current radius (a juvenile is smaller). Remembered per body-gene array.
 */
export function mouthsOf(genome: Genome, config: WorldConfig): readonly MouthPoint[] {
  const genes = genome.body.genes
  const cached = known.get(genes)
  if (cached !== undefined && cached.config === config.anatomy) return cached.mouths
  const anatomy = developAnatomy(genes, config.anatomy)
  const unit = anatomy.outline.areaRadius
  const mouths: MouthPoint[] = []
  const cap = config.anatomy.effects.maxMouthOffset
  for (const part of anatomy.parts) {
    if (part.type === 'mouth' && part.functional) {
      let x = part.x / unit
      let y = part.y / unit
      // A mouth hung on a tail sits far out; the bite is taken no farther than the cap (ADR 0029).
      const distance = Math.sqrt(x * x + y * y)
      if (cap > 0 && distance > cap) {
        x = (x / distance) * cap
        y = (y / distance) * cap
      }
      mouths.push({
        x,
        y,
        form: mouthFormOf(part.stats[2] as number, scavengerFromOf(config.anatomy))
      })
    }
  }
  known.set(genes, { config: config.anatomy, mouths })
  return mouths
}
