import { describe, expect, it } from 'vitest'
import { DEFAULT_RENDER_LAYERS, MAX_SEED } from '@evo/contracts'
import { World } from '@evo/simulation'
import { DEFAULT_PREFS, loadPrefs, savePrefs } from '../src/host/prefs'
import type { KeyValueStore } from '../src/host/prefs'
import { formatHash, parseHash, randomSeedFrom } from '../src/host/url'
import { buildInspector, buildSpeciesRows, lineageCounts } from '../src/host/viewState'

describe('url hash', () => {
  it('round-trips a seed and preset', () => {
    expect(parseHash(formatHash(123, 'lush'))).toEqual({ seed: 123, preset: 'lush' })
    expect(parseHash('seed=7')).toEqual({ seed: 7 })
    expect(parseHash('#preset=rapid-evolution')).toEqual({ preset: 'rapid-evolution' })
  })

  it('accepts the largest seed and rejects everything malformed', () => {
    expect(parseHash(`#seed=${MAX_SEED}`)).toEqual({ seed: MAX_SEED })
    for (const bad of [
      '#seed=4294967296',
      '#seed=-1',
      '#seed=1.5',
      '#seed=abc',
      '#seed=99999999999999',
      '#seed=',
      '#preset=Lush',
      '#preset=a b',
      '#preset=../x',
      '#preset=',
      '#',
      ''
    ]) {
      expect(parseHash(bad)).toEqual({})
    }
  })

  it('maps a random 32-bit value into the seed range', () => {
    expect(randomSeedFrom(() => 0)).toBe(0)
    expect(randomSeedFrom(() => MAX_SEED)).toBe(MAX_SEED)
    expect(randomSeedFrom(() => 123456)).toBe(123456)
  })
})

describe('prefs', () => {
  const memory = (
    initial: Record<string, string> = {}
  ): KeyValueStore & { data: Record<string, string> } => {
    const data = { ...initial }
    return {
      data,
      getItem: (key) => data[key] ?? null,
      setItem: (key, value) => void (data[key] = value)
    }
  }

  it('falls back to defaults without storage, on garbage, and when storage throws', () => {
    expect(loadPrefs(undefined)).toEqual(DEFAULT_PREFS)
    expect(loadPrefs(memory({ 'evo.prefs.v1': 'not json' }))).toEqual(DEFAULT_PREFS)
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      }
    }
    expect(loadPrefs(throwing)).toEqual(DEFAULT_PREFS)
    expect(() => savePrefs(throwing, DEFAULT_PREFS)).not.toThrow()
  })

  it('saves and restores layers and speed', () => {
    const store = memory()
    const prefs = {
      layers: { ...DEFAULT_RENDER_LAYERS, trails: true, grid: false },
      speed: 100 as const,
      panels: { left: true, right: false, strip: true }
    }
    savePrefs(store, prefs)
    expect(loadPrefs(store)).toEqual(prefs)
  })

  it('keeps panels open unless stored as collapsed, and ignores anything malformed', () => {
    const open = { left: false, right: false, strip: false }
    expect(loadPrefs(memory()).panels).toEqual(open)
    // an older save with no panels field
    expect(loadPrefs(memory({ 'evo.prefs.v1': JSON.stringify({ speed: 25 }) })).panels).toEqual(
      open
    )
    const store = (panels: unknown): KeyValueStore =>
      memory({ 'evo.prefs.v1': JSON.stringify({ panels }) })
    expect(loadPrefs(store({ left: true, strip: true })).panels).toEqual({
      left: true,
      right: false,
      strip: true
    })
    // only a real true collapses a panel
    expect(loadPrefs(store({ left: 'yes', right: 1, strip: null })).panels).toEqual(open)
    expect(loadPrefs(store('collapsed')).panels).toEqual(open)
    expect(loadPrefs(store(null)).panels).toEqual(open)
  })

  it('ignores unknown layers and invalid speeds', () => {
    const store = memory({
      'evo.prefs.v1': JSON.stringify({
        layers: { trails: 'yes', bogus: true, debug: true },
        speed: 3
      })
    })
    const loaded = loadPrefs(store)
    expect(loaded.layers.trails).toBe(DEFAULT_RENDER_LAYERS.trails)
    expect(loaded.layers.debug).toBe(true)
    expect(Object.keys(loaded.layers)).not.toContain('bogus')
    expect(loaded.speed).toBe(DEFAULT_PREFS.speed)
  })
})

describe('view-state builders', () => {
  const world = World.create({ seed: 5 })
  world.run(2500)
  const snapshot = world.snapshot()

  it('lists living species largest first and counts the extinct ones', () => {
    const { rows, extinct } = buildSpeciesRows(world)
    expect(rows.length).toBeGreaterThan(0)
    for (let i = 1; i < rows.length; i++) {
      expect((rows[i - 1] as { members: number }).members).toBeGreaterThanOrEqual(
        (rows[i] as { members: number }).members
      )
    }
    expect(rows.reduce((sum, r) => sum + r.members, 0)).toBe(snapshot.population.active)
    expect(extinct).toBe(world.species.size - rows.length)
    for (const row of rows) {
      expect(row.color).toMatch(/^#[0-9a-f]{6}$/)
      expect(row.history.length).toBeLessThanOrEqual(60)
    }
  })

  it('builds the inspector for a living organism and refuses a missing one', () => {
    const target = snapshot.organisms[0]
    if (!target) throw new Error('expected a population')
    const counts = lineageCounts(world, target.genomeId)
    const view = buildInspector(world, snapshot, target.id, counts)
    expect(view?.id).toBe(target.id)
    expect(view?.lineage.parentIds).toEqual(target.parentIds)
    expect(view?.lineage.ancestorGenomes).toBe(counts.ancestors)
    const groups = new Set(view?.genome.map((g) => g.group))
    for (const g of ['physical', 'metabolic', 'behavioral', 'reproduction', 'learning']) {
      expect(groups.has(g)).toBe(true)
    }
    expect(view?.genome.every((row) => Number.isFinite(row.value))).toBe(true)
    expect(view?.brain?.reward.map((r) => r.label)).toEqual([
      'feeding',
      'reproduction',
      'energyCost',
      'damage',
      'exploration'
    ])
    expect(buildInspector(world, snapshot, 987654321, counts)).toBeNull()
  })

  it('has no brain section under the reflex controller', () => {
    const reflex = World.create({ seed: 5, config: { learning: { controller: 'reflex' } } })
    reflex.run(100)
    const snap = reflex.snapshot()
    const first = snap.organisms[0]
    if (!first) throw new Error('expected a population')
    const view = buildInspector(reflex, snap, first.id, { ancestors: 0, descendants: 0 })
    expect(view?.brain).toBeNull()
  })
})

describe('buildAnatomy', () => {
  it('describes the body of a living organism and nothing for one that is gone', async () => {
    const { World } = await import('@evo/simulation')
    const { buildAnatomy } = await import('../src/host/viewState')
    const world = World.create({ seed: 5 })
    const id = world.snapshot().organisms[0]!.id
    const anatomy = buildAnatomy(world, id)
    expect(anatomy?.parts).toHaveLength(7)
    expect(anatomy?.outline.length).toBeGreaterThanOrEqual(10)
    expect((anatomy?.outline.length ?? 1) % 2).toBe(0)
    expect(anatomy?.budget).toBe(world.config.anatomy.structuralBudget)
    const speed = anatomy?.capabilities.find((c) => c.label === 'speed')
    expect(speed?.value).toBe(1) // a founder is exactly the baseline
    expect(buildAnatomy(world, 987654321)).toBeNull()
  })

  it('gives every part its parent, tip, stats in real units, and its share of mass and upkeep', async () => {
    const { World } = await import('@evo/simulation')
    const { PART_STATS } = await import('@evo/contracts')
    const { buildAnatomy } = await import('../src/host/viewState')
    const world = World.create({ seed: 5 })
    const id = world.snapshot().organisms[0]!.id
    const anatomy = buildAnatomy(world, id)!
    const slots = new Set(anatomy.parts.map((part) => part.slot))
    for (const part of anatomy.parts) {
      // a parent is the body or another developed part
      expect(part.parent === -1 || slots.has(part.parent)).toBe(true)
      expect(part.parent).not.toBe(part.slot)
      // one stat per row of the part's table, in the table's order and unit
      expect(part.stats.map((stat) => stat.key)).toEqual(PART_STATS[part.type].map((s) => s.key))
      expect(part.stats.map((stat) => stat.unit)).toEqual(PART_STATS[part.type].map((s) => s.unit))
      for (const stat of part.stats) expect(Number.isFinite(stat.value)).toBe(true)
      expect(part.mass).toBeGreaterThan(0)
      expect(part.upkeep).toBeGreaterThanOrEqual(0)
      expect(part.integrity).toBeGreaterThan(0)
      expect(Number.isFinite(part.tipX) && Number.isFinite(part.tipY)).toBe(true)
    }
    // the parts and the bare body add up to the body's mass and upkeep, so nothing is hidden
    const cap = (label: string): number =>
      anatomy.capabilities.find((c) => c.label === label)?.value as number
    const partMass = anatomy.parts.reduce((sum, part) => sum + part.mass, 0)
    expect(cap('mass') - partMass).toBeCloseTo(world.config.anatomy.bodyMass, 9)
    const partUpkeep = anatomy.parts.reduce((sum, part) => sum + part.upkeep, 0)
    expect(cap('upkeep (energy/s)')).toBeCloseTo(partUpkeep, 12)
    // negative: dropping a part would leave the sums short
    expect(partMass - (anatomy.parts[0]?.mass ?? 0)).toBeLessThan(partMass)
  })
})
