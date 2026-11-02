import type {
  Anatomy,
  AnatomyConfig,
  AnatomyPart,
  AnatomyView,
  Capabilities,
  CapabilityFactors
} from '@evo/contracts'
import { cos, sin } from '../math/trig'

/** Which food kind a sniffer favors: its `param` spread over the kinds. */
export function sniffedKind(param: number, kindCount: number): number {
  return Math.min(kindCount - 1, Math.max(0, Math.floor(param * kindCount)))
}

/** A functional part's contribution scale, `strength * size` (zero for a dormant part). */
function power(part: AnatomyPart, config: AnatomyConfig): number {
  return part.functional ? config.parts[part.type].strength * part.size : 0
}

/**
 * What a body can do (ADR 0012 "Capabilities"). Pure arithmetic on the developed parts.
 *
 * - **Mass and upkeep** count every developed part, dormant ones included, so a useless part is a
 *   pure cost. `bodyScale` is the body's own size factor (radius squared over the baseline).
 * - **Thrust** comes from flagella and cilia and depends on where a part is and which way it
 *   pushes: forward is the part's force along the heading, lateral across it, and torque is the
 *   moment of the force about the centre, `|x * Fy - y * Fx|`.
 * - Every other capability is a saturating or additive function of the functional parts of its
 *   type, weighted by `size` and, where it makes sense, `0.5 + param`.
 *
 * The functions use only `+ - * /` and `sqrt` plus the engine's own `cos` and `sin`, so the
 * result is identical on every platform.
 */
export function capabilitiesOf(
  anatomy: Anatomy,
  config: AnatomyConfig,
  bodyScale: number,
  kindCount: number
): Capabilities {
  let mass = config.bodyMass * bodyScale
  let upkeep = 0
  let forwardThrust = 0
  let lateralThrust = 0
  let torque = 0
  let eyes = 0
  const detection = new Array<number>(Math.max(1, kindCount)).fill(1)
  let reach = 1
  let digestion = 1
  let toleranceSum = 0
  let energyCapacity = 1
  let armor = 0
  let temperatureTolerance = 1
  let regeneration = 1

  for (const part of anatomy.parts) {
    const balance = config.parts[part.type]
    mass += balance.mass * part.size
    upkeep += balance.upkeep * part.size
    const p = power(part, config)
    if (p === 0) continue
    const trait = 0.5 + part.param
    switch (part.type) {
      case 'flagellum':
      case 'cilia': {
        const fx = cos(part.orientation)
        const fy = sin(part.orientation)
        forwardThrust += p * Math.max(0, fx)
        lateralThrust += p * Math.abs(fy)
        torque += p * Math.abs(part.x * fy - part.y * fx)
        break
      }
      case 'eye':
        eyes += p * trait
        break
      case 'sniffer': {
        const kind = sniffedKind(part.param, detection.length)
        detection[kind] = (detection[kind] as number) + p
        break
      }
      case 'mouth':
        reach += p * trait
        break
      case 'intestine':
        digestion += p
        toleranceSum += p * trait
        break
      case 'stomach':
        energyCapacity += p
        break
      case 'armor':
        armor += p * trait
        break
      case 'membrane':
        temperatureTolerance += p
        break
      case 'mender':
        regeneration += p
        break
    }
  }

  return {
    mass,
    upkeep,
    forwardThrust,
    lateralThrust,
    torque,
    senseRange: config.senseFloor + Math.sqrt(eyes),
    foodDetection: detection,
    reach,
    digestion,
    toxinTolerance: toleranceSum / (1 + toleranceSum),
    energyCapacity,
    damageTaken: 1 / (1 + armor),
    temperatureTolerance,
    regeneration
  }
}

/** `value / founder`, or neutral when the founder has none of the quantity (it cannot be compared). */
function relative(value: number, founder: number): number {
  return founder > 0 ? value / founder : 1
}

/**
 * Capabilities relative to a founder body: 1 means exactly the founder. The founder compared with
 * itself is exactly 1 for every factor (the same arithmetic divided by itself, or a difference of
 * identical numbers), which is what lets anatomy be switched on without changing behavior until a
 * body actually differs (ADR 0012).
 */
export function capabilityFactors(
  capabilities: Capabilities,
  founder: Capabilities
): CapabilityFactors {
  return {
    speed: relative(
      capabilities.forwardThrust / capabilities.mass,
      founder.forwardThrust / founder.mass
    ),
    strafe: relative(
      capabilities.lateralThrust / capabilities.mass,
      founder.lateralThrust / founder.mass
    ),
    turn: relative(capabilities.torque / capabilities.mass, founder.torque / founder.mass),
    senseRange: relative(capabilities.senseRange, founder.senseRange),
    foodDetection: capabilities.foodDetection.map((value, kind) =>
      relative(value, founder.foodDetection[kind] ?? 1)
    ),
    reach: relative(capabilities.reach, founder.reach),
    digestion: relative(capabilities.digestion, founder.digestion),
    toxinDamage: relative(1 - capabilities.toxinTolerance, 1 - founder.toxinTolerance),
    energyCapacity: relative(capabilities.energyCapacity, founder.energyCapacity),
    damageTaken: relative(capabilities.damageTaken, founder.damageTaken),
    temperatureTolerance: relative(capabilities.temperatureTolerance, founder.temperatureTolerance),
    regeneration: relative(capabilities.regeneration, founder.regeneration),
    upkeepDelta: capabilities.upkeep - founder.upkeep
  }
}

/** The whole view of one body: the anatomy, its capabilities, and them relative to the founder. */
export function viewOf(
  anatomy: Anatomy,
  founder: Capabilities,
  config: AnatomyConfig,
  bodyScale: number,
  kindCount: number
): AnatomyView {
  const capabilities = capabilitiesOf(anatomy, config, bodyScale, kindCount)
  return { anatomy, capabilities, factors: capabilityFactors(capabilities, founder) }
}
