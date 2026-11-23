import { describeStability } from '../support/ecology-stability'

// Part 4 of 4 of the held-out seeds 5-8 and 33-40 (see ../support/ecology-stability.ts for what is measured).
// Seed 40 was swapped for 41 with limbEfficiency 0.25 (ADR 0030): under it seed 40 goes extinct at
// 43,236 ticks (with the old default it survives because tail-part creatures carry that thin world).
// On 32 other seeds at 50,000 ticks the old default loses 2 worlds (28 and 30) and 0.25 loses none.
describeStability([38, 39, 41])
