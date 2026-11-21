import { describe, it } from 'vitest'
import { appendFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PART_TYPES } from '@evo/contracts'
import { World } from '../../src/index'

/**
 * Where bodies pile up copies of one part, and what the pile is worth, for every part type. A body is
 * classified once, the first time it is seen (a body never changes in a life), by the number of
 * WORKING copies it carries of each of the 16 part types: 0, 1, 2 or 3 and more. Per arm it reports,
 * for each type:
 *
 * - **prevalence**: the share of living bodies with 0 / 1 / 2 / 3+ copies over the sampled ticks, the
 *   mean copy count, the founder's count, and in how many worlds bodies with 2 or more copies are at
 *   least 40 percent of the living at the end (the flag rule's prevalence test, ADR 0029);
 * - **fitness by copy count**: matings per 1,000 creature-ticks, mean lifespan (s) and the starved
 *   share of deaths, for bodies with 0, 1, 2 and 3+ copies;
 * - **matched comparison**, to name the confound (a body with more of everything is just bigger): the
 *   mating-rate and lifespan ratio of bodies with 2 or more copies to bodies with exactly 1, compared
 *   only among bodies with the same total number of working parts;
 * - world level: part types alive, distinct part lists and mean working parts per body over time.
 *
 * A measurement, not a test. Environment: `AUDIT_NAME` (label), `AUDIT_CONFIG` (JSON overrides),
 * `AUDIT_SEEDS` (default 1..8), `AUDIT_TICKS` (default 30000). One block is appended to
 * `<tmpdir>/evo-probe/parts-audit-<name>.txt`.
 */
const NAME = process.env.AUDIT_NAME ?? 'default'
const EXTRA = JSON.parse(process.env.AUDIT_CONFIG ?? '{}') as Record<string, unknown>
const SEEDS = (process.env.AUDIT_SEEDS ?? '1,2,3,4,5,6,7,8').split(',').map(Number)
const TICKS = Number(process.env.AUDIT_TICKS ?? 30_000)
const SAMPLE = 2_500
const ALIVE_EVERY = 500
const TYPES = PART_TYPES.length
const BUCKETS = 4 // 0, 1, 2, 3 or more working copies
const BANDS = 9 // total working parts, 0..7 and 8 or more

const bucketOf = (copies: number): number => Math.min(BUCKETS - 1, copies)
const bandOf = (parts: number): number => Math.min(BANDS - 1, parts)
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)
const f1 = (x: number): string => x.toFixed(1)

/** A flat table indexed by (type, copy bucket, total-parts band). */
class Table {
  private readonly cells = new Array<number>(TYPES * BUCKETS * BANDS).fill(0)
  add(type: number, bucket: number, band: number, value = 1): void {
    const at = (type * BUCKETS + bucket) * BANDS + band
    this.cells[at] = (this.cells[at] ?? 0) + value
  }
  get(type: number, bucket: number, band?: number): number {
    if (band !== undefined) return this.cells[(type * BUCKETS + bucket) * BANDS + band] ?? 0
    let total = 0
    for (let b = 0; b < BANDS; b++) total += this.get(type, bucket, b)
    return total
  }
}

interface Body {
  copies: number[]
  total: number
  plan: string
  birth: number
}

describe('parts audit probe', () => {
  it(`measures ${NAME}`, () => {
    const alive = new Table() // creature-ticks
    const matings = new Table()
    const lifeSum = new Table()
    const lifeN = new Table()
    const starved = new Table()
    const deaths = new Table()
    const prevalence = new Table() // living bodies counted at the SAMPLE ticks
    const copiesSum = new Array<number>(TYPES).fill(0)
    let bodiesSampled = 0
    const founderCopies = new Array<number>(TYPES).fill(0)
    const heavyWorlds = new Array<number>(TYPES).fill(0) // worlds with 2+ copy bodies >= 40% at the end
    const endShare: string[][] = PART_TYPES.map(() => [])
    const typesAlive: number[] = []
    const plansAlive: number[] = []
    const partsPerBody: number[] = []
    let extinct = 0
    let popSum = 0
    let lowest = Infinity

    for (const seed of SEEDS) {
      const world = World.create({ seed, config: EXTRA as never })
      const dt = world.config.timestep
      const cache = new Map<number, Body>()
      const classify = (id: number, birth: number): Body | undefined => {
        const known = cache.get(id)
        if (known !== undefined) return known
        const view = world.anatomyOf(id)
        if (view === undefined) return undefined
        const working = view.anatomy.parts.filter((p) => p.functional)
        const body: Body = {
          copies: PART_TYPES.map((t) => working.filter((p) => p.type === t).length),
          total: working.length,
          plan: working.map((p) => p.type).join(','),
          birth
        }
        cache.set(id, body)
        return body
      }
      const first = world.snapshot().organisms
      for (const o of first) classify(o.id, 0)
      if (seed === SEEDS[0]) {
        const b = first.length > 0 ? cache.get((first[0] as { id: number }).id) : undefined
        if (b !== undefined) b.copies.forEach((c, i) => (founderCopies[i] = c))
      }
      let popAcc = 0
      let samples = 0

      for (let tick = 1; tick <= TICKS; tick++) {
        world.step()
        // An extinct world steps at full speed doing nothing: stop (ADR 0029, docs/development.md).
        if (world.isExtinct) break
        for (const e of world.events.eventsThisTick()) {
          switch (e.type) {
            case 'organism-born':
              classify(e.organismId, tick)
              break
            case 'reproduction-attempted':
              if (e.succeeded) {
                for (const id of [e.organismId, e.partnerId as number]) {
                  const b = cache.get(id)
                  if (b === undefined) continue
                  b.copies.forEach((c, i) => matings.add(i, bucketOf(c), bandOf(b.total)))
                }
              }
              break
            case 'organism-died': {
              const b = cache.get(e.organismId)
              if (b === undefined) break
              const life = (tick - b.birth) * dt
              b.copies.forEach((c, i) => {
                const k = bucketOf(c)
                const band = bandOf(b.total)
                deaths.add(i, k, band)
                if (e.cause === 'starvation') starved.add(i, k, band)
                lifeSum.add(i, k, band, life)
                lifeN.add(i, k, band)
              })
              break
            }
            default:
              break
          }
        }
        if (tick % ALIVE_EVERY === 0 || tick % SAMPLE === 0) {
          const living = world.snapshot().organisms
          const bodies: Body[] = []
          for (const o of living) {
            const b = classify(o.id, tick)
            if (b !== undefined) bodies.push(b)
          }
          if (tick % ALIVE_EVERY === 0) {
            for (const b of bodies)
              b.copies.forEach((c, i) => alive.add(i, bucketOf(c), bandOf(b.total), ALIVE_EVERY))
          }
          if (tick % SAMPLE === 0) {
            popAcc += living.length
            lowest = Math.min(lowest, living.length)
            samples++
            bodiesSampled += bodies.length
            for (const b of bodies) {
              b.copies.forEach((c, i) => {
                prevalence.add(i, bucketOf(c), 0)
                copiesSum[i] = (copiesSum[i] ?? 0) + c
              })
            }
            typesAlive.push(
              PART_TYPES.filter((_, i) => bodies.some((b) => (b.copies[i] ?? 0) > 0)).length
            )
            plansAlive.push(new Set(bodies.map((b) => b.plan)).size)
            partsPerBody.push(sum(bodies.map((b) => b.total)) / Math.max(1, bodies.length))
            if (tick === TICKS) {
              PART_TYPES.forEach((_, i) => {
                const heavy = bodies.filter((b) => (b.copies[i] ?? 0) >= 2).length
                const share = heavy / Math.max(1, bodies.length)
                if (share >= 0.4) heavyWorlds[i] = (heavyWorlds[i] ?? 0) + 1
                endShare[i]?.push(String(Math.round(100 * share)))
              })
            }
          }
        }
      }
      if (world.isExtinct) extinct++
      popSum += popAcc / Math.max(1, samples)
    }

    const n = SEEDS.length
    const rate = (i: number, k: number): string =>
      alive.get(i, k) > 0 ? f1((1000 * matings.get(i, k)) / alive.get(i, k)) : '-'
    const life = (i: number, k: number): string =>
      lifeN.get(i, k) > 0 ? f1(lifeSum.get(i, k) / lifeN.get(i, k)) : '-'
    const starve = (i: number, k: number): string =>
      deaths.get(i, k) > 0 ? `${Math.round((100 * starved.get(i, k)) / deaths.get(i, k))}%` : '-'
    const heavy = (t: Table, i: number, band: number): number =>
      t.get(i, 2, band) + t.get(i, 3, band)
    // Matched on the total number of working parts: 2 or more copies against exactly one copy.
    const matched = (i: number): string => {
      let heavyMatings = 0
      let expectedMatings = 0
      let heavyLife = 0
      let expectedLife = 0
      let compared = 0
      for (let band = 0; band < BANDS; band++) {
        const heavyAlive = heavy(alive, i, band)
        const oneAlive = alive.get(i, 1, band)
        if (heavyAlive > 0 && oneAlive > 0) {
          expectedMatings += (matings.get(i, 1, band) / oneAlive) * heavyAlive
          heavyMatings += heavy(matings, i, band)
          compared += heavyAlive
        }
        const heavyN = heavy(lifeN, i, band)
        const oneN = lifeN.get(i, 1, band)
        if (heavyN > 0 && oneN > 0) {
          expectedLife += (lifeSum.get(i, 1, band) / oneN) * heavyN
          heavyLife += heavy(lifeSum, i, band)
        }
      }
      const ratioM = expectedMatings > 0 ? (heavyMatings / expectedMatings).toFixed(2) : '-'
      const ratioL = expectedLife > 0 ? (heavyLife / expectedLife).toFixed(2) : '-'
      return `matched 2+/1 (same part count): matings x${ratioM}, lifespan x${ratioL} (over ${Math.round(compared / 1000)}k creature-ticks)`
    }

    const lines = [
      `${NAME} seeds=${n} ticks=${TICKS} extinct=${extinct} pop=${f1(popSum / n)} lowest=${lowest}`,
      `  world: part types alive ${f1(sum(typesAlive) / Math.max(1, typesAlive.length))} of ${TYPES}, distinct part lists ${f1(sum(plansAlive) / Math.max(1, plansAlive.length))}, working parts per body ${f1(sum(partsPerBody) / Math.max(1, partsPerBody.length))} (means over the samples)`
    ]
    const total = Math.max(1, bodiesSampled)
    PART_TYPES.forEach((type, i) => {
      const pct = (k: number): string => `${Math.round((100 * prevalence.get(i, k)) / total)}`
      lines.push(
        `## ${type} (founder ${founderCopies[i]}): bodies 0/1/2/3+ = ${pct(0)}/${pct(1)}/${pct(2)}/${pct(3)}%  mean copies ${((copiesSum[i] ?? 0) / total).toFixed(2)}  worlds with 2+ >= 40%: ${heavyWorlds[i]}/${n}  2+ share at end per world: ${(endShare[i] ?? []).join(',')}`
      )
      lines.push(
        `   matings/1000 ct: ${[0, 1, 2, 3].map((k) => rate(i, k)).join(' / ')}  lifespan s: ${[0, 1, 2, 3].map((k) => life(i, k)).join(' / ')}  starved: ${[0, 1, 2, 3].map((k) => starve(i, k)).join(' / ')}  deaths: ${[0, 1, 2, 3].map((k) => deaths.get(i, k)).join('/')}`
      )
      lines.push(`   ${matched(i)}`)
    })
    const dir = join(tmpdir(), 'evo-probe')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, `parts-audit-${NAME}.txt`), lines.join('\n') + '\n')
    console.log(lines.join('\n'))
  }, 7_200_000)
})
