import { describe, it } from 'vitest'
import { appendFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { World } from '../../src/index'
import { mouthsOf } from '../../src/organisms/mouths'

/**
 * Do omnivore bodies exist, and do they work? (a jaw plus a mouth that takes plants on one body.)
 * Every creature is classified by its working mouths and the class is kept by id, so dead parents
 * and the actors of events can be classified later (a body never changes in a life):
 *
 * - `plant`: no mouth with a flesh yield; `jaw`: a flesh mouth and no mouth that takes any plant;
 *   `omni`: a flesh mouth and at least one mouth that takes plants; `scav`: working mouths that take
 *   neither plants nor flesh (the scavenger form, ADR 0031: carrion only); `none`: no working mouth.
 *
 * Per arm it reports prevalence over time, where omnivore children come from (the parents'
 * classes), fitness by class (lifespan, matings per 1,000 creature-ticks, deaths by cause), what
 * each class eats (plant, carrion, flesh, egg intake) and persistence. A measurement, not a test.
 *
 * Environment: `OMNI_NAME` (label), `OMNI_CONFIG` (JSON overrides), `OMNI_SEEDS` (default 1..8),
 * `OMNI_TICKS` (default 30000). One line goes to `<tmpdir>/evo-probe/omnivore-<name>.txt`.
 */
const NAME = process.env.OMNI_NAME ?? 'default'
const EXTRA = JSON.parse(process.env.OMNI_CONFIG ?? '{}') as Record<string, unknown>
const SEEDS = (process.env.OMNI_SEEDS ?? '1,2,3,4,5,6,7,8').split(',').map(Number)
const TICKS = Number(process.env.OMNI_TICKS ?? 30_000)
const SAMPLE = 2_500
const ALIVE_EVERY = 500

type Class = 'plant' | 'jaw' | 'omni' | 'scav' | 'none'
const CLASSES: Class[] = ['plant', 'jaw', 'omni', 'scav', 'none']
const EATS = ['plant', 'carrion', 'flesh', 'egg'] as const
type Eats = (typeof EATS)[number]
const CAUSES = ['starvation', 'age', 'damage', 'predation'] as const

const zero = (): Record<Class, number> => ({ plant: 0, jaw: 0, omni: 0, scav: 0, none: 0 })
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)

describe('omnivore probe', () => {
  it(`measures ${NAME}`, () => {
    // Totals over every seed.
    const alive = zero() // creature-ticks
    const successes = zero()
    const deaths: Record<Class, Record<string, number>> = {
      plant: {},
      jaw: {},
      omni: {},
      scav: {},
      none: {}
    }
    const lifeSum = zero()
    const lifeN = zero()
    const intake: Record<Class, Record<Eats, number>> = {
      plant: { plant: 0, carrion: 0, flesh: 0, egg: 0 },
      jaw: { plant: 0, carrion: 0, flesh: 0, egg: 0 },
      omni: { plant: 0, carrion: 0, flesh: 0, egg: 0 },
      scav: { plant: 0, carrion: 0, flesh: 0, egg: 0 },
      none: { plant: 0, carrion: 0, flesh: 0, egg: 0 }
    }
    const born = zero()
    const origin = new Map<string, number>()
    const plans = new Map<string, number>()
    const prevalence = new Map<number, Record<Class, number>>()
    const omniAlive = new Map<number, number>()
    const firstOmni: (number | null)[] = []
    const endShare: string[] = []
    let seedsOmniEnd = 0
    let seedsJawEnd = 0
    let extinct = 0
    let popSum = 0
    let lowest = Infinity

    for (const seed of SEEDS) {
      const world = World.create({ seed, config: EXTRA as never })
      const dt = world.config.timestep
      const kinds = world.config.ecology.resourceKinds.kinds
      const carrionKind = kinds.length - 1
      const plantYield = (form: string): boolean => {
        const row =
          world.config.anatomy.mouthForms[form as keyof typeof world.config.anatomy.mouthForms]
        // Carrion is meat, not a plant: it is the kind predation appends last.
        return Object.entries(row).some(([kind, y]) => kind !== 'carrion' && (y as number) > 0)
      }
      const flesh = world.config.predation.fleshYield
      const cache = new Map<number, { cls: Class; plan: string; birth: number }>()
      const classify = (id: number, birth: number): void => {
        if (cache.has(id)) return
        const genome = world.genomeOf(id)
        if (genome === undefined) return
        const mouths = mouthsOf(genome, world.config)
        const fleshy = mouths.some((m) => flesh[m.form] > 0)
        const leafy = mouths.some((m) => plantYield(m.form))
        const cls: Class =
          mouths.length === 0
            ? 'none'
            : fleshy
              ? leafy
                ? 'omni'
                : 'jaw'
              : leafy
                ? 'plant'
                : 'scav'
        cache.set(id, {
          cls,
          plan: mouths
            .map((m) => m.form)
            .sort()
            .join('+'),
          birth
        })
      }
      for (const o of world.snapshot().organisms) classify(o.id, 0)
      let first: number | null = null
      let popAcc = 0
      let samples = 0

      for (let tick = 1; tick <= TICKS; tick++) {
        world.step()
        for (const e of world.events.eventsThisTick()) {
          switch (e.type) {
            case 'organism-born': {
              classify(e.organismId, tick)
              const child = cache.get(e.organismId)
              if (child === undefined) break
              born[child.cls]++
              if (child.cls === 'omni') {
                if (first === null) first = tick
                plans.set(child.plan, (plans.get(child.plan) ?? 0) + 1)
                const pair = e.parentIds
                  .map((p) => cache.get(p)?.cls ?? '?')
                  .sort()
                  .join('x')
                origin.set(pair || 'founder', (origin.get(pair || 'founder') ?? 0) + 1)
              }
              break
            }
            case 'reproduction-attempted':
              if (e.succeeded) {
                for (const id of [e.organismId, e.partnerId as number]) {
                  const c = cache.get(id)
                  if (c !== undefined) successes[c.cls]++
                }
              }
              break
            case 'resource-bitten': {
              const c = cache.get(e.organismId)
              if (c !== undefined)
                intake[c.cls][e.kind === carrionKind ? 'carrion' : 'plant'] += e.intake
              break
            }
            case 'organism-bitten': {
              const c = cache.get(e.predatorId)
              if (c !== undefined) intake[c.cls].flesh += e.intake
              break
            }
            case 'egg-eaten': {
              const c = cache.get(e.predatorId)
              if (c !== undefined) intake[c.cls].egg += e.intake
              break
            }
            case 'organism-died': {
              const c = cache.get(e.organismId)
              if (c === undefined) break
              deaths[c.cls][e.cause] = (deaths[c.cls][e.cause] ?? 0) + 1
              lifeSum[c.cls] += (tick - c.birth) * dt
              lifeN[c.cls]++
              break
            }
            default:
              break
          }
        }
        if (tick % ALIVE_EVERY === 0 || tick % SAMPLE === 0) {
          const living = world.snapshot().organisms
          const counts = zero()
          for (const o of living) {
            classify(o.id, tick)
            const c = cache.get(o.id)
            if (c !== undefined) counts[c.cls]++
          }
          if (tick % ALIVE_EVERY === 0) for (const k of CLASSES) alive[k] += counts[k] * ALIVE_EVERY
          if (tick % SAMPLE === 0) {
            popAcc += living.length
            lowest = Math.min(lowest, living.length)
            samples++
            const acc = prevalence.get(tick) ?? zero()
            for (const k of CLASSES) acc[k] += counts[k]
            prevalence.set(tick, acc)
            omniAlive.set(tick, (omniAlive.get(tick) ?? 0) + (counts.omni > 0 ? 1 : 0))
            if (tick === TICKS) {
              if (counts.omni > 0) seedsOmniEnd++
              if (counts.omni + counts.jaw > 0) seedsJawEnd++
              const bearers = counts.omni + counts.jaw
              endShare.push(
                `s${seed}:${counts.plant}p/${counts.jaw}j/${counts.omni}o/${counts.scav}s` +
                  (bearers > 0 ? `(${Math.round((100 * counts.omni) / bearers)}%omni)` : '')
              )
            }
          }
        }
      }
      if (world.isExtinct) extinct++
      popSum += popAcc / Math.max(1, samples)
      firstOmni.push(first)
    }

    const n = SEEDS.length
    const f1 = (x: number): string => x.toFixed(1)
    const rate = (k: Class): string => (alive[k] > 0 ? f1((1000 * successes[k]) / alive[k]) : '-')
    const life = (k: Class): string => (lifeN[k] > 0 ? f1(lifeSum[k] / lifeN[k]) : '-')
    const eatLine = (k: Class): string => {
      const total = sum(EATS.map((e) => intake[k][e]))
      return total > 0
        ? EATS.map((e) => `${e}${Math.round((100 * intake[k][e]) / total)}%`).join('/')
        : '-'
    }
    const deathLine = (k: Class): string => {
      const total = sum(CAUSES.map((c) => deaths[k][c] ?? 0))
      return total > 0
        ? `${total}:` +
            CAUSES.map((c) => `${c[0]}${Math.round((100 * (deaths[k][c] ?? 0)) / total)}`).join('/')
        : '-'
    }
    const series = [...prevalence.keys()]
      .sort((a, b) => a - b)
      .map((t) => {
        const p = prevalence.get(t) as Record<Class, number>
        return `${t / 1000}k ${f1(p.plant / n)}p/${f1(p.jaw / n)}j/${f1(p.omni / n)}o/${f1(p.scav / n)}s omniWorlds=${omniAlive.get(t)}/${n}`
      })
    const topPlans = [...plans.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p, c]) => `${p}:${c}`)
      .join(',')
    const origins = [...origin.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([p, c]) => `${p}:${c}`)
      .join(',')
    const allDeaths = CLASSES.flatMap((k) => CAUSES.map((c) => deaths[k][c] ?? 0))
    const starvedDeaths = sum(CLASSES.map((k) => deaths[k].starvation ?? 0))
    const starvedShare = Math.round((100 * starvedDeaths) / Math.max(1, sum(allDeaths)))
    const lines = [
      `${NAME} seeds=${n} ticks=${TICKS} extinct=${extinct} pop=${f1(popSum / n)} lowest=${lowest} starved=${starvedShare}%`,
      `  prevalence(mean living, plant/jaw/omni): ${series.join(' | ')}`,
      `  born: ${CLASSES.map((k) => `${k}=${born[k]}`).join(' ')}  firstOmniTick: ${firstOmni.map((t) => t ?? '-').join(',')}`,
      `  omni origin (parent classes): ${origins || '-'}  omni body plans: ${topPlans || '-'}`,
      `  matings per 1000 creature-ticks: plant=${rate('plant')} jaw=${rate('jaw')} omni=${rate('omni')}`,
      `  mean lifespan s: plant=${life('plant')} jaw=${life('jaw')} omni=${life('omni')}`,
      `  deaths (total:starv/age/damage/pred %): plant=${deathLine('plant')} jaw=${deathLine('jaw')} omni=${deathLine('omni')}`,
      `  intake split: plant-class=${eatLine('plant')} jaw=${eatLine('jaw')} omni=${eatLine('omni')}`,
      `  alive at end: omni in ${seedsOmniEnd}/${n} worlds, any jaw-bearer in ${seedsJawEnd}/${n}  ${endShare.join(' ')}`
    ]
    const dir = join(tmpdir(), 'evo-probe')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, `omnivore-${NAME}.txt`), lines.join('\n') + '\n')
    console.log(lines.join('\n'))
  }, 7_200_000)
})
