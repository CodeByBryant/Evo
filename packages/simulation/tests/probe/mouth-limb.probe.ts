import { describe, it } from 'vitest'
import { appendFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveWorldConfig } from '@evo/config'
import { mouthFormOf } from '@evo/contracts'
import { World } from '../../src/index'

/**
 * Mouths on limbs. A part with a part parent sits along the parent's axis (`develop.ts`), so a mouth
 * hung on a flagellum sits at the end of the tail, up to the tail's length from the body, and the bite
 * is taken from there (`InteractionSystem`). This probe measures how often evolution does it and what
 * it is worth, in one world (the owner's seed by default):
 *
 * - every body is classed once: `body` (every working mouth sits on the body) or `limb` (at least one
 *   working mouth hangs from another part); `tail` is the part of `limb` whose mouth hangs from a
 *   flagellum or cilia (directly or through a chain);
 * - per sample: the share of living bodies in each class, the farthest mouth from the centre in body
 *   radii (mean per class), the mean chain depth, and the share that are omnivores (a flesh mouth and
 *   a mouth that takes plants);
 * - from events: intake (plant, carrion, flesh, egg), matings per 1,000 creature-ticks and lifespan, by class.
 *
 * A measurement, not a test. Environment: `LIMB_NAME`, `LIMB_SEEDS` (default 4120846439),
 * `LIMB_TICKS` (default 220000), `LIMB_CONFIG` (JSON overrides), `LIMB_TAILER` (a share of founders, at
 * most 0.5, that start as the grazer with its mouth hung on a flagellum's tip: a direct test of whether
 * a tail mouth wins, whatever the config), `LIMB_QUIET` (one summary line per arm). Appends to
 * `<tmpdir>/evo-probe/mouth-limb-<name>.txt`.
 */
const NAME = process.env.LIMB_NAME ?? 'default'
const EXTRA = JSON.parse(process.env.LIMB_CONFIG ?? '{}') as Record<string, unknown>
const SEEDS = (process.env.LIMB_SEEDS ?? '4120846439').split(',').map(Number)
const TICKS = Number(process.env.LIMB_TICKS ?? 220_000)
const TAILER = Number(process.env.LIMB_TAILER ?? 0)
const QUIET = process.env.LIMB_QUIET !== undefined
const SAMPLE = 5_000
const ALIVE_EVERY = 500

type Class = 'body' | 'limb' | 'none'
const EATS = ['plant', 'carrion', 'flesh', 'egg'] as const
type Eats = (typeof EATS)[number]

interface Body {
  cls: Class
  tail: boolean
  farthest: number
  depth: number
  omni: boolean
  birth: number
}

const zero = (): Record<Class, number> => ({ body: 0, limb: 0, none: 0 })
const f1 = (x: number): string => x.toFixed(1)
const f2 = (x: number): string => x.toFixed(2)

describe('mouth limb probe', () => {
  it(`measures ${NAME}`, () => {
    const lines: string[] = []
    const shares = new Map<number, number[]>() // limb share of the living at each sample, by tick
    const finals: string[] = []
    const config = withTailer(EXTRA)
    for (const seed of SEEDS) {
      const world = World.create({ seed, config: config as never })
      const dt = world.config.timestep
      const carrionKind = world.config.ecology.resourceKinds.kinds.length - 1
      const flesh = world.config.predation.fleshYield
      const takesPlants = (form: string): boolean =>
        Object.entries(
          world.config.anatomy.mouthForms[form as keyof typeof world.config.anatomy.mouthForms]
        ).some(([kind, y]) => kind !== 'carrion' && (y as number) > 0)
      const cache = new Map<number, Body>()
      const classify = (id: number, birth: number): Body | undefined => {
        const known = cache.get(id)
        if (known !== undefined) return known
        const view = world.anatomyOf(id)
        if (view === undefined) return undefined
        const unit = view.anatomy.outline.areaRadius
        const parts = view.anatomy.parts
        const bySlot = new Map(parts.map((p) => [p.slot, p]))
        const mouths = parts.filter((p) => p.type === 'mouth' && p.functional)
        let limb = false
        let tail = false
        let farthest = 0
        let depth = 0
        for (const m of mouths) {
          farthest = Math.max(farthest, Math.sqrt(m.x * m.x + m.y * m.y) / unit)
          let d = 0
          let cursor = m
          while (cursor.parent >= 0) {
            d++
            limb = true
            const up = bySlot.get(cursor.parent)
            if (up === undefined) break
            if (up.type === 'flagellum' || up.type === 'cilia') tail = true
            cursor = up
          }
          depth = Math.max(depth, d)
        }
        const forms = mouths.map((m) => mouthFormOf(m.stats[2] as number))
        const body: Body = {
          cls: mouths.length === 0 ? 'none' : limb ? 'limb' : 'body',
          tail,
          farthest,
          depth,
          omni: forms.some((f) => flesh[f] > 0) && forms.some((f) => takesPlants(f)),
          birth
        }
        cache.set(id, body)
        return body
      }
      for (const o of world.snapshot().organisms) classify(o.id, 0)

      const alive = zero()
      const matings = zero()
      const lifeSum = zero()
      const lifeN = zero()
      const intake: Record<Class, Record<Eats, number>> = {
        body: { plant: 0, carrion: 0, flesh: 0, egg: 0 },
        limb: { plant: 0, carrion: 0, flesh: 0, egg: 0 },
        none: { plant: 0, carrion: 0, flesh: 0, egg: 0 }
      }
      const series: string[] = []

      for (let tick = 1; tick <= TICKS; tick++) {
        world.step()
        for (const e of world.events.eventsThisTick()) {
          switch (e.type) {
            case 'organism-born':
              classify(e.organismId, tick)
              break
            case 'reproduction-attempted':
              if (e.succeeded)
                for (const id of [e.organismId, e.partnerId as number]) {
                  const b = cache.get(id)
                  if (b !== undefined) matings[b.cls]++
                }
              break
            case 'resource-bitten': {
              const b = cache.get(e.organismId)
              if (b !== undefined)
                intake[b.cls][e.kind === carrionKind ? 'carrion' : 'plant'] += e.intake
              break
            }
            case 'organism-bitten': {
              const b = cache.get(e.predatorId)
              if (b !== undefined) intake[b.cls].flesh += e.intake
              break
            }
            case 'egg-eaten': {
              const b = cache.get(e.predatorId)
              if (b !== undefined) intake[b.cls].egg += e.intake
              break
            }
            case 'organism-died': {
              const b = cache.get(e.organismId)
              if (b === undefined) break
              lifeSum[b.cls] += (tick - b.birth) * dt
              lifeN[b.cls]++
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
          if (tick % ALIVE_EVERY === 0) for (const b of bodies) alive[b.cls] += ALIVE_EVERY
          if (tick % SAMPLE === 0) {
            const count = zero()
            const far = zero()
            for (const b of bodies) {
              count[b.cls]++
              far[b.cls] += b.farthest
            }
            const tails = bodies.filter((b) => b.tail).length
            const omni = bodies.filter((b) => b.omni).length
            const list = shares.get(tick) ?? []
            list.push(count.limb / Math.max(1, bodies.length))
            shares.set(tick, list)
            if (tick === TICKS) finals.push(`${seed}:${count.limb}/${bodies.length}`)
            const omniLimb = bodies.filter((b) => b.omni && b.cls === 'limb').length
            const depth = bodies.reduce((a, b) => a + b.depth, 0) / Math.max(1, bodies.length)
            series.push(
              `${tick / 1000}k n=${bodies.length} body/limb/none=${count.body}/${count.limb}/${count.none} tail=${tails} omni=${omni} (${omniLimb} on limbs) farthest mouth r: body ${f2(far.body / Math.max(1, count.body))} limb ${f2(far.limb / Math.max(1, count.limb))} depth ${f2(depth)}`
            )
          }
        }
      }
      const rate = (k: Class): string => (alive[k] > 0 ? f1((1000 * matings[k]) / alive[k]) : '-')
      const life = (k: Class): string => (lifeN[k] > 0 ? f1(lifeSum[k] / lifeN[k]) : '-')
      const eat = (k: Class): string => {
        const total = EATS.reduce((a, e) => a + intake[k][e], 0)
        return total > 0
          ? `${Math.round(total)} (${EATS.map((e) => `${e}${Math.round((100 * intake[k][e]) / total)}%`).join('/')})`
          : '-'
      }
      lines.push(
        `${NAME} seed=${seed} ticks=${TICKS} extinct=${world.isExtinct}`,
        ...(QUIET ? [] : series.map((s) => `  ${s}`)),
        `  matings per 1000 creature-ticks: body=${rate('body')} limb=${rate('limb')}`,
        `  mean lifespan s: body=${life('body')} limb=${life('limb')}`,
        `  total intake: body=${eat('body')} limb=${eat('limb')}`
      )
    }
    const checkpoints = [...shares.keys()].sort((a, b) => a - b)
    lines.push(
      `${NAME} limb-mouth share of the living, mean over ${SEEDS.length} seeds: ` +
        checkpoints
          .map((t) => {
            const v = shares.get(t) ?? []
            return `${t / 1000}k ${Math.round((100 * v.reduce((a, b) => a + b, 0)) / Math.max(1, v.length))}%`
          })
          .join(' ') +
        `  | at the end per seed (limb/living): ${finals.join(' ')}`
    )
    const dir = join(tmpdir(), 'evo-probe')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, `mouth-limb-${NAME}.txt`), lines.join('\n') + '\n')
    console.log(lines.join('\n'))
  }, 7_200_000)
})

/** The config, plus (with `LIMB_TAILER`) a founder group that is the grazer with its mouth on a tail's tip. */
function withTailer(extra: Record<string, unknown>): Record<string, unknown> {
  if (TAILER <= 0) return extra
  const anatomy = resolveWorldConfig({}).anatomy
  const grazer = anatomy.starters.find((st) => st.name === 'grazer')
  if (grazer === undefined) throw new Error('no grazer starter')
  const tailer = {
    ...grazer,
    name: 'tailer',
    description: 'The grazer with its mouth hung on the tip of a flagellum.',
    pool: false,
    // The mouth (slot 5) hangs from the first flagellum (slot 0, so parent 1), at its tip.
    parts: grazer.parts.map((p) =>
      p.type === 'mouth' ? { ...p, parent: 1, offset: 1, orientation: 0 } : { ...p }
    )
  }
  const given = (extra['anatomy'] ?? {}) as Record<string, unknown>
  return {
    ...extra,
    anatomy: {
      ...given,
      starters: [...anatomy.starters, tailer],
      startingBody: {
        groups: [
          { archetype: 'hunter', share: 0.1 },
          { archetype: 'tailer', share: TAILER }
        ]
      }
    }
  }
}
