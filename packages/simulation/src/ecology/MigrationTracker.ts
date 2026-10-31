import type { EntityId, MigrationSummary, RegionType } from '@evo/contracts'

/** What the death stage needs from the tracker; `NO_MIGRATION` is the do-nothing implementation. */
export interface MigrationRecorder {
  /** The organism's migration summary, forgetting it; `null` when it was never tracked. */
  finish(organismId: EntityId): MigrationSummary | null
}

export const NO_MIGRATION: MigrationRecorder = { finish: () => null }

interface Entry {
  homeRegion: number
  homeType: RegionType
  currentRegion: number
  currentType: RegionType
  crossings: number
  distanceOutsideHome: number
  /** Seconds continuously spent outside the home region. */
  outsideTime: number
  migrated: boolean
  lastX: number
  lastY: number
}

/**
 * Records how organisms move between regions (roadmap 6.9, docs/ecology/ecology.md): the region
 * each was first seen in is its home, and it counts as having migrated once it has spent
 * `dwellTime` seconds continuously in some other region. A derived record, not simulation state:
 * nothing reads it to decide what happens next, so it is not hashed (the same policy as lineage
 * and species). Written only by `MigrationSystem`; read by `World` and the death stage.
 */
export class MigrationTracker implements MigrationRecorder {
  private readonly entries = new Map<EntityId, Entry>()

  constructor(private readonly dwellTime: number) {}

  /** Number of organisms currently tracked. */
  get size(): number {
    return this.entries.size
  }

  /** Records an organism's position and region for this tick. */
  observe(
    organismId: EntityId,
    x: number,
    y: number,
    region: number,
    type: RegionType,
    dt: number
  ): void {
    const entry = this.entries.get(organismId)
    if (entry === undefined) {
      this.entries.set(organismId, {
        homeRegion: region,
        homeType: type,
        currentRegion: region,
        currentType: type,
        crossings: 0,
        distanceOutsideHome: 0,
        outsideTime: 0,
        migrated: false,
        lastX: x,
        lastY: y
      })
      return
    }
    if (region !== entry.currentRegion) {
      entry.crossings += 1
      entry.currentRegion = region
      entry.currentType = type
    }
    if (region !== entry.homeRegion) {
      entry.distanceOutsideHome += Math.sqrt(
        (x - entry.lastX) * (x - entry.lastX) + (y - entry.lastY) * (y - entry.lastY)
      )
      entry.outsideTime += dt
      if (entry.outsideTime >= this.dwellTime) entry.migrated = true
    } else {
      entry.outsideTime = 0
    }
    entry.lastX = x
    entry.lastY = y
  }

  summary(organismId: EntityId): MigrationSummary | undefined {
    const entry = this.entries.get(organismId)
    return entry === undefined ? undefined : toSummary(entry)
  }

  finish(organismId: EntityId): MigrationSummary | null {
    const entry = this.entries.get(organismId)
    if (entry === undefined) return null
    this.entries.delete(organismId)
    return toSummary(entry)
  }
}

const toSummary = (entry: Entry): MigrationSummary => ({
  homeRegion: entry.homeRegion,
  homeType: entry.homeType,
  currentRegion: entry.currentRegion,
  currentType: entry.currentType,
  crossings: entry.crossings,
  distanceOutsideHome: entry.distanceOutsideHome,
  migrated: entry.migrated
})
