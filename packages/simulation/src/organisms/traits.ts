import type { Genome, WorldConfig } from '@evo/contracts'

/**
 * Quantities derived from an organism's genes rather than stored as genes, so that no capability
 * is free: a bigger body holds more energy and burns more, and a longer sensor costs more to
 * run (docs/decisions/0006). `config.organisms` holds the founder baseline each is scaled from,
 * and at the baseline genome every function returns exactly its Phase 3 value (the ratios are
 * exactly 1), which is what keeps the genome refactor behavior-preserving.
 */

/** `(radius / baseRadius)^2`, by multiplication (`**` is banned in the engine). */
export function sizeFactor(genome: Genome, config: WorldConfig): number {
  const ratio = genome.physical.radius / config.organisms.radius
  return ratio * ratio
}

/** Energy capacity of a fully grown organism. */
export function maxEnergyOf(genome: Genome, config: WorldConfig): number {
  return config.organisms.maxEnergy * sizeFactor(genome, config)
}

/** Energy per second just for being alive; grows with body size. */
export function basalCostOf(genome: Genome, config: WorldConfig): number {
  return genome.metabolic.basalCost * sizeFactor(genome, config)
}

/** Energy per second for maintaining senses; grows with sensor radius. */
export function sensorCostOf(genome: Genome, config: WorldConfig): number {
  return config.organisms.sensorCost * (genome.sensory.sensorRadius / config.organisms.sensorRadius)
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
