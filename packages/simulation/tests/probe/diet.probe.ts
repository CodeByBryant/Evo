import { describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mouthFormOf } from '@evo/contracts'
import type { WorldConfigOverrides } from '@evo/contracts'
import { World } from '../../src/index'

/**
 * Who eats what (ADR 0026): the energy taken in, credited to the eater's mouth form and to the kind
 * it came from (a plant kind, carrion, or flesh), over seeds, plus how long each form was alive. The
 * measurement that showed jaws getting 5 percent of the carrion. A measurement, not a test.
 *
 * Environment: `DIET_NAME` (label), `DIET_CONFIG` (JSON overrides), `DIET_SEEDS` (default 1..4),
 * `DIET_TICKS` (default 20000). Writes `<tmpdir>/evo-probe/diet-<name>.txt`.
 */
const NAME = process.env.DIET_NAME ?? 'default'
const CONFIG = JSON.parse(process.env.DIET_CONFIG ?? '{}') as WorldConfigOverrides
const SEEDS = (process.env.DIET_SEEDS ?? '1,2,3,4').split(',').map(Number)
const TICKS = Number(process.env.DIET_TICKS ?? 20000)
describe('diet', () => {
  it('measures', () => {
    const table = new Map<string, number>() // form|kind -> intake
    const creatureTicks = new Map<string, number>()
    const fleshByForm = new Map<string, number>()
    for (const seed of SEEDS) {
      const world = World.create({ seed, config: CONFIG })
      const kinds = world.config.ecology.resourceKinds.kinds.map((k) => k.name)
      const formOf = new Map<number, string>()
      const form = (id: number): string => {
        let f = formOf.get(id)
        if (f === undefined) {
          const mouth = (world.anatomyOf(id)?.anatomy.parts ?? []).find(
            (p) => p.type === 'mouth' && p.functional
          )
          f = mouth ? mouthFormOf(mouth.stats[2] as number) : 'none'
          formOf.set(id, f)
        }
        return f
      }
      for (let t = 1; t <= TICKS; t++) {
        world.step()
        for (const e of world.events.eventsThisTick()) {
          if (e.type === 'resource-bitten') {
            const key = `${form(e.organismId)}|${kinds[e.kind]}`
            table.set(key, (table.get(key) ?? 0) + e.intake)
          } else if (e.type === 'organism-bitten') {
            const f = form(e.predatorId)
            fleshByForm.set(f, (fleshByForm.get(f) ?? 0) + e.intake)
          }
        }
        if (t % 50 === 0) {
          for (const o of world.snapshot().organisms) {
            const f = form(o.id)
            creatureTicks.set(f, (creatureTicks.get(f) ?? 0) + 50)
          }
        }
      }
    }
    const lines: string[] = []
    const forms = ['sprout', 'proboscis', 'mandible', 'radula', 'jaw', 'none']
    const kindsAll = ['grass', 'fruit', 'fungus', 'nectar', 'carrion']
    let carrionTotal = 0
    for (const f of forms) carrionTotal += table.get(`${f}|carrion`) ?? 0
    lines.push(
      `seeds ${SEEDS.length} ticks ${TICKS}; creature-ticks per form: ` +
        forms.map((f) => `${f} ${creatureTicks.get(f) ?? 0}`).join(', ')
    )
    for (const f of forms) {
      const row = kindsAll.map((k) => `${k} ${(table.get(`${f}|${k}`) ?? 0).toFixed(0)}`).join('  ')
      lines.push(`${f.padEnd(10)} ${row}  flesh ${(fleshByForm.get(f) ?? 0).toFixed(0)}`)
    }
    lines.push(
      `carrion intake total ${carrionTotal.toFixed(0)}; share by form: ` +
        forms
          .map(
            (f) =>
              `${f} ${carrionTotal === 0 ? 0 : (((table.get(`${f}|carrion`) ?? 0) / carrionTotal) * 100).toFixed(0)}%`
          )
          .join(', ')
    )
    const dir = join(tmpdir(), 'evo-probe')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `diet-${NAME}.txt`), lines.join('\n') + '\n')
  }, 1800000)
})
