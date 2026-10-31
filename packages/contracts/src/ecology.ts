/** The six kinds of terrain a region can be (roadmap 6.6). The order is canonical. */
export const REGION_TYPES = ['meadow', 'forest', 'wetland', 'desert', 'cave', 'volcanic'] as const
export type RegionType = (typeof REGION_TYPES)[number]

/** The four seasons, in the order they occur (roadmap 6.7). */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const
export type Season = (typeof SEASONS)[number]

/** `damage-area` is static; `storm` appears during the run and expires. */
export type HazardKind = 'damage-area' | 'storm'

/** Health, damage and healing (ADR 0009). */
export interface HealthConfig {
  /** `false` keeps every organism at full health and disables all damage. */
  enabled: boolean
  /** Health capacity at the baseline body size; scaled by the body-size factor. */
  maxHealth: number
  /** Health regained per second while undamaged and well fed. */
  regenRate: number
  /** Energy spent per point of health regained. */
  regenEnergyCost: number
  /** Fraction of energy capacity an organism must hold to heal, in `[0, 1]`. */
  regenMinEnergyFraction: number
}

export interface RegionTypeConfig {
  /** Multiplies top speed, in `(0, 1]`. */
  movementScale: number
  /** Multiplies the sensor radius, in `(0, 1]`. */
  visibility: number
  /** Comfort offset in `[-1, 1]`; `0` is comfortable. */
  temperature: number
  /** Multiplies hazard damage, `>= 0`. */
  hazardExposure: number
  /** Divides the reproduction threshold and cost, `> 0`; higher is easier. */
  reproductionScale: number
}

export interface RegionsConfig {
  enabled: boolean
  /** Voronoi points that make up the map. */
  seedCount: number
  /** The lookup grid is `gridSize x gridSize` cells. */
  gridSize: number
  /** Temperatures within this distance of zero cost nothing, in `[0, 1]`. */
  temperatureTolerance: number
  /** Energy per second at an excess temperature of one. */
  temperatureCost: number
  types: Record<RegionType, RegionTypeConfig>
}

export interface SeasonConfig {
  /** Multiplies the resource spawn rate, `>= 0`. */
  regeneration: number
  /** Multiplies top speed, in `(0, 1]`. */
  movementScale: number
  /** Multiplies hazard damage and the storm rate, `>= 0`. */
  hazardIntensity: number
  /** Divides the reproduction threshold and cost, `> 0`. */
  reproductionScale: number
  /** Added to the region's temperature. */
  temperature: number
  /** Multiplies the sensor radius, in `(0, 1]`. */
  visibility: number
}

export interface SeasonsConfig {
  enabled: boolean
  /** Seconds per season. */
  seasonLength: number
  seasons: Record<Season, SeasonConfig>
}

export interface HazardsConfig {
  enabled: boolean
  /** Static damage areas placed at creation. */
  areaCount: number
  areaRadius: number
  /** Health damage per second inside a damage area. */
  areaDamage: number
  /** Expected storms per second at hazard intensity one. */
  stormRate: number
  stormRadius: number
  /** Seconds a storm lasts. */
  stormDuration: number
  /** Health damage per second inside a storm. */
  stormDamage: number
}

export interface ResourceKindConfig {
  name: string
  /** One resource holds `resources.energyValue * energyScale`. */
  energyScale: number
  /** Radius is `resources.radius * radiusScale`. */
  radiusScale: number
  /** Relative chance that a spawn is this kind. */
  spawnWeight: number
  /** Multiplies the distance at which the kind can be sensed, in `(0, 1]`. */
  detectability: number
  /** Health damage when eaten, `>= 0`. */
  toxicity: number
  /** Region types it grows in; empty means everywhere. */
  regions: RegionType[]
}

export interface ResourceKindsConfig {
  enabled: boolean
  kinds: ResourceKindConfig[]
}

export interface MigrationConfig {
  enabled: boolean
  /** Seconds continuously outside the home region that count as having migrated. */
  dwellTime: number
}

export interface EcologyConfig {
  health: HealthConfig
  regions: RegionsConfig
  seasons: SeasonsConfig
  hazards: HazardsConfig
  resourceKinds: ResourceKindsConfig
  migration: MigrationConfig
}

type PartialDeep<T> = { [K in keyof T]?: Partial<T[K]> }

/** Overrides merge field by field; `regions.types`, `seasons.seasons` merge per name and `resourceKinds.kinds` is replaced whole. */
export interface EcologyConfigOverrides {
  health?: Partial<HealthConfig>
  regions?: Partial<Omit<RegionsConfig, 'types'>> & {
    types?: PartialDeep<Record<RegionType, RegionTypeConfig>>
  }
  seasons?: Partial<Omit<SeasonsConfig, 'seasons'>> & {
    seasons?: PartialDeep<Record<Season, SeasonConfig>>
  }
  hazards?: Partial<HazardsConfig>
  resourceKinds?: Partial<ResourceKindsConfig>
  migration?: Partial<MigrationConfig>
}

/** A circle that damages whoever stands in it. */
export interface HazardSnapshot {
  readonly id: number
  readonly kind: HazardKind
  readonly position: { readonly x: number; readonly y: number }
  readonly radius: number
  readonly damagePerSecond: number
  /** The tick the hazard disappears, or `null` for a permanent one. */
  readonly expiresAtTick: number | null
}

/** What an organism's movement between regions amounted to (docs/ecology/ecology.md). */
export interface MigrationSummary {
  /** Region instance (Voronoi point) and type where it was born. */
  readonly homeRegion: number
  readonly homeType: RegionType
  readonly currentRegion: number
  readonly currentType: RegionType
  /** Times it entered a different region. */
  readonly crossings: number
  /** Distance travelled while outside its home region. */
  readonly distanceOutsideHome: number
  /** `true` once it stayed in another region for `migration.dwellTime`. */
  readonly migrated: boolean
}
