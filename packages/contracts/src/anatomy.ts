import type { GeneKind } from './genome'

/**
 * Anatomy (docs/decisions/0012-anatomy.md): a body is up to twelve parts of ten types, encoded as
 * a fixed set of genes, turned into an `Anatomy` by deterministic development, and from there into
 * capabilities. This file is the contract: the vocabulary, the gene layout, the data the engine
 * hands out, and the configuration.
 */

/** The ten part types, in the fixed order of the `type` gene (a one-step mutation lands on a related part). */
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
  'mender'
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
  { type: 'mender', requires: ['digestion'], provides: [] }
]

/** Number of part slots on a body. */
export const BODY_SLOT_COUNT = 12

/** The genes of one slot, in order. */
export const SLOT_FIELDS = [
  'present',
  'type',
  'size',
  'angle',
  'offset',
  'orientation',
  'param'
] as const
export type SlotField = (typeof SLOT_FIELDS)[number]

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

/** Total body genes: 12 slots x 7, the visual genes, the point count, then 16 radii and 16 angles. */
export const BODY_GENE_COUNT =
  BODY_SLOT_COUNT * SLOT_FIELDS.length + VISUAL_FIELDS.length + 1 + 2 * OUTLINE_MAX_POINTS

const TWO_PI = Math.PI * 2

export interface BodyGeneDefinition {
  /** `body.slotN.field` or `body.visual.field`. */
  readonly path: string
  readonly kind: GeneKind
  readonly min: number
  readonly max: number
}

const SLOT_RANGES: Readonly<Record<SlotField, { kind: GeneKind; min: number; max: number }>> = {
  present: { kind: 'bool', min: 0, max: 1 },
  type: { kind: 'int', min: 0, max: PART_TYPES.length - 1 },
  size: { kind: 'float', min: 0.1, max: 1 },
  angle: { kind: 'circular', min: 0, max: TWO_PI },
  offset: { kind: 'float', min: 0, max: 1 },
  orientation: { kind: 'circular', min: 0, max: TWO_PI },
  param: { kind: 'float', min: 0, max: 1 }
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
    out.push({ path: `body.visual.${field}`, ...VISUAL_RANGES[field] })
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

/** One developed part. Positions are in body-radius units, in the body frame (x forward, y left). */
export interface AnatomyPart {
  readonly slot: number
  readonly type: PartType
  readonly size: number
  readonly angle: number
  readonly offset: number
  readonly orientation: number
  readonly param: number
  readonly x: number
  readonly y: number
  /** `false` when a requirement is missing: the part has mass and upkeep but no capability. */
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
  readonly look: BodyLook
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
  readonly size: number
  readonly angle: number
  readonly offset: number
  readonly orientation: number
  readonly param: number
}

export interface AnatomyMutationConfig {
  /** Chance per slot per birth that `present` flips. */
  presenceRate: number
  /** Chance per slot per birth that `type` steps by one. */
  typeRate: number
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
  /** The body plan every founder starts with: slot `i` is `founder[i]`, the rest are empty. */
  founder: FounderPart[]
  /** The founders' painted genes. */
  founderLook: BodyLook
  /** The founders' outline. */
  founderOutline: FounderOutline
  /**
   * Extra movement cost per unit of outline roughness above the founder's (ADR 0013): a spiky
   * body drags. Zero turns the drag off; the founder outline itself always costs exactly nothing extra.
   */
  outlineDrag: number
}

/** Overrides merge field by field; `parts` merges per type and `founder` is replaced whole. */
export interface AnatomyConfigOverrides {
  enabled?: boolean
  structuralBudget?: number
  bodyMass?: number
  senseFloor?: number
  mutation?: Partial<AnatomyMutationConfig>
  parts?: { [K in PartType]?: Partial<PartConfig> }
  founder?: FounderPart[]
  founderLook?: Partial<BodyLook>
  founderOutline?: Partial<FounderOutline>
  outlineDrag?: number
}

/** What `World.anatomyOf` hands out: the developed body, its raw capabilities, and them relative to the founder. */
export interface AnatomyView {
  readonly anatomy: Anatomy
  readonly capabilities: Capabilities
  readonly factors: CapabilityFactors
}
