import { describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveWorldConfig } from '@evo/config'
import { BODY_SLOT_COUNT, PART_TYPES } from '@evo/contracts'
import type { CapabilityFactors, FounderPart, PartType } from '@evo/contracts'
import { capabilitiesOf, capabilityFactors } from '../../src/development/capabilities'
import { developAnatomy } from '../../src/development/develop'
import { bodyVectorOf } from '../../src/genetics/BodyGenes'
import { founderCapabilitiesOf, kindNamesOf } from '../../src/organisms/bodyFactors'

/**
 * What each part type buys on its own, and what a second, third, ... copy buys. For every one of the 16
 * part types the founder body is rebuilt with 0, 1, 2, ... copies of that type (the founder's own
 * copies of the type are removed first, any extra copy is the founder's template for the type or, if
 * the founder has none, a size 0.5 part with every stat at the middle), the structural budget is
 * lifted so only the arithmetic shows, and every capability factor and the cost are printed against
 * the count with the marginal change of each extra copy. Pure arithmetic, no world, seconds. A
 * measurement, not a test (ADR 0029). One file goes to `<tmpdir>/evo-probe/stacking.txt`.
 */
const config = resolveWorldConfig({ anatomy: { structuralBudget: 40 } })
const { anatomy } = config
const kindNames = kindNamesOf(config)
const reference = founderCapabilitiesOf(config)
const MID = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
/** Parts that sit on the outline (offset 1); the rest sit inside it. */
const SURFACE: PartType[] = [
  'flagellum',
  'cilia',
  'sniffer',
  'mouth',
  'armor',
  'membrane',
  'eyestalk',
  'pheromone'
]

type Row = Record<string, number>

function bodyWith(type: PartType, copies: number): FounderPart[] {
  const rest = anatomy.founder.filter((p) => p.type !== type)
  const template = anatomy.founder.find((p) => p.type === type) ?? {
    type,
    parent: 0,
    size: 0.5,
    angle: 0,
    offset: SURFACE.includes(type) ? 1 : 0.4,
    orientation: 0,
    integrity: 1,
    stats: MID
  }
  const added: FounderPart[] = []
  for (let k = 0; k < copies; k++) {
    // Spread the copies round the body (not on the front, where the mouth is) and keep each
    // parentless, so they are independent and never stand on each other's anchor.
    added.push({
      ...template,
      parent: 0,
      angle: ((k + 0.5) * 2 * Math.PI) / Math.max(1, copies) + 0.3
    })
  }
  return [...rest.map((p) => ({ ...p })), ...added]
}

function measure(
  type: PartType,
  copies: number
): { factors: Row; mass: number; upkeep: number; parts: number } {
  const parts = bodyWith(type, copies)
  const body = bodyVectorOf({ parts, look: anatomy.founderLook, outline: anatomy.founderOutline })
  const developed = developAnatomy(body, anatomy)
  const caps = capabilitiesOf(developed, anatomy, 1, Math.max(1, kindNames.length), kindNames)
  const f: CapabilityFactors = capabilityFactors(caps, reference)
  const mean = (xs: readonly number[]): number =>
    xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
  const working = developed.parts.filter((p) => p.type === type && p.functional).length
  return {
    parts: working,
    mass: caps.mass,
    upkeep: caps.upkeep,
    factors: {
      speed: f.speed,
      strafe: f.strafe,
      turn: f.turn,
      senseRange: f.senseRange,
      detection: mean(f.foodDetection),
      reach: f.reach,
      digestion: f.digestion,
      absorption: f.absorption,
      energyCap: f.energyCapacity,
      armorTaken: f.damageTaken,
      toxinDamage: f.toxinDamage,
      tempTol: f.temperatureTolerance,
      regen: f.regeneration,
      biteSize: f.biteSize,
      biteRate: f.biteRate,
      mateSignal: f.mateSignal,
      cones: f.vision.cones.length,
      omni: f.vision.omni ? 1 : 0
    }
  }
}

describe('stacking probe', () => {
  it('prints what each part type buys, by count', () => {
    const lines: string[] = []
    const base = anatomy.founder.length
    for (const type of PART_TYPES) {
      const present = anatomy.founder.filter((p) => p.type === type).length
      const room = BODY_SLOT_COUNT - (base - present)
      const rows: ReturnType<typeof measure>[] = []
      for (let n = 0; n <= Math.min(6, room); n++) rows.push(measure(type, n))
      const keys = Object.keys((rows[0] as { factors: Row }).factors).filter((k) =>
        rows.some(
          (r) =>
            Math.abs(
              (r.factors[k] as number) - ((rows[0] as { factors: Row }).factors[k] as number)
            ) > 1e-9
        )
      )
      lines.push(
        `## ${type} (founder has ${present}; mass ${anatomy.parts[type].mass}/size, upkeep ${anatomy.parts[type].upkeep}/size)`
      )
      lines.push(`   changes: ${keys.length > 0 ? keys.join(', ') : '(nothing the factors see)'}`)
      rows.forEach((row, i) => {
        const prev = rows[i - 1]
        const cells = keys.map((k) => {
          const v = row.factors[k] as number
          const d =
            prev === undefined
              ? ''
              : ` (${v - (prev.factors[k] as number) >= 0 ? '+' : ''}${(v - (prev.factors[k] as number)).toFixed(3)})`
          return `${k}=${v.toFixed(3)}${d}`
        })
        const dm = prev === undefined ? '' : ` (+${(row.mass - prev.mass).toFixed(3)})`
        const du = prev === undefined ? '' : ` (+${(row.upkeep - prev.upkeep).toFixed(4)})`
        lines.push(
          `   N=${i}: mass=${row.mass.toFixed(3)}${dm} upkeep=${row.upkeep.toFixed(4)}${du} | ${cells.join(' ')}`
        )
      })
    }
    const dir = join(tmpdir(), 'evo-probe')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'stacking.txt'), lines.join('\n') + '\n')
  })
})
