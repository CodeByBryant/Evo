import { resolveWorldConfig } from '@evo/config'
import type { FounderPart, WorldConfigOverrides } from '@evo/contracts'

/**
 * The founder as it was before the eye got a field of view (ADR 0016 "Directional vision"): the
 * same body, with an eye that sees all round. Tests that are about something other than sight
 * (food visibility, Phase 3 pins, the ecology's range scaling) use it, so they keep measuring what
 * they were written to measure; the founder's own 135 degree cone is pinned in `anatomy/vision`.
 */
export const ALL_ROUND_FOUNDER: FounderPart[] = resolveWorldConfig({}).anatomy.founder.map(
  (part) =>
    part.type === 'eye'
      ? { ...part, orientation: 0, stats: [0.5, 0.5, 1, 0.5, 0.5, 0.5] }
      : { ...part }
)

/**
 * `anatomy` overrides that start a world with the founder plan itself rather than a drawn starting
 * body (ADR 0020). Tests about the founder, the Phase 3 pins and anything that reads "the body
 * every organism has" use it, so they keep measuring what they were written to measure.
 */
export const REFERENCE_START: WorldConfigOverrides = {
  anatomy: { startingBody: { mode: 'reference' } }
}

/** `anatomy` overrides giving a world the all-round founder (and starting with it). */
export const ALL_ROUND: WorldConfigOverrides = {
  anatomy: { founder: ALL_ROUND_FOUNDER, startingBody: { mode: 'reference' } }
}
