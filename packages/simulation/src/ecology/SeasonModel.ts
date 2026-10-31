import { SEASONS } from '@evo/contracts'
import type { Season, SeasonsConfig } from '@evo/contracts'

/**
 * The seasons are a pure function of the clock: `floor(time / seasonLength) mod 4`. There is no
 * state and no randomness (docs/ecology/ecology.md).
 */
export class SeasonModel {
  private readonly yearLength: number

  constructor(
    private readonly config: Pick<SeasonsConfig, 'seasonLength'>,
    private readonly timestep: number
  ) {
    this.yearLength = 4 * config.seasonLength
  }

  /** Index of the season (into `SEASONS`) at `tick`. */
  indexAt(tick: number): number {
    return Math.floor((tick * this.timestep) / this.config.seasonLength) % 4
  }

  seasonAt(tick: number): Season {
    return SEASONS[this.indexAt(tick)] as Season
  }

  /** Position within the year, in `[0, 1)`. */
  yearPhase(tick: number): number {
    return ((tick * this.timestep) % this.yearLength) / this.yearLength
  }
}
