import { describe, expect, it } from 'vitest'
import type { RenderSnapshot, SpeedSetting, ViewState } from '@evo/contracts'
import { World } from '@evo/simulation'
import { SimulationHost } from '../src/host/SimulationHost'
import type { ViewportHandle } from '../src/host/SimulationHost'
import { FakeEnv } from './support/fakeEnv'

const SEED = 11

function host(options: Partial<ConstructorParameters<typeof SimulationHost>[0]> = {}) {
  const env = new FakeEnv()
  const instance = new SimulationHost({ env, seed: SEED, speed: 25, ...options })
  return { env, host: instance }
}

/** The state hash of a plain engine run, with no host involved. */
function reference(ticks: number, preset = {}): string {
  const world = World.create({ seed: SEED, config: preset })
  world.run(ticks)
  return world.stateHash()
}

describe('SimulationHost: running', () => {
  it('starts running and publishes a view of tick 0', () => {
    const { host: h } = host()
    const view = h.getViewState()
    expect(view.status).toBe('running')
    expect(view.seed).toBe(SEED)
    expect(view.preset).toBe('balanced')
    expect(view.tick).toBe(0)
    expect(view.population).toBeGreaterThan(0)
    expect(h.getFrame().organisms.length).toBe(view.population)
    expect(h.getWorldInfo().terrain).not.toBeNull()
  })

  it('tells the interface the size of a bigger world, so the camera can fit all of it (ADR 0021)', () => {
    const presets = [
      {
        name: 'big',
        label: 'Big',
        description: 'A bigger field.',
        overrides: { environment: { width: 900, height: 900 } }
      },
      { name: 'balanced', label: 'Balanced', description: 'The default world.', overrides: {} }
    ]
    const { host: big } = host({ presets, preset: 'big' })
    expect(big.getWorldInfo().width).toBe(900)
    expect(big.getWorldInfo().height).toBe(900)
    expect(big.getWorldInfo().terrain?.gridSize).toBe(45)
    // negative: the default world is 700 with its own lookup grid, and classic keeps the 500 field
    const { host: plain } = host({ presets, preset: 'balanced' })
    expect(plain.getWorldInfo().width).toBe(700)
    expect(plain.getWorldInfo().terrain?.gridSize).toBe(35)
    const { host: classic } = host()
    classic.setPreset('classic')
    expect(classic.getWorldInfo().width).toBe(500)
    expect(classic.getWorldInfo().terrain).toBeNull() // no regions in classic
  })

  it('hands the interface the static obstacle field once, empty unless the world has obstacles (ADR 0022)', () => {
    const presets = [
      { name: 'balanced', label: 'Balanced', description: 'The default world.', overrides: {} },
      {
        name: 'open',
        label: 'Open',
        description: 'No obstacles.',
        overrides: { ecology: { obstacles: { enabled: false } } }
      }
    ]
    const { host: rocky } = host({ presets, preset: 'balanced' })
    const circles = rocky.getWorldInfo().obstacles
    expect(circles.length).toBeGreaterThan(0)
    expect(circles).toEqual(World.create({ seed: SEED }).obstacles())
    // negative: a world without them has none, and a new world replaces the field
    const { host: plain } = host({ presets, preset: 'open' })
    expect(plain.getWorldInfo().obstacles).toEqual([])
    plain.setPreset('balanced')
    expect(plain.getWorldInfo().obstacles.length).toBeGreaterThan(0)
  })

  it('advances at the requested speed and reports what it achieved', () => {
    const { env, host: h } = host({ speed: 5 }) // 50 ticks per second
    env.runUntil(() => env.time > 3100)
    const view = h.getViewState()
    expect(view.tick).toBeGreaterThan(130)
    expect(view.tick).toBeLessThan(170)
    expect(view.achievedTicksPerSecond).toBeGreaterThan(40)
    expect(view.achievedTicksPerSecond).toBeLessThan(60)
  })

  it('pauses and resumes without losing or inventing ticks', () => {
    const { env, host: h } = host()
    env.runUntil(() => h.getViewState().tick >= 100)
    h.pause()
    const paused = h.getViewState().tick
    expect(h.getViewState().status).toBe('paused')
    expect(h.getViewState().achievedTicksPerSecond).toBe(0)
    env.frame(1000)
    env.frame(1000)
    expect(h.getViewState().tick).toBe(paused)
    h.start()
    env.runUntil(() => h.getViewState().tick >= paused + 100)
    expect(h.getViewState().tick).toBeGreaterThanOrEqual(paused + 100)
    expect(h.stateHash()).toBe(reference(h.getViewState().tick))
  })

  it('steps exactly the requested number of ticks while paused', () => {
    const { host: h } = host()
    h.pause()
    h.step()
    expect(h.getViewState().tick).toBe(1)
    h.step(9)
    expect(h.getViewState().tick).toBe(10)
    expect(h.getViewState().status).toBe('paused')
    expect(h.stateHash()).toBe(reference(10))
  })

  it('refuses to freeze the page on an absurd step count', () => {
    const { host: h } = host()
    h.step(10_000_000)
    expect(h.getViewState().tick).toBe(2000)
  })

  it('never runs more than its time budget in one frame, even at max speed', () => {
    const { env, host: h } = host({ speed: 'max', stepBudgetMs: 10 })
    env.frame(16)
    const ticks = h.getFrame().tick
    expect(ticks).toBeGreaterThan(0)
    // 0.02 ms of fake time per now() call: a 10 ms budget allows about 500 checks.
    expect(ticks).toBeLessThan(600)
  })
})

describe('SimulationHost: determinism through the interface path', () => {
  const slicings: Array<[string, number, number, SpeedSetting]> = [
    ['small frames, 25x', 8, 0.02, 25],
    ['large frames, 100x', 90, 0.02, 100],
    ['max speed, tight budget', 16, 0.5, 'max'],
    ['max speed, generous budget', 33, 0.02, 'max']
  ]
  it.each(slicings)('%s gives the same state as a plain run', (_name, frameMs, cost, speed) => {
    const env = new FakeEnv(cost)
    const h = new SimulationHost({ env, seed: SEED, speed })
    env.runUntil(() => h.getFrame().tick >= 1500, frameMs)
    const ticks = h.getFrame().tick
    expect(ticks).toBeGreaterThanOrEqual(1500)
    expect(h.stateHash()).toBe(reference(ticks))
  })

  it('is not changed by what the interface does with the data it receives', () => {
    const { env, host: h } = host()
    env.runUntil(() => h.getViewState().tick >= 300)
    h.pause()
    const before = h.stateHash()
    const frame = h.getFrame() as unknown as { organisms: { x: number }[] }
    const view = h.getViewState() as unknown as { species: unknown[]; history: unknown[] }
    for (const organism of frame.organisms) organism.x = -1e9
    frame.organisms.length = 0
    view.species.length = 0
    view.history.length = 0
    const info = h.getWorldInfo().terrain as unknown as { cells: number[] }
    info.cells.fill(0)
    expect(h.stateHash()).toBe(before)
    h.step(5)
    expect(h.stateHash()).toBe(reference(h.getViewState().tick))
  })
})

describe('SimulationHost: the interface is not updated per tick', () => {
  it('notifies React at a low, bounded rate however many ticks run', () => {
    const { env, host: h } = host({ speed: 'max' })
    let notifications = 0
    h.subscribe(() => notifications++)
    let frames = 0
    while (h.getViewState().tick < 5000 && frames < 100_000) {
      env.frame(16)
      frames++
    }
    const ticks = h.getViewState().tick
    const seconds = (frames * 16) / 1000
    expect(ticks).toBeGreaterThanOrEqual(5000)
    // about 8 a second, plus a few forced ones; nowhere near one per tick
    expect(notifications).toBeLessThanOrEqual(Math.ceil(seconds * 8) + 6)
    expect(notifications * 20).toBeLessThan(ticks)
    // 5,000 ticks run at 5.08 s against the 5 s default since bites made worlds larger (ADR 0017).
  }, 30_000)

  it('hands React a stable object between updates', () => {
    const { host: h } = host()
    expect(h.getViewState()).toBe(h.getViewState())
  })

  it('tells the renderer about every new frame but not about unchanged ones', () => {
    const { env, host: h } = host({ speed: 1 }) // 10 ticks a second: most 16 ms frames step nothing
    const frames: RenderSnapshot[] = []
    h.onFrame((f) => frames.push(f))
    for (let i = 0; i < 60; i++) env.frame(16)
    const ticks = h.getViewState().tick
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.length).toBeLessThanOrEqual(ticks + 1)
    expect(frames.length).toBeLessThan(60)
  })

  it('keeps the population history bounded over a long run', () => {
    const { env, host: h } = host({ speed: 'max' })
    env.runUntil(() => h.getViewState().tick >= 40_000, 16, 1_000_000)
    const history = h.getViewState().history
    expect(history.length).toBeLessThan(600)
    expect(history.length).toBeGreaterThan(50)
    expect(history[0]?.tick).toBeLessThan(2000)
    // every series is one sample per point, so they line up, and the counters never go backwards
    for (let i = 1; i < history.length; i++) {
      const a = history[i - 1]!
      const b = history[i]!
      expect(b.tick).toBeGreaterThan(a.tick)
      expect(b.time).toBeGreaterThan(a.time)
      expect(b.starved).toBeGreaterThanOrEqual(a.starved)
      expect(b.aged).toBeGreaterThanOrEqual(a.aged)
      expect(b.damaged).toBeGreaterThanOrEqual(a.damaged)
    }
    for (const point of history) {
      expect(point.species).toBeGreaterThanOrEqual(0)
      expect(point.food).toBeGreaterThanOrEqual(0)
    }
  }, 120_000)

  it('records every series and starts them afresh with a new world', () => {
    const { env, host: h } = host()
    env.runUntil(() => h.getViewState().tick >= 400)
    const first = h.getViewState().history
    expect(first.length).toBeGreaterThan(2)
    expect(first.every((p) => p.count > 0 && p.species >= 1 && p.food > 0)).toBe(true)
    h.reset()
    expect(h.getViewState().history.length).toBeLessThanOrEqual(1)
    expect(h.getViewState().history.every((p) => p.tick === 0)).toBe(true)
  })
})

describe('SimulationHost: worlds', () => {
  it('reset restarts the same seed from tick 0, newWorld takes a new one', () => {
    const { env, host: h } = host()
    env.runUntil(() => h.getViewState().tick >= 200)
    const startHash = reference(0)
    h.pause()
    h.reset()
    expect(h.getViewState().tick).toBe(0)
    expect(h.getViewState().seed).toBe(SEED)
    expect(h.stateHash()).toBe(startHash)
    expect(h.getViewState().status).toBe('running')
    h.newWorld(42)
    expect(h.getViewState().seed).toBe(42)
    expect(h.getViewState().tick).toBe(0)
    env.seeds = [99]
    h.newWorld()
    expect(h.getViewState().seed).toBe(99)
  })

  it('switches preset on the same seed, and ignores unknown presets', () => {
    const { host: h } = host()
    expect(h.getWorldInfo().terrain).not.toBeNull()
    h.setPreset('classic')
    expect(h.getViewState().preset).toBe('classic')
    expect(h.getViewState().seed).toBe(SEED)
    expect(h.getWorldInfo().terrain).toBeNull()
    h.setPreset('nonsense')
    expect(h.getViewState().preset).toBe('classic')
    expect(h.getViewState().presets.map((p) => p.name)).toContain('lush')
  })

  it('tells the renderer when a new world starts', () => {
    const { host: h } = host()
    const seen: number[] = []
    h.onWorld((info) => seen.push(info.width))
    h.newWorld(5)
    h.setPreset('classic')
    // the default world is 700 wide; classic keeps the 500 field it always had (ADR 0021)
    expect(seen).toEqual([700, 500])
  })

  it('reports world changes for the address bar', () => {
    const calls: Array<[number, string]> = []
    const { host: h } = host({ onWorldChange: (seed, preset) => calls.push([seed, preset]) })
    h.newWorld(8)
    expect(calls).toEqual([
      [SEED, 'balanced'],
      [8, 'balanced']
    ])
  })

  it('stops at extinction, refuses to restart it, and recovers with a new world', () => {
    const { env, host: h } = host({
      speed: 'max',
      presets: [
        { name: 'balanced', label: 'Balanced', description: 'x', overrides: {} },
        {
          name: 'barren',
          label: 'Barren',
          description: 'x',
          overrides: { resources: { initialCount: 0, spawnRate: 0 } }
        }
      ],
      preset: 'barren'
    })
    env.runUntil(() => h.getViewState().status === 'extinct', 16, 100_000)
    const view = h.getViewState()
    expect(view.status).toBe('extinct')
    expect(view.extinctionTick).not.toBeNull()
    expect(env.pendingFrames).toBe(0)
    h.start()
    expect(h.getViewState().status).toBe('extinct')
    h.setPreset('balanced')
    expect(h.getViewState().status).toBe('running')
    expect(h.getViewState().extinctionTick).toBeNull()
  })

  it('shows births and deaths as effects in the frames', () => {
    const { env, host: h } = host({ speed: 'max' })
    const kinds = new Set<string>()
    h.onFrame((frame) => frame.effects.forEach((e) => kinds.add(e.kind)))
    env.runUntil(() => h.getViewState().tick >= 8000)
    expect(kinds.has('birth')).toBe(true)
    expect(kinds.has('death')).toBe(true)
    // Bites double the population (ADR 0017), so 8,000 ticks take about three times as long.
  }, 30_000)
})

describe('SimulationHost: selection and the inspector', () => {
  function selected() {
    const { env, host: h } = host()
    env.runUntil(() => h.getViewState().tick >= 400)
    h.pause()
    const id = h.getFrame().organisms[0]?.id as number
    h.select(id)
    return { env, h, id }
  }

  it('selects an organism, marks it in the frame and fills the inspector', () => {
    const { h, id } = selected()
    const view = h.getViewState()
    expect(view.selectedId).toBe(id)
    expect(h.getFrame().selectedEntityId).toBe(id)
    expect(h.getFrame().organisms.find((o) => o.id === id)?.selected).toBe(true)
    const inspector = view.selected
    expect(inspector?.id).toBe(id)
    expect(inspector?.overview.maxEnergy).toBeGreaterThan(0)
    expect(inspector?.genome.some((g) => g.group === 'physical' && g.name === 'radius')).toBe(true)
    expect(inspector?.brain?.inputs).toHaveLength(48)
    expect(inspector?.brain?.outputs).toHaveLength(5)
    expect(inspector?.environment.regionType).not.toBeNull()
    expect(inspector?.lineage.speciesAncestry).toBeInstanceOf(Array)
  })

  it('deselects, and deselects when the organism dies', () => {
    const { env, h, id } = selected()
    h.select(null)
    expect(h.getViewState().selected).toBeNull()
    expect(h.getFrame().selectedEntityId).toBeNull()
    h.select(id)
    h.start()
    env.runUntil(() => h.getViewState().selectedId === null, 16, 200_000)
    expect(h.getViewState().selectedId).toBeNull()
    expect(h.getViewState().selected).toBeNull()
  })

  it('does nothing observable to the engine', () => {
    const { h } = selected()
    const before = h.stateHash()
    h.select(null)
    h.select(h.getFrame().organisms[1]?.id as number)
    h.setLayer('trails', true)
    h.setSpeed(100)
    expect(h.stateHash()).toBe(before)
  })
})

describe('SimulationHost: controls and the viewport', () => {
  it('toggles layers and speed in the view state', () => {
    const { host: h } = host()
    let notified = 0
    h.subscribe(() => notified++)
    h.setLayer('trails', true)
    expect(h.getViewState().layers.trails).toBe(true)
    const after = notified
    h.setLayer('trails', true)
    expect(notified).toBe(after)
    h.setSpeed('max')
    expect(h.getViewState().speed).toBe('max')
  })

  it('sends camera commands to the attached viewport only when they make sense', () => {
    const calls: string[] = []
    const viewport: ViewportHandle = {
      focusSelected: () => calls.push('focus'),
      setFollow: (follow) => calls.push(`follow:${follow}`),
      fitWorld: () => calls.push('fit')
    }
    const { env, host: h } = host()
    h.attachViewport(viewport)
    env.runUntil(() => h.getViewState().tick >= 50)
    h.focusSelected()
    h.toggleFollow()
    expect(calls).toEqual([])
    h.fitWorld()
    h.select(h.getFrame().organisms[0]?.id as number)
    h.focusSelected()
    h.toggleFollow()
    expect(h.getViewState().following).toBe(true)
    h.notifyFollowStopped()
    expect(h.getViewState().following).toBe(false)
    expect(calls).toEqual(['fit', 'focus', 'follow:true'])
  })

  it('works when its controls are used as detached callbacks, as the interface does', () => {
    const { env, host: h } = host()
    const { toggle, step, reset, setSpeed, newWorld, select, setLayer, fitWorld } = h
    env.runUntil(() => h.getViewState().tick >= 30)
    toggle()
    expect(h.getViewState().status).toBe('paused')
    const before = h.getViewState().tick
    step()
    expect(h.getViewState().tick).toBe(before + 1)
    setSpeed(100)
    setLayer('grid', false)
    expect(h.getViewState().speed).toBe(100)
    expect(h.getViewState().layers.grid).toBe(false)
    select(h.getFrame().organisms[0]?.id ?? null)
    expect(h.getViewState().selectedId).not.toBeNull()
    fitWorld()
    reset()
    expect(h.getViewState().tick).toBe(0)
    newWorld(9)
    expect(h.getViewState().seed).toBe(9)
    toggle()
    expect(h.getViewState().status).toBe('paused')
  })

  it('stops its loop when disposed', () => {
    const { env, host: h } = host()
    h.dispose()
    expect(env.pendingFrames).toBe(0)
    const before = h.getViewState().tick
    env.frame(1000)
    expect(h.getViewState().tick).toBe(before)
  })

  it('exposes the view type the interface consumes', () => {
    const { host: h } = host()
    const view: ViewState = h.getViewState()
    expect(view.layers.organisms).toBe(true)
  })
})
