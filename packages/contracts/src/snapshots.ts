import type { PartType } from './anatomy'
import type { EntityId } from './entity'
import type { GenomeId } from './genome'
import type { Vec2 } from './math'
import type { BrainTelemetry } from './learning'
import type { DeathCause } from './world'
import type { LifeStage } from './organism'
import type { HazardSnapshot, MigrationSummary } from './ecology'
import type { SpeciesId } from './species'

/** One developed part as drawn: world units relative to the creature's centre (front along +x). */
export interface PartSnapshot {
  /** The slot this part grows from (its gene block), for naming it in the inspector. */
  readonly slot: number
  /**
   * The index, in the same `parts` array, of the part this one hangs from, or `-1` when it attaches
   * to the body. Always smaller than this part's own index, so one forward pass can place every
   * child after its parent.
   */
  readonly parent: number
  /** What a working eye sees (the half-angle of its cone and how far, in world units); `null` for every other part. */
  readonly sight: { readonly half: number; readonly reach: number } | null
  readonly type: PartType
  readonly x: number
  readonly y: number
  /** The glyph's radius, from the part's `size`. */
  readonly radius: number
  /** The direction the part points (its axis), in radians from the front; a flagellum's tail trails along it. */
  readonly orientation: number
  /** `false` when a requirement is missing: the part is dead weight. */
  readonly functional: boolean
  /** How far the part reaches along its axis, in world units (zero for a part with no length): a stalk, a join, a skeleton. */
  readonly length: number
  /** Which form of its type it is: a mouth's index in `MOUTH_FORMS` (sprout 0 to jaw 4); 0 for every other type. */
  readonly form: number
}

export interface OrganismSnapshot {
  readonly id: EntityId
  /** The organism's genome; the full genome is available from `World.genomeOf`. */
  readonly genomeId: GenomeId
  /** Empty for founders. */
  readonly parentIds: readonly EntityId[]
  /** The organism's species, or `null` when species are disabled. */
  readonly speciesId: SpeciesId | null
  readonly position: Readonly<Vec2>
  readonly velocity: Readonly<Vec2>
  readonly heading: number
  readonly radius: number
  /**
   * The body outline as `x0, y0, x1, y1, ...` in world units relative to the centre, front along
   * +x, counter-clockwise (ADR 0013). Its area-equivalent radius is `radius`.
   */
  readonly outline: readonly number[]
  /** The `hue` gene in turns, `[0, 1)`: the colour family of a cluster-layout creature. */
  readonly hue: number
  /** The developed parts, for drawing at high zoom (ADR 0015). Shared between snapshots of one organism. */
  readonly parts: readonly PartSnapshot[]
  /** Painted pattern, 0-3. */
  readonly pattern: number
  /** Accent hue in turns, `[0, 1)`. */
  readonly accentHue: number
  readonly age: number
  /** The age at which the organism dies of old age. */
  readonly maxAge: number
  readonly energy: number
  /** Energy capacity of this organism's body. */
  readonly maxEnergy: number
  /** Current health; equals the maximum when health is disabled. */
  readonly health: number
  /** Health capacity of this organism's body. */
  readonly maxHealth: number
  readonly lifeStage: LifeStage
  readonly reproductionCooldownRemaining: number
  /** Food energy bitten but not yet absorbed (ADR 0017); zero when feeding is off. */
  readonly gut: number
  /** Gut capacity of this organism's body; zero when feeding is off. */
  readonly gutCapacity: number
}

/** A compact, retained record of an organism after it dies (docs/decisions/0005). */
export interface HistoricalOrganismRecord {
  readonly id: EntityId
  readonly genomeId: GenomeId
  /** Empty for founders. */
  readonly parentIds: readonly EntityId[]
  /** The species the organism belonged to, or `null` when species are disabled. */
  readonly speciesId: SpeciesId | null
  readonly birthTick: number
  readonly deathTick: number
  readonly deathCause: DeathCause
  /** The creature whose bite the death is counted against, for a death by predation. */
  readonly killedBy?: EntityId
  /** Region movement over the organism's life; `null` when migration tracking is off. */
  readonly migration: MigrationSummary | null
  /** What the organism's brain did over its life; `null` under the reflex controller. */
  readonly brain: BrainTelemetry | null
}

export interface ResourceSnapshot {
  readonly id: EntityId
  readonly position: Readonly<Vec2>
  readonly radius: number
  readonly energyValue: number
  readonly remaining: number
  /** Index into the resource kinds (0 when kinds are off). */
  readonly kind: number
  /** The hub this node hangs from, or `0` (free food and hubs). Plants only (ADR 0021). */
  readonly parent?: number
  /** `0` for a hub, `1` to `6` for a node, `255` (or absent) for free food. */
  readonly slot?: number
  /** On a hub: where its next node is growing and how far along it is, in `[0, 1]`; else `null`/absent. */
  readonly bud?: { readonly x: number; readonly y: number; readonly progress: number } | null
}

export interface PopulationSnapshot {
  readonly active: number
  /** Tick at which the population first reached zero, or `null` if it has not gone extinct. */
  readonly extinctionTick: number | null
}

export interface MetricsSnapshot {
  readonly organismsBorn: number
  readonly deathsByStarvation: number
  readonly deathsByAge: number
  readonly deathsByDamage: number
  /** Deaths of a creature that was bitten within `predation.attackWindow` (ADR 0023). */
  readonly deathsByPredation: number
  /** Bites taken out of creatures. */
  readonly predationBites: number
  readonly resourcesSpawned: number
  readonly resourcesConsumed: number
  readonly reproductionAttempts: number
  readonly reproductionSuccesses: number
  readonly reproductionFailures: number
  readonly energyConsumed: number
  readonly energyWasted: number
  /** Total health lost to hazards and toxins. */
  readonly damageTaken: number
}

/** A read-only, deep-copied view of a world. Presentation layers consume this, never live state. */
export interface WorldSnapshot {
  readonly seed: number
  readonly tick: number
  readonly time: number
  readonly population: PopulationSnapshot
  /** Ascending id order. */
  readonly organisms: readonly OrganismSnapshot[]
  /** Ascending id order. */
  readonly resources: readonly ResourceSnapshot[]
  /** Ascending id order. */
  readonly hazards: readonly HazardSnapshot[]
  readonly metrics: MetricsSnapshot
}
