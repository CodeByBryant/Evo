import type { WorldConfigOverrides } from '@evo/contracts'
import { PHASE3_ECONOMY } from './phase3'

// The pre-tuning economy (ADR 0018): this is a stress test of body genes, which the restrained
// breeding of the default economy does not survive at these mutation rates.
export const BUSY: WorldConfigOverrides = {
  ...PHASE3_ECONOMY,
  anatomy: {
    enabled: true,
    // These pin the founder body's behaviour (ADR 0020), not a drawn starting body.
    startingBody: { mode: 'reference' as const },
    // A stress rate, not a default. Each slot now carries 14 genes (ADR 0016) against 9 before, so
    // the old 0.2 mutated about 50% more genes per birth and drove most seeds extinct (seeds 22 to
    // 24 at 0.2: only 24 survives; at 0.12, seeds 22 to 26: only 22 and 25 survive). Seed 22 is pinned because it
    // survives 50,000 ticks with 18 distinct plans among 19 organisms.
    mutation: { presenceRate: 0.05, typeRate: 0.05, continuousRate: 0.12, visualRate: 0.2 }
  },
  genetics: { ...PHASE3_ECONOMY.genetics, mutationRateScale: 2 }
}
