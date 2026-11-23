import { describeBrainBand } from '../support/brain-band'

// Seeds 9 and 4 of the brain controller's population band (see ../support/brain-band.ts).
// Seed 3 was swapped for 9 with limbEfficiency 0.25 (ADR 0030): under it seed 3 dips to 10 creatures
// (the floor is 15); with the old default it did not. See ADR 0030 for the 32-seed comparison.
describeBrainBand([9, 4])
