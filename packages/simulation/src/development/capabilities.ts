import { PART_STATS, mouthFormOf, statMultiplier } from '@evo/contracts'
import type {
  Anatomy,
  AnatomyConfig,
  AnatomyPart,
  AnatomyView,
  Capabilities,
  CapabilityFactors,
  PartType
} from '@evo/contracts'
import { cos, sin } from '../math/trig'

/** Which food kind a sniffer favors: its selectivity (a gene in `[0, 1]`) spread over the kinds. */
export function sniffedKind(selectivity: number, kindCount: number): number {
  return Math.min(kindCount - 1, Math.max(0, Math.floor(selectivity * kindCount)))
}

/** The position of a stat in its part type's table (the `sN` gene it is stored in). */
function statIndex(type: PartType, key: string): number {
  return PART_STATS[type].findIndex((spec) => spec.key === key)
}

/**
 * A stat's multiplier on its part's nominal behavior: `0.5 + gene`, so exactly 1 at the middle of
 * its range (the founder's value) and between 0.5 and 1.5 at the ends. Stats the part type does
 * not have count as 1.
 */
function mult(part: AnatomyPart, key: string): number {
  const index = statIndex(part.type, key)
  return index < 0 ? 1 : statMultiplier(part.stats[index] as number)
}

/**
 * A functional part's contribution scale, `strength * size * integrity` (zero for a dormant part).
 * Integrity is developmental quality: a deformed part delivers less but still weighs and costs.
 */
function power(part: AnatomyPart, config: AnatomyConfig): number {
  return part.functional ? config.parts[part.type].strength * part.size * part.integrity : 0
}

/**
 * What a body can do (ADR 0012 "Capabilities", ADR 0016 "Stats"). Pure arithmetic on the developed
 * parts.
 *
 * - **Mass and upkeep** count every developed part, dormant ones included, so a useless part is a
 *   pure cost; a part's own dimensions scale its mass (longer, thicker, bigger is heavier) and its
 *   force, rate or range scale its upkeep, so every strong stat has a price. `bodyScale` is the
 *   body's own size factor (radius squared over the baseline).
 * - **Thrust** comes from flagella and cilia. A tail trails along the part's axis and the push is
 *   the opposite way: forward is the force along the heading, lateral across it, and torque is the
 *   moment of the force about the centre, `|x * Fy - y * Fx|`, taken at the part's anchor.
 * - Every other capability is a saturating or additive function of the functional parts of its
 *   type, weighted by `size`, `integrity` and the part's own stats.
 *
 * The functions use only `+ - * /` and `sqrt` plus the engine's own `cos` and `sin`, so the
 * result is identical on every platform.
 */
export function capabilitiesOf(
  anatomy: Anatomy,
  config: AnatomyConfig,
  bodyScale: number,
  kindCount: number,
  /** The food kinds' names, to look up each mouth form's yield; a kind not named counts as 1. */
  kindNames: readonly string[] = []
): Capabilities {
  let mass = config.bodyMass * bodyScale
  let upkeep = 0
  let forwardThrust = 0
  let lateralThrust = 0
  let torque = 0
  let eyes = 0
  let resolution = 0
  const detection = new Array<number>(Math.max(1, kindCount)).fill(1)
  let reach = 1
  let digestion = 1
  let toleranceSum = 0
  let energyCapacity = 1
  let armor = 0
  let temperatureTolerance = 1
  let regeneration = 1
  let biteSize = 0
  let biteRate = 0
  let absorption = 1
  let mouthPower = 0
  const dietSum = new Array<number>(Math.max(1, kindCount)).fill(0)

  for (const part of anatomy.parts) {
    const balance = config.parts[part.type]
    let massScale = 1
    let upkeepScale = 1
    switch (part.type) {
      case 'flagellum':
        massScale = (0.5 + 0.5 * mult(part, 'length')) * (0.5 + 0.5 * mult(part, 'thickness'))
        upkeepScale = (mult(part, 'force') * mult(part, 'force')) / mult(part, 'efficiency')
        break
      case 'cilia':
        massScale = (0.5 + 0.5 * mult(part, 'length')) * (0.5 + 0.5 * mult(part, 'density'))
        upkeepScale = mult(part, 'rate')
        break
      case 'eye':
        upkeepScale = mult(part, 'range') * mult(part, 'resolution')
        break
      case 'sniffer':
        upkeepScale = 0.5 * (mult(part, 'range') + mult(part, 'sensitivity'))
        break
      case 'mouth':
        massScale = 0.5 + 0.5 * mult(part, 'gape')
        upkeepScale = mult(part, 'rate')
        break
      case 'intestine':
        massScale = 0.5 + 0.5 * mult(part, 'length')
        break
      case 'stomach':
        massScale = 0.5 + 0.5 * mult(part, 'capacity')
        break
      case 'armor':
        massScale = (0.5 + 0.5 * mult(part, 'thickness')) * (0.5 + 0.5 * mult(part, 'coverage'))
        break
      case 'membrane':
        massScale = 0.5 + 0.5 * mult(part, 'thickness')
        break
      case 'mender':
        upkeepScale = mult(part, 'rate') / mult(part, 'efficiency')
        break
    }
    mass += balance.mass * part.size * massScale
    upkeep += balance.upkeep * part.size * upkeepScale
    const p = power(part, config)
    if (p === 0) continue
    switch (part.type) {
      case 'flagellum':
      case 'cilia': {
        const strength =
          part.type === 'flagellum'
            ? p *
              mult(part, 'force') *
              Math.sqrt(mult(part, 'length')) *
              (0.8 + 0.2 * mult(part, 'thickness'))
            : p * mult(part, 'density') * Math.sqrt(mult(part, 'length') * mult(part, 'rate'))
        // The tail trails along the axis, so the push is the other way.
        const fx = -cos(part.axis)
        const fy = -sin(part.axis)
        forwardThrust += strength * Math.max(0, fx)
        lateralThrust += strength * Math.abs(fy)
        torque += strength * Math.abs(part.x * fy - part.y * fx)
        break
      }
      case 'eye':
        eyes += p * mult(part, 'range')
        resolution += p * mult(part, 'resolution')
        break
      case 'sniffer': {
        const kind = sniffedKind(part.stats[2] as number, detection.length)
        detection[kind] =
          (detection[kind] as number) + p * 0.5 * (mult(part, 'range') + mult(part, 'sensitivity'))
        break
      }
      case 'mouth': {
        reach += p * mult(part, 'reach')
        digestion += 0.5 * p * mult(part, 'gape')
        biteSize += p * mult(part, 'gape')
        biteRate += p * mult(part, 'rate')
        mouthPower += p
        const yields = config.mouthForms[mouthFormOf(part.stats[2] as number)]
        for (let kind = 0; kind < dietSum.length; kind++) {
          const name = kindNames[kind]
          dietSum[kind] =
            (dietSum[kind] as number) + p * (name === undefined ? 1 : (yields[name] ?? 1))
        }
        break
      }
      case 'intestine':
        digestion += p * 0.5 * (mult(part, 'absorption') + mult(part, 'length'))
        absorption += p * 0.5 * (mult(part, 'absorption') + mult(part, 'length'))
        toleranceSum += p * mult(part, 'filter')
        break
      case 'stomach':
        energyCapacity += p * mult(part, 'capacity')
        digestion += 0.5 * p * mult(part, 'throughput')
        absorption += 0.5 * p * mult(part, 'throughput')
        break
      case 'armor':
        armor +=
          (p * (mult(part, 'thickness') + mult(part, 'coverage') + mult(part, 'hardness'))) / 3
        break
      case 'membrane':
        temperatureTolerance += p * mult(part, 'insulation') * (0.8 + 0.2 * mult(part, 'thickness'))
        break
      case 'mender':
        regeneration += p * mult(part, 'rate')
        break
    }
  }

  // Eyes with better resolution make every food kind easier to pick out (the founder is the reference).
  const acuity = 1 + 0.25 * resolution
  for (let kind = 0; kind < detection.length; kind++) {
    detection[kind] = (detection[kind] as number) * acuity
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
    regeneration,
    biteSize,
    biteRate,
    absorption,
    // The power-weighted mean of the mouths' yields: exactly 1 for the mandible (p / p).
    dietEfficiency: dietSum.map((sum) => (mouthPower > 0 ? sum / mouthPower : 1)),
    hasMouth: mouthPower > 0
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
    upkeepDelta: capabilities.upkeep - founder.upkeep,
    biteSize: relative(capabilities.biteSize, founder.biteSize),
    biteRate: relative(capabilities.biteRate, founder.biteRate),
    absorption: relative(capabilities.absorption, founder.absorption),
    // Absolute, not relative to the founder: 1 is the generalist's yield, whatever form the
    // configured founder has (the default founder's mandible is exactly 1 on every kind).
    dietEfficiency: capabilities.dietEfficiency,
    hasMouth: capabilities.hasMouth
  }
}

/** The whole view of one body: the anatomy, its capabilities, and them relative to the founder. */
export function viewOf(
  anatomy: Anatomy,
  founder: Capabilities,
  config: AnatomyConfig,
  bodyScale: number,
  kindCount: number,
  kindNames: readonly string[] = []
): AnatomyView {
  const capabilities = capabilitiesOf(anatomy, config, bodyScale, kindCount, kindNames)
  return { anatomy, capabilities, factors: capabilityFactors(capabilities, founder) }
}
