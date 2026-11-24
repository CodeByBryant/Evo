import type { WorldConfig } from '@evo/contracts'
import type { IdGenerator } from '../entities/IdGenerator'
import { HUB_SLOT, isNode } from '../entities/ResourceStore'
import type { ResourceState, ResourceStore } from '../entities/ResourceStore'
import { cos, sin } from '../math/trig'
import { missingSlot, nodePosition, ringPhase, unitHash } from '../ecology/Plants'
import { SEED_KIND } from '../world/seedConfig'
import type { EcologyModel } from '../ecology/EcologyModel'
import type { ClusterLayout } from '../ecology/ClusterLayout'
import type { FoodField } from '../ecology/FoodField'
import type { ObstacleField } from '../ecology/ObstacleField'
import type { HazardStore } from '../ecology/HazardStore'
import type { EventLog } from '../events/EventLog'
import type { RandomSource } from '../random/RandomSource'
import type { SeededRandom } from '../random/SeededRandom'

/** Attempts to find a position a kind can grow in before a spawn is dropped. */
const PLACEMENT_ATTEMPTS = 8
/**
 * Candidate sites a spawn draws in `noise` mode, always all of them (three draws each: x, y and an
 * acceptance number), so the number of draws never depends on where the pattern says food belongs.
 */
const NOISE_CANDIDATES = 8
/** The share of a hub's capacity it never spends on growing nodes. */
const HUB_RESERVE = 0.2
/** Attempts to place one static damage area in a hazardous region. */
const HAZARD_PLACEMENT_ATTEMPTS = 16
/** Upper bound on storms spawned in one tick, whatever the configured rate. */
const MAX_STORMS_PER_TICK = 8

/**
 * Spawns resources and manages hazards. Owns the resource store's population growth, the hazard
 * store, and the two fractional accumulators (docs/simulation/update-order.md, stage 2):
 * `spawnRate * timestep * seasonal regeneration` new resources and `stormRate * seasonal intensity
 * * timestep` storms are expected per tick, and the fractional remainders carry deterministically
 * to later ticks.
 *
 * With every ecology feature off this is exactly the Phase 5 system: two `environment` draws per
 * resource, the whole world (or `resources.region`), the baseline energy. Kinds add one draw for
 * the kind and two per placement attempt; storms draw two values from the `events` stream.
 */
export class EnvironmentSystem {
  private spawnAccumulator = 0
  private stormAccumulator = 0

  constructor(
    private readonly config: WorldConfig,
    private readonly resources: ResourceStore,
    private readonly ids: IdGenerator,
    private readonly random: SeededRandom,
    private readonly events: EventLog,
    private readonly ecology: EcologyModel | null = null,
    private readonly hazards: HazardStore | null = null,
    private readonly stormRandom: RandomSource | null = null,
    /** Living organisms per cluster, for steering food toward them (cluster layout only). */
    private readonly livingPerCluster: (() => readonly number[]) | null = null,
    /** The pattern food follows in `noise` mode (ADR 0021); `null` spreads it evenly. */
    private readonly foodField: FoodField | null = null,
    /** The static obstacles (ADR 0022): food and plants are never placed inside one that blocks movement. */
    private readonly obstacles: ObstacleField | null = null
  ) {
    // Seeds (ADR 0032) exist when `withSeeds` appended their kind to this world's kinds.
    this.seedKind = config.ecology.resourceKinds.enabled
      ? config.ecology.resourceKinds.kinds.findIndex((k) => k.name === SEED_KIND)
      : -1
  }

  /** The index of the `seed` kind, or `-1` when this world has no seeds. */
  private readonly seedKind: number
  /** Seeds on the field, counted once a tick by the plant pass and kept up to date within it. */
  private seedCount = 0
  /** Running totals, for probes (not saved, not hashed): seeds dropped, germinated, and rotted. */
  private seedTotals = { dropped: 0, germinated: 0, rotted: 0 }

  /** Seeds dropped, germinated and rotted so far, and seeds on the field now (a probe's view; not part of the state). */
  get seedStats(): { dropped: number; germinated: number; rotted: number; alive: number } {
    return { ...this.seedTotals, alive: this.seedCount }
  }

  /** Items that count toward `resources.maxCount`: everything but seeds, which have their own cap. */
  private get itemCount(): number {
    return this.resources.size - this.seedCount
  }

  /**
   * Whether a site for an item of `kind` is inside, or too close to, an obstacle that blocks
   * movement: close enough that the item, or (for a plant) one of its nodes, would end up in a rock,
   * out of any body's reach. Always `false` when there are no such obstacles.
   */
  private blockedByObstacle(x: number, y: number, kind: number): boolean {
    const field = this.obstacles
    if (field === null || field.maxMovementRadius === 0) return false
    const radius = this.radiusOf(kind)
    const plants = this.plantsOn ? this.config.resources.plants : null
    const margin = plants === null ? radius + 1 : (plants.ring + 1) * radius + 1
    return field.blocksMovementAt(x, y, margin)
  }

  /** Simulated seconds at the current tick, for the drifting pattern. */
  private time = 0

  /** Living organisms per cluster, read once a tick (`update`), so every spawn sees the same counts. */
  private living: readonly number[] = []

  /** Puts the two carried remainders back to saved values (`World.restoreState`). */
  restoreRemainders(spawn: number, storm: number): void {
    this.spawnAccumulator = spawn
    this.stormAccumulator = storm
  }

  /** The carried fractional resource spawn; hashed, since it decides future spawns. */
  get spawnRemainder(): number {
    return this.spawnAccumulator
  }

  /** The carried fractional storm spawn; hashed for the same reason. */
  get stormRemainder(): number {
    return this.stormAccumulator
  }

  /** A point inside a uniformly chosen cluster (3 draws: cluster, distance, angle). */
  private clusterPoint(random: RandomSource): { x: number; y: number } {
    const layout = (this.ecology as EcologyModel).clusters as ClusterLayout
    const cluster = Math.min(layout.count - 1, Math.floor(random.float() * layout.count))
    return layout.pointIn(cluster, random.float(), random.float())
  }

  /**
   * A point inside a cluster chosen so that food is not stranded where nobody lives (ADR 0014
   * revision): every cluster with a living organism has weight 1 and an empty one has weight
   * `foodFloor`. It uses the same three draws as `clusterPoint`, and the same arithmetic as an
   * even spread when nobody has been counted yet (the initial food, placed before the organisms
   * exist).
   */
  private foodPoint(random: RandomSource): { x: number; y: number } {
    const layout = (this.ecology as EcologyModel).clusters as ClusterLayout
    const floor = this.config.environment.clusters.foodFloor
    const draw = random.float()
    const counted = this.living.length === layout.count
    let total = 0
    if (counted) {
      for (let c = 0; c < layout.count; c++) total += (this.living[c] as number) > 0 ? 1 : floor
    }
    let cluster: number
    if (!counted || !(total > 0)) {
      cluster = Math.min(layout.count - 1, Math.floor(draw * layout.count))
    } else {
      const target = draw * total
      let sum = 0
      cluster = layout.count - 1
      for (let c = 0; c < layout.count; c++) {
        sum += (this.living[c] as number) > 0 ? 1 : floor
        if (target < sum) {
          cluster = c
          break
        }
      }
    }
    return layout.pointIn(cluster, random.float(), random.float())
  }

  /**
   * Removes food stranded in clusters with no living organisms, lowest id first and at most
   * `strandedFoodPerTick` a tick, so it cannot sit on the global food cap forever. No draws.
   */
  private clearStrandedFood(): void {
    const limit = this.config.environment.clusters.strandedFoodPerTick
    const layout = (this.ecology as EcologyModel).clusters as ClusterLayout
    if (limit <= 0 || this.living.length !== layout.count) return
    if (!this.living.some((alive) => alive === 0)) return
    let removed = 0
    for (const resource of this.resources.values()) {
      const cluster = layout.clusterAt(resource.x, resource.y)
      if (cluster < 0 || (this.living[cluster] as number) > 0) continue
      this.resources.remove(resource.id)
      if (++removed >= limit) return
    }
  }

  /**
   * The first of `NOISE_CANDIDATES` random sites in `area` that the pattern accepts (and, when kinds
   * are on, where `kind` can grow), or `null` when none does and the spawn is dropped. Always draws
   * all candidates.
   */
  private noiseSite(
    area: { x: number; y: number; width: number; height: number },
    kind: number | null
  ): { x: number; y: number } | null {
    const field = this.foodField as FoodField
    const eco = this.ecology
    let found: { x: number; y: number } | null = null
    for (let i = 0; i < NOISE_CANDIDATES; i++) {
      const x = area.x + this.random.float() * area.width
      const y = area.y + this.random.float() * area.height
      const accept = this.random.float()
      if (found !== null) continue
      if (accept >= field.density(x, y, this.time)) continue
      if (kind !== null && eco !== null && !eco.kindGrowsAt(kind, x, y)) continue
      if (this.blockedByObstacle(x, y, kind ?? 0)) continue
      found = { x, y }
    }
    return found
  }

  /**
   * Chooses where, and of what kind, the next food item (or plant) goes, or `null` when no site is
   * found and the spawn is dropped. The draws, in order, are exactly those of the three layouts.
   */
  private site(): { x: number; y: number; kind: number } | null {
    // With no region the whole world is used and the draws are exactly Phase 4's.
    const { region } = this.config.resources
    const area = region ?? {
      x: 0,
      y: 0,
      width: this.config.environment.width,
      height: this.config.environment.height
    }
    const eco = this.ecology
    let kind = 0
    let x: number
    let y: number
    if (eco !== null && eco.clusters !== null) {
      // The cluster layout (docs/decisions/0014): food grows inside clusters only.
      if (eco.kindsOn) kind = eco.chooseKind(this.random.float())
      let point = this.foodPoint(this.random)
      for (let attempt = 1; eco.kindsOn && !eco.kindGrowsAt(kind, point.x, point.y); attempt++) {
        if (attempt >= PLACEMENT_ATTEMPTS) return null
        point = this.foodPoint(this.random)
      }
      x = point.x
      y = point.y
    } else if (this.foodField !== null) {
      // The patchy field (ADR 0021): a fixed number of candidates, the first the pattern accepts.
      if (eco !== null && eco.kindsOn) kind = eco.chooseKind(this.random.float())
      const site = this.noiseSite(area, eco !== null && eco.kindsOn ? kind : null)
      if (site === null) return null
      x = site.x
      y = site.y
    } else if (eco !== null && eco.kindsOn) {
      kind = eco.chooseKind(this.random.float())
      x = area.x + this.random.float() * area.width
      y = area.y + this.random.float() * area.height
      for (
        let attempt = 1;
        !eco.kindGrowsAt(kind, x, y) || this.blockedByObstacle(x, y, kind);
        attempt++
      ) {
        // A kind whose regions do not exist on this map never appears: the spawn is dropped.
        if (attempt >= PLACEMENT_ATTEMPTS) return null
        x = area.x + this.random.float() * area.width
        y = area.y + this.random.float() * area.height
      }
    } else {
      x = area.x + this.random.float() * area.width
      y = area.y + this.random.float() * area.height
      // Two draws and no retry (Phase 4's): a site inside an obstacle drops the spawn.
      if (this.blockedByObstacle(x, y, kind)) return null
    }
    return { x, y, kind }
  }

  /** What one item of `kind` is worth, and how big it is. */
  private energyOf(kind: number): number {
    return this.ecology === null
      ? this.config.resources.energyValue
      : this.ecology.kind(kind).energy
  }

  private radiusOf(kind: number): number {
    return this.ecology === null ? this.config.resources.radius : this.ecology.kind(kind).radius
  }

  private add(resource: ResourceState, tick: number): void {
    this.resources.add(resource)
    this.events.record({
      type: 'resource-spawned',
      tick,
      resourceId: resource.id,
      kind: resource.kind,
      position: { x: resource.x, y: resource.y }
    })
  }

  private spawnOne(tick: number): void {
    const site = this.site()
    if (site === null) return
    const id = this.ids.allocate()
    this.add(
      { id, x: site.x, y: site.y, remaining: this.energyOf(site.kind), kind: site.kind },
      tick
    )
  }

  /** Plants are on, and this layout has them (the cluster layout keeps free food). */
  private get plantsOn(): boolean {
    return (
      this.config.resources.plants.enabled &&
      (this.ecology === null || this.ecology.clusters === null)
    )
  }

  /** One node of the plant whose hub is `hub`, at `slot`, full of energy. */
  private addNode(hub: ResourceState, slot: number, tick: number): void {
    const plants = this.config.resources.plants
    const { width, height } = this.config.environment
    const at = nodePosition(
      hub,
      slot,
      plants.nodes,
      plants.ring * this.radiusOf(hub.kind),
      width,
      height
    )
    this.add(
      {
        id: this.ids.allocate(),
        x: at.x,
        y: at.y,
        remaining: plants.nodeEnergyScale * this.energyOf(hub.kind),
        kind: hub.kind,
        parent: hub.id,
        slot
      },
      tick
    )
  }

  /** A whole plant: a hub with a full store and every node (ADR 0021). */
  private spawnPlant(tick: number): void {
    const site = this.site()
    if (site === null) return
    const plants = this.config.resources.plants
    const hub: ResourceState = {
      id: this.ids.allocate(),
      x: site.x,
      y: site.y,
      remaining: plants.hubEnergyScale * this.energyOf(site.kind),
      kind: site.kind,
      parent: 0,
      slot: HUB_SLOT,
      bornTick: tick,
      sproutProgress: 0
    }
    this.add(hub, tick)
    for (let slot = 1; slot <= plants.nodes; slot++) this.addNode(hub, slot, tick)
  }

  /** Scratch for the plant pass: the hubs, and which node slots each has. */
  private readonly hubs: ResourceState[] = []
  private readonly present = new Map<number, number>()
  private readonly seedList: ResourceState[] = []

  /**
   * One tick of plant life (ADR 0021), draw-free: each hub gains photosynthesis up to its capacity,
   * moves energy from its store into the node that is growing back (and sprouts it when it is
   * enough), and a plant past its lifespan withers with its nodes. Photosynthesis and regrowth
   * follow the season (`regenerationScale`), so a harsh winter is felt by plants as it is by spawning. Returns
   * how many plants live.
   */
  private updatePlants(tick: number, season: number): number {
    const plants = this.config.resources.plants
    const dt = this.config.timestep
    const hubs = this.hubs
    const present = this.present
    const seedList = this.seedList
    hubs.length = 0
    seedList.length = 0
    present.clear()
    const seedKind = this.seedKind
    this.resources.forEach((resource) => {
      if (resource.slot === HUB_SLOT) {
        hubs.push(resource)
        present.set(resource.id, 0)
      } else if (resource.kind === seedKind) {
        seedList.push(resource)
      }
    })
    this.seedCount = seedList.length
    this.resources.forEach((resource) => {
      if (!isNode(resource)) return
      const mask = present.get(resource.parent as number)
      if (mask !== undefined)
        present.set(resource.parent as number, mask | (1 << (resource.slot as number)))
    })
    let alive = 0
    for (const hub of hubs) {
      const born = hub.bornTick ?? 0
      if (plants.lifespan > 0 && (tick - born) * dt >= plants.lifespan) {
        // A plant that withers takes its nodes with it.
        for (const node of this.resources.values()) {
          if (isNode(node) && node.parent === hub.id) this.resources.remove(node.id)
        }
        this.resources.remove(hub.id)
        continue
      }
      alive++
      const kindEnergy = this.energyOf(hub.kind)
      const capacity = plants.hubEnergyScale * kindEnergy
      // The season sets how much light there is: winter starves plants as it starves spawning.
      hub.remaining = Math.min(capacity, hub.remaining + plants.photosynthesis * dt * season)
      const slot = missingSlot(present.get(hub.id) as number, plants.nodes)
      if (slot === 0) {
        hub.sproutProgress = 0
        // A full plant with every node grown wastes what it gains: it drops a seed instead (ADR 0032).
        if (seedKind >= 0 && hub.remaining >= capacity - 1e-9) this.dropSeed(hub, born, tick)
        continue
      }
      // The hub keeps a reserve so growing nodes never starves the plant itself.
      const reserve = HUB_RESERVE * capacity
      // Growth follows the season too: a hub's store is a buffer, not a way round winter.
      const moved = Math.min(plants.regrowRate * dt * season, Math.max(0, hub.remaining - reserve))
      hub.remaining -= moved
      const nodeEnergy = plants.nodeEnergyScale * kindEnergy
      let progress = (hub.sproutProgress ?? 0) + moved
      if (progress >= nodeEnergy - 1e-9) {
        if (this.itemCount < this.config.resources.maxCount) {
          this.addNode(hub, slot, tick)
          progress = Math.max(0, progress - nodeEnergy)
        } else {
          progress = nodeEnergy // full: wait for room
        }
      }
      hub.sproutProgress = progress
    }
    if (seedKind >= 0) alive += this.updateSeeds(tick, alive)
    return alive
  }

  /**
   * A full plant's seed (ADR 0032), draw-free: every `seeds.interval` seconds of the plant's age, if
   * seeds are below their cap and the hub can spare the energy without eating into its reserve,
   * `seeds.energy` moves out of the hub's store into a seed that lands a way off, in a direction and
   * at a distance taken from a hash of the hub and the tick. A landing site inside an obstacle that
   * blocks movement skips the drop (the energy stays in the hub).
   */
  private dropSeed(hub: ResourceState, born: number, tick: number): void {
    const seeds = this.config.resources.seeds
    const intervalTicks = Math.max(1, Math.round(seeds.interval / this.config.timestep))
    const age = tick - born
    if (age <= 0 || age % intervalTicks !== 0 || this.seedCount >= seeds.maxCount) return
    const plants = this.config.resources.plants
    const capacity = plants.hubEnergyScale * this.energyOf(hub.kind)
    if (hub.remaining - seeds.energy < HUB_RESERVE * capacity) return
    const angle = ringPhase(hub.id + tick)
    const distance =
      seeds.dispersalMin + unitHash(hub.id, tick, 1) * (seeds.dispersalMax - seeds.dispersalMin)
    const { width, height } = this.config.environment
    const x = Math.min(width, Math.max(0, hub.x + distance * cos(angle)))
    const y = Math.min(height, Math.max(0, hub.y + distance * sin(angle)))
    const field = this.obstacles
    if (field !== null && field.maxMovementRadius > 0) {
      if (field.blocksMovementAt(x, y, this.radiusOf(this.seedKind) + 1)) return
    }
    hub.remaining -= seeds.energy
    this.add(
      {
        id: this.ids.allocate(),
        x,
        y,
        remaining: seeds.energy,
        kind: this.seedKind,
        bornTick: tick
      },
      tick
    )
    this.seedCount += 1
    this.seedTotals.dropped += 1
  }

  /**
   * What happens to the seeds on the field (ADR 0032), draw-free, in ascending id order: one past its
   * `lifespan` rots (its energy is lost), and one past its `dormancy` that is not eaten becomes a plant
   * where it lies, once a second, if the food pattern is dense enough there, plants are below their cap
   * and the site is clear: the seed is removed and a hub with its energy as the store (and no nodes, they
   * regrow) takes its place, of a kind that grows there (taken from a hash of the seed, never a draw).
   * Returns the plants started this tick.
   */
  private updateSeeds(tick: number, plantsAlive: number): number {
    const seeds = this.config.resources.seeds
    const plants = this.config.resources.plants
    const dt = this.config.timestep
    const checkTicks = Math.max(1, Math.round(1 / dt))
    const eco = this.ecology
    let started = 0
    for (const seed of this.seedList) {
      const born = seed.bornTick ?? tick
      const age = (tick - born) * dt
      if (age >= seeds.lifespan) {
        this.resources.remove(seed.id)
        this.seedCount -= 1
        this.seedTotals.rotted += 1
        continue
      }
      if (!seeds.germinate || age < seeds.dormancy || (tick - born) % checkTicks !== 0) continue
      if (plantsAlive + started >= plants.maxPlants) continue
      if (this.itemCount >= this.config.resources.maxCount) continue
      if (
        this.foodField !== null &&
        this.foodField.density(seed.x, seed.y, this.time) < seeds.germinateDensity
      )
        continue
      if (this.blockedByObstacle(seed.x, seed.y, 0)) continue
      let kind = -1
      if (eco !== null) {
        for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS && kind < 0; attempt++) {
          const candidate = eco.chooseKind(unitHash(seed.id, tick, attempt + 2))
          if (eco.kindGrowsAt(candidate, seed.x, seed.y)) kind = candidate
        }
      }
      if (kind < 0) continue
      this.resources.remove(seed.id)
      this.seedCount -= 1
      this.seedTotals.germinated += 1
      this.add(
        {
          id: this.ids.allocate(),
          x: seed.x,
          y: seed.y,
          remaining: seed.remaining,
          kind,
          parent: 0,
          slot: HUB_SLOT,
          bornTick: tick,
          sproutProgress: 0
        },
        tick
      )
      started += 1
    }
    return started
  }

  /** Spawns the initial population at world creation. Called once, at tick 0, from `World`. */
  spawnInitial(tick: number): void {
    if (this.plantsOn) {
      // `initialCount` counts items: a plant is a hub and its nodes.
      const plants = this.config.resources.plants
      const count = Math.floor(this.config.resources.initialCount / (1 + plants.nodes))
      for (let i = 0; i < Math.min(count, plants.maxPlants); i++) this.spawnPlant(tick)
      return
    }
    for (let i = 0; i < this.config.resources.initialCount; i++) this.spawnOne(tick)
  }

  /**
   * Places the static damage areas, once, at world creation, from the `terrain` stream: each gets
   * up to 16 attempts to land where the region's hazard exposure is above zero (anywhere when
   * regions are off); an area that finds no such spot is dropped.
   */
  placeStaticHazards(tick: number, terrain: RandomSource): void {
    const eco = this.ecology
    if (eco === null || this.hazards === null || !eco.hazardsOn) return
    const settings = this.config.ecology.hazards
    const { width, height } = this.config.environment
    for (let i = 0; i < settings.areaCount; i++) {
      for (let attempt = 0; attempt < HAZARD_PLACEMENT_ATTEMPTS; attempt++) {
        const spot =
          eco.clusters === null
            ? { x: terrain.float() * width, y: terrain.float() * height }
            : this.clusterPoint(terrain)
        const { x, y } = spot
        if (eco.regionsOn && !(eco.hazardExposure(x, y) > 0)) continue
        const hazard = this.hazards.add({
          kind: 'damage-area',
          x,
          y,
          radius: settings.areaRadius,
          damagePerSecond: settings.areaDamage,
          expiresAtTick: null
        })
        this.events.record({
          type: 'hazard-spawned',
          tick,
          hazardId: hazard.id,
          kind: hazard.kind,
          position: { x, y },
          radius: hazard.radius
        })
        break
      }
    }
  }

  private updateHazards(tick: number): void {
    const eco = this.ecology
    if (eco === null) return
    if (eco.seasonsOn && tick > 0) {
      const season = eco.seasonAt(tick)
      if (season !== null && season !== eco.seasonAt(tick - 1)) {
        this.events.record({ type: 'season-changed', tick, season })
      }
    }
    if (this.hazards === null || !eco.hazardsOn) return
    for (const hazard of this.hazards.removeExpired(tick)) {
      this.events.record({ type: 'hazard-expired', tick, hazardId: hazard.id, kind: hazard.kind })
    }
    const settings = this.config.ecology.hazards
    if (settings.stormRate > 0 && this.stormRandom !== null) {
      const dt = this.config.timestep
      this.stormAccumulator += settings.stormRate * eco.hazardIntensity(tick) * dt
      const count = Math.min(Math.floor(this.stormAccumulator), MAX_STORMS_PER_TICK)
      this.stormAccumulator -= count
      const { width, height } = this.config.environment
      for (let i = 0; i < count; i++) {
        const spot =
          eco.clusters === null
            ? { x: this.stormRandom.float() * width, y: this.stormRandom.float() * height }
            : this.clusterPoint(this.stormRandom)
        const { x, y } = spot
        const hazard = this.hazards.add({
          kind: 'storm',
          x,
          y,
          radius: settings.stormRadius,
          damagePerSecond: settings.stormDamage,
          expiresAtTick: tick + Math.ceil(settings.stormDuration / dt)
        })
        this.events.record({
          type: 'hazard-spawned',
          tick,
          hazardId: hazard.id,
          kind: hazard.kind,
          position: { x, y },
          radius: hazard.radius
        })
      }
    }
  }

  update(tick: number): void {
    this.time = tick * this.config.timestep
    this.updateHazards(tick)
    if (this.livingPerCluster !== null && this.ecology !== null && this.ecology.clusters !== null) {
      this.living = this.livingPerCluster()
      this.clearStrandedFood()
    }
    const regeneration = this.ecology === null ? 1 : this.ecology.regenerationScale(tick)
    this.spawnAccumulator += this.config.resources.spawnRate * this.config.timestep * regeneration
    if (this.plantsOn) {
      // `spawnRate` counts plants; `maxCount` counts items, `maxPlants` plants.
      const plants = this.config.resources.plants
      const alive = this.updatePlants(tick, regeneration)
      const room = Math.floor(
        Math.max(0, this.config.resources.maxCount - this.itemCount) / (1 + plants.nodes)
      )
      const toPlant = Math.min(
        Math.floor(this.spawnAccumulator),
        room,
        Math.max(0, plants.maxPlants - alive)
      )
      this.spawnAccumulator -= toPlant
      for (let i = 0; i < toPlant; i++) this.spawnPlant(tick)
      return
    }
    const capacity = Math.max(0, this.config.resources.maxCount - this.resources.size)
    const toSpawn = Math.min(Math.floor(this.spawnAccumulator), capacity)
    this.spawnAccumulator -= toSpawn
    for (let i = 0; i < toSpawn; i++) this.spawnOne(tick)
  }
}
