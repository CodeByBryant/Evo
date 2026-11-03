import { REGION_TYPES, SEASONS } from '@evo/contracts'
import type {
  RegionType,
  RegionTypeConfig,
  Season,
  SeasonConfig,
  WorldConfig
} from '@evo/contracts'
import type { ClusterLayout } from './ClusterLayout'
import type { Terrain } from './Terrain'
import { SeasonModel } from './SeasonModel'

/** What a resource of one kind is worth and how it behaves, with the baseline already applied. */
export interface KindProperties {
  readonly name: string
  readonly energy: number
  readonly radius: number
  readonly spawnWeight: number
  readonly detectability: number
  readonly toxicity: number
  /** Region types it grows in; empty means everywhere. */
  readonly regions: readonly RegionType[]
}

/**
 * The read-only facade systems use to ask the environment questions: how fast, how far can I see,
 * how warm, how dangerous, how fertile (docs/ecology/ecology.md). Every answer is a pure function
 * of the config, the (static) region map and the tick, and is the neutral value (1 for a
 * multiplier, 0 for an offset) when the corresponding feature is off, so systems can multiply
 * unconditionally and a world with every feature off behaves exactly like Phase 5.
 */
export class EcologyModel {
  readonly regionsOn: boolean
  readonly seasonsOn: boolean
  readonly hazardsOn: boolean
  readonly kindsOn: boolean
  readonly healthOn: boolean
  readonly migrationOn: boolean
  /** `true` when perception must apply per-hit detectability and visibility. */
  readonly perceptionModified: boolean
  /** `true` when top speed depends on where the organism is (regions, seasons, or the void). */
  readonly movementModified: boolean

  private readonly seasons: SeasonModel | null
  private readonly seasonTable: readonly SeasonConfig[]
  private readonly regionTable: readonly RegionTypeConfig[]
  private readonly kinds: readonly KindProperties[]
  private readonly tolerance: number
  private readonly temperatureCost: number
  private readonly voidSpeed: number
  private readonly voidVisibility: number

  /**
   * `map` is the field's region map or the cluster layout's terrain; `clusters` is the cluster
   * geometry, present only in the cluster layout, where the void between clusters slows and blinds.
   */
  constructor(
    config: WorldConfig,
    private readonly map: Terrain | null,
    readonly clusters: ClusterLayout | null = null
  ) {
    const ecology = config.ecology
    this.regionsOn = ecology.regions.enabled && map !== null
    this.seasonsOn = ecology.seasons.enabled
    this.hazardsOn = ecology.hazards.enabled
    this.kindsOn = ecology.resourceKinds.enabled
    this.healthOn = ecology.health.enabled
    this.migrationOn = ecology.migration.enabled && this.regionsOn
    this.perceptionModified = this.regionsOn || this.seasonsOn || this.kindsOn || clusters !== null
    this.movementModified = this.regionsOn || this.seasonsOn || clusters !== null
    this.voidSpeed = config.environment.clusters.voidSpeedScale
    this.voidVisibility = config.environment.clusters.voidVisibility

    this.seasons = this.seasonsOn ? new SeasonModel(ecology.seasons, config.timestep) : null
    this.seasonTable = SEASONS.map((season) => ecology.seasons.seasons[season])
    this.regionTable = REGION_TYPES.map((type) => ecology.regions.types[type])
    this.tolerance = ecology.regions.temperatureTolerance
    this.temperatureCost = ecology.regions.temperatureCost

    const { resources } = config
    this.kinds = this.kindsOn
      ? ecology.resourceKinds.kinds.map((kind) => ({
          name: kind.name,
          energy: resources.energyValue * kind.energyScale,
          radius: resources.radius * kind.radiusScale,
          spawnWeight: kind.spawnWeight,
          detectability: kind.detectability,
          toxicity: kind.toxicity,
          regions: kind.regions
        }))
      : [
          {
            name: 'food',
            energy: resources.energyValue,
            radius: resources.radius,
            spawnWeight: 1,
            detectability: 1,
            toxicity: 0,
            regions: []
          }
        ]
  }

  /** Number of resource kinds (1 when kinds are off). */
  get kindCount(): number {
    return this.kinds.length
  }

  kind(index: number): KindProperties {
    return this.kinds[index] as KindProperties
  }

  /** Whether a kind grows in the region at a position (always, when regions are off or the kind lists none). */
  kindGrowsAt(kindIndex: number, x: number, y: number): boolean {
    const kind = this.kinds[kindIndex] as KindProperties
    if (!this.regionsOn || kind.regions.length === 0) return true
    const type = (this.map as Terrain).typeAt(x, y)
    return type !== null && kind.regions.includes(type)
  }

  /** Picks a kind by spawn weight from a uniform value in `[0, 1)`. */
  chooseKind(u: number): number {
    let total = 0
    for (const kind of this.kinds) total += kind.spawnWeight
    const target = u * total
    let cumulative = 0
    let last = 0
    for (let i = 0; i < this.kinds.length; i++) {
      const weight = (this.kinds[i] as KindProperties).spawnWeight
      if (weight <= 0) continue
      last = i
      cumulative += weight
      if (target < cumulative) return i
    }
    return last
  }

  seasonAt(tick: number): Season | null {
    return this.seasons === null ? null : this.seasons.seasonAt(tick)
  }

  /** Position within the year in `[0, 1)`, or `0` when seasons are off. */
  yearPhase(tick: number): number {
    return this.seasons === null ? 0 : this.seasons.yearPhase(tick)
  }

  private season(tick: number): SeasonConfig | null {
    return this.seasons === null
      ? null
      : (this.seasonTable[this.seasons.indexAt(tick)] as SeasonConfig)
  }

  private region(x: number, y: number): RegionTypeConfig | null {
    if (!this.regionsOn) return null
    const type = (this.map as Terrain).typeAt(x, y)
    return type === null ? null : (this.regionTable[REGION_TYPES.indexOf(type)] as RegionTypeConfig)
  }

  /** The region instance at a position, or `-1` when regions are off. */
  regionIndexAt(x: number, y: number): number {
    return this.regionsOn ? (this.map as Terrain).indexAt(x, y) : -1
  }

  regionTypeOfIndex(index: number): RegionType | null {
    return this.regionsOn && index >= 0 ? (this.map as Terrain).typeOf(index) : null
  }

  regionTypeAt(x: number, y: number): RegionType | null {
    return this.regionsOn ? (this.map as Terrain).typeAt(x, y) : null
  }

  /** Whether a position is in the void between clusters (never, in the field layout). */
  inVoid(x: number, y: number): boolean {
    return this.clusters !== null && this.clusters.clusterAt(x, y) < 0
  }

  /** Multiplier on top speed. */
  movementScale(x: number, y: number, tick: number): number {
    const scale = (this.region(x, y)?.movementScale ?? 1) * (this.season(tick)?.movementScale ?? 1)
    return this.inVoid(x, y) ? scale * this.voidSpeed : scale
  }

  /** Multiplier on the sensor radius. */
  visibilityScale(x: number, y: number, tick: number): number {
    const scale = (this.region(x, y)?.visibility ?? 1) * (this.season(tick)?.visibility ?? 1)
    return this.inVoid(x, y) ? scale * this.voidVisibility : scale
  }

  /** Region plus season temperature, clamped to `[-1, 1]`; `0` with both off. */
  temperature(x: number, y: number, tick: number): number {
    const raw = (this.region(x, y)?.temperature ?? 0) + (this.season(tick)?.temperature ?? 0)
    return Math.max(-1, Math.min(1, raw))
  }

  /** Energy per second for being outside the comfortable temperature range. */
  environmentalCost(x: number, y: number, tick: number): number {
    if (!this.regionsOn && !this.seasonsOn) return 0
    const excess = Math.max(0, Math.abs(this.temperature(x, y, tick)) - this.tolerance)
    return this.temperatureCost * excess * excess
  }

  /** Multiplier on hazard damage from the region at a position. */
  hazardExposure(x: number, y: number): number {
    return this.region(x, y)?.hazardExposure ?? 1
  }

  /** Multiplier on hazard damage and the storm rate from the season. */
  hazardIntensity(tick: number): number {
    return this.season(tick)?.hazardIntensity ?? 1
  }

  /** Divisor of the reproduction threshold and cost. */
  reproductionScale(x: number, y: number, tick: number): number {
    return (this.region(x, y)?.reproductionScale ?? 1) * (this.season(tick)?.reproductionScale ?? 1)
  }

  /** Multiplier on the resource spawn rate. */
  regenerationScale(tick: number): number {
    return this.season(tick)?.regeneration ?? 1
  }
}
