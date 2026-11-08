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
  outlineScaleOf,
  rimAt
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

describe('the drawn parts in a snapshot', () => {
  it('gives every founder its seven parts, working, on the same scale as the outline', () => {
    const world = World.create({ seed: 2 })
    for (const o of world.snapshot().organisms) {
      expect(o.parts).toHaveLength(7)
      expect(o.parts.every((p) => p.functional)).toBe(true)
      const reach = Math.max(...o.parts.map((p) => Math.hypot(p.x, p.y)))
      expect(reach).toBeLessThanOrEqual(o.radius * 1.6) // inside the body's own scale
      expect(o.parts.every((p) => p.radius > 0)).toBe(true)
    }
  })

  it('shares one array between snapshots of the same organism, so frames do not allocate', () => {
    const world = World.create({ seed: 2 })
    const first = world.snapshot().organisms[0]
    world.run(5)
    const again = world.snapshot().organisms.find((o) => o.id === first?.id)
    if (again !== undefined) expect(again.parts).toBe(first?.parts)
  })
})

describe('rimAt', () => {
  it('finds where a ray from the centre leaves the outline: on an edge, along the ray', () => {
    const outline = developOutline(founder())
    const points = outline.points
    for (let k = 0; k < 72; k++) {
      const angle = (k / 72) * 2 * Math.PI
      const rim = rimAt(outline, angle)
      // on the ray from the origin
      expect(rim.x * Math.sin(angle) - rim.y * Math.cos(angle)).toBeCloseTo(0, 9)
      expect(rim.x * Math.cos(angle) + rim.y * Math.sin(angle)).toBeGreaterThan(0)
      // on some edge of the polygon
      let onEdge = false
      for (let i = 0; i < points.length; i++) {
        const a = points[i] as { x: number; y: number }
        const b = points[(i + 1) % points.length] as { x: number; y: number }
        const cross = (b.x - a.x) * (rim.y - a.y) - (b.y - a.y) * (rim.x - a.x)
        const dot = (rim.x - a.x) * (b.x - a.x) + (rim.y - a.y) * (b.y - a.y)
        const length2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
        if (Math.abs(cross) < 1e-9 && dot >= -1e-9 && dot <= length2 + 1e-9) onEdge = true
      }
      expect(onEdge).toBe(true)
    }
  })

  it('has a unit outward normal at every angle', () => {
    const outline = developOutline(founder())
    for (let k = 0; k < 72; k++) {
      const angle = (k / 72) * 2 * Math.PI
      const rim = rimAt(outline, angle)
      expect(Math.hypot(rim.nx, rim.ny)).toBeCloseTo(1, 12)
      // outward: it points the way the ray goes, never back toward the centre
      expect(rim.nx * Math.cos(angle) + rim.ny * Math.sin(angle)).toBeGreaterThan(0)
    }
  })

  it('is the circle for a round outline, at the radius of its points', () => {
    const genes = withGenes((g) => {
      g[OUTLINE_COUNT_INDEX] = 16
      for (let i = 0; i < OUTLINE_MAX_POINTS; i++) {
        g[outlineRadiusIndex(i)] = 0.8
        g[outlineAngleIndex(i)] = 0.5
      }
    })
    const outline = developOutline(genes)
    for (let k = 0; k < 40; k++) {
      const rim = rimAt(outline, (k / 40) * 2 * Math.PI)
      const radius = Math.hypot(rim.x, rim.y)
      // a regular 16-gon of circumradius 0.8: between the inradius and the circumradius
      expect(radius).toBeGreaterThan(0.8 * Math.cos(Math.PI / 16) - 1e-9)
      expect(radius).toBeLessThan(0.8 + 1e-9)
    }
  })

  it('follows an irregular outline: a long spike reaches further in its own direction', () => {
    const genes = withGenes((g) => {
      g[OUTLINE_COUNT_INDEX] = 8
      for (let i = 0; i < OUTLINE_MAX_POINTS; i++) g[outlineRadiusIndex(i)] = 0.4
      g[outlineRadiusIndex(0)] = 1
    })
    const outline = developOutline(genes)
    const front = rimAt(outline, 0)
    const back = rimAt(outline, Math.PI)
    expect(Math.hypot(front.x, front.y)).toBeGreaterThan(Math.hypot(back.x, back.y) + 0.1)
  })

  it('is deterministic and survives a degenerate outline', () => {
    const outline = developOutline(founder())
    expect(rimAt(outline, 1.234)).toEqual(rimAt(outline, 1.234))
    const empty = { ...outline, points: [] }
    const fallback = rimAt(empty, 0.5)
    expect(Number.isFinite(fallback.x) && Number.isFinite(fallback.nx)).toBe(true)
  })
})
