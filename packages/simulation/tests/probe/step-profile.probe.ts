import { describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { presetByName } from '@evo/config'
import { World } from '../../src/index'

/**
 * Where a world's tick goes: wraps each system of `World.step` in a timer and reports milliseconds
 * per tick and the share of the tick, in the default field world (about 100 creatures) and in the
 * cluster world (about 600). A measurement, not a test (see vitest.probe.config.ts); the report is
 * written to `<tmpdir>/evo-probe/step-profile.txt`. It reaches into the world's private systems on
 * purpose, so it is the one place that knows their field names.
 */
/** A system, seen only as far as its methods. */
type Methods = Record<string, (...args: unknown[]) => unknown>
const report: string[] = []

function profile(label: string, world: World, warm: number, ticks: number): void {
  world.run(warm)
  const w = world as unknown as Record<string, Methods>
  const system = (name: string): Methods => w[name] as Methods
  const totals: Record<string, number> = {}
  const wrap = (obj: Methods, method: string, name: string): void => {
    const orig = (obj[method] as (...args: unknown[]) => unknown).bind(obj)
    totals[name] = 0
    obj[method] = (...a: unknown[]) => {
      const t = performance.now()
      const r = orig(...a)
      totals[name] = (totals[name] ?? 0) + (performance.now() - t)
      return r
    }
  }
  for (const n of [
    'environmentSystem',
    'perceptionSystem',
    'movementSystem',
    'migrationSystem',
    'interactionSystem',
    'digestionSystem',
    'healthSystem',
    'metabolismSystem',
    'reproductionSystem',
    'deathSystem'
  ])
    wrap(system(n), 'update', n)
  wrap(system('brainSystem'), 'decide', 'brain.decide')
  wrap(system('brainSystem'), 'settle', 'brain.settle')
  wrap(system('decisionSystem'), 'update', 'decision')
  wrap(system('resourceIndex'), 'rebuild', 'resourceIndex')
  wrap(system('organismIndex'), 'rebuild', 'organismIndex')
  wrap(system('metricsCollector'), 'recordEvents', 'metrics.events')
  wrap(system('metricsCollector'), 'updatePopulation', 'metrics.pop')
  wrap(system('speciesRegistry'), 'observe', 'species.observe')
  const t0 = performance.now()
  world.run(ticks)
  const total = performance.now() - t0
  const sum = Object.values(totals).reduce((a, b) => a + b, 0)
  const lines = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([k, v]) =>
        `  ${k.padEnd(18)} ${(v / ticks).toFixed(3)} ms/tick  ${((v / total) * 100).toFixed(1)}%`
    )
  report.push(
    `${label}: pop ${world.snapshot().organisms.length}, ${(total / ticks).toFixed(3)} ms/tick (${(
      (ticks * 1000) /
      total
    ).toFixed(
      0
    )} ticks/s), unaccounted ${(((total - sum) / total) * 100).toFixed(1)}%\n${lines.join('\n')}\n`
  )
}

describe('step profile', () => {
  it('field world (~55 creatures)', () => {
    const p = presetByName('balanced')!
    profile('balanced', World.create({ seed: 3, config: p.overrides as never }), 2000, 3000)
  })
  it('cluster world (~1000 creatures)', () => {
    const p = presetByName('balanced')!
    const cfg = { ...(p.overrides as object), environment: { layout: 'clusters' } }
    profile('clusters', World.create({ seed: 3, config: cfg as never }), 1500, 600)
    const dir = join(tmpdir(), 'evo-probe')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'step-profile.txt'), report.join('\n'))
  })
})
