import { PART_STATS, mouthFormOf, statMultiplier, statValue } from '@evo/contracts'
import type {
  Anatomy,
  AnatomyConfig,
  AnatomyPart,
  AnatomyView,
  Capabilities,
  CapabilityFactors,
  PartStatSpec,
  PartType,
  Vision,
  VisionCone
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
 * How the part's own dimensions scale its mass and its upkeep (the factors on `balance.mass * size`
 * and `balance.upkeep * size`): longer, thicker or bigger is heavier, a stronger force, rate or
 * range costs more to keep.
 */
function scalesOf(part: AnatomyPart): { mass: number; upkeep: number } {
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
    case 'eyestalk':
      massScale = (0.5 + 0.5 * mult(part, 'length')) * (0.5 + 0.5 * mult(part, 'stiffness'))
      break
    case 'gyro':
      upkeepScale = mult(part, 'stability')
      break
    case 'lipid':
      // Fat is heavy: the more it stores the more it weighs, so it slows the body.
      massScale = mult(part, 'reserve')
      break
    case 'pheromone':
      upkeepScale = mult(part, 'potency')
      break
    case 'skeleton':
      massScale = (0.5 + 0.5 * mult(part, 'rigidity')) * (0.5 + 0.5 * mult(part, 'length'))
      break
    case 'join':
      massScale = 0.5 + 0.5 * mult(part, 'length')
      break
  }
  return { mass: massScale, upkeep: upkeepScale }
}

/** What one part adds to the body's mass and upkeep (dormant ones included), from its type's balance numbers. */
export function partCostOf(
  part: AnatomyPart,
  config: AnatomyConfig
): { mass: number; upkeep: number } {
  const balance = config.parts[part.type]
  const scales = scalesOf(part)
  return {
    mass: balance.mass * part.size * scales.mass,
    upkeep: balance.upkeep * part.size * scales.upkeep
  }
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
  const { effects } = config
  let mass = config.bodyMass * bodyScale
  let upkeep = 0
  let forwardThrust = 0
  let lateralThrust = 0
  let torque = 0
  let eyes = 0
  let resolution = 0
  const seen: Array<{ slot: number; axis: number; gene: number }> = []
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
  let signal = 0
  const dietSum = new Array<number>(Math.max(1, kindCount)).fill(0)

  for (const part of anatomy.parts) {
    const cost = partCostOf(part, config)
    mass += cost.mass
    upkeep += cost.upkeep
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
      case 'eye': {
        // An eye carried on a working eyestalk sees further, by the stalk's length.
        const carrier =
          part.parent < 0 ? undefined : anatomy.parts.find((q) => q.slot === part.parent)
        const lift =
          carrier !== undefined && carrier.type === 'eyestalk' && carrier.functional
            ? 1 + effects.eyestalkLift * mult(carrier, 'length')
            : 1
        eyes += p * mult(part, 'range') * lift
        resolution += p * mult(part, 'resolution')
        seen.push({
          slot: part.slot,
          axis: part.axis,
          gene: part.stats[statIndex('eye', 'fieldOfView')] as number
        })
        break
      }
      case 'gyro':
        // Turning without thrust: the moment of a spinning mass, not of a push.
        torque += p * mult(part, 'stability') * effects.gyroTorque
        break
      case 'lipid':
        energyCapacity += p * mult(part, 'reserve') * effects.lipidCapacity
        break
      case 'pheromone':
        signal += p * mult(part, 'potency') * effects.pheromoneSignal
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

  const senseRange = config.senseFloor + Math.sqrt(eyes)

  return {
    mass,
    upkeep,
    forwardThrust,
    lateralThrust,
    torque,
    senseRange,
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
    hasMouth: mouthPower > 0,
    mateSignal: Math.min(effects.pheromoneCap, 1 + signal),
    vision: visionOf(seen, senseRange, config)
  }
}

/**
 * How a body sees (ADR 0016 "Directional vision"): one cone per working eye, about the eye's axis.
 * An eye reaches as far as the body's sense range, scaled up when it is narrower than all-round
 * (the range-for-angle trade, `effects.visionNarrowing`); an eye at its widest setting is a full
 * circle of exactly the body's sense range, so a body of all-round eyes (and a body with no eye)
 * is `omni` and the world sees it as the plain circle it always was.
 */
function visionOf(
  eyes: ReadonlyArray<{ slot: number; axis: number; gene: number }>,
  senseRange: number,
  config: AnatomyConfig
): Vision {
  const spec = PART_STATS.eye[statIndex('eye', 'fieldOfView')] as PartStatSpec
  const cones: VisionCone[] = []
  let omni = true
  for (const eye of eyes) {
    const axisCos = cos(eye.axis)
    const axisSin = sin(eye.axis)
    if (eye.gene >= 1) {
      cones.push({
        slot: eye.slot,
        axisCos,
        axisSin,
        cosHalf: -1,
        half: Math.PI,
        reach: senseRange
      })
      continue
    }
    omni = false
    const fov = statValue(spec, eye.gene)
    const narrow = 1 + config.effects.visionNarrowing * (Math.sqrt(spec.max / fov) - 1)
    cones.push({
      slot: eye.slot,
      axisCos,
      axisSin,
      cosHalf: cos(fov / 2),
      half: fov / 2,
      reach: senseRange * narrow
    })
  }
  return { omni, floor: config.senseFloor, cones }
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
    hasMouth: capabilities.hasMouth,
    mateSignal: relative(capabilities.mateSignal, founder.mateSignal),
    vision: {
      omni: capabilities.vision.omni,
      floor: relative(capabilities.vision.floor, founder.senseRange),
      cones: capabilities.vision.cones.map((cone) => ({
        ...cone,
        reach: relative(cone.reach, founder.senseRange)
      }))
    }
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
