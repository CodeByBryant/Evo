import { mouthFormOf } from '@evo/contracts'
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
  for (const part of anatomy.parts) {
    if (part.type === 'mouth' && part.functional) {
      mouths.push({
        x: part.x / unit,
        y: part.y / unit,
        form: mouthFormOf(part.stats[2] as number)
      })
    }
  }
  known.set(genes, { config: config.anatomy, mouths })
  return mouths
}
