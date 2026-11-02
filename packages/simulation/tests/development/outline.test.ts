import { describe, expect, it } from 'vitest'
import {
  OUTLINE_COUNT_INDEX,
  OUTLINE_MAX_POINTS,
  outlineAngleIndex,
  outlineRadiusIndex
} from '@evo/contracts'
import { DEFAULT_ANATOMY, resolveWorldConfig } from '@evo/config'
import { founderBodyVector } from '../../src/genetics/BodyGenes'
import {
  developOutline,
  founderOutlineOf,
  outlineDragOf,
  outlineOf,
  outlineScaleOf
} from '../../src/development/outline'
import { bodyRadiusOf, outlineDragFactor, sizeFactor } from '../../src/organisms/traits'
import { World } from '../../src/world/World'

const founder = () => founderBodyVector(DEFAULT_ANATOMY)
const withGenes = (edit: (g: number[]) => void): number[] => {
  const genes = founder()
  edit(genes)
  return genes
}

describe('developOutline', () => {
  it('builds `count` points around the centre, in counter-clockwise order', () => {
    for (const count of [5, 8, 12, 16]) {
      const outline = developOutline(withGenes((g) => (g[OUTLINE_COUNT_INDEX] = count)))
      expect(outline.points).toHaveLength(count)
      let previous = -Infinity
      for (const p of outline.points) {
        const angle = (Math.atan2(p.y, p.x) + 2 * Math.PI) % (2 * Math.PI)
        expect(angle).toBeGreaterThan(previous)
        previous = angle
      }
    }
  })

  it('is always a simple polygon: positive area whatever the radius and angle genes', () => {
    let seed = 1
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    for (let trial = 0; trial < 200; trial++) {
      const genes = withGenes((g) => {
        g[OUTLINE_COUNT_INDEX] = 5 + Math.floor(next() * 12)
        for (let i = 0; i < OUTLINE_MAX_POINTS; i++) {
          g[outlineRadiusIndex(i)] = 0.35 + next() * 0.65
          g[outlineAngleIndex(i)] = next()
        }
      })
      const outline = developOutline(genes)
      expect(outline.area).toBeGreaterThan(0)
      expect(Number.isFinite(outline.roughness)).toBe(true)
      expect(outline.roughness).toBeGreaterThanOrEqual(1 - 1e-9)
    }
  })

  it('ignores the genes of points beyond the count', () => {
    const a = developOutline(withGenes((g) => (g[OUTLINE_COUNT_INDEX] = 6)))
    const b = developOutline(
      withGenes((g) => {
        g[OUTLINE_COUNT_INDEX] = 6
        g[outlineRadiusIndex(10)] = 1
        g[outlineAngleIndex(10)] = 0.9
      })
    )
    expect(b).toEqual(a)
  })

  it('makes a spiky body rougher than a round one, and a bigger body bigger', () => {
    const round = developOutline(founder())
    const spiky = developOutline(
      withGenes((g) => {
        for (let i = 0; i < 8; i++) g[outlineRadiusIndex(i)] = i % 2 === 0 ? 1 : 0.35
      })
    )
    expect(spiky.roughness).toBeGreaterThan(round.roughness)
    const big = developOutline(
      withGenes((g) => {
        for (let i = 0; i < 8; i++) g[outlineRadiusIndex(i)] = 1
      })
    )
    expect(big.areaRadius).toBeGreaterThan(round.areaRadius)
  })

  it('is pure and never modifies its input', () => {
    const genes = founder()
    const copy = [...genes]
    expect(developOutline(genes)).toEqual(developOutline(genes))
    expect(genes).toEqual(copy)
    expect(outlineOf(genes)).toBe(outlineOf(genes))
  })
})

describe('outline physics factors', () => {
  it('are exactly 1 for the founder outline (so anatomy off cannot change anything)', () => {
    expect(outlineScaleOf(founder(), DEFAULT_ANATOMY)).toBe(1)
    expect(outlineDragOf(founder(), DEFAULT_ANATOMY)).toBe(1)
    expect(founderOutlineOf(DEFAULT_ANATOMY).points).toHaveLength(8)
  })

  it('make a bigger body larger and costlier, and a spiky one drag', () => {
    const world = World.create({ seed: 1 })
    const genome = world.genomeOf(world.snapshot().organisms[0]?.id as number)
    if (!genome) throw new Error('expected a genome')
    const config = world.config
    const big = {
      ...genome,
      body: {
        genes: withGenes((g) => {
          for (let i = 0; i < 8; i++) g[outlineRadiusIndex(i)] = 1
        })
      }
    }
    expect(bodyRadiusOf(big, config)).toBeGreaterThan(bodyRadiusOf(genome, config))
    expect(sizeFactor(big, config)).toBeGreaterThan(sizeFactor(genome, config))
    const spiky = {
      ...genome,
      body: {
        genes: withGenes((g) => {
          for (let i = 0; i < 8; i++) g[outlineRadiusIndex(i)] = i % 2 === 0 ? 0.9 : 0.35
        })
      }
    }
    expect(outlineDragFactor(spiky, config)).toBeGreaterThan(1)
    expect(outlineDragFactor(genome, config)).toBe(1)
  })

  it('can be switched off: outlineDrag 0 gives no drag at any roughness', () => {
    const config = resolveWorldConfig({ anatomy: { outlineDrag: 0 } })
    const spiky = withGenes((g) => {
      for (let i = 0; i < 8; i++) g[outlineRadiusIndex(i)] = i % 2 === 0 ? 1 : 0.35
    })
    expect(outlineDragOf(spiky, config.anatomy)).toBe(1)
  })
})

describe('the drawn outline in a snapshot', () => {
  it('has a point pair per outline point, scaled so its area radius is the body radius', () => {
    const world = World.create({
      seed: 3,
      config: { anatomy: { enabled: true, mutation: { outlineRate: 0.6 } } }
    })
    world.run(2000)
    const organisms = world.snapshot().organisms
    expect(organisms.length).toBeGreaterThan(0)
    const counts = new Set<number>()
    for (const o of organisms) {
      expect(o.outline.length % 2).toBe(0)
      counts.add(o.outline.length / 2)
      let twiceArea = 0
      const n = o.outline.length / 2
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        twiceArea +=
          (o.outline[2 * i] as number) * (o.outline[2 * j + 1] as number) -
          (o.outline[2 * j] as number) * (o.outline[2 * i + 1] as number)
      }
      expect(Math.sqrt(twiceArea / 2 / Math.PI)).toBeCloseTo(o.radius, 9)
      expect(o.pattern).toBeGreaterThanOrEqual(0)
      expect(o.accentHue).toBeGreaterThanOrEqual(0)
    }
    expect(counts.size).toBeGreaterThan(1)
  })
})
