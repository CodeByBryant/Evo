import type { GeneKind } from './genome'

/**
 * Anatomy (docs/decisions/0012-anatomy.md, 0016-part-stats-and-attachment.md): a body is up to
 * twelve parts of sixteen types, encoded as a fixed set of genes, turned into an `Anatomy` by
 * deterministic development, and from there into capabilities. Every part is anchored to the body
 * outline (or to another part), has its own per-type stats, and a developmental `integrity`. This
 * file is the contract: the vocabulary, the gene layout, the data the engine hands out, and the
 * configuration.
 */

/**
 * The part types, in the fixed order of the `type` gene (a one-step mutation lands on a related
 * part). The first ten are the original parts; the six after them (eyestalk, gyro, lipid,
 * pheromone, skeleton, join) were appended so every earlier index, and the founder, stay put.
 */
export const PART_TYPES = [
  'flagellum',
  'cilia',
  'eye',
  'sniffer',
  'mouth',
  'intestine',
  'stomach',
  'armor',
  'membrane',
  'mender',
  'eyestalk',
  'gyro',
  'lipid',
  'pheromone',
  'skeleton',
  'join'
] as const
export type PartType = (typeof PART_TYPES)[number]

/** What a part needs from, and gives to, the rest of the body (ADR 0012 "Development"). */
export interface PartDefinition {
  readonly type: PartType
  /** Capability tokens that other functional parts must provide for this part to work. */
  readonly requires: readonly string[]
  /** Capability tokens this part provides once it works. */
  readonly provides: readonly string[]
}

/** Production dependencies: `stomach`, `intestine` need `intake` (a mouth); `mender` needs `digestion` (a stomach). */
export const PART_DEFINITIONS: readonly PartDefinition[] = [
  { type: 'flagellum', requires: [], provides: [] },
  { type: 'cilia', requires: [], provides: [] },
  { type: 'eye', requires: [], provides: [] },
  { type: 'sniffer', requires: [], provides: [] },
  { type: 'mouth', requires: [], provides: ['intake'] },
  { type: 'intestine', requires: ['intake'], provides: [] },
  { type: 'stomach', requires: ['intake'], provides: ['digestion'] },
  { type: 'armor', requires: [], provides: [] },
  { type: 'membrane', requires: [], provides: [] },
  { type: 'mender', requires: ['digestion'], provides: [] },
  // A child works only when its parent does (development), so the carriers need no token.
  { type: 'eyestalk', requires: [], provides: [] },
  { type: 'gyro', requires: [], provides: [] },
  { type: 'lipid', requires: ['digestion'], provides: [] },
  { type: 'pheromone', requires: [], provides: [] },
  { type: 'skeleton', requires: [], provides: [] },
  { type: 'join', requires: [], provides: [] }
]

/** Number of part slots on a body. */
export const BODY_SLOT_COUNT = 12

/**
 * Stats per slot. Every slot carries this many stat genes in `[0, 1]`; the part's type decides
 * how many it uses and what they mean (`PART_STATS`). Unused ones stay in the genome as latent
 * values, like an empty slot's genes, so a gene table never changes length with a part type and
 * every birth draws the same number of random values.
 */
export const PART_STAT_COUNT = 6

/** The stat genes of a slot, in order. */
export const STAT_FIELDS = ['s0', 's1', 's2', 's3', 's4', 's5'] as const
export type StatField = (typeof STAT_FIELDS)[number]

/**
 * The genes of one slot, in order. `parent` is 0 for the body or `k` for the part in slot `k - 1`
 * (only a lower slot counts; anything else attaches to the body). `angle` is where on the parent's
 * surface the part attaches, `offset` how far inside (or along the parent), `orientation` which
 * way it points relative to its anchor's outward direction, `integrity` how well it developed.
 */
export const SLOT_FIELDS = [
  'present',
  'type',
  'parent',
  'size',
  'angle',
  'offset',
  'orientation',
  'integrity',
  ...STAT_FIELDS
] as const
export type SlotField = (typeof SLOT_FIELDS)[number]

/** One named stat of a part type (ADR 0016): its gene `sN` maps to `min + gene * (max - min)`. */
export interface PartStatSpec {
  readonly key: string
  readonly label: string
  readonly min: number
  readonly max: number
  readonly unit: string
}

const stat = (
  key: string,
  label: string,
  min: number,
  max: number,
  unit: string
): PartStatSpec => ({
  key,
  label,
  min,
  max,
  unit
})

/**
 * The stats of each part type, in the order of the stat genes `s0, s1, ...` (at most
 * `PART_STAT_COUNT`). All provisional; the mechanics that read them are in the engine's
 * `development/capabilities.ts`.
 */
export const PART_STATS: Readonly<Record<PartType, readonly PartStatSpec[]>> = {
  flagellum: [
    stat('length', 'Length', 0.5, 2.5, 'radii'),
    stat('thickness', 'Thickness', 0.05, 0.3, 'radii'),
    stat('force', 'Force', 0.2, 2, 'x'),
    stat('efficiency', 'Efficiency', 0.5, 1.5, 'x')
  ],
  cilia: [
    stat('length', 'Length', 0.1, 0.6, 'radii'),
    stat('density', 'Density', 0.2, 1.5, 'x'),
    stat('rate', 'Beat rate', 0.5, 2, 'x')
  ],
  eye: [
    stat('range', 'Range', 0.3, 2, 'x'),
    stat('resolution', 'Resolution', 0.2, 2, 'x'),
    stat('fieldOfView', 'Field of view', 0.5, 6.28, 'rad')
  ],
  sniffer: [
    stat('range', 'Range', 0.3, 2, 'x'),
    stat('sensitivity', 'Sensitivity', 0.2, 2, 'x'),
    stat('selectivity', 'Food kind', 0, 1, 'kind')
  ],
  mouth: [
    stat('reach', 'Reach', 0.5, 2, 'x'),
    stat('gape', 'Gape', 0.3, 2, 'x'),
    stat('form', 'Form', 0, 1, 'form'),
    stat('rate', 'Bite rate', 0.5, 2, 'x')
  ],
  intestine: [
    stat('length', 'Length', 0.2, 2, 'x'),
    stat('absorption', 'Absorption', 0.2, 2, 'x'),
    stat('filter', 'Toxin filter', 0.2, 2, 'x')
  ],
  stomach: [
    stat('capacity', 'Capacity', 0.3, 2, 'x'),
    stat('throughput', 'Throughput', 0.3, 2, 'x')
  ],
  armor: [
    stat('thickness', 'Thickness', 0.05, 0.4, 'radii'),
    stat('coverage', 'Coverage', 0.2, 1.5, 'x'),
    stat('hardness', 'Hardness', 0.2, 2, 'x')
  ],
  membrane: [
    stat('insulation', 'Insulation', 0.2, 2, 'x'),
    stat('thickness', 'Thickness', 0.02, 0.2, 'radii')
  ],
  mender: [stat('rate', 'Rate', 0.3, 2, 'x'), stat('efficiency', 'Efficiency', 0.5, 1.5, 'x')],
  eyestalk: [
    stat('length', 'Length', 0.2, 1.2, 'radii'),
    stat('stiffness', 'Stiffness', 0.2, 2, 'x')
  ],
  gyro: [stat('stability', 'Stability', 0.2, 2, 'x')],
  lipid: [stat('reserve', 'Reserve', 0.3, 2, 'x')],
  pheromone: [stat('potency', 'Potency', 0.3, 2, 'x')],
  skeleton: [
    stat('rigidity', 'Rigidity', 0.2, 2, 'x'),
    stat('length', 'Length', 0.2, 1.2, 'radii')
  ],
  join: [stat('length', 'Length', 0.1, 1, 'radii'), stat('flexibility', 'Flexibility', 0.2, 2, 'x')]
}

/** The real-unit value of a stat gene. */
export function statValue(spec: PartStatSpec, gene: number): number {
  return spec.min + gene * (spec.max - spec.min)
}

/** The multiplier a stat gene applies to its part's nominal behavior: `0.5 + gene`, so 1 at the middle (the founder's value). */
export function statMultiplier(gene: number): number {
  return 0.5 + gene
}

/**
 * Whether a part type sits on the body's surface (`true`: anchored exactly on the outline at its
 * angle) or inside it (`false`: at `offset` times the outline radius at that angle).
 */
export const SURFACE_PARTS: Readonly<Record<PartType, boolean>> = {
  flagellum: true,
  cilia: true,
  eye: false,
  sniffer: true,
  mouth: true,
  intestine: false,
  stomach: false,
  armor: true,
  membrane: true,
  mender: false,
  eyestalk: true,
  gyro: false,
  lipid: false,
  pheromone: true,
  skeleton: false,
  join: true
}

/**
 * The mouth forms, ordered along a diet axis so that gene noise moves between neighbours: a grazer's
 * sprout, a nectar-sipping proboscis, the generalist mandible (the founder's), a fungus-scraping
 * radula and a carnivore's jaw. A mouth's `form` stat picks one by `floor(gene * 5)`.
 */
export const MOUTH_FORMS = ['sprout', 'proboscis', 'mandible', 'radula', 'jaw'] as const
export type MouthForm = (typeof MOUTH_FORMS)[number]

/** The form a `form` gene selects. */
export function mouthFormOf(gene: number): MouthForm {
  const index = Math.min(MOUTH_FORMS.length - 1, Math.max(0, Math.floor(gene * MOUTH_FORMS.length)))
  return MOUTH_FORMS[index] as MouthForm
}

/** The stat that gives a part a length along its axis, in body radii (children attach along it); parts without one have none. */
export const PART_EXTENT_STAT: Readonly<Partial<Record<PartType, string>>> = {
  flagellum: 'length',
  cilia: 'length',
  eyestalk: 'length',
  skeleton: 'length',
  join: 'length'
}

/** Genes that only change how a body is painted (no effect on fitness). */
export const VISUAL_FIELDS = ['pattern', 'accentHue'] as const
export type VisualField = (typeof VISUAL_FIELDS)[number]

/**
 * The body outline (ADR 0013): a closed star-shaped polygon of `count` points (5-16) around the
 * body centre. Point `i` has a radius gene and an angle gene; angles are placed inside the point's
 * own sector, so points never cross and the outline is always a simple polygon. The genes of
 * points beyond `count` still exist and mutate silently, like an empty part slot's.
 */
export const OUTLINE_MIN_POINTS = 5
export const OUTLINE_MAX_POINTS = 16
export const OUTLINE_MIN_RADIUS = 0.35

/** Total body genes: 12 slots x 14, the visual genes, the point count, then 16 radii and 16 angles. */
export const BODY_GENE_COUNT =
  BODY_SLOT_COUNT * SLOT_FIELDS.length + VISUAL_FIELDS.length + 1 + 2 * OUTLINE_MAX_POINTS

const TWO_PI = Math.PI * 2

export interface BodyGeneDefinition {
  /** `body.slotN.field` or `body.visual.field`. */
  readonly path: string
  readonly kind: GeneKind
  readonly min: number
  readonly max: number
  /** A gene that only changes how the creature is painted (see `GeneDefinition.cosmetic`). */
  readonly cosmetic?: true
}

const SLOT_RANGES: Readonly<Record<SlotField, { kind: GeneKind; min: number; max: number }>> = {
  present: { kind: 'bool', min: 0, max: 1 },
  type: { kind: 'int', min: 0, max: PART_TYPES.length - 1 },
  parent: { kind: 'int', min: 0, max: BODY_SLOT_COUNT },
  size: { kind: 'float', min: 0.1, max: 1 },
  angle: { kind: 'circular', min: 0, max: TWO_PI },
  offset: { kind: 'float', min: 0, max: 1 },
  orientation: { kind: 'circular', min: 0, max: TWO_PI },
  integrity: { kind: 'float', min: 0.1, max: 1 },
  s0: { kind: 'float', min: 0, max: 1 },
  s1: { kind: 'float', min: 0, max: 1 },
  s2: { kind: 'float', min: 0, max: 1 },
  s3: { kind: 'float', min: 0, max: 1 },
  s4: { kind: 'float', min: 0, max: 1 },
  s5: { kind: 'float', min: 0, max: 1 }
}

const VISUAL_RANGES: Readonly<Record<VisualField, { kind: GeneKind; min: number; max: number }>> = {
  pattern: { kind: 'int', min: 0, max: 3 },
  accentHue: { kind: 'circular', min: 0, max: 1 }
}

/**
 * Every body gene in its fixed canonical order: slot 0's seven genes, slot 1's, ..., slot 11's,
 * then the three visual genes. Append only; the order is part of the state hash.
 */
export const BODY_GENE_DEFINITIONS: readonly BodyGeneDefinition[] = (() => {
  const out: BodyGeneDefinition[] = []
  for (let slot = 0; slot < BODY_SLOT_COUNT; slot++) {
    for (const field of SLOT_FIELDS) {
      out.push({ path: `body.slot${slot}.${field}`, ...SLOT_RANGES[field] })
    }
  }
  for (const field of VISUAL_FIELDS) {
    out.push({ path: `body.visual.${field}`, ...VISUAL_RANGES[field], cosmetic: true })
  }
  out.push({
    path: 'body.outline.count',
    kind: 'int',
    min: OUTLINE_MIN_POINTS,
    max: OUTLINE_MAX_POINTS
  })
  for (let i = 0; i < OUTLINE_MAX_POINTS; i++) {
    out.push({ path: `body.outline.radius${i}`, kind: 'float', min: OUTLINE_MIN_RADIUS, max: 1 })
  }
  for (let i = 0; i < OUTLINE_MAX_POINTS; i++) {
    out.push({ path: `body.outline.angle${i}`, kind: 'float', min: 0, max: 1 })
  }
  return out
})()

/** Index of a slot gene in the body vector. */
export function slotGeneIndex(slot: number, field: SlotField): number {
  return slot * SLOT_FIELDS.length + SLOT_FIELDS.indexOf(field)
}

/** Index of a visual gene in the body vector. */
export function visualGeneIndex(field: VisualField): number {
  return BODY_SLOT_COUNT * SLOT_FIELDS.length + VISUAL_FIELDS.indexOf(field)
}

const OUTLINE_BASE = BODY_SLOT_COUNT * SLOT_FIELDS.length + VISUAL_FIELDS.length

/** Index of the outline point-count gene in the body vector. */
export const OUTLINE_COUNT_INDEX = OUTLINE_BASE

/** Index of point `i`'s radius gene. */
export function outlineRadiusIndex(point: number): number {
  return OUTLINE_BASE + 1 + point
}

/** Index of point `i`'s angle gene. */
export function outlineAngleIndex(point: number): number {
  return OUTLINE_BASE + 1 + OUTLINE_MAX_POINTS + point
}

/** An organism's body genes: one flat vector in `BODY_GENE_DEFINITIONS` order. */
export interface BodyGenome {
  readonly genes: readonly number[]
}

/**
 * One developed part (ADR 0016). Positions are in outline units (the body outline's own scale), in
 * the body frame (x forward, y left). The anchor is where the part attaches: on the outline, inside
 * it, or along its parent part; the axis is the absolute direction the part points (a flagellum's
 * tail trails along it, its force is the opposite way).
 */
export interface AnatomyPart {
  readonly slot: number
  readonly type: PartType
  /** Slot index of the part this one hangs from, or `-1` when it attaches to the body. */
  readonly parent: number
  readonly size: number
  /** Developmental quality in `[0.1, 1]`: scales what the part delivers (never its mass or upkeep). */
  readonly integrity: number
  /** The gene values `angle`, `offset` and `orientation`, as encoded. */
  readonly angle: number
  readonly offset: number
  readonly orientation: number
  /** The stat genes in `[0, 1]`, `PART_STAT_COUNT` of them (only the first few mean something for a given type). */
  readonly stats: readonly number[]
  /** The named stats in real units (`PART_STATS`), by key. */
  readonly statValues: Readonly<Record<string, number>>
  readonly x: number
  readonly y: number
  /** Absolute direction the part points, in radians from the front. */
  readonly axis: number
  /** The far end of the part along its axis (equal to the anchor for parts with no length). */
  readonly tipX: number
  readonly tipY: number
  /** `false` when a requirement is missing (a token, or the parent): the part has mass and upkeep but no capability. */
  readonly functional: boolean
}

/** The painted genes, decoded. */
export interface BodyLook {
  readonly pattern: number
  /** In turns, `[0, 1)`. */
  readonly accentHue: number
}

/** The developed outline (`developOutline`): the creature's silhouette and what it costs to be that shape. */
export interface BodyOutline {
  /** Points around the body, counter-clockwise from the front, in body-radius units (x forward, y left). */
  readonly points: readonly { readonly x: number; readonly y: number }[]
  readonly area: number
  /** Radius of the circle with the same area: the body's size. */
  readonly areaRadius: number
  readonly perimeter: number
  /** `perimeter / (2 pi areaRadius)`: 1 for a circle, more for a spiky body (drag). */
  readonly roughness: number
}

/** The founder outline's genes (`anatomy.founderOutline`). */
export interface FounderOutline {
  /** Point count, 5-16. */
  count: number
  /** 16 radius genes, 0.35-1. */
  radii: number[]
  /** 16 angle genes, 0-1 (the position inside the point's sector). */
  angles: number[]
}

/** The result of development (`developAnatomy`). Derived from the genome, never hashed. */
export interface Anatomy {
  readonly outline: BodyOutline
  readonly parts: readonly AnatomyPart[]
  /** Slots that carry a part but did not develop because the structural budget was spent. */
  readonly undeveloped: readonly number[]
  /** Total `size` of developed parts. */
  readonly sizeUsed: number
  /** The structural budget this body had: the configured one plus what its skeletons added (ADR 0016). */
  readonly budget: number
  readonly look: BodyLook
}

/**
 * What one eye sees (ADR 0016 "Directional vision"): a cone about its axis. `axisCos`/`axisSin` give
 * the axis in the body frame (heading 0), `cosHalf` is the cosine of the cone's half-angle (so a
 * target is inside when `dot >= distance * cosHalf`, with no inverse trigonometry), and `reach` is
 * how far it sees as a multiple of the baseline sensor radius (relative to the founder in
 * `CapabilityFactors`).
 */
export interface VisionCone {
  /** The slot of the eye this cone belongs to, so a part can find its own sight. */
  readonly slot: number
  readonly axisCos: number
  readonly axisSin: number
  readonly cosHalf: number
  /** The half-angle in radians (`pi` for an all-round eye), for drawing the cone. */
  readonly half: number
  readonly reach: number
}

/**
 * How a body sees. `omni` bodies (no eye, or only all-round eyes) see a circle and take the plain
 * perception path; the others see an all-round `floor` (the touch radius) plus each eye's cone.
 */
export interface Vision {
  readonly omni: boolean
  /** The all-round touch radius, in the same unit as the cones' `reach`. */
  readonly floor: number
  readonly cones: readonly VisionCone[]
}

/** Raw capabilities of a body (ADR 0012 "Capabilities"). */
export interface Capabilities {
  readonly mass: number
  /** Energy per second for keeping the parts, dormant ones included. */
  readonly upkeep: number
  readonly forwardThrust: number
  readonly lateralThrust: number
  readonly torque: number
  /** Sense range as a multiple of the baseline (never below the touch floor). */
  readonly senseRange: number
  /** Detection multiplier per food kind (at least 1). */
  readonly foodDetection: readonly number[]
  readonly reach: number
  readonly digestion: number
  /** In `[0, 1)`: the share of toxin damage the intestines absorb. */
  readonly toxinTolerance: number
  readonly energyCapacity: number
  /** Multiplier on damage taken, in `(0, 1]`. */
  readonly damageTaken: number
  readonly temperatureTolerance: number
  readonly regeneration: number
  /** Bite size: the sum over functional mouths of `power * gape`; zero without a mouth (ADR 0017). */
  readonly biteSize: number
  /** Bite rate: the sum over functional mouths of `power * rate`. */
  readonly biteRate: number
  /** How fast the gut empties into energy: intestines and stomachs (ADR 0017). */
  readonly absorption: number
  /** Energy yield per food kind: the power-weighted mean of the mouth forms' efficiencies (1 without a mouth). */
  readonly dietEfficiency: readonly number[]
  /** Whether any mouth works. A body without one cannot bite (ADR 0017). */
  readonly hasMouth: boolean
  /** How far this body's mating signal carries, as a multiple of the baseline: `1 + glands`, capped. */
  readonly mateSignal: number
  /** Where this body sees: one cone per working eye (ADR 0016). */
  readonly vision: Vision
}

/** Capabilities relative to the founder body plan: 1 means "exactly the founder". */
export interface CapabilityFactors {
  /** Thrust per unit mass, forward. */
  readonly speed: number
  readonly strafe: number
  readonly turn: number
  readonly senseRange: number
  readonly foodDetection: readonly number[]
  readonly reach: number
  readonly digestion: number
  /** Multiplier on toxin damage taken (below 1 for a body that tolerates more than the founder). */
  readonly toxinDamage: number
  readonly energyCapacity: number
  /** Multiplier on hazard damage taken (below 1 for a body with more armor than the founder). */
  readonly damageTaken: number
  readonly temperatureTolerance: number
  readonly regeneration: number
  /** Extra energy per second compared with the founder (negative for a cheaper body). */
  readonly upkeepDelta: number
  readonly biteSize: number
  readonly biteRate: number
  readonly absorption: number
  /** Energy yield of each food kind: 1 is the generalist's, the mouth form's diet scales it (not relative to the founder). */
  readonly dietEfficiency: readonly number[]
  readonly hasMouth: boolean
  /** Reach of this body's mating signal against the founder's (1 without a gland). */
  readonly mateSignal: number
  /** The cones and touch radius, with reach relative to the founder's sense range. */
  readonly vision: Vision
}

/**
 * What the newer parts do (ADR 0016), each provisional: how much an eye on an eyestalk gains, the
 * torque a gyro adds, the energy a lipid store holds, how far a pheromone gland carries the mating
 * signal (and the most any body can reach), and the structural budget a skeleton adds.
 */
export interface PartEffectsConfig {
  /** An eye on an eyestalk gains `eyestalkLift * m(length)` of range multiplier. */
  readonly eyestalkLift: number
  /** Torque added per unit of gyro power, with no thrust. */
  readonly gyroTorque: number
  /** Energy capacity added per unit of lipid power. */
  readonly lipidCapacity: number
  /** Mating signal range added per unit of pheromone power. */
  readonly pheromoneSignal: number
  /** The most a body's mating signal can reach, as a multiple of the baseline (`>= 1`). */
  readonly pheromoneCap: number
  /** Structural budget added per unit of skeleton rigidity, for the slots after it. */
  readonly skeletonBudget: number
  /**
   * How much a narrower eye gains in reach, in `[0, 1]`: an eye of field of view `f` reaches
   * `1 + visionNarrowing * (sqrt(full / f) - 1)` times as far as an all-round one, so 0 is no
   * trade and 1 is the square-root law (a 90 degree cone reaches about 2.6 times as far).
   */
  readonly visionNarrowing: number
}

/** Balance numbers for one part type, per unit of `size`. */
export interface PartConfig {
  /** Mass added by the part (`>= 0`). */
  readonly mass: number
  /** Energy per second to keep the part (`>= 0`). */
  readonly upkeep: number
  /** Capability coefficient (`> 0`). */
  readonly strength: number
}

/** One part of the founder body plan; founder slot `i` is `founder[i]`. */
export interface FounderPart {
  readonly type: PartType
  /** 0 for the body, or `k` for the part in founder slot `k - 1` (a lower slot). */
  readonly parent: number
  readonly size: number
  readonly angle: number
  readonly offset: number
  readonly orientation: number
  readonly integrity: number
  /** Stat genes in `[0, 1]`; at most `PART_STAT_COUNT`, missing ones are 0.5 (the middle, a multiplier of 1). */
  readonly stats: readonly number[]
}

/**
 * One starting body (an archetype): the same plan as the founder (`anatomy.founder`,
 * `founderLook`, `founderOutline`) under a name. A world with `startingBody.mode: 'archetypes'`
 * draws one of these from its seed and every founder of that world starts with it.
 */
export interface StartingBody {
  /** Unique, non-empty; what a forced `startingBody.archetype` names and what the interface shows. */
  readonly name: string
  /** One sentence for people. */
  readonly description: string
  readonly parts: FounderPart[]
  readonly look: BodyLook
  readonly outline: FounderOutline
}

/** Which body the founders of a world start with. */
export type StartingBodyMode = 'reference' | 'archetypes'

export interface StartingBodyConfig {
  /**
   * `reference`: every world starts with the founder plan itself (`anatomy.founder`), as before
   * archetypes existed, and draws nothing. `archetypes`: the world draws one entry of
   * `anatomy.starters` (one draw from the `genetics` stream, always, so forcing one does not shift
   * the streams).
   */
  mode: StartingBodyMode
  /** In `archetypes` mode, the name of the starter to use instead of the drawn one; `null` lets the seed choose. */
  archetype: string | null
}

export interface AnatomyMutationConfig {
  /** Chance per slot per birth that `present` flips. */
  presenceRate: number
  /** Chance per slot per birth that the part's `type` changes. */
  typeRate: number
  /**
   * How new parts and new part types arise. `true`: a slot that wakes up (its `present` gene turns
   * on) takes a random part type, size, placement and stats, and a type change jumps to any other
   * type with equal chance, so every part type can appear. `false`: the earlier behaviour, in which
   * a woken slot expressed its latent genes (a flagellum for a slot the founder leaves empty) and a
   * type change stepped to the neighbouring type in the list.
   */
  openTypes: boolean
  /** Chance per slot per birth that `parent` steps by one (a part moves to another parent). */
  parentRate: number
  /** Chance per continuous slot gene per birth. */
  continuousRate: number
  /** Gaussian step as a fraction of the gene's range. */
  continuousStd: number
  /** Chance per visual gene per birth. */
  visualRate: number
  /** Chance per outline gene (point count, radii, angles) per birth. */
  outlineRate: number
}

export interface AnatomyConfig {
  /**
   * `false`: the body genes are inert (every genome carries the founder body, nothing mutates or
   * draws from the `anatomy` stream). `true`: they recombine, mutate and inherit like other genes.
   */
  enabled: boolean
  /** Total part `size` a body can carry; parts beyond it do not develop. */
  structuralBudget: number
  /** Mass of the body itself at the baseline radius. */
  bodyMass: number
  /** Sense range of a body with no eyes, as a fraction of the baseline (it still touches what it is on). */
  senseFloor: number
  mutation: AnatomyMutationConfig
  parts: Record<PartType, PartConfig>
  /** What the newer parts do. */
  effects: PartEffectsConfig
  /** The body plan every founder starts with: slot `i` is `founder[i]`, the rest are empty. */
  founder: FounderPart[]
  /** The founders' painted genes. */
  founderLook: BodyLook
  /** The founders' outline. */
  founderOutline: FounderOutline
  /**
   * The founder plan above is also **the reference** every capability is measured against (1 is the
   * founder), whatever body a world starts with. These are the bodies worlds can start with instead.
   */
  starters: StartingBody[]
  /** Which of them a world starts with. */
  startingBody: StartingBodyConfig
  /**
   * Extra movement cost per unit of outline roughness above the founder's (ADR 0013): a spiky
   * body drags. Zero turns the drag off; the founder outline itself always costs exactly nothing extra.
   */
  outlineDrag: number
  /**
   * Energy yield of each mouth form on each food kind, by kind name (a kind that is not listed
   * counts as 1). The mandible is the generalist and must be 1 everywhere so the founder is exactly neutral.
   */
  mouthForms: Record<MouthForm, Record<string, number>>
}

/** Overrides merge field by field; `parts` merges per type, and `founder` and `starters` are replaced whole. */
export interface AnatomyConfigOverrides {
  enabled?: boolean
  structuralBudget?: number
  bodyMass?: number
  senseFloor?: number
  mutation?: Partial<AnatomyMutationConfig>
  parts?: { [K in PartType]?: Partial<PartConfig> }
  effects?: Partial<PartEffectsConfig>
  founder?: FounderPart[]
  founderLook?: Partial<BodyLook>
  founderOutline?: Partial<FounderOutline>
  starters?: StartingBody[]
  startingBody?: Partial<StartingBodyConfig>
  outlineDrag?: number
  mouthForms?: { [F in MouthForm]?: Record<string, number> }
}

/** What `World.anatomyOf` hands out: the developed body, its raw capabilities, and them relative to the founder. */
export interface AnatomyView {
  readonly anatomy: Anatomy
  readonly capabilities: Capabilities
  readonly factors: CapabilityFactors
}
