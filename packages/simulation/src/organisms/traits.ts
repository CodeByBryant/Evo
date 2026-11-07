import type { Genome, PartSnapshot, WorldConfig } from '@evo/contracts'
import { outlineDragOf, outlineOf, outlineScaleOf } from '../development/outline'
import { developAnatomy } from '../development/develop'
import { factorsOf } from './bodyFactors'

/**
 * Quantities derived from an organism's genes rather than stored as genes, so that no capability
 * is free: a bigger body holds more energy and burns more, and a longer sensor costs more to
 * run (docs/decisions/0006). `config.organisms` holds the founder baseline each is scaled from,
 * and at the baseline genome every function returns exactly its Phase 3 value (the ratios are
 * exactly 1), which is what keeps the genome refactor behavior-preserving.
 */

/**
 * The body radius: the `radius` gene scaled by the outline (ADR 0013), whose area-equivalent
 * radius is compared with the founder outline's. Exactly the gene for a founder outline, which is
 * what every world with `anatomy.enabled: false` carries.
 */
export function bodyRadiusOf(genome: Genome, config: WorldConfig): number {
  return genome.physical.radius * outlineScaleOf(genome.body.genes, config.anatomy)
}

/** Multiplier on movement energy for the outline's roughness; exactly 1 for the founder outline. */
export function outlineDragFactor(genome: Genome, config: WorldConfig): number {
  return outlineDragOf(genome.body.genes, config.anatomy)
}

/** `(bodyRadius / baseRadius)^2`, by multiplication (`**` is banned in the engine). */
export function sizeFactor(genome: Genome, config: WorldConfig): number {
  const ratio = bodyRadiusOf(genome, config) / config.organisms.radius
  return ratio * ratio
}

/** Energy capacity of a fully grown organism. */
export function maxEnergyOf(genome: Genome, config: WorldConfig): number {
  return (
    config.organisms.maxEnergy *
    sizeFactor(genome, config) *
    factorsOf(genome, config).energyCapacity
  )
}

/** The sensor radius: the baseline range scaled by the eyes (docs/decisions/0015). */
export function sensorRadiusOf(genome: Genome, config: WorldConfig): number {
  return config.organisms.sensorRadius * factorsOf(genome, config).senseRange
}

/** Energy per second just for being alive; grows with body size. */
export function basalCostOf(genome: Genome, config: WorldConfig): number {
  return genome.metabolic.basalCost * sizeFactor(genome, config)
}

/** Energy per second for maintaining senses; grows with sensor radius. */
export function sensorCostOf(genome: Genome, config: WorldConfig): number {
  return config.organisms.sensorCost * factorsOf(genome, config).senseRange
}

/**
 * Energy per second for learning: the world's `learningCost` scaled by the organism's
 * `learningRate` gene relative to the founder baseline, so a faster learner pays more. Zero
 * unless the brain controller is active with learning enabled (docs/learning/brain.md).
 */
export function learningCostOf(genome: Genome, config: WorldConfig): number {
  if (config.learning.controller !== 'brain' || !config.learning.enabled) return 0
  return (
    config.organisms.learningCost *
    (genome.learning.learningRate / config.genetics.learning.learningRate)
  )
}

/** What a parent pays for a successful reproduction: its investment plus the transfer overhead. */
export function reproductionCostOf(genome: Genome, config: WorldConfig): number {
  return genome.reproduction.offspringInvestment * (1 + config.reproduction.overheadFraction)
}

/**
 * The energy an organism needs to attempt reproduction: its own `minEnergy` gene, but never less
 * than the cost it would pay, so paying can never drive its energy negative.
 */
export function reproductionThresholdOf(genome: Genome, config: WorldConfig): number {
  return Math.max(genome.reproduction.minEnergy, reproductionCostOf(genome, config))
}

/** Health capacity: `ecology.health.maxHealth` scaled by the body-size factor (bigger bodies are sturdier). */
export function maxHealthOf(genome: Genome, config: WorldConfig): number {
  return config.ecology.health.maxHealth * sizeFactor(genome, config)
}

const drawn = new WeakMap<readonly number[], { radius: number; flat: readonly number[] }>()

/**
 * The outline for drawing: flat `x, y` pairs in world units, scaled so the area-equivalent radius
 * is the body radius. Remembered per body-gene array (it never changes for an organism).
 */
export function drawnOutlineOf(genome: Genome, config: WorldConfig): readonly number[] {
  const radius = bodyRadiusOf(genome, config)
  const known = drawn.get(genome.body.genes)
  if (known !== undefined && known.radius === radius) return known.flat
  const outline = outlineOf(genome.body.genes)
  const factor = radius / outline.areaRadius
  const flat: number[] = []
  for (const point of outline.points) flat.push(point.x * factor, point.y * factor)
  drawn.set(genome.body.genes, { radius, flat })
  return flat
}

const drawnParts = new WeakMap<
  readonly number[],
  { radius: number; parts: readonly PartSnapshot[] }
>()

/**
 * The developed parts for drawing, in world units relative to the centre and on the same scale as
 * the drawn outline, so a part sits where it was placed on the body. Remembered per body-gene
 * array, so every snapshot of one organism shares one array.
 */
export function drawnPartsOf(genome: Genome, config: WorldConfig): readonly PartSnapshot[] {
  const radius = bodyRadiusOf(genome, config)
  const known = drawnParts.get(genome.body.genes)
  if (known !== undefined && known.radius === radius) return known.parts
  const factor = radius / outlineOf(genome.body.genes).areaRadius
  const parts = developAnatomy(genome.body.genes, config.anatomy).parts.map((part) => ({
    type: part.type,
    x: part.x * factor,
    y: part.y * factor,
    radius: 0.2 * radius * Math.sqrt(part.size),
    orientation: part.axis,
    functional: part.functional
  }))
  drawnParts.set(genome.body.genes, { radius, parts })
  return parts
}
