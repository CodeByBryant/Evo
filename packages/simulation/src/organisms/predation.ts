import type { Genome, WorldConfig } from '@evo/contracts'
import type { OrganismState } from '../entities/OrganismStore'
import { lifeStageFor } from './lifeStage'
import { mouthsOf } from './mouths'
import { bodyRadiusOf } from './traits'

const known = new WeakMap<readonly number[], { readonly config: object; readonly bites: boolean }>()

/**
 * Whether a body can bite creatures (ADR 0023): any working mouth whose form has a flesh yield.
 * Remembered per body-gene array, like the mouths themselves.
 */
export function bitesCreatures(genome: Genome, config: WorldConfig): boolean {
  const cached = known.get(genome.body.genes)
  if (cached !== undefined && cached.config === config.predation) return cached.bites
  const { fleshYield } = config.predation
  const bites = mouthsOf(genome, config).some((mouth) => fleshYield[mouth.form] > 0)
  known.set(genome.body.genes, { config: config.predation, bites })
  return bites
}

/** The organism's body radius now: a juvenile is smaller (as for eating and movement). */
export function currentRadiusOf(organism: OrganismState, config: WorldConfig): number {
  const scale =
    lifeStageFor(organism.age, organism.genome.physical) === 'juvenile'
      ? config.organisms.juvenileSizeScale
      : 1
  return bodyRadiusOf(organism.genome, config) * scale
}

/**
 * Whether `predator` could bite `candidate` if it were in reach: not itself, alive, not a parent
 * or child, the predator's body can bite creatures, and the candidate is no bigger than
 * `predation.maxPreyRatio` times the predator. Reach, the cone and obstacles are the caller's.
 */
export function canBite(
  predator: OrganismState,
  candidate: OrganismState,
  config: WorldConfig
): boolean {
  if (candidate.id === predator.id || candidate.health <= 0) return false
  if (predator.parentIds.includes(candidate.id) || candidate.parentIds.includes(predator.id)) {
    return false
  }
  if (!bitesCreatures(predator.genome, config)) return false
  return (
    currentRadiusOf(candidate, config) <=
    config.predation.maxPreyRatio * currentRadiusOf(predator, config)
  )
}

/** What `viewer` makes of `other`: something to hunt, something to flee, or neither. */
export type PeerRole = 'prey' | 'threat' | 'none'

/**
 * `other` is prey if the viewer could bite it. It is a threat if it could bite the viewer, unless
 * the viewer could bite it back and is at least as big (two similar hunters meet as hunters, a
 * smaller one runs from a bigger one).
 */
export function peerRole(
  viewer: OrganismState,
  other: OrganismState,
  config: WorldConfig
): PeerRole {
  const iBite = canBite(viewer, other, config)
  const itBites = canBite(other, viewer, config)
  if (itBites && !(iBite && currentRadiusOf(viewer, config) >= currentRadiusOf(other, config))) {
    return 'threat'
  }
  return iBite ? 'prey' : 'none'
}
