import type { WorldConfigOverrides } from '@evo/contracts'
import { FREE_FOOD } from './food'

/**
 * The world's economy as it was before the population tuning (docs/decisions/0018): the 600 s
 * lifespan, breeding every 30 s at 60 energy, and the gene ranges they sat in
 * (mutation size follows the range width, so a pin that mutates needs the old ranges as well).
 * Tests that pin Phase 3 numbers spread this into their config so they keep describing Phase 3,
 * which starts every world with the one founder body (ADR 0020), not a drawn starting body.
 */
export const PHASE3_ECONOMY: WorldConfigOverrides = {
  ...FREE_FOOD,
  anatomy: { startingBody: { mode: 'reference' } },
  organisms: { maxAge: 600, senescenceAge: 510 },
  reproduction: { minEnergy: 60, cooldown: 30 },
  genetics: {
    genes: {
      'physical.senescenceAge': { min: 255, max: 560 },
      'physical.maxAge': { min: 570, max: 1200 },
      'reproduction.minEnergy': { min: 40, max: 90 },
      'reproduction.cooldown': { min: 15, max: 60 }
    }
  } as NonNullable<WorldConfigOverrides['genetics']>
}
