import { describe, expect, it } from 'vitest'
import { DEFAULT_RENDER_LAYERS, MAX_SEED } from '@evo/contracts'
import { World } from '@evo/simulation'
import { DEFAULT_PREFS, loadPrefs, savePrefs } from '../src/host/prefs'
import type { KeyValueStore } from '../src/host/prefs'
import { SETTINGS, settingByPath } from '@evo/config'
import { formatHash, parseHash, randomSeedFrom } from '../src/host/url'
import {
  buildInspector,
  buildSpeciesRows,
  historyPointOf,
  lineageCounts
} from '../src/host/viewState'

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

describe('url hash settings', () => {
  it('carries only the changed settings after seed and preset, in path order, and round-trips them', () => {
    const changes = {
      'resources.seeds.energy': 30,
      'anatomy.scavenger.enabled': true,
      'ageing.enabled': false,
      'genetics.mutationRateScale': 1.5
    }
    const hash = formatHash(9, 'lush', changes)
    expect(hash).toBe(
      '#seed=9&preset=lush&ageing.enabled=0&anatomy.scavenger.enabled=1&genetics.mutationRateScale=1.5&resources.seeds.energy=30'
    )
    expect(parseHash(hash)).toEqual({ seed: 9, preset: 'lush', settings: changes })
    // nothing changed: the hash is the old one, so old links and old tests are untouched
    expect(formatHash(9, 'lush', {})).toBe('#seed=9&preset=lush')
    expect(formatHash(9, 'lush')).toBe('#seed=9&preset=lush')
  })

  it('stays short and readable with ten changes', () => {
    const paths = SETTINGS.slice(0, 10).map((s) => s.path)
    const changes: Record<string, number | boolean> = {}
    for (const path of paths) {
      const setting = settingByPath(path)!
      changes[path] = setting.kind === 'boolean' ? true : (setting.max as number)
    }
    expect(formatHash(123456789, 'balanced', changes).length).toBeLessThan(420)
  })

  it('ignores and counts what is not an editable setting or does not fit (negatives)', () => {
    const state = parseHash(
      '#seed=3&preset=lush' +
        '&environment.width=5' + // a real configuration leaf, but not one the editor offers
        '&__proto__.polluted=1' +
        '&resources.seeds.energy=9999' + // out of range
        '&resources.seeds.energy=abc' + // not a number
        '&organisms.initialCount=20.5' + // not whole
        '&ageing.enabled=maybe' + // not a switch
        '&resources.spawnRate=0.5' // fine
    )
    expect(state.settings).toEqual({ 'resources.spawnRate': 0.5 })
    expect(state.ignored).toBe(6)
    expect(state.seed).toBe(3)
    // nothing leaked onto Object
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  it('takes the first of a repeated setting and counts the rest', () => {
    const state = parseHash('#resources.spawnRate=0.5&resources.spawnRate=1')
    expect(state.settings).toEqual({ 'resources.spawnRate': 0.5 })
    expect(state.ignored).toBe(1)
  })

  it('leaves a path the editor does not offer out of a written hash (negative)', () => {
    expect(formatHash(1, 'balanced', { 'environment.width': 5, 'ageing.enabled': false })).toBe(
      '#seed=1&preset=balanced&ageing.enabled=0'
    )
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

// Tests about "the founder's body" start with it, not a drawn starting body (ADR 0020).
const FOUNDER_PLAN = { anatomy: { startingBody: { mode: 'reference' as const } } }

describe('buildAnatomy', () => {
  it('describes the body of a living organism and nothing for one that is gone', async () => {
    const { World } = await import('@evo/simulation')
    const { buildAnatomy } = await import('../src/host/viewState')
    const world = World.create({ seed: 5, config: FOUNDER_PLAN })
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
    const world = World.create({ seed: 5, config: FOUNDER_PLAN })
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

  it('gives a working eye its sight and every other part none, matching what the renderer draws', async () => {
    const { World } = await import('@evo/simulation')
    const { buildAnatomy } = await import('../src/host/viewState')
    const world = World.create({ seed: 5 })
    const first = world.snapshot().organisms[0]!
    const anatomy = buildAnatomy(world, first.id)!
    const drawn = first.parts // what the renderer draws
    let eyes = 0
    for (const part of anatomy.parts) {
      const same = drawn.find((d) => d.slot === part.slot)!
      expect(part.sight).toEqual(same.sight)
      if (part.type !== 'eye') expect(part.sight).toBeNull()
      else if (part.functional) {
        eyes++
        expect(part.sight!.reach).toBeGreaterThan(0)
        expect(part.sight!.half).toBeGreaterThan(0)
        expect(part.sight!.half).toBeLessThanOrEqual(Math.PI)
      }
    }
    expect(eyes).toBeGreaterThan(0) // the founder has an eye, or this test proves nothing
  })
})

describe('historyPointOf', () => {
  it('samples population, distinct living species, food and the cumulative deaths together', () => {
    const world = World.create({ seed: 5 })
    world.run(300)
    const snapshot = world.snapshot()
    const point = historyPointOf(snapshot)
    expect(point.tick).toBe(snapshot.tick)
    expect(point.time).toBe(snapshot.time)
    expect(point.count).toBe(snapshot.population.active)
    expect(point.food).toBe(snapshot.resources.length)
    expect(point.starved).toBe(snapshot.metrics.deathsByStarvation)
    expect(point.aged).toBe(snapshot.metrics.deathsByAge)
    expect(point.damaged).toBe(snapshot.metrics.deathsByDamage)
    // one species per distinct id among the living, and it agrees with the registry
    const ids = new Set(snapshot.organisms.map((o) => o.speciesId))
    expect(point.species).toBe(ids.size)
    expect(point.species).toBe(world.species.active().filter((sp) => sp.memberCount > 0).length)
    // negative: a world with nobody alive has no species
    const empty = World.create({ seed: 5, config: { organisms: { initialCount: 0 } } })
    expect(historyPointOf(empty.snapshot()).species).toBe(0)
  })
})
