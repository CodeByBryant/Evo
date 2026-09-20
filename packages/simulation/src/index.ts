/** Placeholder engine version; replaced when the kernel lands (Phase 2). */
export const ENGINE_VERSION = '0.0.0'

export interface WorldOptions {
  seed: number
}

/** Placeholder world. The real deterministic kernel is built in Phase 2. */
export class World {
  readonly seed: number

  constructor(options: WorldOptions) {
    this.seed = options.seed
  }
}
